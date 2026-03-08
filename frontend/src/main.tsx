import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FeatureTogglesProvider } from './contexts/FeatureTogglesContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FeatureTogglesProvider>
      <App />
    </FeatureTogglesProvider>
  </StrictMode>,
)
