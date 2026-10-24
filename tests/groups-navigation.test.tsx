import {afterEach, beforeEach, expect, it, vi} from 'vitest'
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react'
import Groups from '../src/screens/Groups'

const fixture = vi.hoisted(() => ({focus:'',back:vi.fn(),forget:vi.fn(),host:vi.fn(),record:{id:'room12345',title:'Friend room',owner:'me'}}))
vi.mock('../src/components/ui',()=>({TopBar:({onBack,backLabel='Back'}:{onBack?:()=>void;backLabel?:string})=><button onClick={onBack??fixture.back} aria-label={backLabel}>Back</button>}))
vi.mock('../src/components/OpenPigeonRoom',()=>({default:()=>null}))
vi.mock('../src/components/PartyGames',()=>({default:()=>null}))
vi.mock('../src/components/WatchTogether',()=>({default:()=>null}))
vi.mock('../src/lib/openpigeon',()=>({openPigeonState:{use:(select:(value:{supported:boolean})=>boolean)=>select({supported:false})}}))
vi.mock('../src/lib/identity',()=>({identity:{get:()=>({deviceId:'me',pairs:[{}],profile:{name:'Me'}})}}))
vi.mock('../src/lib/nav',()=>({nav:{use:(select:(value:{focus:string})=>string)=>select({focus:fixture.focus})},push:vi.fn(),takeFocus:()=>{const focus=fixture.focus;fixture.focus='';return focus}}))
vi.mock('../src/lib/notify',()=>({ensureNotifyPermission:vi.fn()}))
vi.mock('../src/lib/group-codes',()=>({hostGroupCode:fixture.host,redeemGroupCode:vi.fn(),stopGroupCode:vi.fn()}))
vi.mock('../src/lib/groups',()=>({activeGroupCall:()=>null,acceptGroupInvitation:vi.fn(),createGroup:vi.fn(),forgetGroup:fixture.forget,groupEvents:{use:()=>{}},groupInvitation:()=> 'invitation',groupRegistry:{use:()=>({records:[fixture.record]})},getGroup:()=>({record:fixture.record,peers:new Map(),messages:[],callers:new Set(),local:null,connected:true,joining:false,party:null,partyCompatible:()=>true})}))

beforeEach(()=>{vi.clearAllMocks();fixture.focus='';fixture.host.mockResolvedValue({code:'ABCD-EFGH-JKLM',expiresAt:Date.now()+60000})})
afterEach(cleanup)

it('returns from a selected room to the list before navigating out of Rooms',()=>{
  render(<Groups/>)
  fireEvent.click(screen.getByRole('button',{name:'Friend room'}))
  expect(screen.getByRole('heading',{name:'Friend room'})).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'Back to rooms'}))
  expect(screen.getByRole('button',{name:'Friend room'})).toBeTruthy()
  expect(fixture.back).not.toHaveBeenCalled()
  expect(fixture.forget).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Back'}))
  expect(fixture.back).toHaveBeenCalledOnce()
})

it('also returns notification-focused rooms to the list and consumes the focus once',()=>{
  fixture.focus=fixture.record.id
  render(<Groups/>)
  expect(screen.getByRole('heading',{name:'Friend room'})).toBeTruthy()
  expect(fixture.focus).toBe('')
  fireEvent.click(screen.getByRole('button',{name:'Back to rooms'}))
  expect(screen.getByRole('button',{name:'Friend room'})).toBeTruthy()
  expect(fixture.back).not.toHaveBeenCalled()
})

it('clears room sharing UI on header back without leaving the actual room',async()=>{
  render(<Groups/>)
  fireEvent.click(screen.getByRole('button',{name:'Friend room'}))
  fireEvent.click(screen.getByRole('button',{name:'Share code'}))
  await waitFor(()=>expect(screen.getByLabelText('Room invite code').textContent).toBe('ABCD-EFGH-JKLM'))
  fireEvent.click(screen.getByRole('button',{name:'Back to rooms'}))
  fireEvent.click(screen.getByRole('button',{name:'Friend room'}))
  expect(screen.queryByRole('heading',{name:'Invite friends'})).toBeNull()
  expect(fixture.forget).not.toHaveBeenCalled()
})
