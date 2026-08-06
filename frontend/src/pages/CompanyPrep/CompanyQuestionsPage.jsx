import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import COMPANY_DATA from '../../data/companyQuestions'
import '../../styles/company-prep.css'

function normaliseItem(item) {
  if (typeof item === 'string') return { question: item, answer: '', difficulty: '', tags: [] }
  return {
    id: item.id || '',
    year: item.year || '',
    category: item.category || '',
    question: item.question || item.q || '',
    answer: item.answer || item.a || '',
    difficulty: item.difficulty || '',
    tags: Array.isArray(item.tags) ? item.tags : [],
  }
}

export default function CompanyQuestionsPage() {
  const { company: companyParam } = useParams()
  const company = companyParam || 'Google'
  const [searchParams] = useSearchParams()
  const topicParam = searchParams.get('topic') || ''
  const navigate = useNavigate()

  const [topicData, setTopicData] = useState({})
  const [activeTopic, setActiveTopic] = useState(topicParam || 'all')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setActiveTopic(topicParam || 'all')
  }, [topicParam])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const qs = `company=${encodeURIComponent(company)}${
        topicParam ? `&topic=${encodeURIComponent(topicParam)}` : ''
      }&v=${Date.now()}`
      try {
        const { ok, body } = await apiFetch(`/api/company-prep/questions?${qs}`)
        if (!ok) throw new Error('Unable to load questions')
        if (!cancelled) setTopicData(body.topics || {})
      } catch {
        if (!cancelled) {
          if (topicParam && COMPANY_DATA[company]?.[topicParam]) {
            setTopicData({ [topicParam]: COMPANY_DATA[company][topicParam] })
          } else {
            setTopicData(COMPANY_DATA[company] || {})
          }
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [company, topicParam])

  const entries = useMemo(() => Object.entries(topicData), [topicData])
  const questionCount = entries.reduce((sum, [, items]) => sum + (items?.length || 0), 0)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return entries
      .filter(([name]) => activeTopic === 'all' || name === activeTopic)
      .map(([topicName, items]) => {
        const normalised = (items || []).map(normaliseItem).filter((item) => {
          const haystack = `${topicName} ${item.question} ${item.answer}`.toLowerCase()
          return !q || haystack.includes(q)
        })
        return [topicName, normalised]
      })
      .filter(([, items]) => items.length > 0)
  }, [activeTopic, entries, query])

  const downloadText = () => {
    let text = `${company} ${topicParam || 'Company'} Preparation - MockBee\nGenerated on ${new Date().toLocaleDateString()}\n\n`
    filtered.forEach(([topicName, items]) => {
      text += `\n## ${topicName}\n`
      items.forEach((item, i) => {
        text += `\nQ${i + 1}: ${item.question}\n`
        if (item.answer) text += `A: ${item.answer}\n`
      })
    })
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${company}_${topicParam || 'Questions'}_MockBee.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="company-questions-page">
      <div className="content-wrap">
        <button type="button" className="back-btn" onClick={() => navigate(-1)}>
          <i className="fas fa-arrow-left" /> Back to Topics
        </button>

        <div className="header-flex">
          <div>
            <h1>
              {topicParam ? `${company} ${topicParam} Questions` : `${company} Questions`}
            </h1>
            <p className="header-subtitle">
              Previous interview questions grouped by topic for focused review.
            </p>
          </div>
          <button type="button" className="btn-download" onClick={downloadText}>
            <i className="fas fa-file-pdf" /> Download
          </button>
        </div>

        <div className="stats-row">
          <span className="stat-pill">
            {entries.length} topic{entries.length === 1 ? '' : 's'}
          </span>
          <span className="stat-pill">{questionCount} questions</span>
          <span className="stat-pill">View mode only</span>
          <Link
            className="stat-pill"
            to={`/interview/company/${encodeURIComponent(company)}${
              topicParam ? `?topic=${encodeURIComponent(topicParam)}` : ''
            }`}
            style={{ textDecoration: 'none' }}
          >
            Start practice interview →
          </Link>
        </div>

        <div className="cq-toolbar">
          <div className="cq-search-box">
            <i className="fas fa-search" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search questions, topics, or answers..."
            />
          </div>
          <div className="topic-filter">
            {!topicParam && (
              <button
                type="button"
                className={`topic-chip${activeTopic === 'all' ? ' active' : ''}`}
                onClick={() => setActiveTopic('all')}
              >
                All Topics
              </button>
            )}
            {entries.map(([name]) => (
              <button
                key={name}
                type="button"
                className={`topic-chip${activeTopic === name ? ' active' : ''}`}
                onClick={() => setActiveTopic(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="cq-empty-state">Loading company questions...</div>}

        {!loading && filtered.length === 0 && (
          <div className="cq-empty-state">No matching questions found.</div>
        )}

        {!loading &&
          filtered.map(([topicName, items]) => (
            <section className="topic-section" key={topicName}>
              <div className="topic-heading">
                <h2>{topicName}</h2>
                <span className="topic-count">
                  {items.length} question{items.length === 1 ? '' : 's'}
                </span>
              </div>
              {items.map((item, index) => {
                const key = `${topicName}-${index}`
                const meta = [
                  item.year ? `Year ${item.year}` : '',
                  item.difficulty || '',
                  ...item.tags.slice(0, 3),
                ].filter(Boolean)
                const isOpen = openKey === key
                return (
                  <article className={`qa-card${isOpen ? ' is-open' : ''}`} key={key}>
                    <button
                      type="button"
                      className="qa-toggle"
                      aria-expanded={isOpen}
                      onClick={() => setOpenKey(isOpen ? null : key)}
                    >
                      <span className="qa-question-main">
                        <span className="q-label">Question {index + 1}</span>
                        <span className="question-text">{item.question}</span>
                        {meta.length > 0 && (
                          <span className="question-meta">
                            {meta.map((value) => (
                              <span className="meta-pill" key={value}>
                                {value}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      <span className="qa-chevron" aria-hidden="true">
                        <span className="meta-pill">View Answer</span>
                        <i className="fas fa-chevron-down" />
                      </span>
                    </button>
                    <div className="answer-box">
                      <div className="answer-inner">
                        <span className="a-label">Answer</span>
                        <div className={`answer-text${!item.answer ? ' answer-empty' : ''}`}>
                          {item.answer || 'Answer is not available for this question yet.'}
                        </div>
                      </div>
                    </div>
                  </article>
                )
              })}
            </section>
          ))}
      </div>
    </div>
  )
}
