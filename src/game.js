export const GUESS_MS = 15_000;
export const REVEAL_MS = 5_000;
export const RESULTS_MS = 14_000;
export const ROOM_TTL = 24 * 60 * 60 * 1000;
export const MAX_PLAYERS = 20;

export function createRoom(code, host, now) {
  return {
    code, host: host.id, players: [host], phase: 'lobby', expires: now + ROOM_TTL,
    songs: [], round: -1, deadline: null, answers: {},
  };
}

export function isRoomExpired(room, now) {
  return (room.phase === 'lobby' || room.phase === 'finished') && now >= room.expires;
}

export function joinRoom(room, player) {
  if (room.phase !== 'lobby') return 'This game has already started.';
  if (room.players.length >= MAX_PLAYERS) return 'This game is full.';
  room.players.push(player);
  room.host ??= player.id;
}

function playerChoices(players) {
  return players.map(({ id, name }) => ({ id, name }));
}

export function leaveRoom(room, playerId) {
  const index = room.players.findIndex(player => player.id === playerId);
  if (index === -1) return;
  if (room.phase === 'question' || room.phase === 'result') room.choices ??= playerChoices(room.players);
  room.players.splice(index, 1);
  if (room.host === playerId) room.host = room.players[0]?.id ?? null;
}

function start(room, now, random) {
  const byTrack = new Map();
  for (const player of room.players) {
    for (const song of player.songs) {
      const key = song.isrc || song.uri;
      const candidates = byTrack.get(key) ?? [];
      if (!candidates.some(candidate => candidate.owner === player.id)) {
        candidates.push({ ...song, owner: player.id, ownerName: player.name });
      }
      byTrack.set(key, candidates);
    }
  }
  if (!byTrack.size) return 'No playable songs found. Try again with players who have more listening history.';
  const songs = Array.from(byTrack.values(), candidates => {
    candidates.sort((a, b) => a.index - b.index);
    const [winner, ...others] = candidates;
    return {
      ...winner,
      others: others.map(({ ownerName, index }) => ({ name: ownerName, rank: index + 1 })),
    };
  });
  for (let i = songs.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }
  room.songs = songs.slice(0, 20);
  for (const player of room.players) delete player.songs;
  room.round = 0;
  room.phase = 'question';
  room.expires = null;
  room.deadline = now + GUESS_MS;
}

export function act(room, playerId, message, now, random = Math.random) {
  const player = room.players.find(player => player.id === playerId);
  if (!player) return 'You are not in this game.';
  if (message?.type === 'start') {
    if (player.id !== room.host) return 'Only the host can start.';
    if (room.phase !== 'lobby') return 'This game has already started.';
    if (room.players.length < 2) return 'You need at least two players to start.';
    return start(room, now, random);
  }
  if (message?.type === 'answer') {
    if (room.phase !== 'question' || now >= room.deadline || message.round !== room.round + 1) return 'This round is no longer accepting guesses.';
    if (room.answers[player.id]) return 'You already guessed.';
    if (!(room.choices ?? room.players).some(player => player.id === message.pick)) return 'Choose a player in this game.';
    room.answers[player.id] = message.pick;
    if (message.pick === room.songs[room.round].owner) {
      player.score += Math.round(500 + Math.min(GUESS_MS, room.deadline - now) * 0.0357);
    }
    return;
  }
  return 'Unknown game action.';
}

export function advance(room, now) {
  if (room.deadline === null || now < room.deadline) return false;
  if (room.phase === 'question') {
    room.phase = 'result';
    room.deadline = now + RESULTS_MS;
  } else if (room.round + 1 < room.songs.length) {
    room.round++;
    room.phase = 'question';
    room.answers = {};
    room.deadline = now + GUESS_MS;
  } else {
    room.phase = 'finished';
    room.deadline = null;
    room.expires = now + ROOM_TTL;
  }
  return true;
}

function songDetails({ title, artist, art, uri }) {
  return { title, artist, art, uri };
}

export function snapshot(room, playerId, now) {
  const { code, phase, deadline, players } = room;
  const state = {
    type: 'state', code, phase, deadline, now,
    host: room.host === playerId,
    players: playerChoices(players),
    round: room.round + 1, total: room.songs.length,
  };
  if (phase === 'lobby') return state;
  const song = room.songs[room.round];
  if (phase === 'question') {
    return {
      ...state, choices: room.choices ?? state.players, preview: song.preview,
      audioEnds: deadline + RESULTS_MS, pick: room.answers[playerId] ?? null,
    };
  }
  if (phase === 'result') {
    return {
      ...state, song: songDetails(song), owner: song.ownerName, rank: song.index + 1,
      preview: song.preview, audioEnds: deadline,
      others: song.others, revealUntil: deadline - RESULTS_MS + REVEAL_MS,
      scores: players.map(({ id, name, score }) => ({
        name, score, pick: (room.choices ?? players).find(player => player.id === room.answers[id])?.name,
        correct: song.owner === room.answers[id],
      })).sort((a, b) => b.score - a.score),
    };
  }
  return {
    ...state, songs: room.songs.map(songDetails),
    scores: players.map(({ name, score }) => ({ name, score })).sort((a, b) => b.score - a.score),
  };
}
