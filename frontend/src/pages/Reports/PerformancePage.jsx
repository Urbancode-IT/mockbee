import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import { KEYS, getItem, getJSON, setItem, setJSON } from '../../utils/storage'
import {
  QUICK_INTERVIEW_MODES,
  normalizeInterviewSession,
  sessionKey,
  syncInterviewHistoryFromDB,
} from '../../utils/interviewHistory'
import '../../styles/performance.css'

const ROLE_KEYWORDS = {
  Python: ['decorators', 'gil', 'memory', 'generators', 'multiprocessing', 'oop'],
  Frontend: ['virtual dom', 'react', 'css', 'flexbox', 'grid', 'hooks', 'performance', 'rendering', 'javascript'],
  Backend: ['restful', 'rest', 'sql', 'nosql', 'database', 'indexing', 'auth', 'security', 'microservices'],
  ML: ['supervised', 'unsupervised', 'regression', 'neural', 'transformers', 'training', 'overfitting'],
  'Data Scientist': ['stats', 'eda', 'visualization', 'pandas', 'hypothesis', 'analysis'],
  Cloud: ['aws', 'azure', 'serverless', 'infrastructure', 'scaling', 'redundancy'],
  DevOps: ['pipeline', 'cicd', 'docker', 'kubernetes', 'monitoring', 'automation'],
  Cybersecurity: ['encryption', 'vulnerability', 'security', 'owasp', 'pen testing'],
  Network: ['osi', 'protocols', 'tcp', 'udp', 'routing', 'switching', 'dns'],
  'System Architect': ['scalability', 'architecture', 'distributed', 'load balancers', 'multi-tenant'],
  QA: ['manual', 'automated', 'testing', 'regression', 'smoke', 'qa'],
  Mobile: ['flutter', 'react native', 'android', 'ios', 'native', 'cross-platform'],
}

const PHASE_META = [
  { key: 'self_intro', label: 'Self Introduction', icon: 'fas fa-user-circle', scoreKey: 'selfIntro' },
  { key: 'projects_skills', label: 'Projects & Skills', icon: 'fas fa-code', scoreKey: 'projects_skills' },
  { key: 'technical', label: 'Technical', icon: 'fas fa-microchip', scoreKey: 'technical' },
  { key: 'optimization', label: 'Optimization', icon: 'fas fa-bolt', scoreKey: 'optimization' },
  { key: 'behavioural', label: 'Behavioural', icon: 'fas fa-users', scoreKey: 'behavioural' },
  { key: 'hr_logistics', label: 'HR & Logistics', icon: 'fas fa-briefcase', scoreKey: 'hr_logistics' },
]

function analyzePerformance(transcript, role) {
  if (!transcript?.length) {
    return {
      overall: 0,
      clarity: 0,
      technical: 0,
      confidence: 0,
      questionScores: [0],
      confidenceScores: [0],
      feedback: 'Please complete an interview session to receive customized AI feedback.',
      strengths: ['Completing sessions'],
      improvements: ['Start an interview'],
    }
  }

  let roleKeywords = []
  for (const key in ROLE_KEYWORDS) {
    if (role.toLowerCase().includes(key.toLowerCase())) {
      roleKeywords = ROLE_KEYWORDS[key]
      break
    }
  }

  let totalClarity = 0
  let totalTechnical = 0
  let totalConfidence = 0
  const questionScores = []
  const confidenceScores = []

  transcript.forEach((item) => {
    const text = (item.answer || '').toLowerCase()
    const wordCount = (item.answer || '').trim().split(/\s+/).filter(Boolean).length
    const matched = roleKeywords.filter((kw) => text.includes(kw.toLowerCase()))

    let techScore = 50 + matched.length * 8
    if (wordCount > 15) techScore += 8
    if (wordCount > 40) techScore += 10
    if (wordCount > 80) techScore += 7
    techScore = Math.min(techScore, 98)

    let clarityScore = 55
    if (wordCount < 3) clarityScore = 10
    else if (wordCount < 8) clarityScore = 30
    else if (wordCount < 15) clarityScore = 45
    else clarityScore = Math.min(55 + wordCount * 0.3, 92)

    let confScore = 55 + wordCount * 0.8
    if (matched.length > 0) confScore += 10
    confScore = Math.min(confScore, 95)

    if (wordCount <= 2 && matched.length === 0) {
      techScore = 10
      clarityScore = 10
      confScore = 15
    }

    questionScores.push(Math.round(techScore))
    confidenceScores.push(Math.round(confScore))
    totalClarity += clarityScore
    totalTechnical += techScore
    totalConfidence += confScore
  })

  const avgClarity = Math.round(totalClarity / transcript.length)
  const avgTechnical = Math.round(totalTechnical / transcript.length)
  const avgConfidence = Math.round(totalConfidence / transcript.length)
  const overall = Math.round((avgClarity + avgTechnical + avgConfidence) / 3)

  const strengths = []
  if (overall > 70) {
    if (avgTechnical > 75) strengths.push('Strong Subject Matter Expertise')
    if (avgClarity > 80) strengths.push('Articulate & Clear Communication')
    if (avgConfidence > 80) strengths.push('Exceptional Professional Confidence')
  } else if (overall > 40) {
    strengths.push('Willingness to Engage', 'Basic Role Familiarity')
  } else {
    strengths.push('Initial Attempt Made', 'Potential for Growth')
  }
  if (strengths.length < 3) strengths.push('Consistent Discussion Flow')

  const improvements = []
  if (overall < 40) {
    improvements.push('Provide detailed, structured technical answers')
    improvements.push('Ensure answers directly address the interview question')
    improvements.push(`Focus on learning core role concepts: ${roleKeywords.slice(0, 3).join(', ')}`)
  } else {
    if (avgTechnical < 70) improvements.push('Deepen technical explanations with specific examples')
    if (avgClarity < 75) improvements.push('Structure responses more linearly for better clarity')
    if (avgConfidence < 75) improvements.push('Maintain a more assertive tone during challenges')
  }
  improvements.push('Incorporate quantifiable metrics in STAR responses')

  let feedback = ''
  if (overall > 85) feedback = 'Outstanding! You handled technical questions with precision and maintained a leadership-level presence.'
  else if (overall > 70) feedback = 'Very good. You possess a strong grasp of the fundamentals. Focus on adding more quantitative data to your answers.'
  else if (overall > 40) feedback = 'A fair start, but your answers lack the technical depth and clarity required for this seniority level.'
  else feedback = 'Critical Improvement Needed. Your responses were either too brief or irrelevant to the technical requirements of the role.'

  return {
    overall,
    clarity: Math.min(avgClarity, 100),
    technical: Math.min(avgTechnical, 100),
    confidence: Math.min(avgConfidence, 100),
    selfIntro: Math.min(avgClarity, 100),
    optimization: Math.min(avgTechnical, 100),
    behavioural: Math.min(avgConfidence, 100),
    questionScores,
    confidenceScores,
    feedback,
    strengths,
    improvements,
  }
}

function skillTag(val) {
  if (val > 80) return 'Excellent'
  if (val > 60) return 'Good'
  return 'Needs Work'
}

function historyIcon(role = '') {
  const r = role.toLowerCase()
  if (r.includes('5-minute')) return 'fas fa-stopwatch'
  if (r.includes('1-question')) return 'fas fa-bolt'
  if (r.includes('rapid')) return 'fas fa-fire'
  if (r.includes('warm-up')) return 'fas fa-mug-hot'
  if (r.includes('python')) return 'fab fa-python'
  if (r.includes('cloud')) return 'fas fa-cloud'
  if (r.includes('front')) return 'fas fa-globe'
  if (r.includes('data')) return 'fas fa-chart-bar'
  if (r.includes('ml')) return 'fas fa-brain'
  if (r.includes('back')) return 'fas fa-server'
  if (r.includes('system architect')) return 'fas fa-city'
  if (r.includes('qa')) return 'fas fa-flask'
  if (r.includes('mobile')) return 'fas fa-mobile-alt'
  if (r.includes('devops')) return 'fas fa-sync-alt'
  if (r.includes('cyber')) return 'fas fa-shield-alt'
  if (r.includes('network')) return 'fas fa-satellite-dish'
  if (r.includes('communication')) return 'fas fa-comments'
  return 'fas fa-user-tie'
}

function buildChart(qScores = [], cScores = [], labels) {
  const chartLabels = labels || qScores.map((_, i) => `Q${i + 1}`)
  const width = 460
  const startX = 60
  const stepX = qScores.length > 1 ? width / (qScores.length - 1) : 0
  let pathD = ''
  const confPoints = []
  const scoreNodes = []
  const confNodes = []
  const labelNodes = []

  qScores.forEach((score, i) => {
    const x = startX + i * stepX
    const yScore = 180 - score * 1.5
    const yConf = 180 - (cScores[i] || 50) * 1.5
    pathD += i === 0 ? `M ${x},${yScore}` : ` L ${x},${yScore}`
    confPoints.push(`${x},${yConf}`)
    scoreNodes.push({ x, y: yScore, label: chartLabels[i], score })
    confNodes.push({ x, y: yConf, score: Math.round(cScores[i] || 50) })
    labelNodes.push({ x, label: chartLabels[i] })
  })

  return { pathD, confPoints: confPoints.join(' '), scoreNodes, confNodes, labelNodes }
}

function persistAnalysis(sessionData, analysis, transcript) {
  const histories = getJSON(KEYS.interviews, [])
  let idx = sessionData.id
    ? histories.findIndex((s) => String(s.id) === String(sessionData.id))
    : histories.findIndex((s) => s.role === sessionData.role && s.date === sessionData.date)

  if (idx === -1) {
    histories.push({ ...sessionData, id: sessionData.id ? String(sessionData.id) : String(Date.now()) })
    idx = histories.length - 1
  }

  histories[idx].analysis = analysis
  setJSON(KEYS.interviews, histories)

  const recentRaw = getJSON(KEYS.recentInterview, null)
  if (
    recentRaw &&
    (String(recentRaw.id) === String(sessionData.id) ||
      (recentRaw.role === sessionData.role && recentRaw.date === sessionData.date))
  ) {
    setItem(KEYS.recentInterview, JSON.stringify({ ...recentRaw, analysis }))
  }

  const userEmail = getItem(KEYS.userEmail)
  if (userEmail) {
    apiFetch('/api/interview/save', {
      method: 'POST',
      body: JSON.stringify({
        email: userEmail,
        role: histories[idx].role,
        date: histories[idx].date,
        score: analysis.overall,
        analysis,
        transcript,
        conversationHistory: histories[idx].conversationHistory || sessionData.conversationHistory || [],
        totalQuestions:
          histories[idx].totalQuestions ||
          sessionData.totalQuestions ||
          (transcript ? transcript.length : 0),
        mode: histories[idx].mode || 'standard',
        session_id: histories[idx].id,
        isQuick: histories[idx].isQuick,
        isPro: histories[idx].isPro,
        topic: histories[idx].topic || histories[idx].role,
      }),
    }).catch((e) => console.error('DB Save Error:', e))
  }
}

export default function PerformancePage({ forceQuickFilter = false }) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const filterParam = forceQuickFilter ? 'quick' : searchParams.get('filter')
  const viewParam = searchParams.get('view')

  const [history, setHistory] = useState([])
  const [view, setView] = useState('history')
  const [session, setSession] = useState(null)
  const [analysis, setAnalysis] = useState(null)
  const [feedbackText, setFeedbackText] = useState('Analyzing your interview responses...')
  const [slide, setSlide] = useState(0)
  const [hideBack, setHideBack] = useState(false)
  const [proTheme, setProTheme] = useState(false)
  const [loading, setLoading] = useState(true)

  const transcript = session?.transcript || []
  const chart = useMemo(() => {
    if (!analysis) return null
    const labels =
      analysis.questionScores?.length === 6
        ? ['Intro', 'Projects', 'Technical', 'Optimize', 'Behaviour', 'HR']
        : undefined
    return buildChart(analysis.questionScores || [], analysis.confidenceScores || [], labels)
  }, [analysis])

  const openSession = useCallback(async (sessionData) => {
    const normalized = normalizeInterviewSession(sessionData)
    setSession(normalized)
    setView('detail')
    setSlide(0)
    setAnalysis(null)

    const isQuick = QUICK_INTERVIEW_MODES.includes(normalized.mode)
    setProTheme(!!normalized.isPro)
    setHideBack(!!normalized.isPro || isQuick)

    const hasSaved =
      normalized.analysis &&
      Object.keys(normalized.analysis).length > 0 &&
      normalized.analysis.overall !== undefined

    if (hasSaved) {
      setAnalysis(normalized.analysis)
      setFeedbackText(`"${normalized.analysis.feedback || ''}"`)
      return
    }

    setFeedbackText('Analyzing performance with AI... please wait.')

    let hist = []
    if (normalized.conversationHistory?.length) {
      hist = normalized.conversationHistory
    } else if (normalized.transcript?.length) {
      normalized.transcript.forEach((t) => {
        hist.push({ role: 'assistant', content: t.question })
        if (t.answer) hist.push({ role: 'user', content: t.answer })
      })
    }

    try {
      const { ok, body } = await apiFetch('/api/interview/evaluate', {
        method: 'POST',
        body: JSON.stringify({ role: normalized.role, level: 'Mid-level', history: hist }),
      })

      if (!ok || body.status !== 'success' || !body.evaluation) {
        throw new Error(body.detail || 'API returned invalid status.')
      }

      const ev = body.evaluation
      const phaseScores = [
        (ev.self_intro || 5) * 10,
        (ev.projects_skills || 5) * 10,
        (ev.technical || 5) * 10,
        (ev.optimization || 5) * 10,
        (ev.behavioural || 5) * 10,
        (ev.hr_logistics || 5) * 10,
      ]
      const confBase = (ev.confidence || 5) * 10
      const confScores = phaseScores.map((s) =>
        Math.min(100, Math.max(0, Math.round(s * 0.7 + confBase * 0.3))),
      )

      const nextAnalysis = {
        overall: (ev.overall || 5) * 10,
        clarity: (ev.clarity || ev.communication || 5) * 10,
        technical: (ev.technical || 5) * 10,
        confidence: confBase,
        selfIntro: phaseScores[0],
        optimization: phaseScores[3],
        behavioural: phaseScores[4],
        projects_skills: phaseScores[1],
        hr_logistics: phaseScores[5],
        questionScores: phaseScores,
        confidenceScores: confScores,
        feedback: ev.summary || 'Good completion of the interview.',
        strengths: ev.strengths || ['Completed assessment'],
        improvements: ev.improvements || ['Practice more'],
        phase_feedback: ev.phase_feedback || {},
      }

      persistAnalysis(normalized, nextAnalysis, normalized.transcript)
      setAnalysis(nextAnalysis)
      setFeedbackText(`"${nextAnalysis.feedback}"`)
    } catch (err) {
      console.error('Evaluation error:', err)
      const local = analyzePerformance(normalized.transcript, normalized.role)
      persistAnalysis(normalized, local, normalized.transcript)
      setAnalysis(local)
      setFeedbackText(
        err.message?.toLowerCase().includes('fetch')
          ? '⚠️ Backend offline — showing local analysis based on your answers.'
          : `"${local.feedback}"`,
      )
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const synced = await syncInterviewHistoryFromDB()
      if (cancelled) return
      setHistory(synced)

      if (viewParam === 'report') {
        const recent = normalizeInterviewSession(getJSON(KEYS.recentInterview, null))
        const sessionToShow = recent || (synced.length ? synced[synced.length - 1] : null)
        if (sessionToShow) openSession(sessionToShow)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [openSession, viewParam])

  useEffect(() => {
    document.body.classList.toggle('pro-theme', proTheme)
    return () => document.body.classList.remove('pro-theme')
  }, [proTheme])

  const uniqueHistory = useMemo(() => {
    const filtered = history.filter((sessionItem) => {
      if (filterParam === 'quick') return sessionItem.isQuick
      return sessionItem.isPro || filterParam !== 'quick'
    })
    const seen = new Set()
    const unique = []
    filtered.forEach((s) => {
      const id = sessionKey(s)
      if (!seen.has(id)) {
        seen.add(id)
        unique.push(s)
      }
    })
    return unique
  }, [filterParam, history])

  const deleteReport = (event, indexInFullHistory) => {
    event.stopPropagation()
    if (!window.confirm("Delete this report? You won't be able to recover this session feedback.")) return
    const next = [...history]
    next.splice(indexInFullHistory, 1)
    setJSON(KEYS.interviews, next)
    setHistory(next)
  }

  const showHistory = () => {
    setView('history')
    setSession(null)
    setAnalysis(null)
    setProTheme(false)
    setHideBack(false)
  }

  const gaugeOffset = analysis ? 276 - (276 * analysis.overall) / 100 : 276
  const badgeLabel =
    !analysis
      ? 'ANALYZING'
      : analysis.overall > 80
        ? 'EXCELLENT'
        : analysis.overall > 60
          ? 'COMPETENT'
          : 'NEEDS WORK'

  const skills = analysis
    ? [
        { id: 'clarity', label: 'Clarity', icon: 'fa-shield-halved', val: analysis.clarity },
        { id: 'technical', label: 'Technical', icon: 'fa-microchip', val: analysis.technical },
        { id: 'confidence', label: 'Confidence', icon: 'fa-bolt', val: analysis.confidence },
        { id: 'self-intro', label: 'Self Introduction', icon: 'fa-user-circle', val: analysis.selfIntro || 0 },
        { id: 'optimization', label: 'Optimization', icon: 'fa-tachometer-alt', val: analysis.optimization || 0 },
        { id: 'behavioural', label: 'Behavioural Questions', icon: 'fa-users', val: analysis.behavioural || 0 },
      ]
    : []

  if (view === 'detail' && session) {
    return (
      <div id="detailed-view">
        {!hideBack && (
          <div id="back-history-container" style={{ padding: '20px 30px', background: 'var(--cream-bg)' }}>
            <button type="button" className="btn-back" onClick={showHistory}>
              <i className="fas fa-arrow-left" /> BACK TO HISTORY
            </button>
          </div>
        )}

        <header className="report-header">
          <h1>MOCKBEE PERFORMANCE REPORT</h1>
          <div
            className="user-info"
            style={{ color: 'var(--gold-dark)', fontWeight: 800, fontSize: '1.1rem', marginTop: 5 }}
          >
            ROLE: {(session.role || '').toUpperCase()}
          </div>
          <div style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-light)', marginTop: 5 }}>
            DATE: {(session.date || '--').toUpperCase()}
          </div>
        </header>

        <div className="report-container">
          <div className="grid-top">
            <div className="card score-card">
              <div className="card-title">Overall Score</div>
              <div className="gauge-wrap">
                <svg viewBox="0 0 100 100" className="gauge-svg" width="100%" height="100%">
                  <circle cx="50" cy="50" r="44" className="g-bg" />
                  <circle
                    cx="50"
                    cy="50"
                    r="44"
                    className="g-fill"
                    style={{ strokeDasharray: 276, strokeDashoffset: gaugeOffset }}
                  />
                </svg>
                <div className="score-text">{analysis?.overall ?? '--'}</div>
              </div>
              <div className={`badge-work${analysis?.overall > 80 ? ' premium' : ''}`}>
                <i className="fas fa-certificate" /> {badgeLabel}
              </div>
            </div>

            <div className="card skills-card">
              <div className="card-title">Skills Breakdown</div>
              {skills.map((s) => (
                <div className="skill-row" key={s.id}>
                  <div className="skill-header">
                    <div className="skill-name">
                      <i className={`fas ${s.icon}`} /> {s.label}
                    </div>
                    <div className="skill-tag">{skillTag(s.val)}</div>
                    <div className="skill-val">{s.val}</div>
                  </div>
                  <div className="bar-bg">
                    <div className="bar-fill" style={{ width: `${s.val}%` }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="card feedback-card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-title">AI Feedback Summary</div>
              <p>{feedbackText}</p>
              <button type="button" className="btn-mini" onClick={() => window.print()}>
                <i className="fas fa-file-pdf" /> View Full Report
              </button>
            </div>
          </div>

          <div className="grid-mid">
            <div className="card chart-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 }}>
                <div className="card-title" style={{ margin: 0 }}>
                  Performance Analysis
                </div>
                <div
                  style={{
                    display: 'flex',
                    gap: 15,
                    fontSize: 11,
                    fontWeight: 800,
                    color: 'var(--gold-dark)',
                    textTransform: 'uppercase',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, background: 'var(--gold-dark)', borderRadius: 2 }} />
                    Score
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 12, height: 12, background: 'var(--navy-dark)', borderRadius: 2 }} />
                    Confidence
                  </span>
                </div>
              </div>
              <svg viewBox="0 0 540 220" width="100%" height="220">
                <line x1="40" y1="45" x2="520" y2="45" stroke="var(--cream-dark)" strokeWidth="1" opacity="0.3" />
                <line x1="40" y1="90" x2="520" y2="90" stroke="var(--cream-dark)" strokeWidth="1" opacity="0.3" />
                <line x1="40" y1="135" x2="520" y2="135" stroke="var(--cream-dark)" strokeWidth="1" opacity="0.3" />
                {chart && (
                  <>
                    <path
                      d={chart.pathD}
                      fill="none"
                      stroke="var(--gold-dark)"
                      strokeWidth="2"
                      strokeDasharray="8,5"
                      opacity="0.4"
                    />
                    <polyline
                      points={chart.confPoints}
                      fill="none"
                      stroke="var(--navy-dark)"
                      strokeWidth="2"
                    />
                    {chart.scoreNodes.map((n, i) => (
                      <circle key={`s-${i}`} cx={n.x} cy={n.y} r="4" fill="var(--parchment)" stroke="var(--gold-dark)">
                        <title>{`${n.label}: ${n.score}%`}</title>
                      </circle>
                    ))}
                    {chart.confNodes.map((n, i) => (
                      <circle key={`c-${i}`} cx={n.x} cy={n.y} r="5" fill="var(--navy-dark)">
                        <title>{`Confidence: ${n.score}%`}</title>
                      </circle>
                    ))}
                    {chart.labelNodes.map((n, i) => (
                      <text
                        key={`l-${i}`}
                        x={n.x}
                        y="215"
                        fontSize="9"
                        fontWeight="900"
                        fill="var(--navy)"
                        textAnchor="middle"
                      >
                        {n.label}
                      </text>
                    ))}
                  </>
                )}
              </svg>
            </div>

            <div className="card metrics-card">
              <div className="card-title">Secondary Metrics</div>
              <div className="metric-row">
                <span>Confidence Level</span>
                <strong>
                  {!analysis
                    ? '--'
                    : analysis.confidence > 80
                      ? 'HIGH'
                      : analysis.confidence > 60
                        ? 'MODERATE'
                        : 'LOW'}
                </strong>
              </div>
              <div className="metric-row">
                <span>Keyword Match</span>
                <strong>
                  {analysis ? `${Math.min(Math.round(analysis.technical * 0.85 + 5), 100)}%` : '--'}
                </strong>
              </div>
              <div className="metric-row">
                <span>Emotion</span>
                <strong>{analysis ? (analysis.confidence > 70 ? 'CALM' : 'FOCUSED') : '--'}</strong>
              </div>
              <div className="metric-row">
                <span>Filler Words</span>
                <strong>{analysis ? (analysis.confidence > 80 ? 'MINIMAL' : 'LOW') : '--'}</strong>
              </div>
            </div>
          </div>

          {analysis?.phase_feedback && Object.keys(analysis.phase_feedback).length > 0 && (
            <div className="card" style={{ marginTop: 20 }}>
              <div className="card-title">Phase Breakdown</div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 12,
                }}
              >
                {PHASE_META.map((phase) => {
                  const score = analysis[phase.scoreKey] || 0
                  const color = score >= 80 ? '#27AE60' : score >= 60 ? '#D4A017' : '#E53935'
                  return (
                    <div
                      key={phase.key}
                      style={{
                        background: '#faf9f8',
                        borderRadius: 12,
                        padding: 16,
                        borderLeft: `4px solid ${color}`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <i className={phase.icon} style={{ color }} />
                        <span
                          style={{
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: '0.8px',
                          }}
                        >
                          {phase.label}
                        </span>
                      </div>
                      <div style={{ fontSize: '1.8rem', fontWeight: 900, color, marginBottom: 6 }}>
                        {score}%
                      </div>
                      <p style={{ fontSize: '0.78rem', color: '#4A4A4A', lineHeight: 1.5, margin: 0 }}>
                        {analysis.phase_feedback[phase.key] || 'Phase completed.'}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="grid-bottom" style={{ marginTop: 20 }}>
            <div className="card">
              <div className="card-title">Strengths</div>
              <ul>
                {(analysis?.strengths || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="card">
              <div className="card-title">Improvements</div>
              <ul>
                {(analysis?.improvements || []).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="card transcript-card" style={{ marginTop: 20 }}>
            <div className="card-title">Interview Transcript</div>
            {transcript.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 20, fontStyle: 'italic' }}>
                No responses were captured during this session.
              </p>
            ) : (
              <>
                <div className="transcript-slider" style={{ overflow: 'hidden' }}>
                  <div
                    style={{
                      display: 'flex',
                      transition: 'transform 0.3s',
                      transform: `translateX(-${slide * 100}%)`,
                    }}
                  >
                    {transcript.map((item, index) => (
                      <div className="q-item" key={index} style={{ minWidth: '100%', boxSizing: 'border-box' }}>
                        <div className="q-row">
                          <span className="q-num">Q{index + 1}</span>
                          <p className="q-txt">{item.question}</p>
                        </div>
                        <div className="a-row">
                          <span className="a-label">ANSWER:</span>
                          <p className="a-txt">{item.answer}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="slider-controls">
                  <button type="button" disabled={slide === 0} onClick={() => setSlide((s) => s - 1)}>
                    Prev
                  </button>
                  <span>
                    {slide + 1} / {transcript.length}
                  </span>
                  <button
                    type="button"
                    disabled={slide >= transcript.length - 1}
                    onClick={() => setSlide((s) => s + 1)}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="practice-cta" style={{ marginTop: 30, textAlign: 'center' }}>
            <button type="button" className="btn-primary" onClick={() => navigate('/dashboard/roles')}>
              Practice Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div id="history-view" className="report-container">
      <header className="report-header" style={{ marginBottom: 40 }}>
        <h1>
          {filterParam === 'quick' ? 'QUICK PRACTICE REPORTS' : 'INTERVIEW PERFORMANCE HISTORY'}
        </h1>
        <p style={{ color: 'var(--text-medium)', fontWeight: 500 }}>
          Select a past session to view your detailed AI-powered feedback.
        </p>
      </header>

      <div className="history-grid">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, gridColumn: '1 / -1' }}>Loading reports...</div>
        ) : uniqueHistory.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              color: 'var(--text-medium)',
              width: '100%',
              gridColumn: '1 / -1',
              padding: 60,
              background: '#fff',
              borderRadius: 12,
              border: '1px dashed var(--cream-dark)',
            }}
          >
            <i
              className="fas fa-file-signature"
              style={{ fontSize: '2.5rem', color: 'var(--gold-dark)', marginBottom: 15 }}
            />
            <h3 style={{ color: 'var(--navy-dark)', fontWeight: 800 }}>No Performance Reports Yet</h3>
            <p style={{ marginTop: 10, fontSize: '0.95rem' }}>
              Pick a role or try Quick Practice to generate detailed AI feedback.
            </p>
          </div>
        ) : (
          uniqueHistory.map((item) => {
            const originalIndex = history.findIndex((h) => sessionKey(h) === sessionKey(item))
            return (
              <div
                key={sessionKey(item)}
                className="history-card pro-history-card"
                onClick={() => openSession(item)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') openSession(item)
                }}
              >
                <button
                  type="button"
                  className="btn-delete-report"
                  onClick={(e) => deleteReport(e, originalIndex)}
                >
                  <i className="fas fa-times" />
                </button>
                <div className="history-icon">
                  <i className={historyIcon(item.role)} />
                </div>
                <div className="history-info">
                  <h3 style={{ marginBottom: 2 }}>{item.role}</h3>
                  {item.topic && (
                    <p
                      style={{
                        fontSize: '0.65rem',
                        color: 'var(--gold-dark)',
                        fontWeight: 800,
                        marginBottom: 8,
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px',
                      }}
                    >
                      {item.topic}
                    </p>
                  )}
                  <p style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: 8 }}>
                    Session Date: {item.date}
                  </p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-medium)', margin: '8px 0', lineHeight: 1.4 }}>
                    {item.analysis?.feedback ||
                      'Open this session to generate your AI feedback summary.'}
                  </p>
                  {item.analysis?.overall != null ? (
                    <span
                      style={{
                        fontWeight: 900,
                        color: '#1a1a1a',
                        padding: '4px 10px',
                        background: '#E9E4E2',
                        borderRadius: 20,
                        fontSize: '0.75rem',
                      }}
                    >
                      SCORE: {item.analysis.overall}%
                    </span>
                  ) : (
                    <div className="history-score-mini">Ready for Analysis</div>
                  )}
                </div>
                <button type="button" className="btn-open-report">
                  Open Report <i className="fas fa-chevron-right" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
