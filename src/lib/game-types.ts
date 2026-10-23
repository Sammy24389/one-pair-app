export type GameKind = 'connect4' | 'checkers' | 'mancala' | 'chess' | 'gomoku' | 'reversi' | 'sea-battle' | 'word-hunt' | 'anagrams' | 'word-bites' | 'darts' | 'archery' | 'basketball' | 'cup-pong' | 'words' | 'paintball'
export type PartyGame = {id:string; kind:GameKind; players:string[]; turn:number; version:number; winner:string|null; draw:boolean; data:Record<string,unknown>}
export type GameInfo = {kind:GameKind; title:string; minPlayers:number; maxPlayers:number; rules:string}
export type GameViewProps = {game:PartyGame; active:boolean; me:string; name:(id:string)=>string; onMove:(move:Record<string,unknown>)=>void}
