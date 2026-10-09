import { describe, it, vi } from 'vitest';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * R4 · SEMIS de recette visuelle (pas une garde) · remplit une base LOCALE
 * pour les captures de l'écran d'export (exports conservés) et de la section
 * « à réconcilier » des dépenses. Ignoré sauf si `R4_SEMIS_RECETTE=1` ET
 * `R4_PG_URL` désigne 127.0.0.1 / localhost. Aucun réseau, aucun modèle,
 * aucune dépense réelle : les lignes `ai_spend` sont SYNTHÉTIQUES, le rendu
 * est local, et le « stockage » des exports est un dossier local
 * (`R4_STOCKAGE_DIR`), jamais un bucket.
 *
 *  · « Sérum · visuel 4:5 » : V1 exportée en PNG (conservée), V2 exportée en
 *    JPEG sans stockage (non conservée) · historique des deux états ;
 *  · « Carré vide » : aucun export ; « Bannière soldes » : préflight refusé ;
 *  · 3 dépenses « à réconcilier » et 3 ordinaires, synthétiques.
 */

const URL_PG = process.env.R4_PG_URL ?? '';
const ACTIF = process.env.R4_SEMIS_RECETTE === '1' && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);
const SORTIE = process.env.R4_SEMIS_SORTIE ?? '';
const DOSSIER = process.env.R4_STOCKAGE_DIR ?? '';

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import { empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU, type ContenuVersion, type DocumentStudio } from '@tiktrends/core';
import { schema } from '@tiktrends/db';
import { contexteDepuisSession } from '../lib/studios/garde';
import type { BaseStudio } from '../lib/studios/execution/types';

const uri = async (svg: string) => `data:image/png;base64,${(await sharp(Buffer.from(svg)).png().toBuffer()).toString('base64')}`;

describe.skipIf(!ACTIF)('Semis de recette visuelle R4', () => {
  it('projets, exports conservés et dépenses à réconcilier', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_PG;
    const base = (await import('@tiktrends/db')).db as BaseStudio;
    const { chargerCatalogueProjet } = await import('../lib/studios/produit/catalogue');
    const { enregistrerVersion } = await import('../lib/studios/depot');
    const { exporterVersionPour, injecterStockageExport } = await import('../lib/studios/export/export');
    const R = DOSSIER || '/nonexistent';
    const fichier = (cle: string) => join(R, cle);
    injecterStockageExport({
      async deposer(cle, octets) { mkdirSync(dirname(fichier(cle)), { recursive: true }); writeFileSync(fichier(cle), octets); },
      async relire(cle) { return existsSync(fichier(cle)) ? new Uint8Array(readFileSync(fichier(cle))) : null; },
    });
    delete process.env.DATABASE_URL;

    const ws = randomUUID(); const brand = randomUUID(); const demo = randomUUID();
    await base.insert(schema.workspaces).values({ id: ws, name: 'Atelier Éclat', plan: 'business', creditsBalance: 200 });
    await base.insert(schema.users).values([{ id: demo, email: 'fondateur-r4@exemple.invalid', name: 'Camille' }]);
    await base.insert(schema.workspaceMembers).values([{ workspaceId: ws, userId: demo, role: 'owner' }]);
    const logo = await uri('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" rx="24" fill="#1c121b"/><circle cx="60" cy="60" r="30" fill="#ff5c8a"/><rect x="104" y="44" width="110" height="12" rx="6" fill="#f6eef4"/><rect x="104" y="66" width="70" height="10" rx="5" fill="#f6eef4"/></svg>');
    await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Éclat Peau', logoUrl: logo });
    const photo = await uri(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#e9dfd2"/>
      <rect x="210" y="210" width="180" height="470" rx="48" fill="#1c121b"/><rect x="250" y="130" width="100" height="100" rx="18" fill="#ff5c8a"/>
      <rect x="236" y="380" width="128" height="150" rx="10" fill="#f6eef4"/><rect x="256" y="420" width="88" height="12" rx="6" fill="#1c121b"/><rect x="256" y="446" width="60" height="10" rx="5" fill="#ff5c8a"/></svg>`);
    const [p] = await base.insert(schema.products).values({ brandId: brand, name: 'Sérum Clarté', description: 'Sérum anti-imperfections', usp: 'Peau nette en 7 jours', price: 29, imageUrl: photo, imageUrls: [photo] }).returning();

    const ctx = () => contexteDepuisSession({ user: { id: demo, email: 'fondateur-r4@exemple.invalid', name: 'Camille' }, workspaceId: ws, role: 'owner', plan: 'business', equipe: null }, [brand], [], `st_semis_${randomUUID()}`);
    const creer = async (titre: string, doc: DocumentStudio | null) => {
      const contenu: ContenuVersion = { ...contenuVide(), document: doc };
      const [pr] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'image', title: titre, ownerId: demo }).returning();
      const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: pr!.id, workspaceId: ws, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu), authorId: demo, reason: 'Création' }).returning();
      await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, pr!.id));
      return { projectId: pr!.id, versionId: v!.id };
    };

    // Identités du catalogue (photo du produit, logo de la marque), lues par le chemin du produit.
    const tmp = await creer('Sérum · visuel 4:5', null);
    const c = await chargerCatalogueProjet(ctx(), tmp.projectId, { veilleOuverte: false, maintenant: new Date() });
    if (!c.ok) throw new Error(c.code);
    const photoId = c.catalogue.produits.find((x) => x.produit.id === p!.id)!.photos[0]!.assetId;
    const logoId = [...c.catalogue.fichiers.values()].find((f) => f.provenance === 'logo')!.assetId;

    const doc = (titre: string, famille = 'Sans Bold', logoAsset = logoId): DocumentStudio => ({
      width: 1080, height: 1350, colorSpace: 'sRGB',
      fonts: { f_titre: { family: famille, assetId: null }, f_corps: { family: 'Sans', assetId: null } },
      layers: {
        fond: { id: 'fond', kind: 'shape', name: 'Fond', visible: true, locked: true, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 0, shape: 'rect', fill: '#f3ede4' },
        halo: { id: 'halo', kind: 'shape', name: 'Halo', visible: true, locked: false, x: 190, y: 330, width: 700, height: 700, rotationDeg: 0, opacity: 1, z: 1, shape: 'ellipse', fill: '#ffd6e2' },
        produit: { id: 'produit', kind: 'image', name: 'Sérum Clarté', visible: true, locked: true, x: 315, y: 300, width: 450, height: 600, rotationDeg: 0, opacity: 1, z: 10, assetId: photoId, sourceWidth: 600, sourceHeight: 800, mask: null },
        titre: { id: 'titre', kind: 'text', name: 'Accroche', visible: true, locked: false, x: 80, y: 90, width: 920, height: 180, rotationDeg: 0, opacity: 1, z: 20, text: titre, fontId: 'f_titre', fontSizePx: 76, color: '#1c121b', align: 'center', lineHeight: 1.1 },
        bouton: { id: 'bouton', kind: 'shape', name: 'Bouton', visible: true, locked: false, x: 290, y: 1010, width: 500, height: 110, rotationDeg: 0, opacity: 1, z: 21, shape: 'rect', fill: '#ff5c8a' },
        cta: { id: 'cta', kind: 'text', name: 'Appel', visible: true, locked: false, x: 290, y: 1036, width: 500, height: 60, rotationDeg: 0, opacity: 1, z: 22, text: 'Je découvre le sérum', fontId: 'f_corps', fontSizePx: 40, color: '#ffffff', align: 'center', lineHeight: 1.2 },
        logo: { id: 'logo', kind: 'logo', name: 'Logo Éclat', visible: true, locked: false, x: 900, y: 1210, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 23, assetId: logoAsset },
      },
    });

    const v1 = await enregistrerVersion(ctx(), { projectId: tmp.projectId, baseVersionId: tmp.versionId, changes: [{ op: 'replace', path: '/document', newValue: doc('Peau nette en 7 jours'), reason: 'composition' }], allowedPaths: ['/document'], raison: 'Composition 4:5' });
    if (!v1.ok) throw new Error(JSON.stringify(v1));
    const e1 = await exporterVersionPour(ctx(), { projectId: tmp.projectId, format: 'png' });
    if (!e1.ok) throw new Error(JSON.stringify(e1));
    const v2 = await enregistrerVersion(ctx(), { projectId: tmp.projectId, baseVersionId: v1.version.id, changes: [{ op: 'replace', path: '/document/layers/titre/text', newValue: 'Fini les boutons au réveil', reason: 'accroche' }], allowedPaths: ['/document'], raison: 'Accroche douleur' });
    if (!v2.ok) throw new Error(JSON.stringify(v2));
    const e2 = await exporterVersionPour(ctx(), { projectId: tmp.projectId, format: 'jpeg' }, { stockage: null });
    if (!e2.ok) throw new Error(JSON.stringify(e2));

    const refus = await creer('Bannière soldes', doc('Soldes · −30 % ce week-end', 'Inter', randomUUID()));
    const vide = await creer('Carré vide', doc('Nouvelle routine'));
    injecterStockageExport(undefined);

    // Dépenses SYNTHÉTIQUES (aucun appel réel) · 3 à réconcilier, 3 ordinaires.
    const il = (h: number) => new Date(Date.now() - h * 3_600_000);
    await base.insert(schema.aiSpend).values([
      { workspaceId: ws, provider: 'anthropic', model: 'claude-sonnet-5', action: 'studio:brief', estimatedUsd: 0.4213, actualUsd: 0.4213, reconcileReason: 'coupure', createdAt: il(3) },
      { workspaceId: ws, provider: 'fal', model: 'nano-banana', action: 'studio:image', estimatedUsd: 0.39, actualUsd: 0.39, reconcileReason: 'delai', createdAt: il(20) },
      { workspaceId: null, provider: 'anthropic', model: 'claude-sonnet-5', action: 'adsmap:analyse', estimatedUsd: 0.1875, actualUsd: 0.1875, reconcileReason: 'saturation', createdAt: il(50) },
      { workspaceId: ws, provider: 'anthropic', model: 'claude-sonnet-5', action: 'jarvis:chat', estimatedUsd: 0.2, actualUsd: 0.031, inputTokens: 1800, outputTokens: 420, createdAt: il(1) },
      { workspaceId: ws, provider: 'fal', model: 'nano-banana', action: 'studio:image', estimatedUsd: 0.39, actualUsd: 0.39, createdAt: il(6) },
      { workspaceId: ws, provider: 'anthropic', model: 'claude-sonnet-5', action: 'copie:relecture', estimatedUsd: 0.05, actualUsd: 0.012, inputTokens: 900, outputTokens: 120, createdAt: il(30) },
    ]);
    if (SORTIE) writeFileSync(SORTIE, JSON.stringify({ ws, brand, demo, pret: tmp.projectId, refus: refus.projectId, vide: vide.projectId, v1: v1.version.id, e1: e1.export, e2: e2.export }, null, 2));
  }, 120_000);
});
