# Venues and presets

The same portable rig moves between the gym, the field and the press box.
Venues and sport presets stop that from meaning retyping addresses at 6pm.

## Venues

**Settings → Venues**. Each holds:

| Field | Used for |
| --- | --- |
| Name | What the operator picks |
| OBS host / port | Applied to the OBS connection |
| Graphics host / port / channel | Applied to the CasparCG connection |
| Safe scene | The emergency **SAFE SCENE** button |
| Mic input | The emergency **MUTE MIC** button |

Loading a venue applies everything and reconnects. Example set:

```
Lincoln High School Gym
Lincoln High School Football Field
Lincoln High School Press Box
```

## Sport presets

**Settings → Sport preset**, or the selector on the Scoreboard page. Loading one
changes:

* the scoreboard fields and period structure
* the clock direction and default timeouts
* which graphics roles the Graphics page offers
* replay durations, default duration and default speed
* the pre-game checklist

Already-ticked checklist rows survive if the row still exists, so switching
sport late does not wipe your progress.

Shipped: basketball, football, volleyball, soccer, baseball, softball,
wrestling, generic. They live in the database after first run, so they can be
edited per school.

## Checklists

Checklists belong to a sport *and* a venue, keyed `checklist:<sport>:<venue>`.
Basketball in the gym checks different things from football on the field, and
switching between them restores each list as you left it. A combination you have
not used before is seeded from the sport profile.

Add or remove steps from the Checklist page. Steps bound to live system status
are marked **AUTO** and cannot be ticked by hand.

## Cameras

Cameras are global, not per venue, because the same physical cameras travel with
the rig. What changes between venues is the OBS scene each maps to — so keep
scene names consistent across your OBS profiles and nothing needs touching.

## Backup

All of it lives in `%APPDATA%\sports-broadcast-control\sbc.db`. Copy that one
file to back up a season or clone a second rig.
