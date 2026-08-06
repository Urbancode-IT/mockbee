import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getJSON, setJSON, setItem } from '../../utils/storage'
import './SettingsPage.css'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, updateProfile } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [mascot, setMascot] = useState(() => localStorage.getItem('mockbee_mascot') || 'modern')
  const [showPass, setShowPass] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const loadSettings = () => {
    setName(user?.name || 'Professional User')
    setEmail(user?.email || '')
    setPassword('')
    setConfirm('')
    setMascot(localStorage.getItem('mockbee_mascot') || 'modern')
  }

  useEffect(() => {
    loadSettings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.name, user?.email])

  const handleSave = () => {
    const newName = name.trim()
    const newEmail = email.trim().toLowerCase()

    if (!newName || !newEmail) {
      setToast({ type: 'error', message: 'Name and email are required.' })
      return
    }

    if (password && password !== confirm) {
      setToast({ type: 'error', message: 'Passwords do not match.' })
      return
    }

    setSaving(true)
    setToast(null)

    setTimeout(() => {
      const oldEmail = user?.email
      const accounts = getJSON(KEYS.accounts, {}) || {}

      if (oldEmail && accounts[oldEmail]) {
        const accountData = { ...accounts[oldEmail] }
        if (oldEmail !== newEmail) {
          delete accounts[oldEmail]
          accountData.email = newEmail
          accountData.name = newName
          if (password) accountData.password = password
          accounts[newEmail] = accountData
        } else {
          accountData.name = newName
          if (password) accountData.password = password
          accounts[oldEmail] = accountData
        }
        setJSON(KEYS.accounts, accounts)
      }

      updateProfile({ name: newName, email: newEmail })
      setItem('mockbee_mascot', mascot)

      setPassword('')
      setConfirm('')
      setSaving(false)
      setToast({ type: 'success', message: 'Settings Saved!' })
      setTimeout(() => setToast(null), 1500)
    }, 800)
  }

  return (
    <div className="settings-page">
      <button type="button" className="btn-back-settings" onClick={() => navigate('/dashboard')} aria-label="Back">
        <i className="fas fa-arrow-left" />
      </button>

      <h2>Account Settings</h2>
      <div className="settings-card">
        <div className="form-group">
          <label htmlFor="settings-name">Full Name</label>
          <input
            id="settings-name"
            type="text"
            placeholder="Your full name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label htmlFor="settings-email">Email Address</label>
          <input
            id="settings-email"
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="settings-pass">New Password</label>
          <div className="input-wrapper">
            <input
              id="settings-pass"
              type={showPass ? 'text' : 'password'}
              placeholder="Leave empty to keep current"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPass((v) => !v)}
              aria-label="Toggle password visibility"
            >
              <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="settings-confirm">Confirm Password</label>
          <div className="input-wrapper">
            <input
              id="settings-confirm"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Confirm your new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label="Toggle confirm password visibility"
            >
              <i className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'}`} />
            </button>
          </div>
        </div>

        <div className="form-group">
          <label htmlFor="settings-mascot">Interview Mascot</label>
          <select id="settings-mascot" value={mascot} onChange={(e) => setMascot(e.target.value)}>
            <option value="modern">Golden Bee (Modern)</option>
            <option value="classic">Classic Bee (Retro)</option>
            <option value="sleek">Sleek Bee (Minimal)</option>
          </select>
        </div>

        <div className="btn-wrapper">
          <button type="button" className="btn-cancel" onClick={loadSettings}>
            Cancel
          </button>
          <button type="button" className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <i className="fas fa-spinner fa-spin" style={{ marginRight: 8 }} /> Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save" style={{ marginRight: 8 }} /> Save Changes
              </>
            )}
          </button>
        </div>
      </div>

      {toast && <div className={`settings-toast ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
