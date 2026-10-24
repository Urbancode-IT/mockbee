import { API_BASE } from '../config/api'
import { cleanSpeechText, stopNaturalSpeech } from './naturalSpeech'

/**
 * Human-like interviewer voice via backend neural TTS (Gemini / Edge).
 * Returns false when playback fails (e.g. autoplay blocked before unlock).
 */

let audioEl = null
let finishCurrent = null
let unlocked = false
let pendingPlay = null
const cache = new Map()
const CACHE_MAX = 40

const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA='

function getAudioEl() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
    audioEl.setAttribute('playsinline', 'true')
  }
  return audioEl
}

function clearPendingPlay() {
  if (!pendingPlay) return
  document.removeEventListener('pointerdown', pendingPlay.onGesture, true)
  document.removeEventListener('keydown', pendingPlay.onGesture, true)
  pendingPlay = null
}

/** Call from a real click/tap so later async audio.play() is allowed. */
export function unlockHumanVoice() {
  try {
    const el = getAudioEl()
    el.muted = false
    el.volume = 1
    el.src = SILENT_WAV
    const p = el.play()
    if (p && typeof p.then === 'function') {
      return p
        .then(() => {
          unlocked = true
          el.pause()
          try {
            el.currentTime = 0
          } catch {
            /* ignore */
          }
          return true
        })
        .catch(() => false)
    }
    unlocked = true
    el.pause()
    return Promise.resolve(true)
  } catch {
    return Promise.resolve(false)
  }
}

export function stopHumanVoice() {
  clearPendingPlay()
  if (finishCurrent) {
    const finish = finishCurrent
    finishCurrent = null
    finish(false)
  }
  try {
    audioEl?.pause()
  } catch {
    /* ignore */
  }
}

function playUrl(url, onStart) {
  return new Promise((resolve) => {
    const el = getAudioEl()
    let settled = false
    const finish = (ok) => {
      if (settled) return
      settled = true
      clearPendingPlay()
      if (finishCurrent === finish) finishCurrent = null
      resolve(ok)
    }
    finishCurrent = finish

    const tryPlay = () => {
      el.muted = false
      el.volume = 1
      el.src = url
      el.load()
      el.onplay = () => {
        unlocked = true
        onStart?.()
      }
      el.onended = () => finish(true)
      el.onerror = () => finish(false)
      const p = el.play()
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // Autoplay blocked — wait for the next user tap/key, then play.
          clearPendingPlay()
          const onGesture = () => {
            clearPendingPlay()
            el.muted = false
            el.volume = 1
            el.play()
              .then(() => {
                unlocked = true
                onStart?.()
              })
              .catch(() => finish(false))
          }
          pendingPlay = { onGesture }
          document.addEventListener('pointerdown', onGesture, true)
          document.addEventListener('keydown', onGesture, true)
        })
      }
    }

    tryPlay()
  })
}

export function speakHuman(text, { muted = false, onStart, timeoutMs = 25000 } = {}) {
  const clean = cleanSpeechText(text)
  if (muted || !clean) return Promise.resolve(false)

  stopHumanVoice()
  stopNaturalSpeech()
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }

  return (async () => {
    let url = cache.get(clean)
    if (!url) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), Math.max(8000, timeoutMs))
      let res
      try {
        res = await fetch(`${API_BASE}/api/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: clean }),
          signal: controller.signal,
        })
      } finally {
        clearTimeout(timer)
      }
      if (!res.ok) throw new Error(`Human voice failed (${res.status})`)
      const mime = res.headers.get('content-type') || 'audio/mpeg'
      const buf = await res.arrayBuffer()
      if (!buf.byteLength) throw new Error('Human voice returned empty audio')
      const blob = new Blob([buf], { type: mime })
      url = URL.createObjectURL(blob)
      if (cache.size >= CACHE_MAX) {
        const [oldKey, oldUrl] = cache.entries().next().value
        cache.delete(oldKey)
        URL.revokeObjectURL(oldUrl)
      }
      cache.set(clean, url)
    }

    // If never unlocked, try a silent unlock first (works only inside a gesture).
    if (!unlocked) {
      await unlockHumanVoice()
    }

    return playUrl(url, onStart)
  })().catch((err) => {
    console.warn('Human voice unavailable', err)
    return false
  })
}

export function isHumanVoiceUnlocked() {
  return unlocked
}
