import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { chromium } from 'playwright-core';
import { embeddedModules } from '../scripts/embedded-assets.mjs';

const track = {
  uri: 'spotify:track:0123456789abcdefghijAB', name: 'Test Song',
  artists: [{ name: 'Test Artist' }], external_ids: { isrc: 'USABC1234567' },
};
const unsafeName = '<img src=x onerror=alert(1)>';

test('two browsers play one complete game with a reconnect and a private playlist', { timeout: 70_000 }, async t => {
  const modules = (await embeddedModules()).map(({ name: path, type, contents }) => ({ path, type, contents }));
  const worker = new Miniflare(convertV4MiniflareOptions({
    modules, compatibilityDate: '2026-11-25', durableObjects: { ROOMS: { className: 'Room', useSQLite: true } },
    outboundService(request) {
      const url = new URL(request.url);
      if (url.hostname === 'api.spotify.com' && url.pathname === '/v1/me/top/tracks') {
        const items = request.headers.get('Authorization') === 'Bearer mockHost' ? [null, track] : [track];
        return Response.json({ items });
      }
      if (url.hostname === 'api.deezer.com') return new Response(null, { status: 403 });
      if (url.hostname === 'itunes.apple.com') return Response.json({
        results: [{ trackName: track.name, artistName: track.artists[0].name, previewUrl: 'https://audio.example/preview' }],
      });
      return new Response('Unexpected mock request', { status: 500 });
    },
  }));
  t.after(() => worker.dispose());
  const origin = (await worker.ready).origin;
  const executablePath = process.env.CHROME_BIN || execFileSync('which', ['google-chrome'], { encoding: 'utf8' }).trim();
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const requests = [];
  const errors = [];
  async function player(token) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://accounts.spotify.com/**', async route => {
      const url = new URL(route.request().url());
      if (url.pathname === '/authorize') {
        assert.equal(url.searchParams.get('redirect_uri'), `${origin}/play`);
        assert.equal(url.searchParams.get('response_type'), 'code');
        assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
        assert.match(url.searchParams.get('scope'), /playlist-modify-private/);
        return route.fulfill({ status: 302, headers: {
          location: `${origin}/play?code=mockCode&state=${url.searchParams.get('state')}`,
        } });
      }
      const body = new URLSearchParams(route.request().postData());
      assert.ok(body.get('code_verifier'));
      await route.fulfill({ json: { access_token: token, expires_in: 3600 }, headers: { 'Access-Control-Allow-Origin': origin } });
    });
    await page.route('https://api.spotify.com/**', async route => {
      if (route.request().method() === 'OPTIONS') {
        return route.fulfill({ status: 204, headers: {
          'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,content-type',
          'Access-Control-Allow-Methods': 'POST,OPTIONS',
        } });
      }
      requests.push({ token: route.request().headers().authorization, path: new URL(route.request().url()).pathname, body: route.request().postDataJSON() });
      await route.fulfill({ json: { id: 'playlistId' }, headers: { 'Access-Control-Allow-Origin': origin } });
    });
    page.audioRequests = 0;
    await page.route('https://audio.example/**', route => {
      page.audioRequests++;
      const wave = Buffer.alloc(240_044, 0x80);
      const header = Buffer.from('52494646a4a9030057415645666d74201000000001000100401f0000401f0000010008006461746180a90300', 'hex');
      header.copy(wave);
      return route.fulfill({ body: wave, contentType: 'audio/wav' });
    });
    await page.route('https://cdn.glitch.com/**', route => route.abort());
    return page;
  }
  async function screenshot(page, name) {
    if (!process.env.SCREENSHOT_DIR) return;
    await mkdir(process.env.SCREENSHOT_DIR, { recursive: true });
    await page.screenshot({ path: join(process.env.SCREENSHOT_DIR, name), animations: 'disabled' });
  }
  const [host, guest] = await Promise.all([player('mockHost'), player('mockGuest')]);
  await host.goto(origin);
  await host.getByRole('button', { name: 'Log in with Spotify' }).click();
  await host.getByRole('button', { name: 'Create a game' }).click();
  await host.getByRole('textbox', { name: 'Your name' }).fill('Host');
  await host.getByRole('button', { name: 'Get game code' }).click();
  await host.locator('#gamecodeDisplay').waitFor();
  const code = await host.locator('#gamecodeDisplay').textContent();
  assert.match(code, /^\d{6}$/);
  await host.getByRole('checkbox', { name: 'Play sound on this device' }).check();
  await guest.goto(`${origin}/?room=${code}`);
  await guest.getByRole('button', { name: 'Log in with Spotify' }).click();
  await guest.getByRole('textbox', { name: 'Your name' }).fill(unsafeName);
  assert.equal(await guest.getByRole('textbox', { name: 'Game code' }).inputValue(), code);
  await guest.getByRole('button', { name: 'Join game' }).click();
  await host.locator('#playerListContainer').getByText(unsafeName, { exact: true }).waitFor();
  assert.equal(await host.locator('#playerListContainer img').count(), 0);
  assert.equal(await guest.getByRole('button', { name: 'Start game' }).count(), 0);
  await screenshot(host, 'roulette-lobby.png');
  await host.getByRole('button', { name: 'Start game' }).click();
  await Promise.all([
    host.getByRole('button', { name: unsafeName, exact: true }).click(),
    guest.getByRole('button', { name: 'Host', exact: true }).click(),
  ]);
  await guest.reload();
  await guest.locator('.songAnswer.selected').filter({ hasText: /^Host$/ }).waitFor();
  await host.locator('#overlay.visible').getByText('Test Song').waitFor({ timeout: 20_000 });
  assert.match(await host.locator('#whose').textContent(), /Also Host’s #2/);
  assert.ok(host.audioRequests > 0);
  assert.equal(guest.audioRequests, 0);
  await screenshot(host, 'roulette-reveal.png');
  await Promise.all([host, guest].map(page => page.getByRole('heading', { name: 'game over' }).waitFor({ timeout: 20_000 })));
  assert.equal(await host.locator('#doneSongs').getByText('Test Song', { exact: true }).count(), 1);
  await guest.getByRole('button', { name: 'Create Spotify playlist' }).click();
  await guest.getByRole('link', { name: 'Open your playlist on Spotify' }).waitFor();
  assert.deepEqual(requests.map(({ path, token }) => [path, token]), [
    ['/v1/me/playlists', 'Bearer mockGuest'],
    ['/v1/playlists/playlistId/items', 'Bearer mockGuest'],
  ]);
  assert.equal(requests[0].body.public, false);
  assert.deepEqual(requests[1].body.uris, [track.uri]);
  await screenshot(guest, 'roulette-finish.png');
  await guest.getByRole('button', { name: 'New game' }).click();
  await guest.getByRole('button', { name: 'Create a game' }).waitFor();
  assert.deepEqual(errors, []);
});
