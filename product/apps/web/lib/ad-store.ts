import { storageFromEnv, putObject, publicUrlFor } from '@tiktrends/integrations';

/**
 * Là où vit une pub une fois composée.
 *
 * ── Le cache mémoire ne suffisait pas ────────────────────────────────────────
 *
 * Les PNG composés vivaient dans une `Map` du processus. Ça marche, tant que le
 * processus vit · c'est-à-dire jusqu'au prochain déploiement. Après chaque mise
 * en ligne, la première personne à ouvrir le studio repayait la composition de
 * toutes ses pubs, une par une, devant un écran vide.
 *
 * Un rendu qui a été payé une fois ne devrait jamais être repayé : la recette
 * n'a pas changé, l'image serait identique au pixel près.
 *
 * ── Plus aucune écriture dans la génération (#125, chantier L0) ──────────────
 *
 * L'adresse du PNG était notée dans `generations.output.renders` · ouvrir le
 * Studio modifiait donc la ligne métier de chaque pub affichée, et `?r=` libre
 * la faisait grossir sans fin. Consulter ne doit rien écrire (BASE-03).
 *
 * L'adresse n'a pas besoin d'être notée · elle se DÉDUIT. La clé d'objet est
 * dérivée de la clé de cache (version de la maquette, id, ratio, vignette,
 * empreinte de la recette), donc la même demande tombe toujours sur le même
 * objet. Savoir s'il existe se demande au bucket (`HEAD`), pas à la base.
 *
 * ── Pourquoi le PUT dans le bucket reste toléré à la consultation ────────────
 *
 * L'objet est un cache TECHNIQUE · dérivé, déterministe, versionné par
 * `RENDER_VERSION`, régénérable à l'identique, sans aucun effet sur les données
 * métier ni sur ce qui est facturé. Sa clé est bornée (`lireDemandeRendu`
 * refuse tout ratio ou drapeau inconnu) · au plus quatre variantes par recette
 * et par version de maquette. Le supprimer referait payer la composition à
 * chaque redéploiement, ce que ce module existe pour éviter.
 *
 * L'index historique `output.renders` est encore LU (`renduConnu`) · les rendus
 * rangés avant ce changement restent servis, rien n'est perdu. Il n'est plus
 * jamais écrit.
 *
 * Tout échoue en silence · un cache qui tombe doit se contenter de ne pas
 * accélérer, jamais empêcher l'affichage.
 */

/** Ce que `generations.output` contient pour une pub · rien d'autre. */
interface SortieRendus { renders?: Record<string, string> }

/** L'adresse publique déjà notée pour cette variante (index historique, lecture seule). */
export function renduConnu(output: unknown, cle: string): string | null {
  const o = (output ?? {}) as SortieRendus;
  const u = o.renders?.[cle];
  return typeof u === 'string' && /^https?:\/\//.test(u) ? u : null;
}

/**
 * La clé d'objet d'un rendu · une fonction de la clé de cache, rien d'autre.
 *
 * C'est la même que celle des rendus déjà rangés · les objets écrits avant ce
 * changement sont donc retrouvés par `HEAD` sans être recomposés. `cle` vient
 * de nous (version, id, ratio borné, drapeau, empreinte) · on la nettoie quand
 * même, une clé d'objet ne doit pas pouvoir sortir de son préfixe.
 */
export function cleObjetRendu(generationId: string, cle: string): string {
  return `renders/${generationId}/${cle.replace(/[^a-zA-Z0-9:_-]/g, '-')}.png`;
}

/**
 * Les objets dont on a déjà constaté la présence · évite un `HEAD` par vignette
 * à chaque ouverture de la grille. Mémoire du processus, bornée, perdue au
 * redéploiement · le bucket reste la référence.
 */
const PRESENTS = new Map<string, string>();
const PRESENTS_MAX = 5_000;
function noterPresent(objet: string, url: string): void {
  PRESENTS.delete(objet);
  PRESENTS.set(objet, url);
  while (PRESENTS.size > PRESENTS_MAX) {
    const ancien = PRESENTS.keys().next();
    if (ancien.done) break;
    PRESENTS.delete(ancien.value);
  }
}

/**
 * L'adresse publique du rendu s'il est déjà dans le bucket, sinon `null`.
 *
 * Un `HEAD` sur l'adresse publique (les objets sont en lecture publique) ·
 * court, et sans rien écrire nulle part. Bucket absent, lent ou en panne ·
 * `null`, et la pub se compose comme avant.
 */
export async function renduDansLeBucket(generationId: string, cle: string, delaiMs = 1_500): Promise<string | null> {
  const cfg = storageFromEnv();
  if (!cfg) return null;
  const objet = cleObjetRendu(generationId, cle);
  const deja = PRESENTS.get(objet);
  if (deja) return deja;
  const url = publicUrlFor(cfg, objet);
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(delaiMs) });
    if (!r.ok) return null;
    noterPresent(objet, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Range le PNG dans le bucket, sous sa clé déterministe · aucune écriture SQL.
 *
 * L'envoi ne retient pas la réponse (l'appelant ne l'attend pas) : l'image est
 * déjà rendue, la faire attendre un aller-retour S3 rendrait le premier
 * affichage plus lent pour accélérer les suivants.
 */
export async function rangerRendu(generationId: string, cle: string, png: ArrayBuffer): Promise<string | null> {
  const cfg = storageFromEnv();
  if (!cfg) return null;
  const objet = cleObjetRendu(generationId, cle);
  try {
    const url = await putObject(cfg, objet, Buffer.from(png), 'image/png');
    noterPresent(objet, url);
    return url;
  } catch {
    // Bucket absent, mal configuré, ou coupure · on garde le cache mémoire.
    return null;
  }
}

/** Vide la mémoire des objets constatés · réservé aux tests. */
export function _oublierPresents(): void { PRESENTS.clear(); }
