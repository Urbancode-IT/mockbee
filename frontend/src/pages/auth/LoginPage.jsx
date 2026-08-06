import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import '../../styles/login.css'
import './LoginPage.css'

const SOCIAL_PROVIDERS = [
  { key: 'google', icon: 'fab fa-google', title: 'Sign in with Google' },
  { key: 'github', icon: 'fab fa-github', title: 'Sign in with GitHub' },
  { key: 'facebook', icon: 'fab fa-facebook-f', title: 'Sign in with Facebook' },
  { key: 'linkedin', icon: 'fab fa-linkedin-in', title: 'Sign in with LinkedIn' },
  { key: 'twitter', icon: 'fab fa-twitter', title: 'Sign in with Twitter' },
]

export default function LoginPage() {
  const { login, oauthLogin } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState(false)
  const [passwordError, setPasswordError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [resetOpen, setResetOpen] = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetMessage, setResetMessage] = useState('')
  const [resetSending, setResetSending] = useState(false)
  const [resetEmailOk, setResetEmailOk] = useState(false)

  const clearError = () => {
    setError('')
    setEmailError(false)
    setPasswordError(false)
  }

  const showLoginError = (msg, passwordOnly = false) => {
    setError(msg)
    setEmailError(!passwordOnly)
    setPasswordError(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()

    const emailRaw = email.trim()
    if (!emailRaw || !password) {
      showLoginError('Please enter both your email and password.')
      return
    }

    setSubmitting(true)
    const result = await login(emailRaw, password)
    setSubmitting(false)

    if (!result.ok) {
      showLoginError(result.error || 'Login failed.')
      return
    }

    if (result.isAdmin) {
      navigate('/admin')
      return
    }
    navigate('/dashboard')
  }

  const handleOAuth = async (provider) => {
    let oauthEmail = prompt(`Enter the email for your ${provider} account:`) || ''
    oauthEmail = oauthEmail.trim().toLowerCase()
    if (!oauthEmail || !oauthEmail.includes('@')) {
      alert('A valid email is required to continue.')
      return
    }
    const defaultName = oauthEmail.split('@')[0] || `${provider} User`
    const oauthName = prompt(`Enter your ${provider} account name:`, defaultName) || defaultName

    const result = await oauthLogin({ provider, email: oauthEmail, name: oauthName })
    if (!result.ok) {
      alert(result.error || `Failed to continue with ${provider}.`)
      return
    }
    navigate('/dashboard')
  }

  const handleResetSubmit = () => {
    if (!resetEmail || !resetEmail.includes('@')) {
      alert('Please enter a valid email address.')
      return
    }

    setResetSending(true)
    setTimeout(() => {
      setResetSending(false)
      setResetMessage(
        `A reset link has been sent to ${resetEmail}. Please check your inbox.`
      )
      setResetEmailOk(true)
    }, 1500)
  }

  const openReset = (e) => {
    e.preventDefault()
    setResetEmail('')
    setResetMessage('')
    setResetEmailOk(false)
    setResetOpen(true)
  }

  return (
    <main>
      <Link to="/" className="btn-back-floating">
        <i className="fas fa-arrow-left" /> Back to Home
      </Link>

      <section className="login-section">
        <ul className="bg-bubbles" aria-hidden="true">
          {Array.from({ length: 20 }).map((_, i) => (
            <li key={i} />
          ))}
        </ul>

        <div className="welcome-minimal">
          <h1 className="welcome-minimal__title">Welcome back to MockBee!</h1>
          <p className="welcome-minimal__subtitle">
            The AI-Powered Mock Interview Platform designed for your success.
          </p>
        </div>

        <div className="login-card">
          <h2 className="login-card__title">Log In</h2>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label htmlFor="email" className="form-label">Email Address or Username</label>
              <input
                type="text"
                id="email"
                name="email"
                className={`form-input${emailError ? ' input-error' : ''}`}
                placeholder="john@example.com / Username"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  clearError()
                }}
                required
              />
            </div>

            <div className="form-group password-group">
              <label htmlFor="password" className="form-label">Password</label>
              <div className="input-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  name="password"
                  className={`form-input${passwordError ? ' input-error' : ''}`}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    clearError()
                  }}
                  required
                />
                <i
                  className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                  onClick={() => setShowPassword((v) => !v)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') setShowPassword((v) => !v)
                  }}
                />
              </div>
            </div>

            <div className="form-options">
              <label className="checkbox-wrap">
                <input
                  type="checkbox"
                  id="remember"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-link" onClick={openReset}>Forgot password?</a>
            </div>

            <div className={`login-error-msg${error ? ' is-visible' : ''}`}>
              <i className="fas fa-exclamation-circle" />
              <span>{error}</span>
            </div>

            <button type="submit" className="btn-submit" disabled={submitting}>
              {submitting ? 'Logging in…' : 'Log In'}
            </button>
          </form>

          <p className="auth-redirect">
            Don&apos;t have an account? <Link to="/signup">Sign up</Link>
          </p>

          <div className="social-signin-wrap">
            <span className="social-signin-label">Or sign in with</span>
            <div className="social-icons-group">
              {SOCIAL_PROVIDERS.map((p) => (
                <a
                  key={p.key}
                  href="#"
                  className={`social-icon ${p.key}`}
                  title={p.title}
                  onClick={(e) => {
                    e.preventDefault()
                    handleOAuth(p.title.replace('Sign in with ', ''))
                  }}
                >
                  <i className={p.icon} />
                </a>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div
        id="resetModal"
        className={`modal-overlay${resetOpen ? ' active' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setResetOpen(false)
        }}
      >
        <div className="modal-content">
          <span className="modal-close" onClick={() => setResetOpen(false)}>&times;</span>
          <h2 className="modal-title">Reset Password</h2>
          <p className="modal-subtitle">
            Enter your email and we&apos;ll send you a link to reset your password.
          </p>
          <div className="modal-form">
            <input
              type="email"
              id="resetEmailInput"
              placeholder="Enter your email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              style={resetEmailOk ? { borderColor: 'green' } : undefined}
            />
            <button
              type="button"
              id="submitResetBtn"
              className="btn-primary"
              onClick={handleResetSubmit}
              disabled={resetSending}
            >
              {resetSending ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> Sending...
                </>
              ) : (
                'Send Reset Link'
              )}
            </button>
          </div>
          <p className={`reset-message${resetMessage ? ' is-visible' : ''}`}>
            {resetMessage && (
              <>
                <i className="fas fa-check-circle" /> A reset link has been sent to{' '}
                <strong>{resetEmail}</strong>. Please check your inbox.
              </>
            )}
          </p>
        </div>
      </div>
    </main>
  )
}
