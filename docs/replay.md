# Replay

Replay is built on the **OBS Replay Buffer**. The app controls it; it does not
implement a replay engine.

## How it actually works

1. OBS continuously buffers the last N seconds. **N is an OBS setting**
   (Settings → Output → Replay Buffer), not one of ours — OBS owns the buffer.
2. Saving writes the whole buffer to a file.
3. The app loads that file into an OBS **Media Source** in the replay scene.
4. It seeks to `clipDuration − requestedSeconds` and plays.
5. Slow motion uses the media source's `speed_percent`, the only speed control
   OBS exposes over the WebSocket.
6. On `MediaInputPlaybackEnded` it returns to the scene that was on program,
   if *After replay* is set to return automatically.

## Set up once

| Where | What |
| --- | --- |
| OBS → Settings → Output | Enable Replay Buffer, set the length (20s is a good default) |
| OBS | A scene for replays, e.g. `REPLAY` |
| That scene | A Media Source, e.g. `Replay Clip`, file left blank |
| App → Settings → Replay | Point *Replay scene* and *Media source name* at those |

## Using it

| Control | Effect |
| --- | --- |
| **START BUFFER** | Starts the OBS replay buffer. Do this before the game. |
| **5 / 10 / 15 SEC** | Save, then roll back that many seconds at the current speed |
| **SAVE** | Write the buffer to disk without going to air |
| **PLAY** | Restart the loaded clip |
| **SLOW 25% / 50% / NORMAL** | Playback speed for the next replay |
| **LIVE** | Back to the program scene |

Hotkeys: `R` replay at normal speed, `S` replay in slow motion, `L` live.

## Limits worth knowing

* **Nothing before the buffer started exists.** This is the single most common
  mistake. Start the buffer before kickoff.
* You cannot replay further back than the OBS buffer length.
* Saving is asynchronous. If OBS has not reported the path yet, the app says so
  rather than rolling a stale clip.
* Trying to save with the buffer off raises a clear error instead of failing
  quietly.

## Demo mode

`MockObs` fakes clip paths and the replay scene switch, so the whole flow is
practisable with no OBS at all.

## Replacing it

`ReplayProvider` in `electron/services/replay.ts` is six methods. A hardware
replay controller would implement the same interface; nothing above it changes.
