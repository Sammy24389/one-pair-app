import {registerPlugin, type PluginListenerHandle} from '@capacitor/core'
import {isNative} from './platform'

/** Bridge to android/app/src/main/java/app/onepair/p2p/OnePairNativePlugin.java */
type OnePairNative = {
  show(o: {id: number; title: string; body: string; route?: string}): Promise<void>
  showCall(o: {name: string; video: boolean}): Promise<void>
  cancelCall(): Promise<void>
  clearMessages(): Promise<void>
  startKeepAlive(o?: {callAudio?: boolean; callVideo?: boolean}): Promise<void>
  stopKeepAlive(): Promise<void>
  batteryStatus(): Promise<{unrestricted: boolean; serviceRunning: boolean}>
  requestBatteryExemption(): Promise<void>
  /** Opens the system "Save as" picker; `data` is base64. */
  saveFile(o: {name: string; mime: string; data: string}): Promise<{saved: boolean}>
  addListener(event: 'callAction', fn: (e: {action: 'answer' | 'decline' | 'show'}) => void): Promise<PluginListenerHandle>
  addListener(event: 'openRoute', fn: (e: {route: string}) => void): Promise<PluginListenerHandle>
}

const plugin = registerPlugin<OnePairNative>('OnePairNative')

/** null on web, where these native capabilities don't exist. */
export const nativeBridge: OnePairNative | null = isNative ? plugin : null
