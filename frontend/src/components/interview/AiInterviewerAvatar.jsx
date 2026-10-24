import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export const AI_INTERVIEWER_VIDEO = '/images/ai-interviewer.mp4'
export const AI_INTERVIEWER_POSTER = '/images/ai-interviewer-poster.jpg'

/**
 * Talking-head avatar — visuals only (always muted).
 * Speech comes from the AI voice (Gemini TTS / browser fallback), not the video track.
 * Label badge only renders when a `label` prop is passed (Excel/Company sidebars).
 * InterviewPage already shows status below the card, so no badge on the photo.
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
  const unlockedRef = useRef(false)
  const [videoReady, setVideoReady] = useState(false)
  const [mediaFailed, setMediaFailed] = useState(false)
  const shouldPlay = speaking

  useImperativeHandle(ref, () => ({
    async unlockSound() {
      const video = videoRef.current
      if (!video) return false
      try {
        video.muted = true
        video.defaultMuted = true
        video.currentTime = 0
        await video.play()
        video.pause()
        unlockedRef.current = true
        return true
      } catch (err) {
        console.warn('Video prime failed', err)
        return false
      }
    },
    playWithSound() {
      const video = videoRef.current
      if (!video) return
      video.muted = true
      try {
        video.currentTime = 0
      } catch {
        /* ignore */
      }
      video.play().catch(() => {})
    },
    stopVoice() {
      const video = videoRef.current
      if (!video) return
      video.muted = true
      video.pause()
    },
    setVideoMuted() {
      const video = videoRef.current
      if (!video) return
      video.muted = true
    },
    muteVideo() {
      const video = videoRef.current
      if (!video) return
      video.muted = true
    },
    getVideoEl: () => videoRef.current,
  }))

  useEffect(() => {
    const video = videoRef.current
    if (!video || mediaFailed) return

    video.playsInline = true
    video.loop = true
    video.muted = true
    video.defaultMuted = true
    video.volume = 0

    // Hard-mute on every tick — never let the video track add a second voice
    const keepMuted = () => {
      video.muted = true
      video.defaultMuted = true
      video.volume = 0
    }
    keepMuted()
    video.addEventListener('play', keepMuted)
    video.addEventListener('volumechange', keepMuted)

    if (shouldPlay) {
      const play = () => {
        keepMuted()
        video.play().catch(() => {})
      }
      if (video.readyState >= 2) play()
      else video.addEventListener('loadeddata', play, { once: true })
    } else {
      video.pause()
    }

    return () => {
      video.removeEventListener('play', keepMuted)
      video.removeEventListener('volumechange', keepMuted)
    }
  }, [shouldPlay, soundEnabled, speaking, mediaFailed])

  return (
    <div
      className={`mascot-interviewer${speaking ? ' is-speaking' : ''}${
        listening ? ' is-listening' : ''
      }${preview ? ' is-preview' : ''}${full ? ' is-full' : ''}${
        soundEnabled ? ' has-sound' : ''
      }${className ? ` ${className}` : ''}`}
    >
      {label ? <span className="mascot-interviewer__label">{label}</span> : null}
      <div className={`avatar-stage${speaking ? ' talking' : ''}${listening ? ' listening' : ''}`}>
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
                listening ? ' is-listening' : ''
              }${full ? ' is-full' : ''}${videoReady ? ' is-ready' : ''}`}
              src={AI_INTERVIEWER_VIDEO}
              poster={AI_INTERVIEWER_POSTER}
              playsInline
              loop
              muted
              preload="metadata"
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
