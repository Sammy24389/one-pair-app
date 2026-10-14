import {useMemo, useState} from 'react'
import {ExternalLink, Play} from 'lucide-react'
import {Empty, MediaImg, TopBar, Viewer} from '../components/ui'
import {useActiveSpace, useSpaceVersion} from '../lib/spaces'
import type {Msg} from '../lib/types'
import {fmtDay, URL_RE} from '../lib/util'

export default function Gallery({page}: {page: 'gallery' | 'links'}) {
  const space = useActiveSpace()
  const v = useSpaceVersion(space)
  const [view, setView] = useState<Msg | null>(null)
  const [q, setQ] = useState('')

  const {media, links} = useMemo(() => {
    if (!space) return {media: [], links: []}
    const media: Msg[] = []
    const links: {url: string; m: Msg}[] = []
    for (const m of space.messages) {
      if (space.deleted.get(m.id)) continue
      if ((m.kind === 'image' || m.kind === 'video') && m.mediaId) media.push(m)
      if (m.kind === 'text' && m.text) for (const u of m.text.matchAll(URL_RE)) links.push({url: u[0], m})
    }
    return {media: media.reverse(), links: links.reverse()}
  }, [space, v])

  if (!space) return null

  if (page === 'links') {
    const filtered = links.filter(l => !q || l.url.toLowerCase().includes(q.toLowerCase()) || l.m.text?.toLowerCase().includes(q.toLowerCase()))
    return (
      <div className="screen full">
        <TopBar title="Links" sub={`${links.length} shared`} />
        <input className="input" placeholder="Search links" value={q} onChange={e => setQ(e.target.value)} />
        <div className="card" style={{marginTop: 14, paddingTop: 4, paddingBottom: 4}}>
          {filtered.length === 0 ? (
            <Empty emoji="🔗" title="No links yet">Links you send in chat are collected here.</Empty>
          ) : (
            filtered.map(({url, m}, i) => {
              let host = url
              try {
                host = new URL(url).hostname.replace(/^www\./, '')
              } catch {
                /* raw */
              }
              return (
                <a key={i} className="list-row" href={url} target="_blank" rel="noopener noreferrer" style={{color: 'inherit', textDecoration: 'none'}}>
                  <span className="ico" style={{fontWeight: 800}}>{host[0]?.toUpperCase()}</span>
                  <div className="grow" style={{minWidth: 0}}>
                    <div className="ellipsis" style={{fontWeight: 600}}>{host}</div>
                    <div className="tiny muted ellipsis">
                      {m.from === space.me ? 'You' : space.peerProfile().name} · {fmtDay(m.ts)}
                    </div>
                  </div>
                  <ExternalLink size={16} className="muted" />
                </a>
              )
            })
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="screen full">
      <TopBar title="Shared gallery" sub={`${media.length} photos & videos`} />
      {media.length === 0 ? (
        <div className="card">
          <Empty emoji="🖼️" title="No photos yet">Photos and videos you share in chat appear here.</Empty>
        </div>
      ) : (
        <div className="gallery">
          {media.map(m => (
            <button key={m.id} className="cell" onClick={() => setView(m)}>
              {m.kind === 'image' ? (
                <MediaImg id={m.mediaId!} />
              ) : (
                <div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center', background: 'var(--surface-2)'}}>
                  <Play />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
      {view?.mediaId && <Viewer id={view.mediaId} mime={view.mime} onClose={() => setView(null)} />}
    </div>
  )
}
