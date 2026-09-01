# Stream Deck and the local control API

There is no native Stream Deck plugin. Instead the app exposes a small local
HTTP + WebSocket API, which the Stream Deck **System → Website** action can call
directly. Any other controller, tablet or script can use the same API.

## Enabling it

**Settings → Local control API**: enabled by default on port `7788`, bound to
`127.0.0.1`. Copy the token from **Show token**.

Every request needs it, either way:

```
?token=YOURTOKEN
Authorization: Bearer YOURTOKEN
```

Tokens are compared in constant time. Unauthenticated requests get `401` for
every path, including ones that do not exist.

## Stream Deck setup

Add a **System → Website** action, tick *Access in background*, and set the URL:

```
http://127.0.0.1:7788/api/cameras/1/take?token=YOURTOKEN
```

Triggers accept both `GET` and `POST` precisely because the Stream Deck website
action can only issue `GET`.

## Endpoints

| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/status` | Everything: OBS, graphics, replay, cameras, game |
| GET | `/api/cameras` | Configured cameras and their state |
| GET/POST | `/api/cameras/:id/take` | Take that camera to program |
| GET | `/api/scenes` | Scene list, program, preview, studio mode |
| GET/POST | `/api/scenes/:name/take` | Switch scene |
| GET/POST | `/api/scenes/:name/preview` | Load a scene into preview (Studio Mode only) |
| GET/POST | `/api/transition` | Cut preview to program |
| GET/POST | `/api/studio/on` \| `/api/studio/off` | Toggle OBS Studio Mode |
| GET/POST | `/api/stream/start` \| `/stop` | Streaming |
| GET/POST | `/api/record/start` \| `/stop` | Recording |
| GET/POST | `/api/replay/buffer/start` \| `/stop` | Replay buffer |
| GET/POST | `/api/replay/save` | Save a clip |
| GET/POST | `/api/replay/play` | Roll a replay (`?seconds=&speed=` or JSON body) |
| GET/POST | `/api/replay/live` | Return to live |
| GET | `/api/game` | Game state |
| PATCH | `/api/game` | Update game state (JSON body, validated) |
| GET | `/api/graphics` | Engine, status, templates, on-air roles, mappings |
| GET/POST | `/api/graphics/:role/play` | Take a graphic live (JSON body = fields) |
| GET/POST | `/api/graphics/:role/stop` | Take it off |
| GET/POST | `/api/graphics/clear` | Clear every layer |
| GET/POST | `/api/emergency/safe` | Cut to the safe scene |
| GET/POST | `/api/emergency/mute` | Mute the venue mic |

Examples:

```bash
curl "http://127.0.0.1:7788/api/cameras/2/take?token=$T"
curl -X PATCH -H 'content-type: application/json' \
     -d '{"homeScore":42,"period":"Q3"}' \
     "http://127.0.0.1:7788/api/game?token=$T"
curl -X POST -H 'content-type: application/json' \
     -d '{"line1":"Noah Smith","line2":"Guard"}' \
     "http://127.0.0.1:7788/api/graphics/lowerThird/play?token=$T"
```

## WebSocket events

```
ws://127.0.0.1:7788/ws?token=YOURTOKEN
```

Sends a full `{ type: 'state', state }` snapshot on connect, then named events:
`camera.status`, `obs.status`, `obs.sceneChanged`, `obs.streamStarted`,
`obs.streamStopped`, `obs.recordingStarted`, `obs.recordingStopped`,
`obs.previewChanged`, `replay.saved`, `graphics.connected`, `graphics.disconnected`,
`graphics.played`, `graphics.stopped`, `game.updated`, `system.warning`.

Use these to light up a tally on a custom controller.

## Security

Bound to localhost unless you turn on *Allow other devices on the LAN*. Turn it
on only on a trusted production network, and never port-forward it. Every body
is schema-validated before it reaches an action. The API can be disabled
entirely.

Camera thumbnails are **not** exposed over this API. `GET /api/status` is safe
to poll once a second from a controller.
