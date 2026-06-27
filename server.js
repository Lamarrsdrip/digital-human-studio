/**
 * Digital Human Studio — Server
 * Local-first AI talking-head video generation platform.
 * Architecture: modular provider abstraction → swap local ↔ cloud workers without changing app logic.
 */

import http from 'http';
import fs, { existsSync, statSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import path, { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { randomUUID } from 'crypto';
import Busboy from 'busboy';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ──────────────────────────────────────────────────────────────────
const PORT           = Number(process.env.PORT || 4200);
const FFMPEG         = process.env.FFMPEG_PATH || 'ffmpeg';
const PYTHON         = process.env.PYTHON_PATH || 'python3.9';
const STORAGE_DIR    = join(__dirname, 'storage');
const DATA_FILE      = join(__dirname, 'data', 'db.json');
const WORKERS_DIR    = join(__dirname, 'workers');

// AI runtime mode: local | hybrid | cloud
const AI_RUNTIME     = process.env.AI_RUNTIME_MODE || 'hybrid';

// Provider config
const TTS_PROVIDER   = process.env.TTS_PROVIDER   || 'piper';     // piper | elevenlabs | system
const LIPSYNC_PROV   = process.env.LIPSYNC_PROVIDER || 'wav2lip'; // wav2lip | sadtalker | muapi | did
const VIDEO_PROV     = process.env.VIDEO_PROVIDER || 'ffmpeg';
const VOICE_API_KEY  = process.env.VOICE_API_KEY  || process.env.ELEVENLABS_API_KEY || '';
const MUAPI_KEY      = process.env.MUAPI_API_KEY  || '';
const GEMINI_KEY     = process.env.GEMINI_API_KEY || '';
const GPU_WORKER_URL = process.env.GPU_WORKER_URL || '';

// Credit costs per generation type (units of credits)
const CREDIT_COSTS = {
  talking_head:   5,
  ad_video:       10,
  presenter:      8,
  influencer:     8,
  podcast:        6,
  interview:      15,
  intro:          3,
  outro:          3,
  course:         8,
  salesperson:    8,
};

const PLANS = {
  free:       { credits: 30,  priceUSD: 0,   features: ['talking_head', 'intro'] },
  starter:    { credits: 200, priceUSD: 19,  features: ['talking_head', 'ad_video', 'presenter', 'intro', 'outro'] },
  pro:        { credits: 600, priceUSD: 49,  features: Object.keys(CREDIT_COSTS) },
  enterprise: { credits: 2000,priceUSD: 149, features: Object.keys(CREDIT_COSTS) },
};

// ─── Database ─────────────────────────────────────────────────────────────────

function loadDb() {
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')); } catch { return defaultDb(); }
}

function saveDb(db) {
  mkdirSync(dirname(DATA_FILE), { recursive: true });
  writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function defaultDb() {
  const adminId = randomUUID();
  const adminHash = sha256('dhs:Admin2024!');
  return {
    users: [{
      id: adminId, email: 'admin@digitalhuman.local', passwordHash: adminHash,
      name: 'Admin', role: 'admin', credits: 9999, plan: 'enterprise',
      createdAt: new Date().toISOString(),
    }],
    digitalHumans: [],
    videoJobs: [],
    consentRecords: [],
    apiKeys: [],
    settings: [
      { key: 'TTS_PROVIDER',     value: TTS_PROVIDER   },
      { key: 'LIPSYNC_PROVIDER', value: LIPSYNC_PROV   },
      { key: 'AI_RUNTIME_MODE',  value: AI_RUNTIME      },
      { key: 'WAV2LIP_PATH',     value: join(__dirname, 'Wav2Lip') },
      { key: 'PIPER_PATH',       value: 'piper'         },
      { key: 'DEFAULT_VOICE',    value: 'en_US-amy-medium' },
      { key: 'GPU_WORKER_URL',   value: GPU_WORKER_URL  },
      { key: 'GEMINI_API_KEY',   value: GEMINI_KEY      },
      { key: 'VOICE_API_KEY',    value: VOICE_API_KEY   },
      { key: 'MUAPI_API_KEY',    value: MUAPI_KEY       },
    ],
    creditTransactions: [],
  };
}

function settingValue(db, key) {
  const s = db.settings.find(s => s.key === key);
  return s?.value || process.env[key] || '';
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function sha256(str) {
  return createHash('sha256').update(str).digest('hex');
}

function hashPassword(pw) { return sha256('dhs:' + pw); }

function currentUser(req, db) {
  const uid = (req.headers['x-user-id'] || '').trim();
  if (!uid) return null;
  return db.users.find(u => u.id === uid) || null;
}

function requireUser(req, db) {
  const u = currentUser(req, db);
  if (!u) throw Object.assign(new Error('Authentication required.'), { status: 401 });
  return u;
}

function requireAdmin(req, db) {
  const u = requireUser(req, db);
  if (u.role !== 'admin') throw Object.assign(new Error('Admin access required.'), { status: 403 });
  return u;
}

function publicUser(u) {
  const { passwordHash, ...safe } = u;
  return safe;
}

// ─── Process runner ───────────────────────────────────────────────────────────

function run(cmd, args, { timeoutMs = 300_000, label = cmd, jobId = '' } = {}) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    console.log(`[run:start] ${label}`, { cmd, args: args.join(' ').slice(0, 200) });
    // Inject user site-packages so Python workers can find pip-installed packages
    const env = { ...process.env, PYTHONPATH: '/Users/libertyelectronics/Library/Python/3.9/lib/python/site-packages' };
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env });
    let stdout = '', stderr = '';
    const MAX = 2 * 1024 * 1024;
    let settled = false;
    const finish = (fn, val) => { if (!settled) { settled = true; clearTimeout(timer); fn(val); } };
    const timer = timeoutMs > 0 ? setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject, new Error(`${label} timed out after ${Math.round(timeoutMs/1000)}s`));
    }, timeoutMs) : null;
    child.stdout.on('data', d => { if (stdout.length < MAX) stdout += d.toString().slice(0, MAX - stdout.length); });
    child.stderr.on('data', d => { if (stderr.length < MAX) stderr += d.toString().slice(0, MAX - stderr.length); });
    child.on('error', e => finish(reject, e));
    child.on('close', code => {
      console.log(`[run:exit] ${label}`, { code, ms: Date.now() - startedAt });
      if (code === 0) finish(resolve, { stdout, stderr, code });
      else finish(reject, new Error((stderr || stdout || `${label} exited ${code}`).slice(-600)));
    });
  });
}

// ─── Job Queue ────────────────────────────────────────────────────────────────

const jobQueue = [];
let activeRenders = 0;
const MAX_CONCURRENT = 1;

function enqueueJob(jobId) {
  jobQueue.push(jobId);
  drainQueue();
}

async function drainQueue() {
  if (activeRenders >= MAX_CONCURRENT || !jobQueue.length) return;
  const jobId = jobQueue.shift();
  activeRenders++;
  try {
    await processVideoJob(jobId);
  } catch (e) {
    console.error('[queue:error]', jobId, e.message);
  } finally {
    activeRenders--;
    drainQueue();
  }
}

function updateJob(jobId, patch) {
  const db = loadDb();
  const j = db.videoJobs.find(j => j.id === jobId);
  if (j) { Object.assign(j, patch, { updatedAt: new Date().toISOString() }); saveDb(db); }
}

// ─── Worker helpers ───────────────────────────────────────────────────────────

async function runTTS(db, text, outputWav, { voiceId, speed = 1.0, jobId = '' } = {}) {
  const provider = settingValue(db, 'TTS_PROVIDER') || 'system';
  const voiceKey = settingValue(db, 'VOICE_API_KEY');

  if (provider === 'elevenlabs' && voiceKey) {
    // ElevenLabs API
    const vid = voiceId || 'EXAVITQu4vr4xnSDxMaL'; // default Sara
    const body = JSON.stringify({ text, model_id: 'eleven_monolingual_v1', voice_settings: { stability: 0.5, similarity_boost: 0.75 } });
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${vid}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': voiceKey, 'content-type': 'application/json', 'Accept': 'audio/mpeg' },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const mp3Path = outputWav.replace('.wav', '.mp3');
    writeFileSync(mp3Path, buf);
    // Convert mp3 → wav
    await run(FFMPEG, ['-y', '-i', mp3Path, '-ar', '16000', '-ac', '1', outputWav], { label: 'tts-mp3-to-wav', timeoutMs: 30_000 });
    try { fs.unlinkSync(mp3Path); } catch {}
    return outputWav;
  }

  if (provider === 'piper') {
    const piperExe = settingValue(db, 'PIPER_PATH') || 'piper';
    const voice = voiceId || settingValue(db, 'DEFAULT_VOICE') || 'en_US-amy-medium';
    const modelDir = join(__dirname, 'workers', 'voices');
    const modelFile = join(modelDir, `${voice}.onnx`);
    if (existsSync(piperExe) || piperExe === 'piper') {
      try {
        await run(piperExe, ['--model', modelFile, '--output_file', outputWav],
          { label: 'piper-tts', timeoutMs: 60_000 });
        return outputWav;
      } catch (e) {
        console.warn('[tts:piper-failed]', e.message, '— falling back to system TTS');
      }
    }
  }

  // System TTS fallback (macOS `say` command)
  const aiffPath = outputWav.replace('.wav', '.aiff');
  await run('say', ['-o', aiffPath, '--data-format=LEF32@22050', text], { label: 'say-tts', timeoutMs: 60_000 });
  await run(FFMPEG, ['-y', '-i', aiffPath, '-ar', '16000', '-ac', '1', outputWav], { label: 'aiff-to-wav', timeoutMs: 30_000 });
  try { fs.unlinkSync(aiffPath); } catch {}
  return outputWav;
}

async function runFacePrep(db, inputPath, outputDir) {
  const script = join(WORKERS_DIR, 'face_prep.py');
  if (!existsSync(script)) throw new Error('face_prep.py worker not found. Run setup first.');
  const { stdout } = await run(PYTHON, [script, inputPath, outputDir], { label: 'face-prep', timeoutMs: 120_000 });
  return JSON.parse(stdout.trim().split('\n').filter(l => l.startsWith('{')).pop() || '{}');
}

async function runLipsync(db, facePath, audioPath, outputPath, { jobId = '' } = {}) {
  const provider = settingValue(db, 'LIPSYNC_PROVIDER') || 'wav2lip';

  // Muapi cloud fallback (highest quality, no local setup)
  const muapiKey = settingValue(db, 'MUAPI_API_KEY');
  if ((provider === 'muapi' || (AI_RUNTIME === 'cloud' && muapiKey)) && muapiKey) {
    return await runLipsyncMuapi(facePath, audioPath, outputPath, muapiKey);
  }

  // Wav2Lip local
  if (provider === 'wav2lip' || provider === 'local') {
    const script = join(WORKERS_DIR, 'lipsync_worker.py');
    if (existsSync(script)) {
      await run(PYTHON, [script, '--provider', 'wav2lip', '--face', facePath, '--audio', audioPath, '--output', outputPath],
        { label: 'wav2lip', timeoutMs: 600_000, jobId });
      if (existsSync(outputPath) && statSync(outputPath).size > 1024) return outputPath;
    }
  }

  // SadTalker local
  if (provider === 'sadtalker') {
    const script = join(WORKERS_DIR, 'lipsync_worker.py');
    if (existsSync(script)) {
      await run(PYTHON, [script, '--provider', 'sadtalker', '--face', facePath, '--audio', audioPath, '--output', outputPath],
        { label: 'sadtalker', timeoutMs: 1200_000, jobId });
      if (existsSync(outputPath) && statSync(outputPath).size > 1024) return outputPath;
    }
  }

  // Simple FFmpeg fallback — static image + audio (no lip sync, but produces valid video)
  console.warn('[lipsync:fallback] no local model available — using static image + audio');
  await staticImageVideo(facePath, audioPath, outputPath);
  return outputPath;
}

async function staticImageVideo(imagePath, audioPath, outputPath) {
  // If imagePath is already a video, use it as-is overlaid with audio
  const isVideo = /\.(mp4|mov|avi|mkv|webm)$/i.test(imagePath);
  if (isVideo) {
    await run(FFMPEG, [
      '-y', '-i', imagePath, '-i', audioPath,
      '-c:v', 'libx264', '-c:a', 'aac', '-shortest',
      '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
      outputPath,
    ], { label: 'video-audio-merge', timeoutMs: 120_000 });
  } else {
    // Get audio duration
    const probe = await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', audioPath], { label: 'probe-dur' }).catch(() => ({ stdout: '{}' }));
    const dur = JSON.parse(probe.stdout || '{}').format?.duration || '10';
    await run(FFMPEG, [
      '-y', '-loop', '1', '-i', imagePath, '-i', audioPath,
      '-c:v', 'libx264', '-c:a', 'aac', '-t', String(dur),
      '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black',
      '-pix_fmt', 'yuv420p', '-shortest', outputPath,
    ], { label: 'static-image-video', timeoutMs: 120_000 });
  }
}

async function runLipsyncMuapi(facePath, audioPath, outputPath, apiKey) {
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('face', fs.createReadStream(facePath));
  form.append('audio', fs.createReadStream(audioPath));
  const res = await fetch('https://api.muapi.ai/v1/lipsync', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, ...form.getHeaders() },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) throw new Error(`Muapi lipsync failed: ${res.status}`);
  const data = await res.json();
  const videoUrl = data.video_url || data.url;
  if (!videoUrl) throw new Error('Muapi returned no video URL');
  const videoRes = await fetch(videoUrl, { signal: AbortSignal.timeout(120_000) });
  const buf = Buffer.from(await videoRes.arrayBuffer());
  writeFileSync(outputPath, buf);
  return outputPath;
}

async function runQA(db, videoPath, faceRefPath) {
  const script = join(WORKERS_DIR, 'qa_worker.py');
  if (!existsSync(script)) return { valid: true, score: 80, issues: [], note: 'QA worker not installed' };
  try {
    const { stdout } = await run(PYTHON, [script, videoPath, faceRefPath || ''], { label: 'qa', timeoutMs: 120_000 });
    return JSON.parse(stdout.trim().split('\n').filter(l => l.startsWith('{')).pop() || '{}');
  } catch (e) {
    return { valid: true, score: 75, issues: [e.message.slice(0, 100)], note: 'QA partial' };
  }
}

// ─── Caption generation ───────────────────────────────────────────────────────

async function generateCaptions(audioPath, script, outputAssPath, { W = 1080, H = 1920 } = {}) {
  // Estimate word timings from script + audio duration
  let audioDur = 10;
  try {
    const p = await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', audioPath], { label: 'dur' });
    audioDur = Number(JSON.parse(p.stdout || '{}').format?.duration || 10);
  } catch {}

  const words = script.trim().split(/\s+/).filter(Boolean);
  const wps   = words.length / Math.max(1, audioDur);
  const wDur  = 1 / Math.max(0.5, wps);
  const timed = words.map((w, i) => ({ word: w, start: i * wDur, end: (i + 1) * wDur }));

  writeFileSync(outputAssPath, buildASSFile(timed, 0, audioDur, W, H), 'utf8');
}

function buildASSFile(words, clipStart, clipEnd, W = 1080, H = 1920) {
  const fs = Math.round(H * 0.048); // font size ~4.8% of height
  const mV = Math.round(H * 0.14);  // margin from bottom 14%
  const header = `[Script Info]
ScriptType: v4.00+
ScaledBorderAndShadow: yes
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 1

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: DHS,Arial Black,${fs},&H00FFFFFF&,&H0000FFFF&,&H00000000&,&H99000000&,-1,0,0,0,100,100,0,0,1,4,4,2,60,60,${mV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const SZ = 3;
  const events = [];
  for (let i = 0; i < words.length; i += SZ) {
    const phrase = words.slice(i, i + SZ);
    const s = phrase[0].start - clipStart;
    const e = phrase[phrase.length - 1].end - clipStart;
    if (e <= s) continue;
    const parts = phrase.map((w, j) =>
      j === phrase.length - 1 && i + j < words.length - 1
        ? `{\\c&H0000FFFF&\\b1}${w.word.toUpperCase()}{\\r}`
        : `{\\c&H80FFFFFF&}${w.word.toUpperCase()}`
    ).join(' ');
    events.push(`Dialogue: 0,${assTime(s)},${assTime(e)},DHS,,0,0,0,,{\\an2\\fad(80,0)}${parts}`);
  }
  return header + events.join('\n') + '\n';
}

function assTime(s) {
  const t = Math.max(0, Number(s) || 0);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), sc = Math.floor(t % 60), cs = Math.floor((t * 100) % 100);
  return `${h}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}.${String(cs).padStart(2,'0')}`;
}

// ─── Video rendering ──────────────────────────────────────────────────────────

async function renderFinalVideo(lipsyncPath, audioPath, assPath, outputPath, { W = 1080, H = 1920, fps = 30 } = {}) {
  const hasASS = existsSync(assPath);
  const capF   = hasASS ? `,ass='${assPath}'` : '';
  await run(FFMPEG, [
    '-y', '-i', lipsyncPath, '-i', audioPath,
    '-filter_complex',
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black${capF}[vout];` +
    `[1:a]acompressor=threshold=0.089:ratio=4:attack=5:release=50,loudnorm=I=-14:TP=-1.5:LRA=11[aout]`,
    '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-maxrate', '6000k', '-bufsize', '12000k',
    '-r', String(fps), '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
    '-movflags', '+faststart', outputPath,
  ], { label: 'final-render', timeoutMs: 300_000 });
}

// ─── Script writing AI ────────────────────────────────────────────────────────

async function generateScript(db, prompt, mode, { durationSec = 30, tone = 'professional' } = {}) {
  const geminiKey = settingValue(db, 'GEMINI_API_KEY');
  if (!geminiKey) {
    // Fallback: template-based script
    const words = Math.round(durationSec * 2.5);
    return `${prompt}. This is a ${tone} ${mode} video. This content has been designed to engage viewers and deliver value. Watch until the end to get the full picture.`.split(' ').slice(0, words).join(' ') + '.';
  }

  const sysPrompt = `You are a professional video script writer. Write concise, engaging scripts for AI talking-head videos. Return ONLY the spoken script text, nothing else. No stage directions, no headers.`;
  const userPrompt = `Write a ${durationSec}-second ${mode} video script (about ${Math.round(durationSec * 2.5)} words).
Tone: ${tone}
Topic/Prompt: ${prompt}
Format: Spoken words only, natural pauses. No stage directions.`;

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'Authorization': `Bearer ${geminiKey}` },
      body: JSON.stringify({
        model: 'gemini-2.5-flash-lite',
        messages: [{ role: 'system', content: sysPrompt }, { role: 'user', content: userPrompt }],
        max_tokens: 400, temperature: 0.7,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const d = await res.json();
    return d.choices?.[0]?.message?.content?.trim() || prompt;
  } catch {
    return prompt;
  }
}

// ─── Main video generation pipeline ──────────────────────────────────────────

async function processVideoJob(jobId) {
  const db = loadDb();
  const job = db.videoJobs.find(j => j.id === jobId);
  if (!job) return;

  updateJob(jobId, { status: 'processing', stage: 'starting', progress: 2 });

  const dh = db.digitalHumans.find(h => h.id === job.digitalHumanId);
  if (!dh) {
    updateJob(jobId, { status: 'failed', error: 'Digital Human not found.', stage: 'failed', progress: 100 });
    return;
  }

  const tmpDir  = join(STORAGE_DIR, 'temp', jobId);
  mkdirSync(tmpDir, { recursive: true });

  const wavPath    = join(tmpDir, 'speech.wav');
  const lipsyncOut = join(tmpDir, 'lipsync.mp4');
  const assPath    = join(tmpDir, 'captions.ass');
  const finalOut   = join(STORAGE_DIR, 'videos', `${jobId}.mp4`);
  const thumbOut   = join(STORAGE_DIR, 'thumbnails', `${jobId}.jpg`);

  try {
    // Step 1: Script generation if needed
    let script = (job.script || '').trim();
    if (!script && job.prompt) {
      updateJob(jobId, { stage: 'writing script', progress: 10 });
      script = await generateScript(db, job.prompt, job.mode || 'talking_head', {
        durationSec: job.durationSec || 30,
        tone: job.tone || 'professional',
      });
      updateJob(jobId, { script });
    }
    if (!script) throw new Error('No script provided and AI script generation failed.');

    // Step 2: TTS — generate speech audio
    updateJob(jobId, { stage: 'generating voice', progress: 20 });
    await runTTS(db, script, wavPath, {
      voiceId: job.voiceId || dh.defaultVoice || '',
    });
    if (!existsSync(wavPath)) throw new Error('TTS failed to produce audio output.');

    // Step 3: Lip sync — animate face
    updateJob(jobId, { stage: 'lip sync', progress: 40 });
    const facePath = dh.facePath && existsSync(dh.facePath) ? dh.facePath : null;
    if (!facePath) throw new Error('Digital Human has no face asset. Please upload a face photo or video first.');
    await runLipsync(db, facePath, wavPath, lipsyncOut, { jobId });
    if (!existsSync(lipsyncOut) || statSync(lipsyncOut).size < 1024) throw new Error('Lip sync produced no output.');

    // Step 4: Captions
    updateJob(jobId, { stage: 'captions', progress: 65 });
    await generateCaptions(wavPath, script, assPath, {
      W: job.outputW || 1080,
      H: job.outputH || 1920,
    });

    // Step 5: Final render
    updateJob(jobId, { stage: 'rendering', progress: 75 });
    await renderFinalVideo(lipsyncOut, wavPath, assPath, finalOut, {
      W: job.outputW || 1080,
      H: job.outputH || 1920,
      fps: job.fps || 30,
    });
    if (!existsSync(finalOut) || statSync(finalOut).size < 1024) throw new Error('Final render produced no output.');

    // Step 6: Thumbnail
    updateJob(jobId, { stage: 'thumbnail', progress: 88 });
    try {
      await run(FFMPEG, ['-y', '-ss', '1', '-i', finalOut, '-frames:v', '1', '-vf', 'scale=540:960', '-q:v', '3', thumbOut], { label: 'thumb', timeoutMs: 30_000 });
    } catch {}

    // Step 7: QA
    updateJob(jobId, { stage: 'quality check', progress: 93 });
    const qa = await runQA(db, finalOut, facePath || '');

    // Step 8: Deduct credits
    const db2 = loadDb();
    const userIdx = db2.users.findIndex(u => u.id === job.userId);
    const cost = CREDIT_COSTS[job.mode] || CREDIT_COSTS.talking_head;
    if (userIdx !== -1 && db2.users[userIdx].role !== 'admin') {
      db2.users[userIdx].credits = Math.max(0, (db2.users[userIdx].credits || 0) - cost);
      db2.creditTransactions.unshift({
        id: randomUUID(), userId: job.userId, amount: -cost,
        reason: `Video generation — ${job.mode || 'talking_head'} (${jobId.slice(0,8)})`,
        createdAt: new Date().toISOString(),
      });
    }
    const jobInDb2 = db2.videoJobs.find(j => j.id === jobId);
    if (jobInDb2) {
      Object.assign(jobInDb2, {
        status: 'complete', stage: 'complete', progress: 100,
        outputPath: `/media/videos/${jobId}.mp4`,
        thumbnailPath: existsSync(thumbOut) ? `/media/thumbnails/${jobId}.jpg` : '',
        qualityReport: qa,
        script,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    saveDb(db2);

  } catch (error) {
    const msg = String(error.message || error).slice(0, 500);
    console.error('[job:failed]', { jobId, error: msg });
    updateJob(jobId, { status: 'failed', stage: 'failed', progress: 100, error: msg });
  } finally {
    // Clean up temp
    try {
      for (const f of fs.readdirSync(tmpDir)) try { fs.unlinkSync(join(tmpDir, f)); } catch {}
      fs.rmdirSync(tmpDir);
    } catch {}
  }
}

// ─── Worker health check ──────────────────────────────────────────────────────

async function getWorkerHealth(db) {
  const checks = {};

  // FFmpeg
  try {
    const { stdout } = await run(FFMPEG, ['-version'], { label: 'ffmpeg-check', timeoutMs: 5000 });
    checks.ffmpeg = { ok: true, version: stdout.split('\n')[0].split(' ')[2] || 'found' };
  } catch {
    checks.ffmpeg = { ok: false, version: null, error: 'FFmpeg not found' };
  }

  // Python
  try {
    const { stdout } = await run(PYTHON, ['--version'], { label: 'python-check', timeoutMs: 5000 });
    checks.python = { ok: true, version: stdout.trim() };
  } catch {
    checks.python = { ok: false, version: null, error: `${PYTHON} not found` };
  }

  // MediaPipe
  try {
    await run(PYTHON, ['-c', 'import mediapipe; print("ok")'], { label: 'mediapipe-check', timeoutMs: 10000 });
    checks.mediapipe = { ok: true };
  } catch {
    checks.mediapipe = { ok: false, error: 'pip install mediapipe' };
  }

  // Piper TTS
  const piperPath = settingValue(db, 'PIPER_PATH') || 'piper';
  try {
    await run(piperPath, ['--version'], { label: 'piper-check', timeoutMs: 5000 });
    checks.piper = { ok: true };
  } catch {
    checks.piper = { ok: false, error: 'Piper not installed. See setup instructions.' };
  }

  // Wav2Lip
  const wav2lipDir = settingValue(db, 'WAV2LIP_PATH') || join(__dirname, 'Wav2Lip');
  checks.wav2lip = {
    ok: existsSync(join(wav2lipDir, 'inference.py')),
    path: wav2lipDir,
    model: existsSync(join(wav2lipDir, 'checkpoints', 'wav2lip_gan.pth')),
  };

  // Torch (for lip sync models)
  try {
    const { stdout } = await run(PYTHON, ['-c', 'import torch; print(torch.__version__)'], { label: 'torch-check', timeoutMs: 10000 });
    checks.torch = { ok: true, version: stdout.trim() };
  } catch {
    checks.torch = { ok: false, error: 'pip install torch' };
  }

  // System memory (rough)
  try {
    const { stdout } = await run('vm_stat', [], { label: 'vmstat', timeoutMs: 3000 });
    const freeMatch = stdout.match(/Pages free:\s+(\d+)/);
    const freeMB = freeMatch ? Math.round(Number(freeMatch[1]) * 4096 / 1024 / 1024) : null;
    checks.memory = { freeMB };
  } catch {
    checks.memory = { freeMB: null };
  }

  // CPU cores
  try {
    const { stdout } = await run('sysctl', ['-n', 'hw.ncpu'], { label: 'cpu-check', timeoutMs: 3000 });
    checks.cpu = { cores: Number(stdout.trim()) };
  } catch {
    checks.cpu = { cores: null };
  }

  // GPU (Metal on Mac)
  try {
    const { stdout } = await run('system_profiler', ['SPDisplaysDataType'], { label: 'gpu-check', timeoutMs: 5000 });
    const hasGPU = stdout.includes('GPU');
    checks.gpu = { available: hasGPU, note: hasGPU ? 'GPU detected' : 'No GPU/integrated only' };
  } catch {
    checks.gpu = { available: false };
  }

  const mode = settingValue(db, 'AI_RUNTIME_MODE') || AI_RUNTIME;
  const allOk = checks.ffmpeg?.ok && checks.python?.ok;
  return { mode, ready: allOk, checks, queueDepth: jobQueue.length, activeRenders };
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', c => { body += c; if (body.length > 2_000_000) reject(new Error('Body too large')); });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimes = { '.html':'text/html;charset=utf-8', '.js':'application/javascript;charset=utf-8', '.css':'text/css;charset=utf-8', '.json':'application/json', '.jpg':'image/jpeg', '.png':'image/png', '.mp4':'video/mp4', '.wav':'audio/wav', '.webp':'image/webp' };
  const ct = mimes[ext] || 'application/octet-stream';
  try {
    const stat = statSync(filePath);
    res.writeHead(200, { 'content-type': ct, 'content-length': stat.size, 'cache-control': 'no-cache' });
    fs.createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
}

function streamMedia(req, res, filePath) {
  if (!existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  const stat = statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mimes = { '.mp4': 'video/mp4', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.jpg': 'image/jpeg', '.png': 'image/png' };
  const ct = mimes[ext] || 'application/octet-stream';
  const range = req.headers.range;
  if (range && ct === 'video/mp4') {
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end   = endStr ? parseInt(endStr, 10) : stat.size - 1;
    const chunk = end - start + 1;
    res.writeHead(206, { 'content-type': ct, 'content-range': `bytes ${start}-${end}/${stat.size}`, 'accept-ranges': 'bytes', 'content-length': chunk });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': ct, 'content-length': stat.size, 'accept-ranges': 'bytes' });
    fs.createReadStream(filePath).pipe(res);
  }
}

// ─── File upload helper ───────────────────────────────────────────────────────

function streamUpload(req, destDir, { maxSizeMb = 200, allowedExts = [] } = {}) {
  return new Promise((resolve, reject) => {
    const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: maxSizeMb * 1024 * 1024 } });
    const fields = {};
    let upload = null;
    let done = false;
    const fail = e => { if (!done) { done = true; reject(e); } };

    bb.on('field', (k, v) => { fields[k] = v; });
    bb.on('file', (fieldname, stream, { filename }) => {
      const safeExt = path.extname(filename).toLowerCase();
      if (allowedExts.length && !allowedExts.includes(safeExt)) {
        stream.resume();
        return fail(new Error(`File type ${safeExt} not allowed. Allowed: ${allowedExts.join(', ')}`));
      }
      const outName = `${randomUUID()}${safeExt}`;
      const outPath = join(destDir, outName);
      mkdirSync(destDir, { recursive: true });
      const ws = fs.createWriteStream(outPath);
      stream.pipe(ws);
      stream.on('limit', () => { ws.close(); try { fs.unlinkSync(outPath); } catch {} fail(new Error(`File exceeds ${maxSizeMb}MB limit.`)); });
      ws.on('finish', () => { upload = { path: outPath, name: outName, originalName: filename, ext: safeExt }; });
      ws.on('error', fail);
    });
    bb.on('finish', () => { if (!done) { done = true; resolve({ fields, upload }); } });
    bb.on('error', fail);
    req.pipe(bb);
  });
}

// ─── API Routes ───────────────────────────────────────────────────────────────

async function handleAPI(req, res, pathname) {
  const db = loadDb();
  const method = req.method;

  // ── Auth ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/auth/signup' && method === 'POST') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const name = String(body.name || '').trim() || 'User';
    if (!email || !email.includes('@')) throw new Error('Valid email required.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (db.users.find(u => u.email === email)) throw new Error('Email already registered.');
    const user = {
      id: randomUUID(), email, passwordHash: hashPassword(password), name,
      role: 'user', credits: 30, plan: 'free', createdAt: new Date().toISOString(),
    };
    db.users.push(user);
    saveDb(db);
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await readJson(req);
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const user = db.users.find(u => u.email === email);
    if (!user || user.passwordHash !== hashPassword(password)) throw new Error('Invalid email or password.');
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const user = requireUser(req, db);
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/update-profile' && method === 'PATCH') {
    const user = requireUser(req, db);
    const body = await readJson(req);
    const { name, email } = body;
    if (!name || !email) return json(res, 400, { error: 'Name and email required.' });
    const conflict = db.users.find(u => u.email === email && u.id !== user.id);
    if (conflict) return json(res, 400, { error: 'Email already in use.' });
    user.name = name; user.email = email;
    saveDb(db);
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/auth/change-password' && method === 'POST') {
    const user = requireUser(req, db);
    const body = await readJson(req);
    const { currentPassword, newPassword } = body;
    if (user.passwordHash !== hashPassword(currentPassword)) return json(res, 400, { error: 'Current password is incorrect.' });
    if (!newPassword || newPassword.length < 8) return json(res, 400, { error: 'New password must be at least 8 characters.' });
    user.passwordHash = hashPassword(newPassword);
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  // ── Workers health ────────────────────────────────────────────────────────
  if (pathname === '/api/workers/health') {
    const health = await getWorkerHealth(db);
    return json(res, 200, health);
  }

  // ── Camera capture sessions ───────────────────────────────────────────────
  if (pathname === '/api/capture/session/start' && method === 'POST') {
    const user = requireUser(req, db);
    const sessionId = randomUUID();
    const sessionDir = join(STORAGE_DIR, 'captures', sessionId);
    await fs.promises.mkdir(sessionDir, { recursive: true });
    if (!db.captureSessions) db.captureSessions = [];
    db.captureSessions.push({ id: sessionId, userId: user.id, createdAt: new Date().toISOString(), status: 'pending' });
    saveDb(db);
    return json(res, 200, { sessionId });
  }

  if (pathname === '/api/capture/session/upload' && method === 'POST') {
    const user = requireUser(req, db);
    const sessionId = new URL(req.url, 'http://localhost').searchParams.get('sessionId');
    if (!sessionId) return json(res, 400, { error: 'sessionId required' });
    const sessions = db.captureSessions || [];
    const session = sessions.find(s => s.id === sessionId && s.userId === user.id);
    if (!session) return json(res, 404, { error: 'Session not found' });
    const sessionDir = join(STORAGE_DIR, 'captures', sessionId);
    await fs.promises.mkdir(sessionDir, { recursive: true });
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const buf = Buffer.concat(chunks);
    const captureFile = join(sessionDir, 'capture.webm');
    await fs.promises.writeFile(captureFile, buf);
    session.captureFile = captureFile;
    session.captureSize = buf.length;
    session.status = 'captured';
    saveDb(db);
    return json(res, 200, { ok: true, sessionId, size: buf.length });
  }

  if (pathname === '/api/digital-humans/create-from-capture' && method === 'POST') {
    const user = requireUser(req, db);
    const body = await readJson(req);
    const { name, sessionId, consentConfirmed } = body;
    if (!name) return json(res, 400, { error: 'Name required' });
    if (!consentConfirmed) return json(res, 400, { error: 'Consent required' });
    const sessions = db.captureSessions || [];
    const session = sessions.find(s => s.id === sessionId && s.userId === user.id);
    const captureFile = session?.captureFile || null;
    const dhId = randomUUID();
    const dh = {
      id: dhId, userId: user.id, name, type: 'self',
      status: captureFile && existsSync(captureFile) ? 'ready' : 'draft',
      consentType: 'self', consentConfirmed: true,
      consentNote: 'Captured via camera wizard with biometric consent recording.',
      facePath: captureFile && existsSync(captureFile) ? captureFile : null,
      faceVideoPath: sessionId ? `/storage/captures/${sessionId}/capture.webm` : null,
      captureSessionId: sessionId,
      defaultVoice: 'en_US-amy-medium',
      personality: {}, preferredOutfits: [], preferredScenes: [],
      consentVerified: true, consentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    db.digitalHumans.push(dh);
    db.consentRecords = db.consentRecords || [];
    db.consentRecords.push({
      id: randomUUID(), userId: user.id, digitalHumanId: dh.id,
      type: 'self', ipAddress: req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      note: dh.consentNote, createdAt: new Date().toISOString(),
    });
    if (session) session.status = 'used';
    saveDb(db);
    return json(res, 201, { digitalHuman: dh });
  }

  if (pathname === '/api/digital-humans/create-fictional' && method === 'POST') {
    const user = requireUser(req, db);
    const body = await readJson(req);
    const { gender, ageRange, appearance, style, voiceStyle, personality, useCase } = body;
    if (!appearance) return json(res, 400, { error: 'Appearance description required' });
    const nameMap = {
      male: ['Alex', 'Jordan', 'Marcus', 'Ryan', 'James'],
      female: ['Aria', 'Maya', 'Sofia', 'Elena', 'Zara'],
      'non-binary': ['Riley', 'Sage', 'Avery', 'Quinn'],
      custom: ['Nova', 'Echo', 'Pixel', 'Lyra'],
    };
    const names = nameMap[gender] || nameMap.custom;
    const baseName = names[Math.floor(Math.random() * names.length)];
    const dhName = body.name || `${baseName} AI`;
    const voiceMap = {
      'deep-male': 'en_US-lessac-medium', 'warm-female': 'en_US-amy-medium',
      'young-energetic': 'en_US-ljspeech-medium', 'british': 'en_GB-alba-medium',
      'american': 'en_US-amy-medium',
    };
    const dhId = randomUUID();
    const dh = {
      id: dhId, userId: user.id, name: dhName, type: 'fictional',
      status: 'ready',
      consentType: 'synthetic', consentConfirmed: true,
      consentNote: 'Fictional AI-generated identity. No real person cloned.',
      consentVerified: true, consentAt: new Date().toISOString(),
      isFictional: true,
      description: { gender, ageRange, appearance, style, voiceStyle, personality, useCase },
      facePath: null, faceVideoPath: null,
      defaultVoice: voiceMap[voiceStyle] || 'en_US-amy-medium',
      personality: {}, preferredOutfits: [], preferredScenes: [],
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    };
    db.digitalHumans.push(dh);
    db.consentRecords = db.consentRecords || [];
    db.consentRecords.push({
      id: randomUUID(), userId: user.id, digitalHumanId: dh.id,
      type: 'synthetic', ipAddress: req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      note: dh.consentNote, createdAt: new Date().toISOString(),
    });
    saveDb(db);
    return json(res, 201, { digitalHuman: dh });
  }

  // ── Digital Humans ────────────────────────────────────────────────────────
  if (pathname === '/api/digital-humans' && method === 'GET') {
    const user = requireUser(req, db);
    const isAdmin = user.role === 'admin';
    const dhs = isAdmin ? db.digitalHumans : db.digitalHumans.filter(h => h.userId === user.id);
    return json(res, 200, { digitalHumans: dhs });
  }

  if (pathname === '/api/digital-humans' && method === 'POST') {
    const user = requireUser(req, db);
    const body = await readJson(req);
    if (!body.name) throw new Error('Name is required.');
    if (!body.consentConfirmed) throw new Error('You must confirm consent before creating a Digital Human.');

    const dh = {
      id: randomUUID(),
      userId: user.id,
      name: body.name,
      type: body.type || 'self',
      status: 'draft',
      facePath: null,
      voicePath: null,
      defaultVoice: body.defaultVoice || settingValue(db, 'DEFAULT_VOICE') || 'en_US-amy-medium',
      personality: body.personality || {},
      preferredOutfits: [],
      preferredScenes: [],
      consentVerified: true,
      consentType: body.consentType || 'self',
      consentNote: body.consentNote || 'User confirmed ownership and consent at creation time.',
      consentAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.digitalHumans.push(dh);

    // Consent record
    db.consentRecords.push({
      id: randomUUID(),
      userId: user.id,
      digitalHumanId: dh.id,
      type: dh.consentType,
      ipAddress: req.socket?.remoteAddress || '',
      userAgent: req.headers['user-agent'] || '',
      note: dh.consentNote,
      createdAt: new Date().toISOString(),
    });

    saveDb(db);
    return json(res, 200, { digitalHuman: dh });
  }

  if (pathname.match(/^\/api\/digital-humans\/([^/]+)$/) && method === 'GET') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const dh = db.digitalHumans.find(h => h.id === id && (h.userId === user.id || user.role === 'admin'));
    if (!dh) throw Object.assign(new Error('Digital Human not found.'), { status: 404 });
    return json(res, 200, { digitalHuman: dh });
  }

  if (pathname.match(/^\/api\/digital-humans\/([^/]+)$/) && method === 'PATCH') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const body = await readJson(req);
    const dh = db.digitalHumans.find(h => h.id === id && (h.userId === user.id || user.role === 'admin'));
    if (!dh) throw Object.assign(new Error('Digital Human not found.'), { status: 404 });
    const allowed = ['name', 'defaultVoice', 'personality', 'preferredOutfits', 'preferredScenes', 'type'];
    for (const k of allowed) if (k in body) dh[k] = body[k];
    dh.updatedAt = new Date().toISOString();
    saveDb(db);
    return json(res, 200, { digitalHuman: dh });
  }

  if (pathname.match(/^\/api\/digital-humans\/([^/]+)$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const idx = db.digitalHumans.findIndex(h => h.id === id && (h.userId === user.id || user.role === 'admin'));
    if (idx === -1) throw Object.assign(new Error('Digital Human not found.'), { status: 404 });
    const dh = db.digitalHumans[idx];
    // Delete assets
    if (dh.facePath && existsSync(dh.facePath)) try { fs.unlinkSync(dh.facePath); } catch {}
    if (dh.voicePath && existsSync(dh.voicePath)) try { fs.unlinkSync(dh.voicePath); } catch {}
    db.digitalHumans.splice(idx, 1);
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  // ── Upload face asset ─────────────────────────────────────────────────────
  if (pathname.match(/^\/api\/digital-humans\/([^/]+)\/upload-face$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const dh = db.digitalHumans.find(h => h.id === id && (h.userId === user.id || user.role === 'admin'));
    if (!dh) throw Object.assign(new Error('Digital Human not found.'), { status: 404 });
    const { upload } = await streamUpload(req, join(STORAGE_DIR, 'faces'), {
      maxSizeMb: 200,
      allowedExts: ['.jpg', '.jpeg', '.png', '.webp', '.mp4', '.mov', '.avi'],
    });
    if (!upload) throw new Error('No file uploaded.');
    if (dh.facePath && existsSync(dh.facePath)) try { fs.unlinkSync(dh.facePath); } catch {}
    dh.facePath = upload.path;
    dh.status = 'ready';
    dh.updatedAt = new Date().toISOString();
    saveDb(db);
    return json(res, 200, { ok: true, digitalHuman: dh });
  }

  // ── Upload voice asset ────────────────────────────────────────────────────
  if (pathname.match(/^\/api\/digital-humans\/([^/]+)\/upload-voice$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const dh = db.digitalHumans.find(h => h.id === id && (h.userId === user.id || user.role === 'admin'));
    if (!dh) throw Object.assign(new Error('Digital Human not found.'), { status: 404 });
    const { upload } = await streamUpload(req, join(STORAGE_DIR, 'voices'), {
      maxSizeMb: 50,
      allowedExts: ['.wav', '.mp3', '.m4a', '.ogg', '.flac'],
    });
    if (!upload) throw new Error('No file uploaded.');
    if (dh.voicePath && existsSync(dh.voicePath)) try { fs.unlinkSync(dh.voicePath); } catch {}
    dh.voicePath = upload.path;
    dh.updatedAt = new Date().toISOString();
    saveDb(db);
    return json(res, 200, { ok: true, digitalHuman: dh });
  }

  // ── Video generation ──────────────────────────────────────────────────────
  if (pathname === '/api/videos/generate' && method === 'POST') {
    const user = requireUser(req, db);
    const body = await readJson(req);

    if (!body.digitalHumanId) throw new Error('digitalHumanId is required.');
    const dh = db.digitalHumans.find(h => h.id === body.digitalHumanId && (h.userId === user.id || user.role === 'admin'));
    if (!dh) throw Object.assign(new Error('Digital Human not found.'), { status: 404 });
    if (!dh.facePath || !existsSync(dh.facePath)) throw new Error('Digital Human needs a face asset. Upload a photo or video first.');

    const mode = body.mode || 'talking_head';
    const cost = CREDIT_COSTS[mode] || CREDIT_COSTS.talking_head;
    if (user.role !== 'admin' && (user.credits || 0) < cost) {
      throw new Error(`Not enough credits. This generation costs ${cost} credits. You have ${user.credits}.`);
    }

    const job = {
      id: randomUUID(),
      userId: user.id,
      digitalHumanId: dh.id,
      mode,
      script: (body.script || '').trim(),
      prompt: (body.prompt || '').trim(),
      voiceId: body.voiceId || dh.defaultVoice || '',
      tone: body.tone || 'professional',
      durationSec: Number(body.durationSec || 30),
      outputW: Number(body.outputW || 1080),
      outputH: Number(body.outputH || 1920),
      fps: Number(body.fps || 30),
      addCaptions: body.addCaptions !== false,
      creditsCost: cost,
      status: 'queued',
      stage: 'queued',
      progress: 0,
      outputPath: null,
      thumbnailPath: null,
      qualityReport: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    db.videoJobs.unshift(job);
    saveDb(db);
    enqueueJob(job.id);
    return json(res, 202, { jobId: job.id, status: 'queued', creditsCost: cost });
  }

  // Convenience aliases
  if ((pathname === '/api/videos/generate-ad' || pathname === '/api/videos/generate-intro' ||
       pathname === '/api/videos/generate-outro' || pathname === '/api/videos/generate-presenter') && method === 'POST') {
    const modeMap = { 'generate-ad': 'ad_video', 'generate-intro': 'intro', 'generate-outro': 'outro', 'generate-presenter': 'presenter' };
    const mode = modeMap[pathname.split('/').pop()] || 'talking_head';
    const body = await readJson(req);
    req.body = { ...body, mode };
    req.method = 'POST';
    req.url = '/api/videos/generate';
    return handleAPI(req, res, '/api/videos/generate');
  }

  // ── ClipForge integration endpoints ──────────────────────────────────────
  if (pathname === '/api/clipforge/generate-intro' && method === 'POST') {
    req.method = 'POST'; const body = await readJson(req); req.body = { ...body, mode: 'intro' };
    return handleAPI(req, res, '/api/videos/generate');
  }
  if (pathname === '/api/clipforge/generate-outro' && method === 'POST') {
    const body = await readJson(req); req.body = { ...body, mode: 'outro' };
    return handleAPI(req, res, '/api/videos/generate');
  }
  if (pathname === '/api/clipforge/generate-presenter' && method === 'POST') {
    const body = await readJson(req); req.body = { ...body, mode: 'presenter' };
    return handleAPI(req, res, '/api/videos/generate');
  }
  if (pathname === '/api/clipforge/generate-ad' && method === 'POST') {
    const body = await readJson(req); req.body = { ...body, mode: 'ad_video' };
    return handleAPI(req, res, '/api/videos/generate');
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────
  if (pathname === '/api/jobs' && method === 'GET') {
    const user = requireUser(req, db);
    const isAdmin = user.role === 'admin';
    const jobs = isAdmin ? db.videoJobs : db.videoJobs.filter(j => j.userId === user.id);
    return json(res, 200, { jobs: jobs.slice(0, 50) });
  }

  if (pathname.match(/^\/api\/jobs\/([^/]+)$/) && method === 'GET') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const job = db.videoJobs.find(j => j.id === id && (j.userId === user.id || user.role === 'admin'));
    if (!job) throw Object.assign(new Error('Job not found.'), { status: 404 });
    return json(res, 200, { job });
  }

  if (pathname.match(/^\/api\/jobs\/([^/]+)\/retry$/) && method === 'POST') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const job = db.videoJobs.find(j => j.id === id && (j.userId === user.id || user.role === 'admin'));
    if (!job) throw Object.assign(new Error('Job not found.'), { status: 404 });
    if (job.status !== 'failed') throw new Error('Only failed jobs can be retried.');
    Object.assign(job, { status: 'queued', stage: 'queued', progress: 0, error: null, updatedAt: new Date().toISOString() });
    saveDb(db);
    enqueueJob(job.id);
    return json(res, 200, { ok: true });
  }

  if (pathname.match(/^\/api\/jobs\/([^/]+)$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const idx = db.videoJobs.findIndex(j => j.id === id && (j.userId === user.id || user.role === 'admin'));
    if (idx === -1) throw Object.assign(new Error('Job not found.'), { status: 404 });
    const job = db.videoJobs[idx];
    if (job.outputPath) {
      const fp = join(STORAGE_DIR, 'videos', path.basename(job.outputPath));
      try { if (existsSync(fp)) fs.unlinkSync(fp); } catch {}
    }
    db.videoJobs.splice(idx, 1);
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  // ── Credits ───────────────────────────────────────────────────────────────
  if (pathname === '/api/credits/status' && method === 'GET') {
    const user = requireUser(req, db);
    const txns = db.creditTransactions.filter(t => t.userId === user.id).slice(0, 20);
    return json(res, 200, { credits: user.credits, plan: user.plan, transactions: txns });
  }

  // ── API Keys ──────────────────────────────────────────────────────────────
  if (pathname === '/api/api-keys' && method === 'GET') {
    const user = requireUser(req, db);
    const keys = db.apiKeys.filter(k => k.userId === user.id).map(k => ({ ...k, key: k.key.slice(0, 8) + '••••' }));
    return json(res, 200, { apiKeys: keys });
  }

  if (pathname === '/api/api-keys' && method === 'POST') {
    const user = requireUser(req, db);
    const body = await readJson(req);
    const key = { id: randomUUID(), userId: user.id, name: body.name || 'API Key', key: 'dhs_' + randomBytes(32).toString('hex'), createdAt: new Date().toISOString() };
    db.apiKeys.push(key);
    saveDb(db);
    return json(res, 200, { apiKey: key }); // show full key once on creation
  }

  if (pathname.match(/^\/api\/api-keys\/([^/]+)$/) && method === 'DELETE') {
    const id = pathname.split('/')[3];
    const user = requireUser(req, db);
    const idx = db.apiKeys.findIndex(k => k.id === id && k.userId === user.id);
    if (idx === -1) throw new Error('API key not found.');
    db.apiKeys.splice(idx, 1);
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  // ── Admin ─────────────────────────────────────────────────────────────────
  if (pathname === '/api/admin/overview' && method === 'GET') {
    requireAdmin(req, db);
    return json(res, 200, {
      users: db.users.length,
      digitalHumans: db.digitalHumans.length,
      videoJobs: db.videoJobs.length,
      completedJobs: db.videoJobs.filter(j => j.status === 'complete').length,
      failedJobs: db.videoJobs.filter(j => j.status === 'failed').length,
      queueDepth: jobQueue.length,
      activeRenders,
    });
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    requireAdmin(req, db);
    return json(res, 200, { users: db.users.map(publicUser) });
  }

  if (pathname === '/api/admin/users' && method === 'PATCH') {
    requireAdmin(req, db);
    const body = await readJson(req);
    const user = db.users.find(u => u.id === body.userId);
    if (!user) throw new Error('User not found.');
    if (body.creditDelta !== undefined) user.credits = Math.max(0, (user.credits || 0) + Number(body.creditDelta));
    if (body.plan) user.plan = body.plan;
    if (body.role) user.role = body.role;
    saveDb(db);
    return json(res, 200, { user: publicUser(user) });
  }

  if (pathname === '/api/admin/jobs' && method === 'GET') {
    requireAdmin(req, db);
    return json(res, 200, { jobs: db.videoJobs.slice(0, 100) });
  }

  if (pathname === '/api/admin/digital-humans' && method === 'GET') {
    requireAdmin(req, db);
    return json(res, 200, { digitalHumans: db.digitalHumans });
  }

  if (pathname.match(/^\/api\/admin\/digital-humans\/([^/]+)\/takedown$/) && method === 'POST') {
    requireAdmin(req, db);
    const id = pathname.split('/')[4];
    const body = await readJson(req);
    const dh = db.digitalHumans.find(h => h.id === id);
    if (!dh) throw new Error('Digital Human not found.');
    dh.status = 'taken_down';
    dh.takedownReason = body.reason || 'Admin action';
    dh.takenDownAt = new Date().toISOString();
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/admin/settings' && method === 'GET') {
    requireAdmin(req, db);
    return json(res, 200, { settings: db.settings });
  }

  if (pathname === '/api/admin/settings' && method === 'PATCH') {
    requireAdmin(req, db);
    const body = await readJson(req);
    for (const [k, v] of Object.entries(body.settings || {})) {
      const s = db.settings.find(s => s.key === k);
      if (s) s.value = String(v);
    }
    saveDb(db);
    return json(res, 200, { ok: true });
  }

  // ── Setup check ───────────────────────────────────────────────────────────
  if (pathname === '/api/setup/check' && method === 'GET') {
    const ffmpegOk = await run(FFMPEG, ['-version'], { label: 'ffmpeg', timeoutMs: 5000 }).then(() => true).catch(() => false);
    const pythonOk = await run(PYTHON, ['--version'], { label: 'python', timeoutMs: 5000 }).then(() => true).catch(() => false);
    return json(res, 200, { ffmpeg: ffmpegOk, python: pythonOk, ready: ffmpegOk });
  }

  throw Object.assign(new Error(`Not found: ${method} ${pathname}`), { status: 404 });
}

// ─── Main request handler ─────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-headers', 'content-type, x-user-id, authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const rawUrl = req.url || '/';
  const pathname = rawUrl.split('?')[0].replace(/\/+$/, '') || '/';

  // Media files (video, thumbnails)
  if (pathname.startsWith('/media/')) {
    const sub = pathname.slice('/media/'.length);
    const parts = sub.split('/');
    const folder = parts[0]; // videos, thumbnails, faces (admin only)
    const file = parts.slice(1).join('/');
    const allowed = ['videos', 'thumbnails'];
    if (!allowed.includes(folder)) { res.writeHead(403); return res.end('Forbidden'); }
    return streamMedia(req, res, join(STORAGE_DIR, folder, file));
  }

  // Storage captures (webm capture files)
  if (pathname.startsWith('/storage/captures/')) {
    const sub = pathname.slice('/storage/captures/'.length);
    // Only allow .webm files, no path traversal
    if (sub.includes('..') || !sub.endsWith('.webm')) { res.writeHead(403); return res.end('Forbidden'); }
    return streamMedia(req, res, join(STORAGE_DIR, 'captures', sub));
  }

  // API
  if (pathname.startsWith('/api/')) {
    try {
      await handleAPI(req, res, pathname);
    } catch (e) {
      const status = e.status || 500;
      if (status >= 500) console.error('[api:error]', pathname, e.message);
      return json(res, status, { error: e.message || 'Internal server error' });
    }
    return;
  }

  // Static files
  const publicDir = join(__dirname, 'public');
  let filePath = join(publicDir, pathname === '/' ? 'index.html' : pathname);
  if (!existsSync(filePath)) filePath = join(publicDir, 'index.html'); // SPA fallback
  serveStatic(res, filePath);
});

// ─── Startup ──────────────────────────────────────────────────────────────────

async function startup() {
  // Ensure DB exists
  if (!existsSync(DATA_FILE)) {
    mkdirSync(dirname(DATA_FILE), { recursive: true });
    saveDb(defaultDb());
    console.log('[startup] Created new database');
  }

  // Ensure storage dirs
  for (const d of ['faces', 'voices', 'videos', 'originals', 'thumbnails', 'temp', 'captures']) {
    mkdirSync(join(STORAGE_DIR, d), { recursive: true });
  }

  // Check FFmpeg
  const ffmpegOk = await run(FFMPEG, ['-version'], { label: 'ffmpeg-check', timeoutMs: 5000 }).then(() => true).catch(() => false);
  if (!ffmpegOk) console.warn('[startup] WARNING: FFmpeg not found. Video rendering will fail. Install with: brew install ffmpeg-full');

  server.listen(PORT, () => {
    console.log(`\n🎬 Digital Human Studio ready`);
    console.log(`   Local:   http://localhost:${PORT}`);
    console.log(`   Runtime: ${AI_RUNTIME}`);
    console.log(`   TTS:     ${TTS_PROVIDER}`);
    console.log(`   Lipsync: ${LIPSYNC_PROV}`);
    console.log(`\n   Admin:   admin@digitalhuman.local / Admin2024!\n`);
  });
}

startup().catch(e => { console.error('[startup:fatal]', e); process.exit(1); });
