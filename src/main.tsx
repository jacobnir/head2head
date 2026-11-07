import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { SiteGate } from './components/SiteGate'
import './styles/global.css'
import { loadLivePlayers } from './roster'
import './styles/fx.css'

// The hosted copy merges players added on the site into the roster BEFORE the first
// render, so saved picks and leagues that include them resolve. Capped at 3s; after that
// it renders the built-in roster rather than keep anyone waiting.
const ready = import.meta.env.PROD ? loadLivePlayers() : Promise.resolve()

void ready.then(() => createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SiteGate>
      <App />
    </SiteGate>
  </StrictMode>,
))
