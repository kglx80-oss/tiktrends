/**
 * Relecture du DÉBUT d'un objet déposé dans le bucket · taille (`HEAD`) et
 * premiers octets (`GET` + `Range`), par des liens SIGNÉS vers l'hôte du
 * stockage configuré · sert à `registerUploadedAssetAction`, qui juge ensuite
 * le type relu (`decisionDepotRelu`, noyau).
 *
 * Sûreté :
 *  - l'adresse fournie par le client n'est JAMAIS requêtée : elle doit
 *    désigner un objet de l'espace (`cleObjetDeLEspace`, préfixe
 *    `assets/<espace>/` sous la base publique), dont on ne garde que la CLÉ ;
 *    la requête part vers `cfg.endpoint`, hôte fixé par le serveur. Hors
 *    espace ⇒ `hors_espace`, aucune requête envoyée ;
 *  - redirections refusées (`redirect: 'manual'`, tout 3xx ⇒ `illisible`) ;
 *  - lecture BORNÉE à `n` octets même si le serveur ignore `Range` et renvoie
 *    tout le fichier (200) : le flux est coupé dès `n` octets reçus ;
 *  - délai borné ; objet vide (`content-length: 0`) ⇒ aucun `GET` ;
 *  - une réponse partielle qui ne commence pas à 0, un objet remplacé entre
 *    `HEAD` et `GET` (`Content-Range` dont le total diffère) ou un début plus
 *    court qu'annoncé ⇒ `illisible`.
 */
import { cleObjetDeLEspace } from '@tiktrends/core';
import { basePubliqueStockage, presignGetUrl, presignHeadUrl, type StorageConfig } from './storage';

export type DebutObjet =
  | { ok: true; cle: string; taille: number; octets: Uint8Array }
  | { ok: false; raison: 'hors_espace' | 'absent' | 'illisible' };

/** Plafond de la fenêtre relue · bien au-delà du besoin mesuré (256), jamais un fichier entier. */
const FENETRE_MAX = 4096;

function tailleEntete(v: string | null): number | null {
  if (v === null || !/^\d{1,16}$/.test(v.trim())) return null;
  const n = Number(v.trim());
  return Number.isSafeInteger(n) ? n : null;
}

async function lireBorne(res: Response, n: number): Promise<Uint8Array> {
  const sortie = new Uint8Array(n);
  let lus = 0;
  const lecteur = res.body?.getReader();
  if (!lecteur) return sortie.subarray(0, 0);
  try {
    while (lus < n) {
      const { done, value } = await lecteur.read();
      if (done || !value) break;
      const prendre = Math.min(value.length, n - lus);
      sortie.set(value.subarray(0, prendre), lus);
      lus += prendre;
    }
  } finally {
    // Range ignoré (200, fichier entier) · on coupe le flux, rien de plus n'est lu.
    try { await lecteur.cancel(); } catch { /* flux déjà clos */ }
  }
  return sortie.subarray(0, lus);
}

/**
 * Taille et `n` premiers octets de l'objet désigné par `url`, s'il appartient
 * à l'espace `workspaceId`.
 */
export async function lireDebutObjetEspace(cfg: StorageConfig, url: string, workspaceId: string, n: number, delaiMs = 10_000): Promise<DebutObjet> {
  const cle = cleObjetDeLEspace(url, basePubliqueStockage(cfg), workspaceId);
  if (!cle) return { ok: false, raison: 'hors_espace' };
  if (!Number.isInteger(n) || n < 1 || n > FENETRE_MAX) throw new Error('Fenêtre de lecture invalide');
  try {
    const tete = await fetch(presignHeadUrl(cfg, cle, 60), { method: 'HEAD', redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(delaiMs) });
    if (tete.status === 404) return { ok: false, raison: 'absent' };
    if (tete.status !== 200) return { ok: false, raison: 'illisible' };
    const taille = tailleEntete(tete.headers.get('content-length'));
    if (taille === null) return { ok: false, raison: 'illisible' };
    if (taille === 0) return { ok: true, cle, taille, octets: new Uint8Array(0) };

    const res = await fetch(presignGetUrl(cfg, cle, 60), { method: 'GET', headers: { range: `bytes=0-${n - 1}` }, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(delaiMs) });
    if (res.status === 404) { try { await res.body?.cancel(); } catch { /* rien */ } return { ok: false, raison: 'absent' }; }
    if (res.status !== 206 && res.status !== 200) { try { await res.body?.cancel(); } catch { /* rien */ } return { ok: false, raison: 'illisible' }; }
    // 206 · la plage doit commencer à 0 et porter la taille vue au HEAD (sinon
    // l'objet a été remplacé entre les deux requêtes, ou la plage est autre).
    const plage = /^bytes\s+0-\d+\/(\d+)$/i.exec(res.headers.get('content-range') ?? '');
    if (res.status === 206 && (!plage || Number(plage[1]) !== taille)) { try { await res.body?.cancel(); } catch { /* rien */ } return { ok: false, raison: 'illisible' }; }
    const longueur = tailleEntete(res.headers.get('content-length'));
    if (res.status === 200 && longueur !== null && longueur !== taille) { try { await res.body?.cancel(); } catch { /* rien */ } return { ok: false, raison: 'illisible' }; }
    const octets = await lireBorne(res, n);
    if (octets.length < Math.min(n, taille)) return { ok: false, raison: 'illisible' };
    return { ok: true, cle, taille, octets };
  } catch {
    return { ok: false, raison: 'illisible' };
  }
}
