// Pika Labs — video generation provider
// Status: NOT VERIFIED ⚠️ — API in limited/closed beta
// Pika's v2.0+ API requires special developer access (not open to all).
// Their v1.5 public API has limited documentation.
// This implementation is BEST-EFFORT based on available docs.
// Do not use in production until officially verified.

export const META = {
  id: 'pika',
  name: 'Pika Labs',
  status: 'partial',
  statusNote: 'API in limited access beta. Endpoint unverified — do not rely on this in production.',
  getApiKeyUrl: 'https://pika.art/api',
  setupNote: 'Pika API access is limited. Apply at pika.art/api. If you have access, paste your Bearer token.',
  features: {
    textToVideo: true,
    imageToVideo: true,
    identityReference: false,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 10,
    aspectRatios: ['9:16', '16:9', '1:1'],
    identityPreservation: 'none',
  },
  qualityLevel: 3,
  pricingNote: 'Subscription-based. Check pika.art for pricing.',
};

export async function generate({ apiKey, imagePath, prompt, aspectRatio = '9:16', durationSec = 6 }) {
  throw new Error(
    'Pika API is not publicly available. This provider requires special developer access from pika.art. ' +
    'Configure a verified provider (Runway, Kling, Luma, Hailuo, or Replicate) instead.'
  );
}

export async function testConnection(apiKey) {
  return { ok: false, message: 'Pika API is not currently available for open integration. Apply for access at pika.art/api.' };
}
