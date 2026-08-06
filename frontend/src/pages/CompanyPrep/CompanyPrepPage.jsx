import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import '../../styles/company-prep.css'

const COMPANIES = [
  {
    id: 'Google',
    icon: 'fab fa-google',
    title: 'Google',
    desc: 'Master algorithmic problem solving and system design.',
  },
  {
    id: 'Amazon',
    icon: 'fab fa-amazon',
    title: 'Amazon',
    desc: 'Focus on Leadership Principles and Behavioral questions.',
  },
  {
    id: 'Meta',
    icon: 'fab fa-meta',
    title: 'Meta',
    desc: 'Master product architecture and data structures.',
  },
]

export default function CompanyPrepPage() {
  const navigate = useNavigate()
  const { user, isElite } = useAuth()
  const hasEliteAccess =
    isElite || user?.isStudent || user?.role === 'STUDENT'

  const handleClick = (company) => {
    if (!hasEliteAccess) {
      const upgrade = window.confirm(
        'Company-specific prep is an Elite exclusive feature. Pro and Free users can use Quick Practice.\n\nUpgrade to Elite?',
      )
      if (upgrade) navigate('/dashboard/subscription')
      return
    }
    navigate(`/dashboard/company-prep/${encodeURIComponent(company)}`)
  }

  return (
    <div className="company-prep-page">
      <h2>Top Company Interview Prep</h2>
      <p className="subtitle">
        Open company-specific question banks and review previous interview questions by topic.
      </p>

      <div className="company-grid">
        {COMPANIES.map((c) => (
          <div
            key={c.id}
            className={`company-card${!hasEliteAccess ? ' locked-segment' : ''}`}
            onClick={() => handleClick(c.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleClick(c.id)
            }}
          >
            <i className={c.icon} />
            <h3>{c.title}</h3>
            <p>{c.desc}</p>
            <div className="card-action">
              <button
                type="button"
                className="btn-prep"
                style={!hasEliteAccess ? { visibility: 'hidden' } : undefined}
              >
                View Questions
              </button>
            </div>
            {!hasEliteAccess && (
              <div className="lock-overlay-content">
                <i className="fas fa-lock lock-icon-main" />
                <div className="subscribe-btn-alt">Subscribe to access</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
