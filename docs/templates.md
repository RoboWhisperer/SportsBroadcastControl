# Graphics templates

Sports Broadcast Control does not render graphics and does not ship templates.
It maps the graphics *it knows about* onto templates *you install*.

## Why no templates are bundled

Every free CasparCG sports template pack reviewed for this project either has no
`LICENSE` file at all or unclear redistribution terms. Shipping them would be a
licensing problem for your school, so the app ships the mapping layer instead
and stays useful with any pack.

## Installing a pack

1. Put the template files under CasparCG's template folder, normally
   `<CasparCG>\template\`. Subfolders are fine and become part of the name:
   `template\SPORTS\SCOREBOARD.html` is reported as `SPORTS/SCOREBOARD`.
2. In the app, open **Graphics → Rescan**. The app runs `TLS` and lists
   everything CasparCG can see.
3. Open **Graphics → Template mapping** and point each role at a template.

## Packs that were actually checked

Surveyed September 2026. Most CasparCG template repositories have **no licence
file at all**, which is why nothing is bundled with this app. These were opened
and read, not just listed:

| Pack | Licence | Verdict |
| --- | --- | --- |
| [crazyscot/casparcg-client](https://github.com/crazyscot/casparcg-client) `template/mediary/` | **MIT** | **Recommended.** Nine sports templates, correct CasparCG contract, all dependencies vendored locally |
| [xtv-online/football-graphics](https://github.com/xtv-online/football-graphics) | GPL-3.0 | **Not compatible.** Its templates have no `update()`/`play()`/`stop()`; they are driven by the project's own WebSocket app, not by AMCP |
| [k4kfh/casparcg-html-templates](https://github.com/k4kfh/casparcg-html-templates) | GPL-3.0 | Learning framework only — hello-world and a weather demo, not a production pack |
| [chrisryanouellette/CasparCG-Guide-HTML-Template](https://github.com/chrisryanouellette/CasparCG-Guide-HTML-Template) | MIT | One worked example, paired with a good [written guide](https://chrisryanouellette.gitbook.io/casparcg-html-template-guide) |
| [Streamshapers/Ferryman](https://github.com/Streamshapers/StreamShapers-Ferryman) | AGPL-3.0 | A *tool*, not a pack: converts Lottie/After Effects animations into CasparCG HTML templates |
| [mariokaufmann/zagreus](https://github.com/mariokaufmann/zagreus) | MIT | Actively maintained framework for building web graphics templates |

A GPL or AGPL licence is not a problem for a school: you install the templates
into your own CasparCG, you do not redistribute them, and this app never links
to them. It is only a problem for *bundling*, which is why we do not.

### The recommended pack in detail

`crazyscot/casparcg-client` contains `template/mediary/`:

```
scorebug.html        score_lowerthird.html   scoreextra.html   scorehistory.html
lowerthird.html      lt_banner.html          lt_picture.html
creditscrawl.html    timer/countdown_timer.html
```

Why it passes where others fail:

* **MIT licensed**, with the licence file present.
* **Implements the real contract** — `play()`, `stop()`, `update(str)`.
* **Works offline.** GSAP, the Poppins and Droid Sans fonts, the CSS and the
  logo are all vendored in the repository. Every reference is relative; nothing
  is fetched from a CDN, which matters because the production rig must work with
  the Internet down.
* **Fails gracefully.** `update()` falls back to sample data if it is handed
  something that is not JSON, so a mis-set data format shows placeholder text
  rather than a blank frame.

Install it by copying `template/mediary` into your CasparCG `template/` folder,
then **Graphics → Rescan**. It appears as `MEDIARY/SCOREBUG`, `MEDIARY/LOWERTHIRD`
and so on.

### Mapping it to this app

These templates parse **JSON**, not `templateData` XML, so set
**Data format: JSON** for every role you map to them. Then rename the fields:

| Role | Template | Field renames |
| --- | --- | --- |
| Scoreboard | `MEDIARY/SCOREBUG` | `homeAbbr`→`team1`, `homeScore`→`score1`, `awayAbbr`→`team2`, `awayScore`→`score2`, `homeColor`→`team1bg`, `awayColor`→`team2bg`, `period`→`extra` |
| Lower third | `MEDIARY/LOWERTHIRD` | `line1`→`name`, `line2`→`title` |
| Player intro | `MEDIARY/LT_BANNER` | `name`→`name`, `position`→`title` |
| Sponsor | `MEDIARY/LT_PICTURE` | `name`→`name` |

Two limits worth knowing before you rely on it:

* The scorebug takes one free-text `extra` field, so you can show the period
  **or** the clock, not both. Mapping `period`→`extra` is the usual choice.
* `team1fg`/`team2fg` (text colours) have no equivalent in this app's game
  state, so the template's own defaults apply.

Other places to look, if none of the above suit:

* <https://github.com/topics/casparcg-template>
* The CasparCG community forum, <https://casparcgforum.org/>
* CasparCG Server's own `template` folder, which contains examples

Check the licence of anything you install before a public broadcast.

## Roles the app can drive

| Role | Typical use | Fields sent |
| --- | --- | --- |
| `scoreboard` | Persistent score bug | full game state, updated live |
| `lowerThird` | Name and title strap | `line1`, `line2` |
| `playerIntro` | Single player card | `name`, `number`, `position`, `year` |
| `startingLineup` | Line-up list | `title`, `line1`…`line5` |
| `coach` | Coach card | `name`, `title` |
| `sponsor` | Sponsor bug or full frame | `name`, `message` |
| `fullscreen` | Full-frame graphic | `title`, `subtitle` |
| `halftime` | Halftime slate | `title` |
| `final` | Final score slate | `title` |
| `firstDown` | Football first down | `title` |
| `touchdown` | Football touchdown | `title` |

Roles you have no template for stay unmapped. The app disables them and says so
rather than failing silently at air time.

## Mapping a role

Each row in **Graphics → Template mapping** has:

* **Template** — the path exactly as `TLS` reported it.
* **Layer** — the CasparCG layer this role occupies. Every role needs its own
  layer, otherwise taking one graphic live removes another. Defaults are 20–30.
* **Data format** — `templateData XML` (the CasparCG convention, and what most
  templates expect) or `JSON`. If your template's `update()` does
  `JSON.parse(...)`, choose JSON.

### Field names

The app sends the field names in the table above. If your template expects
different ones, rename them in the mapping's field table rather than editing the
template — for example `name` → `f0`.

## Writing your own template

If you cannot find a pack that fits, a CasparCG HTML template is a plain web
page that exposes four global functions:

```html
<script>
  function update(data) { /* data is the string this app sent */ }
  function play()   { /* animate in  */ }
  function stop()   { /* animate out */ }
  function next()   { /* optional */ }
</script>
```

Writing a template is authoring content for CasparCG, not building a graphics
engine — CasparCG still does all the rendering. Keep them in your own
repository, not in this one.

## Replacing a pack later

Drop the new files into CasparCG's template folder, press **Rescan**, and
re-point the mappings. Nothing else in the app changes: game state, presets,
venues, hotkeys and Stream Deck buttons all keep working, because they refer to
roles, never to templates.
