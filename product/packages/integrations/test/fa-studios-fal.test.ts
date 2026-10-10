import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  cleFournisseurDuJob, corpsFalImage, ratioFal, idDepenseDuJob, ErreurFournisseurCertaine, ErreurFournisseurIncertaine,
  estErreurCertaine, inspecterMedia, type DemandeFournisseur,
} from '@tiktrends/core';
import { FournisseurFal, type PreparationFal } from '../src/studios-fal';
import { BarriereDepenseStudio, DepenseRefusee, type PortDepense } from '../src/plafond-depense';
import { falGenerateImage, type FalConfig } from '../src/fal';
import { pngSimule } from '../src/studios-simule';

/**
 * F-A · l'adaptateur fal RÉEL contre un `fetch` INJECTÉ qui rejoue les
 * réponses de la file fal · aucun appel réseau, 0 $.
 *
 * Provenance des réponses rejouées : documentation publique de la file fal
 * (« Queue », docs.fal.ai · soumission `{request_id, status_url,
 * response_url, cancel_url}`, statuts `IN_QUEUE`/`IN_PROGRESS`/`COMPLETED`,
 * annulation 202 `CANCELLATION_REQUESTED`) et schéma de sortie de Nano Banana
 * (`images: [{url, content_type, file_name, width, height}]`). Écrites à la
 * main, jamais capturées sur le service (le proxy de la session bloque fal).
 */

const CLE_FAL = 'cle-fal-de-test:secret-0123456789';
const JOB = '0b8a7e8e-5b2c-4f0e-9d5e-4b1c2a3d4e5f';
const ESPACE = '11111111-2222-4333-8444-555555555555';
const REQ = 'a1b2c3d4-0000-4000-8000-00000000f00d';
const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/requests/${REQ}`;
const SORTIE = 'https://v3.fal.media/files/zebra/sortie.png';
const PNG = pngSimule();

const demande: DemandeFournisseur = {
  cleIdempotence: cleFournisseurDuJob(JOB),
  operations: [{ operation: 'keyframe:s1', profil: 'image_generation' }, { operation: 'composition', profil: 'calcul' }],
  parametres: {},
};
const corpsPrepare = { prompt: 'Lunettes sur table', num_images: 1, aspect_ratio: '4:5', image_urls: ['https://cdn.marque.test/p.png'] };

/* ── Port de dépense en mémoire (la base réelle est éprouvée dans apps/workers et apps/web) ── */
class PortMemoire implements PortDepense {
  lignes = new Map<string, { usd: number; actual: number; workspaceId: string | null; action: string }>();
  depenseExterne = 0;
  async reserver(l: Parameters<PortDepense['reserver']>[0], o: Parameters<PortDepense['reserver']>[1]) {
    if (this.lignes.has(l.id)) return { ok: false as const, raison: 'déjà engagée', dejaEngagee: true };
    const depense = this.depenseExterne + [...this.lignes.values()].reduce((s, x) => s + x.actual, 0);
    const d = o.decider(depense);
    if (!d.allowed) return { ok: false as const, raison: d.reason, dejaEngagee: false };
    this.lignes.set(l.id, { usd: l.usd, actual: l.usd, workspaceId: l.workspaceId, action: l.action });
    return { ok: true as const, depenseAvantUsd: depense };
  }
  async annuler(id: string) { const x = this.lignes.get(id); if (!x || x.actual === 0) return false; x.actual = 0; return true; }
}

/* ── fetch rejoué ── */
interface Appel { url: string; methode: string; entetes: Record<string, string>; corps: unknown }
type Reponse = Response | (() => Response) | Error;
let appels: Appel[] = [];
let routes: Array<{ quand: (a: Appel) => boolean; rep: Reponse[] }> = [];
const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
  const a: Appel = {
    url: String(url), methode: init?.method ?? 'GET',
    entetes: Object.fromEntries(new Headers(init?.headers).entries()),
    corps: init?.body ? JSON.parse(String(init.body)) : null,
  };
  appels.push(a);
  const r = routes.find((x) => x.quand(a) && x.rep.length > 0);
  if (!r) throw new Error(`appel non prévu ${a.methode} ${a.url}`);
  const rep = r.rep.length > 1 ? r.rep.shift()! : r.rep[0]!;
  if (rep instanceof Error) throw rep;
  return typeof rep === 'function' ? rep() : rep.clone();
}) as typeof fetch;
const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status, headers: { 'content-type': 'application/json' } });
const route = (quand: (a: Appel) => boolean, ...rep: Reponse[]) => routes.push({ quand, rep });
const estPost = (a: Appel) => a.methode === 'POST';
const estStatut = (a: Appel) => a.url === `${BASE_REQ}/status`;
const estResultat = (a: Appel) => a.url === BASE_REQ && a.methode === 'GET';
const estMedia = (a: Appel) => a.url.startsWith('https://v3.fal.media/');
const soumissionFal = () => json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel`, queue_position: 0 });
const resultatFal = (url = SORTIE) => json(200, { images: [{ url, content_type: 'image/png', file_name: 'sortie.png', width: 8, height: 8 }], description: '' });
const erreurReseau = (code: string) => Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });

let port: PortMemoire;
let maintenant: number;
let journal: Array<{ appel: string; detail: string }>;
function fournisseur(o: { cap?: string; prep?: PreparationFal | (() => Promise<PreparationFal>); verifierAdresse?: (u: URL) => Promise<boolean>; octetsMax?: number } = {}) {
  const barriere = new BarriereDepenseStudio({ port, env: { AI_SPEND_CAP_USD: o.cap ?? '10' }, horloge: () => new Date(maintenant) });
  const prep = o.prep ?? { ok: true as const, workspaceId: ESPACE, modele: 'fal-ai/nano-banana-2/edit', corps: corpsPrepare };
  return new FournisseurFal({
    apiKey: CLE_FAL, fetch: fetchRejoue, barriere,
    preparer: typeof prep === 'function' ? prep : async () => prep,
    operationsDuJob: async () => ['keyframe:s1'],
    verifierAdresse: o.verifierAdresse ?? (async () => true),
    octetsMax: o.octetsMax, horloge: () => new Date(maintenant), journal: (e) => journal.push(e),
  });
}
const ligne = () => port.lignes.get(idDepenseDuJob(JOB));
async function erreurDe(p: Promise<unknown>): Promise<Error> {
  try { await p; } catch (e) { return e as Error; }
  throw new Error('aucune erreur levée');
}

beforeEach(() => { appels = []; routes = []; port = new PortMemoire(); maintenant = Date.parse('2026-10-08T10:00:00Z'); journal = []; });

describe('soumission · sous la barrière, une seule requête', () => {
  it('acceptée : POST à la file officielle avec la clé, corps préparé, dépense réservée et gardée', async () => {
    route(estPost, soumissionFal());
    const { requestId } = await fournisseur().soumettre(demande);
    expect(appels.map((a) => [a.methode, a.url])).toEqual([['POST', 'https://queue.fal.run/fal-ai/nano-banana-2/edit']]);
    expect(appels[0]!.entetes.authorization).toBe(`Key ${CLE_FAL}`);
    expect(appels[0]!.corps).toEqual(corpsPrepare);
    expect(requestId).toBe(`${cleFournisseurDuJob(JOB)} falq|${BASE_REQ}/status|${BASE_REQ}`);
    expect(ligne()).toEqual({ usd: 0.08, actual: 0.08, workspaceId: ESPACE, action: 'studio.generation' });
  });

  it('plafond atteint : AUCUNE requête, refus certain qui dit le plafond', async () => {
    port.depenseExterne = 9.95;
    const e = await erreurDe(fournisseur().soumettre(demande));
    expect(e).toBeInstanceOf(DepenseRefusee);
    expect(estErreurCertaine(e)).toBe(true);
    expect(e.message).toContain('Plafond de dépense atteint');
    expect(appels).toEqual([]);
    expect(ligne()).toBeUndefined();
  });

  it('préparation refusée (média révoqué) : tâche bloquée avant la barrière · 0 requête, 0 dépense', async () => {
    const e = await erreurDe(fournisseur({ prep: { ok: false, motif: 'MISSING_REFERENCE · sta_x : retirée' } }).soumettre(demande));
    expect(estErreurCertaine(e)).toBe(true);
    expect(e.message).toContain('MISSING_REFERENCE');
    expect([appels.length, port.lignes.size]).toEqual([0, 0]);
  });

  it('5xx AVANT acceptation (503) : certain, dépense rendue', async () => {
    route(estPost, json(503, { detail: 'Service Unavailable' }));
    const e = await erreurDe(fournisseur().soumettre(demande));
    expect(e).toBeInstanceOf(ErreurFournisseurCertaine);
    expect(ligne()!.actual).toBe(0);
    expect(ligne()!.usd).toBe(0.08);
  });

  it('refus de la demande (422) et nom introuvable : certains, dépense rendue', async () => {
    route(estPost, json(422, { detail: [{ msg: 'field required' }] }));
    expect(estErreurCertaine(await erreurDe(fournisseur().soumettre(demande)))).toBe(true);
    expect(ligne()!.actual).toBe(0);
    port = new PortMemoire(); routes = [];
    route(estPost, erreurReseau('ENOTFOUND'));
    expect(estErreurCertaine(await erreurDe(fournisseur().soumettre(demande)))).toBe(true);
    expect(ligne()!.actual).toBe(0);
  });

  it('coupure APRÈS envoi (connexion réinitialisée) : incertain, dépense GARDÉE', async () => {
    route(estPost, erreurReseau('ECONNRESET'));
    const e = await erreurDe(fournisseur().soumettre(demande));
    expect(e).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect(ligne()!.actual).toBe(0.08);
  });

  it('acceptée (200) mais corps coupé, ou 504 d’un intermédiaire : incertain, dépense gardée', async () => {
    route(estPost, () => new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{"request_id":"a1')); c.error(new Error('coupé')); } }), { status: 200 }));
    expect(await erreurDe(fournisseur().soumettre(demande))).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect(ligne()!.actual).toBe(0.08);
    port = new PortMemoire(); routes = [];
    route(estPost, json(504, {}));
    expect(await erreurDe(fournisseur().soumettre(demande))).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect(ligne()!.actual).toBe(0.08);
  });

  it('seconde soumission pour le même job : refusée en INCERTAIN (réconciliation), la première dépense intacte, 1 seul POST', async () => {
    route(estPost, soumissionFal());
    const f = fournisseur();
    await f.soumettre(demande);
    const e = await erreurDe(f.soumettre(demande));
    expect(e).toBeInstanceOf(ErreurFournisseurIncertaine);
    expect(appels.filter(estPost).length).toBe(1);
    expect(ligne()!.actual).toBe(0.08);
  });

  it('la clé fal n’apparaît dans aucun message ni journal', async () => {
    const messages: string[] = [];
    for (const rep of [json(401, { detail: `bad key ${'x'}` }), json(503, {}), erreurReseau('ECONNRESET'), json(200, {})]) {
      routes = []; port = new PortMemoire();
      route(estPost, rep);
      messages.push((await erreurDe(fournisseur().soumettre(demande))).message);
    }
    expect([...messages, ...journal.map((j) => j.detail)].join('\n')).not.toContain('secret-0123456789');
  });
});

describe('suivi · statut, résultat, recul du sondage', () => {
  const id = `${cleFournisseurDuJob(JOB)} falq|${BASE_REQ}/status|${BASE_REQ}`;

  it('en file → en cours → terminé : sorties rattachées aux opérations, aucune URL stockée comme référence', async () => {
    route(estStatut, json(202, { status: 'IN_QUEUE', queue_position: 2 }), json(202, { status: 'IN_PROGRESS', logs: [] }), json(200, { status: 'COMPLETED', logs: [], response_url: BASE_REQ }));
    route(estResultat, resultatFal());
    const f = fournisseur();
    expect(await f.statut(id)).toEqual({ etat: 'en_cours', progression: 0 });
    // Recul : relu trop tôt ⇒ « en cours » sans requête.
    expect(await f.statut(id)).toEqual({ etat: 'en_cours' });
    expect(appels.length).toBe(1);
    maintenant += 2_000;
    expect(await f.statut(id)).toEqual({ etat: 'en_cours' });
    maintenant += 4_000;
    expect(await f.statut(id)).toEqual({ etat: 'reussi', sorties: [{ operation: 'keyframe:s1', ref: 'image:0', constat: null }], coutUsdMicros: null });
    expect(appels.every((a) => a.entetes.authorization === `Key ${CLE_FAL}`)).toBe(true);
  });

  it('refus du modèle au résultat (422) : échec NON facturé ⇒ dépense rendue', async () => {
    port.lignes.set(idDepenseDuJob(JOB), { usd: 0.08, actual: 0.08, workspaceId: ESPACE, action: 'studio.generation' });
    route(estStatut, json(200, { status: 'COMPLETED' }));
    route(estResultat, json(422, { detail: [{ msg: 'image_urls: could not load' }] }));
    expect(await fournisseur().statut(id)).toMatchObject({ etat: 'echoue', facture: false });
    expect(ligne()!.actual).toBe(0);
  });

  it('échec du service au résultat (500) : relu plus tard, rien de conclu ; requête inconnue (404) ⇒ inconnu', async () => {
    route(estStatut, json(200, { status: 'COMPLETED' }));
    route(estResultat, json(500, {}));
    expect(await fournisseur().statut(id)).toEqual({ etat: 'en_cours' });
    routes = [];
    route(estStatut, json(404, { detail: 'Request not found' }));
    expect(await fournisseur().statut(id)).toEqual({ etat: 'inconnu' });
  });

  it('identifiant forgé vers un autre hôte : aucune requête', async () => {
    expect(await fournisseur().statut(`${cleFournisseurDuJob(JOB)} falq|https://evil.test/a/requests/r/status|https://evil.test/a/requests/r`)).toEqual({ etat: 'inconnu' });
    expect(appels).toEqual([]);
  });

  it('annulation : PUT sur l’URL d’annulation reconstruite', async () => {
    route((a) => a.methode === 'PUT', json(202, { status: 'CANCELLATION_REQUESTED' }));
    await fournisseur().annuler(id);
    expect(appels.map((a) => [a.methode, a.url])).toEqual([['PUT', `${BASE_REQ}/cancel`]]);
  });
});

describe('téléchargement · borné, hôte fal seulement, type relu dans les octets', () => {
  const id = `${cleFournisseurDuJob(JOB)} falq|${BASE_REQ}/status|${BASE_REQ}`;

  it('octets complets : type RELU (le text/html annoncé est ignoré), aucune clé vers l’hôte des médias', async () => {
    route(estResultat, resultatFal());
    route(estMedia, new Response(PNG as unknown as BodyInit, { status: 200, headers: { 'content-type': 'text/html', 'content-length': String(PNG.length) } }));
    const r = await fournisseur().telecharger(id, 'image:0');
    expect(Buffer.from(r.octets).equals(Buffer.from(PNG))).toBe(true);
    expect(r.mimeAnnonce).toBe('image/png');
    expect(inspecterMedia(r.octets)).not.toBeNull();
    expect(appels.find(estMedia)!.entetes.authorization).toBeUndefined();
  });

  it('transfert coupé (moins d’octets que l’annonce) : incertain ⇒ re-téléchargement, rien livré', async () => {
    route(estResultat, resultatFal());
    route(estMedia, new Response(PNG.slice(0, 40) as unknown as BodyInit, { status: 200, headers: { 'content-length': String(PNG.length) } }));
    expect(await erreurDe(fournisseur().telecharger(id, 'image:0'))).toBeInstanceOf(ErreurFournisseurIncertaine);
  });

  it('fichier énorme : coupé à la borne, certain', async () => {
    route(estResultat, resultatFal());
    route(estMedia, () => new Response(new Uint8Array(5000), { status: 200 }));
    expect(estErreurCertaine(await erreurDe(fournisseur({ octetsMax: 1000 }).telecharger(id, 'image:0')))).toBe(true);
    routes = [];
    route(estResultat, resultatFal());
    route(estMedia, () => new Response(new Uint8Array(10), { status: 200, headers: { 'content-length': '999999' } }));
    expect(estErreurCertaine(await erreurDe(fournisseur({ octetsMax: 1000 }).telecharger(id, 'image:0')))).toBe(true);
  });

  it('sortie hors des hôtes fal, adresse non publique, redirection : refus, aucune requête vers l’hôte', async () => {
    for (const url of ['https://169.254.169.254/latest/meta-data', 'https://cdn.evil.test/sortie.png', 'https://fal.media.evil.test/sortie.png']) {
      appels = []; routes = [];
      route(estResultat, resultatFal(url));
      route((a) => a.url === url, new Response(PNG as unknown as BodyInit, { status: 200 }));
      expect(estErreurCertaine(await erreurDe(fournisseur().telecharger(id, 'image:0'))), url).toBe(true);
      expect(appels.map((a) => a.url), url).toEqual([BASE_REQ]);
    }
    appels = []; routes = [];
    route(estResultat, resultatFal());
    expect(estErreurCertaine(await erreurDe(fournisseur({ verifierAdresse: async () => false }).telecharger(id, 'image:0')))).toBe(true);
    expect(appels.some(estMedia)).toBe(false);
    routes = [];
    route(estResultat, resultatFal());
    route(estMedia, new Response(null, { status: 302, headers: { location: 'http://10.0.0.1/' } }));
    expect(estErreurCertaine(await erreurDe(fournisseur().telecharger(id, 'image:0')))).toBe(true);
  });
});

describe('construction · jamais sans barrière, jamais avec la clé de simulation', () => {
  it('refus', () => {
    const base = { fetch: fetchRejoue, preparer: async () => ({ ok: false as const, motif: '' }), operationsDuJob: async () => [] };
    expect(() => new FournisseurFal({ ...base, apiKey: 'simule-local-sans-reseau', barriere: new BarriereDepenseStudio({ port: new PortMemoire() }) })).toThrow(/simulation/);
    expect(() => new FournisseurFal({ ...base, apiKey: CLE_FAL, barriere: undefined as never })).toThrow(/barrière/);
    expect(() => new BarriereDepenseStudio({ port: undefined as never })).toThrow(/registre/);
  });
});

describe('le corps natif est celui que le produit envoie déjà (`falGenerateImage`)', () => {
  const vrai = globalThis.fetch;
  let corps: Record<string, unknown> | null = null;
  beforeEach(() => {
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => { corps = JSON.parse(String(init?.body)); return new Response(JSON.stringify({ images: [{ url: 'https://o/1.png' }] }), { status: 200 }); }) as typeof fetch;
  });
  afterEach(() => { globalThis.fetch = vrai; });
  const cfg: FalConfig = { apiKey: 'k', baseUrl: 'https://fal.test', queueUrl: 'https://queue.test', imageModel: 'x', imageModelI2I: 'x', imageModelText: 'x', imageModelEdit: 'x', videoModel: 'v', videoModelI2V: 'v' };

  for (const modele of ['fal-ai/nano-banana-2/edit', 'fal-ai/nano-banana-2', 'openai/gpt-image-2/edit', 'fal-ai/gpt-image-1/edit-image/byok', 'fal-ai/flux/dev/image-to-image']) {
    for (const [l, h] of [[1080, 1350], [1080, 1920], [1000, 1000], [1920, 1080]] as const) {
      it(`${modele} · ${l}×${h}`, async () => {
        const refs = modele.includes('flux') ? ['https://r/1.png'] : ['https://r/1.png', 'https://r/2.png'];
        const ratio = ratioFal(l, h).ratio;
        await falGenerateImage(cfg, { prompt: 'p', aspectRatio: ratio, imageUrls: refs, model: modele, count: 2 });
        expect(corpsFalImage({ modele, prompt: 'p', ratio, references: refs, images: 2 })).toEqual(corps);
      });
    }
  }
});

/* ── Animation d'un plan · même file, même barrière, forfait vidéo ── */
describe('animation · clip image → vidéo sous la barrière, sortie vidéo rattachée au clip', () => {
  const REQ_V = 'b2c3d4e5-0000-4000-8000-0000000c11e0';
  const MODELE_V = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';
  const BASE_V = `https://queue.fal.run/${MODELE_V}/requests/${REQ_V}`;
  const CLIP = 'https://v3.fal.media/files/zebra/clip.mp4';
  const demandeClip: DemandeFournisseur = { cleIdempotence: cleFournisseurDuJob(JOB), operations: [{ operation: 'clip:s1', profil: 'animation' }], parametres: {} };
  const corpsClip = { prompt: 'Mouvement : sourit.', image_url: 'https://cdn.tiktrends.test/studio/kf.png', duration: '5', negative_prompt: 'texte incrusté' };
  const modeles: string[] = [];
  class PortModele extends PortMemoire {
    async reserver(l: Parameters<PortDepense['reserver']>[0], o: Parameters<PortDepense['reserver']>[1]) { modeles.push(String(l.model)); return super.reserver(l, o); }
  }
  function fournisseurClip() {
    port = new PortModele();
    const barriere = new BarriereDepenseStudio({ port, env: { AI_SPEND_CAP_USD: '10' }, horloge: () => new Date(maintenant) });
    return new FournisseurFal({
      apiKey: CLE_FAL, fetch: fetchRejoue, barriere,
      preparer: async () => ({ ok: true as const, workspaceId: ESPACE, modele: MODELE_V, corps: corpsClip }),
      operationsDuJob: async () => ['clip:s1'],
      verifierAdresse: async () => true, horloge: () => new Date(maintenant), journal: (e) => journal.push(e),
    });
  }
  beforeEach(() => { modeles.length = 0; });

  it('POST au modèle image → vidéo, corps préparé, réserve au forfait vidéo de la grille (poste fal_video)', async () => {
    route(estPost, json(200, { request_id: REQ_V, response_url: BASE_V, status_url: `${BASE_V}/status`, cancel_url: `${BASE_V}/cancel` }));
    await fournisseurClip().soumettre(demandeClip);
    expect(appels.map((a) => [a.methode, a.url])).toEqual([['POST', `https://queue.fal.run/${MODELE_V}`]]);
    expect(appels[0]!.corps).toEqual(corpsClip);
    expect(ligne()).toEqual({ usd: 0.6, actual: 0.6, workspaceId: ESPACE, action: 'studio.generation' });
    expect(modeles).toEqual(['fal_video']);
  });

  it('plafond trop bas pour le forfait vidéo : AUCUNE requête', async () => {
    const f = fournisseurClip();
    port.depenseExterne = 9.5;
    const e = await erreurDe(f.soumettre(demandeClip));
    expect(e).toBeInstanceOf(DepenseRefusee);
    expect(appels).toEqual([]);
  });

  it('terminé : la sortie `video.url` devient la sortie du clip', async () => {
    route(estPost, json(200, { request_id: REQ_V, response_url: BASE_V, status_url: `${BASE_V}/status`, cancel_url: `${BASE_V}/cancel` }));
    route((a) => a.url === `${BASE_V}/status`, json(200, { status: 'COMPLETED' }));
    route((a) => a.url === BASE_V && a.methode === 'GET', json(200, { video: { url: CLIP, content_type: 'video/mp4', file_name: 'clip.mp4' } }));
    const f = fournisseurClip();
    const { requestId } = await f.soumettre(demandeClip);
    const s = await f.statut(requestId);
    expect(s).toMatchObject({ etat: 'reussi', sorties: [{ operation: 'clip:s1', ref: 'image:0' }] });
  });
});
