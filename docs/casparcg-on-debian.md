# Installing CasparCG on Debian 13 (and Parrot, MX, LMDE…)

A reproducible, self-contained install of CasparCG Server on a Debian-based
system that is **not** Ubuntu. Nothing is installed system-wide; the whole thing
lives in one directory you can delete.

> **You probably do not need this guide.**
> On **Windows**, unzip the release — see
> [selected-graphics-package.md](selected-graphics-package.md).
> On **Ubuntu 22.04 or 24.04**, the official packages just work:
> ```bash
> sudo apt install ./casparcg-cef-142_*.deb ./casparcg-server-2.5_*.deb
> ```
> This guide is only for Debian-family systems that are not Ubuntu.

Verified on **Parrot Security 7.3 (Debian 13 "trixie"), x86-64, Mesa/Intel**,
with CasparCG Server 2.5.0 and Media Scanner 1.4.0.

---

## Why it needs a guide

CasparCG's Linux builds are made for Ubuntu 22.04 (jammy) and 24.04 (noble).
They link against **FFmpeg 6**:

```
Depends: libavcodec60, libavformat60, libavutil58, libavfilter9,
         libavdevice60, libswresample4, libswscale7, …
```

Debian 13 ships **FFmpeg 7** (`libavcodec61`, `libavutil59`, …). Those packages
do not exist in the Debian archive, so `apt install ./casparcg-server*.deb`
fails on unmet dependencies.

Forcing Ubuntu's FFmpeg 6 into the system with `dpkg -i --force-depends` is the
wrong fix. It puts a foreign, older FFmpeg beside the one every other program on
the machine links against, and apt will fight you at the next upgrade.

**The fix is to keep FFmpeg 6 private to CasparCG.** Extract the packages into
your own directory and point `LD_LIBRARY_PATH` at them in a launcher script.
CasparCG gets the FFmpeg it wants; the rest of the system never sees it.

Everything else CasparCG needs — Boost 1.83, SFML 2.6, GLEW, TBB, OpenAL,
fonts-liberation, the GL and X11 libraries — is already in Debian 13 at a
compatible version, so only FFmpeg and a handful of codec libraries have to
come from Ubuntu.

## What you end up with

```
~/opt/casparcg/
├── start                 launch scanner + server (this is what you run)
├── casparcg              server launcher (sets LD_LIBRARY_PATH)
├── casparcg-scanner      media scanner launcher
├── root/                 extracted packages: server, CEF, private FFmpeg 6
├── scanner/              CasparCG Media Scanner binary
└── run/                  working directory
    ├── casparcg.config
    ├── template/         ← your HTML graphics templates go here
    ├── media/  data/  log/  cef-cache/
```

Uninstall is `rm -rf ~/opt/casparcg`.

---

## 1. Install the Debian-side dependencies

These are ordinary Debian packages at versions CasparCG accepts:

```bash
sudo apt install \
  libboost-context1.83.0 libboost-coroutine1.83.0 libboost-filesystem1.83.0 \
  libboost-locale1.83.0 libboost-log1.83.0 libboost-thread1.83.0 \
  libsfml-graphics2.6 libsfml-system2.6 libsfml-window2.6 \
  libglew2.2 libtbb12 libopenal1 fonts-liberation \
  libegl1 libglx0 libopengl0 libx11-6
```

To avoid touching the system at all, download them instead and extract them into
the prefix alongside everything else — `apt-get download <pkg>` works without
root:

```bash
apt-get download libboost-context1.83.0 libboost-coroutine1.83.0 \
  libboost-log1.83.0 libsfml-graphics2.6 libsfml-system2.6 \
  libsfml-window2.6 libglew2.2
```

Check what you already have before downloading anything:

```bash
for p in libboost-log1.83.0 libsfml-graphics2.6 libglew2.2 libtbb12 libopenal1; do
  printf '%-26s %s\n' "$p" "$(dpkg -s "$p" 2>/dev/null | grep -m1 ^Status || echo MISSING)"
done
```

## 2. Download everything

```bash
PREFIX=$HOME/opt/casparcg
DL=$(mktemp -d)
mkdir -p "$PREFIX"; cd "$DL"

# CasparCG Server and its CEF build (CEF renders HTML templates)
CCG=https://github.com/CasparCG/server/releases/download/v2.5.0-stable
curl -LO $CCG/casparcg-server-2.5_2.5.0.stable-noble1_amd64.deb
curl -LO $CCG/casparcg-cef-142_142.0.17.g60aac24+2-noble1_amd64.deb

# FFmpeg 6 from Ubuntu noble — private to CasparCG, never installed
FF=http://archive.ubuntu.com/ubuntu/pool/universe/f/ffmpeg
for l in libavcodec60 libavdevice60 libavfilter9 libavformat60 \
         libavutil58 libswresample4 libswscale7 libpostproc57; do
  curl -LO $FF/${l}_6.1.1-3ubuntu5_amd64.deb
done

# Codec libraries that Ubuntu's FFmpeg 6 links, whose sonames Debian 13 lacks
U=http://archive.ubuntu.com/ubuntu/pool
curl -LO $U/universe/j/jpeg-xl/libjxl0.7_0.7.0-10.2ubuntu6_amd64.deb
curl -LO $U/universe/libp/libplacebo/libplacebo338_6.338.2-2build1_amd64.deb
curl -LO $U/universe/r/rust-rav1e/librav1e0_0.7.1-2_amd64.deb
curl -LO $U/main/libs/libssh/libssh-gcrypt-4_0.10.6-2ubuntu0.5_amd64.deb
curl -LO $U/universe/libs/libstb/libstb0t64_0.0~git20230129.5736b15+ds-1.2_amd64.deb
curl -LO $U/universe/s/svt-av1/libsvtav1enc1d1_1.7.0+dfsg-2build1_amd64.deb
curl -LO $U/universe/x/x265/libx265-199_3.5-2_amd64.deb
```

Two of those pool paths are not where you would guess, and cost the most time if
you are working it out yourself:

| Library | Source package | Pool path |
| --- | --- | --- |
| `librav1e.so.0` | **rust-rav1e**, not `rav1e` | `universe/r/rust-rav1e/` |
| `libstb.so.0` | **libstb**, and the binary is `libstb0t64` | `universe/libs/libstb/` |

`libstb0t64` carries the `t64` suffix from Ubuntu 24.04's 64-bit `time_t`
transition. Several noble libraries were renamed that way; if a package name
from an older guide 404s, try it with `t64` appended.

To find any other package by the soname it provides:

```bash
curl -s -o P.gz http://archive.ubuntu.com/ubuntu/dists/noble/universe/binary-amd64/Packages.gz
zcat P.gz | grep -B10 'Filename:.*libstb' | grep -E '^(Package|Filename):'
```

## 3. Extract into the prefix

```bash
for f in *.deb; do dpkg-deb -x "$f" "$PREFIX/root"; done
```

`dpkg-deb -x` unpacks the file tree only. It runs no maintainer scripts and
touches no package database, so this is not an install and apt never learns
about it.

## 4. Confirm every library resolves

Do this before trying to run anything — it turns a cryptic startup failure into
a list of exactly what is missing.

```bash
R=$PREFIX/root
LIBS=$(find $R -name '*.so*' -type f -printf '%h\n' | sort -u | tr '\n' ':')
LD_LIBRARY_PATH="$LIBS" ldd $R/usr/bin/casparcg-server-2.5 | grep 'not found'
```

No output means you are done. Anything listed is a soname you still need: find
the package with the `Packages.gz` grep above, download it, extract it, repeat.

## 5. Configuration

```bash
mkdir -p "$PREFIX/run"/{media,log,data,template,cef-cache}
cat > "$PREFIX/run/casparcg.config" <<'XML'
<?xml version="1.0" encoding="utf-8"?>
<configuration>
    <paths>
        <media-path>media/</media-path>
        <log-path disable="false">log/</log-path>
        <data-path>data/</data-path>
        <template-path>template/</template-path>
    </paths>
    <lock-clear-phrase>secret</lock-clear-phrase>
    <channels>
        <channel>
            <video-mode>1080p5994</video-mode>
            <consumers>
                <screen>
                    <windowed>true</windowed>
                    <width>960</width>
                    <height>540</height>
                </screen>
            </consumers>
        </channel>
    </channels>
    <controllers>
        <tcp>
            <port>5250</port>
            <protocol>AMCP</protocol>
        </tcp>
    </controllers>
    <amcp>
        <media-server>
            <host>127.0.0.1</host>
            <port>8000</port>
        </media-server>
    </amcp>
    <html>
        <cache-path>cef-cache/</cache-path>
    </html>
</configuration>
XML
```

The `<screen>` consumer opens a window showing the channel output; that window is
what OBS captures. Set `<cache-path>` or CEF tries to write its cache next to the
executable and may fail on permissions.

## 6. Launcher scripts

```bash
cat > "$PREFIX/casparcg" <<'SH'
#!/usr/bin/env bash
set -e
PREFIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
R="$PREFIX/root"
export LD_LIBRARY_PATH="$R/usr/lib/casparcg-cef-142:$R/usr/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
cd "$PREFIX/run"
exec "$R/usr/bin/casparcg-server-2.5" "$@"
SH
chmod +x "$PREFIX/casparcg"
```

`LD_LIBRARY_PATH` is set inside the wrapper only. Nothing else on the machine
sees the private FFmpeg 6.

## 7. The Media Scanner — do not skip this

CasparCG does not list templates itself. It hands the AMCP `TLS` and `CLS`
commands to a companion service, the **Media Scanner**, which indexes
`template/` and `media/` and serves them over HTTP on port 8000.

Without it, `TLS` answers `501 TLS FAILED`. The server still works and graphics
still play, but **Sports Broadcast Control cannot populate its template list**,
so Graphics → Template mapping falls back to typing names by hand.

```bash
curl -L -o scanner.tgz \
  https://github.com/CasparCG/media-scanner/releases/download/v1.4.0/casparcg-scanner-v1.4.0-linux-x64.tar.gz
mkdir -p "$PREFIX/scanner"
tar xzf scanner.tgz -C "$PREFIX/scanner"
mv "$PREFIX/scanner"/casparcg-scanner-v1.4.0-linux-x64 "$PREFIX/scanner/casparcg-scanner"
chmod +x "$PREFIX/scanner/casparcg-scanner"

cat > "$PREFIX/casparcg-scanner" <<'SH'
#!/usr/bin/env bash
PREFIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PREFIX/run"
export CASPARCG_PATH="$PREFIX/run"
export SCANNER_PORT="${SCANNER_PORT:-8000}"
exec "$PREFIX/scanner/casparcg-scanner" "$@"
SH
chmod +x "$PREFIX/casparcg-scanner"
```

The archive contains one bare binary, not a directory — do not use
`tar --strip-components=1` on it.

The scanner must run with its working directory set to the folder holding
`casparcg.config`, which is what the wrapper's `cd` does.

## 8. One command to start both

```bash
cat > "$PREFIX/start" <<'SH'
#!/usr/bin/env bash
PREFIX="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if ! pgrep -f "$PREFIX/scanner/casparcg-scanner" >/dev/null; then
  "$PREFIX/casparcg-scanner" >"$PREFIX/run/log/scanner.log" 2>&1 &
  sleep 2
fi
exec "$PREFIX/casparcg" "$@"
SH
chmod +x "$PREFIX/start"

~/opt/casparcg/start
```

A healthy startup logs:

```
Initialized OpenGL 4.6 (Core Profile) Mesa … 
video_channel[1|1080p5994] Successfully Initialized.
Initialized html module.
Screen consumer [1|1080p5994] Initialized.
```

`libDeckLinkAPI.so: cannot open shared object file` is normal and harmless
unless you actually have a Blackmagic card.

## 9. Verify AMCP

```bash
printf 'VERSION\r\nTLS\r\n' | timeout 3 nc 127.0.0.1 5250
```

Expected:

```
201 VERSION OK
2.5.0 N/A Stable
200 TLS OK
SBC-TEST
SPORTS/SCOREBOARD

```

`TLS` lists one bare path per line, terminated by a blank line. Note that 2.5
returns **unquoted, upper-case paths that may contain spaces**; older servers
quoted them and appended a size and timestamp. Sports Broadcast Control accepts
both formats.

To prove a template really renders, drop a file in `run/template/` and run one
command per connection:

```bash
printf 'CG 1-20 ADD 1 "SBC-TEST" 1 "<templateData/>"\r\n' | timeout 4 nc 127.0.0.1 5250
printf 'INFO 1\r\n'                                       | timeout 4 nc 127.0.0.1 5250 | grep 'producer>html'
printf 'CLEAR 1\r\n'                                      | timeout 4 nc 127.0.0.1 5250
```

The first returns `202 CG OK`; the second then prints a
`<producer>html</producer>` line, which is CEF actually running your template.
(Grep for it rather than eyeballing `<layer_20>` — every layer also has a
`<background>` block whose producer is `empty`.)

Two things that will waste your time here:

* **The data argument must not be empty.** `CG … ADD 1 "SBC-TEST" 1 ""` is
  rejected with `402 CG ADD FAILED`; pass `"<templateData/>"` instead. (School
  Broadcast Control always sends a real `<templateData>` document, so this only
  bites when testing by hand.)
* **Do not add `nc -q`.** On netcat-openbsd it suppresses the reply entirely and
  you get silence. Plain `nc` with a `timeout` in front works.

## 10. Connect Sports Broadcast Control

**Settings → Graphics**: host `127.0.0.1`, port `5250`, channel `1`,
installation folder `~/opt/casparcg`. Press **Connect**. The status bar should
show the CasparCG version, and **Graphics → Rescan** should list your templates.

Set **Settings → Mode** to *Live production* — Demo mode uses the mock graphics
provider and will not talk to CasparCG.

## 11. Getting the output into OBS

CasparCG renders; OBS composites and streams. Two ways across:

* **Window capture** of the `<screen>` consumer window. No extra software; no
  alpha channel.
* **NDI consumer** — replace `<screen>` with `<ndi><name>CASPAR-GFX</name></ndi>`,
  install the NDI runtime and the OBS NDI plugin, and add an NDI source in OBS.
  Cleaner, and keeps alpha so graphics key over video properly.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `error while loading shared libraries: libX.so.N` | A library is missing from the prefix | Re-run the `ldd` check in step 4 |
| `501 TLS FAILED` | Media Scanner not running | Start it (step 7); check port 8000 |
| `TLS` returns nothing but `200 OK` | Scanner running, `template/` empty | Put templates in `run/template/` |
| Server exits at `Initializing OpenGL Device` | No usable GL context | Needs a real display; check `/dev/dri` and Mesa |
| CEF cache permission errors | `<cache-path>` unset | Set it as in step 5 |
| `apt` wants to remove half the system | You tried `apt install` on the Ubuntu debs | Do not; that is the whole point of this guide |
| Templates listed but nothing on screen | CasparCG output not reaching OBS | Check the screen/NDI consumer and the OBS source |

## Uninstall

```bash
rm -rf ~/opt/casparcg
```

If you installed the step 1 dependencies with `apt`, `sudo apt autoremove` will
offer to take back anything nothing else needs.

## Adapting this to newer versions

Version numbers here will age. When they do:

1. Read `Depends:` from the new server package —
   `dpkg-deb -I casparcg-server-*.deb` — and note the FFmpeg soname versions.
2. Fetch those FFmpeg packages from the matching Ubuntu series
   (`jammy` for 2.4, `noble` for 2.5).
3. Extract, run the `ldd` check in step 4, and fetch whatever it still names.

The method does not change, only the version strings.
