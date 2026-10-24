/**
 * Provider abstractions for AI, speech, and avatar services.
 * Browser STT/TTS remain the default for voice; these stubs allow
 * swapping in Whisper / Azure / HeyGen / D-ID later via env config.
 */

const mocker = require('../services/mocker');

const DEMO_MODE = !mocker.GEMINI_API_KEY;

function aiStatus() {
  return {
    provider: DEMO_MODE ? 'demo' : 'gemini',
    configured: Boolean(mocker.GEMINI_API_KEY),
    demo_mode: DEMO_MODE,
    models: mocker.MODELS,
  };
}

function speechStatus() {
  const stt = process.env.SPEECH_STT_PROVIDER || 'browser';
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);
  const ttsProvider = process.env.SPEECH_TTS_PROVIDER || (hasGemini ? 'gemini' : 'browser');
  return {
    stt: { provider: stt, configured: stt === 'browser' || Boolean(process.env.SPEECH_STT_API_KEY) },
    tts: {
      provider: ttsProvider,
      configured: ttsProvider === 'gemini' ? hasGemini : ttsProvider === 'browser' || Boolean(process.env.SPEECH_TTS_API_KEY),
      voice: process.env.GEMINI_TTS_VOICE || 'Kore',
    },
    note: hasGemini
      ? 'Interviewer voice: human-like Gemini neural TTS (browser TTS is fallback only). STT runs in the browser.'
      : 'Primary STT/TTS runs in the browser. Set GEMINI_API_KEY for a human-like voice.',
  };
}

function avatarStatus() {
  const provider = process.env.AVATAR_PROVIDER || 'fallback';
  const configured = provider !== 'fallback' && Boolean(process.env.AVATAR_API_KEY);
  return {
    provider: configured ? provider : 'fallback',
    configured,
    lip_sync_supported: configured,
    label: 'AI Interviewer',
    note: configured
      ? 'Realtime avatar API configured.'
      : 'Using visual fallback avatar (video + browser TTS + captions).',
  };
}

function platformStatus() {
  return {
    ai: aiStatus(),
    speech: speechStatus(),
    avatar: avatarStatus(),
    demo_mode: DEMO_MODE,
  };
}

module.exports = {
  DEMO_MODE,
  aiStatus,
  speechStatus,
  avatarStatus,
  platformStatus,
};
