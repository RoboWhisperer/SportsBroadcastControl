# Scenes

The **Scenes** page shows every scene in the current OBS scene collection with
the picture OBS reports for it, so an operator can pick a shot by looking at it
instead of reading a name.

**OBS still owns the scenes.** Creating them, adding sources, arranging and
resizing — all of that stays in OBS. This page shows what OBS has and asks it to
switch. Nothing here changes a scene's contents.

## Using it

* Click a scene to take it. With **Studio Mode** on, a click loads *preview*
  (green border, `PVW`) and nothing airs until **TAKE** or `Enter`.
* The scene on air has a red border and `PGM`.

The Production page keeps a compact version of the same grid in its right rail,
with a link through to the full list when a collection has more than eight
scenes.

## Where the pictures come from

Stills are `GetSourceScreenshot` requests to OBS — scenes are sources in OBS, so
the same request works for both. That is the only way this app gets a picture:
it never opens a camera, a screen or a capture device, so it never triggers an OS
capture prompt.

Program and preview refresh every two seconds because they are what the operator
is acting on. The remaining scenes rotate through a budget of four per cycle, so
a twenty-scene collection costs OBS exactly as much as a six-scene one; the
tiles further down the list just refresh a little less often.

For full-motion monitoring of everything at once, OBS Multiview on a second
monitor is the right tool. This grid is for picking a shot, not for watching it.

## Creating and editing

Add, rename and remove scenes, and toggle what is inside them, on the
[Sources](sources.md) page. All of it happens in OBS over the WebSocket, so the
change is real and every other OBS client sees it.

## Scene collections

Switching scene collection in OBS changes the whole list. The app follows it and
forgets stills for scenes that no longer exist. Camera mappings refer to scenes
by name, so keep names consistent across the collections you use at different
venues — see [venues.md](venues.md).
