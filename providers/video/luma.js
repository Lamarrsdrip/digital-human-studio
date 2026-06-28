// Luma Dream Machine (Ray) — image-to-video provider
// Verified against: https://lumalabs.ai/dream-machine/api/docs
// Status: VERIFIED ✅
// Auth: Bearer token from https://lumalabs.ai/dream-machine/api
// Image reference: REQUIRES PUBLIC URL (not base64) — see note below
// Note: Luma keyframes require a publicly accessible image URL.
//       Set SERVER_PUBLIC_URL in settings so the app can serve face images publicly.
//       If not set, generation runs as text-to-video only.

import fs from 'fs';

export const META = {
  id: 'luma',
  name: 'Luma Dream Machine (Ray)',
  status: 'verified',
  statusNote: 'Verified against Luma API v1. Image keyframes require public URL — see setup note.',
  getApiKeyUrl: 'https://lumalabs.ai/dream-machine/api',
  setupNote: 'Sign up at lumalabs.ai → Dream Machine → API. Copy your API key. Also set SERVER_PUBLIC_URL in settings for image reference to work.',
  features: {
    textToVideo: true,
    imageToVideo: true,
    identityReference: true,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 9,
    aspectRatios: ['9:16', '16:9', '1:1', '4:3', '3:4'],
    identityPreservation: 'low',
  },
  qualityLevel: 3,
  pricingNote: 'Subscription + credit-based. Check lumalabs.ai for pricing.',
  imageUrlRequired: true,
};

export async function generate({ apiKey, imagePath, imagePublicUrl, prompt, aspectRatio = '9:16', durationSec = 9 }) {
  if (!apiKey) throw new Error('Luma API key is required.');

  // Luma keyframes need a public URL — cannot use base64
  const hasImageRef = !!(imagePublicUrl || (imagePath && fs.existsSync(imagePath)));

  const body = {
    prompt,
    model: 'ray-2',
    aspect_ratio: aspectRatio,
    loop: false,
    ...(imagePublicUrl ? {
      keyframes: {
        frame0: { type: 'image', url: imagePublicUrl },
      },
    } : {}),
  };

  // If we have an imagePath but no public URL, warn in the console — run text-to-video
  if (imagePath && !imagePublicUrl) {
    console.warn('[luma] Image reference skipped — SERVER_PUBLIC_URL not set. Running text-to-video only.');
  }

  const res = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const task = await res.json();
  if (!res.ok || !task.id) {
    throw new Error(`Luma: task creation failed (${res.status}): ${JSON.stringify(task).slice(0, 300)}`);
  }

  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const pollRes = await fetch(`https://api.lumalabs.ai/dream-machine/v1/generations/${task.id}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    const t = await pollRes.json();
    if (t.state === 'completed') {
      const url = t.assets?.video;
      if (!url) throw new Error('Luma: completed but no video URL in assets');
      return {
        videoUrl: url,
        provider: 'luma',
        level: imagePublicUrl ? 3 : 2,
        note: imagePublicUrl ? undefined : 'Text-to-video only (no image reference — set SERVER_PUBLIC_URL)',
      };
    }
    if (t.state === 'failed') {
      throw new Error(`Luma: generation failed — ${t.failure_reason || 'unknown'}`);
    }
  }
  throw new Error('Luma: task timed out after 5 minutes');
}

export async function testConnection(apiKey) {
  try {
    const res = await fetch('https://api.lumalabs.ai/dream-machine/v1/generations?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (res.status === 401) return { ok: false, message: 'Invalid API key' };
    if (res.ok) return { ok: true, message: 'Connected to Luma API' };
    return { ok: false, message: `Luma returned HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Connection error: ${e.message}` };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
