import {useMemo, useState} from 'react'
import {Camera, Image as ImageIcon} from 'lucide-react'
import {MediaImg, TopBar, Viewer} from '../components/ui'
import {compressImage, pickFiles} from '../lib/media'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import {parseDateKey, todayKey} from '../lib/util'

/** Locket/BeReal-inspired: one unfiltered photo each per day, building a shared visual diary. */
export default function PhotoOfDay() {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [view, setView] = useState<string | null>(null)
  const [caption, setCaption] = useState('')

  const data = useMemo(() => {
    if (!space) return null
    const byDay = new Map<string, Record<string, string>>()
    for (const [k, p] of space.photos.entries()) {
      const [day, dev] = k.split('|')
      byDay.set(day, {...(byDay.get(day) ?? {}), [dev]: p.mediaId})
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [space, v])

  if (!space || !data) return null
  const today = todayKey()
  const mine = space.photos.get(`${today}|${space.me}`)
  const theirs = space.photos.get(`${today}|${space.peer}`)
  const peer = space.peerProfile()

  const share = async (capture: boolean) => {
    const [f] = await pickFiles('image/*', false, capture ? 'environment' : undefined)
    if (!f) return
    const {blob} = await compressImage(f, 1440)
    const mediaId = await space.addMedia(blob)
    space.photos.set(`${today}|${space.me}`, {mediaId, ts: Date.now(), caption: caption.trim() || undefined, from: space.me})
    setCaption('')
  }

  return (
    <div className="screen full">
      <TopBar title="Photo of the day" sub="One moment each, every day" />
      <div className="grid2">
        <div className="card tight col" style={{gap: 8}}>
          <span className="small muted">You</span>
          {mine ? (
            <MediaImg id={mine.mediaId} style={{aspectRatio: '3/4', objectFit: 'cover', borderRadius: 14, width: '100%'}} onClick={() => setView(mine.mediaId)} />
          ) : (
            <div className="col" style={{aspectRatio: '3/4', justifyContent: 'center', gap: 8}}>
              <input className="input" placeholder="Caption" value={caption} onChange={e => setCaption(e.target.value)} maxLength={60} />
              <button className="btn sm" onClick={() => share(true)}>
                <Camera size={16} /> Snap
              </button>
              <button className="btn sm ghost" onClick={() => share(false)}>
                <ImageIcon size={16} /> Pick
              </button>
            </div>
          )}
          {mine?.caption && <div className="tiny">{mine.caption}</div>}
        </div>
        <div className="card tight col" style={{gap: 8}}>
          <span className="small muted">{peer.name}</span>
          {theirs ? (
            <MediaImg id={theirs.mediaId} style={{aspectRatio: '3/4', objectFit: 'cover', borderRadius: 14, width: '100%', filter: mine ? undefined : 'blur(18px)'}} onClick={() => mine && setView(theirs.mediaId)} />
          ) : (
            <div className="muted small center" style={{aspectRatio: '3/4', display: 'grid', placeItems: 'center'}}>
              Not yet today
            </div>
          )}
          {theirs && !mine && <div className="tiny muted">Share yours to unblur</div>}
          {theirs?.caption && mine && <div className="tiny">{theirs.caption}</div>}
        </div>
      </div>

      {data.filter(([d]) => d !== today).length > 0 && (
        <div className="section">
          <div className="section-title">
            <h3>Your diary</h3>
          </div>
          {data
            .filter(([d]) => d !== today)
            .map(([day, devs]) => (
              <div key={day} style={{marginBottom: 14}}>
                <div className="tiny muted" style={{margin: '0 4px 6px'}}>
                  {parseDateKey(day).toLocaleDateString([], {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'})}
                </div>
                <div className="grid2">
                  {[space.me, space.peer].map(d =>
                    devs[d] ? (
                      <MediaImg key={d} id={devs[d]} style={{aspectRatio: '1', objectFit: 'cover', borderRadius: 14, width: '100%'}} onClick={() => setView(devs[d])} />
                    ) : (
                      <div key={d} style={{aspectRatio: '1', borderRadius: 14, background: 'var(--surface-2)'}} />
                    )
                  )}
                </div>
              </div>
            ))}
        </div>
      )}
      {view && <Viewer id={view} onClose={() => setView(null)} />}
    </div>
  )
}
