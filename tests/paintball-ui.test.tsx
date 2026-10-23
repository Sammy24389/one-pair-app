import {afterEach,expect,it,vi} from 'vitest'
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react'
import Paintball from '../src/components/Paintball'
import {createPartyGame,applyPartyMove} from '../src/lib/party-games'
import {paintCommit,newPaintChoice} from '../src/lib/paintball'
afterEach(()=>{cleanup();localStorage.clear();vi.unstubAllGlobals();vi.useRealTimers()})
it('offers cover and lock alternatives without transmitting the hidden choice',()=>{const onMove=vi.fn(),game=createPartyGame('paintball',['a','b'],'ui');render(<Paintball game={game} active me="a" name={id=>id} onMove={onMove}/>);fireEvent.click(screen.getByRole('button',{name:'Hide at 3'}));fireEvent.click(screen.getByRole('button',{name:'Aim at 1 and lock'}));expect(onMove).toHaveBeenCalledWith({action:'commit',commit:expect.stringMatching(/^[a-f0-9]{64}$/)});expect(JSON.stringify(onMove.mock.calls)).not.toContain('cover');expect(localStorage.getItem('onepair.paintball.pending.v1')).toContain('"cover":2')})
it('releases an aimed pointer gesture to lock and cancels abandoned gestures',()=>{vi.stubGlobal('PointerEvent',MouseEvent);const onMove=vi.fn(),game=createPartyGame('paintball',['a','b'],'gesture');render(<Paintball game={game} active me="a" name={id=>id} onMove={onMove}/>);const arena=screen.getByRole('img');Object.defineProperty(arena,'getBoundingClientRect',{value:()=>({left:0,top:0,right:420,bottom:430,width:420,height:430})});Object.defineProperty(arena,'setPointerCapture',{value:vi.fn()});fireEvent.pointerDown(arena,{button:0,clientX:210,clientY:260});fireEvent.pointerCancel(arena);fireEvent.pointerUp(arena,{clientX:210,clientY:135});expect(onMove).not.toHaveBeenCalled();fireEvent.pointerDown(arena,{button:0,clientX:210,clientY:260});fireEvent.pointerMove(arena,{clientX:350,clientY:140});fireEvent.pointerUp(arena,{clientX:350,clientY:140});expect(onMove).toHaveBeenCalledOnce()})
it('does not lock a choice when inactive and reports lost private storage at reveal',()=>{let game=createPartyGame('paintball',['a','b'],'lost');const a=newPaintChoice(1,1),b=newPaintChoice(0,0);game=applyPartyMove(game,'a',{action:'commit',commit:paintCommit(game,0,a)},0)!;game=applyPartyMove(game,'b',{action:'commit',commit:paintCommit(game,1,b)},1)!;const onMove=vi.fn();render(<Paintball game={game} active me="a" name={id=>id} onMove={onMove}/>);expect(screen.getByRole('alert').textContent).toContain('missing');expect(onMove).not.toHaveBeenCalled()})

it('retries the original secret after a lost acknowledgement and can still reveal',()=>{
 vi.useFakeTimers();const onMove=vi.fn(),initial=createPartyGame('paintball',['a','b'],'retry')
 const {rerender}=render(<Paintball game={initial} active me="a" name={id=>id} onMove={onMove}/>)
 fireEvent.click(screen.getByRole('button',{name:'Hide at 3'}));fireEvent.click(screen.getByRole('button',{name:'Aim at 1 and lock'}))
 const original=localStorage.getItem('onepair.paintball.pending.v1'),commit=onMove.mock.calls[0][0]
 let accepted=applyPartyMove(initial,'a',commit,0)!
 act(()=>vi.advanceTimersByTime(4000))
 fireEvent.click(screen.getByRole('button',{name:'Hide at 1'}));fireEvent.click(screen.getByRole('button',{name:'Aim at 3 and lock'}))
 expect(onMove.mock.calls[1][0]).toEqual(commit)
 expect(JSON.parse(localStorage.getItem('onepair.paintball.pending.v1')!)[0].choice).toEqual(JSON.parse(original!)[0].choice)
 const other=newPaintChoice(1,1);accepted=applyPartyMove(accepted,'b',{action:'commit',commit:paintCommit(accepted,1,other)},1)!
 rerender(<Paintball game={accepted} active me="a" name={id=>id} onMove={onMove}/>)
 const reveal=onMove.mock.calls.at(-1)![0];expect(reveal.action).toBe('reveal');expect(applyPartyMove(accepted,'a',reveal,2)).not.toBeNull()
})
