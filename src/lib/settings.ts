import {createStore} from './store'

export type ThemeName = 'material' | 'glass' | 'neumorph' | 'amoled' | 'paper' | 'aurora'
export type Scheme = 'system' | 'light' | 'dark'
export type WallpaperKind = 'none' | 'gradient' | 'daily' | 'custom' | 'shared'
export type LockMode = 'off' | 'pin' | 'bio'
export type NudgeLevel = 'off' | 'gentle' | 'balanced'

export type IceServer = {urls: string; username?: string; credential?: string}

export type Settings = {
  theme: ThemeName
  scheme: Scheme
  accent: string
  wallpaper: WallpaperKind
  wallpaperValue: string // gradient id or media id
  wallpaperDim: number // 0..0.8
  wallpaperBlur: number // px
  // security
  lockMode: LockMode
  pinHash: string
  pinSalt: string
  pinLength: number
  autoLockSec: number
  privacyBlur: boolean
  bioCredentialId: string // WebAuthn credential (web builds)
  // nudges
  nudgeLevel: NudgeLevel
  quietStart: number // hour 0-23
  quietEnd: number
  // connectivity
  useCommunityTurn: boolean
  customIce: IceServer[]
  ntfyEnabled: boolean
  keepAlive: boolean // Android: foreground service so messages & calls arrive while in background
  ntfyServer: string
  // misc
  haptics: boolean
  sounds: boolean
  enterToSend: boolean
  reduceMotion: boolean
  activePairId: string
  startTab: 'home' | 'chat' | 'moments' | 'play' // page the app opens on
}

export const ACCENTS = ['#e8577e', '#ff7a59', '#f5b031', '#3fbf7f', '#1fb5c9', '#4c7dff', '#7c5cff', '#c05bd6']

export const settings = createStore<Settings>(
  {
    theme: 'glass',
    scheme: 'system',
    accent: ACCENTS[0],
    wallpaper: 'gradient',
    wallpaperValue: 'dusk',
    wallpaperDim: 0.25,
    wallpaperBlur: 0,
    lockMode: 'off',
    pinHash: '',
    pinSalt: '',
    pinLength: 4,
    autoLockSec: 30,
    privacyBlur: true,
    bioCredentialId: '',
    nudgeLevel: 'gentle',
    quietStart: 22,
    quietEnd: 8,
    useCommunityTurn: true,
    customIce: [],
    ntfyEnabled: false,
    keepAlive: true,
    ntfyServer: 'https://ntfy.sh',
    haptics: true,
    sounds: true,
    enterToSend: false,
    reduceMotion: false,
    activePairId: '',
    startTab: 'home'
  },
  'onepair.settings'
)

export const STUN_SERVERS: IceServer[] = [
  {urls: 'stun:stun.l.google.com:19302'},
  {urls: 'stun:stun1.l.google.com:19302'},
  {urls: 'stun:stun.cloudflare.com:3478'},
  {urls: 'stun:global.stun.twilio.com:3478'}
]

// Public community relay (Open Relay Project). Free and rate-limited – add your own TURN for reliability.
export const COMMUNITY_TURN: IceServer[] = [
  {urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject'},
  {urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject'},
  {urls: 'turns:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject'}
]

// Migrate the retired "biometric + PIN" mode to biometric (which always has PIN as fallback).
if ((settings.get().lockMode as string) === 'both') settings.set({lockMode: 'bio'})

export const iceServers = (): IceServer[] => {
  const s = settings.get()
  return [...STUN_SERVERS, ...s.customIce, ...(s.useCommunityTurn ? COMMUNITY_TURN : [])]
}
