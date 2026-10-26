import { useCallback, useEffect, useRef, useState } from 'react'
import {
  speakNatural,
  stopNaturalSpeech,
  unlockSpeechAudio,
  warmSpeechVoices,
} from '../utils/naturalSpeech'
import { speakHuman, stopHumanVoice } from '../utils/humanVoice'

/**
 * Speech (single voice) + STT helpers for enterprise interview rooms.
 * Prefer backend neural TTS (/api/tts); fall back to browser speechSynthesis.
 */
export default function useSpeechInterview({ lang = 'en-IN' } = {}) {
  const [speaking, setSpeaking] = useState(false)
  const [listening, setListening] = useState(false)
  const [micDenied, setMicDenied] = useState(false)
  const [micReady, setMicReady] = useState(false)
  const [interim, setInterim] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const mutedRef = useRef(false)

  useEffect(() => {
    warmSpeechVoices()
  }, [])

  const stopSpeaking = useCallback(() => {
    stopHumanVoice()
    stopNaturalSpeech()
    setSpeaking(false)
  }, [])

  const speakText = useCallback(
    async (text) => {
      if (mutedRef.current) return
      setSpeaking(true)
      const humanOk = await speakHuman(text, {
        muted: mutedRef.current,
        timeoutMs: 25000,
        onStart: () => setSpeaking(true),
      })
      if (!humanOk && !mutedRef.current) {
        await speakNatural(text, {
          muted: mutedRef.current,
          lang,
          rate: 0.92,
          pitch: 1.02,
          volume: 1,
          onStart: () => setSpeaking(true),
        })
      }
      setSpeaking(false)
    },
    [lang],
  )

  const setMuted = useCallback(
    (muted) => {
      mutedRef.current = Boolean(muted)
      if (muted) stopSpeaking()
    },
    [stopSpeaking],
  )

  const checkMicrophone = useCallback(async () => {
    setError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicDenied(true)
      setError('Microphone API not available in this browser.')
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setMicReady(true)
      setMicDenied(false)
      return true
    } catch {
      setMicDenied(true)
      setMicReady(false)
      setError('Microphone permission denied. Allow mic access to continue voice answers.')
      return false
    }
  }, [])

  const checkAudioPlayback = useCallback(async () => {
    await warmSpeechVoices()
    await unlockSpeechAudio(lang)
    setSpeaking(true)
    const sample = 'Hello. I am your AI interviewer. You should hear my voice clearly now.'
    const humanOk = await speakHuman(sample, {
      muted: mutedRef.current,
      onStart: () => setSpeaking(true),
    })
    if (!humanOk && !mutedRef.current) {
      await speakNatural(sample, {
        muted: mutedRef.current,
        lang,
        onStart: () => setSpeaking(true),
      })
    }
    setSpeaking(false)
    if (!humanOk) {
      // Browser fallback may still have worked; only warn if synthesis is missing.
      if (!window.speechSynthesis) {
        setError('Voice playback unavailable. You can still read captions and type answers.')
        return false
      }
    }
    return true
  }, [lang])

  const checkNetwork = useCallback(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setError('You appear to be offline. Progress will retry when the connection returns.')
      return false
    }
    return true
  }, [])

  const startListening = useCallback(
    ({ onFinal, continuous = false } = {}) => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition
      if (!SR) {
        setError('Speech recognition is not supported. Please type your answer.')
        return false
      }
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
      const recognition = new SR()
      recognition.lang = lang
      recognition.interimResults = true
      recognition.continuous = continuous
      recognition.onstart = () => {
        setListening(true)
        setInterim('')
      }
      recognition.onresult = (event) => {
        let interimText = ''
        let finalText = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) finalText += transcript
          else interimText += transcript
        }
        if (interimText) setInterim(interimText)
        if (finalText) {
          setInterim('')
          onFinal?.(finalText.trim())
        }
      }
      recognition.onerror = (ev) => {
        setListening(false)
        if (ev.error === 'not-allowed') {
          setMicDenied(true)
          setError('Microphone denied.')
        } else if (ev.error === 'no-speech') {
          setError('No speech detected. Try again or type your answer.')
        } else if (ev.error !== 'aborted') {
          setError('Speech recognition error. You can type instead.')
        }
      }
      recognition.onend = () => setListening(false)
      recognitionRef.current = recognition
      recognition.start()
      return true
    },
    [lang],
  )

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  useEffect(
    () => () => {
      stopListening()
      stopSpeaking()
    },
    [stopListening, stopSpeaking],
  )

  return {
    speaking,
    listening,
    micDenied,
    micReady,
    interim,
    error,
    setError,
    speakText,
    stopSpeaking,
    setMuted,
    checkMicrophone,
    checkAudioPlayback,
    checkNetwork,
    startListening,
    stopListening,
  }
}
