// Identity Pack — extracts reference frames from a capture video
// The capture video is TRAINING DATA only — never used as video output.
// Extracts: front face, left angle, right angle, expression, neutral frames
// Capture wizard timing (from app.js wizard steps):
//   Step 3: Front face — 5s recording (frames ~0.5s–3s)
//   Step 4: Side angles — 5s recording (frames ~5.5s–9.5s)
//   Step 5: Expressions — 3s recording (frames ~10.5s–13s)
//   Combined total: ~13s capture video

import { execFile } from 'child_process';
import { mkdirSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
import { promisify } from 'util';

const exec = promisify(execFile);

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';
const FFPROBE = process.env.FFPROBE_PATH || 'ffprobe';

// Frame extraction targets (timestamp in seconds → label)
const FRAME_TARGETS = [
  { t: 0.5,  label: 'front',       note: 'Front face — looking straight at camera' },
  { t: 1.5,  label: 'front_b',     note: 'Front face alternate' },
  { t: 3.5,  label: 'left',        note: 'Left angle — head turned left' },
  { t: 5.5,  label: 'right',       note: 'Right angle — head turned right' },
  { t: 7.5,  label: 'left_mid',    note: 'Mid left-right pan' },
  { t: 9.0,  label: 'expression',  note: 'Smile / expression' },
  { t: 10.5, label: 'neutral',     note: 'Neutral / blink' },
];

export async function extractIdentityPack(captureVideoPath, outputDir) {
  mkdirSync(outputDir, { recursive: true });

  if (!existsSync(captureVideoPath)) {
    return buildFailPack('Capture video file does not exist.');
  }

  // Probe video duration
  let duration = 0;
  try {
    const { stdout } = await exec(FFPROBE, [
      '-v', 'quiet', '-print_format', 'json', '-show_format', captureVideoPath,
    ]);
    duration = parseFloat(JSON.parse(stdout).format?.duration || '0');
  } catch (e) {
    return buildFailPack(`Could not probe capture video: ${e.message}`);
  }

  if (duration < 1) {
    return buildFailPack(`Capture video is too short (${duration.toFixed(1)}s). Minimum 3s required.`);
  }

  // Extract frames at target timestamps (only those within video duration)
  const frames = [];
  const targets = FRAME_TARGETS.filter(f => f.t < duration - 0.2);

  // Also extract at proportional timestamps for very short captures
  if (targets.length < 3) {
    const extras = [0.3, 0.5, 0.7].map(frac => ({
      t: duration * frac,
      label: `auto_${Math.round(duration * frac * 10)}`,
      note: 'Auto-extracted proportional frame',
    }));
    targets.push(...extras);
  }

  for (const target of targets) {
    const outPath = join(outputDir, `frame_${target.label}.jpg`);
    try {
      await exec(FFMPEG, [
        '-ss', String(target.t),
        '-i', captureVideoPath,
        '-frames:v', '1',
        '-q:v', '2',
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2',
        '-y', outPath,
      ]);
      if (existsSync(outPath) && statSync(outPath).size > 5000) {
        frames.push({ path: outPath, label: target.label, note: target.note, timestamp: target.t });
      }
    } catch (e) {
      // Non-fatal — continue to next frame
      console.warn(`[identity-pack] Frame extraction failed at ${target.t}s: ${e.message}`);
    }
  }

  if (frames.length === 0) {
    return buildFailPack('No frames could be extracted from capture. Check FFmpeg installation.');
  }

  // Pick primary face frame — prefer front, then any
  const primary = frames.find(f => f.label === 'front') || frames[0];

  // Calculate quality score
  const score = calcQualityScore(frames, duration);

  // Validate quality
  const validation = validatePack(frames, score);

  return {
    faceFrames: frames.map(f => f.path),
    framesMeta: frames,
    primaryFaceFrame: primary.path,
    frontFrame: frames.find(f => f.label === 'front')?.path || null,
    leftAngleFrame: frames.find(f => f.label === 'left')?.path || null,
    rightAngleFrame: frames.find(f => f.label === 'right')?.path || null,
    expressionFrame: frames.find(f => f.label === 'expression')?.path || null,
    neutralFrame: frames.find(f => f.label === 'neutral')?.path || null,
    qualityScore: score,
    framesExtracted: frames.length,
    captureDuration: duration,
    validation,
    extractedAt: new Date().toISOString(),
    source: 'camera_capture',
    note: 'Capture video is training reference only — never used as video output.',
  };
}

function calcQualityScore(frames, duration) {
  let score = 0;
  // Reward number of frames extracted
  score += Math.min(frames.length * 8, 40);
  // Reward having key frame types
  if (frames.some(f => f.label === 'front')) score += 20;
  if (frames.some(f => f.label === 'left' || f.label === 'right')) score += 15;
  if (frames.some(f => f.label === 'expression')) score += 10;
  if (frames.some(f => f.label === 'neutral')) score += 5;
  // Reward longer capture
  if (duration >= 10) score += 10;
  return Math.min(100, score);
}

function validatePack(frames, score) {
  const issues = [];
  const warnings = [];

  if (!frames.some(f => f.label === 'front')) {
    issues.push('Missing front-facing frame — identity preservation may be poor');
  }
  if (!frames.some(f => f.label === 'left' || f.label === 'right')) {
    warnings.push('No side-angle frames — add left/right head rotation to improve identity accuracy');
  }
  if (frames.length < 3) {
    issues.push(`Only ${frames.length} frame(s) extracted — capture may have been too short or dark`);
  }
  if (score < 40) {
    issues.push('Identity pack quality is low — recapture with better lighting and longer recording');
  }

  return {
    passed: issues.length === 0,
    score,
    issues,
    warnings,
    recommendation: score >= 70
      ? 'Good identity pack — ready for generation'
      : score >= 40
        ? 'Acceptable — some identity features may not preserve perfectly'
        : 'Poor quality — recapture strongly recommended',
  };
}

function buildFailPack(reason) {
  return {
    faceFrames: [],
    framesMeta: [],
    primaryFaceFrame: null,
    frontFrame: null,
    leftAngleFrame: null,
    rightAngleFrame: null,
    expressionFrame: null,
    neutralFrame: null,
    qualityScore: 0,
    framesExtracted: 0,
    captureDuration: 0,
    validation: {
      passed: false,
      score: 0,
      issues: [reason],
      warnings: [],
      recommendation: 'Recapture required.',
    },
    extractedAt: new Date().toISOString(),
    source: 'camera_capture',
    note: reason,
  };
}
