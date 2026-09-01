# Graphics

Sports Broadcast Control does not render graphics. It triggers templates on
CasparCG and feeds them data. Everything you see on screen is drawn by
CasparCG.

For the engine, its licence and its protocol, see
[selected-graphics-package.md](selected-graphics-package.md). For installing
and mapping templates, see [templates.md](templates.md).

## The model

```
Role  ──mapping──►  Template + layer + data format  ──AMCP──►  CasparCG
```

The app works in **roles** — `scoreboard`, `lowerThird`, `playerIntro` and so
on. A role is what an operator, a hotkey or a Stream Deck button asks for. The
mapping turns that into a specific template on a specific layer. Change the
template pack and only the mapping changes.

## Using it

**Graphics** page: pick a graphic, fill in the fields, **TAKE LIVE**. **CLEAR**
takes that one off; **CLEAR ALL LAYERS** wipes everything.

The scoreboard is special: its fields come from the Scoreboard page and are
pushed to air on every change while it is live.

## Guard rails

* A role with no template mapped is disabled and says so.
* A role mapped to a template the server does not have is disabled and names
  the missing template.
* With the server offline every graphics button is disabled and the panel
  explains why.
* `CLEAR ALL LAYERS` and the **END GRAPHICS** emergency button send
  `CLEAR <channel>`, which removes everything regardless of what the app thinks
  is on air.

## Failure isolation

Graphics run behind a connection state machine with a 4-second command timeout,
a 5-second health poll and backoff reconnection. A graphics failure never
touches OBS control, replay or recording, and never blocks the UI.
