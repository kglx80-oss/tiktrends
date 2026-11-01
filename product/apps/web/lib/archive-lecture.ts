import { PLAFOND_ARCHIVE_OCTETS } from '@tiktrends/core';

/**
 * Lecture bornée d'un fichier pendant l'écriture de l'archive ZIP
 * (`/api/bibliotheque/archive`).
 *
 * Un délai borne l'arrivée des EN-TÊTES (`lecture-flux.ts`), pas le corps · un
 * gros fichier se lit aussi longtemps que le client télécharge. Sans borne
 * d'INACTIVITÉ, un objet qui cale au milieu côté stockage garderait la requête
 * et sa connexion amont ouvertes sans fin. On coupe donc quand AUCUN octet
 * n'arrive pendant `DELAI_INACTIVITE_LECTURE_MS` · le flux de l'archive échoue
 * alors (jamais une archive fausse) et la connexion amont est fermée.
 *
 * 30 s · un stockage S3 ou Drive sert normalement son premier morceau en moins
 * d'une seconde et les suivants en continu ; 30 s sans un octet est une panne,
 * pas un réseau lent (le client lent, lui, ne fait que ralentir les `pull`, il
 * ne déclenche pas cette minuterie, qui ne court que pendant `read()`).
 */
export const DELAI_INACTIVITE_LECTURE_MS = 30_000;

export class LectureInactive extends Error {
  constructor() { super('lecture du fichier interrompue · aucun octet reçu'); }
}

/** Les morceaux d'un flux, coupé en erreur après `delaiMs` sans aucun octet. */
export async function* morceauxBornes(flux: ReadableStream<Uint8Array>, delaiMs = DELAI_INACTIVITE_LECTURE_MS): AsyncGenerator<Uint8Array> {
  const lecteur = flux.getReader();
  let fini = false;
  try {
    for (;;) {
      let minuterie: ReturnType<typeof setTimeout> | undefined;
      const delai = new Promise<never>((_, rejeter) => { minuterie = setTimeout(() => rejeter(new LectureInactive()), delaiMs); });
      try {
        const { done, value } = await Promise.race([lecteur.read(), delai]);
        if (done) { fini = true; return; }
        if (value?.length) yield value;
      } finally {
        clearTimeout(minuterie);
      }
    }
  } finally {
    if (!fini) { try { await lecteur.cancel(); } catch { /* flux déjà clos */ } }
  }
}

/** Le plafond RÉEL d'octets écrits dans l'archive (`fluxZip`), même si `size_bytes` ment. */
export function plafondArchiveReel(): number {
  return PLAFOND_ARCHIVE_OCTETS;
}
