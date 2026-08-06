import { KEYS, getJSON } from '../../utils/storage'
import './AchievementsPage.css'

const BADGES = [
  { id: 'first_interview', name: 'The Take-Off', desc: 'Completed your first mock interview.', icon: 'fas fa-rocket' },
  { id: 'resume_master', name: 'ATS Master', desc: 'Successfully built your professional resume.', icon: 'fas fa-file-alt' },
  { id: 'pro_member', name: 'The Professional', desc: 'Unlocked the power of MockBee Pro or Elite.', icon: 'fas fa-crown' },
  { id: 'roadmap_explorer', name: 'Roadmap Explorer', desc: 'Navigated your personalized career path.', icon: 'fas fa-map-marked-alt' },
  { id: 'active_practitioner', name: 'Dedicated Learner', desc: 'Recorded 5+ professional activities.', icon: 'fas fa-clock' },
]

export default function AchievementsPage() {
  const unlockedIds = getJSON(KEYS.badges, []) || []

  return (
    <div className="achievements-page">
      <h2>Career Milestones</h2>
      <div className="badge-grid">
        {BADGES.map((b) => {
          const isUnlocked = unlockedIds.includes(b.id)
          return (
            <div key={b.id} className={`badge-card${isUnlocked ? ' unlocked' : ''}`}>
              <i className={b.icon} />
              <h3>{b.name}</h3>
              <p>{b.desc}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
