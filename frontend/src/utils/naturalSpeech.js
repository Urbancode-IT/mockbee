/**
 * Natural-sounding browser TTS for the AI interviewer avatar.
 * Prefers neural / natural female voices to match the on-screen interviewer.
 */

let cachedVoice = null
let voicesReady = false
let audioUnlocked = false

function scoreVoice(voice, preferredLang = 'en') {
  const name = `${voice.name || ''} ${voice.voiceURI || ''}`.toLowerCase()
  const lang = (voice.lang || '').toLowerCase()
  let score = 0

  if (lang.startsWith(preferredLang)) score += 40
  else if (lang.startsWith('en')) score += 25

  if (/(neural|natural|premium|enhanced|wavenet|studio)/.test(name)) score += 55
  if (/(google|microsoft|apple)/.test(name)) score += 22
  // Match the female video avatar
  if (/(female|zira|aria|jenny|sonia|neerja|samantha|susan|hazel|karen|moira|veena|heera)/.test(name)) {
    score += 35
  }
  if (/(male|david|mark|ravi|guy|ryan|george)\b/.test(name)) score -= 10
  if (/(compact|eloquence|robot|espeak)/.test(name)) score -= 40
  if (voice.localService) score += 5

  if (lang.includes('en-in') || name.includes('india') || name.includes('neerja') || name.includes('veena')) {
    score += 20
  }

  return score
}

export function pickNaturalVoice(preferredLang = 'en-IN') {
  if (!window.speechSynthesis) return null
  const voices = window.speechSynthesis.getVoices() || []
  if (!voices.length) return cachedVoice

  const langRoot = String(preferredLang || 'en').split('-')[0].toLowerCase()
  const ranked = [...voices].sort((a, b) => scoreVoice(b, langRoot) - scoreVoice(a, langRoot))
  cachedVoice = ranked[0] || null
  voicesReady = true
  return cachedVoice
}

export function getSelectedVoiceName() {
  return cachedVoice?.name || null
}

export function warmSpeechVoices() {
  if (!window.speechSynthesis) return Promise.resolve([])
  const existing = window.speechSynthesis.getVoices()
  if (existing?.length) {
    pickNaturalVoice()
    return Promise.resolve(existing)
  }
  return new Promise((resolve) => {
    let settled = false
    const done = () => {
      if (settled) return
      settled = true
      window.speechSynthesis.onvoiceschanged = null
      pickNaturalVoice()
      resolve(window.speechSynthesis.getVoices() || [])
    }
    window.speechSynthesis.onvoiceschanged = done
    setTimeout(done, 500)
  })
}

export function cleanSpeechText(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[PHASE_COMPLETE\]/gi, '')
    .replace(/\[INTERVIEW_COMPLETE\]/gi, '')
    .replace(/Q\d+:/g, '')
    .replace(/[#*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Call from a click handler so browsers allow TTS autoplay later in the session.
 */
export async function unlockSpeechAudio(lang = 'en-IN') {
  await warmSpeechVoices()
  if (!window.speechSynthesis) return false
  audioUnlocked = true
  // Silent/near-silent unlock utterance (some browsers need a real speak() after click)
  return new Promise((resolve) => {
    try {
      window.speechSynthesis.cancel()
    } catch {
      /* ignore */
    }
    const utter = new SpeechSynthesisUtterance(' ')
    utter.volume = 0.01
    utter.rate = 2
    utter.lang = lang
    const voice = pickNaturalVoice(lang)
    if (voice) utter.voice = voice
    const done = () => resolve(true)
    utter.onend = done
    utter.onerror = done
    try {
      window.speechSynthesis.speak(utter)
      setTimeout(done, 400)
    } catch {
      resolve(false)
    }
  })
}

export function isSpeechUnlocked() {
  return audioUnlocked
}

/**
 * Speak with a natural human voice. Resolves when utterance ends.
 */
export function speakNatural(text, { muted = false, lang = 'en-IN', rate = 0.92, pitch = 1.02, volume = 1, onStart } = {}) {
  return new Promise((resolve) => {
    if (muted || !window.speechSynthesis) {
      resolve()
      return
    }
    const clean = cleanSpeechText(text)
    if (!clean) {
      resolve()
      return
    }

    const run = () => {
      try {
        window.speechSynthesis.cancel()
      } catch {
        /* ignore */
      }

      // Chrome: cancel + speak in same tick often drops audio
      setTimeout(() => {
        const utter = new SpeechSynthesisUtterance(clean)
        const voice = pickNaturalVoice(lang)
        if (voice) {
          utter.voice = voice
          utter.lang = voice.lang || lang
        } else {
          utter.lang = lang
        }
        utter.rate = rate
        utter.pitch = pitch
        utter.volume = volume

        let finished = false
        let started = false
        const startedAt = Date.now()

        const finish = () => {
          if (finished) return
          finished = true
          clearInterval(keepAlive)
          resolve()
        }

        // Chrome bug: TTS pauses mid-utterance — resume ticks
        // Do NOT treat "not speaking yet" as done for the first 1.2s (startup lag)
        const keepAlive = setInterval(() => {
          try {
            if (window.speechSynthesis.speaking) started = true
            if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
              window.speechSynthesis.resume()
            }
            const elapsed = Date.now() - startedAt
            if (
              started &&
              elapsed > 800 &&
              !window.speechSynthesis.speaking &&
              !window.speechSynthesis.pending
            ) {
              finish()
            }
            // Safety timeout for hung utterances (~3 min max)
            if (elapsed > 180000) finish()
          } catch {
            /* ignore */
          }
        }, 200)

        utter.onstart = () => {
          started = true
          audioUnlocked = true
          onStart?.()
        }
        utter.onend = finish
        utter.onerror = finish

        // Approx end fallback if browser never fires onend
        const approxMs = Math.min(90000, Math.max(2500, clean.split(/\s+/).length * 420))
        setTimeout(() => {
          if (started) finish()
        }, approxMs + 1500)

        try {
          window.speechSynthesis.speak(utter)
          setTimeout(() => {
            try {
              if (window.speechSynthesis.paused) window.speechSynthesis.resume()
            } catch {
              /* ignore */
            }
          }, 80)
        } catch {
          finish()
        }
      }, 80)
    }

    if (!voicesReady && !(window.speechSynthesis.getVoices() || []).length) {
      warmSpeechVoices().then(run)
    } else {
      run()
    }
  })
}

export function stopNaturalSpeech() {
  try {
    window.speechSynthesis?.cancel()
  } catch {
    /* ignore */
  }
}
