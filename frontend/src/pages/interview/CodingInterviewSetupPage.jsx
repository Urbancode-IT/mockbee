import { useCallback, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../../config/api'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem } from '../../utils/storage'
import '../../styles/excel-interview.css'

const LANGUAGES = [
  { value: 'javascript', label: 'JavaScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'react', label: 'React' },
  { value: 'node', label: 'Node' },
  { value: 'express', label: 'Express' },
  { value: 'sql', label: 'SQL' },
  { value: 'mssql', label: 'MSSQL' },
]

function formatApiError(body, fallback = 'Upload failed') {
  const detail = body?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail.map((d) => d.msg || d.message || JSON.stringify(d)).join(' · ')
  }
  if (typeof detail === 'object') return detail.msg || JSON.stringify(detail)
  return fallback
}

function emptyQuestion(language = 'javascript') {
  return {
    question: '',
    language,
    starter_code: '',
    tests: '',
  }
}

function langLabel(value) {
  return LANGUAGES.find((l) => l.value === value)?.label || value
}

export default function CodingInterviewSetupPage() {
  const { user } = useAuth()
  const fileRef = useRef(null)
  const [title, setTitle] = useState('Coding AI Interview')
  const [selfIntroEnabled, setSelfIntroEnabled] = useState(true)
  const [pickLang, setPickLang] = useState('javascript')
  const [manualQs, setManualQs] = useState([])
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [copied, setCopied] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const updateManualQ = (idx, patch) => {
    setManualQs((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
  }

  const addFromDropdown = () => {
    setManualQs((prev) => [...prev, emptyQuestion(pickLang)])
    setError('')
    setResult(null)
  }

  const removeManualQ = (idx) => {
    setManualQs((prev) => prev.filter((_, i) => i !== idx))
  }

  const onPickFile = (picked) => {
    setError('')
    setResult(null)
    if (!picked) {
      setFile(null)
      return
    }
    const name = picked.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm') && !name.endsWith('.csv')) {
      setError('Please upload an .xlsx or .csv file.')
      setFile(null)
      return
    }
    setFile(picked)
    if (title.includes('optionA') || title.includes(',') || title.length > 60) {
      setTitle(picked.name.replace(/\.(xlsx|xlsm|csv)$/i, '') || 'Coding AI Interview')
    }
  }

  const createLink = useCallback(async () => {
    const questions = manualQs
      .map((q) => ({
        question: q.question.trim(),
        language: q.language,
        starter_code: q.starter_code,
        tests: q.tests,
      }))
      .filter((q) => q.question)

    if (!questions.length && !file) {
      setError('Select a language from the dropdown and add a question, or upload Excel/CSV.')
      return
    }

    setUploading(true)
    setError('')
    setResult(null)
    try {
      const safeTitle =
        title.trim().length > 80 || title.includes(',')
          ? 'Coding AI Interview'
          : title.trim() || 'Coding AI Interview'
      const email = user?.email || getItem(KEYS.userEmail) || ''

      const form = new FormData()
      form.append('title', safeTitle)
      form.append('email', email)
      form.append('self_intro_enabled', selfIntroEnabled ? 'true' : 'false')
      if (questions.length) {
        form.append('manual_questions', JSON.stringify(questions))
      }
      if (file) {
        form.append('file', file)
      }

      const res = await fetch(`${API_BASE}/api/coding-interview/upload`, {
        method: 'POST',
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(formatApiError(body, `Create failed (${res.status})`))
      setResult(body)
      setTitle(safeTitle)
    } catch (err) {
      const msg = err.message || 'Create failed'
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        setError('Backend not reachable. Start backend on port 8001 and try again.')
      } else {
        setError(msg)
      }
    } finally {
      setUploading(false)
    }
  }, [file, title, user?.email, selfIntroEnabled, manualQs])

  const shareUrl = result
    ? `${window.location.origin}${result.interview_path || `/coding/${result.bank_id}`}`
    : ''

  const copyLink = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy link — select and copy manually.')
    }
  }

  const canCreate = manualQs.some((q) => q.question.trim()) || Boolean(file)

  return (
    <div className="excel-setup">
      <section className="excel-setup__steps" aria-label="How it works">
        <div className="excel-setup__step">
          <span>1</span>
          <p>Excel/theory first, coding questions last</p>
        </div>
        <div className="excel-setup__step">
          <span>2</span>
          <p>Create one shared interview link</p>
        </div>
        <div className="excel-setup__step">
          <span>3</span>
          <p>Self-intro → questions (Monaco) → report</p>
        </div>
      </section>

      <div className="excel-setup__body excel-setup__body--single">
        <div className="excel-setup__panel">
          <h2>Create interview</h2>

          <label className="excel-setup__label" htmlFor="coding-title">
            Interview title
          </label>
          <input
            id="coding-title"
            className="excel-setup__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. React Round 1"
            maxLength={80}
          />

          <div className="self-intro-admin">
            <label className="self-intro-admin__check">
              <input
                type="checkbox"
                checked={selfIntroEnabled}
                onChange={(e) => setSelfIntroEnabled(e.target.checked)}
              />
              <span>Ask self-intro first — AI will say “Please introduce yourself”</span>
            </label>
          </div>

          <label className="excel-setup__label">Excel / CSV (optional — same link)</label>
          <div
            className={`excel-setup__drop${dragOver ? ' is-drag' : ''}${file ? ' has-file' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              onPickFile(e.dataTransfer.files?.[0])
            }}
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xlsm,.csv"
              hidden
              onChange={(e) => onPickFile(e.target.files?.[0] || null)}
            />
            <i className="fas fa-file-code" />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span>Click to change file</span>
              </>
            ) : (
              <>
                <strong>Drop Excel / CSV here (optional)</strong>
                <span>Theory / MCQ questions first in the interview</span>
              </>
            )}
          </div>

          <div className="manual-qs">
            <label className="excel-setup__label" htmlFor="lang-pick">
              Coding language (comes last in interview)
            </label>
            <div className="lang-pick-row">
              <select
                id="lang-pick"
                className="excel-setup__input lang-pick-select"
                value={pickLang}
                onChange={(e) => setPickLang(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button type="button" className="lang-pick-add" onClick={addFromDropdown}>
                + Add question
              </button>
            </div>
            <p className="lang-pick-hint">
              Coding last-ah varum. Dropdown-la language choose panni Add press pannu.
            </p>

            {manualQs.length === 0 && (
              <p className="manual-qs-empty">No coding questions yet. Pick a language above and add.</p>
            )}

            {manualQs.map((q, idx) => (
              <div className="manual-q-card" key={idx}>
                <div className="manual-q-card__head">
                  <strong>
                    Q{idx + 1} · {langLabel(q.language)}
                  </strong>
                  <button type="button" className="manual-q-remove" onClick={() => removeManualQ(idx)}>
                    Remove
                  </button>
                </div>

                <label className="excel-setup__label">Problem / question *</label>
                <textarea
                  className="excel-setup__input manual-q-textarea"
                  value={q.question}
                  onChange={(e) => updateManualQ(idx, { question: e.target.value })}
                  rows={3}
                  placeholder={`Write the ${langLabel(q.language)} problem for the candidate…`}
                />

                <label className="excel-setup__label">Starter code (optional)</label>
                <textarea
                  className="excel-setup__input manual-q-code"
                  value={q.starter_code}
                  onChange={(e) => updateManualQ(idx, { starter_code: e.target.value })}
                  rows={3}
                  placeholder="Optional starter in Monaco"
                  spellCheck={false}
                />

                <label className="excel-setup__label">Tests (optional: input =&gt; expected)</label>
                <textarea
                  className="excel-setup__input manual-q-code"
                  value={q.tests}
                  onChange={(e) => updateManualQ(idx, { tests: e.target.value })}
                  rows={2}
                  placeholder={'hello => olleh'}
                  spellCheck={false}
                />
              </div>
            ))}
          </div>

          <div className="excel-setup__actions">
            <a className="excel-setup__link" href={`${API_BASE}/api/coding-interview/template`}>
              <i className="fas fa-download" /> Download sample coding Excel
            </a>
            <button
              type="button"
              className="excel-setup__start"
              onClick={createLink}
              disabled={uploading || !canCreate}
            >
              {uploading ? 'Creating link…' : 'Create Interview Link'}
              <i className="fas fa-link" />
            </button>
          </div>

          {error && <p className="excel-setup__error">⚠️ {error}</p>}

          {result && (
            <div className="coding-link-box">
              <p>
                <strong>{result.question_count}</strong> question(s) ready in one link
                {result.kind === 'mcq' ? ' (MCQ / theory mode)' : ' (coding mode)'}.
                {result.self_intro_enabled ? ' Self-intro ON.' : ''}
              </p>
              {result.message && <p style={{ opacity: 0.85, fontSize: '0.9rem' }}>{result.message}</p>}
              <p>Share this link with the candidate:</p>
              <code>{shareUrl}</code>
              <div className="coding-link-actions">
                <button type="button" onClick={copyLink}>
                  {copied ? 'Copied!' : 'Copy link'}
                </button>
                <Link to={result.interview_path || `/coding/${result.bank_id}`}>Open as candidate →</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="excel-setup__footer">
        <p className="excel-setup__hint">
          Language dropdown-la choose → Add question → one interview link.
        </p>
        <Link className="excel-setup__back" to="/dashboard">
          ← Back to dashboard
        </Link>
      </div>
    </div>
  )
}
