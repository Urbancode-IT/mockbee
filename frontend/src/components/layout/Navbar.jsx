import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import './Navbar.css'

/* Same asset + sizing as https://mockb.urbancode.in/ */
const LOGO = '/images/ChatGPT%20Image%20Apr%201,%202026,%2003_05_48%20PM.png'
const LOGO_STYLE = {
  height: 220,
  width: 'auto',
  margin: '-74px 0 -74px -80px',
  display: 'block',
  objectFit: 'contain',
}

export default function Navbar() {
  const { isAuthenticated, displayName, user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const isHome = location.pathname === '/'

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const close = (e) => {
      if (!e.target.closest('.user-nav-wrap')) setDropdownOpen(false)
    }
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  const handleLogout = () => {
    logout()
    setDropdownOpen(false)
    navigate('/')
  }

  const scrollTo = (id) => (e) => {
    e.preventDefault()
    setMenuOpen(false)
    if (!isHome) {
      navigate(`/${id}`)
      return
    }
    const el = document.querySelector(id)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const initial = (displayName || 'U').charAt(0).toUpperCase()

  return (
    <header>
      <nav
        className={`navbar${scrolled ? ' navbar--scrolled' : ''}`}
        role="navigation"
        aria-label="Main Navigation"
      >
        <Link
          to="/"
          className="navbar__brand"
          id="nav-logo"
          aria-label="MockBee Home"
          style={{ display: 'flex', alignItems: 'center' }}
        >
          <img src={LOGO} alt="MockBee Logo" className="navbar__logo" style={LOGO_STYLE} />
        </Link>

        <div
          className="navbar__hamburger"
          id="hamburger-menu"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle Menu"
          role="button"
        >
          <i className={`fas ${menuOpen ? 'fa-times' : 'fa-bars'}`} />
        </div>

        <ul className={`navbar__nav${menuOpen ? ' active' : ''}`} id="nav-links">
          <li>
            <a href="#home" id="nav-home" onClick={scrollTo('#home')}>
              Home
            </a>
          </li>
          <li>
            <a href="#about" id="nav-about" onClick={scrollTo('#about')}>
              About
            </a>
          </li>
          <li>
            <a href="#features" id="nav-features" onClick={scrollTo('#features')}>
              Features
            </a>
          </li>
          <li>
            <a href="#roles" id="nav-roles" onClick={scrollTo('#roles')}>
              Roles
            </a>
          </li>
          <li>
            <Link to="/dashboard/resume" id="nav-resume" onClick={() => setMenuOpen(false)}>
              Build Resume
            </Link>
          </li>
          {!isAuthenticated && (
            <>
              <li className="nav-mobile-only" id="mobile-nav-login">
                <Link to="/login" className="btn-login-mobile" onClick={() => setMenuOpen(false)}>
                  Log In
                </Link>
              </li>
              <li className="nav-mobile-only" id="mobile-nav-signup">
                <Link to="/signup" className="btn-signup-mobile" onClick={() => setMenuOpen(false)}>
                  Sign Up
                </Link>
              </li>
            </>
          )}
          {isAuthenticated && (
            <li className="nav-mobile-only" id="mobile-nav-dashboard">
              <Link to="/dashboard" className="btn-login-mobile" onClick={() => setMenuOpen(false)}>
                Dashboard
              </Link>
            </li>
          )}
        </ul>

        <div className="navbar__actions" id="nav-actions">
          {!isAuthenticated ? (
            <>
              <Link to="/login" className="btn-login" id="nav-login">
                Log In
              </Link>
              <Link to="/signup" className="btn-signup" id="nav-signup">
                Sign Up
              </Link>
            </>
          ) : (
            <div className="user-nav-wrap" id="nav-user-wrap">
              <div
                className="user-avatar-btn"
                id="nav-user-avatar"
                onClick={(e) => {
                  e.stopPropagation()
                  setDropdownOpen((v) => !v)
                }}
                title="User Menu"
              >
                {user?.picture ? (
                  <img src={user.picture} alt="Profile" />
                ) : (
                  <span id="nav-user-initial">{initial}</span>
                )}
              </div>
              {dropdownOpen && (
                <div className="user-dropdown" id="nav-user-dropdown">
                  <Link to="/dashboard" onClick={() => setDropdownOpen(false)}>
                    <i className="fas fa-columns" style={{ marginRight: 6, color: '#D8C4B6' }} /> Dashboard
                  </Link>
                  <button type="button" className="user-dropdown__logout" onClick={handleLogout}>
                    <i className="fas fa-sign-out-alt" style={{ marginRight: 6 }} /> Log Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
    </header>
  )
}
