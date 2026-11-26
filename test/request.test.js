import test from 'node:test';
import assert from 'node:assert/strict';
import { readRoomBody } from '../src/request.js';

function chunked(chunks, onCancel) {
  return new Request('https://example.com/api/rooms', {
    method: 'POST',
    duplex: 'half',
    body: new ReadableStream({
      pull(controller) {
        if (chunks.length) controller.enqueue(chunks.shift());
        else controller.close();
      },
      cancel: onCancel,
    }, { highWaterMark: 0 }),
  });
}

test('room body accepts exactly 1 KiB and decodes characters split across chunks', async () => {
  const bytes = new TextEncoder().encode('ñ'.repeat(512));
  const request = chunked([bytes.slice(0, 513), bytes.slice(513)]);
  assert.equal(request.headers.get('Content-Length'), null);
  assert.equal(await readRoomBody(request), 'ñ'.repeat(512));
});

test('room body cancels on the first oversized chunk without downloading the rest', async () => {
  const chunks = [new Uint8Array(1024), new Uint8Array(1), new Uint8Array(1)];
  let canceled = false;
  const request = chunked(chunks, () => { canceled = true; });
  assert.equal(await readRoomBody(request), null);
  assert.equal(canceled, true);
  assert.equal(chunks.length, 1);
});
