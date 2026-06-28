// Video provider dispatcher — single entry point for all video generation
import * as runway   from './runway.js';
import * as kling    from './kling.js';
import * as luma     from './luma.js';
import * as hailuo   from './hailuo.js';
import * as replicate from './replicate.js';
import * as pika     from './pika.js';
import * as veo      from './veo.js';
import * as seedance from './seedance.js';
import fs from 'fs';

export const PROVIDERS = { runway, kling, luma, hailuo, replicate, pika, veo, seedance };

// Summary of all providers for the settings UI
export function getProviderManifest() {
  return Object.values(PROVIDERS).map(p => ({
    ...p.META,
    available: p.META.status === 'verified',
    partial: p.META.status === 'partial',
    notImplemented: p.META.status === 'not_implemented',
  }));
}

// Returns the best verified providers only (for "select a provider" UI)
export function getVerifiedProviders() {
  return Object.values(PROVIDERS)
    .filter(p => p.META.status === 'verified' || p.META.status === 'partial')
    .map(p => p.META);
}

// Main generate function — downloads video to outputPath
export async function generateVideo(providerName, options) {
  const provider = PROVIDERS[providerName];
  if (!provider) throw new Error(`Unknown video provider: "${providerName}". Valid: ${Object.keys(PROVIDERS).join(', ')}`);

  if (provider.META.status === 'not_implemented') {
    throw new Error(
      `${provider.META.name} is not implemented. ` +
      (provider.META.setupNote || 'Use a different provider.')
    );
  }
  if (provider.META.status === 'partial') {
    throw new Error(
      `${provider.META.name} is marked as partial/unverified: ${provider.META.statusNote}`
    );
  }

  const result = await provider.generate(options);

  // If provider returns a video URL, download it to outputPath
  if (result.videoUrl && options.outputPath) {
    const res = await fetch(result.videoUrl);
    if (!res.ok) throw new Error(`Failed to download video from ${providerName}: HTTP ${res.status}`);
    fs.writeFileSync(options.outputPath, Buffer.from(await res.arrayBuffer()));
  }

  // If provider returns a buffer directly (e.g. Veo)
  if (result.videoBuffer && options.outputPath) {
    fs.writeFileSync(options.outputPath, result.videoBuffer);
  }

  return result;
}

// Test provider connection
export async function testProviderConnection(providerName, apiKey) {
  const provider = PROVIDERS[providerName];
  if (!provider) return { ok: false, message: `Unknown provider: ${providerName}` };
  if (provider.META.status === 'not_implemented') return { ok: false, message: provider.META.statusNote };
  return provider.testConnection(apiKey);
}
