import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

/**
 * Lot G-B · le benchmark F05 (retouche masquée) exécuté par l'exécuteur fal
 * RÉEL du benchmark (`executeurMediasFal`), sous la barrière de la campagne
 * (`sousPlafond`), contre un `fetch` INJECTÉ qui rejoue la file fal · aucun
 * appel réseau, 0 $.
 *
 * Provenance des réponses rejouées : celles du lot F-A (documentation publique
 * de la file fal : soumission `{request_id, status_url, response_url,
 * cancel_url}`, statut `COMPLETED`, sortie `images: [{url, …}]` sur
 * `v3.fal.media`). Écrites à la main, jamais capturées sur le service.
 *
 * Le « modèle » rejoué REPEINT TOUTE L'IMAGE (magenta 512×512) : l'oracle F05
 * du noyau (`comparerSousMasque`, pixels décodés) doit compter 0 pixel changé
 * hors du rectangle gauche.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema } from '@tiktrends/db';
import { PORTEE_BENCHMARK, comparerSousMasque, imageVide, type Image } from '@tiktrends/core';
import { executeurMediasFal, RETOUCHES_BENCHMARK, idStudioSynthetique } from '../lib/studios/benchmark/executeur-fal';
import { encoder, decoder, genererJeu, ZONE_F05 } from '../lib/studios/benchmark/jeu-synthetique';
import { SCENARIOS, type Jeu, type EtatCas } from '../lib/studios/benchmark/scenarios';
import type { DemandeMedia } from '../lib/studios/benchmark/campagne';
import { sousPlafond } from '../lib/spend-guard';

const CLE = 'cle-fal-de-test:secret-0123456789';
let jeu: Jeu;
let REPEINT: Uint8Array;

interface Appel { url: string; methode: string; entetes: Record<string, string>; corps: any }
let appels: Appel[] = [];
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
const BASE = 'https://queue.fal.run/fal-ai/nano-banana-2/requests/req-f05';
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = { url: String(url), methode: init?.method ?? 'GET', entetes: Object.fromEntries(new Headers(init?.headers).entries()), corps: init?.body ? JSON.parse(String(init.body)) : null };
  appels.push(a);
  if (a.methode === 'POST') return json(200, { request_id: 'req-f05', response_url: BASE, status_url: `${BASE}/status`, cancel_url: `${BASE}/cancel`, queue_position: 0 });
  if (a.url === `${BASE}/status`) return json(200, { status: 'COMPLETED' });
  if (a.url === BASE) return json(200, { images: [{ url: 'https://v3.fal.media/files/zebra/f05.png', content_type: 'image/png', file_name: 'f05.png', width: 512, height: 512 }], description: '' });
  if (a.url.startsWith('https://v3.fal.media/')) return new Response(REPEINT.slice(), { status: 200, headers: { 'content-type': 'image/png', 'content-length': String(REPEINT.length) } });
  throw new Error(`appel non prévu ${a.methode} ${a.url}`);
}) as typeof fetch;

function executeur() {
  let t = Date.parse('2026-10-08T12:00:00Z');
  return executeurMediasFal({ apiKey: CLE, fetch: fetchRejoue, jeu, verifierAdresse: async () => true, horloge: () => new Date(t), attendre: async (ms) => { t += ms; } });
}
const etatVide = (): EtatCas => ({ jeu, resultats: new Map(), medias: new Map(), mesures: {} });
/** La consigne `edit.mask` du scénario F05 (sa réponse validée) · ce que la campagne doit transmettre. */
function consigneF05(): Record<string, unknown> {
  const entree = SCENARIOS.F05!.taches.consigne!(jeu, 0, etatVide());
  return (SCENARIOS.F05!.simule.consigne!(0, entree) as { result: Record<string, unknown> }).result;
}
const demande = (consigne: Record<string, unknown> | null): DemandeMedia => ({ cas: 'F05', etapeId: 'retouche', sortie: 0, profil: 'image_generation', unites: 1, consigne, format: null });
const lignes = async () => (await db.select().from(schema.aiSpend)).filter((l) => l.action === 'studio-benchmark:F05:retouche');

beforeAll(async () => {
  process.env.AI_SPEND_CAP_USD = '10';
  jeu = await genererJeu();
  REPEINT = new Uint8Array(await encoder(imageVide(512, 512, [255, 0, 255, 255])));
}, 60_000);
afterAll(() => { delete process.env.AI_SPEND_CAP_USD; });

describe('F05 · cohérence avec le scénario', () => {
  it('la source et le masque de l’exécuteur sont ceux de l’entrée edit.mask du scénario', () => {
    const ti = SCENARIOS.F05!.taches.consigne!(jeu, 0, etatVide()).taskInputs;
    expect([RETOUCHES_BENCHMARK.F05!.source, RETOUCHES_BENCHMARK.F05!.masque]).toEqual([ti.assetId, ti.maskAssetId]);
  });
});

describe('F05 · exécuté par l’exécuteur fal du benchmark (même chemin que le worker)', () => {
  it('une soumission au modèle d’édition, la sortie qui repeint tout recomposée : 0 pixel hors masque (oracle F05), zone changée, UNE ligne ai_spend', async () => {
    appels = [];
    const exec = executeur();
    const d = demande(consigneF05());
    expect(exec.preparer!(d)).toEqual({ ok: true });
    const produits = await sousPlafond('fal_image', { workspaceId: PORTEE_BENCHMARK.workspaceId, action: 'studio-benchmark:F05:retouche', units: 1 }, () => exec.produire(d));

    // Ce qui est parti : une requête, le modèle d'édition, l'étalon en image de départ, la zone dans la consigne, pas le masque.
    const posts = appels.filter((a) => a.methode === 'POST');
    expect(posts.map((a) => a.url)).toEqual(['https://queue.fal.run/fal-ai/nano-banana-2/edit']);
    expect(posts[0]!.corps).toMatchObject({ num_images: 1, aspect_ratio: '1:1', image_urls: [`data:image/png;base64,${Buffer.from(jeu.get('f05-etalon')!.octets).toString('base64')}`] });
    expect(posts[0]!.corps.prompt).toContain('Dessiner une étoile claire au centre de la zone masquée.');
    expect(posts[0]!.corps.prompt).toContain(`pixels ${ZONE_F05.x},${ZONE_F05.y} à ${ZONE_F05.x + ZONE_F05.largeur},${ZONE_F05.y + ZONE_F05.hauteur} sur 256×256`);
    expect(JSON.stringify(posts[0]!.corps)).not.toContain(Buffer.from(jeu.get('f05-masque')!.octets).toString('base64'));
    expect(posts.every((a) => a.entetes.authorization === `Key ${CLE}`)).toBe(true);
    expect(appels.filter((a) => a.url.startsWith('https://v3.fal.media/')).every((a) => a.entetes.authorization === undefined)).toBe(true);

    // Ce qui revient : la recomposition, jamais la sortie brute (512×512 magenta).
    expect(produits).toHaveLength(1);
    expect(produits[0]!.mime).toBe('image/png');
    const apres: Image = await decoder(produits[0]!.octets);
    expect([apres.largeur, apres.hauteur]).toEqual([256, 256]);
    const etalon = jeu.get('f05-etalon')!.image!;
    const c = comparerSousMasque(etalon, apres, jeu.get('f05-masque')!.image!);
    expect(c, 'oracle F05').toEqual({ horsMasque: 0, dansMasque: ZONE_F05.largeur * ZONE_F05.hauteur });
    let repeints = 0;
    for (let p = 0; p < 256 * 256; p++) if (apres.pixels[p * 4] === 255 && apres.pixels[p * 4 + 1] === 0 && apres.pixels[p * 4 + 2] === 255) repeints++;
    expect(repeints).toBe(ZONE_F05.largeur * ZONE_F05.hauteur);

    // Argent : une ligne, celle de la campagne · le port de l'exécuteur n'écrit rien.
    expect((await lignes()).map((l) => [l.provider, l.model, l.actualUsd])).toEqual([['fal', 'fal_image', 0.08]]);
    expect((await db.select().from(schema.aiSpend)).filter((l) => l.action === 'studio.generation')).toEqual([]);
    expect(exec.port.reservations).toHaveLength(1);
  }, 60_000);

  it('sans consigne edit.mask dans la demande : refus AVANT la barrière, 0 requête', async () => {
    appels = [];
    const avant = (await lignes()).length;
    const exec = executeur();
    expect(exec.preparer!(demande(null))).toEqual({ ok: false, motif: 'aucune consigne edit.mask validée dans la demande de retouche · rien n’est envoyé' });
    expect(appels).toEqual([]);
    expect((await lignes()).length).toBe(avant);
  });

  it('identifiants synthétiques : médias studio stables, propres au benchmark', () => {
    expect(idStudioSynthetique('f05-etalon')).toMatch(/^sta_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(idStudioSynthetique('f05-etalon')).toBe(idStudioSynthetique('f05-etalon'));
    expect(idStudioSynthetique('f05-etalon')).not.toBe(idStudioSynthetique('f05-masque'));
  });
});
