import {afterEach,describe,it,expect,vi} from 'vitest'
import {cleanup,fireEvent,render,screen} from '@testing-library/react'
import WordGames from '../src/components/WordGames'
import {createWordData} from '../src/lib/word-games'
import type {PartyGame,GameKind} from '../src/lib/game-types'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function setup(kind:GameKind='word-hunt',active=true){const game:PartyGame={id:'word',kind,players:['a','b'],turn:0,version:0,winner:null,draw:false,data:createWordData(kind,['a','b'],'word12')};const onMove=vi.fn();render(<WordGames game={game} active={active} me="a" name={id=>id} onMove={onMove}/>);return onMove}
describe('word game controls',()=>{
 it('supports keyboard-equivalent tile activation and submits derived paths',()=>{const onMove=setup();for(const label of [/C, row 1, column 1/,/A, row 1, column 2/,/T, row 1, column 3/])fireEvent.click(screen.getByRole('button',{name:label}),{detail:0});expect(screen.getByLabelText('Selected word').textContent).toBe('cat');fireEvent.click(screen.getByRole('button',{name:'Submit word'}));expect(onMove).toHaveBeenCalledWith({path:[0,1,2]})})
 it('does not submit unknown words and provides an explicit finish action',()=>{const onMove=setup();fireEvent.click(screen.getByRole('button',{name:/C, row 1, column 1/}),{detail:0});expect((screen.getByRole('button',{name:'Submit word'}) as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByRole('button',{name:'Finish turn'}));expect(onMove).toHaveBeenCalledWith({action:'finish'})})
 it('makes waiting boards read only',()=>{const onMove=setup('anagrams',false);for(const button of screen.getAllByRole('button'))expect((button as HTMLButtonElement).disabled).toBe(true);expect(onMove).not.toHaveBeenCalled()})
 it('offers non-drag Word Bites piece movement to an empty square',()=>{const onMove=setup('word-bites');fireEvent.click(screen.getByRole('button',{name:/R, row 1, column 1/}),{detail:0});fireEvent.click(screen.getByRole('button',{name:/Empty, row 2, column 3/}),{detail:0});expect(onMove).toHaveBeenCalledWith({action:'shift',piece:0,x:2,y:1})})
 it('traces a pointer path and stops tracing after release',()=>{
   vi.stubGlobal('PointerEvent',MouseEvent)
   const onMove=setup(),board=screen.getByRole('group',{name:'Word Hunt letter board'})
   const c=screen.getByRole('button',{name:/C, row 1, column 1/}),a=screen.getByRole('button',{name:/A, row 1, column 2/}),t=screen.getByRole('button',{name:/T, row 1, column 3/})
   let current:Element=a
   Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>current})
   fireEvent.pointerDown(c,{button:0});fireEvent.pointerMove(board,{clientX:10,clientY:10});current=t;fireEvent.pointerMove(board,{clientX:20,clientY:10});fireEvent.pointerUp(board)
   current=screen.getByRole('button',{name:/S, row 1, column 4/});fireEvent.pointerMove(board,{clientX:30,clientY:10})
   expect(screen.getByLabelText('Selected word').textContent).toBe('Your word');expect(onMove).toHaveBeenCalledExactlyOnceWith({path:[0,1,2]})
 })
 it('drags a whole Word Bites piece to a destination',()=>{
   vi.stubGlobal('PointerEvent',MouseEvent)
   const onMove=setup('word-bites'),board=screen.getByRole('group',{name:'Word Bites board'})
   const start=screen.getByRole('button',{name:/R, row 1, column 1/}),end=screen.getByRole('button',{name:/Empty, row 2, column 3/})
   Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>end})
   fireEvent.pointerDown(start,{button:0});fireEvent.pointerMove(board,{clientX:20,clientY:20});fireEvent.pointerUp(board,{clientX:20,clientY:20});expect(onMove).toHaveBeenCalledExactlyOnceWith({action:'shift',piece:0,x:2,y:1})
 })

 it('cancels a touch trace without submitting it',()=>{
   vi.stubGlobal('PointerEvent',MouseEvent)
   const onMove=setup(),board=screen.getByRole('group',{name:'Word Hunt letter board'})
   const tiles=[/C, row 1, column 1/,/A, row 1, column 2/,/T, row 1, column 3/].map(name=>screen.getByRole('button',{name}))
   let current:Element=tiles[1]
   Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>current})
   fireEvent.pointerDown(tiles[0],{button:0,pointerType:'touch'});fireEvent.pointerMove(board);current=tiles[2];fireEvent.pointerMove(board)
   fireEvent.pointerCancel(board);fireEvent.pointerUp(board)
   expect(onMove).not.toHaveBeenCalled();expect(screen.getByLabelText('Selected word').textContent).toBe('Your word')
 })
 it('submits an anagram by sweeping the rack and releasing',()=>{
   vi.stubGlobal('PointerEvent',MouseEvent)
   const onMove=setup('anagrams'),board=screen.getByRole('group',{name:'Anagram letter rack'})
   const tiles=screen.getAllByRole('button').filter(el=>el.hasAttribute('data-word-cell'))
   const text=tiles.map(el=>el.textContent?.trim().toLowerCase()||'')
   const candidate=['cat','art','rat','tar','ate','eat','tea','sea','set','sat','are','ear','era','red','rod','ore','one','son','ton','ten','net','not','toe'].find(w=>[...w].every((c,i,a)=>text.filter(t=>t===c).length>=a.slice(0,i+1).filter(t=>t===c).length))
   expect(candidate).toBeTruthy()
   const used:number[]=[],path=[...candidate!].map(c=>{const index=text.findIndex((t,i)=>t===c&&!used.includes(i));used.push(index);return index})
   let current:Element=tiles[path[1]]
   Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>current})
   fireEvent.pointerDown(tiles[path[0]],{button:0});fireEvent.pointerMove(board);current=tiles[path[2]];fireEvent.pointerMove(board);fireEvent.pointerUp(board)
   expect(onMove).toHaveBeenCalledExactlyOnceWith({path})
 })

 it('submits a straight Word Bites trace on release',()=>{
   vi.stubGlobal('PointerEvent',MouseEvent)
   const game:PartyGame={id:'bites',kind:'word-bites',players:['a','b'],turn:0,version:1,winner:null,draw:false,data:createWordData('word-bites',['a','b'],'word12')}
   const pieces=game.data.pieces as {id:number;text:string;x:number;y:number;vertical:boolean}[][]
   for(const [id,x,y] of [[6,3,3],[5,1,4],[4,2,4],[7,3,4],[3,4,4]])Object.assign(pieces[0].find(p=>p.id===id)!,{x,y})
   const onMove=vi.fn();render(<WordGames game={game} active me="a" name={id=>id} onMove={onMove}/>)
   fireEvent.click(screen.getByRole('button',{name:'Trace word'}))
   const board=screen.getByRole('group',{name:'Word Bites board'}),tiles=[/C, row 5, column 2/,/O, row 5, column 3/,/P, row 5, column 4/,/S, row 5, column 5/].map(name=>screen.getByRole('button',{name}))
   let current:Element=tiles[0]
   Object.defineProperty(document,'elementFromPoint',{configurable:true,value:()=>current})
   fireEvent.pointerDown(tiles[0],{button:0});for(const tile of tiles.slice(1)){current=tile;fireEvent.pointerMove(board)}fireEvent.pointerUp(board)
   expect(onMove).toHaveBeenCalledExactlyOnceWith({path:[25,26,27,28]})
 })
 it('keeps colliding pieces unchanged and explains why',()=>{const onMove=setup('word-bites');fireEvent.click(screen.getByRole('button',{name:/R, row 1, column 1/}),{detail:0});fireEvent.click(screen.getByRole('button',{name:/T, row 1, column 4/}),{detail:0});expect(onMove).not.toHaveBeenCalled();expect(screen.getByText('That piece needs an empty space.').textContent).toMatch(/empty space/)})
})
