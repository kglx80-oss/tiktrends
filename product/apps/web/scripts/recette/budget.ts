/**
 * Recette Studios · E2 · `recette:budget` · LECTURE SEULE du budget d'essai.
 *
 *   pnpm --filter @tiktrends/web recette:budget
 *
 * Affiche autorisé / antérieur / réglé / incertain / restant, d'après le
 * registre cumulatif (`registre.ts`) ET l'état courant de la base de recette,
 * fusionnés EN MÉMOIRE. N'écrit RIEN : ni le registre, ni le journal, ni la
 * base (garde : `test/e2-registre-budget.test.ts`, contenu des fichiers
 * avant et après). Code 0 lisible, 2 incohérence ou registre illisible.
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { masquerSecrets, verifierCibleRecette, type Env } from './regles';
import { lireEtatEssai, resoudreDossier, texteBilan } from './registre';

export async function lireBudget(env: Env, maintenant: Date = new Date()): Promise<{ code: 0 | 2; texte: string }> {
  const cible = verifierCibleRecette(env);
  if (!cible.ok) return { code: 2, texte: `Lecture refusée · ${cible.raisons.join(' ; ')}` };
  const dossier = resoudreDossier(env);
  const e = await lireEtatEssai(dossier, maintenant);
  if (!e.ok) return { code: 2, texte: e.raison };
  const { registre, changees } = e;
  const entete = e.initialiser
    ? 'Registre absent et base sans dépense · premier essai : il sera créé par la première commande payante.'
    : `Registre · ${dossier}${changees.length ? ` · ${changees.length} ligne(s) de la base pas encore reportée(s) (elles le seront à la prochaine commande payante), comptée(s) ci-dessous` : ''}`;
  return { code: 0, texte: `${entete}\n${texteBilan(registre, e.bilan)}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  lireBudget(process.env).then((r) => {
    (r.code === 0 ? console.log : console.error)(masquerSecrets(r.texte, process.env));
    process.exit(r.code);
  }, (e) => { console.error('✗', masquerSecrets((e as Error).message, process.env)); process.exit(1); });
}
