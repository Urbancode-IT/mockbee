import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import COMPANY_DATA from '../../data/companyQuestions'
import '../../styles/company-prep.css'

function topicIcon(topic) {
  const key = topic.toLowerCase()
  if (key.includes('java')) return 'fab fa-java'
  if (key.includes('react')) return 'fab fa-react'
  if (key.includes('angular')) return 'fab fa-angular'
  if (key.includes('data')) return 'fas fa-chart-pie'
  if (key.includes('sql')) return 'fas fa-database'
  if (key.includes('selenium') || key.includes('test')) return 'fas fa-vial'
  if (key.includes('api')) return 'fas fa-plug'
  return 'fas fa-book-open'
}

export default function CompanyTopicsPage() {
  const { company: companyParam } = useParams()
  const company = companyParam || 'Google'
  const navigate = useNavigate()
  const [topics, setTopics] = useState({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const { ok, body } = await apiFetch(
          `/api/company-prep/questions?company=${encodeURIComponent(company)}`,
        )
        if (!ok) throw new Error('Unable to load topics')
        const next = body.topics || {}
        if (!cancelled) {
          if (Object.keys(next).length === 0) {
            setTopics(COMPANY_DATA[company] || {})
          } else {
            setTopics(next)
          }
        }
      } catch {
        if (!cancelled) {
          const fallback = COMPANY_DATA[company] || {}
          setTopics(fallback)
          if (Object.keys(fallback).length === 0) {
            setError('Could not load topics. Please start the backend server and try again.')
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [company])

  return (
    <div className="company-topics-page">
      <Link to="/dashboard/company-prep" className="back-btn">
        <i className="fas fa-arrow-left" /> Back to Companies
      </Link>
      <h2>{company} Questions</h2>
      <p>Select a topic to view previous interview questions.</p>

      <div className="topics-grid">
        {loading && <p>Loading topics...</p>}
        {!loading && error && <p>{error}</p>}
        {!loading &&
          !error &&
          Object.entries(topics).map(([topic, questions]) => (
            <div
              key={topic}
              className="topic-card"
              onClick={() =>
                navigate(
                  `/dashboard/company-prep/${encodeURIComponent(company)}/questions?topic=${encodeURIComponent(topic)}`,
                )
              }
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  navigate(
                    `/dashboard/company-prep/${encodeURIComponent(company)}/questions?topic=${encodeURIComponent(topic)}`,
                  )
                }
              }}
            >
              <i className={topicIcon(topic)} />
              <h4>{topic}</h4>
              <span className="badge">
                {Array.isArray(questions) ? questions.length : 0} questions
              </span>
            </div>
          ))}
        {!loading && !error && Object.keys(topics).length === 0 && (
          <p>No question topics are available yet.</p>
        )}
      </div>
    </div>
  )
}
