import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch, API_BASE } from '../../config/api'
import '../../styles/enterprise-interview.css'

export default function EnterpriseReportPage() {
  const { interviewId, sessionId } = useParams()
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const cached = sessionStorage.getItem(`enterprise_report_${sessionId}`)
        if (cached) {
          const parsed = JSON.parse(cached)
          if (!cancelled) setReport(parsed)
        }
        const { body, ok } = await apiFetch(`/api/enterprise/sessions/${sessionId}/report`)
        if (!ok || body.status !== 'success') throw new Error(body.detail || 'Report unavailable')
        if (!cancelled) setReport(body.report)
      } catch (e) {
        if (!cancelled) setError(String(e.message || e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId])

  const exportUrl = (format) => `${API_BASE}/api/enterprise/sessions/${sessionId}/export?format=${format}`

  if (loading) {
    return (
      <div className="enterprise-page">
        <div className="enterprise-card skeleton-block">Building scorecard…</div>
      </div>
    )
  }

  if (error && !report) {
    return (
      <div className="enterprise-page">
        <div className="enterprise-card error-card">
          <h1>Report unavailable</h1>
          <p>{error}</p>
          <Link to={`/panel/${interviewId}`}>Back</Link>
        </div>
      </div>
    )
  }

  const r = report

  return (
    <div className="enterprise-page report">
      <div className="enterprise-card report-card">
        <header className="report-header">
          <div>
            <p className="eyebrow">Enterprise scorecard</p>
            <h1>{r.candidate_name}</h1>
            <p className="muted">
              {r.job_role} · Interview {r.interview_id} · Session {r.session_id}
            </p>
          </div>
          <div className={`result-badge ${r.result_status}`}>
            <strong>{r.percentage ?? '—'}%</strong>
            <span>{r.recommendation}</span>
            <small>{r.result_status}</small>
          </div>
        </header>

        <p className="advisory">{r.advisory_notice}</p>
        {r.demo_mode && <p className="demo-badge">Demo mode — scores may use heuristic evaluation</p>}
        {r.incomplete && (
          <p className="error-text">Evaluation incomplete — result is not a pass claim.</p>
        )}

        <section className="report-grid">
          <div>
            <h3>Total</h3>
            <p>
              {r.total_score}/{r.max_score} (pass ≥ {r.passing_score}%)
            </p>
          </div>
          <div>
            <h3>Date</h3>
            <p>{r.interview_date || '—'}</p>
          </div>
          <div>
            <h3>Duration</h3>
            <p>{r.duration_seconds != null ? `${Math.round(r.duration_seconds / 60)} min` : '—'}</p>
          </div>
          <div>
            <h3>Evaluator</h3>
            <p>{r.source}{r.advisory_notice ? ' (advisory)' : ''}</p>
          </div>
        </section>

        <section>
          <h2>Category performance</h2>
          <div className="cat-list">
            {(r.category_performance || []).map((c) => (
              <div key={c.category} className="cat-row">
                <span>{c.category}</span>
                <span>
                  {c.obtained}/{c.max} ({c.percentage ?? '—'}%)
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="two-col">
          <div>
            <h2>Technical strengths</h2>
            <ul>
              {(r.technical_strengths || ['—']).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2>Areas for improvement</h2>
            <ul>
              {(r.areas_for_improvement || ['—']).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2>Question-wise feedback</h2>
          {(r.question_wise || []).map((q) => (
            <article key={`${q.index}-${q.question}`} className="q-report">
              <header>
                <strong>
                  Q{q.index}. {q.question}
                </strong>
                <span className={q.is_ai_followup ? 'ai-src' : 'admin-src'}>
                  {q.is_ai_followup ? 'AI follow-up' : 'Admin question'}
                </span>
              </header>
              <p className="muted">Transcript: {q.transcript || '—'}</p>
              {q.evaluation && (
                <>
                  <p>
                    Score: {q.evaluation.score}/{q.evaluation.max_marks} · {q.evaluation.explanation}
                  </p>
                  {q.evaluation.missing_concepts?.length > 0 && (
                    <p>Missing: {q.evaluation.missing_concepts.join(', ')}</p>
                  )}
                  {q.human_override && (
                    <p className="override-note">
                      Human override: {q.human_override.score}/{q.human_override.max_marks} — {q.human_override.notes}
                    </p>
                  )}
                </>
              )}
            </article>
          ))}
        </section>

        <div className="cta-row wrap">
          <a className="btn-primary" href={exportUrl('pdf')}>
            Export PDF
          </a>
          <a className="btn-secondary" href={exportUrl('csv')}>
            Export CSV
          </a>
          <a className="btn-secondary" href={exportUrl('xlsx')}>
            Export Excel
          </a>
          <Link className="btn-secondary" to="/">
            Done
          </Link>
        </div>
      </div>
    </div>
  )
}
