import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { DialogProvider } from './components/ui/DialogProvider'
import ErrorBoundary from './components/ErrorBoundary'
import './styles/style.css'
import './styles/toaster.css'

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <AuthProvider>
        <DialogProvider>
          <App />
          <Toaster
            position="top-center"
            closeButton
            className="mb-toaster"
            toastOptions={{
              duration: 3500,
              classNames: {
                toast: 'mb-toast',
                title: 'mb-toast__title',
                description: 'mb-toast__desc',
                actionButton: 'mb-toast__action',
                cancelButton: 'mb-toast__cancel',
                closeButton: 'mb-toast__close',
                success: 'mb-toast--success',
                error: 'mb-toast--error',
                warning: 'mb-toast--warning',
                info: 'mb-toast--info',
              },
            }}
          />
        </DialogProvider>
      </AuthProvider>
    </BrowserRouter>
  </ErrorBoundary>,
)
