import { Link } from 'react-router-dom'
import './AdvertisePage.css'

export default function AdvertisePage() {
  return (
    <div className="advertise-page">
      <div className="ad-container">
        <div className="ad-badge">MockBee Pro Member</div>
        <h1 className="ad-title">
          Master Your Future with
          <br />
          MockBee Paid Version
        </h1>
        <div className="ad-grid">
          <div className="ad-box">
            <div className="ad-icon"><i className="fas fa-database" /></div>
            <h3>500+ Questions</h3>
            <p>Expert questions from top companies.</p>
          </div>
          <div className="ad-box">
            <div className="ad-icon"><i className="fas fa-code" /></div>
            <h3>16+ Roles</h3>
            <p>Tailored paths for IT roles.</p>
          </div>
          <div className="ad-box">
            <div className="ad-icon"><i className="fas fa-file-contract" /></div>
            <h3>ATS Resumes</h3>
            <p>Pass the recruiter filters instantly.</p>
          </div>
        </div>
        <Link to="/signup" className="btn-signup">
          Sign Up To Access Now <i className="fas fa-rocket" />
        </Link>
      </div>
    </div>
  )
}
