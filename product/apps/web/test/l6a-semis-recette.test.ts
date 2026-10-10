import { describe, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/**
 * L6-A · SEMIS de recette visuelle (pas une garde) · remplit une base LOCALE
 * pour les captures du studio vidéo. Ignoré sauf si `L6A_SEMIS_RECETTE=a|b`
 * ET `L6A_PG_URL` désigne 127.0.0.1 / localhost. Aucun réseau, aucun modèle
 * réel, aucune dépense : consignes compilées par l'adaptateur texte SIMULÉ
 * (registre de test publié dans la base locale), aucun worker. Restaurer la
 * base ensuite.
 *
 *  · phase `a` · espace, marque, produit épinglé, fiche Léa, projet vidéo à
 *    trois plans (scénario, timeline, musique) et un projet vide · AUCUNE
 *    release publiée (capture « storyboard et consigne indisponibles ») ;
 *  · phase `b` · release de test ; consigne du plan 1 retenue, devis en
 *    cours ; consigne du plan 3 compilée en attente ; un job d'image clé en
 *    file (approuvé, aucun worker local).
 */

const URL_PG = process.env.L6A_PG_URL ?? '';
const PHASE = process.env.L6A_SEMIS_RECETTE ?? '';
const ACTIF = (PHASE === 'a' || PHASE === 'b') && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);
const SORTIE = process.env.L6A_SEMIS_SORTIE ?? '';

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import {
  composerBrief, referenceProduit, referenceSource, annonceObservee, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  type ContenuVersion,
} from '@tiktrends/core';
import { schema } from '@tiktrends/db';
import { contexteDepuisSession } from '../lib/studios/garde';
import type { BaseStudio } from '../lib/studios/execution/types';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import { adaptateurSimule } from './l2-adaptateur-simule';

async function photo(n: number): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480"><rect width="480" height="480" fill="#f3ede4"/>
    <rect x="${170 + n * 4}" y="90" width="140" height="300" rx="36" fill="#1c121b"/><rect x="200" y="60" width="80" height="50" rx="12" fill="#ff5c8a"/></svg>`;
  return `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')}`;
}

const PLAN = (o: Record<string, unknown>) => ({
  purpose: 'Accroche', subject: 'Léa face au miroir', action: 'soupire en voyant un bouton', framing: 'plan rapproché', camera: 'travelling avant lent',
  lighting: 'lumière du matin', environment: 'salle de bain claire', referenceIds: ['c_lea'], narration: '', onScreenText: [], speechMode: 'none', estimatedDurationMs: 3000, ...o,
});

describe.skipIf(!ACTIF)('Semis de recette visuelle L6-A', () => {
  it(`phase ${PHASE}`, async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_PG;
    const base = (await import('@tiktrends/db')).db as BaseStudio;
    const { epinglerProduitPour } = await import('../lib/studios/produit/commandes');
    const { chargerCatalogueProjet } = await import('../lib/studios/produit/catalogue');
    const { enregistrerVersion } = await import('../lib/studios/depot');
    const { appliquerOperationVideoPour } = await import('../lib/studios/video/commandes');
    delete process.env.DATABASE_URL;
    const courante = async (id: string) => (await base.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, id)))[0]!.currentVersionId!;

    if (PHASE === 'a') {
      const ws = randomUUID(); const brand = randomUUID(); const demo = randomUUID();
      await base.insert(schema.workspaces).values({ id: ws, name: 'Atelier Éclat', plan: 'business', creditsBalance: 200 });
      await base.insert(schema.users).values([{ id: demo, email: 'demo@tiktrends.co', name: 'Camille' }]);
      await base.insert(schema.workspaceMembers).values([{ workspaceId: ws, userId: demo, role: 'owner' }]);
      await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Éclat Peau' });
      const photos = await Promise.all([0, 1, 2, 3, 4].map(photo));
      const [p] = await base.insert(schema.products).values({
        brandId: brand, name: 'Sérum Clarté', description: 'Sérum anti-imperfections, flacon compte-gouttes', usp: 'Peau nette en 7 jours',
        price: 29, url: 'https://eclat.example/serum', imageUrl: photos[0]!, imageUrls: photos,
      }).returning();
      const annonce = annonceObservee({ id: '9002', platform: 'meta', daysRunning: 41, mediaType: 'video', thumbnailUrl: 'https://cdn.test/v.jpg', advertiserName: 'Marque concurrente', body: 'Fini les boutons.', callToAction: 'Acheter', landingDomain: 'concurrent.example' })!;
      const source = referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: ws, brandId: brand }, observeLe: new Date('2026-10-02T09:00:00Z'), format: null, retourVeille: null });
      const produit = referenceProduit({ id: p!.id, name: p!.name, description: p!.description, usp: p!.usp, price: p!.price, url: p!.url, imageUrl: p!.imageUrl, imageUrls: p!.imageUrls }, new Date('2026-10-02T09:00:00Z'));
      const hyp = { id: 'hyp_1', statement: 'Une accroche douleur au réveil augmente le taux de clic.', sourceIds: [source.sourceId], variable: 'Accroche', control: 'Accroche bénéfice', treatment: 'Accroche douleur', invariants: ['Même offre'], metric: 'Taux de clic (CTR)', decisionRule: 'Garder si +15 % de CTR après 3 000 impressions', limitations: [] };
      const brief = { ...composerBrief({ sources: [source], hypothese: hyp, produit, audience: 'Peaux mixtes, 25-35 ans' }), formats: ['9:16'] };
      const ctx = () => contexteDepuisSession({ user: { id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: ws, role: 'owner', plan: 'business', equipe: null }, [brand], [], `st_semis_${randomUUID()}`);
      const O = { veilleOuverte: true, maintenant: new Date() };
      const projets: Record<string, string> = {};
      for (const titre of ['Sérum · accroche au réveil', 'Sérum · nouvelle vidéo']) {
        const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'] };
        const [pr] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'video', title: titre, ownerId: demo, sourceRefs: [source] }).returning();
        const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: pr!.id, workspaceId: ws, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu), authorId: demo, reason: 'Création depuis la Veille' }).returning();
        await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, pr!.id));
        projets[titre] = pr!.id;
      }
      const principal = projets['Sérum · accroche au réveil']!;
      const c = await chargerCatalogueProjet(ctx(), principal, O);
      if (!c.ok) throw new Error(c.code);
      const r = await epinglerProduitPour(ctx(), { projectId: principal, baseVersionId: await courante(principal), productId: p!.id, photoId: c.catalogue.produits[0]!.photos[2]!.assetId, composants: ['flacon', 'compte-gouttes'] }, O);
      if (!r.ok) throw new Error(JSON.stringify(r));
      const w = await enregistrerVersion(ctx(), { projectId: principal, baseVersionId: await courante(principal), changes: [{ op: 'replace', path: '/characterRefs', newValue: { c_lea: { tenue: 'veste jaune', cheveux: 'carré brun' } }, reason: 'fiche' }], raison: 'Fiche de Léa' });
      if (!w.ok) throw new Error(JSON.stringify(w));
      const s = await appliquerOperationVideoPour(ctx(), { projectId: principal, baseVersionId: await courante(principal), operation: { type: 'scenario', plans: [
        { shotId: 's1', ...PLAN({ narration: 'Tu en as marre des boutons ?', speechMode: 'voiceover' }) },
        { shotId: 's2', ...PLAN({ purpose: 'Problème', subject: 'Léa touche sa joue', action: 'grimace devant le miroir', camera: 'fixe', narration: 'Chaque matin, la même déception.', speechMode: 'voiceover' }) },
        { shotId: 's3', ...PLAN({ purpose: 'Appel à l’action', subject: 'le flacon de Sérum Clarté', action: 'une goutte tombe du compte-gouttes', framing: 'gros plan', camera: 'macro fixe', referenceIds: [p!.id], estimatedDurationMs: 2500 }) },
      ] } });
      if (!s.ok) throw new Error(JSON.stringify(s));
      const m = await appliquerOperationVideoPour(ctx(), { projectId: principal, baseVersionId: await courante(principal), operation: { type: 'musique', musique: { assetId: 'piste_lumineuse', gainDb: -12 } } });
      if (!m.ok) throw new Error(JSON.stringify(m));
      if (SORTIE) writeFileSync(SORTIE, JSON.stringify({ ws, brand, demo, principal, vide: projets['Sérum · nouvelle vidéo'] }, null, 2));
      return;
    }

    // Phase b · registre de test publié, consignes simulées, devis, approbation (aucun worker local).
    const s = JSON.parse(readFileSync(SORTIE, 'utf8')) as { ws: string; brand: string; demo: string; principal: string; vide: string };
    const depotPrompts = await import('../lib/studios/prompts/depot-prompts');
    const { publierRegistreDeTest, acteurPlateforme } = await import('./l2-outils');
    await publierRegistreDeTest(depotPrompts, acteurPlateforme());
    const { compilerConsignePlanPour, retenirConsignePlanPour } = await import('../lib/studios/video/consigne');
    const { devisKeyframePour, approuverKeyframePour } = await import('../lib/studios/video/commandes');
    const ctx = () => contexteDepuisSession({ user: { id: s.demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: s.ws, role: 'owner', plan: 'business', equipe: null }, [s.brand], [], `st_semis_${randomUUID()}`);
    const texte = adaptateurSimule((a: AppelModele) => {
      const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { shotId: string; referenceIds: string[] };
      const ctxJ = JSON.parse(a.messages[2]!.contenu.split('CONTEXT_JSON=')[1]!.split(' TASK_INPUTS_JSON=')[0]!) as { references: Array<{ requiredComponents: string[] }> };
      return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
        generationInstruction: ti.shotId === 's1'
          ? 'Léa, carré brun et veste jaune, face au miroir d’une salle de bain claire, lumière douce du matin, plan rapproché, expression lasse.'
          : 'Gros plan macro du flacon de Sérum Clarté sur un lavabo blanc, une goutte suspendue au compte-gouttes, lumière du matin.',
        referenceBindings: ti.referenceIds.map((id) => ({ referenceId: id, role: 'product', scope: 'product' })),
        protectedComponents: [...new Set(ctxJ.references.flatMap((r) => r.requiredComponents))],
      } };
    });
    const deps = { adaptateur: texte, environnement: 'test' as const, maintenant: new Date() };
    const c1 = await compilerConsignePlanPour(ctx(), { projectId: s.principal, shotId: 's1' }, deps);
    if (!c1.ok || c1.statut !== 'compilee') throw new Error(JSON.stringify(c1));
    const r1 = await retenirConsignePlanPour(ctx(), { projectId: s.principal, baseVersionId: await courante(s.principal), runId: c1.runId });
    if (!r1.ok) throw new Error(JSON.stringify(r1));
    // Un job d'image clé en file (aucun worker local), puis un devis en cours.
    const d0 = await devisKeyframePour(ctx(), { projectId: s.principal, shotId: 's1' });
    if (!d0.ok) throw new Error(JSON.stringify(d0));
    const a = await approuverKeyframePour(ctx(), { quoteId: d0.devis.id, inputHash: d0.devis.inputHash, creditsAnnonces: d0.devis.maximumCredits, idempotencyKey: `semis-${randomUUID()}` }, { illimite: false, plafond: null, fournisseurImage: true });
    if (!a.ok) throw new Error(JSON.stringify(a));
    const d1 = await devisKeyframePour(ctx(), { projectId: s.principal, shotId: 's1' });
    if (!d1.ok) throw new Error(JSON.stringify(d1));
    const c3 = await compilerConsignePlanPour(ctx(), { projectId: s.principal, shotId: 's3' }, deps);
    if (!c3.ok || c3.statut !== 'compilee') throw new Error(JSON.stringify(c3));
  }, 120_000);
});
