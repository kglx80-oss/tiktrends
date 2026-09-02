import 'server-only';
import { sql } from 'drizzle-orm';
import { db, MIGRATIONS_IN_BUILD } from '@tiktrends/db';
import { deploymentState, type DeploymentState } from '@tiktrends/core';
import { RENDER_VERSION } from './ad-render';

/**
 * Ce que ce serveur exécute vraiment.
 *
 * ── Ce qui a rendu ça nécessaire ─────────────────────────────────────────────
 *
 * Une grille rapportée comme cassée venait d'un build antérieur au correctif. Il
 * a fallu sonder le rendu pixel par pixel pour l'établir · et entre-temps, trois
 * défauts avaient été « corrigés », dont deux n'existaient pas.
 *
 * Rien dans le produit ne disait quelle version tournait. Chaque rapport de bug
 * devenait une enquête.
 *
 * ── Comment on compte les migrations appliquées ──────────────────────────────
 *
 * `drizzle-kit migrate` inscrit une ligne par migration dans
 * `drizzle.__drizzle_migrations`. On compte les lignes plutôt que d'apparier les
 * empreintes · l'appariement demanderait de recalculer les hachages du journal,
 * pour répondre à une question qui n'a besoin que d'un nombre.
 *
 * Une lecture en échec rend `null`, jamais zéro · « zéro migration appliquée »
 * et « je n'ai pas pu regarder » ne se ressemblent pas du tout.
 */
export async function currentDeployment(): Promise<DeploymentState> {
  let applied: number | null = null;
  if (db) {
    try {
      const r = await db.execute(sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
      const row = (r as unknown as Array<{ n: number }>)[0];
      applied = typeof row?.n === 'number' ? row.n : null;
    } catch {
      // Table absente (base jamais migrée) ou droits manquants · dans les deux
      // cas on ne sait pas, et on le dit.
      applied = null;
    }
  }

  return deploymentState({
    renderVersion: RENDER_VERSION,
    // Posé au build · voir docs/CLES-A-BRANCHER.md. Absent, on ne prétend rien.
    build: process.env.BUILD_SHA?.slice(0, 8) ?? null,
    inBuild: MIGRATIONS_IN_BUILD,
    applied,
  });
}
