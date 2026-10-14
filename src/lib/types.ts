import type {Mode, Profile} from './identity'

export type MsgKind = 'text' | 'image' | 'video' | 'audio' | 'file' | 'location' | 'touch' | 'call' | 'sticker' | 'system'

export type Msg = {
  id: string
  from: string
  ts: number
  kind: MsgKind
  text?: string
  mediaId?: string
  mime?: string
  name?: string
  size?: number
  dur?: number
  w?: number
  h?: number
  lat?: number
  lng?: number
  replyTo?: string
  call?: {video: boolean; dur: number; missed: boolean}
}

export type DayKind = 'anniversary' | 'birthday' | 'countdown' | 'memory' | 'custom'

export type SpecialDay = {
  id: string
  title: string
  date: string // YYYY-MM-DD
  kind: DayKind
  yearly: boolean
  emoji: string
  note?: string
  mediaId?: string
  by: string
  ts: number
}

export type ListName = 'bucket' | 'watch' | 'ideas' | 'wish' | 'places'

export type ListItem = {id: string; list: ListName; text: string; done: boolean; by: string; ts: number; doneTs?: number}

export type Note = {
  id: string
  from: string
  text: string
  ts: number
  kind: 'jar' | 'openwhen' | 'capsule'
  title?: string // "Open when you miss me"
  revealAt?: number
  opened?: number
}

export type Mood = {emoji: string; label: string; note?: string; ts: number}

export type DailyEntry = {q: string; answers: Record<string, {text: string; ts: number}>}

export type DailyPhoto = {mediaId: string; ts: number; caption?: string; from: string}

export type Loc = {lat: number; lng: number; acc: number; ts: number; sharing: boolean; label?: string}

export type Stroke = {id: string; by: string; color: string; size: number; pts: number[]}

export type Presence = {
  status?: string
  battery?: number
  charging?: boolean
  tz?: string
  visible?: boolean
}

export type SpaceMeta = {
  mode?: Mode
  since?: string
  wallpaper?: string
  title?: string
}

export type {Profile, Mode}
