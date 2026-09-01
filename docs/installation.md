# Installation

## 1. Sports Broadcast Control

Run the NSIS installer, or use the portable `.exe` from `release/`. The
installer creates Start Menu and desktop shortcuts. Configuration, the SQLite
database and logs are created on first run in
`%APPDATA%\sports-broadcast-control\`.

On Debian or Ubuntu, install the `.deb` from the releases page:

```bash
sudo apt install ./sports-broadcast-control_1.0.0_amd64.deb
```

Or run the AppImage directly, with no installation:

```bash
chmod +x "Sports Broadcast Control-1.0.0.AppImage"
./"Sports Broadcast Control-1.0.0.AppImage"
```

Build it yourself:

```bash
npm install
npm run dist            # every target for the current platform
npx electron-builder --linux deb    # just the deb
```

There is no native module to compile. SQLite comes from Node's built-in
`node:sqlite`, so `npm install` never touches a C++ toolchain.

## 2. OBS Studio

1. Install from <https://obsproject.com/> (30 or newer).
2. **Tools → WebSocket Server Settings** → *Enable WebSocket server*.
3. Note the port (4455) and **Show Connect Info** for the password.
4. Create your scenes. This app switches between them; it does not create them.
   A workable starting set:

   ```
   CAM 1        CAM 2        CAM 3        CAM 4
   REPLAY       SAFE / SLATE
   ```

5. **Settings → Output → Replay Buffer** → enable it and set the length
   (20 seconds is a good default for school sports).
6. Add a **Media Source** named `Replay Clip` to the `REPLAY` scene. Leave the
   file blank; the app fills it in. Untick *Restart playback when source becomes
   active* only if you know why.

## 3. CasparCG Server (optional, for graphics)

See [selected-graphics-package.md](selected-graphics-package.md) for the full
procedure and for why this package was chosen.

### Windows

Unzip the release, check `casparcg.config`, start the Media Scanner, run
`casparcg.exe`, and get its output into OBS via NDI or a window capture.

### Linux

Official builds target **Ubuntu 22.04 / 24.04** and depend on **FFmpeg 6**. On
Ubuntu, `apt install ./casparcg-cef-*.deb ./casparcg-server-*.deb` is enough.

On Debian 13 and derivatives such as Parrot, FFmpeg 6 is not available — the
distribution ships FFmpeg 7 — so the official packages will not install. Follow
[casparcg-on-debian.md](casparcg-on-debian.md), a step-by-step guide to a
self-contained install that keeps FFmpeg 6 private to CasparCG and leaves the
system package set untouched.

## 4. NDI tools (optional)

If your cameras or encoders are NDI, install the NDI Tools runtime from
<https://ndi.video/tools/>. This app discovers NDI sources over mDNS and does
not decode NDI video itself — OBS does that, via its NDI plugin.

## 5. First run

The setup wizard walks through production name, OBS, graphics, templates,
cameras, venue, sport and a connection test. You can skip it and use Settings
instead, or run through it in Demo mode with nothing connected.

## Offline operation

After the three programs are installed, nothing needs the Internet except the
outgoing stream. Cameras, OBS control, graphics, scoreboard, replay, recording,
monitoring, configuration and checklists all keep working if the connection
drops.
