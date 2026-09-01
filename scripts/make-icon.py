#!/usr/bin/env python3
"""
Generate build/icon.png, the application icon.

The mark is a 2x2 multiview with one cell live: the clearest way to say
"video switcher" in a shape that survives a 16px taskbar. It was chosen over a
play triangle because the triangle turns to mush below 32px.

Colours are sampled from the project artwork (docs/img/logo.jpg):
blue #126FF8 and navy #2E3059 are its two dominant hues. The live cell uses the
same red as the app's own on-air indicator (--color-live, #E01B24), so the icon
and the interface agree.

Geometry was tuned by rendering at 128/48/32/16 and picking the spacing where
four cells stay distinct at 16px. Requires Pillow:  pip install pillow

Two outputs:

  build/icon.png   1024x1024, used for Windows and as the generic source
  build/icons/     one PNG per standard hicolor size, used for the Linux .deb

The directory matters. A .deb that ships only a 1024x1024 icon installs fine but
shows a generic icon in the taskbar, because 1024x1024 is not a size the
freedesktop hicolor theme indexes, so the lookup never finds it. Each size is
rendered from the geometry rather than downscaled from one large PNG, which
keeps the small ones crisp.
"""

from PIL import Image, ImageDraw
from pathlib import Path

BLUE = (0x12, 0x6F, 0xF8)
NAVY = (0x2E, 0x30, 0x59)
RED = (0xE0, 0x1B, 0x24)

SIZE = 1024          # electron-builder derives every other size from this
SS = 4               # supersample factor, for clean antialiased edges
TILE_RADIUS = 0.22   # of the full icon
MARGIN = 0.155       # of the full icon, to the outer edge of the cells
GAP = 0.075          # of the full icon, between cells
CELL_RADIUS = 0.13   # of one cell
LIVE_CELL = 1        # 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right


def render(size: int = SIZE) -> Image.Image:
    n = size * SS
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, n - 1, n - 1], radius=int(n * TILE_RADIUS), fill=NAVY)

    m, g = n * MARGIN, n * GAP
    w = (n - 2 * m - g) / 2
    for i, (x, y) in enumerate([(m, m), (m + w + g, m), (m, m + w + g), (m + w + g, m + w + g)]):
        d.rounded_rectangle([x, y, x + w, y + w], radius=int(w * CELL_RADIUS),
                            fill=RED if i == LIVE_CELL else BLUE)
    return im.resize((size, size), Image.LANCZOS)


# Sizes the freedesktop hicolor theme indexes. 1024 is deliberately absent.
HICOLOR_SIZES = (16, 24, 32, 48, 64, 128, 256, 512)


if __name__ == "__main__":
    build = Path(__file__).resolve().parent.parent / "build"
    (build / "icons").mkdir(parents=True, exist_ok=True)

    render().save(build / "icon.png", "PNG")
    print(f"wrote build/icon.png ({SIZE}x{SIZE})")

    for s in HICOLOR_SIZES:
        render(s).save(build / "icons" / f"{s}x{s}.png", "PNG")
    print("wrote build/icons/ " + ", ".join(f"{s}x{s}" for s in HICOLOR_SIZES))
