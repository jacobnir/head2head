import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SiteGate } from './components/SiteGate'
import './styles/global.css'
import './styles/fx.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteGate>
      <App />
    </SiteGate>
  </StrictMode>,
)
