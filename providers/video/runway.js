// Runway Gen-3 Alpha / Gen-4 Turbo — image-to-video provider
// Verified against: https://dev.runwayml.com/docs/api-reference
// Status: VERIFIED ✅
// Auth: Bearer token from https://dev.runwayml.com/
// Image reference: YES (promptImage as base64 data URI)
// Identity preservation: MODERATE (face used as visual reference, not locked)
// Note: Audio must be muxed in separately after generation.

import fs from 'fs';

export const META = {
  id: 'runway',
  name: 'Runway Gen-3 / Gen-4',
  status: 'verified',
  statusNote: 'Verified against Runway API v2024-11-06. Endpoint and auth confirmed.',
  getApiKeyUrl: 'https://dev.runwayml.com/',
  setupNote: 'Sign up at dev.runwayml.com, create an API key under Account → API Keys.',
  features: {
    textToVideo: true,
    imageToVideo: true,
    identityReference: true,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 10,
    aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
    identityPreservation: 'moderate',
  },
  qualityLevel: 4,
  pricingNote: 'Credits consumed per generation. ~$0.05–0.25 per video.',
};

// Ratio map: app format → Runway API format
const RATIO_MAP = {
  '9:16':  '768:1280',
  '16:9':  '1280:768',
  '1:1':   '960:960',
  '4:3':   '1104:832',
  '3:4':   '832:1104',
};

export async function generate({ apiKey, imagePath, prompt, aspectRatio = '9:16', durationSec = 8 }) {
  if (!apiKey) throw new Error('Runway API key is required.');
  const ratio = RATIO_MAP[aspectRatio] || '768:1280';
  const duration = durationSec <= 5 ? 5 : 10;

  let imageBase64 = null;
  let mimeType = 'image/jpeg';
  if (imagePath && fs.existsSync(imagePath)) {
    imageBase64 = fs.readFileSync(imagePath).toString('base64');
    mimeType = imagePath.match(/\.png$/i) ? 'image/png' : 'image/jpeg';
  }

  const body = {
    model: 'gen4_turbo',
    ratio,
    duration,
    ...(imageBase64 ? {
      promptImage: `data:${mimeType};base64,${imageBase64}`,
      promptText: prompt,
    } : {
      promptText: prompt,
    }),
  };

  const res = await fetch('https://api.dev.runwayml.com/v1/image_to_video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Runway-Version': '2024-11-06',
    },
    body: JSON.stringify(body),
  });

  const task = await res.json();
  if (!res.ok || !task.id) {
    throw new Error(`Runway: task creation failed (${res.status}): ${JSON.stringify(task).slice(0, 300)}`);
  }

  // Poll up to 5 minutes
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const pollRes = await fetch(`https://api.dev.runwayml.com/v1/tasks/${task.id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
    });
    const t = await pollRes.json();
    if (t.status === 'SUCCEEDED') {
      const url = t.output?.[0];
      if (!url) throw new Error('Runway: task succeeded but output URL is missing');
      return { videoUrl: url, provider: 'runway', level: 4 };
    }
    if (t.status === 'FAILED') {
      throw new Error(`Runway: generation failed — ${t.failure || t.failureCode || 'unknown reason'}`);
    }
  }
  throw new Error('Runway: task timed out after 5 minutes');
}

export async function testConnection(apiKey) {
  const res = await fetch('https://api.dev.runwayml.com/v1/tasks', {
    headers: { Authorization: `Bearer ${apiKey}`, 'X-Runway-Version': '2024-11-06' },
  });
  if (res.status === 401) return { ok: false, message: 'Invalid API key' };
  if (res.ok || res.status === 200) return { ok: true, message: 'Connected to Runway API' };
  return { ok: false, message: `Runway returned HTTP ${res.status}` };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
