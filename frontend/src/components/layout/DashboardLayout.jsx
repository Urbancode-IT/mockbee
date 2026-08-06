import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem, setItem, getJSON } from '../../utils/storage'
import '../../styles/dashboard.css'

const LOGO = '/images/ChatGPT%20Image%20Apr%209,%202026,%2011_20_50%20AM.png'

const NAV_ITEMS = [
  { section: 'MAIN MENU', items: [
    { to: '/dashboard', end: true, icon: 'fa-th-large', label: 'Overview' },
    { to: '/dashboard/roles', icon: 'fa-user-tie', label: 'Pick Your Role' },
    { to: '/dashboard/resume', icon: 'fa-file-invoice', label: 'Resume Builder' },
    { to: '/dashboard/reports', icon: 'fa-chart-line', label: 'Reports & AI Feedback' },
  ]},
  { section: 'PRACTICE & PREP', items: [
    { to: '/dashboard/practice', icon: 'fa-keyboard', label: 'Quick Practice' },
    { to: '/dashboard/company-prep', icon: 'fa-building', label: 'Company Prep' },
  ]},
  { section: 'ACCOUNT', items: [
    { to: '/dashboard/subscription', icon: 'fa-crown', label: 'My Subscription' },
    { to: '/dashboard/achievements', icon: 'fa-trophy', label: 'Achievements' },
    { to: '/dashboard/settings', icon: 'fa-cog', label: 'Settings' },
  ]},
]

function planLabel(user) {
  if (user?.isStudent || user?.role === 'STUDENT') return { text: 'STUDENT', btn: 'Student Access', tone: 'student' }
  if (!user?.subscribed) return { text: 'FREE PLAN', btn: 'Join MockB Membership', tone: 'free' }
  if (['pro', 'elite_plan'].includes(user.subscribedPlan)) {
    return { text: 'ELITE PLAN', btn: 'Elite Member', tone: 'elite' }
  }
  return { text: 'PRO PLAN', btn: 'Pro Member', tone: 'pro' }
}

export default function DashboardLayout() {
  const { user, displayName, logout, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => getItem(KEYS.sidebarCollapsed) === 'true')
  const plan = useMemo(() => planLabel(user), [user])
  const isOverview = location.pathname === '/dashboard' || location.pathname === '/dashboard/'

  useEffect(() => {
    if (!isAuthenticated) navigate('/login', { replace: true })
  }, [isAuthenticated, navigate])

  useEffect(() => {
    setItem(KEYS.sidebarCollapsed, collapsed ? 'true' : 'false')
  }, [collapsed])

  const dateStr = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const interviews = getJSON(KEYS.interviews, [])
  const badges = getJSON(KEYS.badges, [])
  const activities = getJSON(KEYS.activities, [])

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const handleSubClick = () => {
    if (user?.isStudent || user?.role === 'STUDENT') {
      alert('Your student account has access enabled by the admin.')
      return
    }
    if (user?.subscribed) {
      alert('You are already a Pro Member! Enjoy all premium benefits.')
      return
    }
    navigate('/dashboard/subscription')
  }

  if (!isAuthenticated) return null

  return (
    <div className="dashboard-layout">
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="sidebar-header">
          <img
            src={LOGO}
            alt="MockBee Logo"
            className="side-logo"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          />
          <button
            type="button"
            id="sidebar-toggle"
            className="sidebar-toggle-btn"
            onClick={() => setCollapsed((v) => !v)}
          >
            <i className="fas fa-bars" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((group) => (
            <div key={group.section}>
              <div className="nav-section">{group.section}</div>
              <ul className="nav-list">
                {group.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
                    >
                      <i className={`fas ${item.icon}`} /> <span>{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info-mini">
            <div className="avatar-mini">{(displayName || 'U').charAt(0).toUpperCase()}</div>
            <div className="user-text">
              <p className="user-name-mini">{displayName}</p>
              <p className={`user-plan-mini plan-${plan.tone}`}>{plan.text}</p>
            </div>
          </div>
          <button type="button" className="btn-logout" onClick={handleLogout}>
            <i className="fas fa-sign-out-alt" />
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="dashboard-header">
          <div className="welcome-text">
            <h1>
              Welcome back, <span className="accent">{displayName}</span>
            </h1>
            <p>Ready to level up your career today?</p>
          </div>
          <div className="header-actions">
            <div className="home-nav-icon" onClick={() => navigate('/')} title="go back to home">
              <i className="fas fa-home" />
            </div>
            <div className="notif-bell">
              <i className="fas fa-bell" />
              {getItem(KEYS.notifUnread) === 'true' && <span className="notif-dot" />}
            </div>
            <div className="header-date">{dateStr}</div>
          </div>
        </header>

        <div className="content-viewport">
          {isOverview ? (
            <div id="overview-section" className="active-content">
              <div className="overview-top-bar">
                <button
                  type="button"
                  className={`btn-subscription-status${user?.subscribed ? ' is-subscribed' : ''} tone-${plan.tone}`}
                  onClick={handleSubClick}
                >
                  <i className="fas fa-crown" />
                  <span>{plan.btn}</span>
                </button>
              </div>

              <div className="overview-grid">
                <div className="stat-card">
                  <i className="fas fa-microphone-alt" />
                  <div className="stat-info">
                    <h3>{interviews.length}</h3>
                    <p>Mock Interviews</p>
                  </div>
                </div>
                <div className="stat-card">
                  <i className="fas fa-check-circle" />
                  <div className="stat-info">
                    <h3>--</h3>
                    <p>ATS Score Average</p>
                  </div>
                </div>
                <div className="stat-card">
                  <i className="fas fa-medal" />
                  <div className="stat-info">
                    <h3>{Array.isArray(badges) ? badges.length : 0}</h3>
                    <p>Achievements</p>
                  </div>
                </div>
              </div>

              <div className="overview-info-grid">
                <div className="info-box roadmap-box">
                  <h4><i className="fas fa-route" /> Career Roadmaps</h4>
                  <p>
                    Explore specialized growth paths and skill roadmaps for every target role available in MockBee.
                  </p>
                  <button type="button" className="btn-primary" onClick={() => navigate('/dashboard/roadmap')}>
                    Explore All Roadmaps
                  </button>
                </div>
                <div className="info-box">
                  <h4><i className="fas fa-history" /> Recent Activity</h4>
                  <div className="activity-list">
                    {(activities.length ? activities.slice(0, 3) : [
                      { label: 'Fullstack Mock Interview', time: '2 days ago' },
                      { label: 'Resume Score - 88%', time: 'Oct 22, 2026' },
                      { label: 'Role Selected: SDE II', time: 'Oct 20, 2026' },
                    ]).map((a, i) => (
                      <div className="activity-item" key={i}>
                        <span>{a.label || a.text || a.title}</span>
                        <span>{a.time || a.date || ''}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="welcome-banner" style={{ marginTop: 30 }}>
                <div className="banner-text">
                  <h2>Master the Art of Interviews</h2>
                  <p>
                    Try our Quick Practice mode to sharpen your communication skills with AI-driven real-time feedback.
                  </p>
                  <button type="button" className="btn-primary" onClick={() => navigate('/dashboard/roles')}>
                    Start Practice
                  </button>
                </div>
                <div className="banner-img">
                  <img src={LOGO} alt="Mascot" />
                </div>
              </div>
            </div>
          ) : (
            <div className="dashboard-outlet">
              <Outlet />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
