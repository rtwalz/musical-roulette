import test from 'node:test';
import assert from 'node:assert/strict';
import { GUESS_MS, RESULTS_MS, createRoom, joinRoom, act, advance, snapshot } from '../src/game.js';

const sample = { uri: 'spotify:track:0', title: 'Track', artist: 'Artist', preview: 'https://example.com/clip', index: 4 };
const player = (id, songs) => ({ id, name: id, token: `private-${id}`, songs, score: 0 });

test('only the host can start and a playable pool is required', () => {
  const room = createRoom('123456', player('host', []), 0);
  assert.match(act(room, 'host', { type: 'start' }, 0), /two players/);
  joinRoom(room, player('guest', []));
  assert.match(act(room, 'guest', { type: 'start' }, 0), /Only the host/);
  assert.match(act(room, 'host', { type: 'start' }, 0), /No playable songs/);
  assert.equal(room.phase, 'lobby');
});

test('questions are redacted, server scores once, and snapshots restore each phase', () => {
  const room = createRoom('123456', player('host', [sample]), 0);
  assert.deepEqual(snapshot(room, 'host', 0).players, [{ id: 'host', name: 'host' }]);
  joinRoom(room, player('guest', [{ ...sample, index: 1 }]));
  assert.equal(act(room, 'host', { type: 'start' }, 1000), undefined);
  const question = snapshot(room, 'host', 1000);
  assert.equal(question.preview, sample.preview);
  for (const key of ['owner', 'rank', 'song', 'scores', 'songs']) assert.ok(!Object.hasOwn(question, key));
  assert.doesNotMatch(JSON.stringify(question), /private-|spotify:track:|Track/);
  assert.match(joinRoom(room, player('late', [])), /already started/);
  assert.match(act(room, 'host', { type: 'answer', round: 0, pick: 'guest' }, 1001), /no longer/);
  assert.equal(act(room, 'host', { type: 'answer', round: 1, pick: 'guest', correct: false, ms: -999 }, 2000), undefined);
  assert.match(act(room, 'host', { type: 'answer', round: 1, pick: 'host' }, 2001), /already guessed/);
  assert.equal(snapshot(room, 'host', 2100).pick, 'guest');
  assert.equal(snapshot(room, 'guest', 2100).pick, null);
  assert.match(act(room, 'guest', { type: 'answer', round: 1, pick: 'guest' }, 1000 + GUESS_MS), /no longer/);
  assert.equal(advance(room, 1000 + GUESS_MS), true);
  const result = snapshot(room, 'guest', 1000 + GUESS_MS);
  assert.equal(result.owner, 'guest');
  assert.equal(result.rank, 2);
  assert.deepEqual(result.others, [{ name: 'host', rank: 5 }]);
  assert.deepEqual(result.scores[0], { name: 'host', score: 1000, pick: 'guest', correct: true });
  assert.equal(advance(room, 1000 + GUESS_MS + RESULTS_MS), true);
  const final = snapshot(room, 'host', room.expires);
  assert.equal(final.phase, 'finished');
  assert.deepEqual(final.songs.map(song => song.uri), [sample.uri]);
  assert.equal(final.scores[0].score, 1000);
});
