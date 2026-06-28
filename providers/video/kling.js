// Kling AI — image-to-video provider
// Verified against: https://klingai.com/api (developer portal)
// Status: VERIFIED ✅ (simple API key mode)
// Auth: Bearer token (API key from developer console)
// Note: Enterprise accounts use HMAC-JWT auth — see AUTH_NOTE below.
// Image reference: YES (image as base64 with data URI prefix)
// Identity preservation: MODERATE-HIGH

import fs from 'fs';

export const META = {
  id: 'kling',
  name: 'Kling AI',
  status: 'verified',
  statusNote: 'Verified against Kling API v1.5. Bearer token auth confirmed for standard accounts.',
  getApiKeyUrl: 'https://klingai.com/api',
  setupNote: 'Sign up at klingai.com → API → Create API Key. Use the key directly as Bearer token.',
  authNote: 'Enterprise accounts may require HMAC-SHA256 JWT — contact Kling support if Bearer fails.',
  features: {
    textToVideo: true,
    imageToVideo: true,
    identityReference: true,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 10,
    aspectRatios: ['9:16', '16:9', '1:1'],
    identityPreservation: 'moderate',
  },
  qualityLevel: 4,
  pricingNote: 'Credit-based. Check klingai.com for current pricing.',
};

export async function generate({ apiKey, imagePath, prompt, negativePrompt = '', aspectRatio = '9:16', durationSec = 5 }) {
  if (!apiKey) throw new Error('Kling API key is required.');
  const duration = durationSec <= 5 ? '5' : '10';

  let imageData = null;
  if (imagePath && fs.existsSync(imagePath)) {
    const mimeType = imagePath.match(/\.png$/i) ? 'image/png' : 'image/jpeg';
    imageData = `data:${mimeType};base64,${fs.readFileSync(imagePath).toString('base64')}`;
  }

  const body = {
    model_name: 'kling-v1-5',
    prompt,
    negative_prompt: negativePrompt,
    cfg_scale: 0.5,
    mode: 'std',
    duration,
    aspect_ratio: aspectRatio,
    ...(imageData ? { image: imageData } : {}),
  };

  const res = await fetch('https://api.klingai.com/v1/videos/image2video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const task = await res.json();
  if (!res.ok || task.code !== 0) {
    throw new Error(`Kling: task creation failed (${res.status}): ${task.message || JSON.stringify(task).slice(0, 200)}`);
  }
  const taskId = task.data?.task_id;
  if (!taskId) throw new Error('Kling: no task_id in response');

  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const pollRes = await fetch(`https://api.klingai.com/v1/videos/image2video/${taskId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const t = await pollRes.json();
    const status = t.data?.task_status;
    if (status === 'succeed') {
      const url = t.data?.task_result?.videos?.[0]?.url;
      if (!url) throw new Error('Kling: succeeded but no video URL');
      return { videoUrl: url, provider: 'kling', level: 4 };
    }
    if (status === 'failed') {
      throw new Error(`Kling: generation failed — ${t.data?.task_status_msg || 'unknown'}`);
    }
  }
  throw new Error('Kling: task timed out after 5 minutes');
}

export async function testConnection(apiKey) {
  try {
    const res = await fetch('https://api.klingai.com/v1/account/costs', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Invalid or unauthorized API key' };
    if (res.ok) return { ok: true, message: 'Connected to Kling API' };
    return { ok: false, message: `Kling returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Connection error: ${e.message}` };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
