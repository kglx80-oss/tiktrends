/**
 * Recette Studios · E4 · `recette:budget:deverrouiller` · retirer le verrou du
 * registre quand la mort de son détenteur n'a PAS pu être établie.
 *
 *   pnpm --filter @tiktrends/web recette:budget:deverrouiller
 *   pnpm --filter @tiktrends/web recette:budget:deverrouiller -- --confirmer-arret <jeton du verrou>
 *
 * Le verrou n'est jamais repris sur son âge (`verrou.ts`) : un détenteur figé
 * peut encore reprendre et publier. Un verrou laissé par une commande d'un
 * autre conteneur (`docker compose run`, PID insondable d'ici) se retire donc
 * À LA MAIN, après avoir vérifié qu'aucune commande de recette ne tourne :
 *
 *  · détenteur VIVANT sondé ici (même conteneur) ⇒ refus, jamais retiré ;
 *  · d'autres commandes de recette encore connectées à la base (le service
 *    d'outils partage le réseau de la base : ses connexions viennent de
 *    127.0.0.1, celles du site et du worker non) ⇒ refus ;
 *  · sans `--confirmer-arret` ⇒ on dit QUI tient le verrou, COMMENT vérifier
 *    sur la machine qu'aucune commande ne tourne, et le jeton à recopier ;
 *  · jeton différent du verrou ACTUEL ⇒ refus ;
 *  · sinon ⇒ retrait (seulement si le fichier n'a pas changé depuis la
 *    lecture), noté au journal du registre. Le registre lui-même n'est
 *    jamais touché.
 *
 * Décision pure : `decisionDeverrouillage` (noyau). Garde :
 * `test/e4-verrou-suspendu.test.ts`. Codes : 0 retiré ou aucun verrou, 2 refus.
 */

import { readdirSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decisionDeverrouillage } from '@tiktrends/core';
import { masquerSecrets, verifierCibleRecette, type Env } from './regles';
import { journaliser, resoudreDossier } from './registre';
import { COMMANDE_DEVERROUILLER, FICHIER_VERROU, identiteIci, jetonDuVerrou, lireVerrou, retirerVerrouInchange } from './verrou';

const VERIFIER_SUR_LA_MACHINE = 'docker ps --filter label=com.docker.compose.project=tiktrends-recette --filter label=com.docker.compose.service=outils_recette --format "{{.Names}} {{.Status}} {{.Command}}"';

export function lireOptionsDeverrouillage(argv: readonly string[]): { ok: true; confirmation: string | null } | { ok: false; raison: string } {
  let confirmation: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '--confirmer-arret') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { ok: false, raison: 'Valeur attendue après --confirmer-arret (le jeton du verrou affiché par la commande).' };
      i++;
      confirmation = v.trim();
      continue;
    }
    return { ok: false, raison: `Option inconnue « ${a} ».` };
  }
  return { ok: true, confirmation };
}

/**
 * Commandes de recette ENCORE connectées à la base · le service d'outils
 * partage l'espace réseau de la base (`network_mode: service:db_recette`) :
 * ses connexions arrivent de 127.0.0.1. `null` si la base ne répond pas
 * (vérification impossible, dite comme telle).
 */
export async function autresCommandesRecette(): Promise<number | null> {
  try {
    const { db, sql } = await import('@tiktrends/db');
    if (!db) return null;
    const r = await db.execute(sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend' and client_addr = '127.0.0.1'::inet`);
    const x = ((Array.isArray(r) ? r : (r as { rows: unknown[] }).rows) as Array<{ n: number }>)[0];
    return x ? Number(x.n) : null;
  } catch { return null; }
}

export async function deverrouiller(env: Env, argv: readonly string[], o: {
  dossier?: string;
  autresCommandes?: () => Promise<number | null>;
  sonde?: (pid: number) => boolean;
  maintenant?: Date;
  /** Identité locale (injectée par les gardes ; défaut : `identiteIci()`, lue dans /proc). */
  ici?: { hote: string; demarrage: string; pidns: string };
} = {}): Promise<{ code: 0 | 2; texte: string }> {
  const cible = verifierCibleRecette(env);
  if (!cible.ok) return { code: 2, texte: `Déverrouillage refusé · ${cible.raisons.join(' ; ')}` };
  const opt = lireOptionsDeverrouillage(argv);
  if (!opt.ok) return { code: 2, texte: opt.raison };
  const dossier = o.dossier ?? resoudreDossier(env);
  const e = o.sonde ? lireVerrou(dossier, o.sonde) : lireVerrou(dossier);
  if (!e.present) return { code: 0, texte: `Aucun verrou (${join(dossier, FICHIER_VERROU)}) · rien à retirer.` };
  const jeton = jetonDuVerrou(e);
  const c = e.contenu;
  const qui = c
    ? `processus ${c.pid} · hôte ${c.hote} · espace de PID ${c.pidns || 'non noté (ancien format)'} · pris le ${c.le}`
    : 'contenu illisible (verrou d’un ancien format, ou écrit à moitié)';
  const autres = await (o.autresCommandes ?? autresCommandesRecette)();
  const ici = o.ici ?? identiteIci();
  const lisible = (x: string) => x !== '' && x !== 'inconnu';
  const d = decisionDeverrouillage({ reprise: e.reprise, autresCommandes: autres, confirmation: opt.confirmation, jeton, plateformeSondable: lisible(ici.demarrage) && lisible(ici.pidns) });
  const entete = `Verrou du registre · ${e.chemin}\n  tenu par : ${qui}`;
  if (!d.retirer) {
    switch (d.motif) {
      case 'plateforme_non_prise_en_charge':
        return { code: 2, texte: `${entete}\nREFUS · plateforme non prise en charge pour ce geste : l’identité du démarrage et de l’espace de PID est illisible ici (hors Linux, par exemple macOS en natif), un détenteur VIVANT ne peut donc pas être distingué d’un mort. Lance cette commande DANS le conteneur outils de recette (Linux), après avoir vérifié sur la machine qu’aucune commande de recette ne tourne :\n  ${VERIFIER_SUR_LA_MACHINE}\nRien n’a été retiré.` };
      case 'vivant':
        return { code: 2, texte: `${entete}\nREFUS · son détenteur est VIVANT (sondé dans ce conteneur) · une commande de recette tourne. Attends sa fin ; le verrou n’est jamais retiré à un processus vivant.` };
      case 'autres_commandes':
        return { code: 2, texte: `${entete}\nREFUS · ${autres} autre(s) commande(s) de recette encore connectée(s) à la base de recette · une commande tourne peut-être (même figée). Attends sa fin ou arrête-la, puis relance.` };
      case 'confirmation_absente':
        return { code: 2, texte: [
          entete,
          `  sa fin ne peut pas être établie d’ici (${e.reprise.reprendre ? 'détenteur mort, il sera repris seul à la prochaine commande' : e.reprise.motif === 'illisible' ? 'verrou illisible' : 'autre conteneur ou autre machine'}) · le verrou n’est JAMAIS repris sur son âge.`,
          `  connexions d’autres commandes de recette à la base : ${autres === null ? 'NON VÉRIFIÉ (base injoignable)' : autres}`,
          'Avant de retirer, vérifie SUR LA MACHINE qu’aucune commande de recette ne tourne (aucune ligne hormis cette commande-ci) :',
          `  ${VERIFIER_SUR_LA_MACHINE}`,
          'Puis, et seulement alors :',
          `  pnpm --filter @tiktrends/web ${COMMANDE_DEVERROUILLER} -- --confirmer-arret ${jeton}`,
          'Rien n’a été retiré.',
        ].join('\n') };
      case 'confirmation_autre':
        return { code: 2, texte: `${entete}\nREFUS · la confirmation ne correspond pas au verrou ACTUEL (jeton ${jeton}) · il a peut-être changé depuis ta vérification. Relance sans --confirmer-arret pour revoir qui le tient.` };
    }
  }
  if (!retirerVerrouInchange(e.chemin, e.cle)) {
    return { code: 2, texte: `${entete}\nREFUS · le verrou a changé pendant la commande · rien n’a été retiré. Relance sans --confirmer-arret.` };
  }
  // Les marqueurs d'une reprise interrompue n'ont plus d'objet (le registre, lui, n'est jamais touché).
  for (const f of readdirSync(dossier)) {
    if (f.startsWith(`${FICHIER_VERROU}.reprise-`)) { try { unlinkSync(join(dossier, f)); } catch { /* déjà parti */ } }
  }
  journaliser(dossier, { le: (o.maintenant ?? new Date()).toISOString(), type: 'deverrouillage', jeton, detenteur: c, autresCommandes: autres });
  return { code: 0, texte: `${entete}\nVerrou retiré après confirmation de l’arrêt des commandes · noté au journal. Le registre n’a pas été touché ; lance recette:budget pour relire le bilan.` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deverrouiller(process.env, process.argv.slice(2)).then((r) => {
    (r.code === 0 ? console.log : console.error)(masquerSecrets(r.texte, process.env));
    process.exit(r.code);
  }, (e) => { console.error('✗', masquerSecrets((e as Error).message, process.env)); process.exit(1); });
}
