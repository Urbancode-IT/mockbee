import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { apiFetch } from '../../config/api'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem, getJSON, setJSON, setItem } from '../../utils/storage'
import { speakNatural, stopNaturalSpeech, unlockSpeechAudio } from '../../utils/naturalSpeech'
import { speakHuman, stopHumanVoice, unlockHumanVoice } from '../../utils/humanVoice'
import '../../styles/interview.css'

const BEE_IMG = '/images/file_0000000030c47208a129217cc981f4d6.png'

const PHASES = ['self_intro', 'projects_skills', 'technical', 'optimization', 'behavioural', 'hr_logistics']

const PHASE_META = {
  self_intro: { label: 'Self Introduction', short: 'Introduction', desc: 'Background, motivation and career summary', icon: 'fa-user' },
  projects_skills: { label: 'Projects & Skills', short: 'Projects', desc: 'Key projects, ownership and technical skills', icon: 'fa-briefcase' },
  technical: { label: 'Technical Round', short: 'Technical', desc: 'Core concepts and role-specific depth', icon: 'fa-code' },
  optimization: { label: 'Problem Solving', short: 'Problem Solving', desc: 'Optimisation, trade-offs and edge cases', icon: 'fa-diagram-project' },
  behavioural: { label: 'Behavioural Round', short: 'Behavioural', desc: 'Teamwork, conflict and STAR-based scenarios', icon: 'fa-people-group' },
  hr_logistics: { label: 'HR & Closing', short: 'HR & Closing', desc: 'Expectations, availability and next steps', icon: 'fa-handshake' },
}

const PHASE_Q_TARGETS = { self_intro: 2, projects_skills: 3, technical: 4, optimization: 3, behavioural: 5, hr_logistics: 5 }
const FULL_PANEL_QUESTIONS = Object.values(PHASE_Q_TARGETS).reduce((a, b) => a + b, 0)
/** Free MockBee / quick side — paid plans unlock the full MNC panel. */
const QUICK_Q_TARGETS = { bee: 5, '5-min': 5, rapid: 5, warmup: 3, '1-q': 1 }
const QUICK_MODES = Object.keys(QUICK_Q_TARGETS)
const LEVELS = ['Fresher', 'Mid-level', 'Senior']
const INTERVIEWER = { name: 'MockBee Interviewer', title: 'Practice panel', initials: 'MB' }

/** Survive React Strict Mode remounts — prevents double start / two overlapping voices. */
let beeBootLock = false
let speakQueue = Promise.resolve()

function formatBold(text) {
  return String(text || '').split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part,
  )
}
function roleFaIcon(roleName) {
  const r = String(roleName || '').toLowerCase()
  if (r.includes('python')) return 'fab fa-python'
  if (r.includes('frontend') || r.includes('react')) return 'fas fa-globe'
  if (r.includes('backend') || r.includes('node')) return 'fas fa-cogs'
  if (r.includes('data')) return 'fas fa-chart-bar'
  if (r.includes('ml') || r.includes('machine')) return 'fas fa-brain'
  if (r.includes('cloud') || r.includes('aws')) return 'fas fa-cloud'
  if (r.includes('devops')) return 'fas fa-sync-alt'
  if (r.includes('mobile')) return 'fas fa-mobile-alt'
  if (r.includes('security') || r.includes('cyber')) return 'fas fa-shield-alt'
  if (r.includes('qa') || r.includes('test')) return 'fas fa-flask'
  return 'fas fa-briefcase'
}
function modeTitles(mode, roleName) {
  if (mode === 'bee') return { title: `${roleName} · Bee Practice`, badge: 'Free · 5 questions' }
  if (mode === '5-min') return { title: '5-Minute Drill', badge: `${roleName} · Sprint` }
  if (mode === '1-q') return { title: '1-Question Deep Dive', badge: `${roleName} · Expert Task` }
  if (mode === 'rapid') return { title: 'Rapid Revision', badge: `${roleName} · Prep` }
  if (mode === 'warmup') return { title: 'Interview Warm-up', badge: `${roleName} · Warm-up` }
  return { title: `${roleName} Interview`, badge: 'Full Panel · Paid' }
}
const fmtClock = (s) => `${String(Math.floor(Math.max(0, s) / 60)).padStart(2, '0')}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

export default function InterviewPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, displayName, isPro } = useAuth()
  const roleName = searchParams.get('role') || getItem(KEYS.selectedRole) || 'System Architect'
  // Explicit URL mode wins. Default for free users = bee (5Q). Paid default = full MNC.
  const rawMode = searchParams.get('mode') || ''
  const isPaid = !!isPro || !!user?.subscribed || !!user?.isStudent
  const mode = rawMode || (isPaid ? 'standard' : 'bee')
  const { title, badge } = modeTitles(mode, roleName)
  const isQuick = QUICK_MODES.includes(mode)
  const totalQuestions = isQuick ? QUICK_Q_TARGETS[mode] : FULL_PANEL_QUESTIONS
  const totalQuestionsRef = useRef(totalQuestions)
  totalQuestionsRef.current = totalQuestions

  // Bee needs one tap first (browser autoplay block) — arm → live.
  const [stage, setStage] = useState(isQuick ? 'arm' : 'lobby') // arm | lobby | live | done
  const [level, setLevel] = useState('Mid-level')
  const [candidateName, setCandidateName] = useState(displayName || 'Candidate')
  const [agreed, setAgreed] = useState(isQuick)
  const [checks, setChecks] = useState({ mic: null, speaker: null, network: null, speech: null })
  const [checking, setChecking] = useState(false)
  const sessionId = useMemo(() => `MB-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`, [])

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [questionCount, setQuestionCount] = useState(0)
  const [currentPhase, setCurrentPhase] = useState(PHASES[0])
  const [awaitingAnswer, setAwaitingAnswer] = useState(false)
  const [aiProcessing, setAiProcessing] = useState(false)
  const [typing, setTyping] = useState(false)
  const [complete, setComplete] = useState(false)
  const [muted, setMuted] = useState(false)
  const [listening, setListening] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [timerLeft, setTimerLeft] = useState(null)
  const [elapsed, setElapsed] = useState(0)
  const [confirmEnd, setConfirmEnd] = useState(false)

  const chatRef = useRef(null); const recognitionRef = useRef(null); const startedRef = useRef(false)
  const phaseIndexRef = useRef(0); const questionsInPhaseRef = useRef(0); const historyRef = useRef([])
  const transcriptRef = useRef([]); const lastQuestionRef = useRef(''); const completeRef = useRef(false)
  const qCountRef = useRef(0); const mutedRef = useRef(false); const inputBaselineRef = useRef(''); const levelRef = useRef(level)
  levelRef.current = level
  useEffect(() => { mutedRef.current = muted }, [muted])
  useEffect(() => { if (displayName && !candidateName) setCandidateName(displayName) }, [displayName]) // eslint-disable-line
  /** Prefer backend neural TTS (Edge/Gemini); fall back to browser neural voice if API fails. */
  const speakAI = useCallback((text) => {
    if (mutedRef.current) return Promise.resolve()
    const run = async () => {
      stopHumanVoice()
      stopNaturalSpeech()
      try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
      setAiSpeaking(true)
      try {
        const ok = await speakHuman(text, {
          muted: mutedRef.current,
          timeoutMs: 25000,
          onStart: () => setAiSpeaking(true),
        })
        if (!ok && !mutedRef.current) {
          await speakNatural(text, {
            muted: mutedRef.current,
            onStart: () => setAiSpeaking(true),
          })
        }
      } finally {
        setAiSpeaking(false)
      }
    }
    speakQueue = speakQueue.then(run, run)
    return speakQueue
  }, [])
  const scrollToBottom = useCallback(() => requestAnimationFrame(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })), [])
  const pushMessage = useCallback((msg) => { setMessages((p) => [...p, { id: `${Date.now()}-${Math.random()}`, ...msg }]); scrollToBottom() }, [scrollToBottom])

  const finishInterview = useCallback(() => {
    if (completeRef.current) return
    completeRef.current = true
    setComplete(true)
    setAwaitingAnswer(false)
    stopHumanVoice()
    stopNaturalSpeech()
    setAiSpeaking(false)
    beeBootLock = false
    // Free bee: the moment 5Q are done, ask for subscription (no report / no delay).
    if (isQuick && !isPaid) {
      const sessionData = {
        id: String(Date.now()),
        sessionId,
        role: roleName,
        level,
        transcript: transcriptRef.current,
        conversationHistory: historyRef.current,
        date: new Date().toLocaleDateString(),
        totalQuestions: qCountRef.current,
        mode,
        isQuick: true,
        isPro: false,
      }
      setItem(KEYS.recentInterview, JSON.stringify(sessionData))
      const history = getJSON(KEYS.interviews, [])
      history.push(sessionData)
      setJSON(KEYS.interviews, history)
      navigate('/dashboard/subscription', {
        replace: true,
        state: { fromBee: true, role: roleName, questions: qCountRef.current },
      })
      return
    }
    setStage('done')
  }, [isPaid, isQuick, level, mode, navigate, roleName, sessionId])

  const requestAIQuestion = useCallback(async () => {
    setTyping(true)
    const phase = isQuick ? 'technical' : PHASES[phaseIndexRef.current]
    if (!isQuick) setCurrentPhase(phase)
    try {
      const { ok, body, status } = await apiFetch('/api/interview/chat', {
        method: 'POST',
        body: JSON.stringify({
          role: roleName,
          level: levelRef.current,
          history: historyRef.current,
          phase,
          questions_in_phase: questionsInPhaseRef.current,
          mode,
        }),
      })
      setTyping(false)
      if (!ok) throw new Error(body.detail || `HTTP ${status}`)
      const reply = body.reply
      if (!reply) throw new Error('No reply from AI')
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      if (reply.includes('[INTERVIEW_COMPLETE]')) {
        const clean = reply.replace('[INTERVIEW_COMPLETE]', '').trim()
        if (clean) { pushMessage({ type: 'ai', text: clean }); speakAI(clean) }
        finishInterview(); return
      }
      if (!isQuick && reply.includes('[PHASE_COMPLETE]')) {
        const clean = reply.replace('[PHASE_COMPLETE]', '').trim()
        if (clean) pushMessage({ type: 'ai', text: clean })
        phaseIndexRef.current += 1; questionsInPhaseRef.current = 0
        if (phaseIndexRef.current < PHASES.length) {
          const next = PHASES[phaseIndexRef.current]; setCurrentPhase(next)
          pushMessage({ type: 'phase', text: PHASE_META[next].label, desc: PHASE_META[next].desc })
          historyRef.current = [...historyRef.current, { role: 'user', content: 'I am ready. Please proceed to the next phase and ask the first question.' }]
          setTimeout(() => requestAIQuestion(), 1200)
        } else finishInterview()
        return
      }
      if (isQuick && qCountRef.current >= totalQuestionsRef.current) {
        finishInterview(); return
      }
      qCountRef.current += 1; questionsInPhaseRef.current += 1; setQuestionCount(qCountRef.current)
      lastQuestionRef.current = reply
      pushMessage({ type: 'ai', text: reply, qNum: qCountRef.current })
      // Speak the question fully before opening the mic / answer box.
      await speakAI(reply)
      if (!completeRef.current) setAwaitingAnswer(true)
    } catch (err) {
      setTyping(false); console.error('AI Error:', err)
      const msg = err.message?.includes('429') ? 'The interview service is busy (quota limit). Please wait a moment and retry.' : 'We could not reach the interview server. It may be waking up — please wait ~30 seconds and retry.'
      pushMessage({ type: 'ai', text: msg, retry: true })
    }
  }, [finishInterview, isQuick, mode, pushMessage, roleName, speakAI])

  const handleSubmit = useCallback(async () => {
    if (completeRef.current || !awaitingAnswer || aiProcessing) return
    const message = input.trim(); if (!message) return
    if (listening && recognitionRef.current) { setListening(false); try { recognitionRef.current.stop() } catch { /* noop */ } }
    setAwaitingAnswer(false); setAiProcessing(true); setInput(''); stopHumanVoice(); stopNaturalSpeech(); setAiSpeaking(false)
    pushMessage({ type: 'user', text: message })
    historyRef.current = [...historyRef.current, { role: 'user', content: message }]
    const phaseKey = isQuick ? 'technical' : PHASES[phaseIndexRef.current]
    transcriptRef.current = [...transcriptRef.current, { question: lastQuestionRef.current || (isQuick ? 'Bee practice' : PHASE_META[phaseKey].label), answer: message, phase: phaseKey }]

    // Hard cap: after the Nth answer on free bee — go ask subscription immediately.
    if (isQuick && qCountRef.current >= totalQuestionsRef.current) {
      setAiProcessing(false)
      finishInterview()
      return
    }

    setTyping(true)
    try {
      const { ok, body, status } = await apiFetch('/api/interview/chat', {
        method: 'POST',
        body: JSON.stringify({
          role: roleName,
          level: levelRef.current,
          history: historyRef.current,
          phase: phaseKey,
          questions_in_phase: questionsInPhaseRef.current,
          mode,
        }),
      })
      setTyping(false); setAiProcessing(false)
      if (!ok) throw new Error(body.detail || `HTTP ${status}`)
      const reply = body.reply; if (!reply) throw new Error('No reply from AI')
      historyRef.current = [...historyRef.current, { role: 'assistant', content: reply }]
      if (reply.includes('[INTERVIEW_COMPLETE]')) {
        const clean = reply.replace('[INTERVIEW_COMPLETE]', '').trim()
        if (clean) { pushMessage({ type: 'ai', text: clean }); speakAI(clean) }
        finishInterview(); return
      }
      if (!isQuick && reply.includes('[PHASE_COMPLETE]')) {
        const clean = reply.replace('[PHASE_COMPLETE]', '').trim()
        if (clean) pushMessage({ type: 'ai', text: clean, feedback: true })
        phaseIndexRef.current += 1; questionsInPhaseRef.current = 0
        if (phaseIndexRef.current < PHASES.length) {
          const next = PHASES[phaseIndexRef.current]; setCurrentPhase(next)
          pushMessage({ type: 'phase', text: PHASE_META[next].label, desc: PHASE_META[next].desc })
          historyRef.current = [...historyRef.current, { role: 'user', content: 'I am ready. Please proceed to the next phase and ask the first question.' }]
          setTimeout(() => requestAIQuestion(), 1200)
        } else finishInterview()
        return
      }
      if (isQuick && qCountRef.current >= totalQuestionsRef.current) {
        finishInterview(); return
      }
      qCountRef.current += 1; questionsInPhaseRef.current += 1; setQuestionCount(qCountRef.current)
      lastQuestionRef.current = reply
      pushMessage({ type: 'ai', text: reply, qNum: qCountRef.current })
      await speakAI(reply)
      if (!completeRef.current) setAwaitingAnswer(true)
    } catch (err) {
      setTyping(false); setAiProcessing(false); console.error('AI Error:', err)
      toast.error('Connection lost. Your answer is restored — please submit again.')
      historyRef.current = historyRef.current.slice(0, -1); transcriptRef.current = transcriptRef.current.slice(0, -1)
      setMessages((p) => { const n = [...p]; for (let i = n.length - 1; i >= 0; i--) { if (n[i].type === 'user' && n[i].text === message) { n.splice(i, 1); break } } return n })
      setInput(message); setAwaitingAnswer(true)
    }
  }, [aiProcessing, awaitingAnswer, finishInterview, input, isQuick, listening, mode, pushMessage, requestAIQuestion, roleName, speakAI])

  const saveAndNavigate = useCallback(() => {
    const sessionData = { id: String(Date.now()), sessionId, role: roleName, level, transcript: transcriptRef.current, conversationHistory: historyRef.current, date: new Date().toLocaleDateString(), totalQuestions: qCountRef.current, mode, isQuick, isPro: mode === 'standard' }
    setItem(KEYS.recentInterview, JSON.stringify(sessionData))
    const history = getJSON(KEYS.interviews, []); history.push(sessionData); setJSON(KEYS.interviews, history)
    const email = getItem(KEYS.userEmail) || user?.email
    if (email) apiFetch('/api/interview/save', { method: 'POST', body: JSON.stringify({ email, role: roleName, date: sessionData.date, score: null, analysis: {}, transcript: sessionData.transcript, conversationHistory: sessionData.conversationHistory, totalQuestions: sessionData.totalQuestions, mode, session_id: sessionData.id, isQuick, isPro: sessionData.isPro, topic: roleName }) }).catch(() => {})
    // Bee practice: no report — send free users to subscribe
    if (isQuick) {
      navigate(isPaid ? '/dashboard/roles' : '/dashboard/subscription')
      return
    }
    navigate('/dashboard/reports?view=report')
  }, [isPaid, isQuick, mode, navigate, roleName, user?.email, level, sessionId])

  /* ---- Lobby: device checks (real MNC pre-flight) ---- */
  const runChecks = async () => {
    setChecking(true)
    let mic = false
    try { const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach((t) => t.stop()); mic = true } catch { mic = false }
    await unlockHumanVoice()
    const humanOk = await speakHuman('Hello. This is your interviewer voice check.', { muted: false })
    const speaker = humanOk || 'speechSynthesis' in window
    const speech = !!(window.SpeechRecognition || window.webkitSpeechRecognition)
    setChecks({ mic, speaker, network: navigator.onLine, speech })
    setChecking(false)
    if (mic && speaker) toast.success(humanOk ? 'System check complete — human interviewer voice ready.' : 'System check complete — you are ready.')
    else toast.warning('Some checks failed. You can still continue and type your answers.')
  }

  const beginInterview = useCallback(async ({ skipGate = false } = {}) => {
    const name = (candidateName || displayName || 'Candidate').trim()
    if (!skipGate) {
      if (!name) { toast.error('Please confirm your full name.'); return }
      if (!agreed) { toast.error('Please accept the interview guidelines to continue.'); return }
    }
    if (startedRef.current || beeBootLock) return
    startedRef.current = true
    beeBootLock = true
    setCandidateName(name)
    setStage('live')
    // Must run inside the user click that started the interview.
    const voiceOk = await unlockHumanVoice()
    await unlockSpeechAudio()
    if (!voiceOk) toast.message('Tap anywhere once if you cannot hear the interviewer.')
    // Prime mic permission on the same tap so candidate mic can auto-on later.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
    } catch {
      /* typing still works */
    }
    stopNaturalSpeech()
    try { window.speechSynthesis?.cancel() } catch { /* ignore */ }
    if (!isQuick) {
      pushMessage({ type: 'phase', text: PHASE_META.self_intro.label, desc: PHASE_META.self_intro.desc })
    }
    const welcome = isQuick
      ? `Welcome to your ${roleName} interview. I'm your AI interviewer for today. Let's begin!`
      : `Hello ${name.split(' ')[0]}, welcome to your ${roleName} interview at MockBee. This will be a structured ${totalQuestions}-question panel across ${PHASES.length} rounds. Take a moment, answer clearly, and let's begin.`
    pushMessage({ type: 'ai', text: welcome })
    // Finish welcome audio first, then fetch + speak Q1 (same voice path).
    speakQueue = Promise.resolve()
    await speakAI(welcome)
    if (completeRef.current) return
    historyRef.current = [{ role: 'user', content: 'I am ready to begin the interview. Please ask the first question.' }]
    await requestAIQuestion()
  }, [agreed, candidateName, displayName, isQuick, pushMessage, requestAIQuestion, roleName, speakAI, totalQuestions])


  /* elapsed + countdown */
  useEffect(() => {
    if (stage !== 'live') return undefined
    const id = setInterval(() => setElapsed((e) => e + 1), 1000)
    return () => clearInterval(id)
  }, [stage])
  useEffect(() => {
    if (stage !== 'live' || (mode !== '5-min' && mode !== 'rapid')) return undefined
    setTimerLeft(5 * 60)
    const id = setInterval(() => setTimerLeft((p) => { if (p == null) return p; if (p <= 1) { clearInterval(id); toast.info("Time is up — let's wrap up."); finishInterview(); return 0 } return p - 1 }), 1000)
    return () => clearInterval(id)
  }, [finishInterview, mode, stage])

  useEffect(() => {
    if (stage !== 'live' || complete) return undefined
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [stage, complete])

  /* speech recognition */
  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return undefined
    const rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-IN'; recognitionRef.current = rec
    rec.onresult = (e) => { let interim = ''; let final = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) final += `${t} `; else interim += t } if (final) inputBaselineRef.current += final; setInput(inputBaselineRef.current + interim) }
    rec.onend = () => setListening((was) => { if (was) { try { rec.start() } catch { /* noop */ } return was } })
    rec.onerror = (e) => { if (e.error === 'not-allowed') toast.error('Microphone access denied. Allow mic permission or type your answer.'); if (e.error !== 'no-speech' && e.error !== 'aborted') setListening(false) }
    return () => { try { rec.stop() } catch { /* noop */ } }
  }, [])

  const startMic = useCallback(() => {
    if (!recognitionRef.current || completeRef.current) return false
    inputBaselineRef.current = inputBaselineRef.current && !String(inputBaselineRef.current).endsWith(' ')
      ? `${inputBaselineRef.current} `
      : (inputBaselineRef.current || '')
    setListening(true)
    try {
      recognitionRef.current.start()
      return true
    } catch {
      try { recognitionRef.current.stop() } catch { /* noop */ }
      try {
        recognitionRef.current.start()
        return true
      } catch {
        setListening(false)
        return false
      }
    }
  }, [])

  const stopMic = useCallback(() => {
    setListening(false)
    try { recognitionRef.current?.stop() } catch { /* noop */ }
  }, [])

  const toggleMic = () => {
    if (!recognitionRef.current) { toast.info('Voice input is not supported in this browser — please type your answer.'); return }
    if (!awaitingAnswer) return
    if (listening) stopMic()
    else {
      inputBaselineRef.current = input && !input.endsWith(' ') ? `${input} ` : input
      startMic()
    }
  }

  // After AI finishes speaking, auto-enable candidate mic.
  useEffect(() => {
    if (stage !== 'live' || complete || !awaitingAnswer || aiSpeaking || aiProcessing) {
      if (listening && (aiSpeaking || !awaitingAnswer || aiProcessing)) stopMic()
      return undefined
    }
    if (listening) return undefined
    const t = setTimeout(() => { startMic() }, 280)
    return () => clearTimeout(t)
  }, [aiProcessing, aiSpeaking, awaitingAnswer, complete, listening, stage, startMic, stopMic])

  const toggleMute = () => setMuted((m) => { if (!m) { stopHumanVoice(); stopNaturalSpeech(); setAiSpeaking(false) } return !m })

  const progressPct = Math.min(questionCount, totalQuestions) / totalQuestions * 100
  const phaseIdx = PHASES.indexOf(currentPhase)
  const wordCount = input.trim() ? input.trim().split(/\s+/).length : 0
  const checkRow = (ok, label, hint) => (
    <div className="mnc-check"><span className={`mnc-check-dot ${ok === null ? '' : ok ? 'ok' : 'bad'}`}><i className={`fas ${ok === null ? 'fa-minus' : ok ? 'fa-check' : 'fa-triangle-exclamation'}`} /></span><div><strong>{label}</strong><small>{ok === null ? 'Not tested yet' : hint(ok)}</small></div></div>
  )

  /* ================= BEE ARM (tap unlocks human voice) ================= */
  if (stage === 'arm') {
    return (
      <div className="interview-page mnc">
        <header className="mnc-topbar">
          <div className="mnc-brand"><span className="mnc-logo">M</span><div><strong>MockBee</strong><small>{badge}</small></div></div>
          <div className="mnc-topbar-right">
            <button type="button" className="mnc-ghost-btn" onClick={() => navigate('/dashboard/roles')}><i className="fas fa-arrow-left" /> Exit</button>
          </div>
        </header>
        <div className="mnc-arm-gate">
          <img src={BEE_IMG} alt="MockBee" className="mnc-arm-bee" draggable={false} />
          <h1>{roleName}</h1>
          <p>Bee practice · {totalQuestions} questions</p>
          <button
            type="button"
            className="mnc-primary-btn mnc-arm-start"
            onClick={() => beginInterview({ skipGate: true })}
          >
            Start
          </button>
        </div>
      </div>
    )
  }

  /* ================= LOBBY ================= */
  if (stage === 'lobby') {
    return (
      <div className="interview-page mnc">
        <header className="mnc-topbar">
          <div className="mnc-brand"><span className="mnc-logo">M</span><div><strong>MockBee</strong><small>Talent Assessment Platform</small></div></div>
          <div className="mnc-topbar-right"><span className="mnc-session-chip"><i className="fas fa-id-card" /> {sessionId}</span><button type="button" className="mnc-ghost-btn" onClick={() => navigate('/dashboard/roles')}><i className="fas fa-arrow-left" /> Exit</button></div>
        </header>
        <div className="mnc-lobby">
          <section className="mnc-lobby-main">
            <p className="mnc-eyebrow">Pre-interview lobby</p>
            <h1>{title}</h1>
            <p className="mnc-lede">
              {isQuick
                ? `Quick MockBee practice for ${roleName}: ${totalQuestions} questions from our AI bee interviewer. Confirm your details, run a quick check, and join.`
                : 'You are about to begin a structured panel interview, conducted the way large product companies run their hiring rounds. Please review the format and complete your system check before joining.'}
            </p>
            <div className="mnc-meta-grid">
              <div><small>Role</small><strong>{roleName}</strong></div>
              <div><small>Format</small><strong>{isQuick ? `${totalQuestions} questions` : `${PHASES.length} rounds · ${totalQuestions} questions`}</strong></div>
              <div><small>Estimated duration</small><strong>{isQuick ? (mode === '1-q' ? '~10 minutes' : '~8–12 minutes') : '25–35 minutes'}</strong></div>
              <div><small>Interviewer</small><strong>{INTERVIEWER.name}</strong></div>
            </div>

            {!isQuick && (
              <>
                <h2 className="mnc-h2">Interview structure</h2>
                <ol className="mnc-agenda">
                  {PHASES.map((p, i) => (<li key={p}><span className="mnc-agenda-num">{i + 1}</span><i className={`fas ${PHASE_META[p].icon}`} /><div><strong>{PHASE_META[p].label}</strong><small>{PHASE_META[p].desc} · {PHASE_Q_TARGETS[p]} questions</small></div></li>))}
                </ol>
              </>
            )}

            <h2 className="mnc-h2">Guidelines</h2>
            <ul className="mnc-guidelines">
              <li>Answer in your own words. Structured answers (situation → approach → result) score best.</li>
              <li>You may answer by voice or by typing. Use <strong>Enter</strong> to submit, <strong>Shift + Enter</strong> for a new line.</li>
              <li>Do not refresh or close this tab during the interview — progress will be lost.</li>
              <li>This is a practice assessment. Your transcript is evaluated only for your report.</li>
            </ul>
            <label className="mnc-agree"><input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} /><span>I understand the format and will answer honestly without external assistance.</span></label>
          </section>

          <aside className="mnc-lobby-side">
            <div className="mnc-card">
              <h2 className="mnc-h2">Candidate details</h2>
              <label className="mnc-field">Full name<input value={candidateName} onChange={(e) => setCandidateName(e.target.value)} placeholder="e.g. Priya Sharma" autoComplete="name" /></label>
              <label className="mnc-field">Experience level
                <div className="mnc-seg">{LEVELS.map((l) => (<button key={l} type="button" className={level === l ? 'active' : ''} onClick={() => setLevel(l)}>{l}</button>))}</div>
              </label>
            </div>
            <div className="mnc-card">
              <h2 className="mnc-h2">System check</h2>
              {checkRow(checks.mic, 'Microphone', (ok) => ok ? 'Connected and permitted' : 'Blocked — you can still type answers')}
              {checkRow(checks.speaker, 'Speaker / interviewer voice', (ok) => ok ? 'Voice playback available' : 'Voice unavailable in this browser')}
              {checkRow(checks.speech, 'Voice input (speech-to-text)', (ok) => ok ? 'Available — click the mic to speak' : 'Not supported here — typing works fully')}
              {checkRow(checks.network, 'Network', (ok) => ok ? 'Online' : 'Offline — reconnect before starting')}
              <button type="button" className="mnc-secondary-btn" onClick={runChecks} disabled={checking}>{checking ? 'Running checks…' : 'Run system check'}</button>
              <p className="mnc-note">We recommend headphones and a quiet room, just like a real panel round.</p>
            </div>
            <button type="button" className="mnc-primary-btn" onClick={beginInterview} disabled={!agreed || !candidateName.trim()}>Join interview <i className="fas fa-arrow-right" /></button>
            {!agreed && <p className="mnc-note center">Accept the guidelines above to enable joining.</p>}
          </aside>
        </div>
      </div>
    )
  }

  /* ================= DONE ================= */
  if (stage === 'done') {
    // Bee 5Q: no report — ask free users to subscribe
    if (isQuick) {
      return (
        <div className="interview-page bee-studio">
          <div className="bee-subscribe-gate">
            <img src={BEE_IMG} alt="MockBee" className="bee-subscribe-bee" draggable={false} />
            <p className="bee-subscribe-eyebrow">Bee practice complete</p>
            <h1>Nice work{candidateName.trim() ? `, ${candidateName.trim().split(' ')[0]}` : ''}!</h1>
            <p className="bee-subscribe-lede">
              You finished <strong>{totalQuestions} free questions</strong> for {roleName}.
              {isPaid
                ? ' Ready for another practice round anytime.'
                : ' Unlock full panel interviews, more roles, and detailed feedback with a subscription.'}
            </p>
            <div className="bee-subscribe-actions">
              {isPaid ? (
                <button type="button" className="mnc-primary-btn" onClick={() => navigate('/dashboard/roles')}>
                  Back to roles
                </button>
              ) : (
                <>
                  <button type="button" className="mnc-primary-btn" onClick={() => navigate('/dashboard/subscription')}>
                    View subscription plans
                  </button>
                  <Link className="mnc-secondary-btn" to="/membership">See membership</Link>
                </>
              )}
              <Link className="bee-subscribe-skip" to="/dashboard/roles">Maybe later</Link>
            </div>
          </div>
        </div>
      )
    }

    return (
      <div className="interview-page mnc">
        <header className="mnc-topbar">
          <div className="mnc-brand"><span className="mnc-logo">M</span><div><strong>MockBee</strong><small>Talent Assessment Platform</small></div></div>
          <span className="mnc-session-chip"><i className="fas fa-id-card" /> {sessionId}</span>
        </header>
        <div className="mnc-done">
          <div className="mnc-done-card">
            <span className="mnc-done-icon"><i className="fas fa-check" /></span>
            <p className="mnc-eyebrow">Interview submitted</p>
            <h1>Thank you, {candidateName.trim().split(' ')[0] || 'Candidate'}.</h1>
            <p className="mnc-lede">Your {roleName} interview is complete. {transcriptRef.current.length} answer{transcriptRef.current.length === 1 ? '' : 's'} recorded in {fmtClock(elapsed)}.</p>
            <ol className="mnc-nextsteps">
              <li className="done"><i className="fas fa-check" /><div><strong>Interview completed</strong><small>Transcript securely saved to your account</small></div></li>
              <li className="active"><i className="fas fa-chart-line" /><div><strong>Evaluation in progress</strong><small>Our AI panel is scoring communication, depth and structure</small></div></li>
              <li><i className="fas fa-file-lines" /><div><strong>Report ready</strong><small>View scores, per-answer feedback and improvement plan</small></div></li>
            </ol>
            <div className="mnc-done-actions">
              <button type="button" className="mnc-primary-btn" onClick={saveAndNavigate}>View my report <i className="fas fa-arrow-right" /></button>
              <Link className="mnc-secondary-btn" to="/dashboard/roles">Back to roles</Link>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ================= BEE STUDIO (exact mock layout) ================= */
  if (isQuick) {
    const qShown = Math.min(Math.max(questionCount, 1), totalQuestions)
    return (
      <div className="interview-page bee-studio">
        <header className="bee-header">
          <button type="button" className="bee-back" onClick={() => setConfirmEnd(true)} aria-label="Back">
            <i className="fas fa-arrow-left" />
          </button>
          <div className="bee-title-block">
            <span className="bee-role-icon"><i className={roleFaIcon(roleName)} /></span>
            <div>
              <strong>{roleName}</strong>
              <small>AI MOCK INTERVIEW</small>
            </div>
          </div>
          <div className="bee-header-right">
            <button type="button" className="bee-icon-btn" onClick={toggleMute} title={muted ? 'Unmute' : 'Mute'}>
              <i className={`fas ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`} />
            </button>
            <div className="bee-progress" title={`${qShown} of ${totalQuestions}`}>
              <span className="bee-progress-track"><span style={{ width: `${(qShown / totalQuestions) * 100}%` }} /></span>
              <em>{qShown} / {totalQuestions}</em>
            </div>
          </div>
        </header>

        <div className="bee-body">
          <main className="bee-chat" ref={chatRef}>
            {messages.map((msg) => {
              if (msg.type === 'phase') return null
              if (msg.type === 'user') {
                return (
                  <div className="bee-bubble bee-bubble--user" key={msg.id}>{msg.text}</div>
                )
              }
              const body = msg.qNum
                ? (/^Q\d+/i.test(String(msg.text).trim()) ? msg.text : `Q${msg.qNum}: ${msg.text}`)
                : msg.text
              return (
                <div className="bee-bubble bee-bubble--ai" key={msg.id}>
                  {formatBold(body)}
                  {msg.retry && (
                    <button type="button" className="mnc-retry-btn" onClick={() => { setMessages((p) => p.filter((m) => m.id !== msg.id)); requestAIQuestion() }}>Retry</button>
                  )}
                </div>
              )
            })}
            {typing && (
              <div className="bee-bubble bee-bubble--ai bee-typing"><span /><span /><span /></div>
            )}
          </main>

          <aside className={`bee-mascot${aiSpeaking ? ' is-speaking' : ''}`} aria-label="AI interviewer">
            <span className="bee-mascot-badge">AI INTERVIEWER</span>
            <img src={BEE_IMG} alt="AI Interviewer" className="bee-mascot-img" draggable={false} />
          </aside>
        </div>

        {!complete && (
          <footer className="bee-composer">
            <div className="bee-composer-row">
              <textarea
                value={input}
                onChange={(e) => { setInput(e.target.value); inputBaselineRef.current = e.target.value }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }}
                placeholder={awaitingAnswer ? 'Type your answer here...' : 'Please wait for the next question…'}
                disabled={!awaitingAnswer || aiProcessing}
                rows={1}
                autoComplete="off"
              />
              <button
                type="button"
                className={`bee-mic ${listening ? 'active' : ''}`}
                onClick={toggleMic}
                disabled={!awaitingAnswer}
                title={listening ? 'Stop' : 'Voice'}
              >
                <i className="fas fa-microphone" />
              </button>
              <button
                type="button"
                className="bee-submit"
                onClick={handleSubmit}
                disabled={!awaitingAnswer || aiProcessing || !input.trim()}
              >
                {aiProcessing ? '…' : <>SUBMIT <span aria-hidden>→</span></>}
              </button>
            </div>
            <p className="bee-composer-hint">Enter to submit • Shift+Enter for new line</p>
          </footer>
        )}

        {confirmEnd && (
          <div className="mnc-modal-backdrop" role="dialog" aria-modal="true">
            <div className="mnc-modal">
              <h2>End this interview?</h2>
              <p>{transcriptRef.current.length ? `You have answered ${transcriptRef.current.length} question${transcriptRef.current.length === 1 ? '' : 's'}. Ending now will submit what you have completed for evaluation.` : 'You have not answered any questions yet. Ending now will discard this session.'}</p>
              <div className="mnc-modal-actions">
                <button type="button" className="mnc-end-btn" onClick={() => { setConfirmEnd(false); if (transcriptRef.current.length) finishInterview(); else navigate('/dashboard/roles') }}>{transcriptRef.current.length ? 'End & submit' : 'Discard & exit'}</button>
                <button type="button" className="mnc-secondary-btn" onClick={() => setConfirmEnd(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ================= LIVE ROOM (MNC panel) ================= */
  return (
    <div className="interview-page mnc">
      <header className="mnc-topbar">
        <div className="mnc-brand"><span className="mnc-logo">M</span><div><strong>MockBee</strong><small>{badge}</small></div></div>
        <div className="mnc-topbar-right">
          <span className="mnc-rec"><span className="mnc-rec-dot" /> REC</span>
          <span className="mnc-session-chip"><i className="fas fa-id-card" /> {sessionId}</span>
          <span className="mnc-clock" title="Elapsed time"><i className="fas fa-clock" /> {fmtClock(elapsed)}</span>
          {timerLeft != null && <span className={`mnc-clock ${timerLeft <= 60 ? 'warn' : ''}`}><i className="fas fa-stopwatch" /> {fmtClock(timerLeft)}</span>}
          <button type="button" className="mnc-icon-btn" onClick={toggleMute} title={muted ? 'Unmute interviewer voice' : 'Mute interviewer voice'}><i className={`fas ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`} /></button>
          <button type="button" className="mnc-end-btn" onClick={() => setConfirmEnd(true)}><i className="fas fa-phone-slash" /> End interview</button>
        </div>
      </header>

      <nav className="mnc-stepper" aria-label="Interview rounds">
        {PHASES.map((p, i) => (
          <div key={p} className={`mnc-step ${i < phaseIdx ? 'done' : i === phaseIdx ? 'current' : ''}`}>
            <span className="mnc-step-dot">{i < phaseIdx ? <i className="fas fa-check" /> : i + 1}</span><span className="mnc-step-label">{PHASE_META[p].short}</span>{i < PHASES.length - 1 && <span className="mnc-step-line" />}
          </div>
        ))}
      </nav>

      <div className="mnc-room">
        <main className="mnc-transcript" ref={chatRef}>
          {messages.map((msg) => {
            if (msg.type === 'phase') return (<div className="mnc-phase-divider" key={msg.id}><span><i className="fas fa-flag" /> {msg.text}</span><small>{msg.desc}</small></div>)
            if (msg.type === 'user') return (<div className="mnc-msg user" key={msg.id}><span className="mnc-msg-who">You · {candidateName.trim().split(' ')[0] || 'Candidate'}</span><div className="mnc-bubble user">{msg.text}</div></div>)
            return (
              <div className="mnc-msg ai" key={msg.id}>
                <span className="mnc-msg-who">Interviewer{msg.qNum ? ` · Question ${msg.qNum} of ${totalQuestions}` : ''}</span>
                <div className="mnc-bubble ai">{formatBold(msg.text)}
                  {msg.retry && <button type="button" className="mnc-retry-btn" onClick={() => { setMessages((p) => p.filter((m) => m.id !== msg.id)); requestAIQuestion() }}>Retry</button>}
                </div>
              </div>
            )
          })}
          {typing && <div className="mnc-msg ai"><span className="mnc-msg-who">Interviewer is typing</span><div className="mnc-bubble ai mnc-typing"><span /><span /><span /></div></div>}
        </main>

        <aside className="mnc-panel">
          <div className="mnc-card">
            <h3>Session progress</h3>
            <div className="mnc-progress-row"><span>Question {Math.min(questionCount, totalQuestions)} / {totalQuestions}</span><span>{Math.round(progressPct)}%</span></div>
            <div className="mnc-progress"><span style={{ width: `${progressPct}%` }} /></div>
            <dl className="mnc-dl"><div><dt>Candidate</dt><dd>{candidateName || '—'}</dd></div><div><dt>Role</dt><dd>{roleName}</dd></div><div><dt>Level</dt><dd>{level}</dd></div><div><dt>Current round</dt><dd>{PHASE_META[currentPhase].label}</dd></div></dl>
          </div>
        </aside>
      </div>

      {!complete && (
        <footer className="mnc-composer">
          {listening && <div className="mnc-listening"><span className="mnc-rec-dot" /> Listening… speak now, click the mic again to stop.</div>}
          <div className="mnc-composer-box">
            <textarea value={input} onChange={(e) => { setInput(e.target.value); inputBaselineRef.current = e.target.value }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() } }} placeholder={awaitingAnswer ? 'Type your answer… (or use the microphone)' : 'Please wait for the next question…'} disabled={!awaitingAnswer || aiProcessing} rows={3} autoComplete="off" />
            <div className="mnc-composer-bar">
              <button type="button" className={`mnc-mic-btn ${listening ? 'active' : ''}`} onClick={toggleMic} disabled={!awaitingAnswer} title={listening ? 'Stop voice input' : 'Answer by voice'}><i className="fas fa-microphone" />{listening ? ' Stop' : ' Voice'}</button>
              <span className="mnc-wordcount">{wordCount} words · Enter to submit · Shift+Enter for new line</span>
              <button type="button" className="mnc-submit-btn" onClick={handleSubmit} disabled={!awaitingAnswer || aiProcessing || !input.trim()}>{aiProcessing ? 'Submitting…' : 'Submit answer'} <i className="fas fa-paper-plane" /></button>
            </div>
          </div>
        </footer>
      )}

      {confirmEnd && (
        <div className="mnc-modal-backdrop" role="dialog" aria-modal="true">
          <div className="mnc-modal">
            <h2>End this interview?</h2>
            <p>{transcriptRef.current.length ? `You have answered ${transcriptRef.current.length} question${transcriptRef.current.length === 1 ? '' : 's'}. Ending now will submit what you have completed for evaluation.` : 'You have not answered any questions yet. Ending now will discard this session.'}</p>
              <div className="mnc-modal-actions">
                <button type="button" className="mnc-end-btn" onClick={() => { setConfirmEnd(false); if (transcriptRef.current.length) finishInterview(); else navigate('/dashboard/roles') }}>{transcriptRef.current.length ? 'End & submit' : 'Discard & exit'}</button>
                <button type="button" className="mnc-secondary-btn" onClick={() => setConfirmEnd(false)}>Cancel</button>
              </div>
          </div>
        </div>
      )}
    </div>
  )
}
