import { redirect } from 'next/navigation';
import { gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  LIBELLE_STATUT_VERSION, VALEUR_ABSENTE, adminIlYa, adminNombre, bibliothequePrompts,
  type EntreeBibliotheque, type FamillePrompt, type TypePromptRegistre, type VersionRegistre,
} from '@tiktrends/core';
import { gardePlateforme } from '../../../../../lib/studios/prompts/garde-prompts';
import * as depot from '../../../../../lib/studios/prompts/depot-prompts';
import { Prompts } from '../../../../../spatial/vues/admin/Prompts';
import { bandeauSeul } from '../donnees';

export const dynamic = 'force-dynamic';

const FAMILLES: ReadonlyArray<{ cle: FamillePrompt; libelle: string; colonne: string }> = [
  { cle: 'styles', libelle: 'Recettes de style', colonne: 'Style' },
  { cle: 'regles', libelle: 'Consignes communes', colonne: 'Consigne' },
  { cle: 'skills', libelle: 'Templates', colonne: 'Template' },
];

/** L'éditeur du registre (Spatial, « Registre IA ») · onglet et clé tels qu'il les lit. */
const editeur = (e: EntreeBibliotheque) =>
  `/admin/prompts/registre?onglet=${e.type === 'recette' ? 'recettes' : 'prompts'}&cle=${encodeURIComponent(`${e.type}:${e.cle}`)}`;

/**
 * « Bibliothèque IA » · NOUVELLE adresse · la bibliothèque de prompts ADMIN
 * existante (le registre des Studios), en lecture. Porte du registre V5 ·
 * `prompt.read` (accès total d'équipe), avant toute lecture.
 */
export default async function PromptsSpatial() {
  const g = await gardePlateforme('prompt.read');
  if (!g.ok) redirect(g.code === 'AUTH_REQUIRED' ? '/login' : '/dashboard');
  const maintenant = new Date();
  const depuis = new Date(maintenant.getTime() - 30 * 86_400_000);
  const R = schema.studioPromptRuns;
  const [b, lignes, active, runs, total30] = await Promise.all([
    bandeauSeul(),
    db ? depot.listerVersions() : Promise.resolve([]),
    db ? depot.releaseActive().catch(() => null) : Promise.resolve(null),
    db ? db.select({ cle: R.templateKey, n: sql<number>`count(*)` }).from(R).where(gte(R.createdAt, depuis)).groupBy(R.templateKey) : Promise.resolve([]),
    db ? db.select({ n: sql<number>`count(*)` }).from(R).where(gte(R.createdAt, depuis)) : Promise.resolve([{ n: 0 }]),
  ]);
  const auteurs = new Map<string, string>();
  const ids = [...new Set(lignes.map((l) => l.createdBy).filter((x): x is string => !!x))];
  if (db && ids.length) for (const u of await db.select({ id: schema.users.id, nom: schema.users.name, email: schema.users.email }).from(schema.users).where(inArray(schema.users.id, ids))) auteurs.set(u.id, u.nom || u.email);

  const versions: VersionRegistre[] = lignes.flatMap((l) => {
    const type = depot.typeDe(l.kind, l.key) as TypePromptRegistre | null;
    if (!type) return [];
    const c = (l.content ?? {}) as { title?: unknown };
    return [{ type, cle: l.key, titre: String(c.title ?? l.key), version: depot.entierVersVersion(l.version), statut: l.status, creeLe: l.createdAt as Date, auteur: l.createdBy ? auteurs.get(l.createdBy) ?? null : null }];
  });
  // Versions en production · clés « type:clé@version » de la release active.
  const enProduction = new Map<string, string>();
  for (const k of active?.versionIds.keys() ?? []) { const [tc, v] = k.split('@'); if (tc && v) enProduction.set(tc, v); }
  const biblio = bibliothequePrompts(versions, enProduction, new Map(runs.map((r) => [r.cle, Number(r.n)])));
  const brouillons = versions.filter((v) => v.statut === 'draft').length;

  return (
    <Prompts
      bandeau={b}
      kpis={[
        { lbl: 'Recettes de style', v: adminNombre(biblio.styles.length) },
        { lbl: 'Exécutions · 30 j', v: adminNombre(Number(total30[0]?.n ?? 0)) },
        { lbl: 'Release active', v: active ? `${adminNombre(active.versionIds.size)} entrées` : 'Aucune' },
        { lbl: 'Brouillons', v: adminNombre(brouillons), d: brouillons ? 'à valider avant release' : 'aucun en attente', c: brouillons ? 'w' : '' },
      ]}
      familles={FAMILLES.map((f) => ({
        cle: f.cle, libelle: f.libelle, colonne: f.colonne,
        entrees: biblio[f.cle].map((e) => ({
          id: `${e.type}:${e.cle}`, titre: e.titre, version: `v${e.derniere}`,
          utilisations: e.utilisations == null ? VALEUR_ABSENTE : adminNombre(e.utilisations),
          production: e.enProduction
            ? { part: 100, texte: e.enProduction === e.derniere ? `v${e.enProduction}` : `v${e.enProduction} · v${e.derniere} ${(LIBELLE_STATUT_VERSION[e.statut] ?? e.statut).toLowerCase()}`, absente: false }
            : { part: 0, texte: 'Pas en production', absente: true },
          maj: `${adminIlYa(e.majLe, maintenant)}${e.auteur ? ` · ${e.auteur}` : ''}`,
          editer: editeur(e),
        })),
      }))}
    />
  );
}
