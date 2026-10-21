import { describe, it, expect } from 'vitest';
import { applyPartyMove as move, createPartyGame as create, GAME_INFO, validPartyGame, CUP_TARGETS } from '../src/lib/party-games';
const players = ['a', 'b'];
describe('party games', () => {
  it('creates bounded valid independent states for every game', () => {
    for (const info of GAME_INFO) {
      const g = create(info.kind, players, 'one');
      expect(validPartyGame(g)).toBe(true);
      expect(move(g, 'b', {}, 0)).toBeNull();
      expect(move(g, 'a', {}, 1)).toBeNull();
    }
    expect(() => create('checkers', ['a', 'a'], 'x')).toThrow();
  });
  it('rejects malformed states and nonfinite aiming', () => {
    expect(validPartyGame(null)).toBe(false);
    const g = create('darts', players, 'x');
    for (const x of [NaN, Infinity, -1, 2]) {
      expect(move(g, 'a', {
        x,
        y: .5
      }, 0)).toBeNull();
    }
    expect(move(g, 'a', {
      x: .5,
      y: .5
    }, 0)?.data.scores).toEqual([50, 0]);
    expect(g.data.scores).toEqual([0, 0]);
  });
  it('detects gravity four-in-row wins and locks completed games', () => {
    let g = create('connect4', players, 'x');
    for (const column of [0, 1, 0, 1, 0, 1, 0]) {
      g = move(g, g.players[g.turn], {
        column
      }, g.version)!;
    }
    expect(g.winner).toBe('a');
    expect(move(g, 'b', {
      column: 2
    }, g.version)).toBeNull();
  });
  it('rejects full columns', () => {
    let g = create('connect4', players, 'x');
    for (let i = 0; i < 6; i++) {
      g = move(g, g.players[g.turn], {
        column: 0
      }, g.version)!;
    }
    expect(move(g, 'a', {
      column: 0
    }, g.version)).toBeNull();
  });
  it('enforces chain letters, normalization and repeats', () => {
    let g = create('words', players, 'x');
    g = move(g, 'a', {
      word: '  Apple  '
    }, 0)!;
    expect(move(g, 'b', {
      word: 'banana'
    }, 1)).toBeNull();
    g = move(g, 'b', {
      word: 'eagle'
    }, 1)!;
    expect(move(g, 'a', {
      word: 'eagle'
    }, 2)).toBeNull();
    expect(g.data.words).toEqual(['apple', 'eagle']);
  });
  it('requires checkers captures and continues jumps', () => {
    let g = create('checkers', players, 'x');
    const b = Array(64).fill(0);
    b[17] = 1;
    b[26] = 2;
    b[44] = 2;
    b[1] = 1;
    g.data = {
      board: b,
      forced: -1,
      quiet: 0
    };
    expect(move(g, 'a', {
      from: 1,
      to: 8
    }, 0)).toBeNull();
    g = move(g, 'a', {
      from: 17,
      to: 35
    }, 0)!;
    expect(g.turn).toBe(0);
    expect(g.data.forced).toBe(35);
    expect(move(g, 'a', {
      from: 1,
      to: 8
    }, 1)).toBeNull();
    g = move(g, 'a', {
      from: 35,
      to: 53
    }, 1)!;
    expect(g.winner).toBe('a');
  });
  it('promotes checkers and ends capture turn on crowning', () => {
    let g = create('checkers', players, 'x');
    const b = Array(64).fill(0);
    b[42] = 1;
    b[51] = 2;
    b[53] = 2;
    g.data = {
      board: b,
      forced: -1,
      quiet: 0
    };
    g = move(g, 'a', {
      from: 42,
      to: 60
    }, 0)!;
    expect((g.data.board as number[])[60]).toBe(3);
    expect(g.turn).toBe(1);
    expect(g.data.forced).toBe(-1);
  });
  it('preserves all mancala seeds and grants store extra turn', () => {
    let g = create('mancala', players, 'x');
    g = move(g, 'a', {
      pit: 2
    }, 0)!;
    expect(g.turn).toBe(0);
    expect((g.data.pits as number[])[6]).toBe(1);
    for (let i = 0; i < 150 && !g.winner && !g.draw; i++) {
      const b = g.data.pits as number[],
        pit = b.slice(g.turn * 7, g.turn * 7 + 6).findIndex(x => x > 0);
      g = move(g, g.players[g.turn], {
        pit
      }, g.version)!;
      expect((g.data.pits as number[]).reduce((a, b) => a + b, 0)).toBe(48);
    }
    expect(g.winner !== null || g.draw).toBe(true);
  });
  it('captures opposite mancala seeds and sweeps final pits', () => {
    const g = create('mancala', players, 'x');
    g.data.pits = [0, 0, 0, 0, 1, 0, 20, 5, 0, 0, 0, 0, 0, 22];
    const end = move(g, 'a', {
      pit: 4
    }, 0)!;
    expect(end.winner).toBe('a');
    expect(end.data.pits).toEqual([0, 0, 0, 0, 0, 0, 26, 0, 0, 0, 0, 0, 0, 22]);
  });
  it('ends basketball after five shots each with tie handling', () => {
    let g = create('basketball', players, 'x');
    for (let i = 0; i < 10; i++) {
      g = move(g, g.players[g.turn], {
        x: .5,
        y: .25
      }, g.version)!;
    }
    expect(g.draw).toBe(true);
    expect(g.data.scores).toEqual([15, 15]);
  });
  it('validates tactical movement and shooting then eliminates', () => {
    let g = create('paintball', players, 'x');
    expect(move(g, 'a', {
      action: 'move',
      x: 3,
      y: 0
    }, 0)).toBeNull();
    g.data.positions = [[0, 0], [2, 0]];
    g = move(g, 'a', {
      action: 'shoot',
      x: 2,
      y: 0
    }, 0)!;
    g = move(g, 'b', {
      action: 'shoot',
      x: 0,
      y: 0
    }, 1)!;
    g = move(g, 'a', {
      action: 'shoot',
      x: 2,
      y: 0
    }, 2)!;
    expect(g.winner).toBe('a');
  });
  it('clears cups deterministically and preserves untouched states', () => {
    let g = create('cup-pong', players, 'x');
    for (const [x, y] of CUP_TARGETS) {
      g = move(g, 'a', {
        x,
        y
      }, g.version)!;
      if (!g.winner) {
        g = move(g, 'b', {
          x: 0,
          y: 0
        }, g.version)!;
      }
    }
    expect(g.winner).toBe('a');
    expect(g.data.scores).toEqual([6, 0]);
  });
});
import type { PartyGame } from '../src/lib/party-games';
function play(state: PartyGame, action: Record<string, unknown>) {
  const result = move(state, state.players[state.turn], action, state.version);
  expect(result).not.toBeNull();
  expect(validPartyGame(result)).toBe(true);
  return result!;
}
describe('completed games and state invariants', () => {
  it('finishes four-player basketball with one winner', () => {
    let state = create('basketball', ['a', 'b', 'c', 'd'], 'basketball');
    for (let shot = 0; shot < 20; shot++) {
      state = play(state, state.turn === 2 ? {
        x: .5,
        y: .25
      } : {
        x: 0,
        y: 1
      });
    }
    expect(state.winner).toBe('c');
    expect(state.data.shots).toEqual([5, 5, 5, 5]);
    expect(move(state, state.players[state.turn], {
      x: .5,
      y: .25
    }, state.version)).toBeNull();
  });
  it('requires exact darts out and handles a bust without changing score', () => {
    let state = create('darts', players, 'darts');
    const bull = {
        x: .5,
        y: .5
      },
      miss = {
        x: 0,
        y: 0
      };
    state = play(state, bull);
    state = play(state, miss);
    state = play(state, bull);
    state = play(state, miss);
    state = play(state, bull);
    expect(state.data.scores).toEqual([100, 0]);
    state = play(state, miss);
    const angle = 18 * Math.PI / 180;
    state = play(state, {
      x: .5 + Math.sin(angle) * .15,
      y: .5 - Math.cos(angle) * .15
    });
    expect(state.winner).toBe('a');
    expect(state.data.scores).toEqual([101, 0]);
  });
  it('ends a darts game after sixty misses per participant', () => {
    let state = create('darts', players, 'misses');
    for (let dart = 0; dart < 120; dart++) {
      state = play(state, {
        x: 0,
        y: 0
      });
    }
    expect(state.draw).toBe(true);
    expect(state.data.shots).toEqual([60, 60]);
  });
  it('conserves all 48 mancala seeds through different complete legal games', () => {
    for (let scenario = 0; scenario < 12; scenario++) {
      let state = create('mancala', players, `mancala-${scenario}`);
      for (let turn = 0; turn < 500 && !state.winner && !state.draw; turn++) {
        const board = state.data.pits as number[];
        const legal = board.slice(state.turn * 7, state.turn * 7 + 6).flatMap((seeds, pit) => seeds ? [pit] : []);
        state = play(state, {
          pit: legal[(turn * 7 + scenario) % legal.length]
        });
        expect((state.data.pits as number[]).reduce((sum, seeds) => sum + seeds, 0)).toBe(48);
      }
      expect(state.winner !== null || state.draw).toBe(true);
      const board = state.data.pits as number[];
      expect(board.slice(0, 6).every(seeds => seeds === 0)).toBe(true);
      expect(board.slice(7, 13).every(seeds => seeds === 0)).toBe(true);
    }
  });
  it('skips eliminated paintball players and rejects firing through another player', () => {
    let state = create('paintball', ['a', 'b', 'c'], 'paintball');
    state.data.positions = [[0, 0], [1, 0], [2, 0]];
    state.data.health = [2, 1, 2];
    expect(move(state, 'a', {
      action: 'shoot',
      x: 2,
      y: 0
    }, 0)).toBeNull();
    state = play(state, {
      action: 'shoot',
      x: 1,
      y: 0
    });
    expect(state.turn).toBe(2);
    state = play(state, {
      action: 'shoot',
      x: 0,
      y: 0
    });
    state = play(state, {
      action: 'shoot',
      x: 2,
      y: 0
    });
    state = play(state, {
      action: 'move',
      x: 2,
      y: 1
    });
    state = play(state, {
      action: 'move',
      x: 0,
      y: 1
    });
    state = play(state, {
      action: 'move',
      x: 2,
      y: 2
    });
    state = play(state, {
      action: 'move',
      x: 0,
      y: 2
    });
    state = play(state, {
      action: 'move',
      x: 3,
      y: 2
    });
    state = play(state, {
      action: 'shoot',
      x: 3,
      y: 2
    });
    expect(state.winner).toBe('a');
  });
  it('draws paintball after one hundred legal evasive moves', () => {
    let state = create('paintball', players, 'paintball-draw');
    for (let turn = 0; turn < 100; turn++) {
      const positions = state.data.positions as number[][];
      const [x, y] = positions[state.turn];
      state = play(state, {
        action: 'move',
        x: state.turn === 0 ? x === 0 ? 1 : 0 : x === 6 ? 5 : 6,
        y
      });
    }
    expect(state.draw).toBe(true);
  });
  it('eliminates cup pong participants and skips their future turns', () => {
    let state = create('cup-pong', ['a', 'b', 'c'], 'cups');
    for (const [x, y] of CUP_TARGETS) {
      state = play(state, {
        x,
        y
      });
      if (state.turn === 1) {
        state = play(state, {
          x: 0,
          y: 0
        });
      }
      state = play(state, {
        x: 0,
        y: 0
      });
    }
    expect(state.turn).toBe(0);
    expect((state.data.cups as number[][])[1]).toEqual([0, 0, 0, 0, 0, 0]);
    for (const [x, y] of CUP_TARGETS) {
      state = play(state, {
        x,
        y
      });
      if (!state.winner) {
        state = play(state, {
          x: 0,
          y: 0
        });
      }
    }
    expect(state.winner).toBe('a');
    expect(state.data.shots).toEqual([12, 5, 11]);
  });
  it('caps cup pong at twelve shots each and resolves tied scores', () => {
    let state = create('cup-pong', ['a', 'b', 'c', 'd'], 'cups-draw');
    for (let shot = 0; shot < 48; shot++) {
      state = play(state, {
        x: 0,
        y: 0
      });
    }
    expect(state.draw).toBe(true);
    expect(state.data.shots).toEqual([12, 12, 12, 12]);
    expect(move(state, 'a', {
      x: .25,
      y: .25
    }, state.version)).toBeNull();
  });
});
