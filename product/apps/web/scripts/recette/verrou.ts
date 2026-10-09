/**
 * Recette Studios · E3 · VERROU INTERPROCESSUS du registre du budget d'essai.
 *
 * Le défaut réparé (contre-recette Codex) : lecture, décision et écriture du
 * registre étaient trois temps séparés. Le `rename` atomique protège un
 * fichier, pas une opération composée : deux commandes (ou deux bases
 * distinctes montant le même registre) lisaient le même restant, décidaient
 * chacune « ça tient », et écrivaient l'une par-dessus l'autre. 14 $ comptés
 * + deux commandes de 0,80 $ ⇒ 15,60 $.
 *
 * Désormais toute opération composée (lire → décider → écrire l'engagement,
 * lire → régler, lire → saisir) se fait sous CE verrou.
 *
 * ── Le mécanisme · aucune dépendance ajoutée ────────────────────────────────
 *
 *  · fichier `budget-essais.lock` créé en `O_EXCL` (`wx`) : un seul processus
 *    le crée ; il y écrit son jeton, son PID, son hôte et l'heure ;
 *  · verrou PÉRIMÉ repris seulement si : même hôte et même démarrage et le PID
 *    n'existe plus ; ou même hôte mais machine redémarrée ; ou plus vieux que
 *    `VERROU_PERIME_MS` (un processus d'un autre conteneur, dont on ne peut
 *    pas sonder le PID : chaque `docker compose run` a son espace de PID) ;
 *  · la reprise d'un verrou périmé est elle-même EXCLUSIVE : un marqueur
 *    `budget-essais.lock.reprise-<identité du verrou périmé>` créé en
 *    `O_EXCL` ; seul son créateur supprime le verrou, et seulement s'il porte
 *    TOUJOURS cette identité (inode et date) ;
 *  · avant d'écrire, le détenteur CONFIRME qu'il tient encore le verrou
 *    (`confirmer`) : un détenteur figé plus de `VERROU_PERIME_MS` puis repris
 *    n'écrit rien (« verrou perdu »), et sa commande ne dépense rien ;
 *  · au-delà de l'attente maximale, refus nommé : rien ne part.
 *
 * ── Seuil MESURÉ ───────────────────────────────────────────────────────────
 *
 * Durée de détention mesurée (test `e3-registre-verrou.test.ts`, 8 processus
 * concurrents, registre local) : lecture + décision + écriture `fsync` +
 * journal, de l'ordre de la milliseconde à quelques dizaines de
 * millisecondes sous charge (le test l'affiche et vérifie < 2 s). La base
 * est lue AVANT de prendre le verrou, jamais dessous. `VERROU_PERIME_MS` =
 * 30 s : plus de mille fois la détention mesurée, et assez court pour qu'un
 * conteneur tué ne bloque pas le propriétaire longtemps.
 */

import { randomUUID } from 'node:crypto';
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

export const FICHIER_VERROU = 'budget-essais.lock';
/** Au-delà, un verrou est réputé abandonné (voir le tableau mesuré ci-dessus). */
export const VERROU_PERIME_MS = 30_000;
/** Attente maximale pour obtenir le verrou avant un refus nommé. */
export const ATTENTE_VERROU_MS = 45_000;

interface ContenuVerrou { jeton: string; pid: number; hote: string; demarrage: string; le: string }

let demarrageMemo: string | null = null;
/** Identifiant du démarrage de la machine · change à chaque redémarrage (les PID repartent de zéro). */
function demarrage(): string {
  if (demarrageMemo !== null) return demarrageMemo;
  try { demarrageMemo = readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim(); } catch { demarrageMemo = 'inconnu'; }
  return demarrageMemo;
}

function pidVivant(pid: number): boolean {
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
      ? { jeton: o.jeton, pid: o.pid, hote: o.hote, demarrage: typeof o.demarrage === 'string' ? o.demarrage : '', le: o.le }
      : null;
  } catch { return null; }
}

/** Pur · ce verrou est-il abandonné ? (contenu illisible : en cours d'écriture, jugé sur son âge seul). */
export function verrouPerime(c: ContenuVerrou | null, mtimeMs: number, ici: { hote: string; demarrage: string }, maintenantMs: number): boolean {
  const ne = c ? Date.parse(c.le) : mtimeMs;
  const age = maintenantMs - (Number.isFinite(ne) ? Math.min(ne, mtimeMs) : mtimeMs);
  if (age > VERROU_PERIME_MS) return true;
  if (!c) return false;
  if (c.hote !== ici.hote) return false;
  if (c.demarrage && ici.demarrage !== 'inconnu' && c.demarrage !== ici.demarrage) return true;
  return !pidVivant(c.pid);
}

export interface Verrou {
  jeton: string;
  /** Lève si le verrou n'est plus à nous · à appeler juste avant toute écriture. */
  confirmer(): void;
  relacher(): void;
}

export class VerrouIndisponible extends Error {}

/** Durées de détention de ce processus (ms, 100 dernières) · le seuil `VERROU_PERIME_MS` se mesure, il ne se pose pas. */
export const detentionsVerrouMs: number[] = [];

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/** Prend le verrou du dossier · attend tant qu'il est tenu par un processus vivant. */
export async function prendreVerrou(dossier: string, o: { attenteMaxMs?: number } = {}): Promise<Verrou> {
  mkdirSync(dossier, { recursive: true });
  const chemin = join(dossier, FICHIER_VERROU);
  const ici = { hote: hostname(), demarrage: demarrage() };
  const jeton = randomUUID();
  const fin = Date.now() + (o.attenteMaxMs ?? ATTENTE_VERROU_MS);
  let tour = 0;
  for (;;) {
    let fd: number | null = null;
    try { fd = openSync(chemin, 'wx', 0o600); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
    if (fd !== null) {
      try {
        writeSync(fd, JSON.stringify({ jeton, pid: process.pid, hote: ici.hote, demarrage: ici.demarrage, le: new Date().toISOString() } satisfies ContenuVerrou));
        fsyncSync(fd);
      } finally { closeSync(fd); }
      const acquis = performance.now();
      const confirmer = () => {
        const c = lireContenu(chemin);
        if (!c || c.jeton !== jeton) throw new VerrouIndisponible(`Verrou du registre perdu (${chemin} repris par un autre processus après ${VERROU_PERIME_MS / 1000} s) · rien n’est écrit, aucune dépense ne part. Relance la commande.`);
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
    // Tenu par quelqu'un · périmé ? Reprise EXCLUSIVE, puis on retente la création.
    const id = identite(chemin);
    if (id) {
      const c = lireContenu(chemin);
      if (verrouPerime(c, id.mtimeMs, ici, Date.now())) {
        const marque = `${chemin}.reprise-${id.cle}`;
        let fm: number | null = null;
        try { fm = openSync(marque, 'wx', 0o600); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; }
        if (fm !== null) {
          closeSync(fm);
          try { if (identite(chemin)?.cle === id.cle) unlinkSync(chemin); } catch { /* déjà parti */ }
          try { unlinkSync(marque); } catch { /* déjà parti */ }
          continue;
        }
        const im = identite(marque);
        if (im && Date.now() - im.mtimeMs > VERROU_PERIME_MS) {
          throw new VerrouIndisponible(`Registre bloqué · reprise d’un verrou abandonné interrompue (${marque}). Vérifie qu’aucune commande de recette ne tourne, puis retire ce marqueur et ${FICHIER_VERROU} du dossier du registre (pas le registre lui-même). Rien n’est lancé.`);
        }
      }
    }
    if (Date.now() >= fin) {
      const c = lireContenu(chemin);
      throw new VerrouIndisponible(`Registre du budget d’essai verrouillé${c ? ` par le processus ${c.pid} (${c.hote}) depuis ${c.le}` : ''} · une autre commande payante le tient. Rien n’est lancé ; relance quand elle a fini.`);
    }
    tour += 1;
    await dormir(Math.min(50, 2 + tour) + Math.floor(Math.random() * 5));
  }
}

/** Exécute `f` sous le verrou du dossier, le relâche toujours. */
export async function sousVerrou<T>(dossier: string, f: (v: Verrou) => Promise<T> | T, o: { attenteMaxMs?: number } = {}): Promise<T> {
  const v = await prendreVerrou(dossier, o);
  try { return await f(v); } finally { v.relacher(); }
}
