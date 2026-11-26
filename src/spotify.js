const TRACK_URI = /^spotify:track:[0-9A-Za-z]{22}$/;
const ISRC = /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/;
const MAX_LOOKUPS = 24;

function https(value) {
  return typeof value === 'string' && value.startsWith('https://') ? value : null;
}

function normalized(value) {
  return String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
}

async function lookup(url, fetcher) {
  try {
    const response = await fetcher(url, { signal: AbortSignal.timeout(3500) });
    if (response.ok) return await response.json();
  } catch {
    // Provider unavailable; leave the track out if there is no fallback.
  }
}

export async function resolvePreview({ isrc, title, artist }, fetcher = fetch) {
  if (isrc) {
    const track = await lookup(`https://api.deezer.com/track/isrc:${isrc}`, fetcher);
    if (https(track?.preview)) return track.preview;
  }
  const params = new URLSearchParams({ term: `${title} ${artist}`, entity: 'song', limit: '15' });
  const data = await lookup(`https://itunes.apple.com/search?${params}`, fetcher);
  const match = data?.results?.find(result => normalized(result.trackName) === normalized(title)
    && normalized(result.artistName) === normalized(artist) && https(result.previewUrl));
  return match?.previewUrl ?? null;
}

export async function loadSongs(authorization, fetcher = fetch) {
  if (!/^Bearer [\w.~+/-]+=*$/i.test(authorization ?? '')) {
    return { status: 401, error: 'Sign in to Spotify to play.' };
  }
  let response;
  let tracks;
  try {
    response = await fetcher('https://api.spotify.com/v1/me/top/tracks?time_range=long_term&limit=50', {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) tracks = (await response.json()).items;
  } catch {
    return { status: 502, error: 'Could not reach Spotify. Please try again.' };
  }
  if (response.status === 401) return { status: 401, error: 'Your Spotify sign-in expired. Sign in again.' };
  if (response.status === 403) return { status: 403, error: 'Spotify did not grant access. Development-mode apps require an approved Spotify account.' };
  if (!Array.isArray(tracks)) return { status: 502, error: 'Could not load your Spotify top tracks. Please try again.' };

  const candidates = tracks.flatMap((track, index) => {
    if (!TRACK_URI.test(track?.uri ?? '') || !track.name || !track.artists?.[0]?.name) return [];
    return [{
      uri: track.uri, title: track.name, artist: track.artists[0].name, index,
      isrc: ISRC.test(track.external_ids?.isrc ?? '') ? track.external_ids.isrc : null,
      art: https(track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url),
    }];
  }).slice(0, MAX_LOOKUPS);

  const songs = [];
  for (let i = 0; i < candidates.length; i += 4) {
    const batch = await Promise.all(candidates.slice(i, i + 4).map(async song => ({
      ...song, preview: await resolvePreview(song, fetcher),
    })));
    songs.push(...batch.filter(song => song.preview));
  }
  return { songs };
}
