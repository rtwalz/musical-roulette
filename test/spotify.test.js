import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSongs, resolvePreview } from '../src/spotify.js';

test('ISRC hit skips search; failures fall back to the matching title and artist', async () => {
  const song = { isrc: 'USABC1234567', title: 'Café', artist: 'The Band' };
  assert.equal(await resolvePreview(song, async url => {
    assert.equal(url, 'https://api.deezer.com/track/isrc:USABC1234567');
    return Response.json({ preview: 'https://deezer.com/clip' });
  }), 'https://deezer.com/clip');
  assert.equal(await resolvePreview(song, async url => {
    if (url.startsWith('https://api.deezer.com')) return new Response(null, { status: 403 });
    assert.equal(new URL(url).searchParams.get('term'), 'Café The Band');
    return Response.json({ results: [
      { trackName: 'Cafe (Remix)', artistName: 'The Band', previewUrl: 'https://example.com/remix' },
      { trackName: 'Cafe', artistName: 'Other Artist', previewUrl: 'https://example.com/cover' },
      { trackName: 'Cafe', artistName: 'The Band', previewUrl: 'https://example.com/clip' },
    ] });
  }), 'https://example.com/clip');
});

test('top tracks can omit ISRC, preview, and cover fields without losing the Spotify URI', async () => {
  const uri = 'spotify:track:0123456789abcdefghijAB';
  const { songs } = await loadSongs('Bearer mock', async url => {
    if (url.startsWith('https://api.spotify.com')) {
      return Response.json({ items: [{ name: 'Title', uri, artists: [{ name: 'Artist' }] }] });
    }
    assert.equal(new URL(url).hostname, 'itunes.apple.com');
    return Response.json({ results: [{ trackName: 'Title', artistName: 'Artist', previewUrl: 'https://example.com/clip' }] });
  });
  assert.deepEqual(songs, [{ title: 'Title', artist: 'Artist', uri, index: 0, isrc: null, art: null, preview: 'https://example.com/clip' }]);
});
