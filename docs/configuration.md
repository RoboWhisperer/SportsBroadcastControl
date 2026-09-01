# Configuration

Everything is editable from **Settings**. Nothing is hard-coded; there are no
IP addresses in the source.

## Where it is stored

One SQLite file: `%APPDATA%\sports-broadcast-control\sbc.db`
(`~/.config/sports-broadcast-control/sbc.db` on Linux).

It holds settings, cameras, venues, template mappings, sport profiles,
checklists, game state, window position and the log. Back it up before a season;
copy it to clone a second rig.

Secrets — the OBS password and the API token — are encrypted with the OS
keystore (DPAPI on Windows, Keychain on macOS, libsecret on Linux) and marked
with an `enc:` prefix. On a machine with no keystore they are stored as written
and upgraded automatically the first time one becomes available.

## Nothing is seeded

Cameras, scenes and sources are read from OBS every time it reports a change and
are never stored. A fresh install with OBS switched off shows an empty
Production page, on purpose. See [sources.md](sources.md).

Settings that point at an OBS object — the replay scene and media source, a
venue's safe scene and mic — start blank and are chosen from what OBS has. Where
one is missing, the app offers to create it in OBS rather than guessing a name.

## Session

The first panel on **Settings**.

**Start new game** — clears the score, period and clock to the sport's defaults,
takes any graphic off air and un-ticks the hand-checked rows of the pre-game
checklist. Team names, venue, mappings and every other setting are kept, and the
stream, recording and replay buffer are deliberately left running: between two
games of a double-header the broadcast carries on. The same action is on the
Scoreboard page as **New game**. Both ask for confirmation.

**Run setup wizard again** — reopens the first-run wizard on demand, so you can
walk production name, OBS, graphics, templates, cameras, venue and sport and test
each connection. It only reads and edits settings; opening it resets nothing, and
**Close** leaves at any point.

## General

| Setting | Meaning |
| --- | --- |
| Production name | Shown in the title bar |
| Operator role | Limits which pages are visible. Every role except Administrator hides Settings; **Unlock all pages** in the navigation rail restores it. |
| Interface | *Student* hides Monitoring and Settings. To come back, use **Exit student view** at the bottom of the navigation rail. |
| Mode | *Demo* swaps every integration for a mock; nothing goes to air |
| Venue | Applies a saved set of addresses and the safe scene |
| Sport preset | Applies scoreboard fields, replay defaults and the checklist |

Changing Mode, an OBS address, a graphics address or NDI discovery restarts
every integration.

## OBS

| Setting | Default |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `4455` |
| Password | from OBS → Tools → WebSocket Server Settings |
| Connect on start | Yes |

## Graphics

| Setting | Default |
| --- | --- |
| Host | `127.0.0.1` |
| AMCP port | `5250` |
| Channel | `1` |
| Installation folder | used by the setup guide only |

Per-role template, layer and data format live under
**Graphics → Template mapping**.

## Replay

| Setting | Meaning |
| --- | --- |
| Replay scene | The OBS scene holding the replay media source |
| Media source name | The Media Source the saved clip is loaded into |
| Default duration | Seconds rolled back by the quick-replay buttons |
| Default speed | Percent; 50 is half speed |
| After replay | Return to live automatically, or stay on the replay scene |

The *buffer length* is an OBS setting, not one of these. See [replay.md](replay.md).

## Local control API

| Setting | Default |
| --- | --- |
| Enabled | Yes |
| Port | `7788` |
| Token | generated on first run |
| Network access | This computer only |

See [streamdeck.md](streamdeck.md).

## NDI

Discovery is automatic over mDNS. Turn it off to map sources by hand.

## Keyboard shortcuts

Fully rebindable. Defaults:

```
1 2 3 4          Camera 1-4
R                Replay last (normal speed)
S                Replay last (slow motion)
L                Return to live
F1               Scoreboard
F2               Lower third
F3               Sponsor
F4               Fullscreen graphic
Enter            Take preview to program (Studio Mode)
Esc              Clear all graphics
Ctrl+Shift+R     Toggle recording
Ctrl+Shift+L     Start streaming
```

Command syntax: `camera:ID`, `scene:NAME`, `replay:last|slow|save|live`,
`graphics:ROLE|clear`, `record:toggle`, `stream:start`,
`obs:transition|studio`, `emergency:safe|mute`.

Add a binding at the bottom of the list: focus the dashed box, press the key
combination you want, type the command, press **Add**. The app refuses a key
that is already bound and tells you what has it.

**Stopping a live stream is deliberately not bindable.** It always needs the
on-screen confirmation. Shortcuts are ignored while a text field has focus.

## Program monitor

**Settings → Program monitor** toggles a still of the program scene at the top of
the Production page, refreshed every two seconds from OBS. There is nothing to
configure beyond on or off: the picture comes from `GetSourceScreenshot`, not
from a capture device.

## Checklists

Checklists are stored per **sport and venue** combination, keyed
`checklist:<sport>:<venue>`. Basketball in the gym and football on the field
keep separate lists, and switching between them restores what you had ticked.
A new combination is seeded from the sport profile the first time it is used.

Steps can be added and removed per combination from the Checklist page. Steps
whose text matches a known system check are bound to live status automatically
and cannot be ticked by hand.

## Sport profiles

Seeded on first run for basketball, football, volleyball, soccer, baseball,
softball, wrestling and generic, then stored in the database. Each defines the
scoreboard fields, period structure, clock direction, default timeouts, the
graphics offered, replay defaults and the checklist.
