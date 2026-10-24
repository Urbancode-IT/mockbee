import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiFetch } from '../../config/api'
import AiInterviewerAvatar from '../../components/interview/AiInterviewerAvatar'
import useSpeechInterview from '../../hooks/useSpeechInterview'
import { unlockSpeechAudio, warmSpeechVoices } from '../../utils/naturalSpeech'
import { unlockHumanVoice } from '../../utils/humanVoice'
import '../../styles/enterprise-interview.css'

function loadSession(interviewId) {
  try {
    return JSON.parse(sessionStorage.getItem(`enterprise_session_${interviewId}`) || 'null')
  } catch {
    return null
  }
}

export default function EnterpriseInterviewRoomPage() {
  const { interviewId } = useParams()
  const navigate = useNavigate()
  const speech = useSpeechInterview({ lang: 'en-IN' })
  const boot = useRef(loadSession(interviewId))
  const avatarRef = useRef(null)
  const startedAt = useRef(Date.now())
  const submittingRef = useRef(false)
  const introStartedRef = useRef(false)

  const [sessionId, setSessionId] = useState(boot.current?.session_id || '')
  const [token, setToken] = useState(boot.current?.submission_token || '')
  const [question, setQuestion] = useState(boot.current?.first_question || null)
  const [isFollowUp, setIsFollowUp] = useState(false)
  const [captions, setCaptions] = useState('')
  const [answer, setAnswer] = useState('')
  const [status, setStatus] = useState('intro')
  const [progress, setProgress] = useState({ answered: 0, total: 0 })
  const [paused, setPaused] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [muted, setMuted] = useState(false)
  const [soundOn, setSoundOn] = useState(
    () => sessionStorage.getItem('mockbee_video_sound') === '1',
  )
  const [needsSoundTap, setNeedsSoundTap] = useState(true)

  const mode = boot.current?.interview_mode || 'voice'

  // Single AI voice (new avatar video is silent): video moves only while
  // this voice speaks, then freezes while the candidate answers.
  const speakAndListen = useCallback(
    async (text) => {
      if (paused) return
      setCaptions(text)
      setStatus('speaking')
      speech.setMuted(muted)
      await speech.speakText(text)
      if (paused || mode === 'text') {
        setStatus('awaiting')
        return
      }
      setStatus('listening')
      speech.startListening({
        onFinal: (finalText) => {
          setAnswer((prev) => (prev ? `${prev} ${finalText}` : finalText))
          setStatus('awaiting')
        },
      })
    },
    [mode, muted, paused, speech],
  )

  const beginInterviewAudio = useCallback(async () => {
    if (introStartedRef.current) return
    introStartedRef.current = true
    setNeedsSoundTap(false)

    await unlockHumanVoice()
    await avatarRef.current?.unlockSound?.()
    await warmSpeechVoices()
    await unlockSpeechAudio('en-IN')
    setSoundOn(true)
    sessionStorage.setItem('mockbee_video_sound', '1')
    await new Promise((r) => setTimeout(r, 150))

    const intro = boot.current?.intro
    if (intro) await speakAndListen(intro)
    if (boot.current?.first_question) {
      await speakAndListen(boot.current.first_question.question)
    }
  }, [speakAndListen])

  useEffect(() => {
    if (!boot.current?.session_id) {
      toast.error('Start the interview from the invitation page')
      navigate(`/panel/${interviewId}`, { replace: true })
    }
  }, [interviewId, navigate])

  useEffect(() => {
    speech.setMuted(muted)
  }, [muted, speech])

  useEffect(
    () => () => {
      speech.stopListening()
      speech.stopSpeaking()
    },
    [speech],
  )

  const completeInterview = useCallback(async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setStatus('completing')
    try {
      const duration_seconds = Math.round((Date.now() - startedAt.current) / 1000)
      const { body, ok } = await apiFetch(`/api/enterprise/sessions/${sessionId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ duration_seconds }),
      })
      if (!ok || body.status !== 'success') throw new Error(body.detail || 'Could not complete')
      sessionStorage.setItem(`enterprise_report_${sessionId}`, JSON.stringify(body.report))
      navigate(`/panel/${interviewId}/report/${sessionId}`)
    } catch (e) {
      submittingRef.current = false
      toast.error(String(e.message || e))
      setStatus('awaiting')
    }
  }, [interviewId, navigate, sessionId])

  const submitAnswer = async () => {
    if (submitting || submittingRef.current) return
    const text = (answer || speech.interim || '').trim()
    if (!text) {
      toast.error('Provide an answer by speaking or typing')
      return
    }
    speech.stopListening()
    setSubmitting(true)
    setStatus('evaluating')
    try {
      const path = isFollowUp
        ? `/api/enterprise/sessions/${sessionId}/follow-up-answer`
        : `/api/enterprise/sessions/${sessionId}/answer`
      const payload = isFollowUp
        ? { answer: text, transcript: text }
        : {
            answer: text,
            transcript: text,
            question_index: question?.index ?? 0,
            submission_token: token,
          }
      let { body, ok, status: httpStatus } = await apiFetch(path, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

      // brief retry on network failure
      if (!ok && httpStatus >= 500) {
        await new Promise((r) => setTimeout(r, 800))
        ;({ body, ok } = await apiFetch(path, { method: 'POST', body: JSON.stringify(payload) }))
      }

      if (!ok || body.status !== 'success') throw new Error(body.detail || 'Submit failed')

      setEvaluation(body.evaluation)
      if (body.progress) setProgress(body.progress)
      setAnswer('')
      setIsFollowUp(false)

      if (body.done || !body.next) {
        await speakAndListen('Thank you. That concludes the interview. Generating your report now.')
        await completeInterview()
        return
      }

      setQuestion(body.next)
      const followUpNext = Boolean(
        body.next.parent_question_id || body.next.is_ai_followup || body.next.source === 'ai_generated',
      )
      setIsFollowUp(followUpNext)
      const prefix = followUpNext ? 'Follow-up question: ' : 'Next question: '
      await speakAndListen(`${prefix}${body.next.question}`)
    } catch (e) {
      if (!navigator.onLine) {
        toast.error('Connection lost. Your last answer may need resubmitting when back online.')
      } else {
        toast.error(String(e.message || e))
      }
      setStatus('awaiting')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePause = () => {
    if (!paused) {
      speech.stopListening()
      speech.stopSpeaking()
      setPaused(true)
      setStatus('paused')
    } else {
      setPaused(false)
      setStatus('awaiting')
      toast.message('Interview resumed')
    }
  }

  if (!sessionId) return null

  const qNum = (question?.index ?? 0) + 1
  const qTotal = progress.total || '—'
  const statusLabel = {
    intro: 'Starting',
    speaking: 'Interviewer speaking',
    listening: 'Your turn — listening',
    awaiting: 'Your turn',
    evaluating: 'Evaluating',
    paused: 'Paused',
    completing: 'Wrapping up',
  }[status] || status

  return (
    <div className="panel-room">
      <header className="panel-room__topbar">
        <div className="panel-room__brand">
          <span className="panel-room__logo">M</span>
          <div>
            <strong>MockBee Panel</strong>
            <small>Structured hiring interview</small>
          </div>
        </div>
        <div className="panel-room__top-meta">
          <span className="panel-room__q">Q {qNum}{progress.total ? ` / ${qTotal}` : ''}</span>
          <span className={`panel-room__status panel-room__status--${status}`}>
            <i className="panel-room__status-dot" />
            {statusLabel}
          </span>
          <button type="button" className="panel-room__icon-btn" onClick={() => setMuted((m) => !m)} title={muted ? 'Unmute' : 'Mute'}>
            <i className={`fas ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`} />
          </button>
          <button type="button" className="panel-room__end" disabled={submitting} onClick={completeInterview}>
            End interview
          </button>
        </div>
      </header>

      {needsSoundTap && (
        <div className="panel-room__unlock">
          <p>Browser blocked audio until you tap once.</p>
          <button type="button" className="panel-room__btn panel-room__btn--primary" onClick={beginInterviewAudio}>
            Enable sound & start
          </button>
        </div>
      )}

      <div className="panel-room__body">
        <aside className="panel-room__avatar">
          <AiInterviewerAvatar
            ref={avatarRef}
            preview
            soundEnabled={soundOn}
            speaking={speech.speaking}
            listening={speech.listening && !paused}
            label="AI INTERVIEWER"
            showStatus
            statusText={
              paused
                ? 'Paused'
                : needsSoundTap
                  ? 'Waiting for sound unlock'
                  : status === 'evaluating'
                    ? 'Evaluating…'
                    : speech.speaking
                      ? 'Speaking…'
                      : speech.listening
                        ? 'Listening…'
                        : 'Ready'
            }
          />
        </aside>

        <main className="panel-room__main">
          <section className="panel-room__card">
            <div className="panel-room__card-head">
              <h2>Question</h2>
              {question && (
                <div className="panel-room__tags">
                  <span>{question.category || 'General'}</span>
                  <span>{question.difficulty || '—'}</span>
                  <span>{question.max_marks ?? 10} marks</span>
                  {(question.is_ai_followup || question.source === 'ai_generated' || isFollowUp) && (
                    <span className="is-followup">Follow-up</span>
                  )}
                </div>
              )}
            </div>
            <p className="panel-room__question">{captions || question?.question || '—'}</p>
          </section>

          <section className="panel-room__card panel-room__card--answer">
            <h2>Your answer</h2>
            <textarea
              rows={7}
              value={answer}
              disabled={paused || submitting}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="Speak, or type your answer here…"
            />
            {speech.error && <p className="panel-room__warn">{speech.error}</p>}
            {evaluation && (
              <p className="panel-room__eval">
                Last score: <strong>{evaluation.score}/{evaluation.max_marks}</strong>
                {' '}({evaluation.percentage}%)
              </p>
            )}
            <div className="panel-room__actions">
              <button
                type="button"
                className={`panel-room__btn${speech.listening ? ' is-live' : ''}`}
                disabled={paused || mode === 'text'}
                onClick={() => {
                  setStatus('listening')
                  speech.startListening({
                    onFinal: (t) => {
                      setAnswer((prev) => (prev ? `${prev} ${t}` : t))
                      setStatus('awaiting')
                    },
                  })
                }}
              >
                <i className="fas fa-microphone" /> {speech.listening ? 'Listening…' : 'Speak'}
              </button>
              <button type="button" className="panel-room__btn" onClick={() => speech.stopListening()}>
                Stop mic
              </button>
              <button type="button" className="panel-room__btn" onClick={togglePause}>
                {paused ? 'Resume' : 'Pause'}
              </button>
              <button
                type="button"
                className="panel-room__btn panel-room__btn--primary"
                disabled={paused || submitting}
                onClick={submitAnswer}
              >
                {submitting ? 'Submitting…' : 'Submit answer'}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  )
}
