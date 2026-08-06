import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import './MembershipPage.css'

export default function MembershipPage() {
  const navigate = useNavigate()
  const iconRef = useRef(null)
  const [launching, setLaunching] = useState(false)

  const handleRocketClick = (e) => {
    e.preventDefault()
    if (launching) return
    setLaunching(true)

    const icon = iconRef.current
    if (icon) icon.classList.add('rocket-animate')

    setTimeout(() => {
      navigate('/signup?source=rocket')
    }, 1200)
  }

  return (
    <div className="membership-page">
      <main className="membership-hero">
        <Link to="/" className="btn-back-floating">
          <i className="fas fa-arrow-left" /> Back to Home
        </Link>

        <div className="membership-hero__badge">MockBee Pro Member</div>

        <h1 className="membership-hero__title">
          Master Your Future with <br />
          <span className="membership-hero__title-accent">MockBee Paid Version</span>
        </h1>
        <p className="membership-hero__subtitle">
          Stop guessing and start succeeding. Get access to the most comprehensive interview
          preparation toolkit in the IT industry.
        </p>

        <div className="flashy-grid">
          <div className="flash-box">
            <div className="flash-box__ribbon">Most Popular</div>
            <div className="flash-box__icon"><i className="fas fa-database" /></div>
            <h3 className="flash-box__title">500+ Expert Questions</h3>
            <p className="flash-box__desc">
              Get grilled by 500+ hand-picked technical and HR questions used by top companies like
              Google, Meta & Amazon.
            </p>
          </div>

          <div className="flash-box">
            <div className="flash-box__icon"><i className="fas fa-laptop-code" /></div>
            <h3 className="flash-box__title">16+ Specialized Roles</h3>
            <p className="flash-box__desc">
              Whether you&apos;re into AI, DevOps, or Fullstack, we have tailored interview paths for
              16+ specific IT industry career roles.
            </p>
          </div>

          <div className="flash-box">
            <div className="flash-box__icon"><i className="fas fa-file-contract" /></div>
            <h3 className="flash-box__title">ATS-Ready Resumes</h3>
            <p className="flash-box__desc">
              Build professional, ATS-friendly resumes in minutes. Our AI ensures you pass the
              filters and reach the recruiters&apos; desks.
            </p>
          </div>
        </div>

        <div className="cta-area">
          <p className="cta-area__prompt">
            Signup now to access all premium features instantly!
          </p>
          <button
            type="button"
            className="btn-signup-xl"
            id="btn-signup-rocket"
            onClick={handleRocketClick}
            disabled={launching}
          >
            Sign Up To Access Now <i className="fas fa-rocket" ref={iconRef} />
          </button>
        </div>
      </main>
    </div>
  )
}
