# Administrator guide

For the teacher or IT staff member who sets the system up and keeps it running.

## Install the three programs

Install them separately. Sports Broadcast Control does not bundle or install
third-party broadcast software.

| Program | Where | Notes |
| --- | --- | --- |
| OBS Studio | <https://obsproject.com/> | 30 or newer |
| CasparCG Server | <https://github.com/CasparCG/server/releases> | Unzip, no installer |
| Sports Broadcast Control | Your release build | NSIS installer or portable .exe |

Then follow [installation.md](installation.md).

## Install or replace templates

Full detail in [templates.md](templates.md). The short version:

1. Copy the template files into `<CasparCG>\template\`.
2. In the app: **Graphics → Rescan**.
3. **Graphics → Template mapping**: point each role at a template, give each one
   its own layer, and pick the data format the template expects.

To swap packs later, replace the files, rescan, re-map. Nothing else changes —
presets, hotkeys and Stream Deck buttons all address roles, never templates.

## Configure template field names

The app sends fixed field names (see [templates.md](templates.md)). If a
template expects different ones, rename them in the mapping's field table
instead of editing the template. This keeps the template pack upgradeable.

## Map scoreboard fields

The scoreboard role receives the whole game state on every change:
`home`, `homeAbbr`, `homeColor`, `homeScore`, `away`, `awayAbbr`, `awayColor`,
`awayScore`, `period`, `clock`, `shotClock`, `possession`, `homeFouls`,
`awayFouls`, `homeTimeouts`, `awayTimeouts`, `down`, `distance`, `ballOn`.

Templates ignore fields they do not use. Which fields the operator can *edit* is
set per sport under **Settings → Sport preset**.

## Configure graphics-server settings

**Settings → Graphics**: host, AMCP port (5250), channel, installation folder.
Per-venue overrides live under **Settings → Venues**, so a portable rig can move
between the gym and the press box without retyping addresses.

## Troubleshoot missing templates

| Symptom | Cause | Fix |
| --- | --- | --- |
| `Template unavailable` on a graphic | Role not mapped | Map it |
| `Mapped template X is not installed` | Pack removed or renamed | Rescan, re-map |
| Rescan finds nothing | Wrong `template-path` in `casparcg.config`, or CasparCG not running | Check the config and the console window |
| Graphic takes but nothing appears | CasparCG output is not reaching OBS | Check the NDI or screen consumer and the OBS source |
| Graphic appears but fields are empty | Template expects a different data format or field names | Switch XML/JSON, then rename fields in the mapping |

## Update the graphics package

1. Stop CasparCG and the app.
2. Unzip the new CasparCG release beside the old one.
3. Copy `casparcg.config` and the `template` folder across.
4. Start it, then **Graphics → Rescan** and confirm the templates are still
   listed. AMCP is stable across 2.x, so mappings survive.

## Manage venues and presets

**Settings → Venues** — each venue holds OBS host and port, graphics host, port
and channel, the safe scene and the emergency mic input. Loading a venue applies
all of it at once.

**Settings → Sport preset** — loading a sport changes the scoreboard fields,
period structure, graphics list, replay defaults and the checklist.

**Checklists** are stored per sport *and* venue, so basketball in the gym and
football on the field keep separate lists. Add or remove steps from the
Checklist page; each combination is seeded from the sport profile the first time
it is used.

## Re-running the setup wizard

**Settings → Run setup wizard again**. Useful after moving the rig to a new
venue, changing the OBS machine, or installing a template pack — it walks every
connection in order and reports what is reachable. Nothing is reset by opening
it, and it can be closed at any step.

## Operator roles

**Settings → Operator role** limits which pages are visible:

| Role | Pages |
| --- | --- |
| Administrator | everything |
| Director | production, cameras, replay, scoreboard, graphics, audio, checklist, monitoring |
| Replay operator | production, replay, checklist |
| Graphics operator | scoreboard, graphics, checklist |

**Student mode** additionally hides Monitoring and Settings from every role.

Note that every role except Administrator also hides Settings, and student mode
hides it for all of them — so both are one-way doors unless there is a way back.
There is: while either restriction is on, the bottom of the navigation rail shows
**Exit student view** (or **Unlock all pages**), which asks for confirmation and
then restores administrator access. Nothing about the production changes.

This is a UI guard for a shared machine, not a security boundary. Anyone with the
computer can undo it, by design — being locked out of your own settings is worse
than a student switching the view back.

## Security

* The control API binds to `127.0.0.1` unless you enable LAN access.
* Every request needs the token from **Settings → Local control API**.
* Never port-forward the API to the Internet.
* The OBS password and the API token are stored via the OS keystore (DPAPI on
  Windows). On a machine with no keystore they are stored as written, and the
  app upgrades them automatically the first time one is available.

## Where the data lives

`%APPDATA%\sports-broadcast-control\sbc.db` — one SQLite file holding settings,
cameras, venues, template mappings, sport profiles, checklists, game state and
the log. Back it up before a season; copy it to clone a rig.

Logs are pruned to 30 days. Export them from **Monitoring → Export logs**.
