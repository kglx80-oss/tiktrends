import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { demarrerMockFournisseur } from './lot19b-mock-fournisseur';

/**
 * Les faux fournisseurs HTTP des tests ferment la connexion après chaque réponse.
 *
 * Défaut (CI, trois fois · `l2-jarvis-route`, « [jarvis:chat] Connection
 * error. » puis 500) · le faux serveur tourne dans le MÊME processus que le
 * test · sous charge, pglite (WebAssembly) bloque la boucle d'événements plus
 * de 5 s entre deux appels · au réveil, le client réutilise une connexion
 * « keep-alive » que le serveur ferme au même instant (ses minuteries ont expiré
 * ensemble) · les appels payants ne sont jamais rejoués (`maxRetries: 0`), d'où
 * l'erreur. Reproduit à coup sûr ici · boucle bloquée 6 s entre deux appels.
 *
 * Correctif · `connection: close` sur chaque réponse des faux serveurs · le
 * client ouvre une connexion neuve à chaque appel, plus aucune réutilisation.
 */
const bloquer = (ms: number) => { const fin = Date.now() + ms; while (Date.now() < fin) { /* la boucle d'événements ne tourne plus, comme sous pglite chargé */ } };

describe('faux fournisseurs · aucune connexion réutilisée', () => {
  it('deux appels séparés par une boucle bloquée 6 s · le second réussit', async () => {
    const mock = await demarrerMockFournisseur(() => 'ok');
    const c = new Anthropic({ apiKey: 'cle-factice-locale', baseURL: mock.url, maxRetries: 0 });
    const appel = () => c.messages.create({ model: 'claude-x', max_tokens: 10, messages: [{ role: 'user', content: 'a' }] });
    await appel();
    bloquer(6_000);
    const second = await appel().then(() => null, (e: unknown) => String(e));
    await mock.fermer();
    expect(second, 'le client a réutilisé une connexion que le faux serveur fermait').toBeNull();
  }, 60_000);

  it('tout faux serveur HTTP des tests répond avec `connection: close`', () => {
    const dossier = join(__dirname);
    const fichiers: string[] = [];
    const parcourir = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else if (/\.tsx?$/.test(n)) fichiers.push(p); } };
    parcourir(dossier);
    const fautifs: string[] = [];
    for (const f of fichiers) {
      const s = readFileSync(f, 'utf8');
      if (!/createServer\(/.test(s) || f.endsWith('faux-serveurs-connexion.test.ts')) continue;
      for (const m of s.matchAll(/res\.writeHead\([^)]*\)/g)) if (!/connection: 'close'/.test(m[0])) fautifs.push(`${f.slice(dossier.length + 1)} · ${m[0].slice(0, 60)}`);
    }
    expect(fautifs, 'faux serveur sans `connection: close` · la course keep-alive revient sous charge').toEqual([]);
  });
});
