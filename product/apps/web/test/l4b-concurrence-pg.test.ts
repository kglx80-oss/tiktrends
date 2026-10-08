import { describe, it, expect, vi } from 'vitest';

/**
 * L4-B · idempotence par clé de clic sous concurrence RÉELLE (Postgres 16
 * local, pool de connexions du pilote). pglite n'a qu'une connexion : ses
 * transactions passent l'une après l'autre et ne prouvent rien ici.
 *
 * Quatre « Créer le projet » partent EN MÊME TEMPS avec la même clé de clic ·
 * on vérifie en base qu'un seul projet, une seule version et un seul audit
 * existent (verrou consultatif transactionnel sur espace + clé).
 *
 * Lancé seulement si `L4B_PG_URL` désigne une base locale VIDE à 55 migrations
 * (restaurée depuis le dump de recette). Sans elle, la suite est ignorée.
 */

const URL_PG = process.env.L4B_PG_URL;
vi.hoisted(() => { if (process.env.L4B_PG_URL) process.env.DATABASE_URL = process.env.L4B_PG_URL; });

describe.skipIf(!URL_PG)('Postgres réel · clics simultanés', () => {
  it('quatre créations simultanées, même clé · un seul projet, une version, un audit', async () => {
    const { randomUUID } = await import('node:crypto');
    const { db, schema, eq } = await import('@tiktrends/db');
    const { creerProjetDepuisSourcesPour } = await import('../lib/studios/sources/projet');
    const { contexteDepuisSession } = await import('../lib/studios/garde');
    const ws = randomUUID(); const user = randomUUID(); const brand = randomUUID();
    await db.insert(schema.workspaces).values({ id: ws, name: 'Espace concurrence', plan: 'core' });
    await db.insert(schema.users).values({ id: user, email: `${user}@l4b.test` });
    await db.insert(schema.workspaceMembers).values({ workspaceId: ws, userId: user, role: 'member' });
    await db.insert(schema.brands).values({ id: brand, workspaceId: ws, name: 'Marque concurrence' });
    const ctx = contexteDepuisSession(
      { user: { id: user, email: `${user}@l4b.test`, name: null }, workspaceId: ws, role: 'member', plan: 'core', equipe: null },
      [brand], [], `st_${randomUUID()}`,
    );
    const entree = {
      sources: [{ type: 'veille', annonce: { id: '4242', platform: 'meta', mediaType: 'image', body: 'Texte observé.', advertiserName: 'Annonceur' } }],
      brandId: brand, cleClic: `clic-${randomUUID()}`,
      hypothese: { origine: 'saisie', saisie: { statement: 'Une accroche chiffrée augmente le clic.', variable: 'Accroche' } },
    };
    const r = await Promise.all([1, 2, 3, 4].map(() => creerProjetDepuisSourcesPour(ctx, entree, { veilleOuverte: true, maintenant: new Date() })));
    expect(r.every((x) => x.ok), JSON.stringify(r.filter((x) => !x.ok))).toBe(true);
    const projets = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.workspaceId, ws));
    expect(projets, 'deux clics simultanés · deux projets').toHaveLength(1);
    expect(r.filter((x) => x.ok && !x.deja)).toHaveLength(1);
    expect(await db.select().from(schema.studioProjectVersions).where(eq(schema.studioProjectVersions.workspaceId, ws))).toHaveLength(1);
    expect(await db.select().from(schema.studioAuditEvents).where(eq(schema.studioAuditEvents.workspaceId, ws))).toHaveLength(1);
  });
});
