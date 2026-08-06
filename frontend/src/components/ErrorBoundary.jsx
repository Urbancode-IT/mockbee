import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Something went wrong' }
  }

  componentDidCatch(error, info) {
    console.error('UI error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          padding: 24,
          fontFamily: 'Satoshi, sans-serif',
          background: '#fff',
          color: '#1a1a1a',
        }}>
          <h1 style={{ fontSize: '1.5rem' }}>Page failed to load</h1>
          <p style={{ color: '#666' }}>{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              borderRadius: 999,
              border: 'none',
              background: '#1a1a1a',
              color: '#fff',
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Reload page
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
