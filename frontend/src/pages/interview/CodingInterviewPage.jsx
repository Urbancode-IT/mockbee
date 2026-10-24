import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import { useNavigate, useParams } from 'react-router-dom'
import AiInterviewerAvatar from '../../components/interview/AiInterviewerAvatar'
import { apiFetch } from '../../config/api'
import { speakNatural, stopNaturalSpeech, warmSpeechVoices } from '../../utils/naturalSpeech'
import { speakHuman, stopHumanVoice } from '../../utils/humanVoice'
import '../../styles/coding-interview.css'
import '../../styles/interview.css'

const THEORY_SECONDS = 90
const CODING_SECONDS = 300

function formatErrorDetail(detail, fallback = 'Something went wrong') {
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((d) => (typeof d === 'string' ? d : d?.msg || d?.message || ''))
      .filter(Boolean)
      .join(' · ') || fallback
  }
  if (typeof detail === 'object') {
    return detail.msg || detail.message || detail.detail || fallback
  }
  return String(detail)
}

function formatTimer(sec) {
  const s = Math.max(0, sec || 0)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

async function speakText(text, muted, onEnd) {
  const humanOk = await speakHuman(text, { muted })
  if (!humanOk && !muted) {
    await speakNatural(text, { muted, lang: 'en-IN', rate: 0.92, pitch: 1.02, volume: 1 })
  }
  onEnd?.()
}

export default function CodingInterviewPage() {
  const { bankId } = useParams()
  const navigate = useNavigate()

  const candidate = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`coding_candidate_${bankId}`) || '{}')
    } catch {
      return {}
    }
  }, [bankId])

  const [title, setTitle] = useState('Coding AI Interview')
  const [questions, setQuestions] = useState([])
  const [phase, setPhase] = useState('questions') // intro | questions
  const [index, setIndex] = useState(0)
  const [code, setCode] = useState('')
  const [textAnswer, setTextAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [runResult, setRunResult] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [transcript, setTranscript] = useState([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState('')
  const [muted, setMuted] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)
  const [complete, setComplete] = useState(false)
  const [finalReport, setFinalReport] = useState(null)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [listening, setListening] = useState(false)
  const [timerLeft, setTimerLeft] = useState(null)
  const [awaitingAnswer, setAwaitingAnswer] = useState(false)

  const startedRef = useRef(false)
  const mutedRef = useRef(false)
  const recognitionRef = useRef(null)
  const inputBaselineRef = useRef('')
  const awaitingRef = useRef(false)
  const listeningRef = useRef(false)
  const timerKeyRef = useRef(0)
  const submitRef = useRef(() => {})

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    warmSpeechVoices()
  }, [])

  useEffect(() => {
    awaitingRef.current = awaitingAnswer
  }, [awaitingAnswer])

  useEffect(() => {
    listeningRef.current = listening
  }, [listening])

  useEffect(() => {
    if (!candidate?.name) {
      navigate(`/coding/${bankId}`, { replace: true })
    }
  }, [bankId, candidate?.name, navigate])

  const current = questions[index]
  const isIntro = phase === 'intro'
  const isCodingQ = !isIntro && Boolean(current?.is_coding)

  const isCodingRef = useRef(false)
  useEffect(() => {
    isCodingRef.current = !isIntro && Boolean(current?.is_coding)
  }, [current?.is_coding, isIntro])

  const stopMic = useCallback(() => {
    listeningRef.current = false
    setListening(false)
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
  }, [])

  const ensureRecognition = useCallback(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return null
    if (recognitionRef.current) return recognitionRef.current

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-IN'
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let interim = ''
      let finalChunk = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i][0].transcript
        if (event.results[i].isFinal) finalChunk += `${piece} `
        else interim += piece
      }
      if (finalChunk) inputBaselineRef.current += finalChunk
      const next = `${inputBaselineRef.current}${interim}`.replace(/^\s+/, '')
      if (isCodingRef.current) setExplanation(next)
      else setTextAnswer(next)
    }

    recognition.onend = () => {
      if (listeningRef.current && awaitingRef.current) {
        setTimeout(() => {
          if (!listeningRef.current || !awaitingRef.current) return
          try {
            recognition.start()
            setListening(true)
          } catch {
            /* ignore */
          }
        }, 180)
      } else {
        setListening(false)
      }
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        listeningRef.current = false
        setListening(false)
        setError('Microphone blocked. Click the lock icon in Chrome address bar → Allow microphone.')
        return
      }
      if (event.error === 'network') {
        setError('Speech service network error. Check internet, then click Mic again.')
      }
      // Keep trying on transient errors while user wants listening
      if (listeningRef.current && awaitingRef.current) {
        setTimeout(() => {
          try {
            recognition.start()
          } catch {
            /* ignore */
          }
        }, 300)
      } else {
        setListening(false)
      }
    }

    return recognition
  }, [])

  const startMic = useCallback(async () => {
    const recognition = ensureRecognition()
    if (!recognition) {
      setError('Voice not supported here. Use Google Chrome on desktop.')
      return false
    }

    // Sync flags immediately (don't wait for React render)
    awaitingRef.current = true
    setAwaitingAnswer(true)
    setError('')

    try {
      stopHumanVoice(); stopNaturalSpeech()
    } catch {
      /* ignore */
    }

    // Ask mic permission (needed after TTS / auto-start)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
      }
    } catch {
      setError('Allow microphone permission, then click Mic.')
      listeningRef.current = false
      setListening(false)
      return false
    }

    await new Promise((r) => setTimeout(r, 250))

    listeningRef.current = true
    setListening(true)
    try {
      recognition.start()
      return true
    } catch {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
      await new Promise((r) => setTimeout(r, 220))
      try {
        recognition.start()
        return true
      } catch (err) {
        listeningRef.current = false
        setListening(false)
        setError('Could not start mic. Click Mic once and speak.')
        console.error(err)
        return false
      }
    }
  }, [ensureRecognition])

  const resetTimerFor = useCallback((q) => {
    timerKeyRef.current += 1
    const secs = q?.is_coding ? CODING_SECONDS : THEORY_SECONDS
    setTimerLeft(secs)
  }, [])

  const startIntro = useCallback(() => {
    setPhase('intro')
    setTextAnswer('')
    inputBaselineRef.current = ''
    setTimerLeft(null)
    setAiSpeaking(true)
    awaitingRef.current = false
    setAwaitingAnswer(false)
    stopMic()
    const aiHello = 'Hi, I am Urbancode AI. Now we will start the interview.'
    const askIntro = 'Please introduce yourself.'
    speakText(aiHello, mutedRef.current, () => {
      speakText(askIntro, mutedRef.current, () => {
        setAiSpeaking(false)
        awaitingRef.current = true
        setAwaitingAnswer(true)
        timerKeyRef.current += 1
        setTimerLeft(THEORY_SECONDS)
        setTimeout(() => startMic(), 700)
      })
    })
  }, [startMic, stopMic])

  const askCurrent = useCallback(
    (q, qIndex) => {
      if (!q) return
      const spoken = `Question ${qIndex + 1}. ${q.question}`
      setAiSpeaking(true)
      awaitingRef.current = false
      setAwaitingAnswer(false)
      stopMic()
      speakText(spoken, mutedRef.current, () => {
        setAiSpeaking(false)
        awaitingRef.current = true
        setAwaitingAnswer(true)
        resetTimerFor(q)
        // Auto mic after TTS fully stops (Chrome needs a short gap)
        setTimeout(() => {
          startMic()
        }, 700)
      })
    },
    [resetTimerFor, startMic, stopMic],
  )

  // Init recognition object early
  useEffect(() => {
    ensureRecognition()
  }, [ensureRecognition])

  // Countdown timer
  useEffect(() => {
    if (timerLeft == null || complete || loading || aiSpeaking) return undefined
    if (timerLeft <= 0) {
      stopMic()
      if (phase === 'intro') submitIntroRef.current?.(true)
      else submitRef.current?.(true)
      return undefined
    }
    const id = setTimeout(() => setTimerLeft((t) => (t == null ? t : t - 1)), 1000)
    return () => clearTimeout(id)
  }, [timerLeft, complete, loading, aiSpeaking, stopMic, phase])

  const submitIntroRef = useRef(() => {})

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    ;(async () => {
      try {
        const { ok, body, status } = await apiFetch(`/api/coding-interview/bank/${encodeURIComponent(bankId)}`)
        if (!ok) {
          if (status === 410 || /expired|already completed/i.test(String(body?.detail || ''))) {
            setComplete(true)
            setFinalReport({ expired: true })
            setGeneratingReport(false)
            return
          }
          throw new Error(formatErrorDetail(body.detail, 'Failed to load'))
        }
        const qs = body.questions || []
        setTitle(body.title || 'Coding AI Interview')
        setQuestions(qs)
        const introOn = Boolean(body.self_intro_enabled)
        if (qs[0]) {
          if (qs[0].is_coding) setCode(qs[0].starter_code || '')
          if (introOn) {
            startIntro()
          } else {
            setPhase('questions')
            setAiSpeaking(true)
            const aiHello = 'Hi, I am Urbancode AI. Now we will start the interview.'
            speakText(aiHello, mutedRef.current, () => {
              setAiSpeaking(false)
              askCurrent(qs[0], 0)
            })
          }
        }
      } catch (err) {
        setError(formatErrorDetail(err?.message || err, 'Load failed'))
      } finally {
        setLoading(false)
      }
    })()
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }
      stopHumanVoice(); stopNaturalSpeech()
    }
  }, [askCurrent, bankId, candidate.name, startIntro])

  const beginQuestions = (seedTranscript) => {
    setPhase('questions')
    setIndex(0)
    const nq = questions[0]
    setCode(nq?.is_coding ? nq.starter_code || '' : '')
    setTextAnswer('')
    setExplanation('')
    inputBaselineRef.current = ''
    setRunResult(null)
    setAnalysis(null)
    setTimerLeft(null)
    if (seedTranscript) setTranscript(seedTranscript)
    speakText('Great. Now we will start the interview questions.', mutedRef.current, () => {
      if (nq) askCurrent(nq, 0)
    })
  }

  const submitIntro = async (fromTimer = false) => {
    if (phase !== 'intro' || evaluating) return
    stopMic()
    setAwaitingAnswer(false)
    setEvaluating(true)
    setError('')
    try {
      const answer = textAnswer.trim()
      if (!answer && !fromTimer) {
        setError('Please fill your self-intro before continuing.')
        setEvaluating(false)
        setAwaitingAnswer(true)
        return
      }
      const words = (answer || '').trim().split(/\s+/).filter(Boolean)
      const overall = !answer ? 3 : Math.min(9, Math.max(5, Math.round(words.length / 12) + 5))
      const entry = {
        mode: 'intro',
        question: 'Self introduction',
        question_id: 'self-intro',
        code: '',
        explanation: answer || '(No intro — time up)',
        run: null,
        analysis: {
          overall,
          correctness: overall,
          clarity: overall,
          depth: Math.max(4, overall - 1),
          relevance: overall,
          summary: 'Self-introduction recorded.',
          strengths: words.length >= 20 ? ['Shared a clear introduction'] : ['Completed self-intro'],
          improvements:
            words.length < 25 ? ['Add more detail about skills and goals'] : ['Keep practicing concise delivery'],
          source: 'local',
        },
      }
      const nextTranscript = [...transcript, entry]
      setTranscript(nextTranscript)
      setEvaluating(false)
      beginQuestions(nextTranscript)
    } catch (err) {
      setError(formatErrorDetail(err?.message || err, 'Could not save intro'))
      setEvaluating(false)
      setAwaitingAnswer(true)
    }
  }

  submitIntroRef.current = submitIntro

  const goNext = (nextTranscript) => {
    const nextIndex = index + 1
    if (nextIndex >= questions.length) {
      finishInterview(nextTranscript)
      return
    }
    setIndex(nextIndex)
    const nq = questions[nextIndex]
    setCode(nq.is_coding ? nq.starter_code || '' : '')
    setTextAnswer('')
    setExplanation('')
    inputBaselineRef.current = ''
    setRunResult(null)
    setAnalysis(null)
    setTimerLeft(null)
    askCurrent(nq, nextIndex)
  }

  const toggleMic = async () => {
    if (aiSpeaking) {
      setError('Wait for AI to finish asking, then click Mic.')
      return
    }
    if (listening) {
      stopMic()
      return
    }
    // Preserve what user already typed/spoke
    const currentText = isCodingQ ? explanation : textAnswer
    inputBaselineRef.current = currentText && !currentText.endsWith(' ') ? `${currentText} ` : currentText || ''
    const ok = await startMic()
    if (ok) setError('')
  }

  const runCode = async () => {
    if (!current?.is_coding) return
    setRunning(true)
    setError('')
    setAnalysis(null)
    try {
      const { ok, body } = await apiFetch('/api/coding-interview/run', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: bankId,
          question_id: current.id,
          code,
          language: current.language,
        }),
      })
      if (!ok) throw new Error(formatErrorDetail(body.detail, 'Run failed'))
      setRunResult(body)
    } catch (err) {
      setError(formatErrorDetail(err?.message || err, 'Run failed'))
    } finally {
      setRunning(false)
    }
  }

  const submitAndNext = async (fromTimer = false) => {
    if (!current || evaluating) return
    stopMic()
    setAwaitingAnswer(false)
    setEvaluating(true)
    setError('')
    try {
      if (!current.is_coding) {
        const answer = textAnswer.trim()
        if (!answer && !fromTimer) {
          setError('Please speak or type your answer before submitting.')
          setEvaluating(false)
          setAwaitingAnswer(true)
          return
        }
        const evalRes = await apiFetch('/api/coding-interview/evaluate', {
          method: 'POST',
          body: JSON.stringify({
            bank_id: bankId,
            question_id: current.id,
            mode: 'theory',
            answer: answer || '(No answer — time up)',
            explanation: answer || '(No answer — time up)',
            code: '',
          }),
        })
        let analysisData = evalRes.body?.analysis
        if (!evalRes.ok || !analysisData) {
          // Local fallback if backend bank expired / evaluate failed
          const words = (answer || '').trim().split(/\s+/).filter(Boolean)
          const overall = !answer ? 2 : Math.min(9, Math.max(4, Math.round(words.length / 8) + 4))
          analysisData = {
            correctness: overall,
            clarity: overall,
            depth: Math.max(3, overall - 1),
            relevance: overall,
            overall,
            summary: evalRes.ok
              ? `Scored ${overall}/10.`
              : `Scored ${overall}/10 (local). ${formatErrorDetail(evalRes.body?.detail, '')}`.trim(),
            strengths: words.length >= 10 ? ['Answer had reasonable length'] : ['Attempted the question'],
            improvements: words.length < 15 ? ['Add more detail'] : ['Add examples'],
            source: 'local',
          }
        }
        const entry = {
          question: current.question,
          question_id: current.id,
          code: '',
          explanation: answer || '(No answer — time up)',
          run: null,
          analysis: analysisData,
          mode: 'theory',
        }
        const nextTranscript = [...transcript, entry]
        setTranscript(nextTranscript)
        setAnalysis(analysisData)
        setTimerLeft(null)
        setError('')
        goNext(nextTranscript)
        return
      }

      let latestRun = runResult
      if (!latestRun) {
        const runRes = await apiFetch('/api/coding-interview/run', {
          method: 'POST',
          body: JSON.stringify({
            bank_id: bankId,
            question_id: current.id,
            code,
            language: current.language,
          }),
        })
        if (!runRes.ok) throw new Error(formatErrorDetail(runRes.body.detail, 'Run failed'))
        latestRun = runRes.body
        setRunResult(latestRun)
      }

      const { ok, body } = await apiFetch('/api/coding-interview/evaluate', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: bankId,
          question_id: current.id,
          code,
          language: current.language,
          explanation,
          run_result: latestRun,
          mode: 'coding',
        }),
      })
      if (!ok) throw new Error(formatErrorDetail(body.detail, 'Evaluate failed'))
      setAnalysis(body.analysis)

      const entry = {
        question: current.question,
        question_id: current.id,
        code,
        explanation,
        run: latestRun,
        analysis: body.analysis,
        mode: 'coding',
      }
      const nextTranscript = [...transcript, entry]
      setTranscript(nextTranscript)
      setTimerLeft(null)
      goNext(nextTranscript)
    } catch (err) {
      setError(formatErrorDetail(err?.message || err, 'Submit failed'))
      setAwaitingAnswer(true)
    } finally {
      setEvaluating(false)
    }
  }

  submitRef.current = submitAndNext

  const buildLocalReport = (fullTranscript) => {
    const items = fullTranscript || []
    const theoryCount = items.filter((t) => t.mode !== 'coding' && t.mode !== 'intro').length
    const codingCount = items.filter((t) => t.mode === 'coding').length
    const strengths = []
    const improvements = []
    items.forEach((t) => {
      ;(t.analysis?.strengths || []).forEach((s) => {
        if (s && !strengths.includes(s)) strengths.push(s)
      })
      ;(t.analysis?.improvements || []).forEach((s) => {
        if (s && !improvements.includes(s)) improvements.push(s)
      })
    })
    const scored = items.filter((t) => t.mode !== 'intro')
    const scores = scored.map((t) => Number(t.analysis?.overall || 0))
    const avg = scores.length
      ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
      : 0
    const grade =
      avg >= 8 ? 'Excellent' : avg >= 6.5 ? 'Good' : avg >= 5 ? 'Average' : 'Needs Improvement'
    const recommendation =
      avg >= 6.5
        ? 'Keep practicing weak topics and try another mock round.'
        : 'Revise core concepts and answer with more structure next time.'
    return {
      overall: avg,
      grade,
      summary: `${candidate.name || 'Candidate'} completed ${items.length} question(s) (${theoryCount} theory, ${codingCount} coding). Overall score ${avg}/10 (${grade}).`,
      recommendation,
      strengths: strengths.length ? strengths.slice(0, 6) : ['Completed the interview session'],
      improvements: improvements.length
        ? improvements.slice(0, 6)
        : ['Add more detail and examples in answers'],
      totalQuestions: items.length,
      theoryCount,
      codingCount,
      testsPassed: items.reduce((n, t) => n + Number(t.run?.passed || 0), 0),
      testsTotal: items.reduce((n, t) => n + Number(t.run?.total || 0), 0),
      items,
    }
  }

  const finishInterview = async (fullTranscript) => {
    setGeneratingReport(true)
    setComplete(true)
    speakText(
      'Thank you. Your interview is complete. Our team will contact you soon.',
      mutedRef.current,
    )

    const local = buildLocalReport(fullTranscript)
    const sanitizeReport = (incoming) => {
      const report = { ...local, ...(incoming || {}) }
      const badSummary =
        !report.summary ||
        /method not allowed|not allowed|failed|error|internal server/i.test(String(report.summary))
      if (badSummary) report.summary = local.summary
      if (!report.recommendation || /method not allowed|not allowed/i.test(String(report.recommendation))) {
        report.recommendation = local.recommendation
      }
      if (!report.grade || /method not allowed/i.test(String(report.grade))) report.grade = local.grade
      if (report.overall == null || Number.isNaN(Number(report.overall))) report.overall = local.overall
      if (!report.strengths?.length) report.strengths = local.strengths
      if (!report.improvements?.length) report.improvements = local.improvements
      report.items = report.items?.length ? report.items : local.items
      report.totalQuestions = report.totalQuestions ?? local.totalQuestions
      report.theoryCount = report.theoryCount ?? local.theoryCount
      report.codingCount = report.codingCount ?? local.codingCount
      report.testsPassed = report.testsPassed ?? local.testsPassed
      report.testsTotal = report.testsTotal ?? local.testsTotal
      return report
    }

    try {
      const { ok, body } = await apiFetch('/api/coding-interview/final-report', {
        method: 'POST',
        body: JSON.stringify({
          bank_id: bankId,
          title,
          candidate_name: candidate.name || '',
          candidate_email: candidate.email || '',
          transcript: fullTranscript,
        }),
      })
      if (!ok) throw new Error(formatErrorDetail(body?.detail, 'Report generation failed'))
      setFinalReport(sanitizeReport(body?.report || {}))
    } catch {
      setFinalReport(sanitizeReport(local))
    } finally {
      setGeneratingReport(false)
    }
  }

  if (loading) {
    return (
      <div className="coding-room coding-room--center">
        <p>Loading interview…</p>
      </div>
    )
  }

  if (complete) {
    if (generatingReport && !finalReport) {
      return (
        <div className="coding-room coding-room--center">
          <div className="report-loading">
            <div className="report-spinner" />
            <h2>Finishing your interview…</h2>
            <p>Please wait a moment</p>
          </div>
        </div>
      )
    }

    return (
      <div className="coding-room coding-room--center">
        <div className="thanks-card">
          <p className="eyebrow">Interview complete</p>
          <h1>Thank you{candidate.name ? `, ${candidate.name}` : ''}!</h1>
          <p className="thanks-card__lead">
            Your responses have been submitted successfully. Our team will contact you soon.
          </p>
          <p className="thanks-card__note">This interview link has now expired and cannot be reused.</p>
          <button type="button" className="coding-btn primary" onClick={() => navigate('/')}>
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`coding-room${isCodingQ ? ' is-coding' : ' is-theory'}`}>
      <header className="coding-room__header">
        <button type="button" className="coding-btn ghost" onClick={() => navigate(`/coding/${bankId}`)}>
          ← Exit
        </button>
        <div className="coding-room__title-block">
          <p className="eyebrow">Live AI Interview</p>
          <h1>{title}</h1>
        </div>
        <div className="coding-room__meta">
          {timerLeft != null && (
            <div className={`coding-timer${timerLeft <= 15 ? ' warn' : ''}`} title="Time left for this question">
              <i className="fas fa-clock" /> {formatTimer(timerLeft)}
            </div>
          )}
          <button
            type="button"
            className="coding-btn ghost"
            onClick={() => {
              setMuted((m) => {
                if (!m) { stopHumanVoice(); stopNaturalSpeech() }
                return !m
              })
            }}
          >
            {muted ? 'Unmute AI' : 'Mute AI'}
          </button>
          <div className="q-progress-chip">
            <span>
              {isIntro
                ? 'Intro'
                : `${Math.min(index + 1, questions.length)}/${questions.length}`}
            </span>
            <div className="q-progress-bar">
              <i
                style={{
                  width: isIntro
                    ? '8%'
                    : `${questions.length ? (Math.min(index + 1, questions.length) / questions.length) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </div>
      </header>

      <div
        className={`status-banner ${
          aiSpeaking ? 'speaking' : listening ? 'listening' : awaitingAnswer ? 'your-turn' : 'idle'
        }`}
      >
        {aiSpeaking
          ? isIntro
            ? 'AI is welcoming you — please listen'
            : 'AI is asking the question — please listen'
          : listening
            ? isIntro
              ? 'Mic is on — speak your introduction'
              : 'Mic is on — speak your answer now'
            : awaitingAnswer
              ? isIntro
                ? 'Your turn — speak or type your introduction'
                : 'Your turn — click Mic or type your answer'
              : 'Getting ready…'}
      </div>

      <div className={`coding-room__grid${isCodingQ ? '' : ' theory-grid'}`}>
        <section className="coding-panel question-panel">
          <div className="question-top-row">
            <span className={`type-pill ${isIntro ? 'theory' : isCodingQ ? 'coding' : 'theory'}`}>
              {isIntro ? 'Self intro' : isCodingQ ? 'Coding' : 'Theory / MCQ'}
            </span>
            <span className="q-num">{isIntro ? 'Step 1' : `Question ${index + 1}`}</span>
          </div>

          <h2 className="question-heading">
            {isIntro ? 'Please introduce yourself' : current?.question}
          </h2>

          {isIntro && (
            <p className="muted meta-line">Speak or type your introduction, then submit.</p>
          )}

          {isCodingQ && (
            <p className="muted meta-line">
              Language: <strong>{current?.language}</strong> · {current?.test_count || 0} test cases
            </p>
          )}
          {isCodingQ && current?.sample_tests?.length > 0 && (
            <div className="sample-tests">
              <h4>Sample input(s)</h4>
              {current.sample_tests.map((t) => (
                <pre key={t.index}>{t.input || '(empty)'}</pre>
              ))}
            </div>
          )}

          {(isIntro || !isCodingQ) && (
            <div className="answer-block">
              <label htmlFor="text-answer">{isIntro ? 'Your self-introduction' : 'Your answer'}</label>
              <textarea
                id="text-answer"
                className={listening ? 'is-listening' : ''}
                value={textAnswer}
                onChange={(e) => {
                  setTextAnswer(e.target.value)
                  inputBaselineRef.current = e.target.value
                }}
                placeholder={
                  aiSpeaking
                    ? 'Wait for the AI to finish…'
                    : listening
                      ? 'Listening… keep speaking'
                      : isIntro
                        ? 'Speak or type your introduction here…'
                        : 'Click the big Mic button, then speak — or type here'
                }
                rows={isIntro ? 7 : 7}
                disabled={aiSpeaking}
              />

              <div className="theory-actions">
                <button
                  type="button"
                  className={`mic-cta${listening ? ' active' : ''}`}
                  onClick={toggleMic}
                  disabled={aiSpeaking || evaluating}
                >
                  <span className="mic-cta__icon">
                    <i className="fas fa-microphone" />
                  </span>
                  <span className="mic-cta__text">
                    <strong>{listening ? 'Listening…' : isIntro ? 'Speak intro' : 'Speak answer'}</strong>
                    <small>{listening ? 'Click again to stop' : 'Tap once, then talk'}</small>
                  </span>
                </button>
                <button
                  type="button"
                  className="coding-btn primary submit-cta"
                  onClick={() => (isIntro ? submitIntro(false) : submitAndNext(false))}
                  disabled={evaluating || aiSpeaking}
                >
                  {evaluating
                    ? 'Saving…'
                    : isIntro
                      ? 'Submit intro & continue'
                      : index + 1 >= questions.length
                        ? 'Finish interview'
                        : 'Submit & next'}
                </button>
              </div>
            </div>
          )}

          {isCodingQ && (
            <>
              <label htmlFor="explain">Your explanation (optional)</label>
              <textarea
                id="explain"
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                placeholder="Briefly explain time/space complexity and approach…"
                rows={3}
              />
            </>
          )}
          {error && (
            <p className="error friendly-error">
              {typeof error === 'string' ? error : formatErrorDetail(error)}
            </p>
          )}
        </section>

        <aside
          className={`coding-panel avatar-panel${aiSpeaking ? ' is-talking' : ''}${
            listening ? ' is-listening-mode' : ''
          }`}
        >
          <AiInterviewerAvatar
            speaking={aiSpeaking}
            listening={listening}
            showStatus
          />
        </aside>

        {isCodingQ && (
          <>
            <section className="coding-panel editor-panel">
              <div className="editor-toolbar">
                <span>Monaco Editor</span>
                <div className="editor-actions">
                  <button type="button" className="coding-btn" onClick={runCode} disabled={running || evaluating}>
                    {running ? 'Running…' : 'Run Code'}
                  </button>
                  <button
                    type="button"
                    className="coding-btn primary"
                    onClick={submitAndNext}
                    disabled={evaluating || running}
                  >
                    {evaluating
                      ? 'Evaluating…'
                      : index + 1 >= questions.length
                        ? 'Submit & Finish'
                        : 'Submit & Next'}
                  </button>
                </div>
              </div>
              <div className="editor-wrap">
                <Editor
                  height="100%"
                  language={
                    {
                      javascript: 'javascript',
                      node: 'javascript',
                      express: 'javascript',
                      react: 'javascript',
                      python: 'python',
                      java: 'java',
                      html: 'html',
                      css: 'css',
                      sql: 'sql',
                      mssql: 'sql',
                    }[String(current?.language || '').toLowerCase()] || 'javascript'
                  }
                  theme="vs-dark"
                  value={code}
                  onChange={(v) => setCode(v || '')}
                  options={{
                    fontSize: 14,
                    minimap: { enabled: false },
                    automaticLayout: true,
                    scrollBeyondLastLine: false,
                  }}
                />
              </div>
            </section>

            <section className="coding-panel results-panel">
              <h3>Test Cases</h3>
              {!runResult && <p className="muted">Click Run Code to execute against admin test cases.</p>}
              {runResult && (
                <>
                  <p className={runResult.all_passed ? 'pass' : 'fail'}>
                    {runResult.passed}/{runResult.total} passed ({runResult.pass_rate}%)
                  </p>
                  <ul className="test-list">
                    {(runResult.results || []).map((r) => (
                      <li key={r.index} className={r.passed ? 'ok' : 'bad'}>
                        <strong>
                          #{r.index} {r.passed ? 'PASS' : 'FAIL'}
                        </strong>
                        <div>
                          Input: <code>{r.input || '(empty)'}</code>
                        </div>
                        <div>
                          Expected: <code>{r.expected}</code>
                        </div>
                        <div>
                          Got: <code>{r.actual || r.stderr || '—'}</code>
                        </div>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {analysis && (
                <div className="eval-box">
                  <h3>AI Evaluation</h3>
                  <div className="coding-report__scores">
                    <span>Correct {analysis.correctness}</span>
                    <span>Quality {analysis.code_quality}</span>
                    <span>Time {analysis.time_complexity}</span>
                    <span>Space {analysis.space_complexity}</span>
                    <span>Overall {analysis.overall}</span>
                  </div>
                  <p>{analysis.summary}</p>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
