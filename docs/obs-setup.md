# Setting up OBS

How to build an OBS scene collection this app can drive. Written for OBS Studio
30 or newer.

**There is no layout you are obliged to use.** The app reads whatever OBS has:
every scene becomes a camera tile, every input appears on the Sources page. You
can point it at an existing collection and it will work. What follows is a
layout that makes the app pleasant to operate, plus the four settings that must
name something real.

## What the app actually requires

Everything else is preference. These four are the only hard dependencies, and
all start blank so nothing is ever guessed:

| Setting | Points at | Needed for |
| --- | --- | --- |
| **Settings → Replay → Replay scene** | An OBS scene | Rolling a replay |
| **Settings → Replay → Media source** | A media source in that scene | Loading the saved clip |
| **Settings → Venues → Safe scene** | An OBS scene | The emergency **SAFE SCENE** button |
| **Settings → Venues → Mic input** | An OBS audio input | The emergency **MUTE MIC** button |

Each is chosen from a list of what OBS reports, and the app offers to create the
replay scene and media source for you if they are missing.

---

## Step 1 — Turn on the WebSocket server

**Tools → WebSocket Server Settings**

1. Tick **Enable WebSocket server**.
2. Leave the port at **4455** unless something else is using it.
3. **Show Connect Info** and copy the password.

In the app, **Settings → OBS**: enter the host (`127.0.0.1` if OBS is on the
same machine), the port and the password, then **Connect**. The status bar
should show the OBS version.

If nothing happens, the server is almost certainly not enabled — that setting
does not persist until OBS closes cleanly, so restart OBS once after ticking it.

## Step 2 — One scene collection per venue

**Scene Collection → New**, named for the place: `Gym`, `Football Field`,
`Press Box`.

The app follows whichever collection is active. Pair each with a venue under
**Settings → Venues**, which stores the OBS address, the safe scene and the mic
for that place, so moving the rig is two dropdowns rather than a reconfiguration.

Use **Profiles** for the *output* settings that differ by venue — bitrate,
resolution, stream key. Collections hold scenes; profiles hold encoding.

## Step 3 — Create the scenes

A workable set for a four-camera school rig:

| Scene | Holds | Why |
| --- | --- | --- |
| `CAM 1` … `CAM 4` | One camera source each | These become the camera buttons |
| `SAFE` | A holding card, logo or slate | Somewhere safe to cut in a hurry |
| `REPLAY` | A media source | Where replays play back |

**Scene names are the app's identity for a shot.** They appear on the Production
page as-is, so name them for the operator (`CAM 1`, `Wide`, `Basket`) rather
than for yourself (`cam1_ndi_final_v2`).

Two rules that follow from that:

* **Rename scenes from the app**, on the **Sources** page, not in OBS. The app
  keeps a friendly label and a hidden flag per scene, keyed by scene name;
  renaming through the app carries those across, renaming in OBS leaves them
  behind and the scene reverts to its raw name.
* Scenes you do not want as camera buttons — `REPLAY`, `SAFE`, a nested graphics
  scene — can be hidden from the Production row with **On Production → Hide** on
  the Sources page. They stay switchable from the Scenes page.

## Step 4 — Add the camera sources

One source per camera scene. Which kind depends on your hardware:

| Camera reaches the PC as | OBS source |
| --- | --- |
| NDI over the network | **NDI Source** (needs the NDI plugin and runtime) |
| HDMI into a capture card | **Video Capture Device** |
| RTSP or SRT stream | **Media Source**, unticking *Local File* |

The app never touches what is inside a scene beyond showing you and letting you
toggle visibility. Framing, filters, colour and audio routing are OBS's job.

Optionally, give each camera a **health check address** on the Sources page —
an NDI source name, or `host:port` — and the app will show a red or green light
for it. Leave it blank and the tile honestly says *No health check* rather than
claiming a camera is fine.

## Step 5 — Audio

Add your microphone as an audio input, and name it something recognisable:
`Announcer Mic` rather than `Mic/Aux`. Then set **Settings → Venues → Mic input**
to it, which is what the emergency **MUTE MIC** button acts on.

OBS's global `Desktop Audio` and `Mic/Aux` appear on the Sources page as inputs
that are "not used in any scene" — that is normal, not a fault.

## Step 6 — The replay buffer

This is the step most often missed, and it cannot be done from the app: **OBS
owns the buffer.**

1. **Settings → Output → Replay Buffer** → tick **Enable Replay Buffer**.
2. Set **Maximum Replay Time** to the longest replay you will ever want.
   20 seconds is a sensible school default.
3. Create the `REPLAY` scene if you have not already, and add a **Media Source**
   to it. Name it something stable, such as `Replay Clip`. Leave the file blank
   — the app fills it in with each saved clip.
4. In the app, **Settings → Replay**: pick that scene and that media source.

If either is missing, the app offers a **Create the missing replay scene and
media source in OBS** button that makes them over the WebSocket and points the
settings at them.

Nothing before the buffer starts exists. Press **START BUFFER** on the Replay
page before kickoff, not after the play you wanted.

## Step 7 — Get the graphics into OBS

CasparCG renders graphics as a separate video output; OBS composites it over
your cameras. Two routes:

| Route | Setup | Trade-off |
| --- | --- | --- |
| **NDI** | `<ndi><name>CASPAR-GFX</name></ndi>` consumer in `casparcg.config`, then an **NDI Source** in OBS | Keeps the alpha channel, so graphics key cleanly over video. Needs the NDI runtime and OBS plugin. |
| **Window Capture** | Capture CasparCG's `<screen>` consumer window | No extra software; **no alpha**, so the graphic arrives on a black background |

NDI is worth the setup for anything going to air.

Because the app switches the *program scene*, a graphics source only appears
over a camera if it is in that camera's scene. Rather than copying it into four
scenes and maintaining four copies, make one scene called `GRAPHICS` holding the
CasparCG source, then add **that scene** as a source inside each camera scene
and drag it above the camera. Edit it once, it changes everywhere.

Nested scenes are shown as such on the Sources page, tagged **NESTED SCENE**, so
the layering stays legible.

## Step 8 — Studio Mode and transitions

Optional, and off by default: a click on a camera cuts straight to air, which is
usually right for one student operating alone.

Turn on **Studio mode** from the Production page and a click loads *preview*
instead; nothing reaches air until **TAKE** or `Enter`. Set the transition and
its duration in OBS as usual — the app triggers whatever transition OBS has
configured.

## Step 9 — Streaming and recording

The app starts and stops these; it does not configure them.

* **Settings → Stream** — your destination and stream key.
* **Settings → Output** — encoder and bitrate. On a machine also running
  CasparCG, prefer a hardware encoder (NVENC, QSV) so the two are not fighting
  for CPU.
* **Settings → Output → Recording** — always record locally as well as
  streaming. It costs nothing and it has saved many broadcasts.

## Verify it

With OBS running and the app connected, check **Monitoring**:

| Row | Should say |
| --- | --- |
| OBS | connected, with the OBS version |
| Cameras | as many scenes as OBS has |
| Replay | *Buffer active* once you press START BUFFER |
| Graphics | connected, if you are using CasparCG |

Then on **Production**: every scene appears as a tile with a picture, clicking
one changes the program, and the pictures update every couple of seconds. If
tiles appear without pictures, OBS is connected but the screenshot request is
failing — see [troubleshooting.md](troubleshooting.md).

## Common mistakes

| Symptom | Cause |
| --- | --- |
| The app never connects | WebSocket server not enabled, or OBS not restarted after enabling it |
| No camera tiles at all | The scene collection is empty, or OBS is not connected |
| A tile shows a scene you do not want on air | Hide it: **Sources → On Production → Hide** |
| A camera's friendly label vanished | It was renamed in OBS instead of from the Sources page |
| `Replay buffer is not running` | Not enabled in **Settings → Output**, or START BUFFER not pressed |
| Replay rolls the wrong moment | The buffer is shorter than the replay you asked for |
| Graphics appear over one camera only | The graphics source is in that scene alone — use the nested `GRAPHICS` scene |
| Graphics arrive on a black rectangle | Window capture has no alpha; switch to NDI |
| Two shots switch but audio does not follow | Audio is routed globally in OBS, not per scene — that is OBS behaviour, not the app |

## Related

* [obs.md](obs.md) — which OBS WebSocket requests the app uses, and why
* [replay.md](replay.md) — how replay works on top of the buffer
* [sources.md](sources.md) — how scenes and sources reach the app
* [installing-templates.md](installing-templates.md) — the CasparCG side
