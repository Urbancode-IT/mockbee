import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiFetch } from '../../config/api'
import useSpeechInterview from '../../hooks/useSpeechInterview'
import AiInterviewerAvatar from '../../components/interview/AiInterviewerAvatar'
import { getAvatarConfig } from '../../providers/avatarProvider'
import { unlockHumanVoice } from '../../utils/humanVoice'
import '../../styles/enterprise-interview.css'

export default function EnterpriseInvitePage() {
  const { interviewId } = useParams()
  const navigate = useNavigate()
  const speech = useSpeechInterview()
  const avatarRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [invite, setInvite] = useState(null)
  const [providers, setProviders] = useState(null)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [checks, setChecks] = useState({ mic: null, audio: null, network: null })
  const [soundOn, setSoundOn] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const { body, ok } = await apiFetch(`/api/enterprise/invite/${interviewId}`)
        if (!ok || body.status !== 'success') {
          throw new Error(body.detail || 'Invitation not found')
        }
        if (!cancelled) {
          setInvite(body.interview)
          setProviders(body.providers)
        }
      } catch (e) {
        if (!cancelled) setError(String(e.message || e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [interviewId])

  const runChecks = async () => {
    setChecking(true)
    try {
      const mic = await speech.checkMicrophone()
      const network = speech.checkNetwork()

      await unlockHumanVoice()
      await avatarRef.current?.unlockSound?.()
      const audio = await speech.checkAudioPlayback()
      if (audio) {
        setSoundOn(true)
        sessionStorage.setItem('mockbee_video_sound', '1')
      }

      setChecks({ mic, audio, network })
      if (audio) {
        toast.success('System ready — interviewer voice enabled')
      } else {
        toast.warning('Sound blocked. Allow audio for this tab and try again.')
      }
    } finally {
      setChecking(false)
    }
  }

  const startInterview = async () => {
    if (!name.trim()) {
      toast.error('Please enter your full name')
      return
    }
    if (checks.mic === null) {
      toast.error('Run device checks before starting')
      return
    }
    if (invite?.config?.interview_mode === 'voice' && !checks.mic) {
      toast.error('Microphone is required for voice interviews')
      return
    }
    setStarting(true)
    try {
      speech.stopSpeaking()
      const { body, ok } = await apiFetch(`/api/enterprise/invite/${interviewId}/start`, {
        method: 'POST',
        body: JSON.stringify({ candidate_name: name.trim(), candidate_email: email.trim() }),
      })
      if (!ok || body.status !== 'success') throw new Error(body.detail || 'Could not start interview')
      sessionStorage.setItem(
        `enterprise_session_${interviewId}`,
        JSON.stringify({
          session_id: body.session_id,
          submission_token: body.submission_token,
          candidate_name: name.trim(),
          candidate_email: email.trim(),
          intro: body.intro,
          first_question: body.first_question,
          duration_minutes: body.duration_minutes,
          interview_mode: body.interview_mode,
          providers: body.providers,
          audio_unlocked: true,
          video_sound: true,
        }),
      )
      sessionStorage.setItem('mockbee_video_sound', '1')
      navigate(`/panel/${interviewId}/room`)
    } catch (e) {
      toast.error(String(e.message || e))
    } finally {
      setStarting(false)
    }
  }

  const avatar = getAvatarConfig(providers)
  const cfg = invite?.config || {}
  const checkLabel = (ok) => (ok == null ? 'Not checked' : ok ? 'Ready' : 'Failed')
  const checkClass = (ok) => (ok == null ? '' : ok ? 'is-ok' : 'is-bad')

  if (loading) {
    return (
      <div className="mnc-invite">
        <div className="mnc-invite__loading">Loading invitation…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="mnc-invite">
        <div className="mnc-invite__error">
          <h1>Invitation unavailable</h1>
          <p>{error}</p>
          <Link to="/">Back to home</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mnc-invite">
      <div className="mnc-invite__shell">
        <main className="mnc-invite__main">
          <p className="mnc-invite__eyebrow">Interview invitation</p>
          <h1>{invite.title}</h1>

          <dl className="mnc-invite__meta">
            <div><dt>Role</dt><dd>{cfg.job_role || '—'}</dd></div>
            <div><dt>Level</dt><dd>{cfg.experience_level || '—'}</dd></div>
            <div><dt>Duration</dt><dd>{cfg.duration_minutes || '—'} min</dd></div>
            <div><dt>Questions</dt><dd>{invite.question_count || '—'}</dd></div>
            <div><dt>Mode</dt><dd>{cfg.interview_mode || 'voice'}</dd></div>
          </dl>

          {cfg.job_description && <p className="mnc-invite__desc">{cfg.job_description}</p>}

          <section className="mnc-invite__card">
            <h2>Guidelines</h2>
            {cfg.instructions && <p className="mnc-invite__instructions">{cfg.instructions}</p>}
            <ul>
              <li>Run system check so the interviewer voice can play.</li>
              <li>Use headphones or speakers at a comfortable volume.</li>
              <li>Allow microphone access for voice mode.</li>
              <li>Passing score: <strong>{cfg.passing_score ?? 60}%</strong></li>
            </ul>
          </section>

          <section className="mnc-invite__card">
            <h2>Your details</h2>
            <div className="mnc-invite__fields">
              <label>
                <span>Full name</span>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Candidate name" autoComplete="name" />
              </label>
              <label>
                <span>Email (optional)</span>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" type="email" autoComplete="email" />
              </label>
            </div>
          </section>

          <section className="mnc-invite__card">
            <h2>System check</h2>
            <div className="mnc-invite__checks">
              <div className={`mnc-invite__check ${checkClass(checks.mic)}`}>
                <strong>Microphone</strong>
                <em>{checkLabel(checks.mic)}</em>
              </div>
              <div className={`mnc-invite__check ${checkClass(soundOn || checks.audio)}`}>
                <strong>Speaker</strong>
                <em>{soundOn ? 'Ready' : checkLabel(checks.audio)}</em>
              </div>
              <div className={`mnc-invite__check ${checkClass(checks.network)}`}>
                <strong>Network</strong>
                <em>{checkLabel(checks.network)}</em>
              </div>
            </div>
            {(speech.error || speech.micDenied) && (
              <p className="mnc-invite__warn">{speech.error || 'Microphone permission denied'}</p>
            )}
            <button type="button" className="mnc-invite__btn mnc-invite__btn--ghost" disabled={checking} onClick={runChecks}>
              {checking ? 'Running checks…' : 'Run system check'}
            </button>
          </section>

          <button type="button" className="mnc-invite__btn mnc-invite__btn--primary" disabled={starting} onClick={startInterview}>
            {starting ? 'Starting…' : 'Join interview'}
          </button>

          {providers?.demo_mode && (
            <p className="mnc-invite__demo">Demo mode — set GEMINI_API_KEY for full AI scoring</p>
          )}
        </main>

        <aside className="mnc-invite__avatar">
          <AiInterviewerAvatar
            ref={avatarRef}
            preview
            soundEnabled={soundOn}
            speaking={speech.speaking}
            listening={false}
            label="AI INTERVIEWER"
            showStatus
            statusText={
              speech.speaking
                ? 'Speaking…'
                : soundOn
                  ? 'Voice ready'
                  : checking
                    ? 'Checking…'
                    : 'Waiting for system check'
            }
          />
          <p className="mnc-invite__disclaimer">AI interviewer · not a live human</p>
        </aside>
      </div>
    </div>
  )
}
