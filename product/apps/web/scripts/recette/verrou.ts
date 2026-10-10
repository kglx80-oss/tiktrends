/**
 * Recette Studios · E3/E4 · VERROU INTERPROCESSUS du registre du budget d'essai.
 *
 * Le défaut réparé par E3 (contre-recette Codex) : lecture, décision et
 * écriture du registre étaient trois temps séparés. Le `rename` atomique
 * protège un fichier, pas une opération composée : deux commandes (ou deux
 * bases distinctes montant le même registre) lisaient le même restant,
 * décidaient chacune « ça tient », et écrivaient l'une par-dessus l'autre.
 * Désormais toute opération composée (lire → décider → écrire l'engagement,
 * lire → régler, lire → saisir) se fait sous CE verrou.
 *
 * Le défaut réparé par E4 (contre-recette Codex sur 150c17c) : un verrou de
 * plus de 30 s était repris sur son SEUL ÂGE. A, suspendu après sa
 * confirmation, gardait le droit de publier ; B reprenait le verrou et
 * écrivait son engagement ; A reprenait et publiait un registre qui ne le
 * contenait pas. Un âge ne prouve pas une mort.
 *
 * ── Le mécanisme · aucune dépendance ajoutée ────────────────────────────────
 *
 *  · le verrou `budget-essais.lock` est PUBLIÉ complet d'un coup : contenu
 *    écrit dans un fichier propre au jeton, `fsync`, puis `link` vers le nom
 *    du verrou (échoue si un verrou existe : un seul processus le crée, et
 *    personne ne lit jamais un verrou à moitié écrit). Il porte le jeton, le
 *    PID, l'hôte, le démarrage de la machine, l'espace de PID et l'heure ;
 *  · un verrou n'est repris AUTOMATIQUEMENT que si la mort de son détenteur
 *    est ÉTABLIE (`decisionRepriseVerrou`, noyau) : même hôte, même
 *    démarrage, même espace de PID, et PID absent. Deux `docker compose run`
 *    du service d'outils partagent l'hôte (réseau de la base) et le
 *    démarrage, pas l'espace de PID : le PID d'un autre conteneur n'est pas
 *    sondable, son verrou n'est jamais repris d'ici ;
 *  · JAMAIS sur l'âge. Mort non établie ⇒ attente, puis refus nommé qui
 *    renvoie à `recette:budget:deverrouiller` (retrait après arrêt vérifié des
 *    commandes, `deverrouiller.ts`) ;
 *  · la reprise d'un verrou dont le détenteur est mort est EXCLUSIVE : un
 *    marqueur `budget-essais.lock.reprise-<identité>` créé en `O_EXCL` ; seul
 *    son créateur supprime le verrou, et seulement s'il porte TOUJOURS cette
 *    identité (inode et date) ;
 *  · avant d'écrire, le détenteur CONFIRME qu'il tient encore le verrou
 *    (`confirmer`) : un verrou retiré à la main pendant qu'il tournait ⇒ il
 *    n'écrit rien (« verrou perdu »).
 *
 * Garde : `test/e4-verrou-suspendu.test.ts` (A suspendu après sa
 * confirmation puis juste avant la publication, horloge avancée bien au-delà
 * de 30 s, B lancé et terminé, A repris : aucun engagement accepté ne
 * disparaît).
 */

import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, linkSync, mkdirSync, openSync, readFileSync, readlinkSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { decisionRepriseVerrou, type DecisionRepriseVerrou, type DetenteurVerrou } from '@tiktrends/core';

export const FICHIER_VERROU = 'budget-essais.lock';
/** Attente maximale pour obtenir le verrou avant un refus nommé. */
export const ATTENTE_VERROU_MS = 45_000;
/**
 * Un marqueur de reprise plus vieux que ceci signale une reprise interrompue ·
 * il ne déclenche jamais une reprise, seulement un refus qui dit quoi faire.
 */
export const MARQUEUR_BLOQUE_MS = 30_000;
export const COMMANDE_DEVERROUILLER = 'recette:budget:deverrouiller';

export interface ContenuVerrou extends DetenteurVerrou { jeton: string; le: string }

let iciMemo: { hote: string; demarrage: string; pidns: string } | null = null;
/** Hôte, démarrage de la machine (change à chaque redémarrage) et espace de PID de CE processus. */
export function identiteIci(): { hote: string; demarrage: string; pidns: string } {
  if (iciMemo) return iciMemo;
  let demarrage = 'inconnu';
  let pidns = 'inconnu';
  try { demarrage = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim() || 'inconnu'; } catch { /* hors Linux */ }
  try { pidns = readlinkSync('/proc/self/ns/pid') || 'inconnu'; } catch { /* hors Linux */ }
  iciMemo = { hote: hostname(), demarrage, pidns };
  return iciMemo;
}

export function pidVivant(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

function identite(chemin: string): { cle: string; mtimeMs: number } | null {
  try {
    const s = statSync(chemin, { bigint: true });
    return { cle: `${s.ino}-${s.mtimeNs}`, mtimeMs: Number(s.mtimeMs) };
  } catch { return null; }
}

function lireContenu(chemin: string): ContenuVerrou | null {
  try {
    const o = JSON.parse(readFileSync(chemin, 'utf8')) as Partial<ContenuVerrou>;
    return typeof o.jeton === 'string' && typeof o.pid === 'number' && typeof o.hote === 'string' && typeof o.le === 'string'
      ? { jeton: o.jeton, pid: o.pid, hote: o.hote, demarrage: typeof o.demarrage === 'string' ? o.demarrage : '', pidns: typeof o.pidns === 'string' ? o.pidns : '', le: o.le }
      : null;
  } catch { return null; }
}

/** L'état du verrou d'un dossier · lecture seule. */
export type EtatVerrou =
  | { present: false; chemin: string }
  | { present: true; chemin: string; contenu: ContenuVerrou | null; cle: string; mtimeMs: number; reprise: DecisionRepriseVerrou };

export function lireVerrou(dossier: string, sonde: (pid: number) => boolean = pidVivant): EtatVerrou {
  const chemin = join(dossier, FICHIER_VERROU);
  const id = identite(chemin);
  if (!id) return { present: false, chemin };
  const contenu = lireContenu(chemin);
  const reprise = decisionRepriseVerrou({ detenteur: contenu, ici: identiteIci(), pidVivant: contenu ? sonde(contenu.pid) : true });
  return { present: true, chemin, contenu, cle: id.cle, mtimeMs: id.mtimeMs, reprise };
}

/** Le jeton qu'exige la confirmation du retrait · celui du verrou, ou son identité s'il est illisible. */
export const jetonDuVerrou = (e: Extract<EtatVerrou, { present: true }>) => e.contenu?.jeton ?? e.cle;

/** Retire le verrou SEULEMENT s'il est toujours celui qu'on a vu (même identité de fichier). */
export function retirerVerrouInchange(chemin: string, cle: string): boolean {
  if (identite(chemin)?.cle !== cle) return false;
  try { unlinkSync(chemin); return true; } catch { return false; }
}

export interface Verrou {
  jeton: string;
  /** Lève si le verrou n'est plus à nous · à appeler juste avant toute écriture. */
  confirmer(): void;
  relacher(): void;
}

export class VerrouIndisponible extends Error {}

/** Durées de détention de ce processus (ms, 100 dernières) · mesurées, affichées par le test multiprocessus. */
export const detentionsVerrouMs: number[] = [];

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

const descriptionDetenteur = (c: ContenuVerrou | null, maintenantMs: number) => {
  if (!c) return '';
  const ne = Date.parse(c.le);
  const age = Number.isFinite(ne) ? Math.max(0, Math.round((maintenantMs - ne) / 1000)) : null;
  return ` par le processus ${c.pid} (${c.hote}) depuis ${c.le}${age !== null ? ` (${age} s)` : ''}`;
};

/** Publie le verrou d'un coup (contenu complet) · `false` s'il existe déjà. */
function publierVerrou(chemin: string, c: ContenuVerrou): boolean {
  const tmp = `${chemin}.cree-${c.jeton}`;
  const fd = openSync(tmp, 'wx', 0o600);
  try { writeSync(fd, JSON.stringify(c)); fsyncSync(fd); } finally { closeSync(fd); }
  try { linkSync(tmp, chemin); return true; } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; return false; } finally { try { unlinkSync(tmp); } catch { /* déjà parti */ } }
}

/**
 * Prend le verrou du dossier · attend tant qu'il est tenu et que la mort de
 * son détenteur n'est pas établie. `maintenantMs` · horloge des messages
 * (injectée par les gardes) ; elle ne décide JAMAIS d'une reprise.
 */
export async function prendreVerrou(dossier: string, o: { attenteMaxMs?: number; maintenantMs?: () => number } = {}): Promise<Verrou> {
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, FICHIER_VERROU);
  const ici = identiteIci();
  const jeton = randomUUID();
  const maintenant = o.maintenantMs ?? (() => Date.now());
  const fin = Date.now() + (o.attenteMaxMs ?? ATTENTE_VERROU_MS);
  let tour = 0;
  for (;;) {
    if (publierVerrou(chemin, { jeton, pid: process.pid, hote: ici.hote, demarrage: ici.demarrage, pidns: ici.pidns, le: new Date().toISOString() })) {
      const acquis = performance.now();
      const confirmer = () => {
        const c = lireContenu(chemin);
        if (!c || c.jeton !== jeton) throw new VerrouIndisponible(`Verrou du registre perdu (${chemin} retiré ou repris pendant la commande) · rien n’est écrit, aucune dépense ne part. Relance la commande.`);
      };
      return {
        jeton, confirmer,
        relacher: () => {
          detentionsVerrouMs.push(performance.now() - acquis);
          if (detentionsVerrouMs.length > 100) detentionsVerrouMs.shift();
          const c = lireContenu(chemin);
          if (c && c.jeton === jeton) { try { unlinkSync(chemin); } catch { /* déjà parti */ } }
        },
      };
    }
    // Tenu par quelqu'un · repris SEULEMENT si sa mort est établie (jamais sur l'âge).
    const e = lireVerrou(dossier);
    if (e.present && e.reprise.reprendre) {
      const marque = `${chemin}.reprise-${e.cle}`;
      let fm: number | null = null;
      try { fm = openSync(marque, 'wx', 0o600); } catch (x) { if ((x as NodeJS.ErrnoException).code !== 'EEXIST') throw x; }
      if (fm !== null) {
        closeSync(fm);
        retirerVerrouInchange(chemin, e.cle);
        try { unlinkSync(marque); } catch { /* déjà parti */ }
        continue;
      }
      const im = identite(marque);
      if (im && Date.now() - im.mtimeMs > MARQUEUR_BLOQUE_MS) {
        throw new VerrouIndisponible(`Registre bloqué · reprise d’un verrou abandonné interrompue (${marque}). Vérifie qu’aucune commande de recette ne tourne, puis lance ${COMMANDE_DEVERROUILLER} (le registre lui-même n’est jamais touché). Rien n’est lancé.`);
      }
    }
    if (Date.now() >= fin) {
      const c = e.present ? e.contenu : null;
      const motif = e.present && !e.reprise.reprendre ? e.reprise.motif : null;
      throw new VerrouIndisponible(`Registre du budget d’essai verrouillé${descriptionDetenteur(c, maintenant())} · une autre commande payante le tient. Rien n’est lancé ; relance quand elle a fini.${motif === 'insondable' || motif === 'illisible'
        ? ` Sa fin ne peut pas être établie d’ici (${motif === 'illisible' ? 'verrou illisible' : 'autre conteneur ou autre machine'}) : il n’est jamais repris sur son âge. Si AUCUNE commande de recette ne tourne plus, lance ${COMMANDE_DEVERROUILLER}.`
        : ''}`);
    }
    tour += 1;
    await dormir(Math.min(50, 2 + tour) + Math.floor(Math.random() * 5));
  }
}

/** Exécute `f` sous le verrou du dossier, le relâche toujours. */
export async function sousVerrou<T>(dossier: string, f: (v: Verrou) => Promise<T> | T, o: { attenteMaxMs?: number; maintenantMs?: () => number } = {}): Promise<T> {
  const v = await prendreVerrou(dossier, o);
  try { return await f(v); } finally { v.relacher(); }
}
