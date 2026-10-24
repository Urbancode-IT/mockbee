import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import './dialog.css'

const DialogContext = createContext(null)

export function DialogProvider({ children }) {
  const [confirmState, setConfirmState] = useState(null)
  const [promptState, setPromptState] = useState(null)
  const confirmResolver = useRef(null)
  const promptResolver = useRef(null)

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      confirmResolver.current = resolve
      setConfirmState({
        message,
        title: options.title || 'Confirm',
        confirmLabel: options.confirmLabel || 'Confirm',
        cancelLabel: options.cancelLabel || 'Cancel',
        danger: Boolean(options.danger),
      })
    })
  }, [])

  const prompt = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      promptResolver.current = resolve
      setPromptState({
        message,
        title: options.title || 'Input required',
        defaultValue: options.defaultValue ?? '',
        placeholder: options.placeholder || '',
        inputType: options.inputType || 'text',
        confirmLabel: options.confirmLabel || 'Continue',
        cancelLabel: options.cancelLabel || 'Cancel',
      })
    })
  }, [])

  const closeConfirm = (result) => {
    setConfirmState(null)
    confirmResolver.current?.(result)
    confirmResolver.current = null
  }

  const closePrompt = (result) => {
    setPromptState(null)
    promptResolver.current?.(result)
    promptResolver.current = null
  }

  const value = useMemo(() => ({ confirm, prompt }), [confirm, prompt])

  return (
    <DialogContext.Provider value={value}>
      {children}

      {confirmState && (
        <div className="app-dialog-overlay" role="presentation" onClick={() => closeConfirm(false)}>
          <div
            className="app-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="app-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="app-confirm-title" className="app-dialog__title">
              {confirmState.title}
            </h3>
            <p className="app-dialog__message">{confirmState.message}</p>
            <div className="app-dialog__actions">
              <button
                type="button"
                className={`app-dialog__btn app-dialog__btn--primary${confirmState.danger ? ' app-dialog__btn--danger' : ''}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.confirmLabel}
              </button>
              <button type="button" className="app-dialog__btn app-dialog__btn--ghost" onClick={() => closeConfirm(false)}>
                {confirmState.cancelLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {promptState && (
        <PromptForm
          state={promptState}
          onCancel={() => closePrompt(null)}
          onSubmit={(value) => closePrompt(value)}
        />
      )}
    </DialogContext.Provider>
  )
}

function PromptForm({ state, onCancel, onSubmit }) {
  const [value, setValue] = useState(state.defaultValue)

  return (
    <div className="app-dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className="app-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="app-prompt-title" className="app-dialog__title">
          {state.title}
        </h3>
        <p className="app-dialog__message">{state.message}</p>
        <form
          className="app-dialog__form"
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(value)
          }}
        >
          <input
            autoFocus
            type={state.inputType}
            className="app-dialog__input"
            placeholder={state.placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <div className="app-dialog__actions">
            <button type="submit" className="app-dialog__btn app-dialog__btn--primary">
              {state.confirmLabel}
            </button>
            <button type="button" className="app-dialog__btn app-dialog__btn--ghost" onClick={onCancel}>
              {state.cancelLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function useDialog() {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialog must be used within DialogProvider')
  return ctx
}
