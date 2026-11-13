import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './index.scss'
import { ensureA2uiPlatformStyles } from './a2uiPlatform'
import './setupSonnerErrorCopy'
import './i18n/config'
import App from './App.tsx'
import { applyInitialTheme } from './theme'

ensureA2uiPlatformStyles()
applyInitialTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
