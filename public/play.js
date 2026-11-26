import { accessToken, completeSignIn, signIn } from './auth.js';

const ROOM_KEY = 'roulette.room';
const SOUND_KEY = 'roulette.sound';
const $ = id => document.getElementById(id);
const status = $('gameStatus');
const sound = $('sound');
const audio = new Audio();
const screens = ['question', 'lobby', 'result', 'dash', 'getgamecode', 'joingame', 'alldone'];
let membership = JSON.parse(sessionStorage.getItem(ROOM_KEY) ?? localStorage.getItem(ROOM_KEY) ?? 'null');
let socket;
let reconnect;
let reconnectDelay = 500;
let state;
let received;
let frame;
let audioRound;
let previewStarted;
let playlist;

function node(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text ?? '';
  if (className) element.className = className;
  return element;
}

function show(screen) {
  for (const id of screens) $(id).classList.toggle('hidden', id !== screen);
}

function setMembership(value) {
  membership = value;
  if (value) {
    const data = JSON.stringify(value);
    sessionStorage.setItem(ROOM_KEY, data);
    localStorage.setItem(ROOM_KEY, data);
  } else {
    if (sessionStorage.getItem(ROOM_KEY) === localStorage.getItem(ROOM_KEY)) localStorage.removeItem(ROOM_KEY);
    sessionStorage.removeItem(ROOM_KEY);
  }
}

function reset() {
  clearTimeout(reconnect);
  const old = socket;
  socket = null;
  old?.close();
  setMembership(null);
  state = null;
  audio.pause();
  $('overlay').classList.remove('visible');
  $('abandon').classList.add('hidden');
  $('soundSetting').classList.add('hidden');
  status.textContent = '';
  show('dash');
}

function send(value) {
  if (socket?.readyState !== WebSocket.OPEN) return false;
  socket.send(JSON.stringify(value));
  return true;
}

function connect() {
  status.textContent = 'Connecting to your game…';
  $('abandon').classList.remove('hidden');
  const url = new URL(`/api/rooms/${membership.code}/socket`, location.href);
  url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const connection = new WebSocket(url);
  socket = connection;
  connection.addEventListener('open', () => {
    if (socket === connection) send({ type: 'resume', token: membership.token });
  });
  connection.addEventListener('message', event => {
    if (socket !== connection) return;
    const message = JSON.parse(event.data);
    if (message.type === 'state') {
      reconnectDelay = 500;
      status.textContent = '';
      render(message);
    } else if (message.type === 'error') {
      status.textContent = message.error;
    }
  });
  connection.addEventListener('close', event => {
    if (socket !== connection) return;
    if (event.code === 1008) {
      reset();
      status.textContent = 'This game could not be rejoined or has expired.';
      return;
    }
    status.textContent = 'Connection lost. Rejoining…';
    reconnect = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, 8000);
  });
}

function guessedButtons(pick) {
  for (const button of $('questionBank').children) {
    button.classList.toggle('selected', pick === button.value);
    button.disabled = Boolean(pick);
  }
}

function scoreCards(scores, showPicks) {
  return scores.map(player => {
    const item = node('div', '', 'result');
    item.append(node('p', player.name, 'playerName'));
    if (showPicks) {
      const guess = player.pick ? `${player.correct ? '✔️' : '❌'} ${player.pick}` : 'Too slow';
      item.append(node('p', guess, 'playerAction'));
    }
    item.append(node('p', player.score, 'playerScore'));
    return item;
  });
}

function songCard(song) {
  const card = node('div', '', 'songCard');
  const text = node('div', '', 'text');
  if (song.art) {
    const img = node('img', '', 'album');
    img.alt = '';
    img.src = song.art;
    card.append(img);
  }
  text.append(node('p', song.title, 'title'), node('p', song.artist, 'artist'));
  card.append(text);
  return card;
}

function colorReveal(song, card, round) {
  const overlay = $('overlay');
  overlay.style.backgroundColor = '';
  overlay.style.color = '';
  $('countdownresult').style.backgroundColor = '';
  if (!song.art) return;
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    if (state?.phase !== 'result' || state.round !== round || !card.isConnected) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0, 1, 1);
      const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
      const background = `rgb(${r}, ${g}, ${b})`;
      const foreground = r * .299 + g * .587 + b * .114 < 145 ? '#fff' : '#333';
      overlay.style.backgroundColor = card.style.backgroundColor = $('countdownresult').style.backgroundColor = background;
      overlay.style.color = card.style.color = foreground;
    } catch {
      // The reveal still works without album colors.
    }
  };
  image.src = song.art;
}

function now() {
  return state.now + (performance.now() - received);
}

function playPreview() {
  if (!sound.checked || !state?.preview || state.audioEnds <= now()) return;
  if (state.round === audioRound && previewStarted) return;
  audioRound = state.round;
  previewStarted = true;
  audio.src = state.preview;
  audio.currentTime = Math.max(0, (now() - (state.audioEnds - 29_000)) / 1000);
  audio.volume = Math.max(0, Math.min(1, (state.audioEnds - now()) / 2000));
  audio.play().catch(error => {
    previewStarted = false;
    if (error.name !== 'AbortError' && sound.checked) status.textContent = 'Audio could not play. Toggle sound to try again.';
  });
}

function updateClock() {
  if (!state?.deadline) return;
  const time = now();
  const remaining = state.deadline - time;
  const bar = state.phase === 'question' ? $('countdown') : $('countdownresult');
  bar.style.width = `${Math.max(0, Math.min(100, remaining / (state.phase === 'question' ? 150 : 140)))}%`;
  if (state.phase === 'result' && time >= state.revealUntil && $('result').classList.contains('hidden')) {
    show('result');
    $('overlay').classList.remove('visible');
  }
  if (!audio.paused) {
    audio.volume = Math.max(0, Math.min(1, (state.audioEnds - time) / 2000));
    if (time >= state.audioEnds) audio.pause();
  }
  if (remaining > 0 || !audio.paused) frame = requestAnimationFrame(updateClock);
}

function render(next) {
  const same = next.phase === state?.phase && next.round === state.round;
  if (next.round !== state?.round) {
    audio.pause();
    previewStarted = false;
  }
  state = next;
  received = performance.now();
  $('soundSetting').classList.toggle('hidden', next.phase === 'finished');
  $('abandon').classList.toggle('hidden', next.phase === 'finished');

  if (next.phase === 'lobby') {
    $('gamecodeDisplay').textContent = next.code;
    $('invite').href = `/?room=${next.code}`;
    $('invite').textContent = location.host;
    $('startgameHost').classList.toggle('hidden', !next.host);
    $('startgameHost').disabled = next.players.length < 2;
    $('playerListContainer').replaceChildren(...next.players.map(player => node('div', player.name, 'player')));
    show('lobby');
  } else if (next.phase === 'question') {
    if (!same) {
      const answers = next.players.map(player => {
        const button = node('button', player.name, 'songAnswer');
        button.value = player.id;
        button.addEventListener('click', () => {
          if (send({ type: 'answer', round: next.round, pick: player.id })) guessedButtons(player.id);
        });
        return button;
      });
      $('questionBank').replaceChildren(...answers);
    }
    guessedButtons(next.pick);
    $('overlay').classList.remove('visible');
    show('question');
  } else if (next.phase === 'result' && !same) {
    $('currentRound').textContent = next.round;
    $('totalRounds').textContent = `of ${next.total}`;
    const card = songCard(next.song);
    $('songcard').replaceChildren(card);
    $('resultList').replaceChildren(...scoreCards(next.scores, true));
    $('whose').replaceChildren(document.createTextNode(`${next.owner}’s #${next.rank}`));
    for (const { name, rank } of next.others) {
      $('whose').append(node('br'), node('span', `Also ${name}’s #${rank}`, 'also'));
    }
    $('what').textContent = next.song.title;
    $('by').textContent = next.song.artist;
    colorReveal(next.song, card, next.round);
    if (now() < next.revealUntil) {
      show(null);
      $('overlay').classList.add('visible');
    } else {
      show('result');
    }
  } else if (next.phase === 'finished' && !same) {
    audio.pause();
    $('overlay').classList.remove('visible');
    show('alldone');
    $('finalScores').replaceChildren(...scoreCards(next.scores, false));
    $('doneSongs').replaceChildren(...next.songs.map(songCard));
    $('playlistStatus').replaceChildren();
    $('playlistButton').disabled = false;
    playlist = null;
  }
  if (!same) playPreview();
  cancelAnimationFrame(frame);
  updateClock();
}

async function enter(event, creating) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const code = creating ? '' : data.get('code');
  const button = form.querySelector('button[type=submit]');
  button.disabled = true;
  status.textContent = 'Finding playable songs from your Spotify top tracks…';
  try {
    const token = await accessToken();
    if (!token) return await signIn(code);
    const response = await fetch(`/api/rooms${code ? `/${code}` : ''}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.get('name') }),
    });
    const result = await response.json();
    if (response.status === 401) return await signIn(code);
    if (!response.ok) throw new Error(result.error);
    setMembership(result);
    connect();
  } catch (error) {
    status.textContent = error.message || 'Could not join the game. Try again.';
  } finally {
    button.disabled = false;
  }
}

async function spotifyPlaylistRequest(token, path, payload) {
  const response = await fetch(`https://api.spotify.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.status === 401) throw new Error('Spotify sign-in expired. Sign in again and rejoin the finished game.');
  if (!response.ok) throw new Error('Spotify could not save the playlist. Try again.');
  return response.json();
}

$('playlistButton').addEventListener('click', async () => {
  const button = $('playlistButton');
  const game = state;
  button.disabled = true;
  try {
    const token = await accessToken();
    if (!token) return await signIn(game.code);
    playlist ??= await spotifyPlaylistRequest(token, 'me/playlists', {
      name: `Musical Roulette #${game.code}`, public: false, description: 'Songs from your Musical Roulette game.',
    });
    await spotifyPlaylistRequest(token, `playlists/${playlist.id}/items`, { uris: game.songs.map(song => song.uri) });
    if (state !== game && state?.code !== game.code) return;
    const link = node('a', 'Open your playlist on Spotify');
    link.href = `https://open.spotify.com/playlist/${playlist.id}`;
    $('playlistStatus').replaceChildren(link);
  } catch (error) {
    if (state?.code === game.code) {
      $('playlistStatus').textContent = error.message;
      button.disabled = false;
    }
  }
});

$('startgameHost').addEventListener('click', () => send({ type: 'start' }));
$('join').addEventListener('click', () => show('joingame'));
$('create').addEventListener('click', () => show('getgamecode'));
$('joinGame').addEventListener('submit', event => enter(event, false));
$('createGame').addEventListener('submit', event => enter(event, true));
$('newGame').addEventListener('click', reset);
$('abandon').addEventListener('click', reset);
for (const back of document.querySelectorAll('.back')) back.addEventListener('click', () => show('dash'));

sound.checked = localStorage.getItem(SOUND_KEY) === 'on';
sound.addEventListener('change', () => {
  localStorage.setItem(SOUND_KEY, sound.checked ? 'on' : 'off');
  if (sound.checked) {
    if (state?.preview) playPreview();
    else {
      audio.src = 'data:audio/wav;base64,UklGRiUAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQEAAACA';
      audio.play().catch(() => {});
    }
  } else {
    audio.pause();
    previewStarted = false;
  }
});

try {
  const invited = await completeSignIn() || new URLSearchParams(location.search).get('room');
  if (invited && /^\d{6}$/.test(invited)) $('gameCodeNumber').value = invited;
  if (membership && (!invited || invited === membership.code)) {
    setMembership(membership);
    connect();
  } else if (await accessToken()) {
    show(invited ? 'joingame' : 'dash');
  } else {
    location.replace(invited ? `/?room=${encodeURIComponent(invited)}` : '/');
  }
} catch (error) {
  show('dash');
  status.textContent = error.message;
}
