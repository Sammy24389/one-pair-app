import {ChevronRight, Image, Link2, ListChecks, Lock, Mail, MapPin, Palette, Plus, Radio, Settings2, Info} from 'lucide-react'
import {Donate} from '../components/Donate'
import {Avatar} from '../components/ui'
import {identity} from '../lib/identity'
import {push, type Sub} from '../lib/nav'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'

const Row = ({icon: Icon, title, sub, to}: {icon: typeof Image; title: string; sub?: string; to: Sub}) => (
  <button className="list-row" onClick={() => push(to)}>
    <span className="ico">
      <Icon size={18} />
    </span>
    <div className="grow">
      <div style={{fontWeight: 600}}>{title}</div>
      {sub && <div className="tiny muted">{sub}</div>}
    </div>
    <ChevronRight size={18} className="muted" />
  </button>
)

export default function More() {
  const space = useActiveSpace()
  useSpaceVersion(space)
  const me = identity.use(i => i.profile)
  if (!space) return null
  return (
    <div className="screen">
      <div className="topbar">
        <h1>More</h1>
      </div>
      <button className="card tap row" style={{width: '100%', textAlign: 'left'}} onClick={() => push('profile')}>
        <Avatar p={me} size={52} />
        <div className="grow">
          <h3>{me.name}</h3>
          <div className="small muted">Paired with {space.peerProfile().name}</div>
        </div>
        <ChevronRight size={18} className="muted" />
      </button>

      <div className="section">
        <div className="section-title">
          <h3>Together</h3>
        </div>
        <div className="card" style={{paddingTop: 4, paddingBottom: 4}}>
          <Row icon={Radio} title="Status" sub="Text, photos and videos from all paired users" to="status" />
          <Row icon={Mail} title="Groups" sub="Group chat, calls and multiplayer games" to="groups" />
          <Row icon={ListChecks} title="Shared lists" sub="Bucket list, watchlist, ideas, wishlist" to="lists" />
          <Row icon={Mail} title="Letters & love jar" sub="Open-when letters, time capsules" to="notes" />
          <Row icon={Image} title="Shared gallery" sub="Every photo and video you've sent" to="gallery" />
          <Row icon={Link2} title="Links" sub="Everything you've shared" to="links" />
          <Row icon={MapPin} title="Location" sub="Live location & distance" to="map" />
        </div>
      </div>

      <div className="section">
        <div className="section-title">
          <h3>App</h3>
        </div>
        <div className="card" style={{paddingTop: 4, paddingBottom: 4}}>
          <Row icon={Palette} title="Appearance" sub="Themes, accent, wallpaper" to="appearance" />
          <Row icon={Lock} title="Privacy & lock" sub="PIN, biometrics, auto-lock" to="security" />
          <Row icon={Radio} title="Connection" sub="STUN/TURN, wake-up pings" to="connection" />
          <Row icon={Settings2} title="Settings" sub={`${space.meta.get('mode') === 'couple' ? 'Couple' : 'Friends'} mode, nudges, chat, backup`} to="settings" />
          <Row icon={Plus} title="Add another pair" to="pair" />
          <Row icon={Info} title="About" to="about" />
        </div>
      </div>

      <div className="section">
        <Donate />
      </div>
    </div>
  )
}
