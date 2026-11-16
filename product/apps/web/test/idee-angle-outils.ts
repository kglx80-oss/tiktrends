import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Outils de la garde « idée d'angle » · un faux modèle texte à la FRONTIÈRE
 * HTTP (le vrai client du SDK, `adaptateurAnthropicGarde`, `ANTHROPIC_BASE_URL`
 * pointé ici) et la normalisation qui rend comparable un contexte capturé.
 *
 * Le serveur garde le CORPS de chaque requête reçue · on lit ce qui est
 * réellement parti, jamais ce qu'on croit avoir assemblé. `connection: close`
 * sur chaque réponse (garde `faux-serveurs-connexion`).
 */
export interface CorpsRecu {
  model: string;
  system: Array<{ type: string; text: string }>;
  messages: Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>;
}

export interface FauxModeleTexte {
  url: string;
  recus: CorpsRecu[];
  repondre: (f: (c: CorpsRecu) => unknown) => void;
  fermer: () => Promise<void>;
}

export async function fauxModeleTexte(): Promise<FauxModeleTexte> {
  const recus: CorpsRecu[] = [];
  let f: (c: CorpsRecu) => unknown = () => ({ status: 'blocked', questions: ['?'], warnings: [], evidenceIds: [], result: null });
  const srv: Server = createServer((req, res) => {
    const morceaux: Buffer[] = [];
    req.on('data', (b: Buffer) => morceaux.push(b));
    req.on('end', () => {
      const corps = JSON.parse(Buffer.concat(morceaux).toString('utf8')) as CorpsRecu;
      recus.push(corps);
      const texte = JSON.stringify(f(corps));
      res.writeHead(200, { connection: 'close', 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: 'msg_idee', type: 'message', role: 'assistant', model: corps.model, stop_reason: 'end_turn', stop_sequence: null,
        content: [{ type: 'text', text: texte }], usage: { input_tokens: 900, output_tokens: 120 },
      }));
    });
  });
  await new Promise<void>((ok) => srv.listen(0, '127.0.0.1', () => ok()));
  return {
    url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`,
    recus,
    repondre: (x) => { f = x; },
    fermer: () => new Promise<void>((ok) => { srv.closeAllConnections?.(); srv.close(() => ok()); }),
  };
}

/** Le message utilisateur reçu (CONTEXT_JSON + TASK_INPUTS_JSON), en texte. */
export function messageUtilisateur(c: CorpsRecu): string {
  const m = c.messages.find((x) => x.role === 'user');
  if (!m) return '';
  return typeof m.content === 'string' ? m.content : m.content.map((b) => b.text ?? '').join('');
}

/** Le contexte JSON reçu, parsé. */
export function contexteRecu(c: CorpsRecu): { resolvedDocuments: Array<{ id: string; content: { claim: string } }> } & Record<string, unknown> {
  const u = messageUtilisateur(c);
  const debut = u.indexOf('CONTEXT_JSON=') + 'CONTEXT_JSON='.length;
  const fin = u.indexOf(' TASK_INPUTS_JSON=');
  return JSON.parse(u.slice(debut, fin));
}

/** Le résumé du brief tel que le modèle l'a reçu (document `brief_*`). */
export function briefRecu(c: CorpsRecu): string {
  return contexteRecu(c).resolvedDocuments.find((d) => d.id.startsWith('brief_'))?.content.claim ?? '';
}

/**
 * Rend un message comparable d'une exécution à l'autre · chaque identifiant
 * aléatoire (UUID) et chaque empreinte hexadécimale (64) devient un jeton
 * numéroté par ordre d'apparition. La STRUCTURE et le TEXTE restent exacts.
 */
export function normaliser(texte: string): string {
  const vus = new Map<string, string>();
  const jeton = (prefixe: string) => (m: string) => {
    if (!vus.has(m)) vus.set(m, `<${prefixe}${vus.size + 1}>`);
    return vus.get(m)!;
  };
  return texte
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, jeton('id'))
    .replace(/[0-9a-f]{64}/g, jeton('sha'))
    .replace(/pph_[0-9a-f]{24}/g, jeton('photo'))
    .replace(/Lunettes · rentrée [0-9a-f]{4}/g, 'Lunettes · rentrée <titre>');
}
