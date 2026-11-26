import { DurableObject } from 'cloudflare:workers';
import { createRoom, isRoomExpired, joinRoom, leaveRoom, act, advance, snapshot } from './game.js';
import { loadSongs } from './spotify.js';
import { readRoomBody } from './request.js';

function problem(error, status) {
  return Response.json({ error }, { status });
}

function randomCode() {
  const pool = new Uint32Array(1);
  do crypto.getRandomValues(pool); while (pool[0] >= 4_294_800_000);
  return String(100_000 + pool[0] % 900_000);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/api\/rooms\/(\d{6})(\/socket)?$/.exec(url.pathname);
    if (match?.[2] && request.method === 'GET') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return problem('WebSocket required.', 426);
      if (request.headers.get('Origin') !== url.origin) return problem('Invalid origin.', 403);
      return env.ROOMS.getByName(match[1]).fetch(request);
    }
    const creating = url.pathname === '/api/rooms';
    if (request.method === 'POST' && (creating || (match && !match[2]))) {
      if (request.headers.get('Origin') !== url.origin) return problem('Invalid origin.', 403);
      let name;
      try {
        const body = await readRoomBody(request);
        if (body === null) return problem('Request too large.', 413);
        name = JSON.parse(body)?.name?.trim();
      } catch {
        return problem('Invalid player name.', 400);
      }
      if (!name || name.length > 40) return problem('Enter a name between 1 and 40 characters.', 400);
      if (!creating && !(await env.ROOMS.getByName(match[1]).canJoin())) return problem('This game is unavailable or has already started.', 404);
      const { songs, error, status } = await loadSongs(request.headers.get('Authorization'));
      if (error) return problem(error, status);
      const player = { id: crypto.randomUUID(), token: crypto.randomUUID(), name, songs, score: 0 };
      if (!creating) return env.ROOMS.getByName(match[1]).enter(match[1], player, false);
      for (let i = 0; i < 3; i++) {
        const code = randomCode();
        const response = await env.ROOMS.getByName(code).enter(code, player, true);
        if (response.status !== 409) return response;
      }
      return problem('Could not find an open room code. Please try again.', 503);
    }
    if (url.pathname.startsWith('/api/')) return problem('Not found.', 404);
    if (url.pathname === '/' || url.pathname === '/play') {
      return env.ASSETS.fetch(new URL(url.pathname === '/' ? '/index.html' : '/play.html', url));
    }
    return env.ASSETS.fetch(request);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.game = await ctx.storage.get('game');
    });
  }

  canJoin() {
    return this.game?.phase === 'lobby' && !isRoomExpired(this.game, Date.now());
  }

  async enter(code, player, creating) {
    if (creating) {
      if (this.game) return problem('That code is already taken.', 409);
      this.game = createRoom(code, player, Date.now());
    } else {
      if (!this.canJoin()) return problem('This game is unavailable or has already started.', 404);
      const error = joinRoom(this.game, player);
      if (error) return problem(error, 409);
    }
    await this.save();
    this.broadcast();
    return Response.json({ code, token: player.token });
  }

  fetch() {
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  send(socket, value) {
    try {
      socket.send(JSON.stringify(value));
    } catch {
      // A disconnected player can restore state on their next connection.
    }
  }

  broadcast() {
    const now = Date.now();
    for (const socket of this.ctx.getWebSockets()) {
      const playerId = socket.deserializeAttachment();
      if (playerId) this.send(socket, snapshot(this.game, playerId, now));
    }
  }

  async save() {
    await Promise.all([
      this.ctx.storage.put('game', this.game),
      this.ctx.storage.setAlarm(this.game.deadline ?? this.game.expires),
    ]);
  }

  async webSocketMessage(socket, raw) {
    if (!this.game || isRoomExpired(this.game, Date.now())) {
      socket.close(1008, 'Room expired');
      return;
    }
    if (typeof raw !== 'string' || raw.length > 1024) return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    const now = Date.now();
    let playerId = socket.deserializeAttachment();
    if (!playerId) {
      const player = message?.type === 'resume' && this.game.players.find(player => player.token === message.token);
      if (!player) {
        this.send(socket, { type: 'error', error: 'This player could not rejoin.' });
        socket.close(1008, 'Unknown player');
        return;
      }
      playerId = player.id;
      socket.serializeAttachment(playerId);
      if (advance(this.game, now)) {
        await this.save();
        this.broadcast();
      } else {
        this.send(socket, snapshot(this.game, playerId, now));
      }
      return;
    }
    if (message?.type === 'leave') {
      leaveRoom(this.game, playerId);
      const leaving = this.ctx.getWebSockets().filter(peer => peer.deserializeAttachment() === playerId);
      for (const peer of leaving) peer.serializeAttachment(null);
      await this.save();
      for (const peer of leaving) peer.close(1000, 'Left game');
      this.broadcast();
      return;
    }
    if (advance(this.game, now)) {
      await this.save();
      this.broadcast();
    }
    const error = act(this.game, playerId, message, now);
    if (error) {
      this.send(socket, { type: 'error', error });
      return;
    }
    if (message.type === 'answer') {
      await this.ctx.storage.put('game', this.game);
      this.send(socket, snapshot(this.game, playerId, Date.now()));
    } else {
      await this.save();
      this.broadcast();
    }
  }

  async alarm() {
    if (!this.game) return;
    const now = Date.now();
    if (isRoomExpired(this.game, now)) {
      this.game = undefined;
      for (const socket of this.ctx.getWebSockets()) {
        socket.close(1008, 'Room expired');
      }
      await this.ctx.storage.deleteAll();
      return;
    }
    const changed = advance(this.game, now);
    await this.save();
    if (changed) this.broadcast();
  }
}
