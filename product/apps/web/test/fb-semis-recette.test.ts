import { describe, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * F-B · SEMIS de recette visuelle (pas une garde) · remplit une base LOCALE
 * pour les captures du parcours image. Ignoré sauf si `FB_SEMIS_RECETTE=a|b`
 * ET `FB_PG_URL` désigne 127.0.0.1 / localhost. Aucun réseau, aucun modèle
 * réel, aucune dépense : compilation par l'adaptateur texte SIMULÉ (registre
 * de test publié dans la base locale), exécution par le moteur du worker avec
 * le fournisseur fal de production contre un `fetch` REJOUÉ. Les objets
 * « stockés » sont écrits dans `FB_SEMIS_DIR` (servi localement pour les
 * aperçus). Restaurer la base ensuite.
 *
 *  · phase `a` · espace, marque, catalogue, projet produit épinglé · AUCUNE
 *    release publiée (capture « compilation indisponible ») ;
 *  · phase `b` · release de test, consigne compilée et retenue, jobs (terminé
 *    avec média, échec avec raison, en file), devis en cours ; second projet
 *    avec une consigne compilée en attente.
 */

const URL_PG = process.env.FB_PG_URL ?? '';
const PHASE = process.env.FB_SEMIS_RECETTE ?? '';
const ACTIF = (PHASE === 'a' || PHASE === 'b') && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);
const SORTIE = process.env.FB_SEMIS_SORTIE ?? '';

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { readFileSync } from 'node:fs';
import {
  composerBrief, referenceProduit, referenceSource, annonceObservee, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  type ContenuVersion, type DecisionFournisseur, type StockageStudio,
} from '@tiktrends/core';
import { schema } from '@tiktrends/db';
import { contexteDepuisSession } from '../lib/studios/garde';
import type { BaseStudio } from '../lib/studios/execution/types';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import { adaptateurSimule } from './l2-adaptateur-simule';

const FONDS = ['#f3ede4', '#e7eef3', '#efe7f1', '#e9f1e6', '#f4e9e4', '#e6e9f1', '#f1efe4'];
async function photo(n: number): Promise<string> {
  const angle = [-8, 0, 6, -14, 3, 12, -3][n]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="${FONDS[n]}"/>
    <g transform="rotate(${angle} 320 320)">
      <path d="M70 300 C 90 180, 550 180, 570 300" stroke="#ff5c8a" stroke-width="22" fill="none" stroke-linecap="round"/>
      <rect x="120" y="262" width="170" height="104" rx="44" fill="#1c121b"/><rect x="350" y="262" width="170" height="104" rx="44" fill="#1c121b"/>
      <rect x="136" y="276" width="138" height="76" rx="34" fill="#3b6ea8" opacity=".85"/><rect x="366" y="276" width="138" height="76" rx="34" fill="#3b6ea8" opacity=".85"/>
      <path d="M290 300 Q 320 280 350 300" stroke="#1c121b" stroke-width="14" fill="none"/>
    </g></svg>`;
  return `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')}`;
}
/** L'image « générée » rejouée · une scène factice (piste au lever du jour), 1080 × 1350. */
async function sceneGeneree(): Promise<Uint8Array> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350">
    <defs><linearGradient id="c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f7b267"/><stop offset=".55" stop-color="#f4845f"/><stop offset="1" stop-color="#3d2c3e"/></linearGradient></defs>
    <rect width="1080" height="1350" fill="url(#c)"/><path d="M0 980 L1080 860 L1080 1350 L0 1350 Z" fill="#2a1f2d"/>
    <path d="M120 1350 L520 900 L600 900 L1000 1350" fill="#7a4e3a" opacity=".7"/>
    <circle cx="540" cy="520" r="120" fill="#ffe3b3" opacity=".8"/>
    <g transform="translate(300 600) scale(.75)"><path d="M70 300 C 90 180, 550 180, 570 300" stroke="#ff5c8a" stroke-width="22" fill="none" stroke-linecap="round"/>
    <rect x="120" y="262" width="170" height="104" rx="44" fill="#1c121b"/><rect x="350" y="262" width="170" height="104" rx="44" fill="#1c121b"/></g></svg>`;
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

describe.skipIf(!ACTIF)('Semis de recette visuelle F-B', () => {
  it(`phase ${PHASE}`, async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_PG;
    const base = (await import('@tiktrends/db')).db as BaseStudio;
    const { epinglerProduitPour } = await import('../lib/studios/produit/commandes');
    const { chargerCatalogueProjet } = await import('../lib/studios/produit/catalogue');
    delete process.env.DATABASE_URL;

    if (PHASE === 'a') {
      const ws = randomUUID(); const brand = randomUUID(); const demo = randomUUID();
      await base.insert(schema.workspaces).values({ id: ws, name: 'Atelier Vélocité', plan: 'business', creditsBalance: 200 });
      await base.insert(schema.users).values([{ id: demo, email: 'demo@tiktrends.co', name: 'Camille' }]);
      await base.insert(schema.workspaceMembers).values([{ workspaceId: ws, userId: demo, role: 'owner' }]);
      await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Vélocité Sport' });
      const photos = await Promise.all(FONDS.map((_, i) => photo(i)));
      const [p] = await base.insert(schema.products).values({
        brandId: brand, name: 'Lunettes Sport Bandeau', description: 'Lunettes de course à verres miroir, bandeau élastique réglable', usp: 'Restent en place jusqu’au dernier kilomètre',
        price: 59, url: 'https://velocite.example/lunettes', imageUrl: photos[0]!, imageUrls: photos,
      }).returning();
      const annonce = annonceObservee({ id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.test/v.jpg', advertiserName: 'Lumière Botanique', body: 'Votre regard mérite mieux.', callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr' })!;
      const source = referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: ws, brandId: brand }, observeLe: new Date('2026-10-02T09:00:00Z'), format: null, retourVeille: null });
      const produit = referenceProduit({ id: p!.id, name: p!.name, description: p!.description, usp: p!.usp, price: p!.price, url: p!.url, imageUrl: p!.imageUrl, imageUrls: p!.imageUrls }, new Date('2026-10-02T09:00:00Z'));
      const hyp = { id: 'hyp_1', statement: 'Une scène de course au lever du jour augmente le taux de clic.', sourceIds: [source.sourceId], variable: 'Décor', control: 'Fond studio', treatment: 'Piste au lever du jour', invariants: ['Même accroche', 'Même offre'], metric: 'Taux de clic (CTR)', decisionRule: 'Garder si +15 % de CTR après 3 000 impressions', limitations: [] };
      const brief = composerBrief({ sources: [source], hypothese: hyp, produit, audience: 'Coureurs de 25 à 40 ans, sorties matinales' });
      const ctx = () => contexteDepuisSession({ user: { id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: ws, role: 'owner', plan: 'business', equipe: null }, [brand], [], `st_semis_${randomUUID()}`);
      const O = { veilleOuverte: true, maintenant: new Date() };
      const projets: Record<string, string> = {};
      for (const titre of ['Lunettes · scène au lever du jour', 'Lunettes · variante quai']) {
        const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'] };
        const [pr] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'ads', title: titre, ownerId: demo, sourceRefs: [source] }).returning();
        const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: pr!.id, workspaceId: ws, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu), authorId: demo, reason: 'Création depuis la Veille' }).returning();
        await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, pr!.id));
        const c = await chargerCatalogueProjet(ctx(), pr!.id, O);
        if (!c.ok) throw new Error(c.code);
        const ph = c.catalogue.produits[0]!.photos;
        const r = await epinglerProduitPour(ctx(), { projectId: pr!.id, baseVersionId: v!.id, productId: p!.id, photoId: ph[4]!.assetId, composants: ['lunettes', 'bandeau'] }, O);
        if (!r.ok) throw new Error(JSON.stringify(r));
        projets[titre] = pr!.id;
      }
      if (SORTIE) writeFileSync(SORTIE, JSON.stringify({ ws, brand, demo, principal: projets['Lunettes · scène au lever du jour'], attente: projets['Lunettes · variante quai'] }, null, 2));
      return;
    }

    // Phase b · registre de test publié, compilation simulée, devis, approbation, worker rejoué.
    const s = JSON.parse(readFileSync(SORTIE, 'utf8')) as { ws: string; brand: string; demo: string; principal: string; attente: string };
    const depotPrompts = await import('../lib/studios/prompts/depot-prompts');
    const { publierRegistreDeTest, acteurPlateforme } = await import('./l2-outils');
    await publierRegistreDeTest(depotPrompts, acteurPlateforme());
    const { compilerEtAttesterPour, retenirConsignePour } = await import('../lib/studios/image/consigne');
    const { devisImagePour, approuverImagePour, controlerMediaPour } = await import('../lib/studios/image/parcours');
    const { MoteurStudio } = await import('../../workers/src/studios/moteur');
    const { DecodeurSharp } = await import('../../workers/src/studios/decodeur');
    const { construireFournisseurFal } = await import('../../workers/src/studios/fournisseurs');
    const ctx = () => contexteDepuisSession({ user: { id: s.demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: s.ws, role: 'owner', plan: 'business', equipe: null }, [s.brand], [], `st_semis_${randomUUID()}`);
    const texte = adaptateurSimule((a: AppelModele) => {
      const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
      return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
        generationInstruction: 'Coureur de face sur une piste en terre au lever du jour, lunettes et bandeau portés, lumière rasante orangée, cadrage poitrine, arrière-plan flou.',
        negativeConstraints: ['Aucun autre produit visible'], needsDeterministicOverlay: true, protectedComponents: ['lunettes', 'bandeau'],
        referenceBindings: ti.referenceIds.filter((id) => id.startsWith('pph_')).map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
      } };
    });
    const deps = { adaptateur: texte, environnement: 'test' as const, veilleOuverte: true, maintenant: new Date() };
    const courante = async (id: string) => (await base.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, id)))[0]!.currentVersionId!;

    const c = await compilerEtAttesterPour(ctx(), { projectId: s.principal, mode: 'generative_scene' }, deps);
    if (!c.ok || c.statut !== 'compilee') throw new Error(JSON.stringify(c));
    const r = await retenirConsignePour(ctx(), { projectId: s.principal, baseVersionId: await courante(s.principal), runId: c.runId });
    if (!r.ok) throw new Error(JSON.stringify(r));

    const png = await sceneGeneree();
    let refus = false;
    const REQ = 'c3d4e5f6-0000-4000-8000-00000000cafe';
    const BASE_REQ = `https://queue.fal.run/fal-ai/nano-banana-2/edit/requests/${REQ}`;
    const json = (status: number, corps: unknown) => new Response(JSON.stringify(corps), { status });
    const fetchRejoue = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if ((init?.method ?? 'GET') === 'POST') return refus ? json(422, { detail: [{ msg: 'image_urls: format non pris en charge' }] }) : json(200, { request_id: REQ, response_url: BASE_REQ, status_url: `${BASE_REQ}/status`, cancel_url: `${BASE_REQ}/cancel` });
      if (u === `${BASE_REQ}/status`) return json(200, { status: 'COMPLETED', response_url: BASE_REQ });
      if (u === BASE_REQ) return json(200, { images: [{ url: 'https://v3.fal.media/files/semis/scene.png', content_type: 'image/png', width: 1080, height: 1350 }] });
      if (u.startsWith('https://v3.fal.media/')) return new Response(png as unknown as BodyInit, { status: 200, headers: { 'content-length': String(png.length) } });
      throw new Error(`appel non prévu ${u}`);
    }) as typeof fetch;
    const dir = process.env.FB_SEMIS_DIR ?? '';
    const stockage: StockageStudio = {
      async deposer(cle, octets) { if (dir) { mkdirSync(dirname(join(dir, cle)), { recursive: true }); writeFileSync(join(dir, cle), octets); } this.memo.set(cle, octets); },
      async relire(cle) { return this.memo.get(cle) ?? null; },
      memo: new Map<string, Uint8Array>(),
    } as StockageStudio & { memo: Map<string, Uint8Array> };
    const DECISION: Extract<DecisionFournisseur, { ok: true }> = { ok: true, apiKey: 'cle-de-semis-locale', queueUrl: null, modeles: { generation: 'fal-ai/nano-banana-2', edition: 'fal-ai/nano-banana-2/edit' } };
    const fournisseur = construireFournisseurFal({ base, decision: DECISION, fetch: fetchRejoue, env: { AI_SPEND_CAP_USD: '10' }, stockage: null, verifierAdresse: async () => true });
    const moteur = new MoteurStudio({ base, fournisseur, stockage, decodeur: new DecodeurSharp(), bailMs: 60_000 });
    const lancer = async () => {
      const d = await devisImagePour(ctx(), { projectId: s.principal });
      if (!d.ok) throw new Error(JSON.stringify(d));
      const a = await approuverImagePour(ctx(), { quoteId: d.devis.id, inputHash: d.devis.inputHash, creditsAnnonces: d.devis.maximumCredits, idempotencyKey: `semis-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: true });
      if (!a.ok) throw new Error(JSON.stringify(a));
      return a.job.id;
    };
    const jusquAuBout = async (id: string) => {
      for (let i = 0; i < 10; i++) {
        const [j] = await base.select().from(schema.studioJobs).where(eq(schema.studioJobs.id, id));
        if (['completed', 'failed'].includes(j!.state)) return;
        await moteur.tour();
      }
    };
    // 1 · échec certain (fal refuse la demande) · crédits rendus, raison écrite.
    refus = true;
    await jusquAuBout(await lancer());
    // 2 · terminé, média stocké, contrôle des composants ⇒ à relire.
    refus = false;
    const ok = await lancer();
    await jusquAuBout(ok);
    const q = await controlerMediaPour(ctx(), { jobId: ok });
    if (!q.ok) throw new Error(JSON.stringify(q));
    // 3 · en file (aucun worker ne le prend ici).
    await lancer();
    // 4 · un devis en cours, à approuver.
    const d = await devisImagePour(ctx(), { projectId: s.principal });
    if (!d.ok) throw new Error(JSON.stringify(d));

    // Second projet · consigne compilée, pas encore retenue.
    const c2 = await compilerEtAttesterPour(ctx(), { projectId: s.attente, mode: 'generative_scene' }, deps);
    if (!c2.ok || c2.statut !== 'compilee') throw new Error(JSON.stringify(c2));
  }, 120_000);
});
