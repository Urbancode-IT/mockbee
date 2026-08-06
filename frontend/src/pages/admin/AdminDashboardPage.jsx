import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem } from '../../utils/storage'
import '../../styles/admin-dashboard.css'

function scoreValue(session, key, fallback = null) {
  const analysis = session.analysis || {}
  const value = analysis[key]
  return typeof value === 'number' ? value : fallback
}

function categoryRows(session) {
  const analysis = session.analysis || {}
  const phaseFeedback = analysis.phase_feedback || {}
  const overall = session.score ?? analysis.overall ?? null
  return [
    ['Overall Readiness', overall, analysis.feedback || analysis.summary || 'No summary generated yet.'],
    [
      'Communication Clarity',
      scoreValue(session, 'clarity', scoreValue(session, 'selfIntro')),
      'Assesses how clearly the candidate explained ideas, structured responses, and handled introductions.',
    ],
    [
      'Technical Knowledge',
      scoreValue(session, 'technical'),
      'Assesses role-specific correctness, depth, terminology, and practical problem-solving.',
    ],
    [
      'Confidence & Presence',
      scoreValue(session, 'confidence'),
      'Assesses confidence, consistency, and how comfortably the candidate handled follow-up pressure.',
    ],
    [
      'Projects & Skills',
      scoreValue(session, 'projects_skills'),
      phaseFeedback.projects_skills ||
        'Assesses ability to connect projects, tools, and experience to the target role.',
    ],
    [
      'Optimization & Problem Solving',
      scoreValue(session, 'optimization'),
      phaseFeedback.optimization || 'Assesses approach to trade-offs, efficiency, constraints, and improvements.',
    ],
    [
      'Behavioural Fit',
      scoreValue(session, 'behavioural'),
      phaseFeedback.behavioural ||
        'Assesses teamwork, ownership, conflict handling, and STAR-style storytelling.',
    ],
    [
      'HR & Logistics',
      scoreValue(session, 'hr_logistics'),
      phaseFeedback.hr_logistics ||
        'Assesses professional expectations, availability, and closing communication.',
    ],
  ]
}

export default function AdminDashboardPage() {
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const adminKey = getItem(KEYS.adminToken) || user?.adminToken || ''

  const [tab, setTab] = useState('users')
  const [allUsers, setAllUsers] = useState([])
  const [allSessions, setAllSessions] = useState([])
  const [usersLoading, setUsersLoading] = useState(true)
  const [sessionsLoading, setSessionsLoading] = useState(true)
  const [userSearch, setUserSearch] = useState('')
  const [sessionSearch, setSessionSearch] = useState('')
  const [userType, setUserType] = useState('ALL')
  const [overviewSession, setOverviewSession] = useState(null)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const [studentForm, setStudentForm] = useState({ name: '', email: '', password: '' })
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (getItem(KEYS.isAdmin) !== 'true' && !user?.isAdmin) {
      alert('Access Denied. Admin only.')
      navigate('/login', { replace: true })
      return
    }
    if (!adminKey) {
      alert('Admin session expired. Please log in again.')
      navigate('/login', { replace: true })
    }
  }, [adminKey, navigate, user?.isAdmin])

  const loadData = useCallback(async () => {
    if (!adminKey) return
    setUsersLoading(true)
    setSessionsLoading(true)

    try {
      const { body } = await apiFetch(`/api/admin/users?key=${encodeURIComponent(adminKey)}`)
      if (body.status === 'success') setAllUsers(body.users || [])
    } catch {
      setAllUsers([])
    } finally {
      setUsersLoading(false)
    }

    try {
      const { body } = await apiFetch(`/api/admin/sessions?key=${encodeURIComponent(adminKey)}`)
      if (body.status === 'success') setAllSessions(body.sessions || [])
    } catch {
      setAllSessions([])
    } finally {
      setSessionsLoading(false)
    }
  }, [adminKey])

  useEffect(() => {
    loadData()
  }, [loadData])

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase()
    return allUsers.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(q) || (u.name || '').toLowerCase().includes(q),
    )
  }, [allUsers, userSearch])

  const filteredSessions = useMemo(() => {
    const q = sessionSearch.toLowerCase()
    return allSessions.filter((s) => {
      const matchesSearch =
        (s.user_email || '').toLowerCase().includes(q) || (s.role || '').toLowerCase().includes(q)
      const matchesType = userType === 'ALL' || s.user_role === userType
      return matchesSearch && matchesType
    })
  }, [allSessions, sessionSearch, userType])

  const avgScore = useMemo(() => {
    const scored = allSessions.filter((s) => s.score || s.score === 0)
    if (!scored.length) return '—'
    return `${Math.round(scored.reduce((a, s) => a + s.score, 0) / scored.length)}%`
  }, [allSessions])

  const uniqueRoles = useMemo(
    () => new Set(allSessions.map((s) => s.role)).size,
    [allSessions],
  )

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const deleteUser = async (email) => {
    if (
      !window.confirm(
        `Are you sure you want to delete user ${email} and all their interview sessions? This action cannot be undone.`,
      )
    ) {
      return
    }
    try {
      const { body } = await apiFetch(
        `/api/admin/users/${encodeURIComponent(email)}?key=${encodeURIComponent(adminKey)}`,
        { method: 'DELETE' },
      )
      if (body.status === 'success') {
        alert('User deleted successfully.')
        loadData()
      } else {
        alert(`Error: ${body.detail}`)
      }
    } catch {
      alert('Failed to delete user. Make sure backend is running.')
    }
  }

  const deleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this interview session?')) return
    try {
      const { body } = await apiFetch(
        `/api/admin/sessions/${encodeURIComponent(sessionId)}?key=${encodeURIComponent(adminKey)}`,
        { method: 'DELETE' },
      )
      if (body.status === 'success') {
        alert('Session deleted.')
        loadData()
      } else {
        alert(`Error: ${body.detail}`)
      }
    } catch {
      alert('Failed to delete session.')
    }
  }

  const downloadReport = (session) => {
    const analysis = session.analysis || {}
    const overallScore = session.score ?? analysis.overall ?? null
    const rows = categoryRows(session)
      .map(([name, score, note]) => {
        const scoreText = typeof score === 'number' ? `${Math.round(score)}%` : 'Not scored'
        return `${name}\t${scoreText}\t${note}`
      })
      .join('\n')

    const text = [
      'MockBee Professional Candidate Report',
      `Candidate: ${session.candidate_name || session.user_email}`,
      `Email: ${session.user_email}`,
      `Interview Role: ${session.role}`,
      `User Type: ${session.user_role === 'STUDENT' ? 'Student' : 'Public'}`,
      `Overall Score: ${overallScore !== null ? `${overallScore}%` : 'Not scored'}`,
      `Date: ${session.date || 'Not available'}`,
      '',
      'Performance by Category',
      rows,
      '',
      'Core Strengths',
      ...(analysis.strengths || ['Not enough analysed data available.']),
      '',
      'Areas to Improve',
      ...(analysis.improvements || ['Not enough analysed data available.']),
      '',
      'Decision Summary',
      analysis.feedback || analysis.summary || 'Open the user report to generate AI feedback.',
    ].join('\n')

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const safeDate = session.date ? String(session.date).replace(/[/:]/g, '-') : 'unknown'
    a.href = url
    a.download = `mockbee_report_${session.user_email}_${safeDate}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const createStudent = async (e) => {
    e.preventDefault()
    setCreating(true)
    try {
      const { body } = await apiFetch('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({ ...studentForm, key: adminKey }),
      })
      if (body.status === 'success') {
        alert('Student created successfully!')
        setShowAddStudent(false)
        setStudentForm({ name: '', email: '', password: '' })
        loadData()
      } else {
        alert(`Error: ${body.detail}`)
      }
    } catch {
      alert('Failed to create student. Is the backend running?')
    } finally {
      setCreating(false)
    }
  }

  if (!adminKey && getItem(KEYS.isAdmin) !== 'true') return null

  return (
    <div className="admin-dashboard-page">
      <div className="admin-topbar">
        <div className="logo-area">
          <i className="fas fa-shield-halved" />
          <h1>
            Mock<span>Bee</span> Admin
          </h1>
        </div>
        <span className="admin-badge">
          <i className="fas fa-lock" style={{ marginRight: 6 }} /> Admin Access
        </span>
        <button type="button" className="logout-btn" onClick={handleLogout}>
          <i className="fas fa-right-from-bracket" /> Logout
        </button>
      </div>

      <div className="admin-stats-row">
        <div className="admin-stat-card">
          <div className="stat-icon users">
            <i className="fas fa-users" />
          </div>
          <div className="stat-text">
            <h3>{allUsers.length || '—'}</h3>
            <p>Total Users</p>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="stat-icon sessions">
            <i className="fas fa-clipboard-check" />
          </div>
          <div className="stat-text">
            <h3>{allSessions.length || '—'}</h3>
            <p>Interview Sessions</p>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="stat-icon avg">
            <i className="fas fa-chart-line" />
          </div>
          <div className="stat-text">
            <h3>{avgScore}</h3>
            <p>Avg Score</p>
          </div>
        </div>
        <div className="admin-stat-card">
          <div className="stat-icon active">
            <i className="fas fa-bolt" />
          </div>
          <div className="stat-text">
            <h3>{uniqueRoles || '—'}</h3>
            <p>Unique Roles Used</p>
          </div>
        </div>
      </div>

      <div className="admin-tab-bar">
        <button
          type="button"
          className={`admin-tab-btn${tab === 'users' ? ' active' : ''}`}
          onClick={() => setTab('users')}
        >
          <i className="fas fa-users" style={{ marginRight: 6 }} /> All Users
        </button>
        <button
          type="button"
          className={`admin-tab-btn${tab === 'sessions' ? ' active' : ''}`}
          onClick={() => setTab('sessions')}
        >
          <i className="fas fa-history" style={{ marginRight: 6 }} /> All Sessions
        </button>
      </div>

      {tab === 'users' && (
        <div className="admin-table-container">
          <div className="admin-table-header">
            <h2>
              <i className="fas fa-user-group" style={{ color: 'var(--gold-dark)', marginRight: 8 }} />
              Registered Users
            </h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="admin-refresh-btn"
                style={{ background: 'var(--green)', color: '#fff' }}
                onClick={() => setShowAddStudent(true)}
              >
                <i className="fas fa-plus" /> Add Student
              </button>
              <div className="admin-search-box">
                <i className="fas fa-search" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by email or name..."
                />
              </div>
              <button type="button" className="admin-refresh-btn" onClick={loadData}>
                <i className="fas fa-rotate" /> Refresh
              </button>
            </div>
          </div>

          {usersLoading ? (
            <div className="admin-loading-msg">
              <i className="fas fa-spinner fa-spin" /> Loading users...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="admin-empty-state">No registered users yet.</div>
          ) : (
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th>Last Seen</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u, i) => (
                  <tr key={u.email || i}>
                    <td>{i + 1}</td>
                    <td className="email-col">{u.email}</td>
                    <td>{u.name || '—'}</td>
                    <td>
                      <span className="admin-role-tag">{u.role || 'PUBLIC'}</span>
                    </td>
                    <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                    <td>{u.last_seen ? new Date(u.last_seen).toLocaleDateString() : '—'}</td>
                    <td>
                      <button
                        type="button"
                        className="admin-btn-action delete"
                        title="Delete User"
                        onClick={() => deleteUser(u.email)}
                      >
                        <i className="fas fa-trash" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'sessions' && (
        <div className="admin-table-container">
          <div className="admin-table-header">
            <h2>
              <i
                className="fas fa-clipboard-list"
                style={{ color: 'var(--gold-dark)', marginRight: 8 }}
              />
              Interview Sessions
            </h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={userType}
                onChange={(e) => setUserType(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid var(--cream-dark)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="ALL">All Users</option>
                <option value="STUDENT">Students (Admin Created)</option>
                <option value="PUBLIC">Public Users (Self Registered)</option>
              </select>
              <div className="admin-search-box">
                <i className="fas fa-search" />
                <input
                  type="text"
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  placeholder="Search by email or role..."
                />
              </div>
            </div>
          </div>

          {sessionsLoading ? (
            <div className="admin-loading-msg">
              <i className="fas fa-spinner fa-spin" /> Loading sessions...
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="admin-empty-state">No interview sessions recorded yet.</div>
          ) : (
            <table className="admin-data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User Email</th>
                  <th>Role (Interview)</th>
                  <th>User Type</th>
                  <th>Score</th>
                  <th>Date</th>
                  <th>Saved At</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.map((s, i) => {
                  const score = s.score || s.score === 0 ? s.score : null
                  let badgeClass = 'na'
                  let badgeText = '—'
                  if (score !== null) {
                    badgeText = `${score}%`
                    if (score >= 75) badgeClass = 'high'
                    else if (score >= 50) badgeClass = 'mid'
                    else badgeClass = 'low'
                  }
                  return (
                    <tr key={s.id || i}>
                      <td>{i + 1}</td>
                      <td className="email-col">{s.user_email || '—'}</td>
                      <td>
                        <span className="admin-role-tag">{s.role || '—'}</span>
                      </td>
                      <td>
                        <span
                          className="admin-role-tag"
                          style={
                            s.user_role === 'STUDENT'
                              ? { background: '#E8F5E9', color: '#2E7D32' }
                              : undefined
                          }
                        >
                          {s.user_role === 'STUDENT' ? 'Student' : 'Public'}
                        </span>
                      </td>
                      <td>
                        <span className={`admin-score-badge ${badgeClass}`}>{badgeText}</span>
                      </td>
                      <td>{s.date || '—'}</td>
                      <td>{s.saved_at ? new Date(s.saved_at).toLocaleString() : '—'}</td>
                      <td>
                        <button
                          type="button"
                          className="admin-btn-action overview"
                          title="Report Overview"
                          onClick={() => setOverviewSession(s)}
                        >
                          <i className="fas fa-eye" />
                        </button>
                        <button
                          type="button"
                          className="admin-btn-action download"
                          title="Download Report"
                          onClick={() => downloadReport(s)}
                        >
                          <i className="fas fa-file-pdf" />
                        </button>
                        <button
                          type="button"
                          className="admin-btn-action delete"
                          title="Delete Session"
                          onClick={() => deleteSession(s.id)}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {overviewSession && (
        <div className="admin-modal-overlay" onClick={() => setOverviewSession(null)}>
          <div className="admin-modal-card" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="admin-modal-close"
              onClick={() => setOverviewSession(null)}
            >
              <i className="fas fa-times" />
            </button>
            <h2 style={{ marginBottom: 20, fontWeight: 800, fontSize: '1.5rem' }}>
              Report Overview
            </h2>
            <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 15 }}>
              <div style={{ background: '#f5f5f5', padding: '10px 15px', borderRadius: 8 }}>
                <strong>Candidate:</strong> {overviewSession.user_email}
              </div>
              <div style={{ background: '#f5f5f5', padding: '10px 15px', borderRadius: 8 }}>
                <strong>Role:</strong> {overviewSession.role}
              </div>
              <div style={{ background: '#f5f5f5', padding: '10px 15px', borderRadius: 8 }}>
                <strong>Score:</strong>{' '}
                {overviewSession.score ?? overviewSession.analysis?.overall ?? 'Not scored'}
                {(overviewSession.score ?? overviewSession.analysis?.overall) != null ? '%' : ''}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86rem' }}>
              <thead>
                <tr style={{ background: '#1A1A1A', color: '#fff' }}>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Category</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Score</th>
                  <th style={{ padding: '10px 12px', textAlign: 'left' }}>Admin Notes</th>
                </tr>
              </thead>
              <tbody>
                {categoryRows(overviewSession).map(([name, score, note]) => (
                  <tr key={name}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee', fontWeight: 700 }}>
                      {name}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>
                      {typeof score === 'number' ? `${Math.round(score)}%` : 'Not scored'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid #eee' }}>{note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>Core Strengths</h3>
              <ul>
                {(overviewSession.analysis?.strengths || ['Not enough analysed data available.']).map(
                  (item) => (
                    <li key={item}>{item}</li>
                  ),
                )}
              </ul>
            </div>
            <div style={{ marginTop: 12 }}>
              <h3 style={{ fontSize: 16, marginBottom: 8 }}>Areas to Improve</h3>
              <ul>
                {(
                  overviewSession.analysis?.improvements || ['Not enough analysed data available.']
                ).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {showAddStudent && (
        <div className="admin-modal-overlay" onClick={() => setShowAddStudent(false)}>
          <div className="admin-modal-card small" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="admin-modal-close"
              onClick={() => setShowAddStudent(false)}
            >
              <i className="fas fa-times" />
            </button>
            <h2 style={{ marginBottom: 20, fontWeight: 800, fontSize: '1.5rem' }}>Add Student</h2>
            <form onSubmit={createStudent}>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, fontSize: '0.9rem' }}>
                  Name
                </label>
                <input
                  type="text"
                  required
                  value={studentForm.name}
                  onChange={(e) => setStudentForm((f) => ({ ...f, name: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, fontSize: '0.9rem' }}>
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={studentForm.email}
                  onChange={(e) => setStudentForm((f) => ({ ...f, email: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 5, fontWeight: 600, fontSize: '0.9rem' }}>
                  Password
                </label>
                <input
                  type="text"
                  required
                  value={studentForm.password}
                  onChange={(e) => setStudentForm((f) => ({ ...f, password: e.target.value }))}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: '1px solid #ddd',
                    borderRadius: 8,
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={creating}
                style={{
                  width: '100%',
                  background: 'var(--navy)',
                  color: '#fff',
                  padding: 12,
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {creating ? 'Creating...' : 'Create Student Account'}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
