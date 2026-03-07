import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './contexts/AuthContext'
import { DocumentChannelsProvider } from './contexts/DocumentChannelsContext'
import { FeatureTogglesProvider } from './contexts/FeatureTogglesContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <FeatureTogglesProvider>
        <DocumentChannelsProvider>
          <App />
        </DocumentChannelsProvider>
      </FeatureTogglesProvider>
    </AuthProvider>
  </StrictMode>,
)
