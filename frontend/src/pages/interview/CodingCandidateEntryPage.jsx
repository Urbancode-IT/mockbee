import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import '../../styles/excel-interview.css'
import '../../styles/coding-interview.css'

export default function CodingCandidateEntryPage() {
  const { bankId } = useParams()
  const navigate = useNavigate()
  const [title, setTitle] = useState('Coding AI Interview')
  const [count, setCount] = useState(0)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const { ok, body } = await apiFetch(`/api/coding-interview/bank/${encodeURIComponent(bankId)}`)
        if (!ok) {
          const detail = typeof body.detail === 'string' ? body.detail : 'Interview not found'
          throw new Error(detail)
        }
        setTitle(body.title || 'Coding AI Interview')
        setCount(body.question_count || 0)
      } catch (err) {
        const msg = err.message || 'Failed to load interview'
        if (/expired|already completed/i.test(msg)) {
          setError('This interview link has expired. Please ask the admin for a new link.')
        } else {
          setError(msg)
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [bankId])

  const start = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Please enter your name')
      return
    }
    setStarting(true)
    setError('')
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach((t) => t.stop())
      }
    } catch {
      setStarting(false)
      setError('Please allow microphone access in Chrome, then try again.')
      return
    }
    sessionStorage.setItem(
      `coding_candidate_${bankId}`,
      JSON.stringify({ name: name.trim(), email: email.trim() }),
    )
    navigate(`/coding/${bankId}/interview`)
  }

  return (
    <div className="checkin-page">
      <div className="checkin-card">
        <p className="checkin-eyebrow">Candidate check-in</p>
        <h1>{loading ? 'Loading…' : title}</h1>
        <p className="checkin-sub">
          {count
            ? `${count} question(s) ready. First self-intro (if admin enabled), then questions.`
            : 'Enter your details to begin.'}
        </p>

        <ul className="checkin-steps">
          <li>
            <span>1</span> Allow microphone when asked
          </li>
          <li>
            <span>2</span> Fill / speak your self-intro
          </li>
          <li>
            <span>3</span> Answer questions (Monaco for coding)
          </li>
        </ul>

        <form onSubmit={start}>
          <label htmlFor="cand-name">Full name *</label>
          <input
            id="cand-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
          />
          <label htmlFor="cand-email">Email (optional)</label>
          <input
            id="cand-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />

          {error && <p className="checkin-error">{error}</p>}

          <button type="submit" className="checkin-start" disabled={loading || count === 0 || starting}>
            {starting ? 'Starting…' : 'Start interview'}
          </button>
        </form>
      </div>
    </div>
  )
}
