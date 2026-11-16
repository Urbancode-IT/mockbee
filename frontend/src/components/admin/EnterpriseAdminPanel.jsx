import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { API_BASE, apiFetch } from '../../config/api'
import '../../styles/enterprise-interview.css'

const EMPTY_CONFIG = {
  job_role: 'MERN Stack Developer',
  job_description: '',
  required_skills: 'React, Node.js, MongoDB, Express',
  experience_level: 'fresher',
  duration_minutes: 45,
  question_count: 8,
  difficulty: 'mixed',
  passing_score: 60,
  randomize_questions: false,
  interview_mode: 'voice',
  allow_follow_ups: true,
  max_follow_ups_per_question: 1,
  instructions: 'Speak clearly and give concrete examples where possible.',
  evaluation_criteria: 'Evaluate technical correctness, problem-solving, completeness, and clarity.',
  rubric: {
    technical_correctness: 0.4,
    problem_solving: 0.25,
    relevance_completeness: 0.2,
    clarity: 0.15,
  },
}

function emptyManualQuestion() {
  return {
    question: '',
    category: 'Technical',
    topic: '',
    difficulty: 'medium',
    expected_answer: '',
    max_marks: 10,
    hint: '',
    follow_up: '',
  }
}

const SECTION_TO_SUBTAB = {
  overview: 'overview',
  banks: 'banks',
  review: 'bank-review',
  configure: 'configure',
  interviews: 'interviews',
}
const SUBTAB_TO_SECTION = {
  overview: 'overview',
  banks: 'banks',
  'bank-review': 'review',
  configure: 'configure',
  interviews: 'interviews',
}

export default function EnterpriseAdminPanel({
  adminKey,
  analytics,
  onRefresh,
  activeSection,
  onSectionChange,
}) {
  const embedded = activeSection !== undefined
  const [internalSubTab, setInternalSubTab] = useState('overview')
  const subTab = embedded ? SECTION_TO_SUBTAB[activeSection] || 'overview' : internalSubTab
  const setSubTab = (next) => {
    if (embedded) onSectionChange?.(SUBTAB_TO_SECTION[next] || 'overview')
    else setInternalSubTab(next)
  }
  const [banks, setBanks] = useState([])
  const [interviews, setInterviews] = useState([])
  const [roles, setRoles] = useState([])
  const [selectedBank, setSelectedBank] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState(null)
  const [inlinePreview, setInlinePreview] = useState(false)
  const fileInputRef = useRef(null)
  const [bankTitle, setBankTitle] = useState('Enterprise Question Bank')
  const [manualQs, setManualQs] = useState([emptyManualQuestion()])
  const [config, setConfig] = useState(EMPTY_CONFIG)
  const [interviewTitle, setInterviewTitle] = useState('')
  const [selectedBankId, setSelectedBankId] = useState('')
  const [saving, setSaving] = useState(false)
  const [providers, setProviders] = useState(null)
  const [lastInviteUrl, setLastInviteUrl] = useState('')

  const qKey = useMemo(() => encodeURIComponent(adminKey || ''), [adminKey])

  const inviteUrlFor = (path) => {
    const p = path || ''
    if (!p) return ''
    if (p.startsWith('http')) return p
    return `${window.location.origin}${p.startsWith('/') ? p : `/${p}`}`
  }

  const loadLists = useCallback(async () => {
    if (!adminKey) return
    try {
      const [banksRes, intRes, rolesRes, statusRes] = await Promise.all([
        apiFetch(`/api/enterprise/question-banks?key=${qKey}`),
        apiFetch(`/api/enterprise/interviews?key=${qKey}`),
        apiFetch('/api/enterprise/roles'),
        apiFetch('/api/enterprise/status'),
      ])
      if (banksRes.body.status === 'success') setBanks(banksRes.body.banks || [])
      if (intRes.body.status === 'success') setInterviews(intRes.body.interviews || [])
      if (rolesRes.body.status === 'success') setRoles(rolesRes.body.roles || [])
      if (statusRes.body.status === 'success') setProviders(statusRes.body)
    } catch {
      toast.error('Failed to load enterprise data')
    }
  }, [adminKey, qKey])

  useEffect(() => {
    loadLists()
  }, [loadLists])

  const openBank = async (id) => {
    const { body, ok } = await apiFetch(`/api/enterprise/question-banks/${id}?key=${qKey}`)
    if (!ok || body.status !== 'success') {
      toast.error(body.detail || 'Could not load bank')
      return
    }
    setSelectedBank(body.bank)
    setSubTab('bank-review')
  }

  const uploadFile = async (file, { openReview = true } = {}) => {
    if (!file) return false
    if (!adminKey) {
      toast.error('Admin session expired. Please log in again.')
      return false
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('title', bankTitle)
      fd.append('key', adminKey)
      const uploadUrl = `${API_BASE}/api/enterprise/question-banks/upload?key=${encodeURIComponent(adminKey)}`
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'x-admin-key': adminKey },
        body: fd,
      })
      const body = await res.json().catch(() => ({}))
      if (res.status === 403) {
        throw new Error('Unauthorized — admin session expired. Log out and log in again as admin.')
      }
      if (!res.ok || body.status !== 'success') {
        throw new Error(body.detail || `Upload failed (${res.status})`)
      }
      const bank = {
        id: body.bank_id,
        _id: body.bank_id,
        title: body.title,
        questions: body.questions || [],
        status: 'pending_review',
        ocr_used: body.ocr_used,
        format: body.format,
      }
      toast.success(`Extracted ${body.question_count || bank.questions.length} questions${body.ocr_used ? ' (OCR)' : ''}`)
      setSelectedBank(bank)
      setPendingFile(null)
      setInlinePreview(true)
      // Stay on Questions tab so the list is visible under View (full editor via Edit & Approve).
      if (openReview && !embedded) setSubTab('bank-review')
      loadLists()
      onRefresh?.()
      return true
    } catch (e) {
      toast.error(String(e.message || e))
      return false
    } finally {
      setUploading(false)
    }
  }

  const viewQuestions = async () => {
    // Always prefer the live <input type="file"> value — React state can be lost on HMR.
    const inputFile = fileInputRef.current?.files?.[0] || null
    const file = inputFile || pendingFile

    if (file) {
      if (inputFile) setPendingFile(inputFile)
      // Embedded admin: keep Questions tab + show list under View
      await uploadFile(file, { openReview: !embedded })
      return
    }

    if (selectedBank?.questions?.length) {
      setInlinePreview(true)
      if (!embedded) setSubTab('bank-review')
      return
    }

    const first = banks[0]
    if (first?.id) {
      const { body, ok } = await apiFetch(`/api/enterprise/question-banks/${first.id}?key=${qKey}`)
      if (!ok || body.status !== 'success') {
        toast.error(body.detail || 'Could not load bank')
        return
      }
      setSelectedBank(body.bank)
      setInlinePreview(true)
      if (!embedded) setSubTab('bank-review')
      return
    }

    toast.error('Choose a file first, then click View')
    fileInputRef.current?.click()
  }

  const saveManualBank = async () => {
    const questions = manualQs.filter((q) => q.question.trim())
    if (!questions.length) {
      toast.error('Add at least one question')
      return
    }
    setSaving(true)
    try {
      const { body, ok } = await apiFetch('/api/enterprise/question-banks/manual', {
        method: 'POST',
        body: JSON.stringify({ key: adminKey, title: bankTitle, questions }),
      })
      if (!ok || body.status !== 'success') throw new Error(body.detail || 'Save failed')
      toast.success('Question bank created')
      setSelectedBank({ id: body.bank_id, _id: body.bank_id, title: bankTitle, questions: body.questions, status: 'pending_review' })
      setSubTab('bank-review')
      loadLists()
    } catch (e) {
      toast.error(String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const updateQuestion = (idx, patch) => {
    setSelectedBank((prev) => {
      if (!prev) return prev
      const questions = prev.questions.map((q, i) => (i === idx ? { ...q, ...patch } : q))
      return { ...prev, questions }
    })
  }

  const moveQuestion = (idx, dir) => {
    setSelectedBank((prev) => {
      if (!prev) return prev
      const questions = [...prev.questions]
      const j = idx + dir
      if (j < 0 || j >= questions.length) return prev
      ;[questions[idx], questions[j]] = [questions[j], questions[idx]]
      return { ...prev, questions: questions.map((q, i) => ({ ...q, order: i + 1, id: i + 1 })) }
    })
  }

  const deleteQuestion = (idx) => {
    setSelectedBank((prev) => {
      if (!prev) return prev
      const questions = prev.questions.filter((_, i) => i !== idx).map((q, i) => ({ ...q, id: i + 1, order: i + 1 }))
      return { ...prev, questions }
    })
  }

  const persistBank = async (approve = false) => {
    if (!selectedBank) return
    setSaving(true)
    try {
      const id = selectedBank.id || selectedBank._id
      const { body, ok } = await apiFetch(`/api/enterprise/question-banks/${id}?key=${qKey}`, {
        method: 'PUT',
        body: JSON.stringify({ key: adminKey, title: selectedBank.title, questions: selectedBank.questions }),
      })
      if (!ok || body.status !== 'success') throw new Error(body.detail || 'Save failed')
      if (approve) {
        const ap = await apiFetch(`/api/enterprise/question-banks/${id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ key: adminKey }),
        })
        if (!ap.ok || ap.body.status !== 'success') throw new Error(ap.body.detail || 'Approve failed')
        setSelectedBank(ap.body.bank)
        setSelectedBankId(String(id))
        toast.success('Questions approved — next: Create & Link')
        setSubTab('configure')
      } else {
        setSelectedBank(body.bank)
        toast.success('Question bank saved')
      }
      loadLists()
    } catch (e) {
      toast.error(String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const createInterview = async () => {
    if (!selectedBankId) {
      toast.error('Select an approved question bank')
      return
    }
    setSaving(true)
    try {
      const skills = String(config.required_skills || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      const { body, ok } = await apiFetch('/api/enterprise/interviews', {
        method: 'POST',
        body: JSON.stringify({
          key: adminKey,
          title: interviewTitle || `${config.job_role} Interview`,
          question_bank_id: selectedBankId,
          status: 'draft',
          config: { ...config, required_skills: skills },
        }),
      })
      if (!ok || body.status !== 'success') throw new Error(body.detail || 'Create failed')
      toast.success('Draft created — Publish to get the interview link')
      setSubTab('interviews')
      loadLists()
      onRefresh?.()
    } catch (e) {
      toast.error(String(e.message || e))
    } finally {
      setSaving(false)
    }
  }

  const publishInterview = async (id) => {
    const { body, ok } = await apiFetch(`/api/enterprise/interviews/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ key: adminKey }),
    })
    if (!ok || body.status !== 'success') {
      toast.error(body.detail || 'Publish failed')
      return
    }
    const path = body.invite_url_path || body.interview?.invite_path || `/panel/${id}`
    const url = inviteUrlFor(path)
    setLastInviteUrl(url)
    setSubTab('interviews')
    toast.success('Published — interview link ready')
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      /* clipboard may be blocked; URL is shown on page */
    }
    loadLists()
  }

  const duplicateInterview = async (id) => {
    const { body, ok } = await apiFetch(`/api/enterprise/interviews/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ key: adminKey }),
    })
    if (!ok || body.status !== 'success') {
      toast.error(body.detail || 'Duplicate failed')
      return
    }
    toast.success('Interview duplicated')
    loadLists()
  }

  const archiveInterview = async (id) => {
    const { body, ok } = await apiFetch(`/api/enterprise/interviews/${id}/archive`, {
      method: 'POST',
      body: JSON.stringify({ key: adminKey }),
    })
    if (!ok || body.status !== 'success') {
      toast.error(body.detail || 'Archive failed')
      return
    }
    toast.success('Archived')
    loadLists()
  }

  const copyInvite = async (path) => {
    const url = inviteUrlFor(path)
    if (!url) {
      toast.error('No invite link available')
      return
    }
    setLastInviteUrl(url)
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Interview link copied')
    } catch {
      toast.message(url)
    }
  }

  const a = analytics || {}

  return (
    <div className={embedded ? 'admin-embedded-module' : 'admin-table-container'}>
      {!embedded && (
        <div className="admin-table-header">
          <h2>
            <i className="fas fa-building" style={{ color: 'var(--gold-dark)', marginRight: 8 }} />
            Interview Panel (Admin Question Banks)
          </h2>
          <div className="ent-inline">
            {['overview', 'banks', 'bank-review', 'configure', 'interviews'].map((t) => (
              <button
                key={t}
                type="button"
                className={`admin-tab-btn${subTab === t ? ' active' : ''}`}
                onClick={() => setSubTab(t)}
              >
                {t === 'bank-review' ? 'Review' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {providers?.demo_mode && (
        <p className="demo-badge" style={{ margin: '0 0 14px' }}>
          Demo mode: GEMINI_API_KEY missing — evaluations use heuristic scoring and are labeled advisory.
        </p>
      )}

      {subTab === 'overview' && (
        <div>
          {!embedded && (
          <div className="ent-admin-grid">
            <div className="mini-stat">
              <h4>{a.total_interviews_conducted ?? '—'}</h4>
              <p>Total interviews</p>
            </div>
            <div className="mini-stat">
              <h4>{a.scheduled_interviews ?? '—'}</h4>
              <p>Scheduled / published</p>
            </div>
            <div className="mini-stat">
              <h4>{a.completed_interviews ?? '—'}</h4>
              <p>Completed</p>
            </div>
            <div className="mini-stat">
              <h4>{a.average_score != null ? `${a.average_score}%` : '—'}</h4>
              <p>Average score</p>
            </div>
          </div>
          )}

          <div className="two-col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="enterprise-panel" style={{ margin: 0 }}>
              <h3>Role-wise</h3>
              {(a.role_wise || []).slice(0, 8).map((r) => (
                <div className="cat-row" key={r.role}>
                  <span>{r.role}</span>
                  <span>
                    {r.count} · avg {r.average_score ?? '—'}
                  </span>
                </div>
              ))}
              {!a.role_wise?.length && <p className="muted">No role data yet</p>}
            </div>
            <div className="enterprise-panel" style={{ margin: 0 }}>
              <h3>Recent interviews</h3>
              {(a.recent_interviews || []).slice(0, 8).map((r) => (
                <div className="cat-row" key={r.id}>
                  <span>
                    {r.candidate_name || 'Candidate'} · {r.role}
                  </span>
                  <span>{r.score != null ? `${r.score}%` : r.status}</span>
                </div>
              ))}
              {!a.recent_interviews?.length && <p className="muted">No sessions yet</p>}
            </div>
          </div>

          <div className="cta-row" style={{ marginTop: 16 }}>
            <button type="button" className="btn-primary" onClick={() => setSubTab('banks')}>
              Manage question bank
            </button>
            <button type="button" className="btn-secondary" onClick={() => setSubTab('configure')}>
              Configure interview
            </button>
          </div>
        </div>
      )}

      {subTab === 'banks' && (
        <div className="ent-wizard">
          <div className="enterprise-panel" style={{ margin: 0 }}>
            <h3>Upload panel questions</h3>
            <p className="muted">
              These questions become the <strong>interview panel</strong> candidates take (not the free Bee 5Q).
              Supports .xlsx, .csv, .pdf, .docx. Flow: Upload → Review/Approve → Configure → Publish → invite link.
            </p>
            <label>
              Bank title
              <input value={bankTitle} onChange={(e) => setBankTitle(e.target.value)} />
            </label>
            <div className="ent-inline" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xlsm,.csv,.pdf,.docx"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null
                  setPendingFile(file)
                  setInlinePreview(false)
                  if (file) toast.message(`${file.name} ready — click View`)
                }}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={uploading}
                onClick={viewQuestions}
              >
                {uploading ? 'Uploading…' : 'View'}
              </button>
              <a className="btn-secondary" href={`${API_BASE}/api/enterprise/question-banks/template`}>
                Download template
              </a>
            </div>
            {pendingFile && (
              <p className="muted" style={{ marginTop: 8 }}>
                Selected: <strong>{pendingFile.name}</strong>
              </p>
            )}
            {inlinePreview && selectedBank?.questions?.length > 0 && subTab === 'banks' && (
              <div className="bank-inline-preview">
                <div className="ent-inline" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
                  <strong>
                    {selectedBank.title} · {selectedBank.questions.length} questions
                  </strong>
                  <button type="button" className="btn-primary" onClick={() => setSubTab('bank-review')}>
                    Edit &amp; Approve
                  </button>
                </div>
                <ol className="bank-inline-preview__list">
                  {selectedBank.questions.slice(0, 20).map((q, i) => (
                    <li key={q.id || i}>{q.question || '(empty question)'}</li>
                  ))}
                </ol>
                {selectedBank.questions.length > 20 && (
                  <p className="muted">Showing first 20. Open Edit &amp; Approve for full list.</p>
                )}
              </div>
            )}
          </div>

          <div className="enterprise-panel" style={{ margin: 0 }}>
            <h3>Or add manually</h3>
            {manualQs.map((q, idx) => (
              <div className="ent-q-item" key={idx}>
                <textarea
                  rows={2}
                  placeholder="Question text"
                  value={q.question}
                  onChange={(e) =>
                    setManualQs((prev) => prev.map((item, i) => (i === idx ? { ...item, question: e.target.value } : item)))
                  }
                />
                <div className="form-grid">
                  <input
                    placeholder="Category"
                    value={q.category}
                    onChange={(e) =>
                      setManualQs((prev) => prev.map((item, i) => (i === idx ? { ...item, category: e.target.value } : item)))
                    }
                  />
                  <select
                    value={q.difficulty}
                    onChange={(e) =>
                      setManualQs((prev) => prev.map((item, i) => (i === idx ? { ...item, difficulty: e.target.value } : item)))
                    }
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
                <textarea
                  rows={2}
                  placeholder="Expected answer / rubric"
                  value={q.expected_answer}
                  onChange={(e) =>
                    setManualQs((prev) =>
                      prev.map((item, i) => (i === idx ? { ...item, expected_answer: e.target.value } : item)),
                    )
                  }
                />
              </div>
            ))}
            <div className="ent-inline">
              <button type="button" className="btn-secondary" onClick={() => setManualQs((p) => [...p, emptyManualQuestion()])}>
                Add question
              </button>
              <button type="button" className="btn-primary" disabled={saving} onClick={saveManualBank}>
                Save bank for review
              </button>
            </div>
          </div>

          <div className="enterprise-panel" style={{ margin: 0 }}>
            <h3>Existing banks</h3>
            {selectedBank && (
              <div className="invite-link-card" style={{ marginBottom: 12 }}>
                <div>
                  <p className="invite-link-card__label">In review</p>
                  <strong>{selectedBank.title || 'Question bank'}</strong>
                </div>
                <button type="button" className="btn-primary" onClick={() => setSubTab('bank-review')}>
                  Continue review
                </button>
              </div>
            )}
            {banks.map((b) => (
              <div className="cat-row" key={b.id}>
                <span>
                  {b.title} · {b.question_count} Q · {b.status}
                </span>
                <button type="button" className="btn-secondary" onClick={() => openBank(b.id)}>
                  View
                </button>
              </div>
            ))}
            {!banks.length && <p className="muted">No banks yet</p>}
          </div>
        </div>
      )}

      {subTab === 'bank-review' && (
        <div className="bank-review">
          {!selectedBank ? (
            <div className="bank-review__empty">
              <i className="fas fa-clipboard-list" />
              <h3>No bank selected</h3>
              <p>Upload a bank or open one from Questions to review and edit here.</p>
              <button type="button" className="btn-primary" onClick={() => setSubTab('banks')}>
                Back to Questions
              </button>
            </div>
          ) : (
            <>
              <header className="bank-review__hero">
                <div className="bank-review__hero-main">
                  <label className="bank-review__label">Bank title</label>
                  <input
                    className="bank-review__title-input"
                    value={selectedBank.title || ''}
                    onChange={(e) => setSelectedBank((p) => ({ ...p, title: e.target.value }))}
                    placeholder="Question bank name"
                  />
                </div>
                <div className="bank-review__stats">
                  <span className="bank-review__stat">
                    <strong>{selectedBank.questions?.length || 0}</strong> questions
                  </span>
                  <span className={`bank-review__status bank-review__status--${String(selectedBank.status || 'draft').replace(/_/g, '-')}`}>
                    {String(selectedBank.status || 'draft').replace(/_/g, ' ')}
                  </span>
                </div>
              </header>

              <div className="bank-review__list">
                {(selectedBank.questions || []).map((q, idx) => (
                  <article className="bank-q-card" key={q.id || idx}>
                    <div className="bank-q-card__top">
                      <div className="bank-q-card__id">
                        <span className="bank-q-card__num">Q{idx + 1}</span>
                        <span className="bank-q-card__src">Admin</span>
                      </div>
                      <div className="bank-q-card__actions">
                        <button type="button" className="bank-icon-btn" title="Move up" onClick={() => moveQuestion(idx, -1)}>
                          <i className="fas fa-arrow-up" />
                        </button>
                        <button type="button" className="bank-icon-btn" title="Move down" onClick={() => moveQuestion(idx, 1)}>
                          <i className="fas fa-arrow-down" />
                        </button>
                        <button type="button" className="bank-icon-btn bank-icon-btn--danger" title="Delete" onClick={() => deleteQuestion(idx)}>
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </div>

                    <label className="bank-field">
                      <span>Question</span>
                      <textarea
                        rows={3}
                        value={q.question}
                        onChange={(e) => updateQuestion(idx, { question: e.target.value })}
                        placeholder="Write the interview question…"
                      />
                    </label>

                    <div className="bank-field-grid">
                      <label className="bank-field">
                        <span>Category</span>
                        <input value={q.category || ''} placeholder="e.g. Frontend" onChange={(e) => updateQuestion(idx, { category: e.target.value })} />
                      </label>
                      <label className="bank-field">
                        <span>Topic</span>
                        <input value={q.topic || ''} placeholder="e.g. React" onChange={(e) => updateQuestion(idx, { topic: e.target.value })} />
                      </label>
                      <label className="bank-field">
                        <span>Difficulty</span>
                        <select value={q.difficulty || 'medium'} onChange={(e) => updateQuestion(idx, { difficulty: e.target.value })}>
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </label>
                      <label className="bank-field">
                        <span>Points</span>
                        <input
                          type="number"
                          value={q.max_marks ?? 10}
                          onChange={(e) => updateQuestion(idx, { max_marks: Number(e.target.value) })}
                        />
                      </label>
                    </div>

                    <label className="bank-field">
                      <span>Expected answer / rubric</span>
                      <textarea
                        rows={2}
                        placeholder="Ideal points the candidate should cover"
                        value={q.expected_answer || ''}
                        onChange={(e) => updateQuestion(idx, { expected_answer: e.target.value })}
                      />
                    </label>

                    <div className="bank-field-grid bank-field-grid--2">
                      <label className="bank-field">
                        <span>Hint</span>
                        <input placeholder="Optional hint" value={q.hint || ''} onChange={(e) => updateQuestion(idx, { hint: e.target.value })} />
                      </label>
                      <label className="bank-field">
                        <span>Follow-up</span>
                        <input
                          placeholder="Optional follow-up question"
                          value={q.follow_up || ''}
                          onChange={(e) => updateQuestion(idx, { follow_up: e.target.value })}
                        />
                      </label>
                    </div>
                  </article>
                ))}
              </div>

              <footer className="bank-review__footer">
                <button type="button" className="bank-btn bank-btn--ghost" disabled={saving} onClick={() => persistBank(false)}>
                  Save edits
                </button>
                <button type="button" className="bank-btn bank-btn--primary" disabled={saving} onClick={() => persistBank(true)}>
                  Approve &amp; publish bank
                </button>
              </footer>
            </>
          )}
        </div>
      )}

      {subTab === 'configure' && (
        <div className="panel-config">
          <header className="panel-config__hero">
            <div>
              <h3>Create &amp; Link</h3>
              <p>Pick an approved bank, set role &amp; rules, create a draft, then Publish from Panels to get the interview link.</p>
            </div>
          </header>

          <section className="panel-config__card">
            <h4>1. Basics</h4>
            <div className="bank-field-grid bank-field-grid--2">
              <label className="bank-field">
                <span>Panel title</span>
                <input value={interviewTitle} onChange={(e) => setInterviewTitle(e.target.value)} placeholder="e.g. MERN Hiring Round 1" />
              </label>
              <label className="bank-field">
                <span>Question bank</span>
                <select value={selectedBankId} onChange={(e) => setSelectedBankId(e.target.value)}>
                  <option value="">Select approved bank…</option>
                  {banks
                    .filter((b) => String(b.status || '').toLowerCase() === 'approved')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.title} · {b.question_count}Q
                      </option>
                    ))}
                </select>
                {!banks.some((b) => String(b.status || '').toLowerCase() === 'approved') && (
                  <span className="panel-config__hint">No approved banks yet. Approve questions first.</span>
                )}
              </label>
            </div>
          </section>

          <section className="panel-config__card">
            <h4>2. Role</h4>
            <div className="bank-field-grid bank-field-grid--2">
              <label className="bank-field">
                <span>Job role</span>
                <select
                  value={roles.includes(config.job_role) ? config.job_role : '__custom__'}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__custom__') {
                      setConfig((c) => ({ ...c, job_role: c.job_role && !roles.includes(c.job_role) ? c.job_role : '' }))
                      return
                    }
                    setConfig((c) => ({ ...c, job_role: v }))
                  }}
                >
                  {roles.map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                  <option value="__custom__">Custom role…</option>
                </select>
              </label>
              <label className="bank-field">
                <span>Experience</span>
                <select
                  value={config.experience_level}
                  onChange={(e) => setConfig((c) => ({ ...c, experience_level: e.target.value }))}
                >
                  <option value="fresher">Fresher</option>
                  <option value="experienced">Experienced</option>
                </select>
              </label>
            </div>
            {!roles.includes(config.job_role) && (
              <label className="bank-field" style={{ marginTop: 4 }}>
                <span>Custom job role</span>
                <input
                  value={config.job_role}
                  onChange={(e) => setConfig((c) => ({ ...c, job_role: e.target.value }))}
                  placeholder="Type custom role"
                />
              </label>
            )}
          </section>

          <section className="panel-config__card">
            <h4>3. Interview rules</h4>
            <div className="bank-field-grid">
              <label className="bank-field">
                <span>Duration (min)</span>
                <input
                  type="number"
                  value={config.duration_minutes}
                  onChange={(e) => setConfig((c) => ({ ...c, duration_minutes: Number(e.target.value) }))}
                />
              </label>
              <label className="bank-field">
                <span>Questions</span>
                <input
                  type="number"
                  value={config.question_count}
                  onChange={(e) => setConfig((c) => ({ ...c, question_count: Number(e.target.value) }))}
                />
              </label>
              <label className="bank-field">
                <span>Difficulty</span>
                <select value={config.difficulty} onChange={(e) => setConfig((c) => ({ ...c, difficulty: e.target.value }))}>
                  <option value="mixed">Mixed</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </label>
              <label className="bank-field">
                <span>Passing score %</span>
                <input
                  type="number"
                  value={config.passing_score}
                  onChange={(e) => setConfig((c) => ({ ...c, passing_score: Number(e.target.value) }))}
                />
              </label>
              <label className="bank-field">
                <span>Mode</span>
                <select
                  value={config.interview_mode}
                  onChange={(e) => setConfig((c) => ({ ...c, interview_mode: e.target.value }))}
                >
                  <option value="voice">Voice</option>
                  <option value="text">Text</option>
                </select>
              </label>
              <label className="bank-field">
                <span>Randomize</span>
                <select
                  value={config.randomize_questions ? 'yes' : 'no'}
                  onChange={(e) => setConfig((c) => ({ ...c, randomize_questions: e.target.value === 'yes' }))}
                >
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </label>
            </div>
          </section>

          <section className="panel-config__card">
            <h4>4. Briefing</h4>
            <label className="bank-field">
              <span>Required skills (comma-separated)</span>
              <input
                value={config.required_skills}
                onChange={(e) => setConfig((c) => ({ ...c, required_skills: e.target.value }))}
                placeholder="React, Node.js, MongoDB"
              />
            </label>
            <label className="bank-field">
              <span>Job description</span>
              <textarea
                rows={3}
                value={config.job_description}
                onChange={(e) => setConfig((c) => ({ ...c, job_description: e.target.value }))}
                placeholder="What this role / round is assessing"
              />
            </label>
            <label className="bank-field">
              <span>Candidate instructions</span>
              <textarea
                rows={2}
                value={config.instructions}
                onChange={(e) => setConfig((c) => ({ ...c, instructions: e.target.value }))}
                placeholder="Shown before the interview starts"
              />
            </label>
          </section>

          <section className="panel-config__card">
            <h4>5. Rubric weights</h4>
            <p className="panel-config__hint">Values from 0 to 1. Keep the total near 1.0.</p>
            <div className="bank-field-grid">
              {Object.keys(config.rubric).map((key) => (
                <label className="bank-field" key={key}>
                  <span>{key.replace(/_/g, ' ')}</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    value={config.rubric[key]}
                    onChange={(e) =>
                      setConfig((c) => ({
                        ...c,
                        rubric: { ...c.rubric, [key]: Number(e.target.value) },
                      }))
                    }
                  />
                </label>
              ))}
            </div>
          </section>

          <footer className="bank-review__footer">
            <button type="button" className="bank-btn bank-btn--primary" disabled={saving} onClick={createInterview}>
              Create interview draft
            </button>
          </footer>
        </div>
      )}

      {subTab === 'interviews' && (
        <div className="ent-wizard">
          {lastInviteUrl && (
            <div className="invite-link-card">
              <div>
                <p className="invite-link-card__label">Interview link</p>
                <a className="invite-link-card__url" href={lastInviteUrl} target="_blank" rel="noreferrer">
                  {lastInviteUrl}
                </a>
              </div>
              <button type="button" className="btn-primary" onClick={() => copyInvite(lastInviteUrl)}>
                Copy link
              </button>
            </div>
          )}

          {interviews.map((iv) => {
            const path = iv.invite_path || `/panel/${iv.id}`
            const url = inviteUrlFor(path)
            return (
              <div className="ent-q-item" key={iv.id}>
                <div className="ent-inline" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <strong>{iv.title}</strong>
                    <div className="muted">
                      {iv.config?.job_role} · {iv.status} · pass {iv.config?.passing_score}%
                    </div>
                    {iv.status === 'published' && (
                      <div className="invite-link-row">
                        <span className="invite-link-row__label">Link:</span>
                        <a href={url} target="_blank" rel="noreferrer" className="invite-link-row__url">
                          {url}
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="ent-inline" style={{ flexShrink: 0 }}>
                    {iv.status === 'published' && (
                      <button type="button" className="btn-primary" onClick={() => copyInvite(path)}>
                        Copy link
                      </button>
                    )}
                    {iv.status !== 'published' && iv.status !== 'archived' && (
                      <button type="button" className="btn-primary" onClick={() => publishInterview(iv.id)}>
                        Publish
                      </button>
                    )}
                    <button type="button" className="btn-secondary" onClick={() => duplicateInterview(iv.id)}>
                      Duplicate
                    </button>
                    {iv.status !== 'archived' && (
                      <button type="button" className="btn-secondary" onClick={() => archiveInterview(iv.id)}>
                        Archive
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
          {!interviews.length && (
            <p className="muted">
              No interview panels yet. Simple flow: Questions → Approve → Configure → Publish → copy the link.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
