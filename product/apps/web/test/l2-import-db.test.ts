import { describe, it, expect, vi } from 'vitest';

/**
 * PROMPT-01 au niveau BASE · le pack s'importe en brouillons, deux fois sans
 * doublon, jamais actif ; un conflit d'empreinte n'écrit RIEN.
 *
 * Vraie base (pglite + les migrations du dépôt), vrai dépôt, vrai pack
 * embarqué. On lit les LIGNES écrites, pas les fonctions appelées.
 */

vi.mock('@tiktrends/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiktrends/db')>();
  const { pgMemoire } = await import('./helpers/pg-memoire');
  const db = await pgMemoire(actual.schema as unknown as Record<string, unknown>);
  return { ...actual, db };
});

import { db, schema, eq } from '@tiktrends/db';
import * as depot from '../lib/studios/prompts/depot-prompts';
import { acteurPlateforme, acteurSans } from './l2-outils';

const compter = async () => (await db.select().from(schema.studioPromptVersions)).length;
const audits = async () => db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.action, 'prompt.import'));

describe('PROMPT-01 · import du pack en brouillon', () => {
  it('sans prompt.draft (admin d’espace) · refus, rien d’écrit', async () => {
    const r = await depot.importerPack(acteurSans());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.constats[0]!.code).toBe('FORBIDDEN');
    expect(await compter()).toBe(0);
  });

  it('premier import · 22 templates, 8 recettes, socle, rendu, conversation Jarvis · tout en brouillon', async () => {
    const r = await depot.importerPack(acteurPlateforme());
    expect(r).toMatchObject({ ok: true, crees: 33, dejaPresentes: 0 });
    const lignes = await db.select().from(schema.studioPromptVersions);
    const parKind = (k: string) => lignes.filter((l) => l.kind === k).length;
    expect([parKind('template'), parKind('style_recipe'), parKind('common')]).toEqual([22, 8, 3]);
    expect(new Set(lignes.map((l) => l.status))).toEqual(new Set(['draft']));
    expect(lignes.every((l) => l.scope === 'platform' && l.workspaceId === null && l.brandId === null)).toBe(true);
    // Rien d'actif : aucune release, aucun pointeur.
    expect(await db.select().from(schema.studioPromptReleases)).toEqual([]);
    expect(await db.select().from(schema.studioPromptActive)).toEqual([]);
    const a = await audits();
    expect(a.length).toBe(1);
    expect(a[0]).toMatchObject({ workspaceId: null, brandId: null, targetId: 'tiktrends-studios@1.0.0' });
  });

  it('second import · idempotent, aucune ligne ni audit de plus', async () => {
    const r = await depot.importerPack(acteurPlateforme());
    expect(r).toMatchObject({ ok: true, crees: 0, dejaPresentes: 33 });
    expect(await compter()).toBe(33);
    expect((await audits()).length).toBe(1);
  });

  it('même clé et version, autre empreinte · conflit, RIEN d’écrit (pas même ce qui manquait)', async () => {
    const V = schema.studioPromptVersions;
    const [brief] = await db.select().from(V).where(eq(V.key, 'brief.build'));
    // Un brouillon se supprime · on remplace brief.build 1.0.0 par un contenu altéré,
    // et on retire text.write pour que l'import ait quelque chose à créer.
    await db.delete(V).where(eq(V.key, 'brief.build'));
    await db.delete(V).where(eq(V.key, 'text.write'));
    await db.insert(V).values({ ...brief!, id: undefined, contentHash: 'f'.repeat(64), content: { altere: true } });
    const avant = await compter();
    const r = await depot.importerPack(acteurPlateforme());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.constats.map((c) => c.code)).toContain('IMPORT_CONFLIT_EMPREINTE');
    expect(!r.ok && r.constats.some((c) => c.cible === 'template:brief.build@1.0.0')).toBe(true);
    expect(await compter()).toBe(avant);
    expect(await db.select().from(V).where(eq(V.key, 'text.write'))).toEqual([]);
    expect((await audits()).length).toBe(1);
  });
});
