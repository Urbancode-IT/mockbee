import { API_BASE } from '../config/api'
import { KEYS, getItem, getJSON, setJSON } from './storage'

export const QUICK_INTERVIEW_MODES = ['1-q', '5-min', 'rapid', 'warmup']

export function normalizeInterviewSession(session) {
  if (!session) return session

  const normalized = { ...session }
  const mode = normalized.mode || 'standard'
  const isQuickMode = QUICK_INTERVIEW_MODES.includes(mode)

  if (normalized.isQuick === undefined) normalized.isQuick = isQuickMode
  if (normalized.isPro === undefined) normalized.isPro = !normalized.isQuick
  if (!normalized.analysis && normalized.score) {
    normalized.analysis = {
      overall: normalized.score,
      feedback: normalized.summary || 'Report saved for this interview session.',
    }
  }
  if (!normalized.transcript) normalized.transcript = []
  if (!normalized.date && normalized.saved_at) {
    normalized.date = new Date(normalized.saved_at).toLocaleDateString()
  }
  if (!normalized.date && normalized.started_at) {
    normalized.date = new Date(normalized.started_at).toLocaleDateString()
  }
  if (!normalized.id && normalized._id) normalized.id = normalized._id
  if (normalized.id !== undefined && normalized.id !== null) {
    normalized.id = String(normalized.id)
  }

  return normalized
}

export async function syncInterviewHistoryFromDB() {
  const userEmail = getItem(KEYS.userEmail)
  const localHistory = getJSON(KEYS.interviews, []).map(normalizeInterviewSession)

  if (!userEmail) return localHistory

  try {
    const res = await fetch(
      `${API_BASE}/api/interview/history?email=${encodeURIComponent(userEmail)}`,
    )
    const data = await res.json()
    if (data.status === 'success' && Array.isArray(data.history)) {
      const mergedById = new Map()
      localHistory.forEach((session) => {
        const key = String(
          session.id ||
            `${session.role}-${session.date}-${session.mode}-${session.saved_at || session.started_at || ''}`,
        )
        mergedById.set(key, session)
      })
      data.history
        .slice()
        .reverse()
        .map(normalizeInterviewSession)
        .forEach((session) => {
          const key = String(
            session.id ||
              `${session.role}-${session.date}-${session.mode}-${session.saved_at || session.started_at || ''}`,
          )
          mergedById.set(key, { ...(mergedById.get(key) || {}), ...session })
        })
      const merged = Array.from(mergedById.values())
      setJSON(KEYS.interviews, merged)
      return merged
    }
  } catch (err) {
    console.error('Could not sync interview history:', err)
  }

  return localHistory
}

export function sessionKey(session) {
  return String(
    session.id ||
      `${session.role}-${session.date}-${session.mode}-${session.saved_at || session.started_at || ''}`,
  )
    .toLowerCase()
    .trim()
}
