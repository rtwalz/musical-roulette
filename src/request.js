export async function readRoomBody(request) {
  const limit = 1024;
  if (Number(request.headers.get('Content-Length')) > limit) return null;
  if (!request.body) return '';
  const bytes = new Uint8Array(limit);
  let size = 0;
  const reader = request.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new TextDecoder().decode(bytes.subarray(0, size));
      if (size + value.byteLength > limit) {
        void reader.cancel().catch(() => {});
        return null;
      }
      bytes.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}
