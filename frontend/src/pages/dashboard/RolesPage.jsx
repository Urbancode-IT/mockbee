import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../context/AuthContext'
import { KEYS, setItem, getJSON, setJSON } from '../../utils/storage'
import './RolesPage.css'

/** Same role cards as landing / old bee side — always 5Q MockBee practice. */
const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
]

const ROLES = [
  { title: 'Python Developer', category: 'beginner intermediate advanced', level: 'ALL LEVELS', levelClass: 'level--all', icon: 'fab fa-python', tags: ['OOP', 'Django', 'APIs'] },
  { title: 'Frontend Developer', category: 'beginner', level: 'BEGINNER', levelClass: 'level--beginner', icon: 'fas fa-globe', tags: ['React', 'CSS', 'HTML'] },
  { title: 'Backend Developer', category: 'intermediate', level: 'INTERMEDIATE', levelClass: 'level--intermediate', icon: 'fas fa-cogs', tags: ['Node.js', 'REST', 'SQL'] },
  { title: 'ML Engineer', category: 'advanced', level: 'ADVANCED', levelClass: 'level--advanced', icon: 'fas fa-brain', tags: ['PyTorch', 'NLP', 'CV'] },
  { title: 'Data Scientist', category: 'intermediate', level: 'INTERMEDIATE', levelClass: 'level--intermediate', icon: 'fas fa-chart-bar', tags: ['Pandas', 'Stats', 'Viz'] },
  { title: 'Cloud Engineer', category: 'intermediate', level: 'INTERMEDIATE', levelClass: 'level--intermediate', icon: 'fas fa-cloud', tags: ['AWS', 'Azure', 'GCP'] },
  { title: 'DevOps Engineer', category: 'advanced', level: 'ADVANCED', levelClass: 'level--advanced', icon: 'fas fa-sync-alt', tags: ['CI/CD', 'Docker', 'K8s'] },
  { title: 'Cybersecurity Analyst', category: 'advanced', level: 'ADVANCED', levelClass: 'level--advanced', icon: 'fas fa-shield-alt', tags: ['SIEM', 'SOC', 'Pentest'] },
  { title: 'Network Engineer', category: 'intermediate', level: 'INTERMEDIATE', levelClass: 'level--intermediate', icon: 'fas fa-satellite-dish', tags: ['TCP/IP', 'BGP', 'VPN'] },
  { title: 'System Architect', category: 'advanced', level: 'ADVANCED', levelClass: 'level--advanced', icon: 'fas fa-city', tags: ['Design', 'Scale', 'Patterns'] },
  { title: 'QA Engineer', category: 'beginner', level: 'BEGINNER', levelClass: 'level--beginner', icon: 'fas fa-flask', tags: ['Selenium', 'Jest', 'Manual'] },
  { title: 'Mobile Developer', category: 'intermediate', level: 'INTERMEDIATE', levelClass: 'level--intermediate', icon: 'fas fa-mobile-alt', tags: ['Flutter', 'RN', 'Swift'] },
  { title: 'Testing', category: 'beginner', level: 'BEGINNER', levelClass: 'level--beginner', icon: 'fas fa-vial', tags: ['Unit', 'API', 'E2E'] },
  { title: 'AWS Specialist', category: 'advanced', level: 'ADVANCED', levelClass: 'level--advanced', icon: 'fab fa-aws', tags: ['EC2', 'S3', 'Lambda'] },
]

const FREE_ROLES = ['Python Developer', 'Frontend Developer', 'Backend Developer']

function logActivity(label) {
  const activities = getJSON(KEYS.activities, []) || []
  activities.unshift({ label, time: 'Just now', date: new Date().toISOString() })
  setJSON(KEYS.activities, activities.slice(0, 50))
}

export default function RolesPage() {
  const navigate = useNavigate()
  const { user, isPro } = useAuth()
  const isSubscribed = !!isPro || !!user?.subscribed || !!user?.isStudent
  const [filter, setFilter] = useState('all')

  const visible = useMemo(
    () => ROLES.filter((r) => filter === 'all' || r.category.includes(filter)),
    [filter],
  )

  /** Old bee side: always mode=bee → exactly 5 Gemini questions. */
  const startBee = (roleName) => {
    const locked = !isSubscribed && !FREE_ROLES.includes(roleName)
    if (locked) {
      toast.error('Upgrade to unlock this role, or try Python / Frontend / Backend free bee practice.')
      return
    }
    setItem(KEYS.selectedRole, roleName)
    logActivity(`Bee 5Q: ${roleName}`)
    navigate(`/interview?role=${encodeURIComponent(roleName)}&mode=bee`)
  }

  return (
    <div className="roles-page roles-page--bee">
      <div className="roles-filters">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`filter-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="role-grid role-grid--classic">
        {visible.map((role) => {
          const isFree = FREE_ROLES.includes(role.title)
          const locked = !isSubscribed && !isFree

          return (
            <div
              key={role.title}
              className={`role-card role-card--classic${locked ? ' locked-role' : ''}`}
              onClick={() => startBee(role.title)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  startBee(role.title)
                }
              }}
              role="button"
              tabIndex={locked ? -1 : 0}
            >
              <div className="role-card__icon">
                <i className={role.icon} />
              </div>
              <h3>{role.title}</h3>
              <span className={`role-card__level ${role.levelClass}`}>{role.level}</span>
              <div className="role-card__tags">
                {role.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              {!locked && (
                <button
                  type="button"
                  className="btn-start-mock-hover"
                  onClick={(e) => {
                    e.stopPropagation()
                    startBee(role.title)
                  }}
                >
                  Start Bee Mock (5Q) →
                </button>
              )}
              {isFree && !isSubscribed && <div className="free-badge">FREE · 5Q</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
