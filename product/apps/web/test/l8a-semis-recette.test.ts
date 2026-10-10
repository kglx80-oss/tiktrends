import { describe, it, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/**
 * L8-A · SEMIS de recette visuelle (pas une garde) · remplit une base LOCALE
 * pour l'inventaire responsive, clavier et états des écrans image, produit,
 * textes et éditeur. Ignoré sauf si `L8A_SEMIS_RECETTE=1` ET `L8A_PG_URL`
 * désigne 127.0.0.1 / localhost. Aucun réseau, aucun modèle réel, aucune
 * dépense : la consigne image est compilée par l'adaptateur texte SIMULÉ
 * (registre de test publié dans la base locale), aucun worker.
 *
 *  · « rempli » · brief, photo épinglée et ses composants, une référence,
 *    deux textes retenus, document à calques, consigne image retenue ;
 *  · « long » · noms très longs partout (projet, produit, calques, textes) ;
 *  · « vide » · projet sans brief, sans document, sans texte.
 */

const URL_PG = process.env.L8A_PG_URL ?? '';
const ACTIF = process.env.L8A_SEMIS_RECETTE === '1' && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);
const SORTIE = process.env.L8A_SEMIS_SORTIE ?? '';

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import {
  composerBrief, referenceProduit, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  type ContenuVersion, type DocumentStudio,
} from '@tiktrends/core';
import { schema } from '@tiktrends/db';
import { contexteDepuisSession } from '../lib/studios/garde';
import type { BaseStudio } from '../lib/studios/execution/types';
import type { AppelModele } from '../lib/studios/prompts/adaptateur';
import { adaptateurSimule } from './l2-adaptateur-simule';

const uri = async (svg: string) => `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')}`;
const photo = (n: number) => uri(`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600"><rect width="480" height="600" fill="#e9dfd2"/>
  <rect x="${160 + n * 6}" y="150" width="160" height="380" rx="44" fill="#1c121b"/><rect x="200" y="90" width="80" height="80" rx="14" fill="#ff5c8a"/>
  <rect x="186" y="300" width="108" height="120" rx="10" fill="#f6eef4"/></svg>`);

const LONG = 'Sérum Clarté intensif anti-imperfections à la niacinamide et au zinc, édition limitée coffret découverte trois flacons';

describe.skipIf(!ACTIF)('Semis de recette visuelle L8-A', () => {
  it('projets rempli, long et vide', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_PG;
    const base = (await import('@tiktrends/db')).db as BaseStudio;
    const { chargerCatalogueProjet } = await import('../lib/studios/produit/catalogue');
    const { epinglerProduitPour } = await import('../lib/studios/produit/commandes');
    const { enregistrerVersion } = await import('../lib/studios/depot');
    const { enregistrerTextesPour } = await import('../lib/studios/textes/textes');
    const { compilerEtAttesterPour, retenirConsignePour } = await import('../lib/studios/image/consigne');
    const depotPrompts = await import('../lib/studios/prompts/depot-prompts');
    const { publierRegistreDeTest, acteurPlateforme } = await import('./l2-outils');
    delete process.env.DATABASE_URL;

    const ws = randomUUID(); const brand = randomUUID(); const demo = randomUUID();
    await base.insert(schema.workspaces).values({ id: ws, name: 'Atelier Éclat', plan: 'business', creditsBalance: 200, onboardedAt: new Date() });
    await base.insert(schema.users).values([{ id: demo, email: 'demo@tiktrends.co', name: 'Camille' }]);
    await base.insert(schema.workspaceMembers).values([{ workspaceId: ws, userId: demo, role: 'owner' }]);
    await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Éclat Peau' });
    const photos = await Promise.all([0, 1, 2, 3].map(photo));
    const [p] = await base.insert(schema.products).values({
      brandId: brand, name: 'Sérum Clarté', description: 'Sérum anti-imperfections, flacon compte-gouttes', usp: 'Peau nette en 7 jours',
      price: 29, imageUrl: photos[0]!, imageUrls: photos,
    }).returning();
    const [pl] = await base.insert(schema.products).values({
      brandId: brand, name: LONG, description: 'Coffret de trois flacons', usp: 'Une routine complète matin et soir sans dessécher la peau',
      price: 59, imageUrl: photos[1]!, imageUrls: [photos[1]!, photos[2]!],
    }).returning();

    const ctx = () => contexteDepuisSession({ user: { id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: ws, role: 'owner', plan: 'business', equipe: null }, [brand], [], `st_semis_${randomUUID()}`);
    const O = { veilleOuverte: true, maintenant: new Date() };
    const courante = async (id: string) => (await base.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, id)))[0]!.currentVersionId!;
    const hyp = { id: 'hyp_1', statement: 'Une accroche douleur au réveil augmente le taux de clic.', sourceIds: [], variable: 'Accroche', control: 'Accroche bénéfice', treatment: 'Accroche douleur', invariants: ['Même offre'], metric: 'Taux de clic (CTR)', decisionRule: 'Garder si +15 % de CTR après 3 000 impressions', limitations: [] };

    const creer = async (titre: string, produit: typeof p | null) => {
      const ref = produit ? referenceProduit({ id: produit.id, name: produit.name, description: produit.description, usp: produit.usp, price: produit.price, url: produit.url, imageUrl: produit.imageUrl, imageUrls: produit.imageUrls }, new Date()) : null;
      const brief = ref ? { ...composerBrief({ sources: [], hypothese: hyp, produit: ref, audience: 'Peaux mixtes, 25-35 ans' }), formats: ['4:5'] } : null;
      const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown> | null, productRef: ref as unknown as ContenuVersion['productRef'] };
      const [pr] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: titre, ownerId: demo }).returning();
      const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: pr!.id, workspaceId: ws, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu), authorId: demo, reason: 'Création' }).returning();
      await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, pr!.id));
      return pr!.id;
    };

    const doc = (titre: string, nomCalque: string): DocumentStudio => ({
      width: 1080, height: 1350, colorSpace: 'sRGB',
      fonts: { f_titre: { family: 'Sans Bold', assetId: null } },
      layers: {
        fond: { id: 'fond', kind: 'shape', name: 'Fond', visible: true, locked: true, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 0, shape: 'rect', fill: '#f3ede4' },
        halo: { id: 'halo', kind: 'shape', name: nomCalque, visible: true, locked: false, x: 190, y: 330, width: 700, height: 700, rotationDeg: 0, opacity: 1, z: 1, shape: 'ellipse', fill: '#ffd6e2' },
        titre: { id: 'titre', kind: 'text', name: 'Accroche', visible: true, locked: false, x: 80, y: 90, width: 920, height: 180, rotationDeg: 0, opacity: 1, z: 20, text: titre, fontId: 'f_titre', fontSizePx: 76, color: '#1c121b', align: 'center', lineHeight: 1.1 },
        masque: { id: 'masque', kind: 'shape', name: 'Bandeau masqué', visible: false, locked: false, x: 0, y: 1200, width: 1080, height: 150, rotationDeg: 0, opacity: 1, z: 21, shape: 'rect', fill: '#ff5c8a' },
      },
    });

    // Registre de test publié (local) · la consigne image passe par l'adaptateur SIMULÉ.
    await publierRegistreDeTest(depotPrompts, acteurPlateforme());
    const texte = adaptateurSimule((a: AppelModele) => {
      const ti = JSON.parse(a.messages[2]!.contenu.split('TASK_INPUTS_JSON=')[1]!) as { referenceIds: string[] };
      return { status: 'ready', questions: [], warnings: [], evidenceIds: [], result: {
        generationInstruction: 'Flacon de Sérum Clarté posé sur un lavabo blanc, lumière douce du matin, une goutte suspendue au compte-gouttes.',
        negativeConstraints: ['Pas de texte dans l’image'], needsDeterministicOverlay: true, protectedComponents: ['flacon', 'compte-gouttes'],
        referenceBindings: ti.referenceIds.map((id) => (id.startsWith('pph_') ? { referenceId: id, role: 'product', scope: 'product' } : { referenceId: id, role: 'style', scope: 'background' })),
      } };
    });

    const preparer = async (titre: string, produit: typeof p, composants: string[], textes: string[], nomCalque: string, consigne: boolean) => {
      const id = await creer(titre, produit);
      const c = await chargerCatalogueProjet(ctx(), id, O);
      if (!c.ok) throw new Error(c.code);
      const ph = c.catalogue.produits.find((x) => x.produit.id === produit!.id)!.photos[0]!.assetId;
      const r = await epinglerProduitPour(ctx(), { projectId: id, baseVersionId: await courante(id), productId: produit!.id, photoId: ph, composants }, O);
      if (!r.ok) throw new Error(JSON.stringify(r));
      const t = await enregistrerTextesPour(ctx(), { projectId: id, baseVersionId: await courante(id), textes: textes.map((x, i) => ({ type: i === 0 ? 'hook' : 'cta', langue: 'fr', texte: x, sources: [] })) });
      if (!t.ok) throw new Error(JSON.stringify(t));
      const d = await enregistrerVersion(ctx(), { projectId: id, baseVersionId: await courante(id), changes: [{ op: 'replace', path: '/document', newValue: doc(textes[0]!, nomCalque), reason: 'composition' }], allowedPaths: ['/document'], raison: 'Composition 4:5' });
      if (!d.ok) throw new Error(JSON.stringify(d));
      if (consigne) {
        const k = await compilerEtAttesterPour(ctx(), { projectId: id, mode: 'generative_scene' }, { adaptateur: texte, environnement: 'test' as const, ...O });
        if (!k.ok || k.statut !== 'compilee') throw new Error(JSON.stringify(k));
        const rt = await retenirConsignePour(ctx(), { projectId: id, baseVersionId: await courante(id), runId: k.runId });
        if (!rt.ok) throw new Error(JSON.stringify(rt));
      }
      return id;
    };

    const rempli = await preparer('Sérum · visuel 4:5', p!, ['flacon', 'compte-gouttes'], ['Fini les boutons au réveil', 'Je découvre le sérum'], 'Halo', true);
    const long = await preparer(`${LONG} · déclinaison printemps pour la campagne d’acquisition TikTok et Meta`, pl!, ['flacon de gauche avec étiquette dorée', 'coffret cartonné ouvert'],
      ['Ta peau change en sept jours, et tu le vois dès le premier matin quand tu te regardes dans le miroir de la salle de bain avant de partir travailler', 'Je découvre le coffret complet maintenant'],
      'Halo rose pâle derrière le flacon principal avec dégradé très doux vers le bord du cadre', false);
    const vide = await creer('Projet sans brief', null);
    if (SORTIE) writeFileSync(SORTIE, JSON.stringify({ ws, brand, demo, rempli, long, vide }, null, 2));
  }, 120_000);
});
