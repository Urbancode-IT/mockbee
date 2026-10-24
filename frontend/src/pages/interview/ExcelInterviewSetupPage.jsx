import { useCallback, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { API_BASE } from '../../config/api'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem } from '../../utils/storage'
import '../../styles/excel-interview.css'

export default function ExcelInterviewSetupPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const fileRef = useRef(null)

  const [title, setTitle] = useState('Custom AI Interview')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState([])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const onPickFile = (picked) => {
    setError('')
    setPreview([])
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
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files?.[0]
    if (dropped) onPickFile(dropped)
  }

  const startInterview = useCallback(async () => {
    if (!file) {
      setError('Choose an Excel or CSV file with your questions first.')
      return
    }

    setUploading(true)
    setError('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('title', title.trim() || 'Custom AI Interview')
      form.append('email', user?.email || getItem(KEYS.userEmail) || '')

      const res = await fetch(`${API_BASE}/api/excel-interview/upload`, {
        method: 'POST',
        body: form,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.detail || 'Upload failed. Is the backend running?')
      }

      setPreview((body.questions || []).slice(0, 5))
      navigate(`/interview/excel/${body.bank_id}`)
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }, [file, navigate, title, user?.email])

  return (
    <div className="excel-setup">
      <section className="excel-setup__steps" aria-label="How it works">
        <div className="excel-setup__step">
          <span>1</span>
          <p>Put questions in Excel (column: <strong>Question</strong>)</p>
        </div>
        <div className="excel-setup__step">
          <span>2</span>
          <p>AI avatar asks each question with voice</p>
        </div>
        <div className="excel-setup__step">
          <span>3</span>
          <p>Candidate answers by mic or typing → next Q</p>
        </div>
      </section>

      <div className="excel-setup__body excel-setup__body--single">
        <div className="excel-setup__panel">
          <h2>Create interview</h2>

          <label className="excel-setup__label" htmlFor="interview-title">
            Interview title
          </label>
          <input
            id="interview-title"
            className="excel-setup__input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Python Developer Round 1"
          />

          <label className="excel-setup__label">Questions file</label>
          <div
            className={`excel-setup__drop${dragOver ? ' is-drag' : ''}${file ? ' has-file' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
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
            <i className="fas fa-file-excel" />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span>Click to change file</span>
              </>
            ) : (
              <>
                <strong>Drop Excel / CSV here</strong>
                <span>or click to browse (.xlsx, .csv)</span>
              </>
            )}
          </div>

          <div className="excel-setup__actions">
            <a className="excel-setup__link" href={`${API_BASE}/api/excel-interview/template`}>
              <i className="fas fa-download" /> Download sample Excel
            </a>
            <button
              type="button"
              className="excel-setup__start"
              onClick={startInterview}
              disabled={uploading || !file}
            >
              {uploading ? 'Uploading…' : 'Start AI Interview'}
              <i className="fas fa-arrow-right" />
            </button>
          </div>

          {error && <p className="excel-setup__error">{error}</p>}

          {preview.length > 0 && (
            <ul className="excel-setup__preview">
              {preview.map((q) => (
                <li key={q.id}>{q.question}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="excel-setup__footer">
        <p className="excel-setup__hint">
          Tip: Column headers can be <code>Question</code>, optional <code>Role</code> and{' '}
          <code>Category</code>. Or put one question per row in column A.
        </p>
        <Link className="excel-setup__back" to="/dashboard/practice">
          ← Back to Quick Practice
        </Link>
      </div>
    </div>
  )
}
