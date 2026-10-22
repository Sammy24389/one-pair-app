import {Download, Smartphone, X} from 'lucide-react'
import {dismissInstall, installPwa, isIosBrowser, openInstallHelp, pwaInstall} from '../lib/pwa-install'
import '../styles/install-prompt.css'

export function InstallSettingsRow() {
  const state = pwaInstall.use()
  if (state.installed) return null
  return <div className="list-row"><div className="grow"><strong>Install OnePair</strong><p className="tiny muted">Add an app icon to your home screen or desktop.</p></div><button className="btn ghost" style={{minHeight: 44}} onClick={openInstallHelp}>Install app</button></div>
}

export default function InstallPrompt({suppressed = false}: {suppressed?: boolean}) {
  const state = pwaInstall.use()
  if (suppressed || state.installed || (state.dismissed && !state.expanded)) return null
  const ios = isIosBrowser()
  return <aside className="install-prompt" aria-label="Install OnePair">
    <div className="install-prompt-heading"><Smartphone size={25} aria-hidden="true" /><div><strong>Keep OnePair close</strong><p>Install for a home-screen icon and an app window.</p></div><button className="icon-btn" aria-label="Dismiss install suggestion" onClick={dismissInstall}><X size={20} /></button></div>
    {state.expanded && <div className="install-instructions">
      {ios ? <ol><li>Open this page in Safari.</li><li>Tap Share, then Add to Home Screen (you may need to scroll).</li><li>Confirm the name and tap Add. Open OnePair from its new icon.</li></ol> : <p>Open your browser menu and choose <strong>Install OnePair</strong>, <strong>Install app</strong>, or <strong>Add to Home screen</strong>. On Safari for Mac, use File → Add to Dock. If the option is missing, try Chrome or Edge on desktop or Android.</p>}
      <p className="tiny muted">Installation is optional. Your existing browser data stays on this device; another browser or device has separate data. Installation does not guarantee delivery when the app is closed.</p>
    </div>}
    {state.message && <p role="status">{state.message}</p>}
    <div className="install-prompt-actions">{(!state.expanded || state.available) && <button className="btn" disabled={state.busy} onClick={() => void installPwa()}><Download size={17} />{state.busy ? 'Opening installer…' : state.available ? 'Install OnePair' : 'How to install'}</button>}<button className="btn ghost" disabled={state.busy} onClick={dismissInstall}>Continue in browser</button></div>
  </aside>
}
