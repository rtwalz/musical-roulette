import { signIn } from './auth.js';

document.getElementById('spotifylogin').addEventListener('click', async () => {
  try {
    await signIn(new URLSearchParams(location.search).get('room'));
  } catch {
    document.getElementById('loginError').textContent = 'Could not start Spotify sign-in. Try again.';
  }
});
