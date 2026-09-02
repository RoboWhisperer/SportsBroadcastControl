# OBS Studio integration

OBS does the production. This app only tells it what to do, over the official
OBS WebSocket protocol (v5) via `obs-websocket-js`. It never simulates mouse
clicks or keystrokes.

## Setup

**Tools → WebSocket Server Settings** → *Enable WebSocket server*. Default port
4455. Copy the password into **Settings → OBS**.

For building the scene collection itself — scenes, camera sources, the replay
buffer, getting graphics in — see **[obs-setup.md](obs-setup.md)**.

## Scenes this app expects

Nothing is created for you. Build the scenes in OBS and map them here:

| Scene | Mapped in | Used for |
| --- | --- | --- |
| One per camera | Cameras page → *OBS scene* | Camera take buttons and hotkeys 1–4 |
| A replay scene | Settings → Replay → *Replay scene* | Rolling a replay |
| A safe scene | Settings → Venues → *Safe scene* | The emergency SAFE SCENE button |

## What is used

| Feature | Request |
| --- | --- |
| Version check | `GetVersion` |
| Scene list and current scene | `GetSceneList` |
| Switch scene | `SetCurrentProgramScene` |
| Studio Mode | `GetStudioModeEnabled`, `SetStudioModeEnabled` |
| Preview and cut | `GetCurrentPreviewScene`, `SetCurrentPreviewScene`, `TriggerStudioModeTransition` |
| Camera thumbnails | `GetSourceScreenshot` |
| Stream start/stop | `StartStream`, `StopStream` |
| Record start/stop/pause | `StartRecord`, `StopRecord`, `PauseRecord`, `ResumeRecord` |
| Replay buffer | `StartReplayBuffer`, `StopReplayBuffer`, `SaveReplayBuffer`, `GetLastReplayBufferReplay` |
| Stream health | `GetStreamStatus` polled once a second |
| Recording state | `GetRecordStatus` |
| Audio | `GetInputList`, `GetInputMute`, `SetInputMute` |
| Scene contents | `GetSceneItemList`, `GetGroupSceneItemList`, `SetSceneItemEnabled` |
| Creating and editing | `CreateScene`, `RemoveScene`, `SetSceneName`, `CreateInput`, `RemoveInput`, `GetInputKindList` |
| Replay playback | `SetInputSettings`, `TriggerMediaInputAction`, `GetMediaInputStatus`, `SetMediaInputCursor` |

Events subscribed: `CurrentProgramSceneChanged`, `CurrentPreviewSceneChanged`,
`StudioModeStateChanged`, `StreamStateChanged`,
`RecordStateChanged`, `ReplayBufferStateChanged`, `ReplayBufferSaved`,
`MediaInputPlaybackEnded`, `ConnectionClosed`.

## Reading a scene's contents

`GetSceneItemList` reports each entry's `sourceType`, which is the only way to
tell a real source from a nested scene:

```
[CAM 1]    Court Wide  OBS_SOURCE_TYPE_INPUT  inputKind=color_source_v3
[PROGRAM]  CAM 1       OBS_SOURCE_TYPE_SCENE  inputKind=null
```

Both arrive with just a `sourceName`, so ignoring `sourceType` makes a nested
scene indistinguishable from a source. Entries with `isGroup` are expanded with
`GetGroupSceneItemList`, because a group otherwise hides the sources actually in
the scene. `GetInputList` never returns scenes.

## Studio Mode

Off by default: clicking a camera cuts it straight to program, which is what a
single student operator usually wants.

Turn it on from the toggle on the Production page and the app follows OBS's
Studio Mode discipline — clicking a camera loads it into **preview** (green
border, `PVW` badge) and nothing reaches air until you press **TAKE** or the
`Enter` key. Program keeps its red border and `PGM` badge throughout.

The state is read from OBS on connect and tracked through
`StudioModeStateChanged`, so toggling it inside OBS is picked up too. Asking for
a preview change while Studio Mode is off is refused with a clear message rather
than passed to OBS, which would reject it.

## Scene stills

Every scene in the collection gets a preview, fetched with `GetSourceScreenshot`
at 320px wide, JPEG quality 40 — scenes are sources in OBS, so one request
covers both. Program and preview refresh every two seconds; the rest rotate
through a budget of four per cycle, so the request rate is flat no matter how
many scenes OBS has.

`GetSourceScreenshot` is the only picture source in the app: it never opens a
camera, a screen or a capture device, so no OS capture prompt can appear. For
full-motion monitoring, use OBS Multiview. See [scenes.md](scenes.md).

This is a confidence check — *is CAM 2 pointing at the court* — not a multiview.
OBS Multiview on a second monitor remains the real monitoring tool.

Thumbnails travel on their own IPC channel and are deliberately absent from both
the state snapshot and `GET /api/status`, so a polling Stream Deck never pulls
megabytes of base64.

## Derived numbers

* **Bitrate** — from the change in `outputBytes` between polls. It is blank for
  the first second of a stream because a rate needs two samples.
* **Dropped frames** — `outputSkippedFrames / outputTotalFrames`. Shown in red
  above 1%.

## When OBS disconnects

The status bar and Monitoring page go red with the reason, and the app
reconnects on its own with backoff (1s, 2s, 4s, 8s, 15s). Graphics control is
unaffected. Nothing blocks and nothing crashes.
