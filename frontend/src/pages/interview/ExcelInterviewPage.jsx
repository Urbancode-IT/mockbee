import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import AiInterviewerAvatar from '../../components/interview/AiInterviewerAvatar'
import { apiFetch } from '../../config/api'
import { KEYS, getItem, getJSON, setItem, setJSON } from '../../utils/storage'
import { speakNatural, stopNaturalSpeech, warmSpeechVoices } from '../../utils/naturalSpeech'
import { speakHuman, stopHumanVoice } from '../../utils/humanVoice'
import '../../styles/interview.css'

function formatBold(text) {
  const parts = String(text || '').split(/(\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return part
  })
}

async function speakText(text, muted, onEnd) {
  const humanOk = await speakHuman(text, { muted })
  if (!humanOk && !muted) {
    await speakNatural(text, { muted, lang: 'en-IN', rate: 0.92, pitch: 1.02, volume: 1 })
  }
  onEnd?.()
}

export default function ExcelInterviewPage() {
  const { bankId } = useParams()
  const navigate = useNavigate()

  const [title, setTitle] = useState('Custom AI Interview')
  const [questions, setQuestions] = useState([])
  const [messages, setMessages] = useState([])
  const [currentQIndex, setCurrentQIndex] = useState(0)
  const [input, setInput] = useState('')
  const [complete, setComplete] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [muted, setMuted] = useState(false)
  const [listening, setListening] = useState(false)
  const [awaitingAnswer, setAwaitingAnswer] = useState(false)
  const [aiSpeaking, setAiSpeaking] = useState(false)

  const chatRef = useRef(null)
  const recognitionRef = useRef(null)
  const transcriptRef = useRef([])
  const startedRef = useRef(false)
  const mutedRef = useRef(false)
  const inputBaselineRef = useRef('')
  const awaitingRef = useRef(false)
  const questionsRef = useRef([])
  const indexRef = useRef(0)

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    warmSpeechVoices()
  }, [])

  useEffect(() => {
    awaitingRef.current = awaitingAnswer
  }, [awaitingAnswer])

  const pushMsg = useCallback((text, type = 'ai') => {
    setMessages((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, type, text }])
    requestAnimationFrame(() => {
      if (chatRef.current) {
        chatRef.current.scrollTo({ top: chatRef.current.scrollHeight, behavior: 'smooth' })
      }
    })
  }, [])

  const stopMic = useCallback(() => {
    setListening(false)
    try {
      recognitionRef.current?.stop()
    } catch {
      /* ignore */
    }
  }, [])

  const startMic = useCallback(() => {
    if (!recognitionRef.current || !awaitingRef.current) return
    inputBaselineRef.current = ''
    setInput('')
    setListening(true)
    try {
      recognitionRef.current.start()
    } catch {
      /* already started */
    }
  }, [])

  const askQuestion = useCallback(
    (index, list) => {
      const q = list[index]
      if (!q) return
      const spoken = q.question
      const display = `**Q${index + 1}:** ${spoken}`
      pushMsg(display)
      setAiSpeaking(true)
      setAwaitingAnswer(false)
      stopMic()

      speakText(spoken, mutedRef.current, () => {
        setAiSpeaking(false)
        setAwaitingAnswer(true)
        // Auto-listen after AI finishes asking (MNC-style turn taking)
        setTimeout(() => startMic(), 350)
      })
    },
    [pushMsg, startMic, stopMic],
  )

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true

    ;(async () => {
      setLoading(true)
      setLoadError('')
      try {
        const { ok, body } = await apiFetch(`/api/excel-interview/${encodeURIComponent(bankId)}`)
        if (!ok) throw new Error(body.detail || 'Could not load questions')

        const loaded = (body.questions || []).filter((q) => q?.question)
        if (!loaded.length) throw new Error('This sheet has no questions')

        setTitle(body.title || 'Custom AI Interview')
        setQuestions(loaded)
        questionsRef.current = loaded
        indexRef.current = 0
        setLoading(false)

        const welcome = `Welcome to your **${body.title || 'custom'}** interview. I'm your AI interviewer for today. I'll ask questions from your sheet one by one. Please answer clearly after each question. Let's begin!`
        pushMsg(welcome)
        speakText(
          welcome.replace(/\*\*/g, ''),
          mutedRef.current,
          () => askQuestion(0, loaded),
        )
      } catch (err) {
        setLoading(false)
        setLoadError(err.message || 'Failed to load interview')
        pushMsg(`⚠️ Error: ${err.message || 'Failed to load interview'}. Go back and upload the Excel sheet again.`)
      }
    })()
  }, [askQuestion, bankId, pushMsg])

  // Speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return undefined

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event) => {
      let interim = ''
      let final = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) final += `${transcript} `
        else interim += transcript
      }
      if (final) inputBaselineRef.current += final
      setInput(inputBaselineRef.current + interim)
    }

    recognition.onend = () => {
      setListening((was) => {
        if (was && awaitingRef.current) {
          try {
            recognition.start()
          } catch {
            /* ignore */
          }
          return true
        }
        return false
      })
    }

    recognition.onerror = (event) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      if (event.error === 'not-allowed') {
        toast.error('Microphone access was denied. Please allow microphone permissions.')
      }
      setListening(false)
    }

    return () => {
      try {
        recognition.stop()
      } catch {
        /* ignore */
      }
      stopHumanVoice()
      stopNaturalSpeech()
    }
  }, [])

  const handleSubmit = () => {
    if (!awaitingAnswer || complete || aiSpeaking) return
    const val = input.trim()
    if (!val) return

    stopMic()
    setAwaitingAnswer(false)
    pushMsg(val, 'user')

    const q = questionsRef.current[indexRef.current]
    transcriptRef.current = [
      ...transcriptRef.current,
      {
        question: q?.question || '',
        answer: val,
        phase: q?.category || 'excel',
      },
    ]
    setInput('')
    inputBaselineRef.current = ''

    const nextIndex = indexRef.current + 1
    indexRef.current = nextIndex
    setCurrentQIndex(nextIndex)

    if (nextIndex >= questionsRef.current.length) {
      setComplete(true)
      const closing =
        "Thank you. That completes all questions from your sheet. You can view your report next."
      setTimeout(() => {
        pushMsg(`**Success!** ${closing}`)
        speakText(closing, mutedRef.current, () => setShowResults(true))
      }, 600)
      return
    }

    setTimeout(() => askQuestion(nextIndex, questionsRef.current), 700)
  }

  const toggleMic = () => {
    if (!awaitingAnswer || !recognitionRef.current || aiSpeaking) return
    if (listening) {
      stopMic()
    } else {
      inputBaselineRef.current = input && !input.endsWith(' ') ? `${input} ` : input
      setListening(true)
      try {
        recognitionRef.current.start()
      } catch (err) {
        console.error(err)
      }
    }
  }

  const toggleMute = () => {
    setMuted((m) => {
      if (!m) { stopHumanVoice(); stopNaturalSpeech() }
      return !m
    })
  }

  const saveAndNavigate = () => {
    const sessionData = {
      id: String(Date.now()),
      role: title,
      topic: 'Excel Interview',
      transcript: transcriptRef.current,
      conversationHistory: transcriptRef.current.flatMap((t) => [
        { role: 'assistant', content: t.question },
        { role: 'user', content: t.answer },
      ]),
      date: new Date().toLocaleDateString(),
      totalQuestions: transcriptRef.current.length,
      mode: 'excel',
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

  const total = questions.length
  const displayQ = total ? Math.min(currentQIndex + 1, total) : 0
  const progressPct = total ? (currentQIndex / total) * 100 : 0

  return (
    <div className="interview-page excel-interview-page">
      <header className="interview-header">
        <div className="header-left">
          <button type="button" className="back-link" onClick={() => navigate('/dashboard/excel-interview')}>
            <i className="fas fa-arrow-left" /> Exit
          </button>
        </div>
        <div className="header-center">
          <div className="role-badge">
            <div className="role-info">
              <span className="company-tag">EXCEL AI INTERVIEW</span>
              <h1>{title}</h1>
            </div>
          </div>
        </div>
        <div className="header-right">
          <button
            type="button"
            className={`mute-btn${muted ? ' muted' : ''}`}
            onClick={toggleMute}
            title={muted ? 'Unmute AI voice' : 'Mute AI voice'}
          >
            <i className={`fas ${muted ? 'fa-volume-xmark' : 'fa-volume-high'}`} />
          </button>
          <div className="progress-container">
            <div className="progress-text">
              <span>{displayQ}</span> / <span>{total || '—'}</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }} />
            </div>
          </div>
        </div>
      </header>

      <div className="interview-main">
        <main className="chat-container" ref={chatRef}>
          {loading && (
            <div className="message message--ai">
              <div className="ai-bubble">Loading your Excel questions…</div>
            </div>
          )}
          {messages.map((msg) => (
            <div className={`message message--${msg.type}`} key={msg.id}>
              <div className={`${msg.type}-bubble`}>
                {msg.type === 'ai' ? formatBold(msg.text) : msg.text}
              </div>
            </div>
          ))}
          {aiSpeaking && (
            <div className="message message--ai">
              <div className="ai-bubble excel-speaking">AI interviewer is speaking…</div>
            </div>
          )}
          {awaitingAnswer && listening && (
            <div className="message message--ai">
              <div className="ai-bubble excel-listening">Listening to your answer…</div>
            </div>
          )}
          {showResults && (
            <div className="results-btn-container">
              <button type="button" className="btn-view-results" onClick={saveAndNavigate}>
                See Analysis and Report →
              </button>
            </div>
          )}
          {loadError && (
            <div className="results-btn-container">
              <button
                type="button"
                className="btn-view-results"
                onClick={() => navigate('/dashboard/excel-interview')}
              >
                Upload Excel again →
              </button>
            </div>
          )}
        </main>
        <aside className={`mascot-sidebar${aiSpeaking ? ' is-talking' : ''}`}>
          <AiInterviewerAvatar
            speaking={aiSpeaking}
            listening={listening}
            label="AI INTERVIEWER"
          />
        </aside>
      </div>

      {!complete && !loadError && (
        <footer className="input-area">
          <div className="input-container">
            <div className="input-wrapper">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                placeholder={
                  aiSpeaking
                    ? 'Wait for the AI to finish asking…'
                    : listening
                      ? 'Speak your answer… (or type)'
                      : 'Type your answer here…'
                }
                rows={1}
                disabled={!awaitingAnswer || aiSpeaking}
                autoComplete="off"
              />
              <button
                type="button"
                className={`mic-btn${listening ? ' active' : ''}`}
                onClick={toggleMic}
                disabled={!awaitingAnswer || aiSpeaking}
                title="Voice answer"
              >
                <i className="fas fa-microphone" />
              </button>
              <button
                type="button"
                className="submit-btn"
                onClick={handleSubmit}
                disabled={!awaitingAnswer || aiSpeaking || !input.trim()}
              >
                SUBMIT
                <i className="fas fa-arrow-right" />
              </button>
            </div>
            <p className="input-hint">Enter to submit • Shift+Enter for new line • Mic auto-starts after each question</p>
          </div>
        </footer>
      )}

      <style>{`
        .excel-interview-page .company-tag {
          background: #1a1a1a;
          color: #d8c4b6;
          padding: 4px 10px;
          border-radius: 6px;
          font-weight: 800;
          font-size: 0.7rem;
          margin-bottom: 5px;
          display: inline-block;
        }
        .excel-interview-page .mute-btn {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          border: 1.5px solid #1a1a1a;
          background: #fff;
          cursor: pointer;
          margin-right: 12px;
        }
        .excel-interview-page .mute-btn.muted {
          background: #1a1a1a;
          color: #fff;
        }
        .excel-interview-page .large-mascot.is-speaking {
          animation: excelPulse 1.1s ease-in-out infinite;
        }
        .excel-interview-page .large-mascot.is-listening {
          filter: drop-shadow(0 0 12px rgba(197, 161, 122, 0.55));
        }
        @keyframes excelPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.03); }
        }
        .excel-speaking, .excel-listening {
          font-style: italic;
          opacity: 0.85;
        }
        .excel-interview-page .input-hint {
          text-align: center;
          font-size: 0.75rem;
          color: #888;
          margin-top: 8px;
        }
        .excel-interview-page .input-wrapper textarea {
          flex: 1;
          border: none;
          outline: none;
          resize: none;
          font: inherit;
          background: transparent;
          min-height: 24px;
          max-height: 120px;
        }
      `}</style>
    </div>
  )
}
