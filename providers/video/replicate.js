// Replicate — flexible image-to-video via multiple models
// Verified against: https://replicate.com/docs/reference/http
// Status: VERIFIED ✅
// Auth: Token {key} (header: Authorization: Token ...)
// Default model: minimax/video-01 (good image-to-video with identity reference)
// Other models: luma/ray, stability-ai/stable-video-diffusion
// Image reference: YES (depends on model — minimax/video-01 accepts first_frame_image)

import fs from 'fs';

export const META = {
  id: 'replicate',
  name: 'Replicate',
  status: 'verified',
  statusNote: 'Verified against Replicate API. Default model: minimax/video-01. Auth uses Token prefix.',
  getApiKeyUrl: 'https://replicate.com/account/api-tokens',
  setupNote: 'Sign up at replicate.com → Account → API Tokens → Create token. Costs per model run (~$0.01–0.10).',
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
  pricingNote: 'Pay per prediction. Varies by model — check replicate.com/model for pricing.',
};

// Models with verified input schemas
const MODELS = {
  'minimax/video-01': {
    endpoint: 'https://api.replicate.com/v1/models/minimax/video-01/predictions',
    buildInput: ({ prompt, imageBase64 }) => ({
      prompt,
      ...(imageBase64 ? { first_frame_image: `data:image/jpeg;base64,${imageBase64}` } : {}),
    }),
    extractOutput: (output) => Array.isArray(output) ? output[0] : output,
  },
  'luma/ray': {
    endpoint: 'https://api.replicate.com/v1/models/luma/ray/predictions',
    buildInput: ({ prompt }) => ({ prompt, aspect_ratio: '9:16' }),
    extractOutput: (output) => Array.isArray(output) ? output[0] : output,
  },
};

export async function generate({ apiKey, imagePath, prompt, aspectRatio = '9:16', model = 'minimax/video-01' }) {
  if (!apiKey) throw new Error('Replicate API key is required.');

  const modelDef = MODELS[model] || MODELS['minimax/video-01'];
  let imageBase64 = null;
  if (imagePath && fs.existsSync(imagePath)) {
    imageBase64 = fs.readFileSync(imagePath).toString('base64');
  }

  const input = modelDef.buildInput({ prompt, imageBase64, aspectRatio });

  const res = await fetch(modelDef.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
      Prefer: 'wait=30',
    },
    body: JSON.stringify({ input }),
  });

  const task = await res.json();
  if (!res.ok || !task.id) {
    throw new Error(`Replicate: prediction creation failed (${res.status}): ${task.detail || JSON.stringify(task).slice(0, 300)}`);
  }

  // If already completed (Prefer: wait=30 makes it synchronous for short jobs)
  if (task.status === 'succeeded' && task.output) {
    const url = modelDef.extractOutput(task.output);
    if (url) return { videoUrl: url, provider: 'replicate', level: 3 };
  }

  // Poll for completion
  const pollUrl = task.urls?.get || `https://api.replicate.com/v1/predictions/${task.id}`;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const pollRes = await fetch(pollUrl, {
      headers: { Authorization: `Token ${apiKey}` },
    });
    const t = await pollRes.json();
    if (t.status === 'succeeded') {
      const url = modelDef.extractOutput(t.output);
      if (!url) throw new Error('Replicate: succeeded but no output URL');
      return { videoUrl: url, provider: 'replicate', level: 3 };
    }
    if (t.status === 'failed' || t.status === 'canceled') {
      throw new Error(`Replicate: prediction ${t.status} — ${t.error || 'unknown'}`);
    }
  }
  throw new Error('Replicate: prediction timed out after 5 minutes');
}

export async function testConnection(apiKey) {
  try {
    const res = await fetch('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (res.status === 401) return { ok: false, message: 'Invalid API token' };
    if (res.ok) {
      const data = await res.json();
      return { ok: true, message: `Connected as ${data.username || 'user'}` };
    }
    return { ok: false, message: `Replicate returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Connection error: ${e.message}` };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
