# Scenes and sources

Everything the app offers comes from OBS. **If OBS has nothing, the app shows
nothing. If OBS has ten scenes, the app shows ten.** No cameras, scenes or
sources are seeded, guessed or remembered from a previous OBS.

## What is derived, what is stored

| Derived from OBS on every change | Stored by the app |
| --- | --- |
| The scene list, and therefore the camera tiles | A per-scene *annotation*: label, hidden, device type, health-check address |
| The input list and each input's kind | — |
| Each scene's items and their visibility | — |
| The input kinds this OBS build can create | — |

An annotation is an overlay, never a source of truth. Annotating a scene OBS
does not have produces nothing, renaming a scene carries its annotation across,
and deleting a scene deletes the annotation with it.

## A scene entry is not always a source

OBS lets a scene contain another **scene**, and lets several sources be bundled
into a **group**. `GetSceneItemList` returns all three looking much alike — only
the `sourceType` field separates them — so the app labels each entry:

| Entry | Shown as | Meaning |
| --- | --- | --- |
| A source | its OBS input kind, e.g. `ffmpeg_source` | An actual source in this scene |
| Another scene | **NESTED SCENE** | This scene renders that whole scene inside itself |
| A group | **GROUP**, with its contents indented below | A bundle; the app expands it so you see the real sources |

The **Sources in OBS** panel below lists inputs only — scenes are never listed
there, because a scene is not a source. Each input shows which scenes use it, or
"not used in any scene" (OBS's global Desktop Audio and Mic/Aux normally sit
there).

## The Sources page

For each scene OBS reports:

* **Take** it to program, or **Remove** it from OBS.
* **rename** it — this renames the scene *in OBS*, so every other client sees it.
* Toggle each item **ON/OFF** — that is `SetSceneItemEnabled` in OBS. Items
  inside a group are toggled within their group, as OBS expects.
* Annotate it: **Label in app** (blank means use the OBS name), **On Production**
  (show as a camera tile or hide it), **Device type** and **Health check
  address**.

Below that, every input OBS has, with its kind, and a button to remove it from
OBS.

## Adding things to OBS

The right-hand column creates real OBS objects over the WebSocket:

* **Add a scene to OBS** — `CreateScene`.
* **Add a source to OBS** — `CreateInput` into a scene you pick. Only input
  kinds this OBS build reports are offered, so nothing is proposed that your
  OBS cannot make.

**Settings → Replay** has the same escape hatch: if the replay scene or media
source is missing, one button creates both in OBS and points the settings at
them.

## Health checks

A camera tile shows a light only when you have given it something to test:

| Address | Tile shows |
| --- | --- |
| none | **No health check** — grey. Nothing is claimed. |
| an NDI source name | green while that name is advertised on the network |
| `host:port` or an `rtsp://` URL | green while a TCP connection opens |

An unprobed camera is never shown as offline. The **All cameras online**
checklist row only considers cameras that have an address.

Health checks are the app's own probe of the network. They say nothing about
whether OBS is receiving the feed — OBS owns that.

## Discovered NDI sources

Listed for convenience while filling in a health-check address. They are **not**
cameras and **not** in OBS; add them in OBS if you want them on air.
