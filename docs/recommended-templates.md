# Recommended CasparCG templates

This app triggers templates; **CasparCG draws them**. It ships none, because
almost every free pack either has no licence file or cannot be driven by AMCP at
all. This page records what was actually opened and tested, so you do not repeat
the search.

Surveyed September 2026 against CasparCG Server 2.5.0.

---

## The recommendation

### [crazyscot/casparcg-client](https://github.com/crazyscot/casparcg-client) — the `template/mediary/` folder

**MIT licensed.** The only pack surveyed that passes every test below.

```
scorebug.html          score_lowerthird.html   scoreextra.html   scorehistory.html
lowerthird.html        lt_banner.html          lt_picture.html
creditscrawl.html      timer/countdown_timer.html
```

Copy `template/mediary` into your CasparCG `template/` folder and press
**Graphics → Rescan**. The templates appear as `MEDIARY/SCOREBUG`,
`MEDIARY/LOWERTHIRD` and so on. Full walkthrough:
[installing-templates.md](installing-templates.md).

Why it passes:

| Test | Result |
| --- | --- |
| Licence | MIT, file present in the repository |
| CasparCG contract | Implements `play()`, `stop()` and `update(str)` |
| Works offline | GSAP, the Poppins and Droid Sans fonts, the CSS and the logo are all vendored; every reference is relative, nothing from a CDN |
| Data format | JSON — `update()` calls `JSON.parse`, and falls back to sample data if handed something else, so a mis-set format shows placeholder text rather than a blank frame |

Verified by installing it into a real CasparCG 2.5.0: all nine appeared in `TLS`,
and `CG ADD` with live JSON loaded `scorebug.html` as an `html` producer.

### Mapping it to this app

These parse **JSON**, so set **Data format: JSON** for every role you point at
them, then rename the fields under **Graphics → Template mapping**:

| Role | Template | Field renames |
| --- | --- | --- |
| Scoreboard | `MEDIARY/SCOREBUG` | `homeAbbr`→`team1`, `homeScore`→`score1`, `awayAbbr`→`team2`, `awayScore`→`score2`, `homeColor`→`team1bg`, `awayColor`→`team2bg`, `period`→`extra` |
| Lower third | `MEDIARY/LOWERTHIRD` | `line1`→`name`, `line2`→`title` |
| Player intro | `MEDIARY/LT_BANNER` | `name`→`name`, `position`→`title` |
| Sponsor | `MEDIARY/LT_PICTURE` | `name`→`name` |

Two limits worth knowing before you rely on it:

* The scorebug takes a single free-text `extra` field, so you can show the
  period **or** the clock, not both. `period`→`extra` is the usual choice.
* `team1fg` and `team2fg` (text colours) have no equivalent in this app's game
  state, so the template's own defaults apply.

---

## How to judge a pack yourself

Four checks, in the order that eliminates fastest. Most candidates fail the
second.

**1. Is there a `LICENSE` file?** Not a mention in the README — an actual file.
GitHub shows the detected licence on the repository home page. No licence means
no permission to use it, whatever the repository looks like.

**2. Does it implement the CasparCG contract?** Open one template and look for:

```js
function update(str) { … }   // receives the data string
function play()      { … }   // animate in
function stop()      { … }   // animate out
```

```bash
curl -s <raw-url-of-a-template> | grep -cE "function (update|play|stop)"
```

A zero here means the pack is **not driveable by AMCP**, no matter what its
description says. This is the single most common failure, and the reason is
structural: most "CasparCG scoreboard" projects on GitHub are *complete
systems* — their own control server pushing state to the page over WebSocket or
socket.io — rather than template packs. Those templates only work with their own
controller, so this app cannot drive them and neither can any other AMCP client.

**3. Does it work offline?** The production rig must survive the Internet
dropping mid-game.

```bash
curl -s <raw-url> | grep -oE '(src|href)="(https?:)?//[^"]+"'
```

Any output is a CDN reference and a template that will render broken when the
link goes down. Vendored `js/`, `css/` and `fonts/` folders are what you want.

**4. Which data format does it expect?** Look inside `update()`. `JSON.parse`
means set **JSON** in Template mapping; parsing XML, or reading
`<templateData>`, means leave it on **templateData XML**. Getting this wrong is
the usual cause of a graphic that appears but stays empty.

---

## Everything that was checked

| Pack | Licence | Verdict |
| --- | --- | --- |
| [crazyscot/casparcg-client](https://github.com/crazyscot/casparcg-client) | **MIT** | **Use this.** Nine sports templates, correct contract, fully vendored |
| [chrisryanouellette/CasparCG-Guide-HTML-Template](https://github.com/chrisryanouellette/CasparCG-Guide-HTML-Template) | MIT | One worked example, not a pack. Good alongside its [written guide](https://chrisryanouellette.gitbook.io/casparcg-html-template-guide) if you are building your own |
| [xtv-online/football-graphics](https://github.com/xtv-online/football-graphics) | GPL-3.0 | **Cannot be driven.** Soccer scoreboard and cards, but the templates have no `update()`/`play()`/`stop()` — they are fed by the project's own WebSocket app |
| [jaredquinn/scoreboard-engine](https://github.com/jaredquinn/scoreboard-engine) | AGPL-3.0 | **Cannot be driven.** Has AFL, basketball, football and netball scorebugs, but zero contract functions; driven by its own engine |
| [sworrl/SLAP](https://github.com/sworrl/SLAP) | GPL-3.0 | **Cannot be driven.** Hockey overlays fed over socket.io from its own server, and built around a Trans-Lux FairPlay MP-70 controller |
| [k4kfh/casparcg-html-templates](https://github.com/k4kfh/casparcg-html-templates) | GPL-3.0 | **Archived.** Hello-world and a weather demo; a learning framework, never a pack |
| [mariokaufmann/zagreus](https://github.com/mariokaufmann/zagreus) | MIT | A framework with its own server for building and playing out templates, not a pack for AMCP. Actively maintained |
| [Streamshapers/Ferryman](https://github.com/Streamshapers/StreamShapers-Ferryman) | AGPL-3.0 | A *tool*: converts Lottie / After Effects animations into CasparCG HTML templates. Useful if someone at your school animates |
| [indr/webcg-framework](https://github.com/indr/webcg-framework) | MIT | Framework for writing your own templates. Unmaintained since 2020 |
| [hreinnbeck/caspar-templates](https://github.com/hreinnbeck/caspar-templates) | **none** | No licence file |
| [CanterburyMedia/CasparCG-HTML-Templates](https://github.com/CanterburyMedia/CasparCG-HTML-Templates) | **none** | No licence file |
| [JonFreer/CasparCG-LowerThirds](https://github.com/JonFreer/CasparCG-LowerThirds) | **none** | No licence file |

## On licences

A GPL or AGPL pack is fine for a school: you install it into your own CasparCG,
you do not redistribute it, and this app never links to it. Licence only blocks
*bundling*, which is why nothing ships with the installer.

A pack with **no** licence file grants no rights at all. Avoid it for anything
public, however good it looks.

## If none of these suit

* <https://github.com/topics/casparcg-template>
* The CasparCG community forum, <https://casparcgforum.org/>
* CasparCG Server's own `template` folder, which contains examples

Run the four checks above on anything you find, and check the licence before a
public broadcast.

Writing your own is also reasonable: a CasparCG HTML template is a plain web
page exposing `update()`, `play()`, `stop()` and optionally `next()`. That is
authoring content for CasparCG, not building a graphics engine — CasparCG still
does all the rendering. Keep them in your own repository, not in this one.
