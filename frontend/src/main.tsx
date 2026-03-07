import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { FeatureTogglesProvider } from './contexts/FeatureTogglesContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <FeatureTogglesProvider>
        <App />
      </FeatureTogglesProvider>
    </AuthProvider>
  </StrictMode>,
)
