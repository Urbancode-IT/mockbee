/**
 * Modular avatar provider. Swap AVATAR_PROVIDER / realtime APIs later
 * without rewriting interview rooms. Fallback uses video + browser TTS.
 */

export const AVATAR_LABEL = 'AI Interviewer'

export function getAvatarConfig(platformStatus) {
  const avatar = platformStatus?.avatar || {}
  return {
    provider: avatar.provider || 'fallback',
    configured: Boolean(avatar.configured),
    lipSyncSupported: Boolean(avatar.lip_sync_supported),
    label: avatar.label || AVATAR_LABEL,
    note: avatar.note || 'Visual fallback avatar with browser TTS and captions.',
  }
}

export function createAvatarController({ speak, stopSpeak } = {}) {
  return {
    async say(text, { onStart, onEnd } = {}) {
      onStart?.()
      if (typeof speak === 'function') {
        await speak(text)
      }
      onEnd?.()
    },
    stop() {
      stopSpeak?.()
    },
  }
}
