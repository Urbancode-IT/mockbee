import { createContext, useContext, useMemo, useState, useCallback } from 'react'
import {
  KEYS,
  getItem,
  setItem,
  removeItem,
  getJSON,
  setJSON,
  clearSessionData,
  clearAuthSession,
  displayNameFrom,
} from '../utils/storage'
import { apiFetch } from '../config/api'

const AuthContext = createContext(null)

function readUserFromStorage() {
  const name = getItem(KEYS.userName)
  const email = getItem(KEYS.userEmail)
  if (!name && !email) return null

  return {
    name: name || '',
    email: email || '',
    picture: getItem(KEYS.userPicture),
    role: getItem(KEYS.role, 'PUBLIC'),
    isStudent: getItem(KEYS.isStudent) === 'true' || getItem(KEYS.role) === 'STUDENT',
    isAdmin: getItem(KEYS.isAdmin) === 'true',
    adminToken: getItem(KEYS.adminToken),
    subscribed: getItem(KEYS.subscribed) === 'true',
    subscribedPlan: getItem(KEYS.subscribedPlan, 'free'),
    allPlans: getJSON(KEYS.allPlans, []),
    subStartDate: getItem(KEYS.subStartDate),
    subEndDate: getItem(KEYS.subEndDate),
    subBilling: getItem(KEYS.subBilling),
  }
}

function applySubscriptionFromAccount(email, isStudent) {
  if (isStudent) {
    setItem(KEYS.subscribed, 'true')
    setItem(KEYS.subscribedPlan, 'student_access')
    return
  }

  const accounts = getJSON(KEYS.accounts, {})
  const userAcc = accounts[email]
  if (userAcc?.subscribed) {
    setItem(KEYS.subscribed, 'true')
    setItem(KEYS.subscribedPlan, userAcc.subscribedPlan || 'standard')
    if (userAcc.allPlans) setJSON(KEYS.allPlans, userAcc.allPlans)
    if (userAcc.startDate) setItem(KEYS.subStartDate, userAcc.startDate)
    if (userAcc.endDate) setItem(KEYS.subEndDate, userAcc.endDate)
    if (userAcc.billing) setItem(KEYS.subBilling, userAcc.billing)
  } else {
    setItem(KEYS.subscribed, 'false')
    removeItem(KEYS.subscribedPlan)
    removeItem(KEYS.allPlans)
    removeItem(KEYS.subStartDate)
    removeItem(KEYS.subEndDate)
    removeItem(KEYS.subBilling)
  }
}

function persistUserSession({ name, email, role = 'PUBLIC', isStudent = false, isAdmin = false, adminToken = null }) {
  setItem(KEYS.userName, name || '')
  setItem(KEYS.userEmail, email || '')
  setItem(KEYS.role, role || 'PUBLIC')
  setItem(KEYS.isStudent, isStudent ? 'true' : 'false')
  setItem(KEYS.isAdmin, isAdmin ? 'true' : 'false')
  if (adminToken) setItem(KEYS.adminToken, adminToken)
  else removeItem(KEYS.adminToken)
  applySubscriptionFromAccount(email, isStudent)
  clearSessionData()
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => readUserFromStorage())

  const refreshUser = useCallback(() => {
    setUser(readUserFromStorage())
  }, [])

  const login = useCallback(async (email, password) => {
    const searchEmail = email.trim().toLowerCase()
    try {
      const { status, body } = await apiFetch('/api/login', {
        method: 'POST',
        body: JSON.stringify({ email: searchEmail, password }),
      })

      if (status === 400 || status === 409) {
        return { ok: false, error: body.detail || 'Login failed.' }
      }
      if (status !== 200) {
        return { ok: false, error: 'Server error, try again later.' }
      }

      persistUserSession({
        name: body.name || '',
        email: body.email,
        role: body.role || 'PUBLIC',
        isStudent: !!body.is_student || body.role === 'STUDENT',
        isAdmin: !!body.is_admin,
        adminToken: body.admin_token || null,
      })
      refreshUser()
      return { ok: true, isAdmin: !!body.is_admin }
    } catch {
      const accounts = getJSON(KEYS.accounts, {})
      const localAcc = accounts[searchEmail]
      if (localAcc && localAcc.password === password) {
        persistUserSession({
          name: localAcc.name || searchEmail,
          email: searchEmail,
          role: 'PUBLIC',
          isStudent: false,
        })
        if (localAcc.subscribed) {
          setItem(KEYS.subscribed, 'true')
          if (localAcc.subscribedPlan) setItem(KEYS.subscribedPlan, localAcc.subscribedPlan)
        }
        refreshUser()
        return { ok: true, isAdmin: false }
      }
      if (localAcc) return { ok: false, error: 'Incorrect password.' }
      return { ok: false, error: 'Server is starting up. Please wait 30 seconds and try again.' }
    }
  }, [refreshUser])

  const signup = useCallback(async ({ name, email, password }) => {
    const normalizedEmail = email.trim().toLowerCase()
    try {
      const { status, body } = await apiFetch('/api/signup', {
        method: 'POST',
        body: JSON.stringify({ name, email: normalizedEmail, password }),
      })

      if (status === 400) return { ok: false, error: body.detail || 'Signup failed.' }
      if (status !== 200) return { ok: false, error: 'Server error, try again later.' }

      persistUserSession({
        name,
        email: normalizedEmail,
        role: 'PUBLIC',
        isStudent: false,
      })
      setItem(KEYS.subscribed, 'false')
      setItem(KEYS.sendWelcomeEmail, 'true')
      refreshUser()
      return { ok: true }
    } catch {
      const accounts = getJSON(KEYS.accounts, {})
      if (accounts[normalizedEmail]) {
        return { ok: false, error: 'An account with this email already exists. Please log in.' }
      }
      accounts[normalizedEmail] = { name, password, subscribed: false }
      setJSON(KEYS.accounts, accounts)
      persistUserSession({ name, email: normalizedEmail })
      setItem(KEYS.subscribed, 'false')
      setItem(KEYS.sendWelcomeEmail, 'true')
      refreshUser()
      return { ok: true }
    }
  }, [refreshUser])

  const oauthLogin = useCallback(async ({ provider, email, name }) => {
    const oauthEmail = email.trim().toLowerCase()
    try {
      const { body } = await apiFetch('/api/oauth-login', {
        method: 'POST',
        body: JSON.stringify({ provider, email: oauthEmail, name }),
      })
      if (body.status !== 'success') {
        return { ok: false, error: body.detail || `Failed to continue with ${provider}.` }
      }
      persistUserSession({
        name: body.name || name,
        email: body.email || oauthEmail,
        role: body.role || 'PUBLIC',
        isStudent: !!body.is_student,
      })
      refreshUser()
      return { ok: true }
    } catch {
      persistUserSession({ name, email: oauthEmail, role: 'PUBLIC', isStudent: false })
      refreshUser()
      return { ok: true }
    }
  }, [refreshUser])

  const logout = useCallback(() => {
    const email = getItem(KEYS.userEmail) || ''
    const name = getItem(KEYS.userName) || ''
    const subscribed = getItem(KEYS.subscribed) === 'true'

    if (email) {
      const accounts = getJSON(KEYS.accounts, {})
      if (accounts[email]) {
        accounts[email].name = name
        accounts[email].subscribed = subscribed
        accounts[email].interviews = getJSON(KEYS.interviews, [])
        accounts[email].activities = getJSON(KEYS.activities, [])
        setJSON(KEYS.accounts, accounts)
      }
    }

    clearAuthSession()
    setUser(null)
  }, [])

  const updateProfile = useCallback((updates) => {
    if (updates.name != null) setItem(KEYS.userName, updates.name)
    if (updates.email != null) {
      const oldEmail = getItem(KEYS.userEmail)
      const newEmail = updates.email.trim().toLowerCase()
      const accounts = getJSON(KEYS.accounts, {})
      if (oldEmail && accounts[oldEmail]) {
        accounts[newEmail] = { ...accounts[oldEmail], name: updates.name ?? accounts[oldEmail].name }
        if (oldEmail !== newEmail) delete accounts[oldEmail]
        setJSON(KEYS.accounts, accounts)
      }
      setItem(KEYS.userEmail, newEmail)
    }
    refreshUser()
  }, [refreshUser])

  const setSubscription = useCallback((sub) => {
    setItem(KEYS.subscribed, sub.subscribed ? 'true' : 'false')
    if (sub.plan) setItem(KEYS.subscribedPlan, sub.plan)
    if (sub.billing) setItem(KEYS.subBilling, sub.billing)
    if (sub.startDate) setItem(KEYS.subStartDate, sub.startDate)
    if (sub.endDate) setItem(KEYS.subEndDate, sub.endDate)
    if (sub.allPlans) setJSON(KEYS.allPlans, sub.allPlans)

    const email = getItem(KEYS.userEmail)
    if (email) {
      const accounts = getJSON(KEYS.accounts, {})
      accounts[email] = {
        ...(accounts[email] || {}),
        subscribed: !!sub.subscribed,
        subscribedPlan: sub.plan,
        billing: sub.billing,
        startDate: sub.startDate,
        endDate: sub.endDate,
        allPlans: sub.allPlans,
      }
      setJSON(KEYS.accounts, accounts)
    }
    refreshUser()
  }, [refreshUser])

  const value = useMemo(() => {
    const displayName = displayNameFrom(user?.name || user?.email)
    const isPro =
      user?.subscribed &&
      ['standard', 'pro_plan', 'pro', 'elite_plan', 'student_access'].includes(user?.subscribedPlan)
    const isElite =
      user?.subscribed && ['pro', 'elite_plan'].includes(user?.subscribedPlan)

    return {
      user,
      isAuthenticated: !!user,
      displayName,
      isPro: !!isPro || !!user?.isStudent,
      isElite: !!isElite,
      login,
      signup,
      oauthLogin,
      logout,
      refreshUser,
      updateProfile,
      setSubscription,
    }
  }, [user, login, signup, oauthLogin, logout, refreshUser, updateProfile, setSubscription])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
