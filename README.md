# Musical Roulette

Play short clips from your friends’ Spotify top tracks and guess whose song each one is. Create a room, share its six-digit code, and start once at least two people join. For shared songs, the highest-ranked player is the answer. Faster correct guesses score more.

## Checklist

- [x] Credit the player who ranks a shared track highest and show the other players’ rankings on the reveal.
- [x] Fade in the song reveal and fade out the audio.
- [x] Let every player choose whether to play sound on their own device.
- [x] Explain the game on the homepage.
- [x] Show final scores, all played songs, and a New game button.
- [x] Restore the current room, question, or results after a disconnect or reload.
- [x] Offer a private Spotify playlist of the songs played.

## Run and test

Use Node.js 22 or newer and run `npm ci`, then `npm start` to start Wrangler. `npm test` runs the game and preview resolver unit tests. `npm run test:game` plays a complete local game in two separate Chrome sessions against Miniflare, mocking Spotify and preview providers. Set `CHROME_BIN` if the browser isn’t available as `google-chrome`.

## Deploy

Run `npm run deploy` with Wrangler authenticated to the intended Cloudflare account. The deployment uses a `workers.dev` URL and does not need custom DNS. In the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard), register the exact HTTPS redirect URI `https://<your-worker>.<your-subdomain>.workers.dev/play` for the existing Musical Roulette app. Register `http://127.0.0.1:8787/play` separately only if using live Spotify locally. The app uses Authorization Code with PKCE, `user-top-read`, and `playlist-modify-private`; it needs no Spotify client secret. Development-mode apps require an active Spotify Premium subscription for the app owner and only work with Spotify accounts permitted in that app’s dashboard.

Static files live in `public/`: `/` serves the homepage and `/play` serves both the Spotify callback and game. `POST /api/rooms` creates a room, `POST /api/rooms/:code` joins one, and `/api/rooms/:code/socket` upgrades to a WebSocket. Each room uses one SQLite-backed Durable Object under `ROOMS`, with hibernating WebSockets and alarms for round transitions and expiry. Lobbies and finished games expire after 24 hours. There is no external database, cron job, or paid-only Cloudflare feature.

Spotify supplies the title, artist, album art, URI and, when available, ISRC. The Worker looks for clips among the first 24 usable top-track entries, trying Deezer by ISRC first and then iTunes by exact normalized title and artist. Tracks without a matching clip are left out. Deezer may deny requests from some networks; the fallback is automatic. Sound is off by default and can be turned on from the lobby or during play.

The [Spotify Developer Policy](https://developer.spotify.com/policy) prohibits games, including trivia quizzes, and the [iTunes Search API terms](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/) restrict previews to promoting store content. Confirm provider permission or use licensed alternatives before enabling the public game.

For an API deployment without a Wrangler token, `scripts/embedded-assets.mjs` builds the Worker modules with assets embedded. Use `entry.js` as the main module, the same compatibility date and Durable Object binding as `wrangler.jsonc`, and migration `v1` on the first upload only.
