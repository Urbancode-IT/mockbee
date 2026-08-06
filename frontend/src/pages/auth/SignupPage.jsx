import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import '../../styles/signup.css'
import './SignupPage.css'

const MASCOT = '/images/file_0000000030c47208a129217cc981f4d6.png'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/

export default function SignupPage() {
  const { signup, oauthLogin } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [fullname, setFullname] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [rocketActive, setRocketActive] = useState(false)

  useEffect(() => {
    if (searchParams.get('source') === 'rocket') {
      const t = setTimeout(() => setRocketActive(true), 300)
      return () => clearTimeout(t)
    }
  }, [searchParams])

  const clearError = () => setError('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    clearError()

    const name = fullname.trim()
    const emailRaw = email.trim()
    const pass = password
    const confirmPass = confirm

    if (!name || !emailRaw || !pass) {
      setError('Please fill in all required fields.')
      return
    }
    if (!EMAIL_REGEX.test(emailRaw)) {
      setError('Please enter a valid email address.')
      return
    }
    if (pass.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (pass !== confirmPass) {
      setError('Passwords do not match.')
      return
    }
    if (!agreeTerms) {
      setError('Please agree to the Terms & Privacy.')
      return
    }

    setSubmitting(true)
    const result = await signup({ name, email: emailRaw, password: pass })
    setSubmitting(false)

    if (!result.ok) {
      setError(result.error || 'Signup failed.')
      return
    }

    navigate('/dashboard?source=new_user')
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

  return (
    <>
      <div id="rocket-group" className={rocketActive ? 'arrival-active' : ''}>
        <div id="rocket-tail">WELCOME</div>
        <i id="incoming-rocket" className="fas fa-rocket" />
      </div>

      <main>
        <Link to="/" className="btn-back-floating">
          <i className="fas fa-arrow-left" /> Back to Home
        </Link>

        <section className="signup-section">
          <ul className="bg-bubbles" aria-hidden="true">
            {Array.from({ length: 20 }).map((_, i) => (
              <li key={i} />
            ))}
          </ul>

          <div className="welcome-minimal">
            <h1 className="welcome-minimal__title">Join the Future of Interviewing!</h1>
            <p className="welcome-minimal__subtitle">
              Create your free MockBee account and start mastering your career today.
            </p>
          </div>

          <div className="signup-card">
            <div className="signup-card__visual">
              <img src={MASCOT} alt="MockBee Mascot" className="signup-card__img" />
              <h2 className="signup-card__quote">Ready to take off?</h2>
              <p className="signup-card__subtitle">Join 10,000+ developers landing their dream jobs.</p>
            </div>

            <div className="signup-card__form-wrapper">
              <div className="form-header">
                <h1 className="form-header__title">Create Account</h1>
                <p className="form-header__desc">Start practicing for your next interview today.</p>
              </div>

              <div className="social-login signup-social-row">
                <button
                  type="button"
                  className="btn-social social-icon signup-social-btn"
                  title="Sign in with Google"
                  onClick={() => handleOAuth('Google')}
                >
                  <i className="fab fa-google" /> Google
                </button>
                <button
                  type="button"
                  className="btn-social social-icon signup-social-btn"
                  title="Sign in with GitHub"
                  onClick={() => handleOAuth('GitHub')}
                >
                  <i className="fab fa-github" /> GitHub
                </button>
              </div>

              <div className="auth-divider">
                <span>or sign up with email</span>
              </div>

              <form className="auth-form" onSubmit={handleSubmit} noValidate>
                <div className="form-group">
                  <label htmlFor="fullname" className="form-label">Full Name</label>
                  <input
                    type="text"
                    id="fullname"
                    name="fullname"
                    className="form-input"
                    placeholder="John Doe"
                    value={fullname}
                    onChange={(e) => {
                      setFullname(e.target.value)
                      clearError()
                    }}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email" className="form-label">Email Address</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    className="form-input"
                    placeholder="john@example.com"
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
                      className="form-input"
                      placeholder="Create a strong password"
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
                    />
                  </div>
                </div>

                <div className="form-group password-group">
                  <label htmlFor="confirm-password" className="form-label">Re-enter Password</label>
                  <div className="input-wrapper">
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      id="confirm-password"
                      name="confirm-password"
                      className="form-input"
                      placeholder="Confirm your password"
                      value={confirm}
                      onChange={(e) => {
                        setConfirm(e.target.value)
                        clearError()
                      }}
                      required
                    />
                    <i
                      className={`fas ${showConfirm ? 'fa-eye-slash' : 'fa-eye'} toggle-password`}
                      onClick={() => setShowConfirm((v) => !v)}
                      role="button"
                      tabIndex={0}
                    />
                  </div>
                </div>

                <div className="form-options">
                  <label className="checkbox-wrap">
                    <input
                      type="checkbox"
                      id="agreeTerms"
                      checked={agreeTerms}
                      onChange={(e) => {
                        setAgreeTerms(e.target.checked)
                        clearError()
                      }}
                    />
                    <span>
                      I agree to the <a href="#" className="form-link">Terms</a> &{' '}
                      <a href="#" className="form-link">Privacy</a>
                    </span>
                  </label>
                </div>

                <div className={`signup-error-msg${error ? ' is-visible' : ''}`}>
                  <i className="fas fa-circle-exclamation" />
                  <span>{error || 'All fields are required.'}</span>
                </div>

                <button type="submit" className="btn-submit" disabled={submitting}>
                  {submitting ? 'Signing up…' : 'Sign Up'}
                </button>
              </form>

              <p className="auth-redirect">
                Already have an account?{' '}
                <Link to="/login" className="form-link">Log in</Link>
              </p>
            </div>
          </div>
        </section>
      </main>
    </>
  )
}
