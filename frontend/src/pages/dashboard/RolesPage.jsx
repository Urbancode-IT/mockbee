import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { KEYS, setItem, getJSON, setJSON } from '../../utils/storage'
import './RolesPage.css'

const ROLES = [
  { name: 'Python Developer', icon: 'fab fa-python', desc: 'Django, Flask, Data Processing, and Automation.' },
  { name: 'Frontend Developer', icon: 'fas fa-globe', desc: 'React, Vue, CSS animations, and Responsive Design.' },
  { name: 'Backend Developer', icon: 'fas fa-cogs', desc: 'Node.js, Databases, REST APIs, and Security.' },
  { name: 'ML Engineer', icon: 'fas fa-brain', desc: 'PyTorch, TensorFlow, NLP, and Computer Vision.' },
  { name: 'Data Scientist', icon: 'fas fa-chart-bar', desc: 'Pandas, Statistics, and Data Visualization.' },
  { name: 'Cloud Engineer', icon: 'fas fa-cloud', desc: 'AWS, Azure, GCP, and Infrastructure management.' },
  { name: 'DevOps Engineer', icon: 'fas fa-sync-alt', desc: 'CI/CD, Docker, Kubernetes, and Automation.' },
  { name: 'Cybersecurity Analyst', icon: 'fas fa-shield-alt', desc: 'Pentesting, SIEM, SOC, and Network Security.' },
  { name: 'Network Engineer', icon: 'fas fa-satellite-dish', desc: 'TCP/IP, BGP, VPN, and Router Configuration.' },
  { name: 'System Architect', icon: 'fas fa-city', desc: 'Scalable Design, Design Patterns, and Microservices.' },
  { name: 'QA Engineer', icon: 'fas fa-flask', desc: 'Selenium, Jest, Manual, and Automated Testing.' },
  { name: 'Mobile Developer', icon: 'fas fa-mobile-alt', desc: 'Flutter, React Native, iOS (Swift), and Android.' },
  { name: 'Testing', icon: 'fas fa-vial', desc: 'Unit Testing, Integration Testing, and Quality Assurance.' },
  { name: 'AWS', icon: 'fab fa-aws', desc: 'EC2, S3, Lambda, and Cloud Architecture.', title: 'AWS Specialist' },
]

const FREE_ROLES = []

function logActivity(label) {
  const activities = getJSON(KEYS.activities, []) || []
  activities.unshift({ label, time: 'Just now', date: new Date().toISOString() })
  setJSON(KEYS.activities, activities.slice(0, 50))
}

export default function RolesPage() {
  const navigate = useNavigate()
  const { user, isPro } = useAuth()
  const isSubscribed = !!isPro || !!user?.subscribed || !!user?.isStudent
  const isStandardPlan = user?.subscribedPlan === 'standard'

  const startInterview = (roleName) => {
    setItem(KEYS.selectedRole, roleName)
    logActivity(`Role Selected: ${roleName}`)
    navigate(`/interview?role=${encodeURIComponent(roleName)}`)
  }

  return (
    <div className="roles-page">
      <h2>Select Your Target Role</h2>
      <p className="roles-intro">
        Tailor your interview practice and resume optimization to your specific career path.
      </p>

      <div className="role-grid">
        {ROLES.map((role) => {
          const isFree = FREE_ROLES.includes(role.name)
          const locked = !isSubscribed && !isFree

          return (
            <div
              key={role.name}
              className={`role-card${locked ? ' locked-role' : ''}`}
              data-role={role.name}
              onClick={() => {
                if (!locked) startInterview(role.name)
              }}
              role="button"
              tabIndex={locked ? -1 : 0}
              onKeyDown={(e) => {
                if (!locked && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  startInterview(role.name)
                }
              }}
            >
              <i className={role.icon} />
              <h3>{role.title || role.name}</h3>
              <p>{role.desc}</p>
              {isFree && !isSubscribed && <div className="free-badge">FREE</div>}
              {!locked && (
                <button
                  type="button"
                  className="btn-start-mock-hover"
                  onClick={(e) => {
                    e.stopPropagation()
                    startInterview(role.name)
                  }}
                >
                  Start Mock →
                </button>
              )}
              {isSubscribed && (
                <span className={`pro-label${isStandardPlan ? ' is-pro-yellow' : ''}`}>
                  {isStandardPlan ? 'Pro Access' : 'Unlocked'}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
