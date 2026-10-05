import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Un faux fournisseur de modèle, à la FRONTIÈRE HTTP · aucun appel ne sort.
 *
 * Le client Anthropic du dépôt (`anthropicFromEnv` → `guardedAnthropic`) lit
 * `ANTHROPIC_BASE_URL` · on le pointe ici. Le serveur enregistre chaque requête
 * reçue (la consigne `system`, le fil `messages`) et répond en flux SSE, au
 * format de l'API, avec le texte qu'on lui donne. On vérifie ainsi ce qui est
 * RÉELLEMENT parti vers le modèle, pas ce qu'on croit avoir assemblé.
 */
export interface RequeteRecue { system: string; messages: Array<{ role: string; content: string }>; model: string; stream: boolean }

export async function demarrerMockFournisseur(reponse: (r: RequeteRecue) => string): Promise<{ url: string; recues: RequeteRecue[]; fermer: () => Promise<void> }> {
  const recues: RequeteRecue[] = [];
  const server: Server = createServer((req, res) => {
    let corps = '';
    req.on('data', (c) => { corps += c; });
    req.on('end', () => {
      const r = JSON.parse(corps || '{}') as RequeteRecue;
      recues.push(r);
      const texte = reponse(r);
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const ev = (type: string, data: unknown) => res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
      ev('message_start', { type: 'message_start', message: { id: 'msg_mock', type: 'message', role: 'assistant', model: r.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: Math.ceil(JSON.stringify(r).length / 4), output_tokens: 1 } } });
      ev('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
      for (const morceau of texte.match(/[\s\S]{1,40}/g) ?? []) {
        ev('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: morceau } });
      }
      ev('content_block_stop', { type: 'content_block_stop', index: 0 });
      ev('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: Math.ceil(texte.length / 4) } });
      ev('message_stop', { type: 'message_stop' });
      res.end();
    });
  });
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    recues,
    fermer: () => new Promise<void>((ok) => server.close(() => ok())),
  };
}
