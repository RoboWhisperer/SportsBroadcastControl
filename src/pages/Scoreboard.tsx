import { act, useApp } from '../lib/store'
import { Btn, Field, Panel, useConfirm } from '../lib/ui'
import { FIELD_LABELS } from '../../shared/sports'
import type { GameState, Team } from '../../shared/types'

const NUMERIC = new Set(['homeScore', 'awayScore', 'homeFouls', 'awayFouls', 'homeTimeouts', 'awayTimeouts', 'down', 'distance'])

export default function Scoreboard() {
  const s = useApp()
  const { ask, node } = useConfirm()
  const g = s.game
  const profile = s.sports.find((x) => x.id === s.settings.activeSport) ?? s.sports[0]
  const patch = (p: Partial<GameState>) => act('game.patch', p)
  const onAir = s.graphics.onAir.includes('scoreboard')

  const team = (side: 'home' | 'away') => {
    const key = side === 'home' ? 'homeTeam' : 'awayTeam'
    const t = g[key]
    const set = (p: Partial<Team>) => patch({ [key]: { ...t, ...p } } as Partial<GameState>)
    return (
      <Panel title={side === 'home' ? 'Home' : 'Away'}>
        <div className="grid gap-3">
          <Field label="Team name" value={t.name} onChange={(v) => set({ name: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Abbreviation" value={t.abbr} onChange={(v) => set({ abbr: v.toUpperCase().slice(0, 5) })} />
            <Field label="Colour" type="color" value={t.color} onChange={(v) => set({ color: v })} />
          </div>
          <div className="flex items-center gap-3">
            <Btn big className="flex-1" onClick={() => patch({ [side === 'home' ? 'homeScore' : 'awayScore']: Math.max(0, (side === 'home' ? g.homeScore : g.awayScore) - 1) } as Partial<GameState>)}>−</Btn>
            <span className="text-5xl font-bold num w-24 text-center">{side === 'home' ? g.homeScore : g.awayScore}</span>
            <Btn big tone="go" className="flex-1" onClick={() => patch({ [side === 'home' ? 'homeScore' : 'awayScore']: (side === 'home' ? g.homeScore : g.awayScore) + 1 } as Partial<GameState>)}>+</Btn>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[2, 3, 6].map((n) => (
              <Btn key={n} tone="ghost" className="text-xs!" onClick={() => patch({ [side === 'home' ? 'homeScore' : 'awayScore']: (side === 'home' ? g.homeScore : g.awayScore) + n } as Partial<GameState>)}>
                +{n}
              </Btn>
            ))}
          </div>
        </div>
      </Panel>
    )
  }

  const rest = profile.fields.filter((f) => f !== 'homeScore' && f !== 'awayScore')

  return (
    <div className="grid gap-3">
      {node}
      <div className="flex flex-wrap items-center gap-3">
        <Btn big tone={onAir ? 'live' : 'go'} onClick={() => act(onAir ? 'graphics.stop' : 'graphics.play', { role: 'scoreboard' })}>
          {onAir ? 'Take scoreboard off air' : 'Take scoreboard live'}
        </Btn>
        <Field
          label="Sport"
          type="select"
          value={s.settings.activeSport}
          onChange={(v) => act('sport.load', { id: v })}
          options={s.sports.map((x) => ({ value: x.id, label: x.name }))}
        />
        <Btn
          tone="ghost"
          onClick={() =>
            ask(
              'Start a new game?',
              'Clears the score, period and clock, takes any graphic off air and un-ticks the pre-game checklist. Team names are kept. The stream and recording are not touched.',
              'New game',
              () => act('game.new'),
            )
          }
        >
          New game
        </Btn>
        <p className="text-xs text-zinc-500 max-w-md">
          Changes are pushed to the graphics engine immediately while the scoreboard is on air.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        {team('home')}
        {team('away')}
      </div>

      <Panel title={`${profile.name} — game state`}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rest.map((f) => {
            if (f === 'possession') {
              return (
                <Field
                  key={f} label="Possession" type="select" value={g.possession ?? ''}
                  onChange={(v) => patch({ possession: (v || null) as GameState['possession'] })}
                  options={[{ value: '', label: '— none —' }, { value: 'home', label: g.homeTeam.abbr }, { value: 'away', label: g.awayTeam.abbr }]}
                />
              )
            }
            if (f === 'period') {
              return (
                <Field
                  key={f} label={profile.periodLabel} type="select" value={g.period}
                  onChange={(v) => patch({ period: v })}
                  options={profile.periods.map((p) => ({ value: p, label: p }))}
                />
              )
            }
            const numeric = NUMERIC.has(f)
            return (
              <Field
                key={f}
                label={FIELD_LABELS[f] ?? f}
                type={numeric ? 'number' : 'text'}
                min={0}
                value={(g[f as keyof GameState] ?? '') as string | number}
                onChange={(v) => patch({ [f]: numeric ? Number(v) || 0 : v } as Partial<GameState>)}
              />
            )
          })}
        </div>
      </Panel>
    </div>
  )
}
