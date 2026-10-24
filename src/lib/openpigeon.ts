import {registerPlugin,type PluginListenerHandle} from '@capacitor/core'
import {createStore} from './store'
import {isNative,platform,onAppVisibility,isAppHidden} from './platform'
import {groupEvents,groupRegistry,getGroup,onOpenPigeonMessage,hasGroupCall,groupRecoveryTargets,type PeerGroup} from './groups'
import {normalizeOpenPigeonMessage,openPigeonParticipants,openPigeonSessionActive,OPENPIGEON_MATCH_MS,type OpenPigeonMessage,type OpenPigeonSession} from './openpigeon-protocol'
import {idbGet,idbUpdate} from './idb'
import {identity} from './identity'
import {nativeBridge} from './native'
import {lockState} from './security'
import {notifyNow,toast} from './notify'
import {openRoute} from './nav'
import {settings} from './settings'
export type {OpenPigeonMessage,OpenPigeonSession} from './openpigeon-protocol'

type NativeMessage={requestId:string;roomId:string;participants:string[];message:OpenPigeonMessage}
type NativeState={connected:boolean;locked:boolean;error?:string}
type OpenPigeonPlugin={
 status():Promise<{installed:boolean;version:string}>
 openPicker(o:{roomId:string;participants:string[]}):Promise<void>
 openGame(o:{roomId:string;participants:string[];message:OpenPigeonMessage}):Promise<void>
 syncMessage(o:{roomId:string;participants:string[];message:OpenPigeonMessage}):Promise<void>
 acknowledge(o:{requestId:string;success:boolean;error?:string}):Promise<void>
 close():Promise<void>
 addListener(event:'message',listener:(value:NativeMessage)=>void):Promise<PluginListenerHandle>
 addListener(event:'state',listener:(value:NativeState)=>void):Promise<PluginListenerHandle>
}
const supported=isNative&&platform==='android'
const bridge=supported?registerPlugin<OpenPigeonPlugin>('OpenPigeon'):null
export const openPigeonState=createStore({supported,installed:false,version:'',connected:false,locked:false,loading:false,error:''})
type Pending=NativeMessage&{at:number}
const OUTBOX='openpigeon.outbox.v1',MAX_PENDING=8
let initializing:Promise<void>|null=null,draining:Promise<void>|null=null
let listeners:PluginListenerHandle[]=[],unsubscribe:(()=>void)[]=[],retry:ReturnType<typeof setTimeout>|undefined
let attempts=0,activeRoom:string|null=null,startedKeepAlive=false,stopped=false
const failure=(e:unknown)=>openPigeonState.set({error:e instanceof Error?e.message:'OpenPigeon could not complete the request.'})
const room=(id:string)=>{const record=groupRegistry.get().records.find(r=>r.id===id);return record?getGroup(record):null}
function bounded<T>(promise:Promise<T>,ms=15000):Promise<T>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('OpenPigeon did not respond. Return to Padi and retry.')),ms);promise.then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)})})}
function pendingList(value:unknown):Pending[]{
 if(!Array.isArray(value))return []
 return value.flatMap((v):Pending[]=>{
  if(!v||typeof v.requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(v.requestId)||typeof v.roomId!=='string'||!/^[a-zA-Z0-9_-]{8,100}$/.test(v.roomId)||!openPigeonParticipants(v.participants)||!Number.isFinite(v.at)||v.at>Date.now()+300000||Date.now()-v.at>=OPENPIGEON_MATCH_MS)return []
  const message=normalizeOpenPigeonMessage(v.message)
  return message?[{requestId:v.requestId,roomId:v.roomId,participants:[...v.participants],message,at:v.at}]:[]
 }).slice(-MAX_PENDING)
}
async function removePending(id:string){await idbUpdate<Pending[]>('kv',OUTBOX,current=>pendingList(current).filter(p=>p.requestId!==id))}
async function acknowledge(requestId:string,success:boolean,error?:string){try{await bounded(bridge!.acknowledge({requestId,success,...(error?{error}:{})}),5000)}catch{if(success)failure(new Error('Turn saved. Return to Padi and reopen the match to continue.'))}}
async function queueMessage(value:NativeMessage){
 if(!bridge||stopped)return
 const message=normalizeOpenPigeonMessage(value?.message),requestId=value?.requestId
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))return
 if(!message||!openPigeonParticipants(value.participants)||!value.participants.includes(identity.get().deviceId)||!room(value.roomId)){await acknowledge(requestId,false,'This game room or message is no longer available.');failure(new Error('OpenPigeon returned an invalid or unavailable game session.'));return}
 try{
  await idbUpdate<Pending[]>('kv',OUTBOX,current=>{
   const pending=pendingList(current),existing=pending.find(p=>p.requestId===requestId)
   if(existing){if(existing.roomId!==value.roomId||JSON.stringify(existing.participants)!==JSON.stringify(value.participants)||JSON.stringify(existing.message)!==JSON.stringify(message))throw new Error('Conflicting OpenPigeon update. Reopen the match.');return pending}
   if(pending.length>=MAX_PENDING)throw new Error('Too many unconfirmed game turns. Reconnect before starting another game.')
   return [...pending,{requestId,roomId:value.roomId,participants:[...value.participants],message,at:Date.now()}]
  })
  attempts=0;await drain()
 }catch(e){failure(e);await acknowledge(requestId,false,e instanceof Error?e.message:'Could not save this game turn.')}
}
function scheduleRetry(){if(stopped||retry||attempts>=3)return;const delay=[1000,3000,10000][attempts++];retry=setTimeout(()=>{retry=undefined;void drain().catch(failure)},delay)}
function drain():Promise<void>{
 if(!bridge||stopped)return Promise.resolve()
 if(draining)return draining
 const task=(async()=>{
  const attempted=new Set<string>()
  while(!stopped){
   const pending=pendingList(await idbGet<Pending[]>('kv',OUTBOX)),next=pending.find(p=>!attempted.has(p.requestId))
   if(!next)break
   attempted.add(next.requestId)
   const group=room(next.roomId)
   if(!group){await removePending(next.requestId);await acknowledge(next.requestId,false,'This room has been removed.');continue}
   if(!group.openPigeonReady(next.participants)){failure(new Error('Game turn saved on this device. Reconnect all selected players to send it.'));scheduleRetry();continue}
   try{await group.openPigeonMessage(next.participants,next.message);await removePending(next.requestId);await acknowledge(next.requestId,true);openPigeonState.set({error:''})}
   catch(e){failure(e);await acknowledge(next.requestId,false,e instanceof Error?e.message:'Could not send this game turn.');scheduleRetry()}
  }
 })().finally(()=>{if(draining===task)draining=null})
 draining=task;return task
}
export async function refreshOpenPigeon(){
 if(!bridge)return
 openPigeonState.set({loading:true,error:''})
 try{const value=await bounded(bridge.status());if(typeof value.installed!=='boolean')throw new Error('Update OnePair to enable the included OpenPigeon games.');openPigeonState.set({installed:value.installed,version:typeof value.version==='string'?value.version:''});attempts=0;await drain()}
 catch(e){failure(e);throw e}finally{openPigeonState.set({loading:false})}
}
function ready(group:PeerGroup,participants:string[]){
 if(!bridge)throw new Error('OpenPigeon currently needs Padi on Android.')
 if(lockState.get().locked)throw new Error('Unlock Padi before opening a game.')
 if(openPigeonState.get().locked)throw new Error('Finish the active OpenPigeon game before opening another.')
 if(!openPigeonState.get().installed)throw new Error('The included OpenPigeon engine is unavailable. Update OnePair and try again.')
 if(!groupRegistry.get().records.some(r=>r.id===group.record.id)||!group.openPigeonReady(participants))throw new Error('Connect all selected players using the Padi Android app first.')
}
async function keepConnected(){if(nativeBridge&&!startedKeepAlive){await nativeBridge.startKeepAlive();startedKeepAlive=true}}
async function releaseKeepAlive(){if(startedKeepAlive&&!settings.get().keepAlive&&!hasGroupCall()&&!groupRecoveryTargets().some(g=>g.busy)){try{await nativeBridge?.stopKeepAlive()}catch{ /* A later app recovery can clear the foreground service. */ }}startedKeepAlive=false}
export async function openOpenPigeonPicker(group:PeerGroup,participants:string[]){
 await initializeOpenPigeon();await refreshOpenPigeon();ready(group,participants)
 if(group.record.owner!==identity.get().deviceId)throw new Error('The room creator starts OpenPigeon matches.')
 await keepConnected();activeRoom=group.record.id
 try{await bounded(bridge!.openPicker({roomId:group.record.id,participants:[...participants]}))}catch(e){activeRoom=null;await releaseKeepAlive();failure(e);throw e}
}
export async function openOpenPigeonGame(group:PeerGroup,session:OpenPigeonSession){
 await initializeOpenPigeon();await refreshOpenPigeon();ready(group,session.participants)
 const current=group.openPigeonSessions.find(s=>s.id===session.id)
 if(!current||!openPigeonSessionActive(current)||!current.participants.includes(identity.get().deviceId))throw new Error('You are not a player in this match.')
 await keepConnected();activeRoom=group.record.id
 try{await bounded(bridge!.openGame({roomId:group.record.id,participants:[...current.participants],message:current.message}))}catch(e){activeRoom=null;await releaseKeepAlive();failure(e);throw e}
}
export function initializeOpenPigeon():Promise<void>{
 if(!bridge)return Promise.resolve()
 if(initializing)return initializing
 stopped=false
 const task=(async()=>{
  listeners.push(await bridge.addListener('message',value=>{void queueMessage(value).catch(failure)}))
  listeners.push(await bridge.addListener('state',value=>{openPigeonState.set({connected:value.connected===true,locked:value.locked===true,...(value.error?{error:value.error}:{})});if(!value.connected&&!value.locked)void releaseKeepAlive()}))
  unsubscribe.push(onOpenPigeonMessage((group,session,replay)=>{
   if(!session.participants.includes(identity.get().deviceId)||session.author===identity.get().deviceId)return
   void bounded(bridge.syncMessage({roomId:group.record.id,participants:session.participants,message:session.message})).catch(failure)
   if(!replay&&openPigeonSessionActive(session)&&Date.now()-session.updatedAt<60000){const route={sub:'groups' as const,tab:'more' as const,focus:group.record.id};if(isAppHidden())void notifyNow('OpenPigeon','A game has an update. Open Padi to play.',route);else if(activeRoom!==group.record.id)toast({title:'OpenPigeon',body:'A game has an update.',action:()=>openRoute(route)})}
  }))
  unsubscribe.push(groupEvents.subscribe(()=>{void drain().catch(failure)}))
  unsubscribe.push(groupRegistry.subscribe(()=>{if(activeRoom&&!groupRegistry.get().records.some(r=>r.id===activeRoom)){activeRoom=null;void bounded(bridge.close()).catch(failure)}void drain().catch(failure)}))
  unsubscribe.push(onAppVisibility(hidden=>{if(!hidden)void refreshOpenPigeon().catch(()=>{})}))
  await refreshOpenPigeon()
 })().catch(async e=>{failure(e);await shutdownOpenPigeon();throw e})
 initializing=task;return task
}
export async function shutdownOpenPigeon(){
 stopped=true;if(retry){clearTimeout(retry);retry=undefined}
 unsubscribe.splice(0).forEach(off=>off());await Promise.allSettled(listeners.splice(0).map(handle=>handle.remove()))
 initializing=null;await releaseKeepAlive()
}
