import {useId, useMemo, useState} from 'react'
import data from '../lib/emoji-data.json'
import '../styles/emoji-picker.css'

const PAGE_SIZE = 120
const ICONS = ['😀','👋','🏽','🐻','🍎','🚗','⚽','💡','❤️','🏳️']

export default function EmojiPicker({onEmoji, disabled = false}: {onEmoji: (emoji: string) => void; disabled?: boolean}) {
  const id = useId()
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('0')
  const [limit, setLimit] = useState(PAGE_SIZE)
  const matches = useMemo(() => {
    const terms = search.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
    return data.entries.filter(([emoji, name, group]) => terms.length
      ? terms.every(term => `${emoji} ${name}`.toLocaleLowerCase().includes(term))
      : category === 'all' || group === Number(category))
  }, [search, category])

  return <div className="emoji-browser">
    <label htmlFor={`${id}-search`}>Search emoji</label>
    <input id={`${id}-search`} type="search" value={search} maxLength={100} placeholder="Try heart, flag or skin tone"
      onChange={event => {setSearch(event.target.value); setLimit(PAGE_SIZE)}} />
    <div className="emoji-categories" role="tablist" aria-label="Emoji categories">
      {['All emoji', ...data.groups].map((group, index) => {
        const value = index ? String(index - 1) : 'all'
        return <button type="button" role="tab" key={value} aria-label={group} title={group} aria-selected={(search.trim() ? 'all' : category) === value} tabIndex={(search.trim() ? 'all' : category) === value ? 0 : -1}
          onClick={() => {setCategory(value); setSearch(''); setLimit(PAGE_SIZE)}}
          onKeyDown={event => {
            if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return
            event.preventDefault()
            const buttons = event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>('button')
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length
            buttons[next].focus(); buttons[next].click()
          }}>{index ? ICONS[index - 1] : '✦'}</button>
      })}
    </div>
    <p className="tiny muted" role="status">{matches.length ? `${Math.min(limit, matches.length)} of ${matches.length} emoji` : 'No emoji found. Try another name.'}</p>
    <div className="emoji-results" aria-label="Emoji results">
      {matches.slice(0, limit).map(([emoji, name]) => <button type="button" key={emoji} title={String(name)} aria-label={`Send ${name}`}
        disabled={disabled} onClick={() => onEmoji(String(emoji))}>{emoji}</button>)}
    </div>
    {matches.length > limit && <button type="button" className="btn ghost block" onClick={() => setLimit(value => value + PAGE_SIZE)}>Show more emoji</button>}
    <p className="tiny muted">Emoji 17.0 · Appearance depends on your device. <a href={`${import.meta.env.BASE_URL}licenses/unicode.txt`} target="_blank" rel="noreferrer">Unicode license</a></p>
  </div>
}
