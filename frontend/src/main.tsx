import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './fonts'
import './index.scss'
import './setupSonnerErrorCopy'
import './i18n/config'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
