import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

/**
 * L4-C · SEMIS de recette visuelle (pas une garde) · remplit une base LOCALE
 * pour les captures de « Variantes et tests ». Ignoré sauf si
 * `L4C_SEMIS_RECETTE=1` ET `L4C_PG_URL` désigne 127.0.0.1 / localhost.
 * Lots produits par le VRAI chemin L3 avec fournisseur et stockage SIMULÉS
 * (aucun réseau, aucune dépense). Restaurer la base ensuite.
 *
 *   L4C_SEMIS_RECETTE=1 L4C_PG_URL=postgres://postgres@127.0.0.1:5433/tiktrends_l4c \
 *   L4C_SEMIS_SORTIE=/chemin/semis.json pnpm exec vitest run test/l4c-semis-recette.test.ts
 */

const URL_PG = process.env.L4C_PG_URL ?? '';
const ACTIF = process.env.L4C_SEMIS_RECETTE === '1' && /^postgres(ql)?:\/\/[^@]*@(127\.0\.0\.1|localhost)(:\d+)?\//.test(URL_PG);

vi.mock('../lib/auth', () => ({ getSession: async () => null }));

import { schema } from '@tiktrends/db';
import { contexteDepuisSession } from '../lib/studios/garde';
import { projetAvecBrief, lancerLot, executer, sortiesDuJob, KEYFRAMES, saisieTest } from './l4c-harnais';
import { creerVariante } from '../lib/studios/variantes/variantes';
import { rattacherVarianteAuTest } from '../lib/studios/variantes/tests';
import { iterer } from '../lib/studios/variantes/apprentissage';
import { deciderQualite } from '../lib/studios/execution/commandes';
import type { BaseStudio } from '../lib/studios/execution/types';

describe.skipIf(!ACTIF)('Semis de recette visuelle L4-C', () => {
  it('remplit la base locale', async () => {
    vi.resetModules();
    process.env.DATABASE_URL = URL_PG;
    const base = (await import('@tiktrends/db')).db as BaseStudio;
    delete process.env.DATABASE_URL;

    const ws = randomUUID(); const brand = randomUUID(); const demo = randomUUID(); const lecteur = randomUUID();
    await base.insert(schema.workspaces).values({ id: ws, name: 'Atelier Lumen', plan: 'business' });
    await base.insert(schema.users).values([{ id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, { id: lecteur, email: 'lecteur@lumen.test', name: 'Sacha' }]);
    await base.insert(schema.workspaceMembers).values([{ workspaceId: ws, userId: demo, role: 'owner' }, { workspaceId: ws, userId: lecteur, role: 'client_viewer' }]);
    await base.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Maison Lumen' });
    await base.insert(schema.testProtocols).values({ brandId: brand, workspaceId: ws });
    await base.insert(schema.offers).values({ workspaceId: ws, brandId: brand, label: 'Duo sérum · −20 %' });
    await base.insert(schema.landingPages).values({ workspaceId: ws, brandId: brand, url: 'https://lumen.example/serum', label: 'Fiche sérum' });

    const ctx = () => contexteDepuisSession({ user: { id: demo, email: 'demo@tiktrends.co', name: 'Camille' }, workspaceId: ws, role: 'owner', plan: 'business', equipe: null }, [brand], [], `st_semis_${randomUUID()}`);
    const sources = [{ type: 'saved_ad', id: 'veille:pub_concurrente_1', observeLe: '2026-10-01' }];
    const p = await projetAvecBrief(base, { workspaceId: ws, brandId: brand, userId: demo, titre: 'Sérum anti-boutons · accroche douleur', sources });
    const vide = await projetAvecBrief(base, { workspaceId: ws, brandId: brand, userId: demo, titre: 'Crème de nuit · premier brief' });

    const lots: string[] = [];
    for (const ops of [['keyframe:s1'], ['keyframe:s2'], ['keyframe:s1'], KEYFRAMES(4)]) {
      const j = await lancerLot(base, ctx(), p.projectId, ops);
      expect(await executer(base, j)).toBe('completed');
      lots.push(j);
    }
    const lot4 = await sortiesDuJob(base, lots[3]!);
    const v3 = await creerVariante(ctx(), { assetId: lot4['keyframe:s3'] }, base);
    const v1 = await creerVariante(ctx(), { assetId: lot4['keyframe:s1'] }, base);
    if (!v3.ok || !v1.ok) throw new Error('variantes');
    const l = await rattacherVarianteAuTest(ctx(), { variantId: v3.variante.id, saisie: saisieTest() }, base);
    if (!l.ok) throw new Error(l.code);
    await base.insert(schema.verdicts).values({ adId: l.lien.adsmapAdId, workspaceId: ws, computed: 'inconclusive', comparable: true });

    const it1 = await iterer(ctx(), { variantId: v3.variante.id, baseVersionId: p.versionId }, base);
    if (!it1.ok) throw new Error(it1.code);
    const j5 = await lancerLot(base, ctx(), p.projectId, KEYFRAMES(2));
    expect(await executer(base, j5)).toBe('completed');
    await deciderQualite(ctx(), { jobId: j5 }, 'passed', base);
    const enfant = await creerVariante(ctx(), { assetId: (await sortiesDuJob(base, j5))['keyframe:s1'] }, base);
    if (!enfant.ok) throw new Error(enfant.code);
    await lancerLot(base, ctx(), p.projectId, KEYFRAMES(4)); // reste en file · génération active

    const sortie = { ws, brand, demo, lecteur, projet: p.projectId, vide: vide.projectId, varianteSansTest: v1.variante.id, varianteTestee: v3.variante.id, enfant: enfant.variante.id };
    if (process.env.L4C_SEMIS_SORTIE) writeFileSync(process.env.L4C_SEMIS_SORTIE, JSON.stringify(sortie, null, 2));
    await (base as unknown as { session: { client: { end: () => Promise<void> } } }).session.client.end().catch(() => {});
  }, 120_000);
});
