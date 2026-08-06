import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import lottie from 'lottie-web'
import Navbar from '../../components/layout/Navbar'
import './LandingPage.css'

const BEE_IMG = '/images/file_0000000030c47208a129217cc981f4d6.png'
const SARAH_IMG = '/images/sarah.png'
const LOTTIE_RESUME = '/images/searching for profile.json'
const HERO_DYNAMIC_TEXT = 'Next Job Interview'

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
]

const ROLES = [
  {
    title: 'Python Developer',
    category: 'beginner intermediate advanced',
    level: 'ALL LEVELS',
    levelClass: 'level--all',
    icon: 'fab fa-python',
    tags: ['OOP', 'Django', 'APIs'],
  },
  {
    title: 'Frontend Developer',
    category: 'beginner',
    level: 'BEGINNER',
    levelClass: 'level--beginner',
    icon: 'fas fa-globe',
    tags: ['React', 'CSS', 'HTML'],
  },
  {
    title: 'Backend Developer',
    category: 'intermediate',
    level: 'INTERMEDIATE',
    levelClass: 'level--intermediate',
    icon: 'fas fa-cogs',
    tags: ['Node.js', 'REST', 'SQL'],
  },
  {
    title: 'ML Engineer',
    category: 'advanced',
    level: 'ADVANCED',
    levelClass: 'level--advanced',
    icon: 'fas fa-brain',
    tags: ['PyTorch', 'NLP', 'CV'],
  },
  {
    title: 'Data Scientist',
    category: 'intermediate',
    level: 'INTERMEDIATE',
    levelClass: 'level--intermediate',
    icon: 'fas fa-chart-bar',
    tags: ['Pandas', 'Stats', 'Viz'],
  },
  {
    title: 'Cloud Engineer',
    category: 'intermediate',
    level: 'INTERMEDIATE',
    levelClass: 'level--intermediate',
    icon: 'fas fa-cloud',
    tags: ['AWS', 'Azure', 'GCP'],
  },
  {
    title: 'DevOps Engineer',
    category: 'advanced',
    level: 'ADVANCED',
    levelClass: 'level--advanced',
    icon: 'fas fa-sync-alt',
    tags: ['CI/CD', 'Docker', 'K8s'],
  },
  {
    title: 'Cybersecurity Analyst',
    category: 'advanced',
    level: 'ADVANCED',
    levelClass: 'level--advanced',
    icon: 'fas fa-shield-alt',
    tags: ['Pentesting', 'SIEM', 'SOC'],
  },
  {
    title: 'Network Engineer',
    category: 'intermediate',
    level: 'INTERMEDIATE',
    levelClass: 'level--intermediate',
    icon: 'fas fa-satellite-dish',
    tags: ['TCP/IP', 'BGP', 'VPN'],
  },
  {
    title: 'System Architect',
    category: 'advanced',
    level: 'ADVANCED',
    levelClass: 'level--advanced',
    icon: 'fas fa-city',
    tags: ['Design', 'Scale', 'Patterns'],
  },
  {
    title: 'QA Engineer',
    category: 'beginner',
    level: 'BEGINNER',
    levelClass: 'level--beginner',
    icon: 'fas fa-flask',
    tags: ['Selenium', 'Jest', 'Testing'],
  },
  {
    title: 'Mobile Developer',
    category: 'intermediate',
    level: 'INTERMEDIATE',
    levelClass: 'level--intermediate',
    icon: 'fas fa-mobile-alt',
    tags: ['Flutter', 'React Native', 'Swift'],
  },
  {
    title: 'Testing',
    category: 'beginner',
    level: 'BEGINNER',
    levelClass: 'level--beginner',
    icon: 'fas fa-vial',
    tags: ['Manual', 'Automation', 'Quality'],
  },
  {
    title: 'AWS',
    category: 'intermediate',
    level: 'INTERMEDIATE',
    levelClass: 'level--intermediate',
    icon: 'fab fa-aws',
    tags: ['EC2', 'S3', 'Lambda'],
  },
]

export default function LandingPage() {
  const [filter, setFilter] = useState('all')
  const [filtering, setFiltering] = useState(false)
  const [visibleRoles, setVisibleRoles] = useState(() => ROLES.map(() => true))
  const [animIn, setAnimIn] = useState(() => ROLES.map(() => true))
  const [addNewVisible, setAddNewVisible] = useState(true)
  const [addNewAnimIn, setAddNewAnimIn] = useState(true)
  const [roleModalOpen, setRoleModalOpen] = useState(false)
  const [customRole, setCustomRole] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [heroText, setHeroText] = useState(HERO_DYNAMIC_TEXT)
  const [showCursor, setShowCursor] = useState(false)

  const beeRef = useRef(null)
  const heroRef = useRef(null)
  const roleInputRef = useRef(null)
  const pageRef = useRef(null)
  const lottieRef = useRef(null)

  /* Bee parallax */
  useEffect(() => {
    const hero = heroRef.current
    const bee = beeRef.current
    if (!hero || !bee) return undefined

    const onMove = (e) => {
      const rect = hero.getBoundingClientRect()
      const cx = rect.width / 2
      const cy = rect.height / 2
      const dx = (e.clientX - rect.left - cx) / cx
      const dy = (e.clientY - rect.top - cy) / cy
      bee.style.transform = `translate(${dx * 10}px, ${dy * 8}px)`
    }
    const onLeave = () => {
      bee.style.transform = ''
    }

    hero.addEventListener('mousemove', onMove)
    hero.addEventListener('mouseleave', onLeave)
    return () => {
      hero.removeEventListener('mousemove', onMove)
      hero.removeEventListener('mouseleave', onLeave)
    }
  }, [])

  /* Typewriter — start after 2.5s like main.js */
  useEffect(() => {
    const dynamicText = HERO_DYNAMIC_TEXT
    let isDeleting = false
    let charIndex = dynamicText.length
    let timer

    const typeWriter = () => {
      const atFullPause = !isDeleting && charIndex === dynamicText.length
      const atEmptyPause = isDeleting && charIndex === 0
      setShowCursor(!atFullPause && !atEmptyPause)
      setHeroText(dynamicText.substring(0, charIndex))

      let typeSpeed = isDeleting ? 40 : 80
      if (!isDeleting && charIndex === dynamicText.length) {
        typeSpeed = 4000
        isDeleting = true
      } else if (isDeleting && charIndex === 0) {
        typeSpeed = 1000
        isDeleting = false
      }
      charIndex += isDeleting ? -1 : 1
      timer = setTimeout(typeWriter, typeSpeed)
    }

    const start = setTimeout(typeWriter, 2500)
    return () => {
      clearTimeout(start)
      clearTimeout(timer)
    }
  }, [])

  /* Focus modal input */
  useEffect(() => {
    if (roleModalOpen && roleInputRef.current) {
      roleInputRef.current.focus()
    }
  }, [roleModalOpen])

  /* Resume preview Lottie — matches legacy index.html */
  useEffect(() => {
    const container = lottieRef.current
    if (!container) return undefined

    const animation = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: LOTTIE_RESUME,
    })

    return () => animation.destroy()
  }, [])

  const applyFilter = (nextFilter) => {
    if (nextFilter === filter || filtering) return
    setFilter(nextFilter)
    setFiltering(true)
    setAnimIn(ROLES.map(() => false))
    setAddNewAnimIn(false)

    setTimeout(() => {
      const nextVisible = ROLES.map(
        (role) => nextFilter === 'all' || role.category.includes(nextFilter)
      )
      const showAddNew = nextFilter === 'all'
      setVisibleRoles(nextVisible)
      setAddNewVisible(showAddNew)

      let visibleCount = 0
      ROLES.forEach((_, i) => {
        if (!nextVisible[i]) return
        const delay = visibleCount * 80
        visibleCount += 1
        setTimeout(() => {
          setAnimIn((prev) => {
            const copy = [...prev]
            copy[i] = true
            return copy
          })
        }, delay)
      })

      if (showAddNew) {
        const delay = visibleCount * 80
        setTimeout(() => setAddNewAnimIn(true), delay)
      }

      setFiltering(false)
    }, 350)
  }

  const openRoleModal = () => {
    setCustomRole('')
    setModalMessage('')
    setRoleModalOpen(true)
  }

  const submitRoleRequest = () => {
    const roleName = customRole.trim()
    if (!roleName) {
      alert('Please enter a role name!')
      return
    }
    try {
      const customRequests = JSON.parse(localStorage.getItem('mockbee_custom_roles') || '[]')
      customRequests.push({ role: roleName, timestamp: new Date().toISOString() })
      localStorage.setItem('mockbee_custom_roles', JSON.stringify(customRequests))
    } catch {
      /* ignore storage errors */
    }
    setModalMessage(`Success! Your request for "${roleName}" has been saved.`)
    setCustomRole('')
    setTimeout(() => setRoleModalOpen(false), 2000)
  }

  const collapsedStyle = { opacity: 0, transform: 'translateY(20px) scale(0.95)' }

  return (
    <div className="landing-page" ref={pageRef}>
      <Navbar />

      <main>
        {/* ===================== HERO SECTION ===================== */}
        <section className="hero" id="home" aria-labelledby="hero-heading" ref={heroRef}>
          <div className="hero__content">
            <h1 className="hero__title" id="hero-heading">
              <span className="hero__title-wrap">
                <span className="hero__title-text">
                  Ace Your {heroText}
                  {showCursor &&
                  heroText !== HERO_DYNAMIC_TEXT &&
                  heroText.length > 0 ? (
                    <span className="type-cursor" />
                  ) : null}
                </span>
              </span>
            </h1>
            <p className="hero__subtitle">
              Practice with Realistic Mock Interviews
              <br />
              &amp; Get Hired with Confidence
            </p>
            <div className="hero__actions">
              <Link to="/membership" className="btn-primary" id="btn-start-practicing">
                Start Practicing &nbsp;{' '}
                <i className="fas fa-chevron-right" style={{ fontSize: '0.8rem' }} />
              </Link>
              <a href="#roles" className="btn-secondary" id="btn-watch-demo">
                Demo &nbsp; <i className="fas fa-play" style={{ fontSize: '0.8rem' }} />
              </a>
            </div>
          </div>

          <div className="hero__visual" aria-hidden="true">
            <div className="hero__mascot">
              <div className="hero__bubbles">
                <div className="speech-bubble--welcome">
                  <p>
                    <strong>
                      <span className="animated-word" style={{ '--wd': 1 }}>
                        Hi!
                      </span>{' '}
                      <span className="animated-word" style={{ '--wd': 2 }}>
                        I&apos;m
                      </span>{' '}
                      <span className="animated-word" style={{ '--wd': 3 }}>
                        MockBee 🐝
                      </span>
                    </strong>
                  </p>
                  <p>
                    <span className="animated-word" style={{ '--wd': 4 }}>
                      Welcome!
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 5 }}>
                      Ready
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 6 }}>
                      to
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 7 }}>
                      ace
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 8 }}>
                      your
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 9 }}>
                      mock
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 10 }}>
                      interview
                    </span>{' '}
                    <span className="animated-word" style={{ '--wd': 11 }}>
                      today?
                    </span>
                  </p>
                </div>
              </div>
              <img
                src={BEE_IMG}
                alt="MockBee mascot – a friendly bee with headphones and a laptop"
                className="hero__bee-img"
                id="hero-bee"
                ref={beeRef}
              />
            </div>
          </div>
        </section>

        {/* ===================== HOW IT WORKS ===================== */}
        <section className="how-it-works" id="about" aria-labelledby="how-heading">
          <div className="how-it-works__header fade-in-up visible" data-delay="0">
            <div className="how-it-works__line how-it-works__line--short" aria-hidden="true" />
            <h2 className="how-it-works__title" id="how-heading">
              How MockBee Works
            </h2>
            <div className="how-it-works__line how-it-works__line--long" aria-hidden="true" />
          </div>

          <div className="how-it-works__cards">
            <article className="step-card fade-in-up visible" data-delay="100" id="step-choose-role">
              <div className="step-card__header">
                <div className="step-card__number-badge">1</div>
                <h3 className="step-card__title">Choose Your Role</h3>
              </div>
              <div className="step-card__separator" />
              <p className="step-card__desc">
                Select the job position
                <br />
                you want to practice for.
              </p>
              <div className="step-card__icon-wrap" aria-hidden="true">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="18" y="20" width="40" height="46" rx="4" fill="#c8962a" opacity="0.2" />
                  <rect x="20" y="22" width="36" height="42" rx="3" fill="#e8d9a8" stroke="#c8962a" strokeWidth="1.5" />
                  <rect x="30" y="16" width="16" height="12" rx="3" fill="#a07820" stroke="#c8962a" strokeWidth="1.5" />
                  <rect x="32" y="18" width="12" height="8" rx="2" fill="#e8d9a8" />
                  <line x1="27" y1="36" x2="50" y2="36" stroke="#a07820" strokeWidth="2" strokeLinecap="round" />
                  <line x1="27" y1="43" x2="50" y2="43" stroke="#a07820" strokeWidth="2" strokeLinecap="round" />
                  <line x1="27" y1="50" x2="40" y2="50" stroke="#a07820" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="58" cy="55" r="10" fill="#2c3e5c" />
                  <polyline
                    points="53,55 57,59 63,51"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <ellipse cx="15" cy="65" rx="8" ry="5" fill="#5a7a4a" opacity="0.6" transform="rotate(-20 15 65)" />
                  <ellipse cx="62" cy="68" rx="6" ry="4" fill="#4a6a3a" opacity="0.5" transform="rotate(15 62 68)" />
                </svg>
              </div>
            </article>

            <article className="step-card fade-in-up visible" data-delay="250" id="step-mock-interview">
              <div className="step-card__header">
                <div className="step-card__number-badge">2</div>
                <h3 className="step-card__title">Take Mock Interviews</h3>
              </div>
              <div className="step-card__separator" />
              <p className="step-card__desc">
                Experience live or
                <br />
                AI-driven mock sessions.
              </p>
              <div className="step-card__icon-wrap" aria-hidden="true">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="14" y="26" width="46" height="30" rx="3" fill="#2c3e5c" stroke="#1e2d42" strokeWidth="1.5" />
                  <rect x="17" y="29" width="40" height="24" rx="2" fill="#1a2535" />
                  <line x1="21" y1="35" x2="36" y2="35" stroke="#c8962a" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="21" y1="40" x2="32" y2="40" stroke="#5a9a6a" strokeWidth="1.8" strokeLinecap="round" />
                  <line x1="21" y1="45" x2="40" y2="45" stroke="#4a8aaa" strokeWidth="1.8" strokeLinecap="round" />
                  <polygon points="48,37 48,47 56,42" fill="#c8962a" opacity="0.85" />
                  <rect x="10" y="56" width="54" height="4" rx="2" fill="#3d4e6a" />
                  <rect x="20" y="57" width="34" height="2" rx="1" fill="#2c3e5c" />
                  <rect x="30" y="59.5" width="14" height="1" rx="0.5" fill="#4a5e7a" />
                </svg>
              </div>
            </article>

            <article className="step-card fade-in-up visible" data-delay="400" id="step-feedback">
              <div className="step-card__header">
                <div className="step-card__number-badge">3</div>
                <h3 className="step-card__title">Get Feedback &amp; Improve</h3>
              </div>
              <div className="step-card__separator" />
              <p className="step-card__desc">
                Receive detailed
                <br />
                feedback and tips
              </p>
              <div className="step-card__icon-wrap" aria-hidden="true">
                <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect x="18" y="16" width="38" height="48" rx="4" fill="#e8d9a8" stroke="#c8962a" strokeWidth="1.5" />
                  <path d="M45 16 L56 27 L45 27 Z" fill="#c8962a" opacity="0.4" />
                  <path d="M45 16 L56 27 L45 27 Z" fill="#d4a840" stroke="#c8962a" strokeWidth="1" />
                  <line x1="24" y1="34" x2="42" y2="34" stroke="#a08040" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="24" y1="40" x2="44" y2="40" stroke="#a08040" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="24" y1="46" x2="38" y2="46" stroke="#a08040" strokeWidth="1.5" strokeLinecap="round" />
                  <circle cx="58" cy="54" r="14" fill="#c8962a" opacity="0.15" />
                  <polygon
                    points="58,44 60.4,51.2 68,51.2 62,55.8 64.4,63 58,58.4 51.6,63 54,55.8 48,51.2 55.6,51.2"
                    fill="#c8962a"
                    stroke="#a07820"
                    strokeWidth="0.8"
                  />
                  <ellipse cx="16" cy="62" rx="7" ry="4" fill="#5a7a4a" opacity="0.55" transform="rotate(-25 16 62)" />
                </svg>
              </div>
            </article>
          </div>
        </section>

        {/* ===================== WHY CHOOSE & ATS RESUME ===================== */}
        <section className="features-split" id="features">
          <div className="features-split__container">
            <div className="features-split__left">
              <div className="why-choose">
                <div className="section-header-compact">
                  <span className="section-header-compact__line section-header-compact__line--short" />
                  <h2 className="section-header-compact__title">Why Choose MockBee?</h2>
                  <span className="section-header-compact__line" />
                </div>

                <div className="why-choose__grid">
                <div className="feature-item">
                  <div className="feature-item__icon-wrap">
                    <svg viewBox="0 0 100 100" className="feature-svg">
                      <path d="M50 5 L85 20 V55 C85 80 50 95 50 95 C50 95 15 80 15 55 V20 L50 5 Z" fill="#d4a373" />
                      <path
                        d="M50 12 L78 24 V53 C78 72 50 86 50 86 C50 86 22 72 22 53 V24 L50 12 Z"
                        fill="#f5d796"
                        opacity="0.4"
                      />
                      <g transform="translate(32, 28) scale(0.6)">
                        <path
                          d="M45.1 27.2c-.3-1.6-1.1-3.1-2.1-4.4l3.1-4c.4-.5.3-1.2-.2-1.6l-2.6-2.6c-.5-.5-1.2-.5-1.6-.2l-4 3.1c-1.3-1-2.8-1.7-4.4-2.1l-.8-4.9c-.1-.7-.7-1.1-1.4-1.1h-3.6c-.7 0-1.3.5-1.4 1.1l-.8 4.9c-1.6.3-3.1 1.1-4.4 2.1l-4-3.1c-.5-.4-1.2-.3-1.6.2l-2.6 2.6c-.5.5-.5 1.2-.2 1.6l3.1 4c-1 1.3-1.7 2.8-2.1 4.4l-4.9.8c-.7.1-1.1.7-1.1 1.4v3.6c0 .7.5 1.3 1.1 1.4l4.9.8c.3 1.6 1.1 3.1 2.1 4.4l-3.1 4c-.4.5-.3 1.2.2 1.6l2.6 2.6c.5.5 1.2.5 1.6.2l4-3.1c1.3 1 2.8 1.7 4.4 2.1l.8 4.9c.1.7.7 1.1 1.4 1.1h3.6c.7 0 1.3-.5 1.4-1.1l.8-4.9c1.6-.3 3.1-1.1 4.4-2.1l4 3.1c.5.4 1.2.3 1.6-.2l2.6-2.6c.5-.5.5-1.2.2-1.6l-3.1-4c1-1.3 1.7-2.8 2.1-4.4l4.9-.8c.7-.1 1.1-.7 1.1-1.4v-3.6c0-.7-.5-1.3-1.1-1.4l-4.9-.8zM31 37.5c-3.6 0-6.5-2.9-6.5-6.5s2.9-6.5 6.5-6.5 6.5 2.9 6.5 6.5-2.9 6.5-6.5 6.5z"
                          fill="#3e2e1e"
                        />
                      </g>
                    </svg>
                  </div>
                  <h3 className="feature-item__title">Realistic Scenarios</h3>
                  <p className="feature-item__desc">
                    Practice with immersive,
                    <br />
                    real-world interview setups.
                  </p>
                </div>

                <div className="feature-item__divider" />

                <div className="feature-item">
                  <div className="feature-item__icon-wrap">
                    <svg viewBox="0 0 100 100" className="feature-svg">
                      <path d="M50 5 L85 20 V55 C85 80 50 95 50 95 C50 95 15 80 15 55 V20 L50 5 Z" fill="#1a2535" />
                      <path
                        d="M50 12 L78 24 V53 C78 72 50 86 50 86 C50 86 22 72 22 53 V24 L50 12 Z"
                        fill="#4a5e7a"
                        opacity="0.3"
                      />
                      <g transform="translate(34, 30) scale(0.6)">
                        <path
                          d="M42 4H10C8.9 4 8 4.9 8 6v40c0 1.1.9 2 2 2h32c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-2 40H12V8h28v36z"
                          fill="#fff"
                        />
                        <path d="M16 14h20v4H16zm0 10h20v4H16zm0 10h12v4H16z" fill="#fff" />
                      </g>
                    </svg>
                  </div>
                  <h3 className="feature-item__title">Expert Guidance</h3>
                  <p className="feature-item__desc">
                    Learn from industry pros
                    <br />
                    and AI mentors.
                  </p>
                </div>

                <div className="feature-item__divider" />

                <div className="feature-item">
                  <div className="feature-item__icon-wrap">
                    <svg viewBox="0 0 100 100" className="feature-svg">
                      <path
                        d="M50 5 L85 20 V55 C85 80 50 95 50 95 C50 95 15 80 15 55 V20 L50 5 Z"
                        fill="#fff"
                        stroke="#d4a373"
                        strokeWidth="2"
                      />
                      <path d="M50 12 L78 24 V53 C78 72 50 86 50 86 C50 86 22 72 22 53 V24 L50 12 Z" fill="#fdfaf3" />
                      <g transform="translate(34, 34) scale(0.6)">
                        <rect x="0" y="24" width="8" height="16" fill="#d4a373" />
                        <rect x="12" y="12" width="8" height="28" fill="#d4a373" />
                        <rect x="24" y="0" width="8" height="40" fill="#d4a373" />
                      </g>
                    </svg>
                  </div>
                  <h3 className="feature-item__title">Performance Insights</h3>
                  <p className="feature-item__desc">
                    Detailed analytics to track
                    <br />
                    your interview growth.
                  </p>
                </div>
                </div>
              </div>

              <article className="testimonial-card testimonial-card--small">
                <div className="testimonial-card__profile">
                  <img src={SARAH_IMG} alt="Sarah M. Profile" className="testimonial-card__img" />
                </div>
                <div className="testimonial-card__content">
                  <span className="testimonial-card__quote-mark">&ldquo;</span>
                  <p className="testimonial-card__text">
                    MockBee helped me gain the confidence I wanted to nail my interview. I&apos;m now at my dream
                    job!
                  </p>
                  <p className="testimonial-card__author">— Sarah M.</p>
                </div>
              </article>
            </div>

            <div className="features-split__aside fade-in-right visible">
              <div className="ats-resume-box">
                <h2 className="ats-resume-box__title">Build Your ATS Approved Resume</h2>
                <ul className="ats-resume-box__list">
                  <li className="fade-in-up visible" data-delay="100">
                    Create a professional, ATS friendly resume
                  </li>
                  <li className="fade-in-up visible" data-delay="200">
                    Use proven templates &amp; keyword suggestions to pass any ATS.
                  </li>
                  <li className="fade-in-up visible" data-delay="300">
                    Beat the system and land more interviews
                  </li>
                </ul>
                <Link to="/dashboard/resume" className="btn-builder">
                  Build Resume
                </Link>
              </div>

              <div className="resume-preview-panel">
                <div ref={lottieRef} className="resume-preview-lottie" aria-hidden="true" />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ===================== ROLES SELECTION SECTION ===================== */}
      <section className="roles-section" id="roles">
        <div className="container">
          <div className="section-header-compact section-header--centered">
            <span className="section-header-compact__line" />
            <h2 className="section-header-compact__title">
              Pick Your <span className="text-highlight">Role</span>
            </h2>
            <span className="section-header-compact__line" />
          </div>
          <p className="roles-section__subtitle">
            Choose from 16+ specialised IT roles and get grilled by our AI on exactly what your interviewers will
            ask.
          </p>

          <div className="roles-filters">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`filter-btn${filter === f.key ? ' active' : ''}`}
                data-filter={f.key}
                onClick={() => applyFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="roles-grid">
            {ROLES.map((role, i) => (
              <div
                key={role.title}
                className={`role-card${animIn[i] ? ' anim-in' : ''}`}
                data-category={role.category}
                style={{
                  display: visibleRoles[i] ? 'flex' : 'none',
                  ...(animIn[i] ? {} : collapsedStyle),
                }}
              >
                <div className="role-card__icon">
                  <i className={role.icon} style={{ color: '#1a2535' }} />
                </div>
                <h3 className="role-card__title">{role.title}</h3>
                <span className={`role-card__level ${role.levelClass}`}>{role.level}</span>
                <div className="role-card__tags">
                  {role.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <Link to={`/interview?role=${encodeURIComponent(role.title)}`} className="role-card__btn">
                  Start Mock &rarr;
                </Link>
              </div>
            ))}

            <div
              className={`role-card role-card--add-new${addNewAnimIn ? ' anim-in' : ''}`}
              id="add-role-card"
              onClick={openRoleModal}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openRoleModal()
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                display: addNewVisible ? 'flex' : 'none',
                ...(addNewAnimIn ? {} : collapsedStyle),
              }}
            >
              <div className="role-card__icon">
                <i className="fas fa-plus" style={{ color: '#c8962a' }} />
              </div>
              <h3 className="role-card__title">
                Add New <br />
                Role
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#777', marginTop: '-5px' }}>Request a role</p>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== MODAL FOR ADDING ROLE ===================== */}
      <div
        id="roleModal"
        className={`modal-overlay${roleModalOpen ? ' active' : ''}`}
        onClick={(e) => {
          if (e.target === e.currentTarget) setRoleModalOpen(false)
        }}
      >
        <div className="modal-content">
          <span className="modal-close" id="closeModal" onClick={() => setRoleModalOpen(false)}>
            &times;
          </span>
          <h2 className="modal-title">Request a New Role</h2>
          <p className="modal-subtitle">Tell us which course or role you&apos;re looking for!</p>
          <div className="modal-form">
            <input
              type="text"
              id="customRoleInput"
              ref={roleInputRef}
              placeholder="Enter role name (e.g. Data Engineer)"
              value={customRole}
              onChange={(e) => setCustomRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitRoleRequest()
              }}
            />
            <button type="button" id="submitRoleBtn" className="btn-primary" onClick={submitRoleRequest}>
              Submit Request
            </button>
          </div>
          <p id="modalMessage" style={{ display: modalMessage ? 'block' : 'none' }}>
            {modalMessage}
          </p>
        </div>
      </div>

      {/* ===================== READY TO ACE BOX ===================== */}
      <section className="ready-to-ace" id="ready-to-ace">
        <div className="container">
          <div className="ready-box-modern">
            <h2 className="ready-box-modern__title">Ready to ace your next interview?</h2>
            <p className="ready-box-modern__subtitle">
              Join 10,000+ developers who&apos;ve sharpened their skills with MockBee.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== FINAL CTA SECTION ===================== */}
      <section className="cta-final">
        <div className="cta-final__foliage cta-final__foliage--left" />
        <div className="cta-final__foliage cta-final__foliage--right" />

        <div className="cta-final__container container">
          <div className="cta-final__waves">
            <div className="wave wave1" />
            <div className="wave wave2" />
            <div className="wave wave3" />
          </div>

          <div className="cta-final__header fade-in-up visible" data-delay="100">
            <span className="cta-final__line" />
            <h2 className="cta-final__title">Boost Your Career With MockBee</h2>
            <span className="cta-final__line" />
          </div>
          <p className="cta-final__subtitle fade-in-up visible" data-delay="250">
            Join Now &amp; Start Practicing Today!
          </p>

          <div className="cta-final__button-wrap">
            <Link to="/membership" className="btn-bezel">
              Get Started
            </Link>
          </div>
        </div>
      </section>

      {/* ===================== PREMIUM FOOTER ===================== */}
      <footer className="main-footer main-footer--dark landing-footer" id="site-footer">
        <div className="main-footer__container container">
          <div className="main-footer__top">
            <div className="main-footer__links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Support</a>
            </div>
            <div className="main-footer__social">
              <a href="#" aria-label="Twitter">
                <i className="fab fa-x-twitter" />
              </a>
              <a href="#" aria-label="Instagram">
                <i className="fab fa-instagram" />
              </a>
              <a href="#" aria-label="YouTube">
                <i className="fab fa-youtube" />
              </a>
              <a href="#" aria-label="Facebook">
                <i className="fab fa-facebook-f" />
              </a>
            </div>
          </div>
          <div className="main-footer__copyright">
            <p>ALL RIGHTS RESERVED @MOCKBEE</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
