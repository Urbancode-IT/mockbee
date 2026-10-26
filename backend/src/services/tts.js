/**
 * Human-like interviewer voice.
 *
 * 1) Microsoft Edge neural voices (@andresaya/edge-tts — current Sec-MS-GEC / v2 endpoint)
 * 2) Gemini neural TTS when Edge fails and quota allows
 *
 * Returns { buffer, mime, provider } for the frontend <audio> player.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const { EdgeTTS } = require('@andresaya/edge-tts');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

const TTS_MODELS = [
  process.env.GEMINI_TTS_MODEL,
  'gemini-2.5-flash-preview-tts',
  'gemini-2.5-pro-preview-tts',
].filter(Boolean);

// Aoede / Neerja: clearer pronunciation than Kore / Aria for interview English.
const TTS_VOICE = process.env.GEMINI_TTS_VOICE || 'Aoede';
const EDGE_VOICE = process.env.EDGE_TTS_VOICE || 'en-IN-NeerjaNeural';

const STYLE =
  'Speak in clear, natural Indian English with careful pronunciation. ' +
  'Warm, professional female interviewer tone, calm pace, no rushed words: ';

const cache = new Map();
const CACHE_MAX = 60;
const TTS_FETCH_MS = Number(process.env.GEMINI_TTS_TIMEOUT_MS) || 7000;

let geminiCooldownUntil = 0;
let edgeClient = null;

function getEdgeClient() {
  if (!edgeClient) edgeClient = new EdgeTTS();
  return edgeClient;
}

function cleanText(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[PHASE_COMPLETE\]/gi, '')
    .replace(/\[INTERVIEW_COMPLETE\]/gi, '')
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 900);
}

function pcmToWav(pcm, sampleRate = 24000) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function callGeminiTts(model, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_FETCH_MS);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${STYLE}${text}` }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: TTS_VOICE },
            },
          },
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    const err = new Error(`Gemini TTS ${model} failed (${res.status}): ${detail.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find((p) => p.inlineData?.data);
  if (!audioPart) throw new Error(`Gemini TTS ${model} returned no audio`);
  const mime = audioPart.inlineData.mimeType || 'audio/L16;codec=pcm;rate=24000';
  const rateMatch = /rate=(\d+)/.exec(mime);
  const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
  const pcm = Buffer.from(audioPart.inlineData.data, 'base64');
  return { buffer: pcmToWav(pcm, sampleRate), mime: 'audio/wav', provider: 'gemini' };
}

async function callEdgeTts(text) {
  const tts = getEdgeClient();
  const result = await tts.generate(text, EDGE_VOICE, {
    rate: '-2%',
    pitch: '+0Hz',
    volume: '+0%',
  });
  const audio = result?.audio;
  const buffer = Buffer.isBuffer(audio) ? audio : Buffer.from(audio || []);
  if (!buffer.length) throw new Error('Edge TTS returned empty audio');
  return { buffer, mime: 'audio/mpeg', provider: 'edge' };
}

async function synthGemini(text) {
  if (!GEMINI_API_KEY || Date.now() < geminiCooldownUntil) return null;
  const model = TTS_MODELS[0];
  if (!model) return null;
  try {
    return await callGeminiTts(model, text);
  } catch (e) {
    if (e.status === 429 || e.status === 403) {
      geminiCooldownUntil = Date.now() + 10 * 60 * 1000;
    }
    console.warn('[tts] Gemini unavailable:', e.message);
    return null;
  }
}

/** Returns { buffer, mime, provider }, or throws when nothing is available. */
async function synthSpeech(rawText) {
  const text = cleanText(rawText);
  if (!text) return null;

  const cacheKey = `${TTS_VOICE}|${EDGE_VOICE}:${text}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  let result = null;
  try {
    result = await callEdgeTts(text);
  } catch (e) {
    console.warn('[tts] Edge unavailable:', e.message);
    // Recreate client once — handshake / clock skew recovery
    edgeClient = null;
    try {
      result = await callEdgeTts(text);
    } catch (e2) {
      console.warn('[tts] Edge retry failed:', e2.message);
      result = await synthGemini(text);
    }
  }
  if (!result) throw new Error('Human voice synthesis failed');

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey, result);
  return result;
}

function ttsStatus() {
  return {
    provider: GEMINI_API_KEY ? 'edge+gemini' : 'edge',
    configured: true,
    gemini: Boolean(GEMINI_API_KEY),
    geminiCooldown: Date.now() < geminiCooldownUntil,
    voice: TTS_VOICE,
    edgeVoice: EDGE_VOICE,
    models: TTS_MODELS,
    note: 'Human neural voice via Microsoft Edge Neerja en-IN (primary), Gemini Aoede fallback.',
  };
}

module.exports = { synthSpeech, ttsStatus, TTS_VOICE };
