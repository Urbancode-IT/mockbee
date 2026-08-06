import { Link } from 'react-router-dom'
import '../../styles/quick-practice.css'

const MODES = [
  {
    to: '/dashboard/practice/5-min',
    className: 'option-card high-intensity',
    icon: 'fas fa-stopwatch',
    title: '5-minute drill',
    desc: 'High-pressure technical sprint. 5 questions, total focus.',
  },
  {
    to: '/dashboard/practice/1-q',
    className: 'option-card',
    icon: 'fas fa-bolt',
    title: '1-question challenge',
    desc: 'One deep-dive architectural task. Quality over quantity.',
  },
  {
    to: '/dashboard/practice/rapid',
    className: 'option-card',
    icon: 'fas fa-fire',
    title: 'rapid revision',
    desc: 'Quick-fire concept checks to keep you sharp and ready.',
  },
  {
    to: '/dashboard/practice/warmup',
    className: 'option-card',
    icon: 'fas fa-mug-hot',
    title: 'warm-up mode',
    desc: 'Comfortable technical dialogue to get your brain in the zone.',
  },
]

export default function QuickPracticePage() {
  return (
    <div className="practice-container">
      <header className="practice-header">
        <h1 className="premium-title">Quick Practice</h1>
        <p className="premium-subtitle">Sharpen your edge instantly</p>
      </header>

      <section className="what-it-does">
        <span className="section-label">SELECT YOUR TRAINING MODE</span>

        <div className="options-grid">
          {MODES.map((mode) => (
            <Link
              key={mode.to}
              to={mode.to}
              className={mode.className}
              style={{ textDecoration: 'none', color: 'inherit' }}
            >
              <div className="option-icon">
                <i className={mode.icon} />
              </div>
              <div className="option-content">
                <h3>{mode.title}</h3>
                <p>{mode.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="practice-footer" style={{ flexDirection: 'column', gap: 15 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            color: 'var(--text-medium)',
            fontSize: '0.8rem',
          }}
        >
          <i className="fas fa-shield-halved" />
          <p>AI-Powered Precision • Real-time Technical Feedback </p>
        </div>
      </footer>
    </div>
  )
}
