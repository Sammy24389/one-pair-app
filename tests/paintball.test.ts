import {expect,it} from 'vitest'
import {createPartyGame,applyPartyMove,validPartyGame} from '../src/lib/party-games'
import {paintCommit,type PaintChoice} from '../src/lib/paintball'
const players=['alpha','bravo'],choice=(cover:number,target:number,s='a'):PaintChoice=>({cover,target,salt:s.repeat(64)})
function exchange(game:ReturnType<typeof createPartyGame>,a:PaintChoice,b:PaintChoice){for(const [actor,move] of [['alpha',{action:'commit',commit:paintCommit(game,0,a)}],['bravo',{action:'commit',commit:paintCommit(game,1,b)}],['alpha',{action:'reveal',choice:a}],['bravo',{action:'reveal',choice:b}]] as const){const next=applyPartyMove(game,actor,move,game.version);expect(next).not.toBeNull();game=next!}return game}
it('locks private choices before revealing and rejects tampered reveals',()=>{
 let game=createPartyGame('paintball',players,'paint');const a=choice(1,2),b=choice(2,1,'b')
 game=applyPartyMove(game,'alpha',{action:'commit',commit:paintCommit(game,0,a)},0)!
 expect(JSON.stringify(game)).not.toContain('cover');expect(applyPartyMove(game,'bravo',{action:'reveal',choice:b},1)).toBeNull()
 game=applyPartyMove(game,'bravo',{action:'commit',commit:paintCommit(game,1,b)},1)!
 expect(applyPartyMove(game,'alpha',{action:'reveal',choice:{...a,target:0}},2)).toBeNull()
 game=applyPartyMove(game,'alpha',{action:'reveal',choice:a},2)!
 expect(game.data.scores).toEqual([0,0])
 game=applyPartyMove(game,'bravo',{action:'reveal',choice:b},3)!
 expect(game.data.scores).toEqual([1,1]);expect(validPartyGame(game)).toBe(true)
})
it('resolves equal attacks before awarding a win and allows a simultaneous draw',()=>{
 let g=createPartyGame('paintball',players,'tie');for(let i=0;i<3;i++)g=exchange(g,choice(1,2),choice(2,1,'b'))
 expect(g.draw).toBe(true);expect(g.winner).toBeNull();expect(g.data.scores).toEqual([3,3])
 let win=createPartyGame('paintball',players,'winner');for(let i=0;i<3;i++)win=exchange(win,choice(1,2),choice(2,0,'b'));expect(win.winner).toBe('alpha')
})
it('bounds games at seven exchanges and prevents cross-round commitment reuse',()=>{
 let g=createPartyGame('paintball',players,'misses');const old=paintCommit(g,0,choice(0,0));for(let i=0;i<7;i++)g=exchange(g,choice(0,0),choice(1,1,'b'));expect(g.draw).toBe(true);expect(g.data.round).toBe(7)
 const live=createPartyGame('paintball',players,'misses');const later=exchange(live,choice(0,0),choice(1,1,'b'));expect(paintCommit(later,0,choice(0,0))).not.toBe(old)
})
it('rejects forged scores, secret leakage, malformed choices and histories',()=>{
 const g=createPartyGame('paintball',players,'bounds');for(const patch of [{scores:[2,0]},{cover:1},{commits:['bad',null]},{round:1},{choices:[choice(0,0),null]}])expect(validPartyGame({...g,data:{...g.data,...patch}})).toBe(false)
 expect(applyPartyMove(g,'alpha',{action:'commit',commit:'a'.repeat(64),choice:choice(0,0)},0)).toBeNull()
})
