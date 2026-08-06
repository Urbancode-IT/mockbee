import { Link, useNavigate, useParams } from 'react-router-dom'
import '../../styles/quick-practice.css'

const MODE_CONFIG = {
  '5-min': {
    icon: 'fas fa-bolt',
    title: '5-Minute Drill',
    subtitle: 'High-Intensity Technical Sprint',
    interviewMode: '5-min',
    cta: (
      <>
        Begin Technical Sprint &nbsp; <i className="fas fa-chevron-right" />
      </>
    ),
    stats: [
      { h: 'Duration', p: '300s' },
      { h: 'Questions', p: '5 Fast' },
      { h: 'Level', p: 'Expert' },
    ],
    description: (
      <>
        The clock starts the moment you enter. We&apos;ve removed all distractions.
        <br />
        Focus on <strong>precision</strong>, <strong>speed</strong>, and <strong>technical accuracy</strong>.
      </>
    ),
  },
  '1-q': {
    icon: 'fas fa-microchip',
    title: '1-Question Deep Dive',
    subtitle: 'Expert Level Architectural Task',
    interviewMode: '1-q',
    cta: (
      <>
        Begin Technical Deep Dive &nbsp; <i className="fas fa-chevron-right" />
      </>
    ),
    stats: [
      { h: 'Format', p: '1 Deep Task' },
      { h: 'Focus', p: 'Technical Depth' },
      { h: 'Target', p: 'Full Proficiency' },
    ],
    description:
      'Our AI interviewer will generate one complex architectural or technical question tailored to your role. Take your time, provide a deep, structured answer, and receive comprehensive feedback on your performance.',
  },
  rapid: {
    icon: 'fas fa-fire',
    title: 'Rapid Revision',
    subtitle: 'Fast-Paced Concept Validation',
    interviewMode: 'rapid',
    accent: true,
    cta: (
      <>
        Ignite Session &nbsp; <i className="fas fa-fire" />
      </>
    ),
    stats: [
      { h: 'Questions', p: '5 Rapid' },
      { h: 'Speed', p: 'Lightning' },
      { h: 'Goal', p: 'Pattern Recall' },
    ],
    description:
      'This mode is designed for immediate recall of technical syntax and foundational principles. Expect quick transitions and concise, accurate feedback.',
  },
  warmup: {
    icon: 'fas fa-mug-hot',
    title: 'Warm-up Mode',
    subtitle: 'Confidence Building Foundations',
    interviewMode: 'warmup',
    accent: true,
    cta: (
      <>
        Start Training &nbsp; <i className="fas fa-sun" />
      </>
    ),
    stats: [
      { h: 'Questions', p: '3 Gentle' },
      { h: 'Vibe', p: 'Calm' },
      { h: 'Goal', p: 'Confidence' },
    ],
    description:
      'Ease into your interview preparation with fundamental questions that build confidence. Perfect for starting your day or preparing for a longer session.',
  },
}

const ALIASES = {
  '5min': '5-min',
  'practice-5min': '5-min',
  '1q': '1-q',
  'practice-1q': '1-q',
  'practice-rapid': 'rapid',
  'practice-warmup': 'warmup',
  warm: 'warmup',
}

export default function PracticeModePage({ mode: modeProp }) {
  const params = useParams()
  const navigate = useNavigate()
  const raw = modeProp || params.mode || '5-min'
  const modeKey = ALIASES[raw] || raw
  const config = MODE_CONFIG[modeKey] || MODE_CONFIG['5-min']

  const start = () => {
    navigate(`/interview?mode=${encodeURIComponent(config.interviewMode)}`)
  }

  const accentStyle = config.accent
    ? { background: '#1a1a1a', color: '#D8C4B6' }
    : undefined
  const pulseStyle = config.accent ? { background: '#D8C4B6' } : undefined
  const statsStyle = config.accent
    ? { background: 'rgba(216, 196, 182, 0.1)', borderColor: 'rgba(216, 196, 182, 0.2)' }
    : undefined
  const ctaStyle = config.accent
    ? { background: '#1a1a1a', border: '1px solid #D8C4B6' }
    : undefined

  return (
    <div className="practice-container mode-start-container">
      <div className="timer-visual-wrap">
        <div className="timer-visual" style={accentStyle}>
          <i className={config.icon} />
        </div>
        <div className="pulse-ring" style={pulseStyle} />
      </div>

      <h1 className="premium-title">{config.title}</h1>
      <p className="premium-subtitle">{config.subtitle}</p>

      <div className="mode-stats" style={statsStyle}>
        {config.stats.map((s) => (
          <div className="stat-box" key={s.h}>
            <h4>{s.h}</h4>
            <p>{s.p}</p>
          </div>
        ))}
      </div>

      <p className="mode-description">{config.description}</p>

      <div className="mode-actions">
        <button type="button" className="btn-start-now" style={ctaStyle} onClick={start}>
          {config.cta}
        </button>
        <br />
        <Link to="/dashboard/practice" className="btn-back-link">
          <i className="fas fa-arrow-left" /> Change Mode
        </Link>
      </div>
    </div>
  )
}
