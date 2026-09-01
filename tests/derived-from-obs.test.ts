import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Store, defaultSettings } from '../electron/db'
import { Hub, deriveCameras } from '../electron/hub'
import { DEFAULT_SPORTS } from '../shared/sports'

describe('deriveCameras', () => {
  it('produces exactly the scenes OBS reports, in order', () => {
    expect(deriveCameras([], {})).toEqual([])
    expect(deriveCameras(['A', 'B', 'C'], {}).map((c) => c.id)).toEqual(['A', 'B', 'C'])
    // Ten scenes in OBS, ten cameras in the app.
    expect(deriveCameras(Array.from({ length: 10 }, (_, i) => `S${i}`), {})).toHaveLength(10)
  })

  it('cannot invent a camera from an override alone', () => {
    const orphan = { 'Not In OBS': { label: 'Ghost', address: '1.2.3.4:80' } }
    expect(deriveCameras([], orphan)).toEqual([])
    expect(deriveCameras(['Real'], orphan).map((c) => c.id)).toEqual(['Real'])
  })

  it('applies label, hide and address overrides', () => {
    const o = { Wide: { label: 'CAM 1' }, Bench: { hidden: true }, Tight: { address: '10.0.0.9:554' } }
    const cams = deriveCameras(['Wide', 'Bench', 'Tight'], o)
    expect(cams.map((c) => c.name)).toEqual(['CAM 1', 'Tight'])
    expect(cams.find((c) => c.id === 'Tight')?.address).toBe('10.0.0.9:554')
  })

  it('reports unknown rather than offline when there is nothing to probe', () => {
    expect(deriveCameras(['A'], {})[0].online).toBeNull()
    expect(deriveCameras(['A'], { A: { address: 'x:1' } })[0].online).toBeNull()
    // A previous probe result is carried across a re-derivation.
    const prev = deriveCameras(['A'], { A: { address: 'x:1' } })
    prev[0].online = true
    expect(deriveCameras(['A'], { A: { address: 'x:1' } }, prev)[0].online).toBe(true)
  })
})

describe('nothing is seeded', () => {
  it('ships no cameras, no safe scene, no replay target and no mic', () => {
    const s = defaultSettings()
    expect(s.replay.scene).toBe('')
    expect(s.replay.mediaSource).toBe('')
  })

  it('has no checklist row naming a camera that may not exist', () => {
    for (const sport of DEFAULT_SPORTS) {
      expect(sport.checklist.filter((l) => /camera \d/i.test(l))).toEqual([])
    }
  })
})

describe('the app mirrors OBS', () => {
  let dir: string
  let hub: Hub
  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'sbc-obs-'))
    hub = new Hub(new Store(path.join(dir, 'sbc.db')))
    await hub.startup()
  })
  afterEach(async () => {
    await hub.shutdown()
    rmSync(dir, { recursive: true, force: true })
  })

  it('starts with one camera per scene the mock OBS has', () => {
    expect(hub.state.cameras.map((c) => c.id)).toEqual(hub.state.obs.scenes)
  })

  it('gains a camera when a scene is created in OBS, and loses it when removed', async () => {
    const before = hub.state.cameras.length
    await hub.createScene('Tunnel Cam')
    expect(hub.state.cameras.map((c) => c.id)).toContain('Tunnel Cam')
    expect(hub.state.cameras).toHaveLength(before + 1)

    await hub.removeScene('Tunnel Cam')
    expect(hub.state.cameras.map((c) => c.id)).not.toContain('Tunnel Cam')
    expect(hub.state.cameras).toHaveLength(before)
  })

  it('drops to nothing when OBS has no scenes', async () => {
    for (const scene of [...hub.state.obs.scenes]) await hub.removeScene(scene)
    expect(hub.state.obs.scenes).toEqual([])
    expect(hub.state.cameras).toEqual([])
  })

  it('carries the annotation across a rename and leaves no orphan', async () => {
    hub.saveSceneOverride('CAM 1', { label: 'Court Wide' })
    await hub.renameScene('CAM 1', 'Wide Shot')
    expect(hub.state.sceneOverrides['CAM 1']).toBeUndefined()
    expect(hub.state.sceneOverrides['Wide Shot'].label).toBe('Court Wide')
    expect(hub.state.cameras.find((c) => c.id === 'Wide Shot')?.name).toBe('Court Wide')
  })

  it('forgets the annotation when the scene is deleted in OBS', async () => {
    hub.saveSceneOverride('CAM 2', { label: 'Basket' })
    await hub.removeScene('CAM 2')
    expect(hub.state.sceneOverrides['CAM 2']).toBeUndefined()
  })

  it('reads back the inputs and scene items OBS actually has', async () => {
    expect(hub.state.inputs.length).toBeGreaterThan(0)
    expect(hub.state.inputKinds.length).toBeGreaterThan(0)
    expect(Object.keys(hub.state.sceneItems).sort()).toEqual([...hub.state.obs.scenes].sort())

    await hub.createInput('CAM 1', 'Slate Card', 'image_source')
    expect(hub.state.inputs.map((i) => i.name)).toContain('Slate Card')
    expect(hub.state.sceneItems['CAM 1'].map((i) => i.sourceName)).toContain('Slate Card')

    await hub.removeInput('Slate Card')
    expect(hub.state.inputs.map((i) => i.name)).not.toContain('Slate Card')
    expect(hub.state.sceneItems['CAM 1'].map((i) => i.sourceName)).not.toContain('Slate Card')
  })

  it('toggles a scene item through OBS', async () => {
    const item = hub.state.sceneItems['CAM 1'][0]
    await hub.setSceneItemEnabled('CAM 1', item.id, false)
    expect(hub.state.sceneItems['CAM 1'].find((i) => i.id === item.id)?.enabled).toBe(false)
  })

  it('empties the inventory when OBS goes away', async () => {
    await hub.connectObs(false)
    await hub.refreshInventory()
    expect(hub.state.inputs).toEqual([])
    expect(hub.state.sceneItems).toEqual({})
    expect(hub.state.inputKinds).toEqual([])
    expect(hub.state.cameras).toEqual([])
  })

  it('refuses to take a scene OBS does not have', async () => {
    await hub.takeCamera('Nonexistent Scene')
    expect(hub.state.alerts.at(-1)?.msg).toMatch(/no scene/i)
  })
})
