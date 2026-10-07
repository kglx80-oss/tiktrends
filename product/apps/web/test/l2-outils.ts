import { randomUUID } from 'node:crypto';
import type { Acteur } from '../lib/studios/prompts/depot-prompts';
import { PERMISSIONS_PLATEFORME } from '@tiktrends/core';

/**
 * Outils communs des tests L2 serveur · acteurs et publication de test.
 *
 * `acteurPlateforme` reçoit TOUTES les permissions plateforme, comme un accès
 * total (adminplus, admin d'équipe) ; `acteurSans` n'en a aucune, comme un
 * owner ou un admin d'ESPACE (SEC-09).
 */
export function acteurPlateforme(userId: string | null = null): Acteur {
  return {
    userId, roleEffectif: 'equipe:adminplus/espace:owner', traceId: `st_${randomUUID()}`,
    octrois: PERMISSIONS_PLATEFORME.map((permission) => ({ permission, portee: { niveau: 'plateforme' as const } })),
  };
}

export function acteurSans(userId: string | null = null): Acteur {
  return { userId, roleEffectif: 'espace:owner', traceId: `st_${randomUUID()}`, octrois: [] };
}

type Depot = typeof import('../lib/studios/prompts/depot-prompts');

/**
 * Import → validation de toutes les versions → release → évaluation →
 * publication en environnement « test ». Rend l'identifiant de la release.
 */
export async function publierRegistreDeTest(depot: Depot, a: Acteur = acteurPlateforme()): Promise<string> {
  const imp = await depot.importerPack(a);
  if (!imp.ok) throw new Error(`import : ${JSON.stringify(imp.constats)}`);
  for (const l of await depot.listerVersions()) {
    if (l.status !== 'draft') continue;
    const v = await depot.validerVersion(a, { id: l.id });
    if (!v.ok) throw new Error(`validation ${l.key} : ${JSON.stringify(v.constats)}`);
  }
  const r = await depot.creerRelease(a, { motif: 'release de test' });
  if (!r.ok) throw new Error(`release : ${JSON.stringify(r.constats)}`);
  const ev = await depot.evaluerRelease(a, { releaseId: r.id });
  if (!ev.ok || !ev.testsStructurels) throw new Error(`évaluation : ${JSON.stringify(ev)}`);
  const p = await depot.lirePointeur();
  const pub = await depot.publierRelease(a, { releaseId: r.id, attendue: p?.releaseId ?? null, environnement: 'test' });
  if (!pub.ok) throw new Error(`publication : ${JSON.stringify(pub.constats)}`);
  return r.id;
}
