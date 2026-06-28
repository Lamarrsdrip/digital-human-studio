// Google Veo 2 — text-to-video via Vertex AI
// Status: PARTIAL ⚠️ — requires complex GCP setup, not a simple API key
// Verified endpoint structure from: https://cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos
// Auth: OAuth2 Bearer token (NOT a simple API key — requires service account or gcloud auth)
// Note: You need a GCP project with Vertex AI enabled + Veo allowlisted.
//       The GOOGLE_PROJECT_ID and GOOGLE_REGION settings are required.
//       The API key in settings must be a valid OAuth2 access token.
// Image reference: Limited — Veo 2 is primarily text-to-video.

export const META = {
  id: 'veo',
  name: 'Veo 2 (Google Vertex AI)',
  status: 'partial',
  statusNote: 'Complex GCP setup required. Not a simple API key — needs OAuth2 token + GCP project.',
  getApiKeyUrl: 'https://console.cloud.google.com/vertex-ai',
  setupNote: `
Setup required:
1. Go to console.cloud.google.com and create/select a project
2. Enable Vertex AI API + request Veo access (waitlisted)
3. Create a service account → download JSON key
4. Run: gcloud auth print-access-token to get a Bearer token
5. Set GOOGLE_PROJECT_ID in settings (your GCP project ID)
6. Set GOOGLE_REGION (e.g. us-central1)
7. The "API Key" field accepts the OAuth2 access token (expires hourly — use gcloud auth)
This is NOT suitable for simple deployment — recommend Runway/Kling/Luma instead.
  `.trim(),
  features: {
    textToVideo: true,
    imageToVideo: false,
    identityReference: false,
    lipsync: false,
    audioSupport: false,
    maxDurationSec: 8,
    aspectRatios: ['9:16', '16:9'],
    identityPreservation: 'none',
  },
  qualityLevel: 3,
  pricingNote: 'GCP Vertex AI pricing. Check cloud.google.com/vertex-ai/pricing.',
};

export async function generate({ apiKey, projectId, region = 'us-central1', prompt, aspectRatio = '9:16' }) {
  if (!apiKey) throw new Error('Veo requires a Google OAuth2 access token.');
  if (!projectId) throw new Error('Veo requires GOOGLE_PROJECT_ID — set it in Settings → Advanced.');

  const endpoint = `https://${region}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${region}/publishers/google/models/veo-002:predictLongRunning`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      aspectRatio: aspectRatio === '9:16' ? '9:16' : '16:9',
      sampleCount: 1,
      durationSeconds: 8,
    },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const task = await res.json();
  if (!res.ok || !task.name) {
    throw new Error(`Veo: task creation failed (${res.status}): ${task.error?.message || JSON.stringify(task).slice(0, 300)}`);
  }

  // Poll operation
  const opEndpoint = `https://${region}-aiplatform.googleapis.com/v1/${task.name}`;
  for (let i = 0; i < 60; i++) {
    await sleep(5000);
    const pollRes = await fetch(opEndpoint, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const t = await pollRes.json();
    if (t.done) {
      if (t.error) throw new Error(`Veo: operation failed — ${t.error.message}`);
      const videoB64 = t.response?.videos?.[0]?.bytesBase64Encoded;
      if (!videoB64) throw new Error('Veo: completed but no video data in response');
      return { videoBuffer: Buffer.from(videoB64, 'base64'), provider: 'veo', level: 3 };
    }
  }
  throw new Error('Veo: operation timed out after 5 minutes');
}

export async function testConnection(apiKey) {
  return {
    ok: false,
    message: 'Veo requires GCP setup with OAuth2 — cannot test with a simple connection check. See setup instructions.',
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
