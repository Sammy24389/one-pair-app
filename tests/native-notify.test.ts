import {beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({show:vi.fn(),createChannel:vi.fn(),schedule:vi.fn(),prefs:{sounds:true,notificationTone:'chime'}}))
vi.mock('../src/lib/native',()=>({nativeBridge:{show:mocks.show}}))
vi.mock('../src/lib/platform',()=>({isNative:true,withSystemUi:(action:()=>unknown)=>action()}))
vi.mock('../src/lib/settings',()=>({settings:{get:()=>mocks.prefs}}))
vi.mock('../src/lib/nav',()=>({openRoute:vi.fn()}))
vi.mock('@capacitor/local-notifications',()=>({LocalNotifications:{createChannel:mocks.createChannel,schedule:mocks.schedule}}))
import {notifyNow} from '../src/lib/notify'
beforeEach(()=>{vi.clearAllMocks();mocks.show.mockResolvedValue(undefined);mocks.prefs={sounds:true,notificationTone:'chime'}})
it('passes selected tone and route to immediate native notifications',async()=>{
  mocks.prefs.notificationTone='bell'
  await notifyNow('Group call','Join the call',{tab:'play',sub:'groups'})
  expect(mocks.show).toHaveBeenCalledWith(expect.objectContaining({tone:'bell',title:'Group call',route:JSON.stringify({tab:'play',sub:'groups'})}))
})
it('honors silent/sounds off and bounds unknown preferences',async()=>{
  mocks.prefs.sounds=false;await notifyNow('Hello','Message');expect(mocks.show).toHaveBeenLastCalledWith(expect.objectContaining({tone:'silent'}))
  mocks.prefs.sounds=true;mocks.prefs.notificationTone='silent';await notifyNow('Hello','Message');expect(mocks.show).toHaveBeenLastCalledWith(expect.objectContaining({tone:'silent'}))
  mocks.prefs.notificationTone='untrusted-channel';await notifyNow('Hello','Message');expect(mocks.show).toHaveBeenLastCalledWith(expect.objectContaining({tone:'chime'}))
})
it('configures fallback channels with bundled sounds and quiet importance for silent',async()=>{
  mocks.show.mockRejectedValue(new Error('native unavailable'));mocks.prefs.notificationTone='soft'
  await notifyNow('Hello','Message')
  expect(mocks.createChannel).toHaveBeenLastCalledWith(expect.objectContaining({id:'fallback_messages_v1_soft',sound:'notification_soft.wav',importance:4}))
  mocks.prefs.notificationTone='silent';await notifyNow('Hello','Message')
  expect(mocks.createChannel).toHaveBeenLastCalledWith(expect.objectContaining({id:'fallback_messages_v1_silent',sound:undefined,importance:2,vibration:false}))
  expect(mocks.schedule).toHaveBeenLastCalledWith({notifications:[expect.objectContaining({channelId:'fallback_messages_v1_silent'})]})
})
