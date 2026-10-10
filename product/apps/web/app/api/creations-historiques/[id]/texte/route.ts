import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { texteCreationHistorique, STATUT_CREATION_LIVREE } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { roleAtLeast } from '../../../../../lib/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const neutre = () => new Response('Introuvable', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

/**
 * Le texte d'une création historique (anciens Textes IA · script, copie), en
 * fichier · LECTURE SEULE. Session relue, création relue dans l'ESPACE de la
 * session par sa marque ; hors portée, inconnue ou non terminée : 404 neutre.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await getSession();
  if (!s || !db || !roleAtLeast(s.role, 'member')) return neutre();
  const { id } = await params;
  if (!UUID.test(id)) return neutre();
  const G = schema.generations;
  const [g] = await db.select({ output: G.output, createdAt: G.createdAt }).from(G)
    .innerJoin(schema.brands, eq(G.brandId, schema.brands.id))
    .where(and(eq(G.id, id), eq(schema.brands.workspaceId, s.workspaceId), eq(G.status, STATUT_CREATION_LIVREE), inArray(G.kind, ['script', 'copy'])))
    .limit(1);
  if (!g) return neutre();
  const texte = texteCreationHistorique(g.output);
  if (!texte) return neutre();
  return new Response(`${texte}\n`, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'content-disposition': `attachment; filename="texte-${id.slice(0, 8)}.txt"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
