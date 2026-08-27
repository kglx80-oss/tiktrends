import 'server-only';
import { lt } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { userError, rawMessage, errorFamily, type UserErrorOptions } from './user-error';

/**
 * Journal des échecs techniques.
 *
 * Jusqu'ici tout partait dans les logs du conteneur, que personne ne lit : un
 * fournisseur qui déraille se découvrait par un client mécontent. On garde donc
 * une trace en base, consultable dans ADMIN+.
 *
 * Trois précautions : le détail est tronqué (un message d'API peut contenir tout
 * un payload), l'écriture est « au mieux » et n'échoue jamais l'action en cours,
 * et les lignes de plus de 30 jours sont purgées au fil de l'eau.
 */

const DETAIL_MAX = 500;
const RETENTION_MS = 30 * 86_400_000;
let lastPurge = 0;

/** Purge paresseuse : au plus une fois par heure, sans bloquer l'appelant. */
function purgeSometimes(): void {
  const now = Date.now();
  if (!db || now - lastPurge < 3_600_000) return;
  lastPurge = now;
  void db.delete(schema.errorLog)
    .where(lt(schema.errorLog.createdAt, new Date(now - RETENTION_MS)))
    .catch(() => { /* la purge n'est jamais critique */ });
}

/**
 * Trace un échec (console + journal) et renvoie le message destiné à l'utilisateur.
 * `scope` identifie l'endroit : « studio:script », « video:start »…
 */
export function logAndTranslate(scope: string, e: unknown, opts: UserErrorOptions & { workspaceId?: string } = {}): string {
  const detail = rawMessage(e);
  console.error(`[${scope}]`, detail);

  if (db) {
    // Volontairement non attendu : tracer ne doit jamais ralentir ni faire
    // échouer l'action qui vient déjà d'échouer.
    void db.insert(schema.errorLog).values({
      scope: scope.slice(0, 80),
      family: errorFamily(e),
      detail: detail.slice(0, DETAIL_MAX) || '(sans message)',
      workspaceId: opts.workspaceId ?? null,
    }).catch(() => { /* au pire, il reste la ligne de console */ });
    purgeSometimes();
  }

  return userError(e, opts);
}
