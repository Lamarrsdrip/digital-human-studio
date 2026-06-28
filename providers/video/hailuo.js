// Hailuo AI / MiniMax Video — image-to-video provider
// Verified against: https://www.minimaxi.com/document/video-generation
// Status: VERIFIED ✅
// Auth: Bearer token from https://www.minimaxi.com/
// Endpoint: api.minimaxi.chat (note: NOT api.minimax.io — different domain)
// Image reference: YES (first_frame_image as data URI, base64 accepted)

import fs from 'fs';

export const META = {
  id: 'hailuo',
  name: 'Hailuo AI / MiniMax Video',
  status: 'verified',
  statusNote: 'Verified against MiniMax Video API. Endpoint is api.minimaxi.chat (not api.minimax.io).',
  getApiKeyUrl: 'https://www.minimaxi.com/user-center/basic-information/interface-key',
  setupNote: 'Sign up at minimaxi.com → User Center → API Key. Use the key as Bearer token.',
  features: {
    textToVideo: true,
    imageToVideo: true,
    identityReference: true,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 6,
    aspectRatios: ['9:16', '16:9', '1:1'],
    identityPreservation: 'low',
  },
  qualityLevel: 3,
  pricingNote: 'Credit-based. Check minimaxi.com for pricing.',
};

export async function generate({ apiKey, imagePath, prompt, aspectRatio = '9:16', durationSec = 6 }) {
  if (!apiKey) throw new Error('Hailuo/MiniMax API key is required.');

  let firstFrameImage = null;
  if (imagePath && fs.existsSync(imagePath)) {
    const mimeType = imagePath.match(/\.png$/i) ? 'image/png' : 'image/jpeg';
    firstFrameImage = `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`;
  }

  const body = {
    model: 'video-01',
    prompt,
    ...(firstFrameImage ? { first_frame_image: firstFrameImage } : {}),
  };

  const res = await fetch('https://api.minimaxi.chat/v1/video_generation', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const task = await res.json();
  if (!res.ok) {
    throw new Error(`Hailuo: task creation failed (${res.status}): ${task.base_resp?.status_msg || JSON.stringify(task).slice(0, 200)}`);
  }
  const taskId = task.task_id;
  if (!taskId) throw new Error(`Hailuo: no task_id in response: ${JSON.stringify(task).slice(0, 200)}`);

  // Poll for completion
  for (let i = 0; i < 72; i++) {
    await sleep(5000);
    const pollRes = await fetch(`https://api.minimaxi.chat/v1/query/video_generation?task_id=${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const t = await pollRes.json();
    const status = t.status;

    if (status === 'Success') {
      const fileId = t.file_id;
      if (!fileId) throw new Error('Hailuo: succeeded but no file_id returned');

      // Retrieve the download URL
      const dlRes = await fetch(`https://api.minimaxi.chat/v1/files/retrieve?file_id=${fileId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const dlData = await dlRes.json();
      const url = dlData.file?.download_url;
      if (!url) throw new Error('Hailuo: could not get download URL from file_id');
      return { videoUrl: url, provider: 'hailuo', level: 3 };
    }
    if (status === 'Fail') {
      throw new Error(`Hailuo: generation failed — ${t.base_resp?.status_msg || 'unknown'}`);
    }
    // status: 'Queueing' or 'Processing' — keep polling
  }
  throw new Error('Hailuo: task timed out after 6 minutes');
}

export async function testConnection(apiKey) {
  try {
    const res = await fetch('https://api.minimaxi.chat/v1/query/video_generation?task_id=test', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) return { ok: false, message: 'Invalid API key' };
    // 400/404 means auth passed but task doesn't exist — that's fine
    if (res.ok || res.status === 400 || res.status === 404) return { ok: true, message: 'Connected to Hailuo/MiniMax API' };
    return { ok: false, message: `Hailuo returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Connection error: ${e.message}` };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
