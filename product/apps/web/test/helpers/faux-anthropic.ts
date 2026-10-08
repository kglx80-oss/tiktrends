import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Faux serveur Anthropic LOCAL (node:http, 127.0.0.1, port libre) · R3.
 *
 * Le VRAI client du SDK (`anthropicFromEnv`, clé factice, `ANTHROPIC_BASE_URL`
 * pointé ici) lui parle comme au fournisseur : on compte les requêtes REÇUES,
 * ce qui est la seule mesure qui dise combien de fois on aurait été facturé.
 * Aucun réseau sortant, aucune clé réelle, 0 $.
 */
export type Comportement =
  | { type: 'coupure' }                     // lit la requête puis coupe la connexion
  | { type: 'statut'; statut: number }      // répond une erreur JSON
  | { type: 'ok'; entree: number; sortie: number; texte?: string };

export interface FauxServeur {
  url: string;
  requetes: () => number;
  /** Corps JSON des requêtes reçues depuis le dernier `comportement`. */
  corps: () => unknown[];
  comportement: (c: Comportement) => void;
  fermer: () => Promise<void>;
}

export async function fauxAnthropic(initial: Comportement = { type: 'coupure' }): Promise<FauxServeur> {
  let n = 0;
  let recus: unknown[] = [];
  let c: Comportement = initial;
  const srv: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    n += 1;
    const morceaux: Buffer[] = [];
    req.on('data', (b: Buffer) => morceaux.push(b));
    req.on('end', () => {
      try { recus.push(JSON.parse(Buffer.concat(morceaux).toString('utf8'))); } catch { recus.push(null); }
      if (c.type === 'coupure') { req.socket.destroy(); return; }
      if (c.type === 'statut') {
        res.writeHead(c.statut, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ type: 'error', error: { type: 'api_error', message: `statut simulé ${c.statut}` } }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_faux', type: 'message', role: 'assistant', model: 'claude-sonnet-5', stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: c.texte ?? 'ok' }], usage: { input_tokens: c.entree, output_tokens: c.sortie },
      }));
    });
  });
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
  const port = (srv.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    requetes: () => n,
    corps: () => recus,
    comportement: (x) => { c = x; n = 0; recus = []; },
    fermer: () => new Promise<void>((r) => { srv.closeAllConnections?.(); srv.close(() => r()); }),
  };
}
