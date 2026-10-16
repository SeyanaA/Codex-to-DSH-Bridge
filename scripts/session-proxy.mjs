// Preserve Crew's own MCP locks, configuration and origin guards while adding
// an explicit conversation key to its Hub dispatch. No model/API credentials.
import { createServer } from 'node:http';
import { isConversationId } from './session-id.mjs';

export async function startSessionProxy(base, currentCall) {
  const allowed = '/_dsh/dsh-crew/';
  const server = createServer(async (req, res) => {
    const sendError = message => { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: false, error: message })); };
    try {
      if (!req.url?.startsWith(allowed) || req.url.includes('..') || !['GET', 'POST'].includes(req.method) || req.headers.origin || req.headers['sec-fetch-site']) return sendError('Local MCP requests only');
      // Pin Host to the bound listener to reject DNS rebinding/browser traffic.
      if (req.headers.host !== `127.0.0.1:${server.address().port}`) return sendError('Invalid proxy Host');
      let body;
      if (req.method === 'POST') {
        let size = 0; const chunks = [];
        for await (const chunk of req) { size += chunk.length; if (size > 65536) throw new Error('Task exceeds 64 KiB'); chunks.push(chunk); }
        body = Buffer.concat(chunks).toString();
        if (req.url === `${allowed}jobs`) {
          const call = currentCall();
          if (!['dsh_spawn_worker', 'dsh_run_worker'].includes(call?.params?.name)) throw new Error('No active dispatch');
          const key = call.conversationKey;
          if (!isConversationId(key)) throw new Error('conversation_id must be the exact current CODEX_THREAD_ID');
          body = JSON.stringify({ ...JSON.parse(body), conversationKey: key });
        }
      }
      const upstream = await fetch(base + req.url, { method: req.method, ...(body !== undefined ? { body, headers: { 'content-type': 'application/json' } } : {}), signal: AbortSignal.timeout(70000) });
      res.writeHead(upstream.status, { 'content-type': 'application/json' });
      res.end(await upstream.text());
    } catch { sendError('Desktop Crew request failed; no standalone fallback. Check Desktop, task status and conversation_id before retrying.'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}
