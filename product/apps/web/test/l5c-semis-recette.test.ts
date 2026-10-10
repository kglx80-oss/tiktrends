import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/**
 * L5-C · SEMIS de recette visuelle (pas une garde) · remplit une base LOCALE
 * pour les captures de « Produit et références » et « Textes liés au brief ».
 * Ignoré sauf si `L5C_SEMIS_RECETTE=1` ET `L5C_PG_URL` désigne 127.0.0.1 /
 * localhost. Les gestes passent par les VRAIES commandes du lot (épingler,
 * associer, retenir) ; aucun réseau, aucun modèle, aucune dépense. Restaurer
 * la base ensuite.
 *
 *   L5C_SEMIS_RECETTE=1 L5C_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_l5c \
 *   L5C_SEMIS_SORTIE=/chemin/semis.json pnpm exec vitest run test/l5c-semis-recette.test.ts
 */

const URL_PG = process.env.L5C_PG_URL ?? '';
const ACTIF = process.env.L5C_SEMIS_RECETTE === '1' && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import sharp from 'sharp';
import { eq } from 'drizzle-orm';
import {
  composerBrief, referenceProduit, referenceSource, annonceObservee, empreinteContenu, contenuVide, SCHEMA_VERSION_CONTENU,
  type ContenuVersion, type DocumentStudio,
} from '@tiktrends/core';
import { schema } from '@tiktrends/db';
import { contexteDepuisSession } from '../lib/studios/garde';
import type { BaseStudio } from '../lib/studios/execution/types';

const FONDS = ['#f3ede4', '#e7eef3', '#efe7f1', '#e9f1e6', '#f4e9e4', '#e6e9f1', '#f1efe4'];

/** Une photo produit factice : lunettes de sport et leur bandeau, sous sept angles. */
async function photo(n: number): Promise<string> {
  const angle = [-8, 0, 6, -14, 3, 12, -3][n]!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
    <rect width="640" height="640" fill="${FONDS[n]}"/>
    <ellipse cx="320" cy="470" rx="230" ry="26" fill="#000" opacity=".08"/>
    <g transform="rotate(${angle} 320 320)">
      <path d="M70 300 C 90 180, 550 180, 570 300" stroke="#ff5c8a" stroke-width="22" fill="none" stroke-linecap="round"/>
      <rect x="120" y="262" width="170" height="104" rx="44" fill="#1c121b"/>
      <rect x="350" y="262" width="170" height="104" rx="44" fill="#1c121b"/>
      <rect x="136" y="276" width="138" height="76" rx="34" fill="#3b6ea8" opacity=".85"/>
      <rect x="366" y="276" width="138" height="76" rx="34" fill="#3b6ea8" opacity=".85"/>
      <path d="M290 300 Q 320 280 350 300" stroke="#1c121b" stroke-width="14" fill="none"/>
      <path d="M150 290 L 200 284" stroke="#fff" stroke-width="6" opacity=".5" stroke-linecap="round"/>
    </g>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

describe.skipIf(!ACTIF)('Semis de recette visuelle L5-C', () => {
  it('remplit la base locale', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_PG;
    const base = (await import('@tiktrends/db')).db as BaseStudio;
    const { epinglerProduitPour, associerReferencePour } = await import('../lib/studios/produit/commandes');
    const { chargerCatalogueProjet } = await import('../lib/studios/produit/catalogue');
    const { enregistrerTextesPour } = await import('../lib/studios/textes/textes');
    delete process.env.DATABASE_URL;

    const ws = randomUUID(); const brand = randomUUID(); const demo = randomUUID(); const lecteur = randomUUID();
    await base.insert(schema.workspaces).values({ id: ws, name: 'Atelier Vélocité', plan: 'business' });
    await base.insert(schema.users).values([{ id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, { id: lecteur, email: 'lecteur@velocite.test', name: 'Sacha' }]);
    await base.insert(schema.workspaceMembers).values([{ workspaceId: ws, userId: demo, role: 'owner' }, { workspaceId: ws, userId: lecteur, role: 'client_viewer' }]);
    const logo = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" rx="40" fill="#1c121b"/><path d="M40 70 L100 150 L160 70" stroke="#ff5c8a" stroke-width="22" fill="none" stroke-linejoin="round"/></svg>')).png().toBuffer();
    await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Vélocité Sport', logoUrl: `data:image/png;base64,${logo.toString('base64')}` });

    const photos = await Promise.all(FONDS.map((_, i) => photo(i)));
    const [p] = await base.insert(schema.products).values({
      brandId: brand, name: 'Lunettes Sport Bandeau', description: 'Lunettes de course à verres miroir, bandeau élastique réglable', usp: 'Restent en place jusqu’au dernier kilomètre',
      price: 59, url: 'https://velocite.example/lunettes', imageUrl: photos[0]!, imageUrls: photos,
    }).returning();
    await base.insert(schema.products).values({ brandId: brand, name: 'Gourde isotherme 750 ml', usp: 'Froide pendant 24 h', price: 29, imageUrl: await photo(3) });
    await base.insert(schema.assets).values({ workspaceId: ws, brandId: brand, name: 'Coureuse au lever du jour', kind: 'image', url: await photo(5) });

    const annonce = annonceObservee({
      id: '9001', platform: 'meta', daysRunning: 64, mediaType: 'image', thumbnailUrl: 'https://cdn.test/v.jpg',
      advertiserName: 'Lumière Botanique', body: 'Votre regard mérite mieux. Nos lunettes à verres miroir tiennent partout et pour toujours.',
      callToAction: 'Acheter', landingDomain: 'lbcosmetiques.fr',
    })!;
    const source = referenceSource({ type: 'veille_ad', annonce, savedAdId: null, portee: { workspaceId: ws, brandId: brand }, observeLe: new Date('2026-10-02T09:00:00Z'), format: null, retourVeille: null });
    const produit = referenceProduit({ id: p!.id, name: p!.name, description: p!.description, usp: p!.usp, price: p!.price, url: p!.url, imageUrl: p!.imageUrl, imageUrls: p!.imageUrls }, new Date('2026-10-02T09:00:00Z'));
    const hyp = { id: 'hyp_1', statement: 'Une accroche sur la tenue en course augmente le taux de clic.', sourceIds: [source.sourceId], variable: 'Accroche', control: 'Accroche prix', treatment: 'Accroche tenue', invariants: ['Même visuel', 'Même offre'], metric: 'Taux de clic (CTR)', decisionRule: 'Garder si +15 % de CTR après 3 000 impressions', limitations: [] };
    const brief = composerBrief({ sources: [source], hypothese: hyp, produit, audience: 'Coureurs de 25 à 40 ans, sorties matinales' });
    const doc: DocumentStudio = {
      width: 1080, height: 1350, colorSpace: 'sRGB', fonts: { inter: { family: 'Inter', assetId: null } },
      layers: {
        l_titre: { id: 'l_titre', kind: 'text', name: 'Accroche', visible: true, locked: false, x: 60, y: 90, width: 960, height: 220, rotationDeg: 0, opacity: 1, z: 3, text: 'Le confort à chaque foulée', fontId: 'inter', fontSizePx: 72, color: '#ffffff', align: 'center', lineHeight: 1.1 },
        l_cta: { id: 'l_cta', kind: 'text', name: 'Bouton', visible: true, locked: false, x: 340, y: 1180, width: 400, height: 90, rotationDeg: 0, opacity: 1, z: 4, text: 'Découvrir', fontId: 'inter', fontSizePx: 40, color: '#ffffff', align: 'center', lineHeight: 1.1 },
      },
    };
    const creer = async (titre: string, document: DocumentStudio | null) => {
      const contenu: ContenuVersion = { ...contenuVide(), brief: brief as unknown as Record<string, unknown>, productRef: produit as unknown as ContenuVersion['productRef'], document };
      const [pr] = await base.insert(schema.studioProjects).values({ workspaceId: ws, brandId: brand, kind: 'ads', title: titre, ownerId: demo, sourceRefs: [source] }).returning();
      const [v] = await base.insert(schema.studioProjectVersions).values({ projectId: pr!.id, workspaceId: ws, brandId: brand, parentId: null, n: 1, schemaVersion: SCHEMA_VERSION_CONTENU, content: contenu, contentHash: empreinteContenu(contenu), authorId: demo, reason: 'Création depuis la Veille' }).returning();
      await base.update(schema.studioProjects).set({ currentVersionId: v!.id, rowVersion: 1 }).where(eq(schema.studioProjects.id, pr!.id));
      return { projectId: pr!.id, versionId: v!.id };
    };
    const vide = await creer('Lunettes · accroche tenue (à démarrer)', null);
    const plein = await creer('Lunettes · accroche tenue', doc);

    const ctx = () => contexteDepuisSession({ user: { id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: ws, role: 'owner', plan: 'business', equipe: null }, [brand], [], `st_semis_${randomUUID()}`);
    const O = { veilleOuverte: true, maintenant: new Date() };
    const c = await chargerCatalogueProjet(ctx(), plein.projectId, O);
    if (!c.ok) throw new Error(c.code);
    const ph = c.catalogue.produits.find((x) => x.produit.id === p!.id)!.photos;
    let v = await epinglerProduitPour(ctx(), { projectId: plein.projectId, baseVersionId: plein.versionId, productId: p!.id, photoId: ph[4]!.assetId, composants: ['lunettes', 'bandeau'] }, O);
    if (!v.ok) throw new Error(JSON.stringify(v));
    v = await associerReferencePour(ctx(), { projectId: plein.projectId, baseVersionId: v.version.id, assetId: source.sourceId, role: 'style', scope: 'background' }, O);
    if (!v.ok) throw new Error(JSON.stringify(v));
    v = await associerReferencePour(ctx(), { projectId: plein.projectId, baseVersionId: v.version.id, assetId: source.sourceId, role: 'composition', scope: 'global' }, O);
    if (!v.ok) throw new Error(JSON.stringify(v));
    const bib = [...c.catalogue.fichiers.values()].find((f) => f.provenance === 'bibliotheque')!;
    v = await associerReferencePour(ctx(), { projectId: plein.projectId, baseVersionId: v.version.id, assetId: bib.assetId, role: 'identity', scope: 'subject' }, O);
    if (!v.ok) throw new Error(JSON.stringify(v));
    const t = await enregistrerTextesPour(ctx(), { projectId: plein.projectId, baseVersionId: v.version.id, textes: [
      { type: 'hook', texte: 'Elles ne bougent pas. Toi, si.', sources: ['produit.promesse'] },
      { type: 'hook', texte: 'Jusqu’au dernier kilomètre.', sources: ['produit.promesse'] },
      { type: 'cta', texte: 'Je cours avec' },
      { type: 'script', texte: 'Plan 1 · départ à l’aube, bandeau serré.\nPlan 2 · sprint, les lunettes ne bougent pas.\nPlan 3 · arrivée, « Restent en place jusqu’au dernier kilomètre ».', sources: ['produit.promesse'] },
    ] });
    if (!t.ok) throw new Error(JSON.stringify(t));
    expect(t.version.n).toBe(6);
    const sortie = { ws, brand, demo, lecteur, vide: vide.projectId, plein: plein.projectId };
    if (process.env.L5C_SEMIS_SORTIE) writeFileSync(process.env.L5C_SEMIS_SORTIE, JSON.stringify(sortie, null, 2));
  }, 60_000);
});
