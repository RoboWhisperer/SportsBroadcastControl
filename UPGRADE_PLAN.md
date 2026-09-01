# Upgrade plan — Sports Broadcast Control

How this application should evolve from **v1.0.0**, and what has to exist before
a school can safely move from one version to the next.

This is not a wish list. Every item below is either a gap against
`Build_Instructions.md`, a path that has never run against real hardware, or a
shortcut that was taken deliberately and written down at the time. Anything not
grounded in the current code is out.

> **Read [the boundary](#non-goals) before adding anything to this plan.** The
> app controls OBS and CasparCG. It does not replace them, does not acquire
> video, and does not invent scenes or sources.

---

## Where v1.0.0 actually stands

| Area | State |
| --- | --- |
| OBS control | Scenes, Studio Mode, streaming, recording, pause, replay buffer, audio mute, scene/source CRUD — all over obs-websocket 5 |
| Scene and source inventory | Derived from OBS on every change; nothing seeded |
| Graphics | CasparCG AMCP verified against a real 2.5.0 server, including `CG ADD/UPDATE/STOP` and `CLEAR` |
| Replay | Implemented over the OBS replay buffer; **never run against real OBS** |
| Scoreboard | Game state, eight sport profiles, live push to air |
| Local control API | HTTP + WebSocket, token auth, schema-validated |
| Tests | 117, no hardware required |
| Packaging | electron-builder NSIS + portable; **unsigned, no auto-update** |

### Verification debt

Green tests do not mean verified. These paths have only ever run against mocks:

| Path | Tested with | Why it matters |
| --- | --- | --- |
| Replay: `SetInputSettings` → `TriggerMediaInputAction` → `SetMediaInputCursor`, and `speed_percent` for slow motion | `MockObs` only | The whole replay feature. Slow motion depends on the ffmpeg source honouring `speed_percent`, which was never observed. |
| Group expansion in `GetSceneItemList` | Synthetic payload shaped like OBS's `isGroup` | OBS provides no request to create a group, so no live capture was possible |
| Studio Mode transition with a real transition configured | `MockObs` | The mock cuts instantly; a real 300 ms fade behaves differently |
| CasparCG templates | A hand-made test card | No real template pack has ever been driven |
| Database migration | Fresh installs only | See below — this is the biggest risk in the list |

---

## Phase 0 — Make upgrading possible at all

**Nothing else in this plan should ship before this phase.** Today an upgrade
means "install over the top and hope", and there is no evidence that a database
written by v1.0.0 survives it.

### 0.1 Prove the migration path

`electron/db.ts` declares `SCHEMA_VERSION = 1` and `migrate()` records it, but
**no migration has ever been written or run**. The store already survived one
breaking change during development (the `cameras` table was dropped in favour of
`sceneOverrides`) purely because every install was thrown away.

* Write the first real migration, even if it is a no-op, so the mechanism is
  exercised rather than theoretical.
* Add a test that opens a database file captured from the previous release and
  asserts the app starts, keeps its settings, and reports the new version.
* Keep a `fixtures/` copy of each shipped release's database. This is the only
  way to test an upgrade without a time machine.
* Decide and document what happens to an unknown *future* schema version — a
  school that downgrades must be told, not silently corrupted.

**Acceptance:** a v1.0.0 database opens under v1.1.0 with venues, mappings,
checklists, hotkeys and game state intact, proven by a test.

### 0.2 Sign the Windows build

The installer is unsigned, so Windows SmartScreen warns on every install and
some school IT policies will block it outright.

* Obtain a code-signing certificate and wire `win.certificateFile` /
  `CSC_LINK` into `electron-builder.yml`.
* Document the signing step so a release is reproducible by someone else.

**Acceptance:** a downloaded installer runs without a SmartScreen block.

### 0.3 Decide the update mechanism

There is no `electron-updater` and no publish target. Options, cheapest first:

1. **Manual** — the school downloads a new installer. Zero code; document it.
   Adequate for one or two rigs.
2. **electron-updater against GitHub Releases** — automatic, needs 0.2 first.

Pick one and write it down. Do not build automatic updates that can fire
mid-broadcast: any updater must be manual-trigger or check-on-launch only,
never "download and restart".

**Acceptance:** `docs/administrator-guide.md` states exactly how a school moves
from one version to the next, and the app's About surface shows its version.

---

## Phase 1 — Verify against real hardware

The largest risk in the product is that replay has never been run against OBS.
It is also the feature students will use most.

### 1.1 Replay end to end

Run a real session: OBS with a replay buffer, a `REPLAY` scene, an ffmpeg media
source. Confirm each step and correct the implementation where reality differs.

* Does `GetLastReplayBufferReplay` return the path in time, or is the
  `ReplayBufferSaved` event the only reliable source?
* Does `speed_percent` on an ffmpeg source actually slow playback, and does it
  apply without a restart?
* Does `SetMediaInputCursor` land accurately enough to roll back N seconds?
* Does `MediaInputPlaybackEnded` fire reliably enough to auto-return to live?

**Acceptance:** the replay section of the acceptance test in
`Build_Instructions.md` §54 passes on real hardware, and anything that behaved
differently from the mock is fixed *and* reflected in `MockObs`, so the mock
stops lying.

### 1.2 A real template pack

Install a real CasparCG template pack, map every role, and drive it. Confirm the
field names in `docs/templates.md` survive contact with templates nobody on this
project wrote.

### 1.3 A full rehearsal

One complete game in demo mode with students, then one with real hardware.
Record what confused them. That list is worth more than the rest of this plan.

---

## Phase 2 — Gaps against the specification

Ordered by how likely a school is to notice.

| # | Gap | Notes |
| --- | --- | --- |
| 2.1 | **Audio is mute-only** | `GetInputVolume` / `SetInputVolume` and the `InputVolumeMeters` event are unused, so there are no faders and no level meters. A broadcast surface without meters is hard to defend. |
| 2.2 | **No sport profile editor** | Profiles are seeded and stored, but the `sports.save` IPC action was deleted as dead code. A school that wants a different period structure has to edit the database. |
| 2.3 | **Scene collections are invisible** | `GetSceneCollectionList` / `SetCurrentSceneCollection` are unused. Venues already imply different collections; switching them from the app is the obvious pairing. |
| 2.4 | **PTZ is a label only** | `CameraType.PTZ` exists for annotation. Real control needs a vendor protocol — only add it with documentation in hand, and behind an adapter, per `Build_Instructions.md` §9. |
| 2.5 | **Roles are a UI guard, not a boundary** | `ROLE_PAGES` hides pages; anyone with the keyboard can change the role back. Fine for a shared machine, but say so plainly rather than implying security. |
| 2.6 | **Multi-screen is two menu items** | Second-screen windows open and window position is remembered, but there is no saved multi-monitor layout. |

---

## Phase 3 — Deliberate shortcuts, and when to undo them

Both are marked `ponytail:` in the source. Neither is a bug; each has a trigger.

### 3.1 Configuration as JSON documents — `electron/db.ts`

Everything except logs lives as JSON blobs in one `docs` table. The dataset is a
few dozen rows that are always loaded whole and never queried relationally.

**Undo when:** reporting or per-row queries appear, or two writers can touch the
same document concurrently.

### 3.2 Thumbnails polled over the WebSocket — `electron/hub.ts`

Program and preview refresh every 2 s; other scenes rotate through a budget of
four. Deliberately a confidence check, not a monitor. Capture is skipped
entirely when no window is showing stills, so the idle cost is a bare timer.

**Undo when:** operators ask for motion. The answer is OBS Multiview on a second
screen, not a faster poll — and never a capture API. See [non-goals](#non-goals).

---

## Phase 4 — Worth doing once the above is done

* **Log export from the control API**, so a teacher can collect diagnostics from
  a rig they are not sitting at.
* **A dry-run mode for CasparCG** that logs the AMCP it *would* send. Useful for
  teaching the protocol and for debugging template mappings.
* **Per-venue OBS profile mapping**, pairing venues with OBS profiles the way
  they already pair with hosts and safe scenes.
* **Checklist export** to hand a paper copy to a student.
* **Measure RSS on a real production PC.** The state-push and still-capture
  costs are fixed; what remains is Chromium's baseline across nine processes.
  Confirm whether `--disable-gpu` is worth making the default on Windows.
* **A memory budget for the whole rig.** The app is ~230 MB across nine
  processes, and it shares a machine with OBS, CasparCG and the Media Scanner.
  Worth measuring the total on a real production PC and documenting a minimum
  spec, rather than discovering it during a game.

---

## Non-goals

These are permanently out of scope. They are not "later"; they are the wrong
product.

* **Acquiring video or audio.** No `getUserMedia`, no `getDisplayMedia`, no
  `desktopCapturer`, no capture devices, no virtual camera, no NDI or RTSP
  decoding. Pictures come from OBS via `GetSourceScreenshot`. The app denies
  every OS permission request, and `tests/no-capture.test.ts` fails the build if
  that changes.
* **Rendering graphics.** No scoreboard renderer, no lower-third renderer, no
  animation engine. CasparCG draws every pixel.
* **Replacing OBS.** No mixing, encoding, streaming or recording of our own.
* **Inventing inventory.** No seeded cameras, scenes, sources or guessed names.
  If OBS does not have it, the app does not show it — and when something is
  missing, the app offers to create it in OBS rather than pretend.

---

## Release checklist

Run this for every version, in order.

1. `npm outdated` is empty, or each exception is justified in the release notes.
2. `npx tsc --noEmit` clean.
3. `npm test` — all green, including `no-capture` and `ipc-contract`.
4. `npm run build`, then launch and confirm a clean startup log.
5. Open the **previous release's** database and confirm nothing is lost.
6. Run `Build_Instructions.md` §54 against real hardware. Not the mock.
7. Bump `version` in `package.json`; the installer name follows it.
8. `npm run dist`, then install the artifact on a clean Windows machine.
9. Update `README.md`, the affected `docs/`, and the release notes.
