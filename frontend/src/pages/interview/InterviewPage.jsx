import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem, getJSON, setJSON, setItem } from '../../utils/storage'
import '../../styles/interview.css'

const PHASES = [
  'self_intro',
  'projects_skills',
  'technical',
  'optimization',
  'behavioural',
  'hr_logistics',
]

const PHASE_LABELS = {
  self_intro: 'Phase 1 — Self Introduction',
  projects_skills: 'Phase 2 — Projects & Skills',
  technical: 'Phase 3 — Technical Questions',
  optimization: 'Phase 4 — Optimization & Problem Solving',
  behavioural: 'Phase 5 — Behavioural Questions',
  hr_logistics: 'Phase 6 — HR & Logistics',
}

const PHASE_Q_TARGETS = {
  self_intro: 2,
  projects_skills: 3,
  technical: 4,
  optimization: 3,
  behavioural: 5,
  hr_logistics: 5,
}

const TOTAL_QUESTIONS = Object.values(PHASE_Q_TARGETS).reduce((a, b) => a + b, 0)

const ROLE_ICON_MAPPING = {
  Python: 'fab fa-python',
  Frontend: 'fas fa-code',
  Backend: 'fas fa-server',
  ML: 'fas fa-brain',
  'Data Scientist': 'fas fa-chart-pie',
  Cloud: 'fas fa-cloud',
  DevOps: 'fas fa-infinity',
  Cybersecurity: 'fas fa-user-shield',
  Network: 'fas fa-network-wired',
  'System Architect': 'fas fa-sitemap',
  QA: 'fas fa-vial',
  Mobile: 'fas fa-mobile-screen-button',
  Testing: 'fas fa-vial',
  AWS: 'fab fa-aws',
  Communication: 'fas fa-comments',
}

const MASCOT = '/images/ChatGPT%20Image%20Mar%2030,%202026,%2010_43_13%20AM.png'
const QUICK_MODES = ['1-q', '5-min', 'rapid', 'warmup']

function formatBold(text) {
  const parts = String(text || '').split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

function roleIcon(roleName) {
  for (const [key, icon] of Object.entries(ROLE_ICON_MAPPING)) {
    if (roleName.toLowerCase().includes(key.toLowerCase())) return icon
  }
  return 'fas fa-globe'
}

function modeTitles(mode, roleName) {
  if (mode === '5-min') return { title: '5-Minute Drill', badge: `${roleName} Session` }
  if (mode === '1-q') return { title: '1-Question Deep Dive', badge: `${roleName} Expert Task` }
  if (mode === 'rapid') return { title: 'Rapid Revision', badge: `${roleName} Prep` }
  if (mode === 'warmup') return { title: 'Interview Warm-up', badge: `${roleName} Mode` }
  return { title: roleName, badge: 'AI Mock Interview' }
}

function speakText(text, muted) {
  if (!('speechSynthesis' in window) || muted) return
  const clean = text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\[PHASE_COMPLETE\]/g, '')
    .replace(/\[INTERVIEW_COMPLETE\]/g, '')
    .replace(/Q\d+:/g, '')
    .trim()
  if (!clean) return
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.rate = 1
  utterance.pitch = 1
  utterance.volume = 0.9
  utterance.lang = 'en-US'
  const voices = window.speechSynthesis.getVoices()
  const preferred = voices.find(
    (v) => v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Natural'),
  )
  if (preferred) utterance.voice = preferred
  window.speechSynthesis.speak(utterance)
}

export default function InterviewPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const mode = searchParams.get('mode') || 'standard'
  const roleName = searchParams.get('role') || 'System Architect'
  const { title, badge } = modeTitles(mode, roleName)

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const [awaitingAnswer, setAwaitingAnswer] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const [typing, setTyping] = useState(false)
  const [complete, setComplete] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showDemoModal, setShowDemoModal] = useState(false)
  const [muted, setMuted] = useState(false)
  const [listening, setListening] = useState(false)
  const [timerLeft, setTimerLeft] = useState(null)
  const [timerWarning, setTimerWarning] = useState(false)

  const chatRef = useRef(null)
  const recognitionRef = useRef(null)
  const startedRef = useRef(false)
  const phaseIndexRef = useRef(0)
  const questionsInPhaseRef = useRef(0)
  const historyRef = useRef([])
  const transcriptRef = useRef([])
  const lastQuestionRef = useRef('')
  const completeRef = useRef(false)
  const qCountRef = useRef(0)
  const mutedRef = useRef(false)
  const inputBaselineRef = useRef('')

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
      }
    })
  }, [])

  const pushMessage = useCallback(
    (msg) => {
      setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, ...msg }])
      scrollToBottom()
    },
    [scrollToBottom],
  )

  const finishInterview = useCallback(() => {
    if (completeRef.current) return
    completeRef.current = true
    setComplete(true)
    setAwaitingAnswer(false)
    setTimeout(() => {
      setShowResults(true)
      const isStudent =
        getItem(KEYS.role) === 'STUDENT' || getItem(KEYS.isStudent) === 'true'
      if (!isStudent && !QUICK_MODES.includes(mode)) {
        setTimeout(() => setShowDemoModal(true), 800)
      }
    }, 1200)
  }, [mode])

  const requestAIQuestion = useCallback(async () => {
    setTyping(true)
    const currentPhase = PHASES[phaseIndexRef.current]

    try {
      const { ok, body, status } = await apiFetch('/api/interview/chat', {
        method: 'POST',
        body: JSON.stringify({
          role: roleName,
          level: 'Mid-level',
          history: historyRef.current,
          phase: currentPhase,
          questions_in_phase: questionsInPhaseRef.current,
        }),
      })

      setTyping(false)
      if (!ok) throw new Error(body.detail || `HTTP ${status}`)

      const reply = body.reply
      if (!reply) throw new Error('No reply from AI')

      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]

      if (reply.includes('[INTERVIEW_COMPLETE]')) {
        const cleanReply = reply.replace('[INTERVIEW_COMPLETE]', '').trim()
        pushMessage({ type: 'ai', text: cleanReply })
        speakText(cleanReply, mutedRef.current)
        finishInterview()
        return
      }

      if (reply.includes('[PHASE_COMPLETE]')) {
        const cleanReply = reply.replace('[PHASE_COMPLETE]', '').trim()
        pushMessage({ type: 'ai', text: cleanReply })
        speakText(cleanReply, mutedRef.current)
        phaseIndexRef.current += 1
        questionsInPhaseRef.current = 0
        historyRef.current = [
          ...historyRef.current,
          {
            role: 'user',
            content: 'I am ready. Please proceed to the next phase and ask the first question.',
          },
        ]
        if (phaseIndexRef.current < PHASES.length) {
          setTimeout(() => requestAIQuestion(), 1500)
        } else {
          finishInterview()
        }
        return
      }

      qCountRef.current += 1
      questionsInPhaseRef.current += 1
      setQuestionCount(qCountRef.current)
      lastQuestionRef.current = reply
      pushMessage({ type: 'ai', text: `**Q${qCountRef.current}:** ${reply}` })
      speakText(reply, mutedRef.current)
      setAwaitingAnswer(true)
    } catch (err) {
      setTyping(false)
      console.error('AI Error:', err)
      let errorMsg =
        '⚠️ The AI server is starting up. Please wait ~30 seconds and click **Retry** below.'
      if (err.message?.includes('429')) {
        errorMsg = '⚠️ AI API Quota Exceeded. Please try again later or check your API key limit.'
      } else if (
        err.message &&
        err.message !== 'API responded with an error' &&
        err.message !== 'Failed to fetch'
      ) {
        errorMsg = `⚠️ Error: ${err.message}. Please click **Retry** below.`
      }
      pushMessage({ type: 'ai', text: errorMsg, retry: true })
    }
  }, [finishInterview, pushMessage, roleName])

  const handleSubmit = useCallback(async () => {
    if (completeRef.current || !awaitingAnswer || aiProcessing) return
    const message = input.trim()
    if (!message) return

    if (listening && recognitionRef.current) {
      setListening(false)
      try {
        recognitionRef.current.stop()
      } catch {
        /* ignore */
      }
    }

    setAwaitingAnswer(false)
    setAiProcessing(true)
    setInput('')
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()

    pushMessage({ type: 'user', text: message })
    historyRef.current = [...historyRef.current, { role: 'user', content: message }]
    transcriptRef.current = [
      ...transcriptRef.current,
      {
        question:
          lastQuestionRef.current ||
          `[${PHASE_LABELS[PHASES[phaseIndexRef.current]]}]`,
        answer: message,
        phase: PHASES[phaseIndexRef.current],
      },
    ]

    setTyping(true)
    const currentPhase = PHASES[phaseIndexRef.current]

    try {
      const { ok, body, status } = await apiFetch('/api/interview/chat', {
        method: 'POST',
        body: JSON.stringify({
          role: roleName,
          level: 'Mid-level',
          history: historyRef.current,
          phase: currentPhase,
          questions_in_phase: questionsInPhaseRef.current,
        }),
      })

      setTyping(false)
      setAiProcessing(false)
      if (!ok) throw new Error(body.detail || `HTTP ${status}`)

      const reply = body.reply
      if (!reply) throw new Error('No reply from AI')

      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]

      if (reply.includes('[INTERVIEW_COMPLETE]')) {
        const cleanReply = reply.replace('[INTERVIEW_COMPLETE]', '').trim()
        pushMessage({ type: 'ai', text: cleanReply, feedback: true })
        speakText(cleanReply, mutedRef.current)
        finishInterview()
        return
      }

      if (reply.includes('[PHASE_COMPLETE]')) {
        const cleanReply = reply.replace('[PHASE_COMPLETE]', '').trim()
        pushMessage({ type: 'ai', text: cleanReply, feedback: true })
        speakText(cleanReply, mutedRef.current)
        phaseIndexRef.current += 1
        questionsInPhaseRef.current = 0
        historyRef.current = [
          ...historyRef.current,
          {
            role: 'user',
            content: 'I am ready. Please proceed to the next phase and ask the first question.',
          },
        ]
        if (phaseIndexRef.current < PHASES.length) {
          setTimeout(() => requestAIQuestion(), 1500)
        } else {
          finishInterview()
        }
        return
      }

      qCountRef.current += 1
      questionsInPhaseRef.current += 1
      setQuestionCount(qCountRef.current)
      lastQuestionRef.current = reply
      pushMessage({ type: 'ai', text: reply, feedback: true, qNum: qCountRef.current })
      speakText(reply, mutedRef.current)
      setAwaitingAnswer(true)
    } catch (err) {
      setTyping(false)
      setAiProcessing(false)
      console.error('AI Error:', err)
      let errorMsg =
        '⚠️ Connection lost or server waking up. Please wait ~30 seconds and try submitting again.'
      if (err.message?.includes('429')) {
        errorMsg = '⚠️ AI API Quota Exceeded. Please try again later or check your API key limit.'
      } else if (err.message && !err.message.includes('Failed to fetch')) {
        errorMsg = `⚠️ Error: ${err.message}. Please try submitting again.`
      }
      pushMessage({ type: 'ai', text: errorMsg })
      historyRef.current = historyRef.current.slice(0, -1)
      transcriptRef.current = transcriptRef.current.slice(0, -1)
      setMessages((prev) => {
        const next = [...prev]
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].type === 'user' && next[i].text === message) {
            next.splice(i, 1)
            break
          }
        }
        return next
      })
      setInput(message)
      setAwaitingAnswer(true)
    }
  }, [
    aiProcessing,
    awaitingAnswer,
    finishInterview,
    input,
    listening,
    pushMessage,
    requestAIQuestion,
    roleName,
  ])

  const saveAndNavigate = useCallback(() => {
    const sessionData = {
      id: String(Date.now()),
      role: roleName,
      transcript: transcriptRef.current,
      conversationHistory: historyRef.current,
      date: new Date().toLocaleDateString(),
      totalQuestions: qCountRef.current,
      mode,
      isQuick: mode !== 'standard',
      isPro: mode === 'standard',
    }

    setItem(KEYS.recentInterview, JSON.stringify(sessionData))
    const history = getJSON(KEYS.interviews, [])
    history.push(sessionData)
    setJSON(KEYS.interviews, history)

    const email = getItem(KEYS.userEmail) || user?.email
    if (email) {
      apiFetch('/api/interview/save', {
        method: 'POST',
        body: JSON.stringify({
          email,
          role: sessionData.role,
          date: sessionData.date,
          score: null,
          analysis: {},
          transcript: sessionData.transcript,
          conversationHistory: sessionData.conversationHistory,
          totalQuestions: sessionData.totalQuestions,
          mode: sessionData.mode,
          session_id: sessionData.id,
          isQuick: sessionData.isQuick,
          isPro: sessionData.isPro,
          topic: sessionData.role,
        }),
      }).catch((err) => console.error('Session draft save failed:', err))
    }

    if (QUICK_MODES.includes(mode)) {
      navigate('/reports/quick?view=report')
    } else {
      navigate('/dashboard/reports?view=report')
    }
  }, [mode, navigate, roleName, user?.email])

  // Start interview once
  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    pushMessage({
      type: 'ai',
      text: `Welcome to your **${roleName}** interview. I'm your AI interviewer for today. Let's begin!`,
    })
    historyRef.current = [
      {
        role: 'user',
        content: 'I am ready to begin the interview. Please ask the first question.',
      },
    ]
    const t = setTimeout(() => requestAIQuestion(), 1500)
    return () => clearTimeout(t)
  }, [pushMessage, requestAIQuestion, roleName])

  // Countdown for timed modes
  useEffect(() => {
    if (mode !== '5-min' && mode !== 'rapid') return undefined
    setTimerLeft(5 * 60)
    const id = setInterval(() => {
      setTimerLeft((prev) => {
        if (prev == null) return prev
        if (prev <= 1) {
          clearInterval(id)
          if (!completeRef.current) {
            alert("Time is up! Let's wrap up this session.")
            finishInterview()
          }
          return 0
        }
        if (prev <= 61) setTimerWarning(true)
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [finishInterview, mode])

  // Voice recognition (simplified)
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return undefined

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) final += `${transcript} `
        else interim += transcript
      }
      if (final) inputBaselineRef.current += final
      setInput(inputBaselineRef.current + interim)
    }

    recognition.onend = () => {
      setListening((was) => {
        if (was) {
          try {
            recognition.start()
          } catch {
            /* ignore */
          }
          return true
        }
        return false
      })
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      if (event.error === 'not-allowed') {
        alert('Microphone access was denied. Please allow microphone permissions.')
      }
      setListening(false)
    }

    return () => {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const toggleMic = () => {
    if (!awaitingAnswer || !recognitionRef.current) return
    if (listening) {
      setListening(false)
      try {
        recognitionRef.current.stop()
      } catch {
        /* ignore */
      }
    } else {
      inputBaselineRef.current = input && !input.endsWith(' ') ? `${input} ` : input
      setListening(true)
      try {
        recognitionRef.current.start()
      } catch (err) {
        console.error(err)
      }
    }
  }

  const toggleMute = () => {
    setMuted((m) => {
      if (!m && 'speechSynthesis' in window) window.speechSynthesis.cancel()
      return !m
    })
  }

  const progressPct = Math.min(questionCount, TOTAL_QUESTIONS) / TOTAL_QUESTIONS * 100
  const timerDisplay =
    timerLeft != null
      ? `${String(Math.floor(timerLeft / 60)).padStart(2, '0')}:${String(timerLeft % 60).padStart(2, '0')}`
      : null

  return (
    <div className="interview-page">
      <header className="interview-header">
        <div className="header-left">
          <button type="button" className="back-link" title="Go Back" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left" />
          </button>
        </div>

        <div className="header-center">
          <div className="role-badge">
            <div className="role-icon-container">
              <i className={roleIcon(roleName)} style={{ fontSize: '2rem', color: '#1a1a1a' }} />
            </div>
            <div className="role-info">
              <h1>{title}</h1>
              <span>{badge}</span>
            </div>
          </div>
        </div>

        <div className="header-right">
          <button
            id="mute-btn"
            type="button"
            onClick={toggleMute}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.2rem',
              cursor: 'pointer',
              color: '#1a1a1a',
              marginRight: 15,
            }}
            title="Toggle Voice"
          >
            <i className={muted ? 'fas fa-volume-mute' : 'fas fa-volume-up'} style={muted ? { color: '#ef4444' } : undefined} />
          </button>
          {timerDisplay != null && (
            <div className={`timer-container${timerWarning ? ' warning' : ''}`} id="timer-box">
              <i className="fas fa-stopwatch" /> <span>{timerDisplay}</span>
            </div>
          )}
          <div className="progress-container">
            <div className="progress-text">
              <span>{Math.min(questionCount, TOTAL_QUESTIONS)}</span> / <span>{TOTAL_QUESTIONS}</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="interview-main">
        <main className="chat-container" ref={chatRef}>
          {messages.map((msg) =>
            msg.type === 'user' ? (
              <div className="message message--user" key={msg.id}>
                <div className="user-icon-wrap">
                  <i className="fas fa-user" />
                </div>
                <div className="user-bubble">{msg.text}</div>
              </div>
            ) : (
              <div className="message message--ai" key={msg.id}>
                <div className="ai-bubble">
                  {msg.feedback ? (
                    <div className="feedback-box">
                      <i className="fas fa-certificate icon" />
                      <strong>Interviewer:</strong>
                      <br />
                      {msg.qNum ? (
                        <strong style={{ color: 'var(--navy-dark)', fontSize: '1.05rem' }}>
                          Q{msg.qNum}:{' '}
                        </strong>
                      ) : null}
                      {formatBold(msg.text)}
                    </div>
                  ) : (
                    formatBold(msg.text)
                  )}
                  {msg.retry && (
                    <button
                      type="button"
                      onClick={() => {
                        setMessages((prev) => prev.filter((m) => m.id !== msg.id))
                        requestAIQuestion()
                      }}
                      style={{
                        margin: '8px auto',
                        display: 'block',
                        padding: '10px 24px',
                        background: '#1a1a1a',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                        fontWeight: 700,
                      }}
                    >
                      🔄 Retry
                    </button>
                  )}
                </div>
              </div>
            ),
          )}

          {typing && (
            <div className="message message--ai" id="typing-indicator">
              <div className="ai-bubble">
                <i className="fas fa-spinner fa-spin" /> AI is thinking...
              </div>
            </div>
          )}

          {showResults && (
            <div className="results-btn-container">
              <button type="button" className="btn-view-results" onClick={saveAndNavigate}>
                See Analysis and Report →
              </button>
              <div className="session-complete-msg">
                <i className="fas fa-check-circle" /> Interview Assessment Complete
              </div>
            </div>
          )}
        </main>

        <aside className="mascot-sidebar">
          <div className="mascot-interviewer">
            <div className="mascot-interviewer__label">AI Interviewer</div>
            <img src={MASCOT} alt="MockBee Mascot" className="large-mascot" />
          </div>
        </aside>
      </div>

      {!complete && !showResults && (
        <footer className="input-area">
          <div className="input-container" style={{ position: 'relative' }}>
            <div className="input-wrapper">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={listening ? '🎙️ Listening... Speak naturally.' : 'Type your answer here...'}
                disabled={!awaitingAnswer || aiProcessing}
                autoComplete="off"
              />
              <button
                type="button"
                className={`mic-btn${listening ? ' active' : ''}`}
                title="Click to speak (Microphone)"
                onClick={toggleMic}
              >
                <i className="fas fa-microphone" />
              </button>
              <button
                type="button"
                className="submit-btn"
                disabled={!awaitingAnswer || aiProcessing}
                onClick={handleSubmit}
              >
                Submit →
              </button>
            </div>
            {listening && (
              <div className="recording-indicator active">
                <i className="fas fa-circle" /> Listening...
              </div>
            )}
            <div className="input-hint">Enter to submit • Shift+Enter for new line</div>
          </div>
        </footer>
      )}

      <div className={`demo-modal-overlay${showDemoModal ? ' active' : ''}`}>
        <div className="demo-modal-card">
          <button type="button" className="demo-modal-close" onClick={() => setShowDemoModal(false)}>
            <i className="fas fa-times" />
          </button>
          <div className="demo-modal-icon">
            <i className="fas fa-rocket" />
          </div>
          <h2 className="demo-modal-title">Demo Session Over!</h2>
          <p className="demo-modal-text">
            Your demo version is over. If you want, you can subscribe to the{' '}
            <span className="highlight-gold">MockB Pro/Elite</span> member version to get more{' '}
            <span className="highlight-gold">500+ interview questions</span> and a{' '}
            <span className="highlight-gold">resume builder</span>.
            <br />
            <br />
            Please generate your report below to view your results.
          </p>
          <div className="demo-modal-actions">
            <Link to="/dashboard/subscription" className="btn-modal-primary">
              <i className="fas fa-crown" /> Subscribe to MockB Membership
            </Link>
          </div>
        </div>
      </div>

      <style>{`
        .demo-modal-overlay {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); z-index: 10000;
          display: none; align-items: center; justify-content: center; opacity: 0;
          transition: opacity 0.4s ease;
        }
        .demo-modal-overlay.active { display: flex; opacity: 1; }
        .demo-modal-card {
          background: #fdfaf7; width: 90%; max-width: 500px; padding: 50px 40px;
          border-radius: 28px; position: relative; text-align: center;
          border: 1px solid #e9dfd6; box-shadow: 0 30px 60px -12px rgba(0,0,0,0.6);
        }
        .demo-modal-close {
          position: absolute; top: 24px; right: 24px; background: #F4E9E2; border: none;
          width: 38px; height: 38px; border-radius: 50%; cursor: pointer;
        }
        .demo-modal-icon { font-size: 3.5rem; color: #B09E93; margin-bottom: 25px; }
        .demo-modal-title { font-family: 'Playfair Display', serif; font-size: 1.8rem; color: #111827; margin-bottom: 12px; }
        .demo-modal-text { font-size: 1.05rem; line-height: 1.6; color: #4b5563; margin-bottom: 30px; }
        .demo-modal-actions { display: flex; flex-direction: column; gap: 12px; }
        .btn-modal-primary {
          background: #000; color: #fff; padding: 16px; border-radius: 12px; font-weight: 600;
          text-decoration: none; border: 2px solid #000;
        }
        .highlight-gold { color: #B09E93; font-weight: 700; }
      `}</style>
    </div>
  )
}
