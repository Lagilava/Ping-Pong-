# Online play across countries

Online matches are peer to peer (WebRTC through PeerJS). Two things have to
work for players far apart:

1. **Finding each other.** Both browsers register with a broker (by default
   the free `0.peerjs.com`) under the room code. This only carries the
   handshake, never the game.
2. **A route between them.** Each browser asks STUN servers for its public
   address and tries to connect directly. Most home connections manage that
   even across continents. Some networks can't (mobile carriers, strict
   office or school Wi-Fi, networks that block UDP); then a **TURN relay**
   forwards the game traffic, which adds a little delay but always works.

The game ships with Google's and Cloudflare's STUN servers and PeerJS's free
TURN relays (UDP and TCP). The free relays are shared by everyone and are not
always up, so if friends regularly can't connect, add a relay of your own.

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
