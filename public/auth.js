const CLIENT_ID = '3f9128cd0932495a9980c37bde2023fc';
const REDIRECT_URI = `${location.origin}/play`;
const OAUTH_KEY = 'roulette.oauth';
const SESSION_KEY = 'roulette.spotify';

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signIn(room = null) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(64)));
  const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ verifier, state, room }));
  const params = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    scope: 'user-top-read playlist-modify-private',
    state, code_challenge_method: 'S256', code_challenge: base64url(new Uint8Array(digest)),
  });
  location.assign(`https://accounts.spotify.com/authorize?${params}`);
}

async function exchange(params, previousRefreshToken) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ ...params, client_id: CLIENT_ID }),
  });
  if (!response.ok) throw new Error('Could not sign in to Spotify. Try logging in again.');
  const result = await response.json();
  const session = {
    access: result.access_token, refresh: result.refresh_token ?? previousRefreshToken,
    expires: Date.now() + result.expires_in * 1000,
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session.access;
}

export async function completeSignIn() {
  const params = new URLSearchParams(location.search);
  if (!params.has('code') && !params.has('error')) return;
  history.replaceState(null, '', '/play');
  const pending = JSON.parse(sessionStorage.getItem(OAUTH_KEY) ?? 'null');
  sessionStorage.removeItem(OAUTH_KEY);
  if (params.has('error')) throw new Error('Spotify sign-in was not completed.');
  if (!pending || params.get('state') !== pending.state) throw new Error('Spotify sign-in could not be verified. Try again.');
  await exchange({
    grant_type: 'authorization_code', code: params.get('code'),
    redirect_uri: REDIRECT_URI, code_verifier: pending.verifier,
  });
  return pending.room;
}

export async function accessToken() {
  const session = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
  if (session?.access && Date.now() + 30_000 < session.expires) return session.access;
  if (session?.refresh) {
    try {
      return await exchange({ grant_type: 'refresh_token', refresh_token: session.refresh }, session.refresh);
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
    }
  }
  return null;
}
