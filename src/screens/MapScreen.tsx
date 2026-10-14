import {useEffect, useRef} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {Navigation, Send} from 'lucide-react'
import {Switch, TopBar} from '../components/ui'
import {fmtDistance, getPosition, liveShare, startLiveShare, stopLiveShare} from '../lib/location'
import {toast} from '../lib/notify'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import {fmtAgo, haversineKm} from '../lib/util'
import type {Profile} from '../lib/identity'

const pin = (p: Profile) =>
  L.divIcon({
    className: '',
    html: `<div class="map-pin">${p.avatar ? `<img src="${p.avatar}" style="width:100%;height:100%;border-radius:50%;object-fit:cover"/>` : p.emoji}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22]
  })

export default function MapScreen() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const active = liveShare.use(s => (space ? !!s.active[space.pair.id] : false))
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const layer = useRef<L.LayerGroup | null>(null)
  const fitted = useRef(false)

  useEffect(() => {
    if (!el.current || map.current) return
    map.current = L.map(el.current, {zoomControl: false, attributionControl: true}).setView([20, 0], 2)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(map.current)
    layer.current = L.layerGroup().addTo(map.current)
    // The screen animates in; recompute size once layout settles so tiles fill the container.
    const t = setTimeout(() => map.current?.invalidateSize(), 350)
    return () => {
      clearTimeout(t)
      map.current?.remove()
      map.current = null
    }
  }, [])

  const me = space?.locations.get(space.me)
  const peer = space?.locations.get(space.peer)

  useEffect(() => {
    if (!space || !layer.current || !map.current) return
    layer.current.clearLayers()
    const pts: L.LatLngExpression[] = []
    if (me) {
      L.marker([me.lat, me.lng], {icon: pin(space.myProfile())}).addTo(layer.current)
      pts.push([me.lat, me.lng])
    }
    if (peer?.sharing) {
      L.marker([peer.lat, peer.lng], {icon: pin(space.peerProfile())}).addTo(layer.current)
      L.circle([peer.lat, peer.lng], {radius: peer.acc, weight: 0, fillOpacity: 0.12}).addTo(layer.current)
      pts.push([peer.lat, peer.lng])
    }
    if (pts.length === 2) L.polyline(pts, {dashArray: '6 8', weight: 2, color: getComputedStyle(document.documentElement).getPropertyValue('--accent')}).addTo(layer.current)
    if (pts.length && !fitted.current) {
      fitted.current = true
      if (pts.length === 1) map.current.setView(pts[0], 14)
      else map.current.fitBounds(L.latLngBounds(pts), {padding: [60, 60]})
    }
  }, [space, v, me, peer])

  if (!space) return null
  const peerName = space.peerProfile().name
  const dist = me && peer?.sharing ? haversineKm(me, peer) : null

  return (
    <div className="screen full">
      <TopBar title="Location" sub={dist !== null ? `${fmtDistance(dist)} apart` : 'Share where you are, only with each other'} />
      <div ref={el} className="map" />
      <div className="card" style={{marginTop: 14}}>
        <div className="row between">
          <div>
            <h3>Share my live location</h3>
            <div className="tiny muted">Updates while OnePair is open. Only {peerName} can see it.</div>
          </div>
          <Switch checked={active} onChange={on => (on ? startLiveShare(space).catch(e => toast({title: 'Location error', body: String(e)})) : stopLiveShare(space))} />
        </div>
        <div className="list-row" style={{marginTop: 6}}>
          <span className="ico">
            <Navigation size={18} />
          </span>
          <div className="grow">
            <div style={{fontWeight: 600}}>{peerName}</div>
            <div className="tiny muted">{peer?.sharing ? `Updated ${fmtAgo(peer.ts)} · ±${Math.round(peer.acc)} m` : 'Not sharing right now'}</div>
          </div>
          {peer?.sharing && (
            <a className="btn sm ghost" href={`https://www.openstreetmap.org/directions?route=${me ? `${me.lat},${me.lng}` : ''};${peer.lat},${peer.lng}`} target="_blank" rel="noopener noreferrer">
              Directions
            </a>
          )}
        </div>
      </div>
      <button
        className="btn block ghost"
        style={{marginTop: 14}}
        onClick={async () => {
          try {
            const p = await getPosition()
            space.addMessage({kind: 'location', lat: p.lat, lng: p.lng, text: 'My location'})
            toast({title: 'Location sent', icon: '📍'})
          } catch (e) {
            toast({title: 'Location unavailable', body: (e as Error).message})
          }
        }}
      >
        <Send size={18} /> Send current location once
      </button>
    </div>
  )
}
