import {useState} from 'react'
import {Camera, Lock, Radio, Sparkles} from 'lucide-react'
import {Avatar, EmojiPicker, StartPagePicker} from '../components/ui'
import {identity, type Mode} from '../lib/identity'
import {avatarFromFile, pickFiles} from '../lib/media'

const FEATURES = [
  {icon: Radio, title: 'Truly peer-to-peer', body: 'Chats and calls travel between connected devices. No accounts; your history is stored locally.'},
  {icon: Lock, title: 'Private by design', body: 'Encrypted peer connections, optional app locking, and no central chat-history database.'},
  {icon: Sparkles, title: 'Pairs and small groups', body: 'Daily questions and shared memories for pairs, plus games and calls in rooms for up to four.'}
]

export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(identity.get().profile.name)
  const [emoji, setEmoji] = useState(identity.get().profile.emoji)
  const [avatar, setAvatar] = useState<string | undefined>(identity.get().profile.avatar)
  const [mode, setMode] = useState<Mode>(identity.get().defaultMode)

  if (step === 0)
    return (
      <div className="onb">
        <div className="logo">💞</div>
        <div className="center">
          <h1>OnePair</h1>
          <p className="muted">A private little world for you and your people.</p>
        </div>
        <div className="card col" style={{gap: 16}}>
          {FEATURES.map(f => (
            <div key={f.title} className="row" style={{alignItems: 'flex-start', gap: 14}}>
              <div className="list-row" style={{padding: 0, minHeight: 0, width: 'auto'}}>
                <span className="ico">
                  <f.icon size={18} />
                </span>
              </div>
              <div>
                <h3>{f.title}</h3>
                <div className="small muted">{f.body}</div>
              </div>
            </div>
          ))}
        </div>
        <button className="btn block" onClick={() => setStep(1)}>
          Get started
        </button>
      </div>
    )

  if (step === 1)
    return (
      <div className="onb">
        <div className="center">
          <h1>Who is OnePair for?</h1>
          <p className="muted">This shapes questions, games and little touches. You can change it any time.</p>
        </div>
        <div className="mode-pick big">
          <button className={mode === 'friends' ? 'on' : ''} onClick={() => setMode('friends')}>
            <span className="e">🤝</span>
            Best friends
            <span className="small muted">Inside jokes, hangouts, friendiversaries</span>
          </button>
          <button className={mode === 'couple' ? 'on' : ''} onClick={() => setMode('couple')}>
            <span className="e">💞</span>
            Couple
            <span className="small muted">Anniversaries, love notes, date nights</span>
          </button>
        </div>
        <div className="card col" style={{gap: 10}}>
          <h3>Open the app on</h3>
          <StartPagePicker />
          <span className="tiny muted">The tab bar at the bottom always takes you to the other pages.</span>
        </div>
        <button className="btn block" onClick={() => (identity.set({defaultMode: mode}), setStep(2))}>
          Continue
        </button>
      </div>
    )

  return (
    <div className="onb">
      <div className="center col" style={{alignItems: 'center'}}>
        <button
          onClick={async () => {
            const [f] = await pickFiles('image/*')
            if (f) setAvatar(await avatarFromFile(f))
          }}
          style={{position: 'relative'}}
          aria-label="Choose photo"
        >
          <Avatar p={{name, emoji, avatar}} size={96} />
          <span className="icon-btn accent" style={{position: 'absolute', right: -4, bottom: -4, width: 34, height: 34}}>
            <Camera size={16} />
          </span>
        </button>
        <h2>What should your pair call you?</h2>
      </div>
      <label className="label" htmlFor="onboard-name">Your name</label>
      <input id="onboard-name" className="input" placeholder="Your name" value={name} maxLength={32} onChange={e => setName(e.target.value)} autoFocus />
      <div className="card tight">
        <EmojiPicker value={emoji} onChange={e => (setEmoji(e), setAvatar(undefined))} />
      </div>
      <button
        className="btn block"
        disabled={!name.trim()}
        onClick={() => identity.set({profile: {name: name.trim(), emoji, avatar}, onboarded: true})}
      >
        Continue
      </button>
      <p className="tiny muted center">No sign-up. No email. Your identity lives only on this device.</p>
    </div>
  )
}
