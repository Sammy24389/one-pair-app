import {useRef, useState} from 'react'
import {useMediaUrl} from './ui'
import {getMedia} from '../lib/idb'
import {addSticker} from '../lib/stickers'

export default function StickerMessage({mediaId, name = 'Sticker'}: {mediaId: string; name?: string}) {
  const url = useMediaUrl(mediaId)
  const pending = useRef(false)
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  return <div className="received-sticker">
    {url ? <img className="sticker-message" src={url} alt={name} loading="lazy" decoding="async" /> : <div className="sticker-message" role="status">Waiting for sticker…</div>}
    <button className="sticker-save" disabled={!url || state !== 'idle'} onPointerDown={event => event.stopPropagation()} onClick={async event => {
      event.stopPropagation()
      if (pending.current) return
      pending.current = true
      setState('saving'); setError('')
      try {
        const media = await getMedia(mediaId)
        if (!media) throw new Error('Wait for the sticker to finish downloading.')
        await addSticker(media.blob, name)
        setState('saved')
      } catch (cause) {setError(cause instanceof Error ? cause.message : 'Could not save sticker.'); setState('idle')}
      finally {pending.current = false}
    }}>{state === 'saved' ? 'Saved to stickers' : state === 'saving' ? 'Saving…' : 'Add to stickers'}</button>
    {state === 'saved' && <span className="tiny" role="status">Available in your Stickers tab</span>}
    {error && <span className="small sticker-error" role="alert">{error}</span>}
  </div>
}
