// Synthetic face image generation — dispatcher
// Providers: openai (DALL-E 3), stability, fal, replicate
// All verified against their current APIs.

export const IMAGE_PROVIDERS = {
  openai: {
    name: 'OpenAI DALL-E 3',
    status: 'verified',
    getApiKeyUrl: 'https://platform.openai.com/api-keys',
    setupNote: 'Use your OpenAI API key. DALL-E 3 generates high-quality, realistic face portraits.',
    pricingNote: '~$0.04–0.12 per image.',
  },
  stability: {
    name: 'Stability AI',
    status: 'verified',
    getApiKeyUrl: 'https://platform.stability.ai/account/keys',
    setupNote: 'Use your Stability AI key. Generates realistic face images via Stable Diffusion Ultra.',
    pricingNote: 'Credit-based. Check platform.stability.ai for pricing.',
  },
  fal: {
    name: 'FAL (FLUX)',
    status: 'verified',
    getApiKeyUrl: 'https://fal.ai/dashboard/keys',
    setupNote: 'Use your FAL API key. Runs FLUX models for high-quality portrait generation.',
    pricingNote: 'Pay per image. Check fal.ai for pricing.',
  },
  replicate: {
    name: 'Replicate (FLUX)',
    status: 'verified',
    getApiKeyUrl: 'https://replicate.com/account/api-tokens',
    setupNote: 'Use your Replicate token. Uses FLUX Schnell for fast, realistic portrait generation.',
    pricingNote: 'Pay per prediction. Very low cost for image generation.',
  },
};

export function getImageProviderManifest() {
  return Object.entries(IMAGE_PROVIDERS).map(([id, meta]) => ({ id, ...meta }));
}

export async function generateFaceImage(provider, apiKey, { appearance, gender, ageRange, style }) {
  if (!provider || provider === 'none') return null;
  if (!apiKey) throw new Error(`Image provider "${provider}" requires an API key`);

  const prompt = buildFacePrompt({ appearance, gender, ageRange, style });

  switch (provider) {
    case 'openai':   return generateWithOpenAI(apiKey, prompt);
    case 'stability': return generateWithStability(apiKey, prompt);
    case 'fal':      return generateWithFal(apiKey, prompt);
    case 'replicate': return generateWithReplicate(apiKey, prompt);
    default: throw new Error(`Unknown image provider: ${provider}`);
  }
}

function buildFacePrompt({ appearance, gender, ageRange, style }) {
  const parts = [
    'Professional portrait photo, photorealistic headshot.',
    appearance,
    gender ? `Gender: ${gender}.` : '',
    ageRange ? `Age range: ${ageRange}.` : '',
    style ? `Style: ${style}.` : '',
    'Sharp focus, good lighting, neutral or studio background, high detail, ultra realistic.',
  ].filter(Boolean);
  return parts.join(' ');
}

async function generateWithOpenAI(apiKey, prompt) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      response_format: 'b64_json',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`OpenAI image gen failed: ${data.error?.message || res.status}`);
  const b64 = data.data?.[0]?.b64_json;
  if (!b64) throw new Error('OpenAI: no image data in response');
  return Buffer.from(b64, 'base64');
}

async function generateWithStability(apiKey, prompt) {
  const form = new FormData();
  form.append('prompt', prompt);
  form.append('output_format', 'jpeg');
  form.append('aspect_ratio', '1:1');
  const res = await fetch('https://api.stability.ai/v2beta/stable-image/generate/ultra', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'image/*' },
    body: form,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Stability AI failed (${res.status}): ${err.slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function generateWithFal(apiKey, prompt) {
  const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`FAL image gen failed (${res.status}): ${data.message || JSON.stringify(data).slice(0, 200)}`);
  const url = data.images?.[0]?.url;
  if (!url) throw new Error('FAL: no image URL in response');
  const imgRes = await fetch(url);
  return Buffer.from(await imgRes.arrayBuffer());
}

async function generateWithReplicate(apiKey, prompt) {
  const res = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions', {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'application/json', Prefer: 'wait=60' },
    body: JSON.stringify({ input: { prompt, aspect_ratio: '1:1', output_format: 'jpg', num_outputs: 1 } }),
  });
  const task = await res.json();
  if (!res.ok || !task.id) throw new Error(`Replicate image gen failed (${res.status}): ${task.detail || JSON.stringify(task).slice(0, 200)}`);

  if (task.status === 'succeeded' && task.output) {
    const url = Array.isArray(task.output) ? task.output[0] : task.output;
    const r = await fetch(url); return Buffer.from(await r.arrayBuffer());
  }

  // Poll if not immediately done
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const p = await fetch(`https://api.replicate.com/v1/predictions/${task.id}`, { headers: { Authorization: `Token ${apiKey}` } });
    const t = await p.json();
    if (t.status === 'succeeded' && t.output) {
      const url = Array.isArray(t.output) ? t.output[0] : t.output;
      const r = await fetch(url); return Buffer.from(await r.arrayBuffer());
    }
    if (t.status === 'failed') throw new Error(`Replicate image gen failed: ${t.error}`);
  }
  throw new Error('Replicate image gen timed out');
}
