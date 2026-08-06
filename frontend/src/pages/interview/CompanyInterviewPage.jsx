import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiFetch } from '../../config/api'
import COMPANY_DATA from '../../data/companyQuestions'
import { KEYS, getItem, getJSON, setItem, setJSON } from '../../utils/storage'
import '../../styles/interview.css'

const MASCOT = '/images/ChatGPT%20Image%20Mar%2030,%202026,%2010_43_13%20AM.png'

function formatBold(text) {
  const parts = String(text || '').split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

export default function CompanyInterviewPage() {
  const { company: companyParam } = useParams()
  const company = companyParam || 'Google'
  const [searchParams] = useSearchParams()
  const topic = searchParams.get('topic') || ''
  const navigate = useNavigate()

  const [messages, setMessages] = useState([])
  const [questions, setQuestions] = useState([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [input, setInput] = useState('')
  const [complete, setComplete] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const transcriptRef = useRef([])
  const chatRef = useRef(null)
  const startedRef = useRef(false)

  const pushMsg = (text, type = 'ai') => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, text }])
    requestAnimationFrame(() => {
      if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
    })
  }

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      pushMsg(
        `Welcome to the **${company}** technical assessment${
          topic ? ` for **${topic}**` : ''
        }. We will cover real-world patterns from previous years.`,
      )

      let loaded = []
      try {
        const qs = `company=${encodeURIComponent(company)}${
          topic ? `&topic=${encodeURIComponent(topic)}` : ''
        }&v=${Date.now()}`
        const { ok, body } = await apiFetch(`/api/company-prep/questions?${qs}`)
        if (!ok) throw new Error('Unable to load company questions')
        const topics = body.topics || {}
        const source =
          topic && topics[topic] ? topics[topic] : Object.values(topics).flat()
        loaded = source.filter((item) => item && item.question).slice(0, 20)
      } catch {
        const fallbackTopic = topic || Object.keys(COMPANY_DATA[company] || {})[0]
        loaded =
          COMPANY_DATA[company] && COMPANY_DATA[company][fallbackTopic]
            ? COMPANY_DATA[company][fallbackTopic]
            : []
      }

      setQuestions(loaded)
      if (loaded.length === 0) {
        pushMsg(
          "I couldn't load questions for this company yet. Please make sure the backend server is running and try again.",
        )
        return
      }

      setTimeout(() => {
        pushMsg(`**Q1:** ${loaded[0].question}`)
      }, 800)
    })()
  }, [company, topic])

  const updateProgress = (index, total) => {
    return total ? (index / total) * 100 : 0
  }

  const handleSubmit = () => {
    if (currentQIndex >= questions.length || complete) return
    const val = input.trim()
    if (!val) return

    pushMsg(val, 'user')
    transcriptRef.current = [
      ...transcriptRef.current,
      {
        question: questions[currentQIndex]?.question || '',
        answer: val,
        phase: 'technical',
      },
    ]
    setInput('')

    const nextIndex = currentQIndex + 1
    setCurrentQIndex(nextIndex)

    if (nextIndex >= questions.length) {
      setComplete(true)
      setTimeout(() => {
        pushMsg(
          "**Success!** You've completed the specialized practice for this topic. Generate your report to see performance details.",
        )
        setShowResults(true)
      }, 1000)
      return
    }

    setTimeout(() => {
      pushMsg(`**Q${nextIndex + 1}:** ${questions[nextIndex].question}`)
    }, 1000)
  }

  const saveAndNavigate = () => {
    const sessionData = {
      id: String(Date.now()),
      role: `${company} ${topic || 'Company'} Interview`,
      topic: topic || company,
      transcript: transcriptRef.current,
      conversationHistory: transcriptRef.current.flatMap((t) => [
        { role: 'assistant', content: t.question },
        { role: 'user', content: t.answer },
      ]),
      date: new Date().toLocaleDateString(),
      totalQuestions: transcriptRef.current.length,
      mode: 'company',
      isQuick: true,
      isPro: false,
    }

    setItem(KEYS.recentInterview, JSON.stringify(sessionData))
    const history = getJSON(KEYS.interviews, [])
    history.push(sessionData)
    setJSON(KEYS.interviews, history)

    const email = getItem(KEYS.userEmail)
    if (email) {
      apiFetch('/api/interview/save', {
        method: 'POST',
        body: JSON.stringify({
          email,
          role: sessionData.role,
          date: sessionData.date,
          score: null,
          analysis: {},
          transcript: sessionData.transcript,
          conversationHistory: sessionData.conversationHistory,
          totalQuestions: sessionData.totalQuestions,
          mode: sessionData.mode,
          session_id: sessionData.id,
          isQuick: true,
          isPro: false,
          topic: sessionData.topic,
        }),
      }).catch(() => {})
    }

    navigate('/dashboard/reports?view=report')
  }

  const progressPct = updateProgress(currentQIndex, questions.length)
  const displayQ = questions.length ? Math.min(currentQIndex + 1, questions.length) : 0

  return (
    <div className="interview-page company-interview-page">
      <header className="interview-header">
        <div className="header-left">
          <button type="button" className="back-link" onClick={() => navigate(-1)}>
            <i className="fas fa-arrow-left" /> Exit
          </button>
        </div>
        <div className="header-center">
          <div className="role-badge">
            <div className="role-info">
              <span className="company-tag">{company.toUpperCase()} PREP</span>
              <h1>{topic || 'Company'} Interview</h1>
            </div>
          </div>
        </div>
        <div className="header-right">
          <div className="progress-container">
            <div className="progress-text">
              <span>{displayQ}</span> / <span>{questions.length}</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="interview-main">
        <main className="chat-container" ref={chatRef}>
          {messages.map((msg) => (
            <div className={`message message--${msg.type}`} key={msg.id}>
              <div className={`${msg.type}-bubble`}>
                {msg.type === 'ai' ? formatBold(msg.text) : msg.text}
              </div>
            </div>
          ))}
          {showResults && (
            <div className="results-btn-container">
              <button type="button" className="btn-view-results" onClick={saveAndNavigate}>
                See Analysis and Report →
              </button>
            </div>
          )}
        </main>
        <aside className="mascot-sidebar">
          <div className="mascot-interviewer">
            <div className="mascot-interviewer__label">Company Expert</div>
            <img src={MASCOT} alt="Mascot" className="large-mascot" />
          </div>
        </aside>
      </div>

      {!complete && (
        <footer className="input-area">
          <div className="input-container">
            <div className="input-wrapper">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder="Your technical answer..."
                autoComplete="off"
              />
              <button type="button" className="mic-btn" title="Voice not enabled in company mode">
                <i className="fas fa-microphone" />
              </button>
              <button type="button" className="submit-btn" onClick={handleSubmit}>
                Submit →
              </button>
            </div>
          </div>
        </footer>
      )}

      <style>{`
        .company-interview-page .interview-header {
          background: #fff;
          border-bottom: 3px solid #1a1a1a;
        }
        .company-tag {
          background: #1a1a1a;
          color: #d8c4b6;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 0.7rem;
          margin-bottom: 5px;
          display: inline-block;
        }
        .company-interview-page .back-link {
          width: auto !important;
          height: 38px !important;
          border-radius: 50px !important;
          padding: 0 18px !important;
          gap: 8px;
          font-weight: 700 !important;
        }
      `}</style>
    </div>
  )
}
