// In-process pub/sub feeding the Server-Sent Events stream.
const clients = new Set();
export function subscribe(send) { clients.add(send); return () => clients.delete(send); }
export function publish(type, data) {
  const msg = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const send of clients) { try { send(msg); } catch { clients.delete(send); } }
}
