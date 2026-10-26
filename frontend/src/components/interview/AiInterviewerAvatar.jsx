import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export const AI_INTERVIEWER_VIDEO = '/images/ai-interviewer.mp4'
export const AI_INTERVIEWER_POSTER = '/images/ai-interviewer-poster.jpg'

/**
 * Talking-head avatar.
 * - System check: play video once with original audio, then stop.
 * - Live interview: muted loop while TTS speaks.
 */
const AiInterviewerAvatar = forwardRef(function AiInterviewerAvatar(
  {
    speaking = false,
    listening = false,
    preview = false,
    full = false,
    soundEnabled = false,
    label,
    className = '',
    showStatus = false,
    statusText,
  },
  ref,
) {
  const videoRef = useRef(null)
  const originalAudioRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)
  const [originalAudioOn, setOriginalAudioOn] = useState(false)

  const isPlayingClip = originalAudioOn
  const shouldPlay = speaking || isPlayingClip

  useImperativeHandle(ref, () => {
    const playWithSound = async () => {
      const video = videoRef.current
      if (!video) return false
      try {
        originalAudioRef.current = true
        setOriginalAudioOn(true)
        video.loop = false
        video.defaultMuted = false
        video.muted = false
        video.volume = 1
        try {
          video.currentTime = 0
        } catch {
          /* ignore */
        }
        await video.play()
        return true
      } catch (err) {
        console.warn('Video play with sound failed', err)
        originalAudioRef.current = false
        setOriginalAudioOn(false)
        return false
      }
    }

    const muteVideo = () => {
      const video = videoRef.current
      if (!video) return
      originalAudioRef.current = false
      setOriginalAudioOn(false)
      video.muted = true
      video.volume = 0
    }

    return {
      unlockSound: playWithSound,
      playWithSound,
      stopVoice() {
        muteVideo()
        videoRef.current?.pause()
      },
      setVideoMuted: muteVideo,
      muteVideo,
      getVideoEl: () => videoRef.current,
    }
  })

  // One-shot clip ended → freeze on poster, sound off.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    const onEnded = () => {
      if (!originalAudioRef.current) return
      originalAudioRef.current = false
      setOriginalAudioOn(false)
      video.muted = true
      video.volume = 0
      video.pause()
      try {
        video.currentTime = 0
      } catch {
        /* ignore */
      }
    }
    video.addEventListener('ended', onEnded)
    return () => video.removeEventListener('ended', onEnded)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video || mediaFailed) return

    video.playsInline = true

    if (originalAudioRef.current) {
      // One-shot system-check clip with original audio.
      video.loop = false
      video.defaultMuted = false
      video.muted = false
      video.volume = 1
      if (video.paused) video.play().catch(() => {})
      return
    }

    // Live interview: muted lip-sync loop while TTS speaks.
    video.loop = true
    video.defaultMuted = true
    video.muted = true
    video.volume = 0

    if (speaking) {
      const play = () => {
        video.muted = true
        video.volume = 0
        video.play().catch(() => {})
      }
      if (video.readyState >= 2) play()
      else video.addEventListener('loadeddata', play, { once: true })
    } else {
      video.pause()
    }
  }, [shouldPlay, speaking, mediaFailed, originalAudioOn])

  return (
    <div
      className={`mascot-interviewer${speaking ? ' is-speaking' : ''}${
        listening ? ' is-listening' : ''
      }${preview ? ' is-preview' : ''}${full ? ' is-full' : ''}${
        soundEnabled || originalAudioOn ? ' has-sound' : ''
      }${className ? ` ${className}` : ''}`}
    >
      {label ? <span className="mascot-interviewer__label">{label}</span> : null}
      <div className={`avatar-stage${speaking || isPlayingClip ? ' talking' : ''}${listening ? ' listening' : ''}`}>
        <div className="avatar-bounce-wrap">
          {!mediaFailed && (
            <img
              className={`large-mascot ai-interviewer-poster${
                videoReady && shouldPlay ? ' is-covered' : ''
              }`}
              src={AI_INTERVIEWER_POSTER}
              alt="AI Interviewer"
              draggable={false}
              onError={() => setMediaFailed(true)}
            />
          )}
          {!mediaFailed && (
            <video
              ref={videoRef}
              className={`large-mascot ai-interviewer-video${speaking ? ' is-speaking' : ''}${
                isPlayingClip ? ' is-playing' : ''
              }${listening ? ' is-listening' : ''}${full ? ' is-full' : ''}${
                videoReady ? ' is-ready' : ''
              }`}
              src={AI_INTERVIEWER_VIDEO}
              poster={AI_INTERVIEWER_POSTER}
              playsInline
              preload="auto"
              controls={false}
              aria-label="AI Interviewer"
              onLoadedData={() => setVideoReady(true)}
              onError={() => setMediaFailed(true)}
            />
          )}
          {mediaFailed && (
            <div className="ai-interviewer-fallback" role="img" aria-label="AI Interviewer">
              <span>AI</span>
            </div>
          )}
        </div>
      </div>
      {showStatus && (
        <p className="avatar-status-text">
          {statusText
            ?? (speaking
              ? 'AI is talking to you…'
              : listening
                ? 'Your turn — speak now'
                : 'Ready when you are')}
        </p>
      )}
    </div>
  )
})

export default AiInterviewerAvatar
