import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { KEYS, getJSON } from '../../utils/storage'
import './PaymentPage.css'

export default function PaymentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { setSubscription, user } = useAuth()

  const planToPurchase = searchParams.get('plan') || 'elite'
  const billingPeriod = searchParams.get('billing') || 'monthly'
  const isElite = planToPurchase === 'elite'
  const price = isElite ? '$15.00' : '$8.00'

  const [method, setMethod] = useState('Card')
  const [cardName, setCardName] = useState('')
  const [cardNum, setCardNum] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [paypalEmail, setPaypalEmail] = useState('')
  const [processing, setProcessing] = useState(false)
  const [success, setSuccess] = useState(false)

  const labels = useMemo(
    () => ({
      subtitle: isElite ? 'Upgrade to MockBee Elite Membership' : 'Upgrade to MockBee Pro Membership',
      orderLabel: isElite ? 'Elite Member Access (Life-time)' : 'Pro Member Access (Life-time)',
      price,
    }),
    [isElite, price]
  )

  const formatCard = (raw) => {
    const v = raw.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    const match = (v.match(/\d{4,16}/g) && v.match(/\d{4,16}/g)[0]) || ''
    const parts = []
    for (let i = 0; i < match.length; i += 4) parts.push(match.substring(i, i + 4))
    return parts.length ? parts.join(' ') : v
  }

  const formatExpiry = (raw) => {
    const v = raw.replace(/\s+/g, '').replace(/[^0-9]/gi, '')
    if (v.length >= 2) return `${v.substring(0, 2)}/${v.substring(2, 4)}`
    return v
  }

  const completeSubscription = () => {
    const planKey = isElite ? 'pro' : 'standard'
    const today = new Date()
    const endDate = new Date(today)
    if (billingPeriod === 'yearly') endDate.setFullYear(endDate.getFullYear() + 1)
    else endDate.setMonth(endDate.getMonth() + 1)

    const prevPlan = user?.subscribedPlan
    const allPlans = [...(getJSON(KEYS.allPlans, []) || [])]
    if (prevPlan && !allPlans.includes(prevPlan)) allPlans.push(prevPlan)
    if (!allPlans.includes(planKey)) allPlans.push(planKey)

    setSubscription({
      subscribed: true,
      plan: planKey,
      billing: billingPeriod,
      startDate: today.toISOString(),
      endDate: endDate.toISOString(),
      allPlans,
    })

    setSuccess(true)
    setProcessing(false)
  }

  const simulatePay = () => {
    setProcessing(true)
    setTimeout(completeSubscription, 2000)
  }

  const handleCardSubmit = (e) => {
    e.preventDefault()
    simulatePay()
  }

  const handlePayPal = () => {
    if (!paypalEmail || !paypalEmail.includes('@')) {
      alert('Please enter a valid PayPal email')
      return
    }
    simulatePay()
  }

  return (
    <div className="payment-page">
      <button type="button" className="back-btn" onClick={() => navigate(-1)} aria-label="Back">
        <i className="fas fa-arrow-left" />
      </button>

      <div className="payment-card">
        <div className="checkout-header">
          <h1>Secure Checkout</h1>
          <p>{labels.subtitle}</p>
        </div>

        <div className="order-summary">
          <span>{labels.orderLabel}</span>
          <span>{labels.price}</span>
        </div>

        <div className="payment-methods">
          {['Card', 'PayPal', 'UPI'].map((m) => (
            <button
              key={m}
              type="button"
              className={`method-btn${method === m ? ' active' : ''}`}
              onClick={() => setMethod(m)}
            >
              {m === 'Card' && <i className="fab fa-cc-visa" />}
              {m === 'PayPal' && <i className="fab fa-paypal" />}
              {m === 'UPI' && <i className="fas fa-university" />}
              {m}
            </button>
          ))}
        </div>

        {method === 'Card' && (
          <form id="payment-form" onSubmit={handleCardSubmit}>
            <div className="form-group">
              <label>Cardholder Name</label>
              <input
                type="text"
                placeholder="John Doe"
                required
                pattern="[A-Za-z ]{3,}"
                title="Please enter a valid name"
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Card Number</label>
              <input
                type="text"
                id="card-num"
                placeholder="xxxx xxxx xxxx xxxx"
                required
                maxLength={19}
                pattern="\d{4} \d{4} \d{4} \d{4}"
                title="Please enter a 16-digit card number"
                value={cardNum}
                onChange={(e) => setCardNum(formatCard(e.target.value))}
              />
            </div>
            <div className="row-group">
              <div className="form-group">
                <label>Expiry</label>
                <input
                  type="text"
                  id="expiry"
                  placeholder="MM/YY"
                  required
                  maxLength={5}
                  pattern="(0[1-9]|1[0-2])\/([0-9]{2})"
                  title="Format: MM/YY"
                  value={expiry}
                  onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                />
              </div>
              <div className="form-group">
                <label>CVC</label>
                <input
                  type="text"
                  placeholder="***"
                  required
                  maxLength={3}
                  pattern="\d{3}"
                  title="3-digit CVC"
                  value={cvc}
                  onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
              </div>
            </div>

            <button type="submit" className="btn-pay" disabled={processing}>
              {processing ? (
                <>
                  <i className="fas fa-spinner fa-spin" /> Processing...
                </>
              ) : (
                <>
                  <i className="fas fa-lock" /> Pay {labels.price}
                </>
              )}
            </button>
          </form>
        )}

        <div className={`paypal-section${method === 'PayPal' ? ' is-visible' : ''}`}>
          <img
            src="https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg"
            alt="PayPal"
            className="paypal-logo"
          />
          <p className="paypal-info-text">
            You will be redirected to PayPal to complete your payment securely.
          </p>
          <div className="paypal-input-wrapper">
            <i className="fas fa-envelope" />
            <input
              type="email"
              placeholder="PayPal Email"
              id="paypal-email"
              value={paypalEmail}
              onChange={(e) => setPaypalEmail(e.target.value)}
            />
          </div>
          <button type="button" className="btn-pay" onClick={handlePayPal} disabled={processing}>
            {processing ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Processing...
              </>
            ) : (
              <>
                <i className="fas fa-lock" /> Pay with PayPal
              </>
            )}
          </button>
          <div className="paypal-secure-badge">
            <i className="fas fa-shield-alt" />
            <div>
              <h4>Secure payments powered by PayPal</h4>
              <p>Your payment information is protected by PayPal&apos;s security.</p>
            </div>
          </div>
          <div className="ssl-info">
            <i className="fas fa-check-circle" />
            Secure SSL encrypted checkout
          </div>
        </div>

        <div className={`upi-section${method === 'UPI' ? ' is-visible' : ''}`}>
          <h3 className="upi-title">Pay using UPI</h3>
          <p className="upi-subtitle">Scan with any UPI app to pay</p>
          <div className="qr-wrapper">
            <img
              src="https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=MockBeePayment"
              alt="QR Code"
            />
          </div>
          <div className="upi-apps">
            <div className="upi-app" onClick={simulatePay} role="button" tabIndex={0}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/f/f2/Google_Pay_Logo.svg" alt="GPay" />
            </div>
            <div className="upi-app" onClick={simulatePay} role="button" tabIndex={0}>
              <img src="https://upload.wikimedia.org/wikipedia/commons/7/71/PhonePe_Logo.svg" alt="PhonePe" />
            </div>
            <div className="upi-app" onClick={simulatePay} role="button" tabIndex={0}>
              <img src="https://cdn.worldvectorlogo.com/logos/paytm-1.svg" alt="Paytm" />
            </div>
          </div>
          <button type="button" className="btn-upi-id" onClick={simulatePay} disabled={processing}>
            {processing ? (
              <>
                <i className="fas fa-spinner fa-spin" /> Processing...
              </>
            ) : (
              <>
                <i className="fas fa-mobile-alt" /> Enter UPI ID instead
              </>
            )}
          </button>
          <div className="ssl-info">
            <i className="fas fa-check-circle" />
            Secure SSL encrypted checkout
          </div>
        </div>

        <div className={`success-overlay${success ? ' is-visible' : ''}`} id="success-screen">
          <div className="success-icon">
            <i className="fas fa-check-circle" />
          </div>
          <h2 className="success-title">Payment Successful!</h2>
          <p className="success-text">
            Welcome to MockBee Pro. All roles and premium titles are now unlocked for you.
          </p>
          <button type="button" className="btn-pay" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
