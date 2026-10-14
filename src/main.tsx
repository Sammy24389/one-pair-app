import {StrictMode} from 'react'
import {createRoot} from 'react-dom/client'
import './styles/app.css'
import App from './App'
import {bootstrap} from './boot'
import {settings} from './lib/settings'

// Apply the saved theme before the first paint so there's no light flash while React mounts.
{
  const s = settings.get()
  const el = document.documentElement
  el.dataset.theme = s.theme
  const dark = s.theme === 'amoled' || s.theme === 'aurora' || s.scheme === 'dark' || (s.scheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  if (dark) el.dataset.dark = ''
  el.style.setProperty('--accent', s.accent)
}

bootstrap()

// Dev builds only: lets the e2e suite fire a deep link exactly like a notification tap would.
if (import.meta.env.DEV) import('./lib/nav').then(({openRoute}) => Object.assign(window, {__onepairOpenRoute: openRoute}))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
