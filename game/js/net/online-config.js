// Online play settings. js/net/online.js loads this file when someone opens
// a room or joins one. Leave it as it is to use the free public servers.
//
// Everything in here ends up in the browser of everyone who plays, so only
// put in credentials that are meant to be public: TURN providers give out
// "frontend" API keys or short-lived logins for exactly this. Never paste an
// account password or a secret API key here.
//
// See docs/online-play.md for when you'd want to change this.
window.PP_ONLINE_CONFIG = window.PP_ONLINE_CONFIG || {
    // Extra STUN/TURN servers, tried alongside the built-in free ones. A TURN
    // relay is what gets two players through strict or mobile networks.
    // Example:
    //   { urls: ['turn:relay.example.com:3478', 'turns:relay.example.com:443?transport=tcp'],
    //     username: 'public-user', credential: 'public-pass' },
    iceServers: [],

    // Or: a URL that answers with a JSON list of ICE servers (or
    // { iceServers: [...] }), e.g. Metered's
    //   https://<your-app>.metered.live/api/v1/turn/credentials?apiKey=<frontend key>
    // Fetched once per half hour per tab; restrict the key to your site's domain.
    iceServersUrl: '',

    // Your own PeerServer (the broker that matches room codes), instead of
    // the free 0.peerjs.com. Example: { host: 'peer.example.com', port: 443, path: '/', secure: true, key: 'peerjs' }
    peerServer: null,

    // true: always go through a TURN relay (only useful for testing relays).
    relayOnly: false,
};
