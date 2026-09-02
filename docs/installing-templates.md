# Installing graphics templates

Step by step, from a fresh CasparCG to a scoreboard on air. Fifteen minutes the
first time.

If you have not chosen a pack yet, start with
[recommended-templates.md](recommended-templates.md). This guide uses the one
recommended there, but the steps are the same for any pack.

## Before you start

Three things must already be true:

| | Check |
| --- | --- |
| CasparCG is installed | You can run it and it prints `Initialized modules` |
| CasparCG is **running** | Leave its console window open for the whole session |
| The **Media Scanner** is running | Without it, `TLS` answers `501` and the app cannot list templates |

The Media Scanner catches people out. CasparCG does not list templates itself —
it hands that job to a companion service. If you skip it, everything else works
and the template list is simply always empty. See
[selected-graphics-package.md](selected-graphics-package.md) to install it, or
on Debian-family Linux [casparcg-on-debian.md](casparcg-on-debian.md), where
`~/opt/casparcg/start` launches both.

---

## Step 1 — Find your template folder

CasparCG reads it from `template-path` in `casparcg.config`:

```xml
<paths>
    <template-path>template/</template-path>
</paths>
```

That path is **relative to the folder CasparCG runs from**, not to the config
file. In practice:

| Platform | Typical location |
| --- | --- |
| Windows | `C:\Broadcast\CasparCG\template\` |
| Linux (per [casparcg-on-debian.md](casparcg-on-debian.md)) | `~/opt/casparcg/run/template/` |

If you are unsure, ask the server:

```
printf 'INFO PATHS\r\n' | timeout 4 nc 127.0.0.1 5250
```

Create the folder if it does not exist.

## Step 2 — Get a pack

```bash
curl -L -o pack.tar.gz https://github.com/crazyscot/casparcg-client/archive/refs/heads/master.tar.gz
mkdir -p pack && tar xzf pack.tar.gz -C pack --strip-components=1
```

Check the licence before a public broadcast. A repository with no `LICENSE`
file grants no rights, however good it looks.

## Step 3 — Copy it into the template folder

Copy the folder that contains the `.html` files, keeping its structure — the
templates reference their own `js/`, `css/` and `fonts/` folders by relative
path, so moving the `.html` files out on their own breaks them.

```bash
cp -r pack/template/mediary "<CasparCG>/template/MEDIARY"
```

**Folder names become part of the template name.** CasparCG reports a template
by its path under `template/`, upper-cased and with forward slashes:

| File on disk | Template name |
| --- | --- |
| `template/MEDIARY/scorebug.html` | `MEDIARY/SCOREBUG` |
| `template/MEDIARY/timer/countdown_timer.html` | `MEDIARY/TIMER/COUNTDOWN_TIMER` |
| `template/hello.html` | `HELLO` |

Pick folder names you are happy to live with: renaming later changes every
template name and breaks your mappings.

## Step 4 — Confirm CasparCG can see them

In the app: **Graphics → Rescan**. The templates should appear in the list, and
in the dropdowns under **Template mapping**.

To check without the app:

```
printf 'TLS\r\n' | timeout 4 nc 127.0.0.1 5250
```

A healthy answer looks like this — one bare path per line, terminated by a blank
line:

```
200 TLS OK
MEDIARY/CREDITSCRAWL
MEDIARY/LOWERTHIRD
MEDIARY/SCOREBUG
MEDIARY/TIMER/COUNTDOWN_TIMER

```

Two things to know about that output: names are **upper-cased**, and they may
contain **spaces** (`SPORTS/LOWER THIRD`) — both are normal, and the app handles
both.

If you get `501 TLS FAILED`, the Media Scanner is not running. If you get
`200 TLS OK` and nothing else, the scanner is running but looking at a different
folder than the one you copied into.

## Step 5 — Map the roles

**Graphics → Template mapping**. For each graphic you want:

| Column | What to set |
| --- | --- |
| **Template** | Pick from the list. It only offers what CasparCG reported. |
| **Layer** | A CasparCG layer, unique per role. Defaults are 20–30. Two roles on the same layer will replace each other on air. |
| **Data format** | `templateData XML` or `JSON` — **whichever the template expects** |

Getting the data format wrong is the usual cause of "the graphic appears but all
the fields are empty". To find out which a template wants, look inside its
`update()`:

```bash
grep -A3 "function update" <CasparCG>/template/MEDIARY/scorebug.html
```

`JSON.parse(str)` means **JSON**. Reading `<templateData>` or parsing XML means
**templateData XML**.

### Field names

The app sends fixed field names — `line1`, `name`, `homeScore` and so on, listed
in [templates.md](templates.md). If the template expects different ones, rename
them in the mapping's field table rather than editing the template, so the pack
stays upgradeable. The mapping for the recommended pack is written out in
[recommended-templates.md](recommended-templates.md).

## Step 6 — Prove it renders

In the app: **Graphics**, pick the role, fill in a field, **TAKE LIVE**. It
should appear on the CasparCG output.

To test without the app, one command per connection:

```
printf 'CG 1-20 ADD 1 "MEDIARY/SCOREBUG" 1 "{\"team1\":\"LIN\",\"score1\":\"42\"}"\r\n' | timeout 4 nc 127.0.0.1 5250
printf 'INFO 1\r\n'  | timeout 4 nc 127.0.0.1 5250 | grep 'producer>html'
printf 'CLEAR 1\r\n' | timeout 4 nc 127.0.0.1 5250
```

The first returns `202 CG OK`; the second prints a `<producer>html</producer>`
line, which is CEF actually running your template.

Two traps when testing by hand:

* **The data argument must not be empty.** `… ADD 1 "MEDIARY/SCOREBUG" 1 ""` is
  rejected with `402 CG ADD FAILED`. Pass `"<templateData/>"` or real JSON. The
  app always sends a real document, so this only bites manual testing.
* **Do not add `nc -q`.** On netcat-openbsd it suppresses the reply and you get
  silence. Plain `nc` with a `timeout` in front works.

Remember the graphic still has to reach OBS — CasparCG renders it, and OBS
composites it. See [selected-graphics-package.md](selected-graphics-package.md)
for the NDI or window-capture route.

---

## Adding or replacing a pack later

1. Copy the new files into the template folder.
2. **Graphics → Rescan**.
3. Re-point the affected roles under **Template mapping**.

Nothing else changes. Presets, hotkeys, venues and Stream Deck buttons all refer
to *roles*, never to template names, so swapping a pack never touches them.

To remove a pack, delete its folder and rescan. Any role still pointing at a
template that has gone is disabled and says so, rather than failing silently at
air time.

## When it does not work

| Symptom | Cause | Fix |
| --- | --- | --- |
| `501 TLS FAILED` | Media Scanner not running | Start it; it listens on port 8000 |
| `200 TLS OK` and nothing else | Scanner is indexing a different folder | Check `template-path`, and that the scanner's working directory is the folder holding `casparcg.config` |
| Rescan finds nothing, but the files are there | CasparCG not running, or the app is pointed at a different host | Check the Graphics row on **Monitoring** |
| `Template unavailable` on a graphic | The role has no template mapped | Map it in Template mapping |
| `Mapped template X is not installed` | Pack removed or renamed | Rescan, then re-point the role |
| Takes live, nothing on screen | CasparCG output is not reaching OBS | Check the NDI or screen consumer and the matching OBS source |
| Appears, but every field is blank | Wrong data format, or different field names | Switch XML/JSON, then rename fields in the mapping |
| Two graphics replace each other | Both mapped to the same layer | Give each role its own layer |
| Template looks unstyled | The `js/`, `css/` or `fonts/` folders were not copied with it | Copy the whole pack folder, not just the `.html` files |
