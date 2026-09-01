# Selected graphics package: CasparCG Server

This is the graphics engine Sports Broadcast Control drives in version 1. The
app sends it commands; it renders every pixel of every graphic.

## At a glance

| | |
| --- | --- |
| Package | CasparCG Server |
| Project | <https://casparcg.com/> |
| Source | <https://github.com/CasparCG/server> |
| Download | <https://github.com/CasparCG/server/releases> |
| Version used | 2.5.0 Stable (2.4.3 also works) |
| Licence | GPL-3.0 |
| Runtime | Self-contained Windows build, no installer, no runtime to add |
| Control protocol | AMCP over plain TCP, default port **5250** |
| Offline | Yes — nothing contacts the Internet after download |

## Why this one

The requirement that decides it is **live data**. A scoreboard is useless if the
app can set it up once but cannot change the score. CasparCG's `CG UPDATE`
command is designed for exactly that and is documented in the AMCP
specification.

The obvious alternative, **SPX Graphics Controller** (MIT, easier to install,
ships its own templates), was rejected for version 1 after reading its source.
In the open-source build (`SPX Solo`), the endpoints an external controller
would need — `/api/v1/directplayout`, `/api/v1/gettemplates`,
`/api/v1/getlayerstate`, `/api/v1/rundown/json`, `/api/v1/invokeTemplateFunction`
— all return `501 notInSolo`
([routes/routes-api-v1.js](https://github.com/TuomoKu/SPX-GC/blob/master/routes/routes-api-v1.js)).
The free version can only play, continue and stop the item a human has focused
in its own web UI. That is not something this app can build a scoreboard on.

The rest of the scorecard:

| Criterion | CasparCG |
| --- | --- |
| Free | Yes |
| Open source | Yes, GPL-3.0 |
| Windows 11 | Yes, x64 build published each release |
| Local / offline | Yes |
| Documented control protocol | Yes — AMCP, stable across 2.x |
| Suitable for school sports | Yes; the standard for low-cost live sports graphics |
| Templates available | HTML templates, see [templates.md](templates.md) |
| Maintainable by school staff | Unzip and run one .exe; no services, no database |

The cost is that CasparCG needs a reasonably capable GPU and one more window on
the production PC. For a portable school rig that is an acceptable trade for
being able to change the score.

## Installation

CasparCG is **not bundled**. It is GPL-3.0, and shipping it inside an MIT
installer would put the whole package under the GPL. Install it yourself:

1. Download `casparcg-server-v2.5.0-stable-windows.zip` from the
   [releases page](https://github.com/CasparCG/server/releases).
2. Unzip it to a stable path, for example `C:\Broadcast\CasparCG`.
3. Open `casparcg.config` and confirm the AMCP port and a channel exist:

   ```xml
   <configuration>
     <paths>
       <media-path>media/</media-path>
       <log-path>log/</log-path>
       <template-path>template/</template-path>
     </paths>
     <channels>
       <channel>
         <video-mode>1080p5994</video-mode>
         <consumers>
           <ndi><name>CASPAR-GFX</name></ndi>
         </consumers>
       </channel>
     </channels>
     <controllers>
       <tcp>
         <port>5250</port>
         <protocol>AMCP</protocol>
       </tcp>
     </controllers>
   </configuration>
   ```

4. Run `casparcg.exe`. Leave the console window open during the broadcast.
   On Debian-family Linux that is not Ubuntu, see
   [casparcg-on-debian.md](casparcg-on-debian.md).
5. Get the output into OBS. Either the NDI consumer above plus an NDI source in
   OBS, or a `screen` consumer captured by a Window Capture. NDI is cleaner and
   keeps alpha.
6. In Sports Broadcast Control: **Settings → Graphics**, set host `127.0.0.1`,
   port `5250`, channel `1`, then **Connect**.

## The Media Scanner is required for template discovery

CasparCG does not list templates itself. It delegates the AMCP `TLS` and `CLS`
commands to a companion service, the **CasparCG Media Scanner**, which indexes
the `template/` and `media/` folders and serves them over HTTP on port 8000.

Without it, `TLS` answers `501 TLS FAILED`. The server is still perfectly
usable — `CG ADD/PLAY/UPDATE/STOP` all work — but the app cannot populate the
template list, so **Graphics → Template mapping** falls back to typing template
names by hand. A failed `TLS` never marks the connection unhealthy.

Get it from <https://github.com/CasparCG/media-scanner/releases> (there is a
portable `linux-x64` / `win32-x64` archive as well as a `.deb`) and start it
before the server, with its working directory set to the folder holding
`casparcg.config`.

## Testing it without the app

```
telnet 127.0.0.1 5250
VERSION
TLS
```

`VERSION` returns `201 VERSION OK` followed by a version string such as
`2.5.0 N/A Stable`. `TLS` lists every template, one bare path per line,
terminated by a blank line:

```
200 TLS OK
SBC-TEST
SPORTS/LOWER THIRD
SPORTS/SCOREBOARD

```

Note the format: 2.5 returns **bare, upper-case paths that may contain spaces**.
Older servers quoted them and appended a size and timestamp. The app accepts
both.

## How this app talks to it

Everything goes through `electron/services/amcp.ts` and
`electron/services/graphics.ts`. Commands are exactly as specified in the AMCP
documentation; no endpoint is invented.

| Action | Command sent |
| --- | --- |
| Connect check | `VERSION` |
| Discover templates | `TLS` |
| Take a graphic live | `CG <channel>-<layer> ADD 1 "<template>" 1 "<data>"` |
| Update its data | `CG <channel>-<layer> UPDATE 1 "<data>"` |
| Take it off air | `CG <channel>-<layer> STOP 1` |
| Emergency clear | `CLEAR <channel>` |
| Health poll | `VERSION` every 5 seconds |

`<data>` is a `<templateData>` XML document by default:

```xml
<templateData>
  <componentData id="name"><data id="text" value="Noah Smith" /></componentData>
  <componentData id="number"><data id="text" value="24" /></componentData>
</templateData>
```

CasparCG's HTML producer passes that string straight to the page's
`update("...")` function after escaping it
([`html_cg_proxy.cpp`](https://github.com/CasparCG/server/blob/master/src/modules/html/producer/html_cg_proxy.cpp)),
so the template decides how to read it. Templates that expect JSON instead are
supported: set **Data format: JSON** for that role in Graphics → Template
mapping and the app sends `{"name":"Noah Smith","number":"24"}`.

Each graphics role gets its own CasparCG layer so graphics can stack — a lower
third can appear over a scoreboard without either disturbing the other.

## When it is not there

The app never blocks waiting for CasparCG. If the server is missing or dies:

* the status bar and Monitoring page show it red with the reason,
* graphics buttons are disabled and say why,
* OBS control, replay and recording carry on untouched,
* the app reconnects on its own with backoff (1s, 2s, 4s, 8s, 15s).

## Replacing it later

`GraphicsController` in `electron/services/graphics.ts` is the entire surface
another engine would have to implement — nine methods. `MockGraphics` in the
same file is a complete second implementation and a working example.
