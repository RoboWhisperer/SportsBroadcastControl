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

## Which pack to install

See **[recommended-templates.md](recommended-templates.md)** for the packs that
were opened and tested, the one worth installing, and a four-check method for
judging any pack you find yourself.

The short version: install
[crazyscot/casparcg-client](https://github.com/crazyscot/casparcg-client)'s
`template/mediary` folder. It is MIT licensed, implements the CasparCG contract,
and vendors all its dependencies so it works offline.

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
