# Scoreboard

The Scoreboard page is a **data-entry surface**, not a renderer. It edits game
state; CasparCG draws it.

```
Scoreboard page  →  GameState  →  scoreboard role  →  mapped template  →  CasparCG
```

## Game state

```ts
interface GameState {
  sport: string
  homeTeam: { name: string; abbr: string; color: string }
  awayTeam: { name: string; abbr: string; color: string }
  homeScore: number
  awayScore: number
  period: string
  clock: string
  shotClock?: string
  possession: 'home' | 'away' | null
  homeFouls: number
  awayFouls: number
  homeTimeouts: number
  awayTimeouts: number
  down?: number
  distance?: number
  ballOn?: string
}
```

Persisted on every change, so a crash or restart mid-game loses nothing.

## Live updates

While the scoreboard role is on air, every edit sends `CG UPDATE` immediately —
no extra button. Off air, edits are stored and go out with the next take.

## What each sport shows

The visible fields come from the sport profile, not from React:

| Sport | Fields |
| --- | --- |
| Basketball | scores, quarter, clock, shot clock, fouls, timeouts, possession |
| Football | scores, quarter, clock, down, distance, ball on, possession, timeouts |
| Volleyball | scores, set, timeouts, possession |
| Soccer | scores, half, clock |
| Baseball / Softball | scores, inning |
| Wrestling | scores, period, clock |
| Generic | scores, period, clock, possession |

## Fields sent to the template

`home`, `homeAbbr`, `homeColor`, `homeScore`, `away`, `awayAbbr`, `awayColor`,
`awayScore`, `period`, `clock`, `shotClock`, `possession`, `homeFouls`,
`awayFouls`, `homeTimeouts`, `awayTimeouts`, `down`, `distance`, `ballOn`.

Templates ignore what they do not use. Rename any of them per template under
Graphics → Template mapping.

## Clock

The app does **not** run a game clock. A scoreboard clock that drifts from the
real one is worse than none, and school venues vary in what is authoritative
(the wall clock, the venue board, a scorer's tablet). The `clock` field is text
the operator types or a template animates itself. If you later drive it from a
real timing device, feed the `clock` field through `PATCH /api/game`.

## Validation

Score 0–999, fouls and timeouts 0–99, down 1–4, distance 0–99, period at most
24 characters. Enforced at the API boundary with Zod, so a mistyped Stream Deck
button cannot put nonsense on air.
