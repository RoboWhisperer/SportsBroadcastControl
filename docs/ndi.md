# NDI

This app treats NDI as a source and control ecosystem, not as video. It
discovers and monitors sources; OBS receives and decodes them. There is no NDI
decoder or encoder here, and there should never be one.

## Discovery

NDI sources advertise themselves over mDNS as `_ndi._tcp`. The app browses for
that service and lists what it finds under **Cameras → Discovered NDI
sources**. This is the same mechanism the NDI SDK uses, so anything visible to
OBS should appear here.

Discovery only reaches the local subnet. Sources behind a router need NDI
Discovery Server, which this app does not manage; map those cameras by hand
instead.

Turn discovery off in **Settings → NDI** if your network floods mDNS.

## Cameras come from OBS

There is no camera list to fill in. Every scene OBS reports becomes a camera
tile; see [sources.md](sources.md). NDI discovery exists for two things: to help
you fill in a health-check address, and to tell you what is on the network
before you add it in OBS.

## Liveness

A camera is only probed when you give its scene a health-check address on the
Sources page. Without one it reports "No health check" rather than pretending to
know.

| Type | How the app decides it is online |
| --- | --- |
| NDI | The address matches a name advertised over mDNS in the last 15 seconds |
| Everything else | A TCP connection to the host and port opens |

RTSP defaults to port 554 and HTTP to 80 when the URL omits one. A camera with
nothing probeable configured keeps its last state rather than flickering.

Cameras are checked every 5 seconds. A change is logged, raises a banner and
updates the checklist row for that camera.

## PTZ

Not implemented. `CameraType.PTZ` exists so PTZ cameras can be labelled and
monitored today. Real control would be an adapter behind the same `Camera`
interface, but no vendor protocol is guessed at here.
