import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getItem, getJSON } from '../../utils/storage'
import './SubscriptionPage.css'

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export default function SubscriptionPage() {
  const navigate = useNavigate()
  const { user, setSubscription } = useAuth()

  const isStudent = !!user?.isStudent || user?.role === 'STUDENT'
  const startDateStr = user?.subStartDate || getItem(KEYS.subStartDate)
  const endDateStr = user?.subEndDate || getItem(KEYS.subEndDate)
  let savedBilling = user?.subBilling || getItem(KEYS.subBilling) || 'monthly'

  let subscribedPlan = user?.subscribedPlan
  let isSubscribed = !!user?.subscribed

  if (isStudent) {
    isSubscribed = true
    subscribedPlan = 'student_access'
  }

  if ((!isSubscribed || !subscribedPlan) && user?.email) {
    const accounts = getJSON(KEYS.accounts, {}) || {}
    const userAcc = accounts[user.email]
    if (userAcc?.subscribed) {
      isSubscribed = true
      subscribedPlan = userAcc.subscribedPlan || 'standard'
      if (userAcc.billing) savedBilling = userAcc.billing
    }
  }

  if (!subscribedPlan) subscribedPlan = isSubscribed ? 'standard' : 'free'

  let actualIsSubscribed = isSubscribed
  const isExpired = !isStudent && !!endDateStr && new Date() > new Date(endDateStr)
  if (isExpired) actualIsSubscribed = false

  if (startDateStr && endDateStr) {
    const diffDays = Math.abs(new Date(endDateStr) - new Date(startDateStr)) / (1000 * 60 * 60 * 24)
    if (!user?.subBilling && !getItem(KEYS.subBilling)) {
      savedBilling = diffDays > 300 ? 'yearly' : 'monthly'
    }
  }

  useEffect(() => {
    if (isExpired && user?.subscribed) {
      setSubscription({ subscribed: false, plan: 'free' })
    }
  }, [isExpired, user?.subscribed, setSubscription])

  const [billing, setBilling] = useState(() =>
    actualIsSubscribed && savedBilling === 'yearly' ? 'yearly' : 'monthly'
  )

  const datesInfo = useMemo(() => {
    if (isStudent) {
      return { text: 'Student Access: Enabled by admin', statusColor: '#FFFFFF' }
    }
    if (!actualIsSubscribed) return null

    const displayStartDate = startDateStr || new Date().toISOString()
    const displayEndDate = endDateStr || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const sDate = formatDate(displayStartDate)
    const eDate = formatDate(displayEndDate)

    const now = new Date()
    const end = new Date(displayEndDate)
    let diffMs = end - now
    if (diffMs < 0) diffMs = 0

    const diffTotalHours = Math.ceil(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffTotalHours / 24)
    const diffHours = diffTotalHours % 24

    let planPrefix = 'Active'
    if (subscribedPlan === 'standard') planPrefix = 'Pro Active'
    else if (subscribedPlan === 'pro') planPrefix = 'Elite Active'

    const statusColor = diffDays < 5 ? '#FF4D4F' : '#FFFFFF'

    return {
      text: `${planPrefix} Subscription: ${sDate}  |  Ends: ${eDate} (${diffDays} Days & ${diffHours} Hours left)`,
      statusColor,
      eDate,
      diffDays,
      diffHours,
      planPrefix,
      sDate,
    }
  }, [actualIsSubscribed, endDateStr, isStudent, startDateStr, subscribedPlan])

  const showStandardActive =
    actualIsSubscribed &&
    subscribedPlan === 'standard' &&
    !(billing === 'yearly' && savedBilling === 'monthly')

  const showEliteActive =
    actualIsSubscribed &&
    subscribedPlan === 'pro' &&
    !(billing === 'yearly' && savedBilling === 'monthly')

  const eliteUnavailableForPro = actualIsSubscribed && subscribedPlan === 'pro'

  const getPrice = (cardPlan, monthly, yearly) => {
    const freeze =
      actualIsSubscribed &&
      ((cardPlan === 'standard' && subscribedPlan === 'standard') ||
        (cardPlan === 'pro' && subscribedPlan === 'pro')) &&
      (billing === 'monthly' || savedBilling === 'yearly' || (billing === 'yearly' && savedBilling === 'yearly'))

    if (freeze && cardPlan === subscribedPlan) {
      if (billing === 'monthly') return savedBilling === 'yearly' ? yearly : monthly
      if (savedBilling === 'yearly') return yearly
    }
    return billing === 'yearly' ? yearly : monthly
  }

  const getPeriod = (cardPlan) => {
    const isActiveCard =
      actualIsSubscribed &&
      ((cardPlan === 'standard' && subscribedPlan === 'standard') ||
        (cardPlan === 'pro' && subscribedPlan === 'pro'))

    if (isActiveCard && (billing === 'monthly' || (billing === 'yearly' && savedBilling === 'yearly'))) {
      return savedBilling === 'yearly' ? '/ yr' : '/ mo'
    }
    return billing === 'yearly' ? '/ yr' : '/ mo'
  }

  const goPayment = (plan) => {
    navigate(`/payment?plan=${plan}&billing=${billing}`)
  }

  let starterLabel = 'Active Plan'
  let starterMuted = true
  if (isStudent) {
    starterLabel = 'Student Account'
  } else if (actualIsSubscribed) {
    starterLabel = 'Free Plan'
    starterMuted = false
  }

  return (
    <div className="subscription-page">
      <div className="plans-header">
        <h1>Subscriptions</h1>
        <p>Manage your plan and unlock premium AI features directly from your workspace.</p>
        {datesInfo && (
          <div className="subscription-dates is-visible" style={{ color: '#FFFFFF' }}>
            {isStudent ? (
              datesInfo.text
            ) : (
              <>
                {datesInfo.planPrefix} Subscription: {datesInfo.sDate}
                &nbsp;|&nbsp;
                <span style={{ color: datesInfo.statusColor }}>
                  Ends: {datesInfo.eDate} ({datesInfo.diffDays} Days & {datesInfo.diffHours} Hours left)
                </span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="billing-toggle-container">
        <div className="billing-toggle">
          <button
            type="button"
            id="btn-monthly"
            className={`toggle-btn${billing === 'monthly' ? ' active' : ''}${
              actualIsSubscribed && subscribedPlan === 'pro' && savedBilling === 'yearly' ? ' is-disabled' : ''
            }`}
            onClick={() => setBilling('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            id="btn-yearly"
            className={`toggle-btn${billing === 'yearly' ? ' active' : ''}`}
            onClick={() => setBilling('yearly')}
          >
            Yearly <span className="save-hint">Save 20%</span>
          </button>
        </div>
      </div>

      <div className="plans-grid">
        <div className="plan-card" id="starter-card">
          <span className="plan-label">Starter Plan</span>
          <div className="plan-price">
            <span className="currency">$</span>0 <span className="billing-period">/ mo</span>
          </div>
          <ul className="features-list">
            <li className="feature-item"><i className="fas fa-check" /> 5 Quick Practices</li>
            <li className="feature-item"><i className="fas fa-check" /> 3 Core Roles</li>
            <li className="feature-item"><i className="fas fa-check" /> Community Access</li>
          </ul>
          <button
            type="button"
            className={`btn-upgrade${starterMuted ? ' is-muted' : ''}`}
            disabled
            style={!starterMuted ? { background: 'transparent', color: 'var(--text-medium)' } : undefined}
          >
            {starterLabel}
          </button>
        </div>

        <div
          className={`plan-card popular${showStandardActive ? ' is-yellow-subscribed' : ''}`}
          id="standard-card"
        >
          <span className="plan-label">Pro Member</span>
          <div className="plan-price">
            <span className="currency">$</span>
            <span className="price-amount">{getPrice('standard', 8, 76)}</span>{' '}
            <span className="billing-period">{getPeriod('standard')}</span>
          </div>
          <ul className="features-list">
            <li className="feature-item"><i className="fas fa-check" /> Unlimited Practices</li>
            <li className="feature-item"><i className="fas fa-check" /> All 16+ Roles</li>
            <li className="feature-item"><i className="fas fa-check" /> ATS Resume Builder</li>
            <li className="feature-item muted"><i className="fas fa-times" /> Top Company Prep</li>
          </ul>
          {isStudent ? (
            <button type="button" className="btn-upgrade is-included" disabled>
              Included
            </button>
          ) : eliteUnavailableForPro ? (
            <button type="button" className="btn-upgrade is-unavailable" disabled>
              Unavailable
            </button>
          ) : showStandardActive ? (
            <button type="button" className="btn-upgrade" disabled>
              Active Plan
            </button>
          ) : (
            <button type="button" className="btn-upgrade" onClick={() => goPayment('standard')}>
              Upgrade Now
            </button>
          )}
          <div className={`subscribed-banner${showStandardActive ? ' is-visible' : ''}`}>
            <i className="fas fa-check-circle" /> You already subscribed to this plan
          </div>
        </div>

        <div
          className={`plan-card popular${showEliteActive ? ' is-pro-subscribed' : ''}`}
          id="pro-card"
        >
          <div className="badge">Most Popular</div>
          <span className="plan-label">Elite Member</span>
          <div className="plan-price">
            <span className="currency">$</span>
            <span className="price-amount">{getPrice('pro', 15, 144)}</span>{' '}
            <span className="billing-period">{getPeriod('pro')}</span>
          </div>
          <ul className="features-list">
            <li className="feature-item"><i className="fas fa-check" /> Unlimited Practices</li>
            <li className="feature-item"><i className="fas fa-check" /> All 16+ Roles</li>
            <li className="feature-item"><i className="fas fa-check" /> ATS Resume Builder</li>
            <li className="feature-item"><i className="fas fa-check" /> Top Company Prep</li>
          </ul>
          {isStudent ? (
            <button type="button" className="btn-upgrade is-included" disabled>
              Included
            </button>
          ) : showEliteActive ? (
            <button type="button" className="btn-upgrade" disabled>
              Active Plan
            </button>
          ) : (
            <button type="button" className="btn-upgrade" onClick={() => goPayment('elite')}>
              Upgrade Now
            </button>
          )}
          <div className={`subscribed-banner${showEliteActive ? ' is-visible' : ''}`}>
            <i className="fas fa-check-circle" /> You already subscribed to this plan
          </div>
        </div>
      </div>
    </div>
  )
}
