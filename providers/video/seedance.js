// Seedance (ByteDance) — video generation
// Status: NOT IMPLEMENTED ❌
// Seedance is an internal ByteDance research model.
// There is NO verified public API endpoint for Seedance as of 2026.
// "api.seedance.ai" does not appear to be a real public endpoint.
// This provider is a placeholder — do not use in production.

export const META = {
  id: 'seedance',
  name: 'Seedance (ByteDance)',
  status: 'not_implemented',
  statusNote: 'No verified public API. ByteDance has not released Seedance as a public API service.',
  getApiKeyUrl: null,
  setupNote: 'Seedance is not currently available as a public API. Use Runway, Kling, Luma, or Replicate instead.',
  features: {
    textToVideo: false,
    imageToVideo: false,
    identityReference: false,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 0,
    aspectRatios: [],
    identityPreservation: 'none',
  },
  qualityLevel: 0,
  pricingNote: 'Not available.',
};

export async function generate(options) {
  throw new Error(
    'Seedance is not yet available as a public API. ' +
    'Use Runway, Kling, Luma, Hailuo, or Replicate for real video generation.'
  );
}

export async function testConnection(apiKey) {
  return { ok: false, message: 'Seedance has no public API — this provider is not implemented.' };
}
