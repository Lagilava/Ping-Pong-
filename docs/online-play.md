# Online play across countries

Online matches are peer to peer (WebRTC through PeerJS). Two things have to
work for players far apart:

1. **Finding each other.** Both browsers register under the room code with
   the free PeerJS broker `0.peerjs.com` **and** three free public MQTT
   brokers (EMQX, HiveMQ, Mosquitto) at the same time. Every handshake
   message goes out through all of them and the first copy to arrive wins, so
   one working service is enough. `0.peerjs.com` alone is a donation-run
   service that sometimes takes minutes to answer or is blocked on school and
   office networks; that used to stop every join. The copies sent through the
   MQTT brokers are encrypted (AES-GCM, keyed by the receiver's id, which only
   the two players know) on hashed topics. This only carries the handshake,
   never the game (`game/js/net/signal-relays.js`).
2. **A route between them.** Each browser asks STUN servers for its public
   address and tries to connect directly. Most home connections manage that
   even across continents. Some networks can't (mobile carriers, strict
   office or school Wi-Fi, networks that block UDP); then a **TURN relay**
   forwards the game traffic, which adds a little delay but always works.

The game ships with Google's and Cloudflare's STUN servers and Metered's free
Open Relay TURN server (ports 80 and 443, UDP, TCP and TLS), using its public
"static auth" secret to make a short-lived login in each browser. PeerJS's own
free TURN relays were shut down in December 2023 and are no longer listed.
Open Relay is shared by everyone and has a monthly limit, so if friends
regularly can't connect, add a relay of your own (Option A below takes five
minutes and is free).

## What players see

- The lobby shows **Great / Good / Playable / Laggy** with signal bars, the
  round trip in ms, jitter (±), packet loss, and **direct** or **via relay**.
  Between countries 150–300 ms ("Playable") is normal.
- While joining, the status line says when it is still trying and when it is
  falling back to a relay. It gives up after 30 seconds with advice, and
  **Try again** retries the same code.
- If the link stalls (for example a phone switching from Wi-Fi to mobile
  data), the match freezes and reconnects by itself, for up to 60 seconds.

## Adding your own TURN relay or broker

Edit `game/js/net/online-config.js`. Everything in that file is sent to every
player's browser, so only use credentials meant to be public: a provider's
frontend key restricted to `lagilava.github.io`, or short-lived logins. Never
put an account password or secret API key there.

**Option A, a credentials URL (recommended).** For example Metered's free
tier (open-relay): create an app, copy the "frontend" API key, lock it to your
domain, and set

```js
iceServersUrl: 'https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=<frontend key>',
```

The game fetches the list once per half hour per tab and uses it ahead of the
built-in servers. Anything that answers with a JSON array of ICE servers (or
`{ "iceServers": [...] }`) works, e.g. a small Cloudflare Worker that turns a
Cloudflare TURN key into short-lived credentials.

**Option B, fixed servers.** Your own coturn server, or a provider's static
login:

```js
iceServers: [
    { urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:443?transport=tcp'],
      username: 'player', credential: 'public-pass' },
],
```

**Own broker.** Run `npx peerjs --port 9000` somewhere public (or any
PeerServer host) and set
`peerServer: { host: 'peer.example.com', port: 443, path: '/', secure: true }`.
Both players must load the same version of the page.

`relayOnly: true` forces every match through TURN; it is only for checking that
a relay works.

**Backup brokers.** `signalRelays` replaces the list of MQTT brokers
(`wss://` URLs of any MQTT 3.1.1 broker that accepts WebSocket clients);
`[]` turns the backup off. Both players must use the same list.

## Testing locally

The two-browser tests run a local PeerServer (`npx peerjs --port 9000`) and a
local MQTT-over-WebSocket broker, and pass them in with
`window.PP_PEER_OPTIONS = { host, port, path, secure: false, relays: ['ws://127.0.0.1:9100/mqtt'] }`.
Point `port` at a closed port to check that matches still start with the
PeerJS broker down.

## Quick match (find a stranger)

**Play online > Quick match** finds an opponent without a code. Pick Classic,
Gravity or Speed. Nothing runs on a server of ours.

- Everyone searching a mode opens a normal room and advertises its code every
  2 s on a public MQTT topic (`ppneon/q1/<mode>`, the same free brokers as the
  signalling backup). When two searchers see each other, the one with the
  larger random id joins the other's room. Adverts older than 8 s are ignored,
  a room that turned out gone or full is skipped for 30 s, and a flood is
  capped (`js/net/quickmatch.js`).
- Rules are fixed (first to 7), names are random handles (no chat), and the
  match starts by itself. After 20 s with nobody else the lobby offers "Play
  the AI instead".
- **Privacy:** the opponent's browser sees your public IP address while you play,
  as with any direct connection. **Hide my IP** sends the game through a TURN
  relay instead (more delay, uses the shared relay's quota).
- **Casual rating** (`js/net/online-rating.js`): Elo-style, stored in this
  browser, used only to pair similar players (the band widens while waiting).
  The host reports the score and nobody can check it, so it is not a ranking.
  Quitting a match in progress counts as a loss; a dropped connection does not.
- **Limits:** the topic is public and unauthenticated, so anyone can publish fake
  adverts (the worst case is wasted seconds or a denial of matchmaking, not
  access to a game). If the public brokers prove unreliable, the lobby can move
  to a small Cloudflare Worker without touching the match code.

## Copy online report

The lobby and its error screen have **Copy online report**: route (direct or
relay), ping and loss, which signalling service answered first, a timeline and
errors, as plain text with the room code masked. Nothing is sent anywhere.
Paste it when something fails on a real network.
