// A narrow local MCP transport owned by this Desktop extension. Current
// Desktop IPC profiles need not provide the optional Web webServer service.
import { createServer } from 'node:http';

export async function createBridgeTransport(port = 19387) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('桥接端口应在 1024–65535 之间。');
  const routes = [];
  const server = createServer(async (req, res) => {
    const fail = (status, error) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: false, error })); };
    if (req.socket.remoteAddress !== '127.0.0.1' || req.headers.host !== `127.0.0.1:${port}` || req.headers.origin || req.headers['sec-fetch-site']) return fail(403, 'Local MCP clients only');
    if (!['GET', 'POST'].includes(req.method)) return fail(405, 'GET or POST required');
    if (req.method === 'POST' && req.headers['content-type'] !== 'application/json') return fail(415, 'application/json required');
    const pathname = req.url?.split('?')[0];
    const route = routes.find(row => row.kind === 'exact' ? pathname === row.path : pathname === row.path || pathname?.startsWith(row.path + '/'));
    if (!route) return fail(404, 'Unknown bridge endpoint');
    try { await route.handler(req, res); }
    catch { if (!res.headersSent) fail(500, 'Desktop bridge request failed'); else res.end(); }
  });
  server.requestTimeout = 75000;
  server.headersTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  }).catch(error => { throw new Error(`桥接端口 ${port} 无法监听（${error.code ?? '未知错误'}）；未终止任何进程。`); });
  return {
    register(route) { routes.push(route); return () => { const at = routes.indexOf(route); if (at >= 0) routes.splice(at, 1); }; },
    async close() { await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); },
  };
}
