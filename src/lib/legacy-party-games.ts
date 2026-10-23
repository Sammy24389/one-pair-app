export type GameKind = 'darts' | 'words' | 'basketball' | 'paintball' | 'connect4' | 'checkers' | 'mancala' | 'cup-pong';
export type PartyGame = {
  id: string;
  kind: GameKind;
  players: string[];
  turn: number;
  version: number;
  winner: string | null;
  draw: boolean;
  data: Record<string, unknown>;
};
export const GAME_INFO: {
  kind: GameKind;
  title: string;
  minPlayers: number;
  maxPlayers: number;
  rules: string;
}[] = [{
  kind: 'darts',
  title: 'Darts',
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'Take one dart each turn. Reach exactly 101 points. Overshoots score nothing. Everyone gets a reply in the checkout round; tied checkouts draw. Limit: 60 darts each.'
}, {
  kind: 'words',
  title: 'Word chain',
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'Use 3–20 English letters. Begin with the previous word’s final letter; no repeats. Casual play uses no dictionary. Ten words each, one point per letter. Finish the full round before comparing scores; tied scores draw.'
}, {
  kind: 'basketball',
  title: 'Basketball',
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'Aim at the hoop. Five shots each; a center shot scores three, other baskets two. Highest score wins.'
}, {
  kind: 'paintball',
  title: 'Paintball',
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'Move one square or shoot up to three squares along a row or column. Two hits eliminate a player. Last standing wins; 100 turns is a draw.'
}, {
  kind: 'connect4',
  title: 'Four in a row',
  minPlayers: 2,
  maxPlayers: 2,
  rules: 'Drop a disc into a column. Connect four horizontally, vertically or diagonally.'
}, {
  kind: 'checkers',
  title: 'Checkers',
  minPlayers: 2,
  maxPlayers: 2,
  rules: 'American checkers: move diagonally forward, capture when possible, complete multiple jumps. Kings move both ways. Promotion ends the turn; 80 quiet moves is a draw.'
}, {
  kind: 'mancala',
  title: 'Mancala',
  minPlayers: 2,
  maxPlayers: 2,
  rules: 'Kalah: sow your six pits counterclockwise, skipping the other store. Finish in your store for another turn; capture opposite seeds by finishing in an empty own pit.'
}, {
  kind: 'cup-pong',
  title: 'Cup pong',
  minPlayers: 2,
  maxPlayers: 4,
  rules: 'Each player has the same six-cup rack and twelve throws. Highest number of cups wins after everyone has thrown; tied scores draw.'
}];
// Moves: aim games {x,y} in [0,1]; words {word}; connect4 {column}; checkers {from,to} flat row-major;
// mancala {pit:0..5} relative to own side; paintball {action:'move'|'shoot',x,y} integer grid coordinates.
// Host validates landing coordinates; projectile animation is presentation only.
const integer = (x: unknown, min: number, max: number): x is number => Number.isInteger(x) && x as number >= min && x as number <= max;
const record = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const numbers = (x: unknown, n: number, min: number, max: number): x is number[] => Array.isArray(x) && x.length === n && x.every(v => integer(v, min, max));
const cups = [[.25, .25], [.5, .25], [.75, .25], [.375, .5], [.625, .5], [.5, .75]];
export const CUP_TARGETS = cups;
export function createPartyGame(kind: GameKind, players: string[], id: string): PartyGame {
  const info = GAME_INFO.find(g => g.kind === kind);
  if (!info || !id || id.length > 100 || players.length < info.minPlayers || players.length > info.maxPlayers || new Set(players).size !== players.length || players.some(p => typeof p !== 'string' || !p || p.length > 100)) {
    throw new Error('Invalid game participants');
  }
  const n = players.length;
  let data: Record<string, unknown>;
  if (kind === 'connect4') {
    data = {
      board: Array(42).fill(0)
    };
  } else if (kind === 'checkers') {
    data = {
      board: Array.from({
        length: 64
      }, (_, i) => (Math.floor(i / 8) + i % 8) % 2 === 0 ? 0 : i < 24 ? 1 : i >= 40 ? 2 : 0),
      forced: -1,
      quiet: 0
    };
  } else if (kind === 'mancala') {
    data = {
      pits: Array.from({
        length: 14
      }, (_, i) => i === 6 || i === 13 ? 0 : 4)
    };
  } else if (kind === 'words') {
    data = {
      words: [],
      scores: Array(n).fill(0)
    };
  } else if (kind === 'paintball') {
    data = {
      positions: [[0, 0], [6, 6], [6, 0], [0, 6]].slice(0, n),
      health: Array(n).fill(2)
    };
  } else {
    data = {
      scores: Array(n).fill(0),
      shots: Array(n).fill(0),
      ...(kind === 'cup-pong' ? {
        cups: Array.from({
          length: n
        }, () => Array(6).fill(1))
      } : {})
    };
  }
  return {
    id,
    kind,
    players: [...players],
    turn: 0,
    version: 0,
    winner: null,
    draw: false,
    data
  };
}
function owned(piece: number, side: number) {
  return piece === side + 1 || piece === side + 3;
}
function checkMoves(board: number[], side: number, jumps: boolean, only = -1): [number, number][] {
  const moves: [number, number][] = [];
  board.forEach((p, from) => {
    if (!owned(p, side) || only !== -1 && only !== from) {
      return;
    }
    for (const dy of p > 2 ? [-1, 1] : [side === 0 ? 1 : -1]) {
      for (const dx of [-1, 1]) {
        const row = Math.floor(from / 8),
          col = from % 8,
          step = jumps ? 2 : 1,
          y = row + dy * step,
          x = col + dx * step;
        if (x < 0 || x > 7 || y < 0 || y > 7 || board[y * 8 + x]) {
          continue;
        }
        if (jumps) {
          const middle = board[(row + dy) * 8 + col + dx];
          if (!middle || owned(middle, side)) {
            continue;
          }
        }
        moves.push([from, y * 8 + x]);
      }
    }
  });
  return moves;
}
export function validPartyGame(value: unknown): value is PartyGame {
  if (!record(value) || typeof value.id !== 'string' || !value.id || value.id.length > 100 || !Array.isArray(value.players)) {
    return false;
  }
  const info = GAME_INFO.find(game => game.kind === value.kind);
  const players = value.players;
  if (
    !info || players.length < info.minPlayers || players.length > info.maxPlayers ||
    players.some(player => typeof player !== 'string' || !player || player.length > 100) ||
    new Set(players).size !== players.length ||
    !integer(value.turn, 0, players.length - 1) || !integer(value.version, 0, 10000) ||
    !(value.winner === null || players.includes(value.winner)) ||
    typeof value.draw !== 'boolean' || (value.draw && value.winner !== null) ||
    !record(value.data)
  ) {
    return false;
  }
  const data = value.data;
  const playerCount = players.length;
  if (value.kind === 'connect4') {
    return numbers(data.board, 42, 0, 2) &&
      data.board.every((piece, index, board) => !piece || index >= 35 || board[index + 7] !== 0);
  }
  if (value.kind === 'checkers') {
    if (!numbers(data.board, 64, 0, 4) || !integer(data.forced, -1, 63) || !integer(data.quiet, 0, 80)) {
      return false;
    }
    const board = data.board;
    const piecesOnDarkSquares = board.every((piece, index) =>
      !piece || (Math.floor(index / 8) + index % 8) % 2 === 1);
    const validPieceCounts = [0, 1].every(side => board.filter(piece => owned(piece, side)).length <= 12);
    const validContinuation = data.forced === -1 || checkMoves(board, value.turn, true, data.forced).length > 0;
    return piecesOnDarkSquares && validPieceCounts && validContinuation;
  }
  if (value.kind === 'mancala') {
    return numbers(data.pits, 14, 0, 48) && data.pits.reduce((sum, seeds) => sum + seeds, 0) === 48;
  }
  if (value.kind === 'words') {
    return Array.isArray(data.words) && data.words.length <= 40 &&
      data.words.every(word => typeof word === 'string' && /^[a-z]{3,20}$/.test(word)) &&
      new Set(data.words).size === data.words.length && numbers(data.scores, playerCount, 0, 200);
  }
  if (value.kind === 'paintball') {
    if (
      !Array.isArray(data.positions) || data.positions.length !== playerCount ||
      !data.positions.every(position => numbers(position, 2, 0, 6)) ||
      !numbers(data.health, playerCount, 0, 2)
    ) {
      return false;
    }
    const health = data.health;
    const occupiedPositions = data.positions
      .filter((_, index) => health[index] > 0)
      .map(position => (position as number[]).join(','));
    return new Set(occupiedPositions).size === health.filter(Boolean).length;
  }
  if (data.lastShot !== undefined) {
    const shot=data.lastShot;
    if (!record(shot) || !['x','y'].every(key => typeof shot[key] === 'number' && Number.isFinite(shot[key]) && (shot[key] as number) >= 0 && (shot[key] as number) <= 1) || (shot.side !== undefined && !integer(shot.side,0,playerCount-1))) return false;
  }
  const maxShots = value.kind === 'basketball' ? 5 : value.kind === 'cup-pong' ? 12 : 60;
  if (!numbers(data.scores, playerCount, 0, value.kind === 'darts' ? 101 : 100) ||
      !numbers(data.shots, playerCount, 0, maxShots)) {
    return false;
  }
  return value.kind !== 'cup-pong' || (
    Array.isArray(data.cups) && data.cups.length === playerCount &&
    data.cups.every(rack => numbers(rack, 6, 0, 1))
  );
}
export function applyPartyMove(state: PartyGame, actor: string, move: Record<string, unknown>, version: number): PartyGame | null {
  if (!validPartyGame(state) || !record(move) || version !== state.version || state.players[state.turn] !== actor || state.winner || state.draw || state.version >= 10000) {
    return null;
  }
  const g = structuredClone(state),
    d = g.data,
    side = g.turn,
    n = g.players.length;
  if (g.kind === 'paintball' && !(d.health as number[])[side]) {
    return null;
  }
  if (g.kind === 'cup-pong' && (d.shots as number[])[side] >= 12) {
    return null;
  }
  const next = () => {
    g.turn = (g.turn + 1) % n;
  };
  const win = (i: number) => {
    g.winner = g.players[i];
  };
  const finishScores = (scores: number[]) => {
    const max = Math.max(...scores),
      top = scores.flatMap((s, i) => s === max ? [i] : []);
    if (top.length === 1) {
      win(top[0]);
    } else {
      g.draw = true;
    }
  };
  if (g.kind === 'connect4') {
    if (!integer(move.column, 0, 6)) {
      return null;
    }
    const b = d.board as number[],
      c = move.column;
    let r = 5;
    while (r >= 0 && b[r * 7 + c]) {
      r--;
    }
    if (r < 0) {
      return null;
    }
    b[r * 7 + c] = side + 1;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      let count = 1;
      for (const sign of [-1, 1]) {
        let x = c + dx * sign,
          y = r + dy * sign;
        while (x >= 0 && x < 7 && y >= 0 && y < 6 && b[y * 7 + x] === side + 1) {
          count++;
          x += dx * sign;
          y += dy * sign;
        }
      }
      if (count >= 4) {
        win(side);
      }
    }
    if (!g.winner && b.every(Boolean)) {
      g.draw = true;
    }
    next();
  } else if (g.kind === 'checkers') {
    if (!integer(move.from, 0, 63) || !integer(move.to, 0, 63)) {
      return null;
    }
    const b = d.board as number[],
      forced = d.forced as number,
      jumps = checkMoves(b, side, true, forced),
      options = jumps.length ? jumps : forced === -1 ? checkMoves(b, side, false) : [];
    if (!options.some(([f, t]) => f === move.from && t === move.to)) {
      return null;
    }
    const from = move.from,
      to = move.to,
      piece = b[from],
      jump = Math.abs(Math.floor(from / 8) - Math.floor(to / 8)) === 2;
    b[from] = 0;
    b[to] = piece;
    if (jump) {
      b[(from + to) / 2] = 0;
    }
    const promoted = piece <= 2 && (side === 0 ? to >= 56 : to < 8);
    if (promoted) {
      b[to] = piece + 2;
    }
    d.quiet = jump || promoted ? 0 : (d.quiet as number) + 1;
    if (jump && !promoted && checkMoves(b, side, true, to).length) {
      d.forced = to;
    } else {
      d.forced = -1;
      next();
      if (!checkMoves(b, g.turn, true).length && !checkMoves(b, g.turn, false).length) {
        win(side);
      }
    }
    if (!g.winner && d.quiet as number >= 80) {
      g.draw = true;
    }
  } else if (g.kind === 'mancala') {
    if (!integer(move.pit, 0, 5)) {
      return null;
    }
    const b = d.pits as number[],
      own = side === 0 ? 6 : 13,
      other = side === 0 ? 13 : 6,
      start = side * 7 + move.pit;
    let seeds = b[start],
      i = start;
    if (!seeds) {
      return null;
    }
    b[start] = 0;
    while (seeds) {
      i = (i + 1) % 14;
      if (i === other) {
        continue;
      }
      b[i]++;
      seeds--;
    }
    if (i !== own && Math.floor(i / 7) === side && b[i] === 1 && b[12 - i] > 0) {
      b[own] += b[12 - i] + 1;
      b[i] = 0;
      b[12 - i] = 0;
    }
    if (b.slice(0, 6).every(x => x === 0) || b.slice(7, 13).every(x => x === 0)) {
      for (let j = 0; j < 6; j++) {
        b[6] += b[j];
        b[j] = 0;
        b[13] += b[j + 7];
        b[j + 7] = 0;
      }
      if (b[6] === b[13]) {
        g.draw = true;
      } else {
        win(b[6] > b[13] ? 0 : 1);
      }
    } else if (i !== own) {
      next();
    }
  } else if (g.kind === 'words') {
    if (typeof move.word !== 'string') {
      return null;
    }
    const word = move.word.trim().toLowerCase(),
      words = d.words as string[],
      scores = d.scores as number[];
    if (!/^[a-z]{3,20}$/.test(word) || words.includes(word) || words.length && word[0] !== words.at(-1)!.slice(-1)) {
      return null;
    }
    words.push(word);
    scores[side] += word.length;
    if (words.length === n * 10) {
      finishScores(scores);
    } else {
      next();
    }
  } else if (g.kind === 'paintball') {
    if (!integer(move.x, 0, 6) || !integer(move.y, 0, 6)) {
      return null;
    }
    const positions = d.positions as number[][],
      health = d.health as number[],
      [x, y] = positions[side],
      distance = Math.abs(x - move.x) + Math.abs(y - move.y);
    const target = positions.findIndex(([a, b], i) => i !== side && health[i] > 0 && a === move.x && b === move.y);
    if (move.action === 'move') {
      if (distance !== 1 || target !== -1) {
        return null;
      }
      positions[side] = [move.x, move.y];
    } else if (move.action === 'shoot') {
      if (target < 0 || distance > 3 || x !== move.x && y !== move.y) {
        return null;
      }
      const targetX = move.x;
      const targetY = move.y;
      const blocked = positions.some(([otherX, otherY], index) => {
        if (index === side || index === target || health[index] === 0) {
          return false;
        }
        const betweenRows = otherY > Math.min(y, targetY) && otherY < Math.max(y, targetY);
        const betweenColumns = otherX > Math.min(x, targetX) && otherX < Math.max(x, targetX);
        return x === targetX ? otherX === x && betweenRows : otherY === y && betweenColumns;
      });
      if (blocked) {
        return null;
      }
      health[target]--;
    } else {
      return null;
    }
    const alive = health.flatMap((h, i) => h ? [i] : []);
    if (alive.length === 1) {
      win(alive[0]);
    } else if (g.version + 1 >= 100) {
      g.draw = true;
    } else {
      do {
        next();
      } while (!health[g.turn]);
    }
  } else {
    if (typeof move.x !== 'number' || typeof move.y !== 'number' || !Number.isFinite(move.x) || !Number.isFinite(move.y) || move.x < 0 || move.x > 1 || move.y < 0 || move.y > 1) {
      return null;
    }
    const scores = d.scores as number[],
      shots = d.shots as number[];
    d.lastShot = {x:move.x,y:move.y,side};
    shots[side]++;
    if (g.kind === 'darts') {
      const dx = move.x - .5,
        dy = move.y - .5,
        r = Math.hypot(dx, dy),
        sector = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5][Math.floor((Math.atan2(dx, -dy) * 180 / Math.PI + 369) % 360 / 18)];
      const points = r > .48 ? 0 : r < .025 ? 50 : r < .055 ? 25 : sector * (r > .44 ? 2 : r > .26 && r < .30 ? 3 : 1);
      if (scores[side] + points <= 101) {
        scores[side] += points;
      }
      if (shots.every(s => s === shots[0]) && scores.includes(101)) {
        finishScores(scores);
      } else if (shots.every(s => s >= 60)) {
        g.draw = true;
      } else {
        next();
      }
    } else if (g.kind === 'basketball') {
      const radius = Math.hypot(move.x - .5, move.y - .25);
      scores[side] += radius <= .055 ? 3 : radius <= .15 ? 2 : 0;
      if (shots.every(s => s >= 5)) {
        finishScores(scores);
      } else {
        next();
      }
    } else {
      const racks = d.cups as number[][];
      const hit = cups.findIndex(([x, y], i) => racks[side][i] === 1 && Math.hypot((move.x as number) - x, (move.y as number) - y) <= .105);
      if (hit >= 0) {
        racks[side][hit] = 0;
        scores[side]++;
      }
      if (shots.every(count => count >= 12)) finishScores(scores);
      else next();
    }
  }
  g.version++;
  return g;
}
