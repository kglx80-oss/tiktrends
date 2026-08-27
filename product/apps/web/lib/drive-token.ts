import 'server-only';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { decryptSecret } from './secrets';

/**
 * Jeton Google Drive utilisable pour un espace de travail.
 *
 * La connexion Drive est posée PAR MARQUE (brands.drive_refresh_token_enc) :
 * c'est le callback OAuth qui l'écrit là. La colonne équivalente sur workspaces
 * n'est jamais alimentée · lire dessus renvoyait toujours « non connecté », ce
 * qui cassait silencieusement les vignettes Drive et faisait disparaître les
 * assets Drive des références envoyées à l'IA.
 *
 * On privilégie la marque de l'asset ; à défaut (asset commun à l'espace), on
 * prend la première marque connectée de l'espace.
 */
export async function driveRefreshTokenFor(workspaceId: string, brandId?: string | null): Promise<string | null> {
  if (!db) return null;
  const rows = await db.select({ id: schema.brands.id, tok: schema.brands.driveRefreshToken })
    .from(schema.brands)
    .where(and(eq(schema.brands.workspaceId, workspaceId), isNotNull(schema.brands.driveRefreshToken)))
    .limit(20);
  if (!rows.length) return null;
  const preferred = (brandId && rows.find((r) => r.id === brandId)) || rows[0];
  return decryptSecret(preferred?.tok) || null;
}
