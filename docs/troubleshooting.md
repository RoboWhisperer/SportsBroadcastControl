# Troubleshooting

Start at **Monitoring**. Every service shows a state and a reason, and the
diagnostics log below it says what happened and when. **Export logs** writes the
whole history to a text file.

## Messages on startup and shutdown

| Message | Cause | Status |
| --- | --- | --- |
| `'--ozone-platform=wayland' is not compatible with Vulkan` | Chromium's GPU process under a Wayland session | Fixed — on Wayland only, the app runs without hardware acceleration. Measured on Electron 44: `disable-features=Vulkan`, `DefaultANGLEVulkan`, `VulkanFromANGLE` and `--use-angle=gl` all still log it; nothing but dropping GPU acceleration silences it. It also measured 27 MB smaller and leaves the GPU to OBS. Windows and X11 keep GPU acceleration; pass `--enable-gpu` to force it on under Wayland. |
| `TypeError: Object has been destroyed` when closing | A window handler reached for `webContents` after the window was destroyed | Fixed — the window id is captured when the window is created, so teardown needs nothing live. |
| `libDeckLinkAPI.so: cannot open shared object file` (CasparCG) | No Blackmagic card present | Harmless; ignore unless you have one. |

An unexpected error in the main process is now logged and shown on the
Monitoring page rather than closing the app. A degraded control surface you can
still cut cameras with beats a dead one mid-game — but treat anything that
appears there as a real bug to report, not as noise.

## OBS

| Symptom | Cause | Fix |
| --- | --- | --- |
| `⚠ OBS DISCONNECTED` | WebSocket server off | OBS → Tools → WebSocket Server Settings → Enable |
| Connect fails immediately | Wrong port | Default is 4455 |
| Authentication failed | Wrong password | OBS → Show Connect Info, re-copy |
| Camera take does nothing | No OBS scene mapped | Cameras page → *OBS scene* |
| Scene list empty | Connected to the wrong OBS, or no scenes | Check the host |

## Graphics

| Symptom | Cause | Fix |
| --- | --- | --- |
| `GRAPHICS SERVER OFFLINE` | CasparCG not running | Start `casparcg.exe` |
| Connects then drops every few seconds | Health poll failing | Read the CasparCG console; usually a bad channel config |
| `Template unavailable` | Role not mapped | Graphics → Template mapping |
| `Mapped template X is not installed` | Pack removed or renamed | Rescan, re-map |
| Rescan finds nothing | Wrong `template-path`, or no templates installed | Check `casparcg.config`, see [templates.md](templates.md) |
| Template list empty but graphics still play | CasparCG Media Scanner not running, so `TLS` returns `501` | Start the scanner; meanwhile type template names by hand in Template mapping |
| Graphic takes, nothing on screen | CasparCG output not reaching OBS | Check the NDI/screen consumer and the OBS source |
| Graphic shows, fields blank | Wrong data format or field names | Switch XML/JSON, then rename fields in the mapping |
| Two graphics replace each other | Same layer | Give each role its own layer |

## Cameras

| Symptom | Cause | Fix |
| --- | --- | --- |
| `⚠ CAM 3 OFFLINE` | Source not advertising | Check power and network |
| NDI source never appears | Different subnet, or mDNS blocked | Same subnet, or map by hand |
| Wrong camera goes offline | Source name mismatch | Use **Assign** beside the discovered source |
| A camera flickers online/offline | Weak network | Check the switch and cabling |

## Replay

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Replay buffer is not running` | Buffer off | Press **START BUFFER** before the game |
| Replay shows the wrong moment | Buffer shorter than requested | Increase it in OBS → Output → Replay Buffer |
| `OBS did not report a saved clip path yet` | Save still in flight | Wait a second and retry |
| `Replay scene / media source not configured` | Not set up | Settings → Replay |
| Replay plays at full speed | Media source is not an ffmpeg source | Use a Media Source, not a browser or capture |

## Pictures

| Symptom | Cause | Fix |
| --- | --- | --- |
| Tiles say `waiting…` | OBS not connected, or the scene has just appeared | Check the OBS row on Monitoring |
| Tiles look stale | Normal: only program and preview refresh every 2s, the rest rotate | Use OBS Multiview if you need full motion |
| An OS "Share Screen" prompt appears | Not from this app — it never captures anything | Check what else is running |

## The whole computer is slow when the app runs

Check memory before suspecting the app:

```bash
free -h
grep -E 'MemAvailable|SwapTotal' /proc/meminfo
```

The app costs roughly **230 MB across nine processes** — that is Chromium's
baseline for any Electron application, not a leak. It is a problem only when the
machine has little left.

| Reading | Meaning |
| --- | --- |
| `MemAvailable` under ~1 GB | Anything you launch will thrash. Close something, or add swap. |
| `SwapTotal: 0` | With no swap, running out of RAM **freezes** the desktop rather than slowing it. A swap file is worth having even on a fast machine. |
| `kswapd0` high in `top` | The kernel is thrashing to reclaim memory. Confirms the above. |

Remember the whole rig's budget: OBS with several sources, CasparCG with a
screen consumer and CEF (~360 MB, rendering continuously), the Media Scanner and
this app all run at once. On a 16 GB production PC that is comfortable; on a
laptop already running a browser and a chat client it is not.

What the app does to stay cheap:

* **No scene stills unless something is showing them.** Capture stops when the
  window is hidden or minimised, or when the open page has no pictures — only
  Production and Scenes ask OBS for stills. Cached frames are released too.
* **A small state push.** The renderer is updated about once a second while OBS
  is polled. Logs and sport profiles were 89% of that payload and change almost
  never, so they travel on a separate channel and are sent only when they
  change: 55 kB per push became 6 kB.
* **No browser background services.** Translation, cast discovery, component
  updates, autofill and optimisation-hint downloads are all disabled — this app
  only ever loads local pages.

### Measured footprint

Use PSS, not RSS: Chromium shares a great deal of memory between its processes,
and summing RSS counts those pages once per process. On this build, summed RSS
read 773 MB while the true figure was:

| Configuration | Processes | PSS |
| --- | --- | --- |
| With GPU acceleration | 7 | **251 MB** |
| Without (the Wayland default, or `--disable-gpu`) | 8 | **224 MB** |

On Windows, where GPU acceleration stays on, `--disable-gpu` is worth trying on
a shared laptop and unnecessary on a dedicated production PC:

```
"Sports Broadcast Control.exe" --disable-gpu
```

## Stream

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dropped frames red | Not enough upload | Lower the bitrate in OBS |
| Bitrate blank for a second | A rate needs two samples | Normal |
| Stream will not start | Destination not configured | OBS → Settings → Stream |

## Control API

| Symptom | Cause | Fix |
| --- | --- | --- |
| `401 unauthorized` | Missing or wrong token | Settings → Show token |
| Stream Deck button does nothing | Wrong port or *Access in background* off | Check both |
| Another device cannot reach it | Bound to localhost | Settings → *Allow other devices on the LAN* |
| API did not start | Port in use | Change the port, then **Restart API** |

## Nothing works and the game starts in five minutes

Set **Settings → Mode** to *Demo / test*, confirm the app itself is fine, then
bring services back one at a time. Recording in OBS by hand always beats
debugging on air — you can produce the whole show from OBS directly and use this
app only for the scoreboard.
