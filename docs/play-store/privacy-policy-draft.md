# Privacy policy (DRAFT, review before publishing)

> Draft written from what the code does as of 2026-11-01. The owner must
> review it, fill in the contact address, and publish it at a public URL
> (for example `https://lagilava.github.io/Ping-Pong-/privacy.html`) before
> adding that URL to the Play Console. This is not legal advice.

**Ping Pong - Neon Edition** ("the game") is made by Lagilava.
Contact: `REPLACE_WITH_CONTACT_EMAIL`. Effective date: `REPLACE_WITH_DATE`.

## What the game stores

- Your settings, unlocked achievements, progress, custom arenas and Ball
  Studio designs are saved **only on your device** (browser storage). They are
  never sent to us. Uninstalling the app or clearing site data deletes them.
- The game has **no accounts, no analytics, no advertising and no tracking**.

## Online play

When you host or join an online match, your device connects directly to the
other player's device (WebRTC). To set this up:

- Your device contacts matchmaking servers that pass the connection details
  between the two players: the PeerJS cloud server (`0.peerjs.com`) and public
  MQTT brokers (`broker.emqx.io`, `broker.hivemq.com`, `test.mosquitto.org`).
- If a direct connection is not possible, traffic may be relayed through a
  TURN server (Metered Open Relay).
- The other player and these services can see your **IP address** and the
  5-character room code. Match data (paddle and ball positions, scores) goes
  between the two players only. There is no chat.

These services are run by third parties under their own privacy policies.
We do not receive or keep any of this data.

## Music links

In Custom mode you can play music from a YouTube, Spotify, SoundCloud or
Apple Music link, or a direct audio URL. The game then loads that service's
player or file, and that service may receive your IP address and set its own
cookies under its own privacy policy. Nothing is loaded unless you add a link.

## Children

The game does not knowingly collect personal information from anyone,
including children.

## Changes

If this policy changes, the new version will be posted at this address with a
new effective date.

---

## Play Console "Data safety" answers (draft)

- Does your app collect or share any of the required user data types? **Yes**,
  only because online play exposes the device IP address to the matchmaking and
  relay services. (Google's guidance: IP addresses sent only to establish a
  connection may fall under the "ephemeral processing" exception; decide with
  the current Console help text.)
- Data types: **App info and performance / Device or other IDs: none.
  Location: none (IP-derived approximate location is not used).**
- Is data encrypted in transit? **Yes** (WebRTC DTLS, WSS/HTTPS signaling).
- Can users request deletion? **Nothing is stored off the device**; clearing
  app data deletes everything.
- Data sold: **No**. Used for advertising: **No**. Account required: **No**.
