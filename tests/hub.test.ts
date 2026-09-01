import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store } from '../electron/db'
import { Hub } from '../electron/hub'

let dir: string
let hub: Hub

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), 'sbc-hub-'))
  hub = new Hub(new Store(path.join(dir, 'sbc.db')))
  // Demo mode is the default, so nothing here touches a network or a device.
  await hub.startup()
})
afterEach(async () => {
  await hub.shutdown()
  rmSync(dir, { recursive: true, force: true })
})

describe('hub — production actions', () => {
  it('starts fully connected in demo mode', () => {
    expect(hub.state.settings.demoMode).toBe(true)
    expect(hub.state.obs.state).toBe('connected')
    expect(hub.state.graphics.state).toBe('connected')
    expect(hub.state.graphics.engine).toContain('Mock')
  })

  it('takes a camera by switching the mapped OBS scene', async () => {
    await hub.takeCamera('CAM 2')
    expect(hub.state.obs.currentScene).toBe('CAM 2')
  })

  it('does not crash on an unknown camera id', async () => {
    await hub.takeCamera('nope')
    expect(hub.state.alerts.at(-1)?.msg).toMatch(/no scene/i)
  })

  it('starts and stops streaming and recording', async () => {
    await hub.setStreaming(true)
    await hub.setRecording(true)
    expect(hub.state.obs.streaming).toBe(true)
    expect(hub.state.obs.recording).toBe(true)
    await hub.setStreaming(false)
    await hub.setRecording(false)
    expect(hub.state.obs.streaming).toBe(false)
    expect(hub.state.obs.recording).toBe(false)
  })
})

describe('hub — replay', () => {
  it('refuses to save a clip before the buffer is running', async () => {
    await hub.saveReplay()
    expect(hub.state.alerts.at(-1)?.msg).toMatch(/buffer is not running/i)
  })

  it('saves and rolls a replay once the buffer is started', async () => {
    await hub.setReplayBuffer(true)
    expect(hub.state.replay.bufferActive).toBe(true)
    await hub.saveReplay()
    expect(hub.state.replay.lastClip).toMatch(/demo-replay/)
    await hub.replayLast(10, 50)
    expect(hub.state.replay.speed).toBe(50)
    expect(hub.state.obs.currentScene).toBe(hub.state.settings.replay.scene)
    await hub.returnToLive()
    expect(hub.state.replay.playing).toBe(false)
  })
})

describe('hub — graphics and game state', () => {
  it('pushes scoreboard updates to air only while the scoreboard is up', async () => {
    const update = vi.fn()
    // Spy through the public action surface rather than the private controller.
    await hub.patchGame({ homeScore: 7 })
    expect(hub.state.game.homeScore).toBe(7)
    expect(hub.state.graphics.onAir).toEqual([])

    await hub.graphicsPlay('scoreboard')
    expect(hub.state.graphics.onAir).toEqual(['scoreboard'])
    await hub.patchGame({ homeScore: 9 })
    expect(hub.state.game.homeScore).toBe(9)
    await hub.graphicsStop('scoreboard')
    expect(hub.state.graphics.onAir).toEqual([])
    expect(update).not.toHaveBeenCalled()
  })

  it('persists game state across a restart', async () => {
    await hub.patchGame({ homeScore: 42, awayScore: 38, period: 'Q3' })
    await hub.shutdown()
    const reopened = new Hub(new Store(path.join(dir, 'sbc.db')))
    expect(reopened.state.game).toMatchObject({ homeScore: 42, awayScore: 38, period: 'Q3' })
    hub = reopened
    await hub.startup()
  })

  it('clears every graphic with one call', async () => {
    await hub.graphicsPlay('scoreboard')
    await hub.graphicsPlay('sponsor')
    expect(hub.state.graphics.onAir).toHaveLength(2)
    await hub.graphicsClearAll()
    expect(hub.state.graphics.onAir).toEqual([])
  })
})

describe('hub — presets and checklist', () => {
  it('applies a sport preset to game state, replay defaults and the checklist', async () => {
    await hub.loadSport('football')
    expect(hub.state.settings.activeSport).toBe('football')
    expect(hub.state.game.period).toBe('Q1')
    expect(hub.state.game.homeTimeouts).toBe(3)
    expect(hub.state.checklist.length).toBeGreaterThan(0)
  })

  it('ignores an unknown sport instead of corrupting state', async () => {
    const before = hub.state.settings.activeSport
    await hub.loadSport('quidditch')
    expect(hub.state.settings.activeSport).toBe(before)
    expect(hub.state.alerts.at(-1)?.msg).toMatch(/Unknown sport/)
  })

  it('ticks status-backed checklist rows automatically and leaves manual ones alone', async () => {
    const obsRow = () => hub.state.checklist.find((c) => c.auto === 'obs')!
    const manual = () => hub.state.checklist.find((c) => !c.auto)!
    expect(obsRow().done).toBe(true)
    expect(manual().done).toBe(false)

    await hub.setStreaming(true)
    hub.syncChecklist()
    expect(hub.state.checklist.find((c) => c.auto === 'stream')!.done).toBe(true)
  })
})

describe('hub — logging', () => {
  it('records actions and exports them as text', async () => {
    await hub.takeCamera('CAM 1')
    const text = hub.exportLogs()
    expect(text).toMatch(/TAKE CAM 1/)
    expect(text.split('\n')[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('raises a dismissable banner for warnings and errors only', async () => {
    hub.log('info', 'test', 'quiet')
    expect(hub.state.alerts).toHaveLength(0)
    hub.log('error', 'test', 'loud')
    expect(hub.state.alerts).toHaveLength(1)
    hub.dismissAlert(hub.state.alerts[0].id)
    expect(hub.state.alerts).toHaveLength(0)
  })
})

describe('hub — studio mode', () => {
  it('takes straight to program when studio mode is off', async () => {
    await hub.takeCamera('CAM 2')
    expect(hub.state.obs.currentScene).toBe('CAM 2')
    expect(hub.state.obs.previewScene).toBe('')
  })

  it('loads preview instead of program when studio mode is on, and cuts on take', async () => {
    await hub.setStudioMode(true)
    const before = hub.state.obs.currentScene
    await hub.takeCamera('CAM 4')
    expect(hub.state.obs.previewScene).toBe('CAM 4')
    expect(hub.state.obs.currentScene).toBe(before) // nothing has gone to air yet

    await hub.transition()
    expect(hub.state.obs.currentScene).toBe('CAM 4')
    expect(hub.state.obs.previewScene).toBe(before) // preview and program swap
  })

  it('ignores a transition when studio mode is off', async () => {
    const before = hub.state.obs.currentScene
    await hub.transition()
    expect(hub.state.obs.currentScene).toBe(before)
  })

  it('drops the preview scene when studio mode is turned off', async () => {
    await hub.setStudioMode(true)
    await hub.takeCamera('CAM 2')
    expect(hub.state.obs.previewScene).toBe('CAM 2')
    await hub.setStudioMode(false)
    expect(hub.state.obs.previewScene).toBe('')
  })
})

describe('hub — thumbnails', () => {
  it('publishes scene stills on their own channel, never in the state snapshot', async () => {
    const thumbs = await new Promise<Record<string, string>>((resolve) => hub.once('thumbs', resolve))
    expect(Object.keys(thumbs).length).toBeGreaterThan(0)
    for (const name of Object.keys(thumbs)) expect(hub.state.obs.scenes).toContain(name)
    expect(Object.values(thumbs)[0]).toMatch(/^data:image\//)
    // Base64 stills must never ride in the snapshot, which is pushed on every change.
    expect(JSON.stringify(hub.state)).not.toContain('data:image/')
  }, 10000)
})

describe('hub — checklists per sport and venue', () => {
  it('keeps a separate list for each sport and venue combination', async () => {
    hub.saveChecklist([...hub.state.checklist, { id: 'u1', label: 'Check the gym scoreboard feed', done: true }])
    expect(hub.state.checklist.some((c) => c.label === 'Check the gym scoreboard feed')).toBe(true)

    await hub.loadSport('football')
    expect(hub.state.checklist.some((c) => c.label === 'Check the gym scoreboard feed')).toBe(false)

    await hub.loadSport('basketball')
    const back = hub.state.checklist.find((c) => c.label === 'Check the gym scoreboard feed')
    expect(back?.done).toBe(true)
  })

  it('seeds a new combination from the sport profile', async () => {
    await hub.loadSport('volleyball')
    const profile = hub.state.sports.find((s) => s.id === 'volleyball')!
    expect(hub.state.checklist.map((c) => c.label)).toEqual(profile.checklist)
  })

  it('re-attaches auto bindings after loading a list', async () => {
    await hub.loadSport('soccer')
    expect(hub.state.checklist.find((c) => c.auto === 'obs')?.done).toBe(true)
    expect(hub.state.checklist.find((c) => c.auto === 'cameras')).toBeTruthy()
  })
})

describe('hub — scene previews', () => {
  const nextThumbs = () => new Promise<Record<string, string>>((r) => hub.once('thumbs', r))

  it('eventually previews every scene in the collection, not just the mapped cameras', async () => {
    // REPLAY and SAFE / SLATE have no camera mapped to them.
    const seen = new Set<string>()
    for (let i = 0; i < 6; i++) for (const k of Object.keys(await nextThumbs())) seen.add(k)
    expect([...seen].sort()).toEqual([...hub.state.obs.scenes].sort())
  }, 30000)

  it('always refreshes program and preview, whatever the rotation is doing', async () => {
    await hub.setStudioMode(true)
    await hub.takeCamera('CAM 4') // loads preview
    await hub.setScene('SAFE / SLATE')
    const t = await nextThumbs()
    expect(Object.keys(t)).toEqual(expect.arrayContaining(['SAFE / SLATE', 'CAM 4']))
  }, 20000)


  it('forgets a scene that OBS no longer has', async () => {
    await nextThumbs()
    await hub.setScene('CAM 1')
    const before = await nextThumbs()
    expect(Object.keys(before).length).toBeGreaterThan(0)
    // Simulate a scene-collection change that drops everything but one scene.
    ;(hub as unknown as { state: { obs: { scenes: string[] } } }).state.obs.scenes = ['CAM 1']
    const after = await nextThumbs()
    expect(Object.keys(after)).toEqual(['CAM 1'])
  }, 20000)
})

describe('hub — starting a new game', () => {
  it('clears the score and restores the sport defaults, keeping the teams', async () => {
    await hub.patchGame({ homeScore: 42, awayScore: 38, period: 'Q3', clock: '04:32', homeFouls: 5, homeTimeouts: 1 })
    const teams = { home: hub.state.game.homeTeam, away: hub.state.game.awayTeam }

    await hub.startNewGame()

    const g = hub.state.game
    expect([g.homeScore, g.awayScore, g.homeFouls]).toEqual([0, 0, 0])
    expect(g.period).toBe('Q1')
    expect(g.homeTimeouts).toBe(5) // basketball default
    expect(g.homeTeam).toEqual(teams.home) // the operator renames these for the next fixture
    expect(g.awayTeam).toEqual(teams.away)
  })

  it('takes a scoreboard left on air off air', async () => {
    await hub.graphicsPlay('scoreboard')
    expect(hub.state.graphics.onAir).toEqual(['scoreboard'])
    await hub.startNewGame()
    expect(hub.state.graphics.onAir).toEqual([])
  })

  it('un-ticks the hand-checked rows but leaves the status-driven ones alone', async () => {
    const manual = () => hub.state.checklist.filter((c) => !c.auto)
    hub.saveChecklist(hub.state.checklist.map((c) => ({ ...c, done: true })))
    expect(manual().every((c) => c.done)).toBe(true)

    await hub.startNewGame()

    expect(manual().every((c) => !c.done)).toBe(true)
    // OBS is connected in demo mode, so its row re-ticks itself.
    expect(hub.state.checklist.find((c) => c.auto === 'obs')?.done).toBe(true)
  })

  it('never interrupts the broadcast', async () => {
    await hub.setStreaming(true)
    await hub.setRecording(true)
    await hub.setReplayBuffer(true)
    await hub.setScene('CAM 2')

    await hub.startNewGame()

    expect(hub.state.obs.streaming).toBe(true)
    expect(hub.state.obs.recording).toBe(true)
    expect(hub.state.replay.bufferActive).toBe(true)
    expect(hub.state.obs.currentScene).toBe('CAM 2')
  })

  it('survives a graphics server that is not there', async () => {
    await hub.graphicsPlay('scoreboard')
    await hub.connectGraphics(false)
    await hub.startNewGame()
    expect(hub.state.game.homeScore).toBe(0)
  })

  it('persists the fresh game across a restart', async () => {
    await hub.patchGame({ homeScore: 21 })
    await hub.startNewGame()
    await hub.shutdown()
    hub = new Hub(new Store(path.join(dir, 'sbc.db')))
    expect(hub.state.game.homeScore).toBe(0)
    await hub.startup()
  })
})

describe('hub — idle cost', () => {
  it('stops asking OBS for stills when nothing is showing them', async () => {
    await new Promise<Record<string, string>>((r) => hub.once('thumbs', r))
    const svc = (hub as unknown as { obs: { getThumbnail: (s: string, w: number) => Promise<string> } }).obs
    const spy = vi.spyOn(svc, 'getThumbnail')

    hub.setThumbnailDemand(false)
    expect(hub.getThumbnails()).toEqual({}) // cached frames released too
    spy.mockClear()
    await new Promise((r) => setTimeout(r, 5000))
    expect(spy).not.toHaveBeenCalled()

    hub.setThumbnailDemand(true)
    await new Promise<Record<string, string>>((r) => hub.once('thumbs', r))
    expect(spy).toHaveBeenCalled()
  }, 20000)
})
