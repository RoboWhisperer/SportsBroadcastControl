<img src="docs/img/logo.jpg" alt="" width="128" align="right">

# Sports Broadcast Control

A control surface for a high-school sports broadcast. One screen a student
operator can run the whole show from: cameras, stream, recording, replay,
scoreboard and graphics.

> **Sports Broadcast Control controls professional broadcast software; it does
> not reinvent it.**

| Job | Owned by |
| --- | --- |
| Video production, encoding, streaming, recording, scene composition | **OBS Studio** |
| Graphics rendering and animation (scoreboard, lower thirds, sponsors) | **CasparCG Server** |
| Network video transport | **NDI** |
| Operator control, game state, presets, venues, monitoring, automation | **This app** |

There is no graphics engine, video mixer or encoder in this repository, and
there never should be. The app seeds no cameras, scenes or sources — its whole
inventory is read from OBS, and it never opens a camera, a screen or a capture
device either — when it needs to show a picture it asks OBS for one over the
WebSocket, so no OS capture prompt ever appears.

---

## Requirements

| | |
| --- | --- |
| OS | Windows 11 (primary), Linux (secondary) |
| [OBS Studio](https://obsproject.com/) | 30 or newer, with the built-in WebSocket server enabled |
| [CasparCG Server](https://github.com/CasparCG/server/releases) | 2.4 or 2.5, free, GPLv3 — optional, only for graphics |
| CasparCG templates | Any HTML template pack you install yourself, see [docs/templates.md](docs/templates.md) |
| Node.js | 22+ only if you are building from source |

Nothing needs an Internet connection except the live stream itself.

## Install

Download the installer from the releases page, or build it:

```bash
npm install
npm run dist          # release/Sports Broadcast Control <version> x64.exe
```

## Run from source

```bash
npm install
npm run dev           # Vite dev server + Electron with hot reload
npm start             # production build, then Electron
npm test              # 87 tests, no hardware required
```

The app opens in **Demo mode**: mock OBS, mock cameras and mock graphics, so a
student can learn the interface without touching a live broadcast. Turn it off
in Settings → General → Mode when you are ready to drive real gear.

## Documentation

| | |
| --- | --- |
| [installation.md](docs/installation.md) | Installing the app, OBS and CasparCG |
| [configuration.md](docs/configuration.md) | Every setting and where it is stored |
| [obs.md](docs/obs.md) | OBS WebSocket setup and the scenes this app expects |
| [scenes.md](docs/scenes.md) | The scene grid: previews for the whole collection |
| [sources.md](docs/sources.md) | Scenes and sources: everything comes from OBS |
| [ndi.md](docs/ndi.md) | NDI discovery and health checks |
| [graphics.md](docs/graphics.md) | How graphics are triggered |
| [selected-graphics-package.md](docs/selected-graphics-package.md) | **Why CasparCG, licence, download, install, protocol** |
| [casparcg-on-debian.md](docs/casparcg-on-debian.md) | Installing CasparCG on Debian-family Linux that is not Ubuntu |
| [templates.md](docs/templates.md) | Installing, mapping and replacing templates |
| [recommended-templates.md](docs/recommended-templates.md) | Which template packs to use, and how to judge one |
| [scoreboard.md](docs/scoreboard.md) | Game state and how it reaches the graphics |
| [replay.md](docs/replay.md) | Replay buffer, slow motion, return to live |
| [streamdeck.md](docs/streamdeck.md) | Local control API and Stream Deck buttons |
| [venues.md](docs/venues.md) | Multi-venue and preset configuration |
| [troubleshooting.md](docs/troubleshooting.md) | When something is red |
| [student-guide.md](docs/student-guide.md) | **Start here on game day** |
| [administrator-guide.md](docs/administrator-guide.md) | Setup and maintenance |

## Architecture

```
                    ┌──────────────────────────┐
                    │ Sports Broadcast Control │
                    │  Electron main process   │
                    │                          │
   React UI ◄─IPC──►│  Hub — state + actions   │
   Stream Deck ◄─HTTP/WS─►  Control API        │
                    └────┬──────────┬──────────┘
                         │          │
             obs-websocket          AMCP over TCP :5250
                         │          │
                   ┌─────▼────┐  ┌──▼───────────────┐
                   │   OBS    │  │ CasparCG Server  │
                   │  Studio  │  │  HTML templates  │
                   └──────────┘  └──────────────────┘
```

* `electron/hub.ts` is the only thing that mutates application state, and the
  only thing that talks to a service. The UI, the hotkeys and the control API
  all go through the same action list, so they can never disagree.
* Every integration is isolated behind an interface with a mock implementation.
  A dead graphics server cannot take down OBS control, and neither can crash
  the app.
* State is pushed to the renderer as a whole snapshot on every change; there is
  no second copy of the truth in the UI.

```
electron/            main process
  hub.ts             application state and every action
  db.ts              SQLite (node:sqlite) configuration store
  api.ts             local control API + WebSocket events
  services/
    amcp.ts          CasparCG AMCP protocol client
    graphics.ts      GraphicsController (CasparCG + mock)
    obs.ts           OBSService (obs-websocket-js + mock)
    replay.ts        ReplayProvider over the OBS replay buffer
    cameras.ts       camera registry, NDI discovery, reachability probes
shared/              types and sport profiles used by both processes
src/                 React renderer
tests/               vitest, run on Electron's Node so node:sqlite is available
```

## The icon

`build/icon.png` is generated by `scripts/make-icon.py` (needs Pillow). The mark
is a 2×2 multiview with one cell live — chosen because it stays readable at a
16px taskbar size, where a play triangle turns to mush. Its blue and navy are
sampled from the project artwork, and the live cell uses the same red as the
app's own on-air indicator.

Edit the constants at the top of that script and re-run it to change the mark.

## Roadmap

[UPGRADE_PLAN.md](UPGRADE_PLAN.md) covers where the app goes from here: what has
to exist before a school can move safely between versions, which paths have only
ever run against mocks, the shortcuts taken deliberately and when to undo them,
and what is permanently out of scope.

## Licence

MIT. OBS Studio and CasparCG Server are separate programs with their own
licences and are neither bundled nor redistributed here.
