import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { IdsStudios } from './studios-semis';

/**
 * L8-C · MESURE côté serveur (sur demande, jamais en CI) ·
 * `L8C_MESURE=1 pnpm vitest run test/l8c-mesure-web.test.ts`.
 *
 * Sur une VRAIE base (pglite, migrations réelles) : lecture de l'éditeur et
 * sérialisation de sa vue, lecture de l'écran vidéo (200 jobs terminés à
 * relire), enregistrement d'une version ; puis le rendu serveur d'un document
 * (`rendreDocument`, sharp) avec des médias synthétiques. Petit (20 plans,
 * 100 calques) puis grand (200 plans, 1000 calques). La charge est notée.
 */

const h = vi.hoisted(() => ({ ids: null as unknown as IdsStudios }));
vi.hoisted(() => {
  const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
  const u = () => randomUUID();
  h.ids = { wsA: u(), wsB: u(), brandA1: u(), brandA2: u(), brandB1: u(), ua: u(), uv: u(), ur: u(), ub: u() };
});
vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { writeFileSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';
import { db, schema } from '@tiktrends/db';
import { contenuEchelle, type EchelleSynthetique } from '@tiktrends/core';
import { semer } from './studios-semis';
import { ctxDe } from './l4a-outils';
import { lireEditeurPour } from '../lib/studios/editeur/lecture';
import { lireVideoPour } from '../lib/studios/video/lecture';
import { enregistrerVersion } from '../lib/studios/depot';
import { rendreDocument } from '../lib/studios/rendu/compositeur';
import { mediasSynthetiques, projetAvecJobs, chronometrerAsync } from './l8c-outils';
import type { BaseStudio } from '../lib/studios/execution/types';

const actif = process.env.L8C_MESURE === '1';
const N = Number(process.env.L8C_TIRAGES ?? 20);
const ids = h.ids;
const base = db as unknown as BaseStudio;
const LECTURE = { maintenant: new Date('2026-10-09T10:00:00Z'), releasePubliee: true, fournisseurTexte: true, plafondAtteint: false, fournisseurImage: true, coutTexteUsd: 0.14 };

describe.skipIf(!actif)('L8-C · mesure des chemins serveur', () => {
  beforeAll(async () => { await semer(db, schema, ids); });

  it('lecture éditeur, lecture vidéo, enregistrement, rendu · petit puis grand', async () => {
    const chargeAvant = loadavg();
    const medias = await mediasSynthetiques();
    const sortie: Record<string, unknown> = { machine: `${cpus()[0]?.model} · ${cpus().length} cœurs · node ${process.version}`, tirages: N, chargeAvant };
    for (const e of ['petit', 'grand'] as EchelleSynthetique[]) {
      const contenu = contenuEchelle(e);
      const { projectId } = await projetAvecJobs(base, ids, contenu);
      const ctx = ctxDe(ids, 'ua');
      const r: Record<string, unknown> = {};
      r.lecture_editeur = await chronometrerAsync(async () => {
        const l = await lireEditeurPour(ctx, projectId);
        if (!l.ok) throw new Error(l.code);
        return JSON.stringify(l.donnees);
      }, N);
      r.lecture_video = await chronometrerAsync(async () => {
        const l = await lireVideoPour(ctx, projectId, LECTURE);
        if (!l.ok) throw new Error(l.code);
        return JSON.stringify(l.vue);
      }, N);
      // Enregistrement réel · une version par tirage, chaque fois sur la courante.
      let n = 0;
      r.enregistrement = await chronometrerAsync(async () => {
        const [p] = await db.select().from(schema.studioProjects).where((await import('@tiktrends/db')).eq(schema.studioProjects.id, projectId));
        const texte = Object.values(contenu.document!.layers).find((l) => l.kind === 'text' && !l.locked)!;
        const s = await enregistrerVersion(ctx, { projectId, baseVersionId: p!.currentVersionId, changes: [{ op: 'replace', path: `/document/layers/${texte.id}/text`, newValue: `Essai ${++n}`, reason: 'mesure' }], raison: 'mesure' });
        if (!s.ok) throw new Error(s.code);
      }, N);
      r.rendu_document = await chronometrerAsync(async () => {
        const x = await rendreDocument(contenu.document!, medias);
        if (!x.ok) throw new Error(x.code);
      }, Math.min(N, e === 'grand' ? 20 : N), 1);
      sortie[e] = r;
    }
    sortie.chargeApres = loadavg();
    console.log(JSON.stringify(sortie, null, 1));
    if (process.env.L8C_SORTIE) writeFileSync(process.env.L8C_SORTIE, JSON.stringify(sortie, null, 1));
    expect(sortie.grand).toBeTruthy();
  }, 1_800_000);
});
