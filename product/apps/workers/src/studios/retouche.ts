import { createHash } from 'node:crypto';
import { schema, eq, and } from '@tiktrends/db';
import {
  composerRetoucheStricte, controlerFichierMasque, controlerHorsZone, lireEntetePng, masqueDepuisGris, boiteDuMasque, ID_MEDIA_STUDIO,
  type BoiteMasque, type ControleMasque, type MasqueBrut, type MasqueRelu, type ParametresRetoucheSnapshot, type PixelsBruts, type StockageStudio,
} from '@tiktrends/core';
import type { ExecStudio, JobStudio } from './types';

/**
 * Studios · G-B · retouche masquée RÉELLE dans le worker (IMG-06, F05).
 *
 * Ce module fait ce que le noyau ne peut pas faire (lire la base, relire le
 * stockage, décoder et encoder avec `sharp`) ; toutes les décisions sont dans
 * le noyau : `controlerFichierMasque` (format canonique PNG gris 8 bits),
 * `composerRetoucheStricte` (composition puis contrôle hors zone),
 * `controlerHorsZone` (recontrôle du fichier ENCODÉ, relu).
 *
 * Deux moments :
 *  · avant la soumission (`lireMasqueEtSource`, appelé par la préparation fal)
 *    · masque absent, au mauvais format, d'une autre résolution ou vide ⇒ la
 *    tâche est bloquée, rien ne part, 0 $ ;
 *  · à la finalisation (`retoucherSortie`, appelé par le moteur) · la sortie
 *    DÉCODÉE du fournisseur est ramenée explicitement à la résolution de la
 *    source, recomposée sous le masque, contrôlée (0 pixel hors zone + fondu),
 *    encodée en PNG, REDÉCODÉE et recontrôlée. Ce qui est livré est cette
 *    recomposition, jamais la sortie brute : si elle repeint toute l'image,
 *    seule la zone change.
 *
 * `sharp` est chargé à la demande (module natif) : absent ⇒ `attendre`, rien
 * n'est compté ni livré.
 */

type Sharp = typeof import('sharp');
async function chargerSharp(): Promise<Sharp | null> {
  try { return (await import('sharp')).default; } catch { return null; }
}

const sha = (o: Uint8Array) => createHash('sha256').update(o).digest('hex');

/** Une ligne `studio_assets` d'un média studio, dans la portée du job (espace ET marque), stockée. */
export async function ligneMediaStudio(ex: ExecStudio, job: { workspaceId: string; brandId: string }, assetId: string) {
  if (!ID_MEDIA_STUDIO.test(assetId)) return null;
  const S = schema.studioAssets;
  const [m] = await ex.select().from(S)
    .where(and(eq(S.id, assetId.slice(4)), eq(S.workspaceId, job.workspaceId), eq(S.brandId, job.brandId), eq(S.storageState, 'stored'))).limit(1);
  if (!m || m.storageKey.startsWith('simule/')) return null;
  return m;
}

/** Décode un PNG gris 8 bits en masque canonique · `null` si les pixels ne sont pas un octet par pixel. */
async function decoderMasque(s: Sharp, octets: Uint8Array): Promise<MasqueBrut | null> {
  // L'en-tête est déjà vérifié (gris 8 bits, type 0) : `b-w` garde l'octet tel quel (sans lui, sharp rend 3 canaux).
  const { data, info } = await s(octets, { failOn: 'warning' }).toColourspace('b-w').raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 1 || data.length !== info.width * info.height) return null;
  return masqueDepuisGris(info.width, info.height, new Uint8Array(data.buffer, data.byteOffset, data.length));
}

async function decoderRvba(s: Sharp, octets: Uint8Array, vers?: { largeur: number; hauteur: number }): Promise<PixelsBruts> {
  let p = s(octets, { failOn: 'warning' }).ensureAlpha();
  if (vers) p = p.resize(vers.largeur, vers.hauteur, { fit: 'fill', kernel: 'lanczos3' });
  const { data, info } = await p.raw().toBuffer({ resolveWithObject: true });
  return { largeur: info.width, hauteur: info.height, canaux: 4, donnees: new Uint8Array(data.buffer, data.byteOffset, data.length) };
}

/** Ce que la préparation relit du masque · forme attendue par `requeteFalRetouche`. */
export async function relireMasque(o: {
  ex: ExecStudio;
  job: { workspaceId: string; brandId: string };
  parametres: ParametresRetoucheSnapshot;
  lire: (cle: string) => Promise<Uint8Array | null>;
}): Promise<{ masque: MasqueRelu; dimensionsSource: { largeur: number; hauteur: number } | null }> {
  const p = o.parametres;
  const sourceLigne = await ligneMediaStudio(o.ex, o.job, p.source.assetId);
  const sourceOctets = sourceLigne ? await o.lire(sourceLigne.storageKey) : null;
  const enteteSource = sourceOctets && sha(sourceOctets) === sourceLigne!.sha256 ? await dimensions(sourceOctets) : null;
  const ligne = await ligneMediaStudio(o.ex, o.job, p.masque.assetId);
  if (!ligne) return { masque: null, dimensionsSource: enteteSource };
  const octets = await o.lire(ligne.storageKey);
  if (!octets) return { masque: null, dimensionsSource: enteteSource };
  const empreinte = sha(octets);
  const violations = controlerFichierMasque({
    entete: lireEntetePng(octets), sha256: empreinte, attendu: p.masque,
    source: enteteSource ?? { largeur: p.source.largeur, hauteur: p.source.hauteur },
  });
  if (empreinte !== ligne.sha256) violations.push('octets relus différents de la ligne du média');
  if (violations.length) return { masque: { violations, boite: null }, dimensionsSource: enteteSource };
  const s = await chargerSharp();
  if (!s) throw new Error('décodeur d’images indisponible · masque non vérifiable');
  let m: MasqueBrut | null;
  try { m = await decoderMasque(s, octets); } catch (e) { return { masque: { violations: [`masque indécodable · ${((e as Error).message ?? '').split('\n')[0]!.slice(0, 160)}`], boite: null }, dimensionsSource: enteteSource }; }
  if (!m) return { masque: { violations: ['masque décodé sans être un octet gris par pixel'], boite: null }, dimensionsSource: enteteSource };
  return { masque: { violations: [], boite: boiteDuMasque(m) as BoiteMasque | null }, dimensionsSource: enteteSource };
}

async function dimensions(octets: Uint8Array): Promise<{ largeur: number; hauteur: number } | null> {
  const s = await chargerSharp();
  if (!s) return null;
  try {
    const m = await s(octets).metadata();
    return m.width && m.height ? { largeur: m.width, hauteur: m.height } : null;
  } catch {
    return null;
  }
}

export interface TraceRetouche {
  source: string;
  masque: string;
  fonduPx: number;
  redimension: { de: { largeur: number; hauteur: number }; vers: { largeur: number; hauteur: number } } | null;
  controle: ControleMasque;
  controleApresEncodage: ControleMasque;
}

export type ResultatRetoucheSortie =
  | { ok: true; octets: Uint8Array; mime: 'image/png'; largeur: number; hauteur: number; parentAssetId: string; trace: TraceRetouche }
  /** `attendre` · infrastructure (stockage, décodeur) : le job reste `persisting` · `refuser` · rien ne sera livré. */
  | { ok: false; suite: 'attendre' | 'refuser'; raison: string };

/**
 * La sortie du fournisseur, recomposée sur la source sous le masque. Les
 * octets de la source et du masque sont relus au stockage et comparés à la
 * ligne ET à l'instantané : un média changé depuis le devis n'est jamais
 * retouché « à peu près ».
 */
export async function retoucherSortie(o: {
  ex: ExecStudio;
  stockage: StockageStudio;
  job: JobStudio;
  parametres: ParametresRetoucheSnapshot;
  generation: Uint8Array;
}): Promise<ResultatRetoucheSortie> {
  const p = o.parametres;
  const s = await chargerSharp();
  if (!s) return { ok: false, suite: 'attendre', raison: 'décodeur d’images indisponible' };
  const lignes = { source: await ligneMediaStudio(o.ex, o.job, p.source.assetId), masque: await ligneMediaStudio(o.ex, o.job, p.masque.assetId) };
  if (!lignes.source) return { ok: false, suite: 'refuser', raison: `source ${p.source.assetId} retirée ou hors portée` };
  if (!lignes.masque) return { ok: false, suite: 'refuser', raison: `masque ${p.masque.assetId} retiré ou hors portée` };
  let octetsSource: Uint8Array | null;
  let octetsMasque: Uint8Array | null;
  try {
    octetsSource = await o.stockage.relire(lignes.source.storageKey);
    octetsMasque = await o.stockage.relire(lignes.masque.storageKey);
  } catch (e) {
    return { ok: false, suite: 'attendre', raison: `stockage · ${(e as Error).message}` };
  }
  if (!octetsSource || sha(octetsSource) !== lignes.source.sha256 || lignes.source.sha256 !== p.source.sha256) return { ok: false, suite: 'refuser', raison: `source ${p.source.assetId} absente ou modifiée depuis le devis` };
  if (!octetsMasque || sha(octetsMasque) !== lignes.masque.sha256) return { ok: false, suite: 'refuser', raison: `masque ${p.masque.assetId} absent ou altéré au stockage` };

  try {
    const original = await decoderRvba(s, octetsSource);
    const violations = controlerFichierMasque({ entete: lireEntetePng(octetsMasque), sha256: lignes.masque.sha256, attendu: p.masque, source: original });
    if (violations.length) return { ok: false, suite: 'refuser', raison: `masque refusé · ${violations.join(' · ')}` };
    const masque = await decoderMasque(s, octetsMasque);
    if (!masque) return { ok: false, suite: 'refuser', raison: 'masque décodé sans être un octet gris par pixel' };
    const meta = await s(o.generation).metadata();
    const de = { largeur: meta.width ?? 0, hauteur: meta.height ?? 0 };
    const redimension = de.largeur === original.largeur && de.hauteur === original.hauteur ? null : { de, vers: { largeur: original.largeur, hauteur: original.hauteur } };
    // Redimension EXPLICITE (L5-A) : la sortie du fournisseur n'a presque jamais la taille de la source.
    const generation = await decoderRvba(s, o.generation, redimension ? redimension.vers : undefined);
    const r = composerRetoucheStricte({ original, generation, masque, featherPx: p.fonduPx });
    if (!r.ok) return { ok: false, suite: 'refuser', raison: `retouche refusée · ${r.raison}` };
    const png = await s(Buffer.from(r.resultat.donnees), { raw: { width: r.resultat.largeur, height: r.resultat.hauteur, channels: 4 } })
      .png({ compressionLevel: 9, adaptiveFiltering: false }).toBuffer();
    // La preuve porte sur ce qui sera STOCKÉ : le fichier encodé est redécodé et recontrôlé.
    const relu = await decoderRvba(s, png);
    const apres = controlerHorsZone(original, relu, r.zone);
    if (!apres.conforme) return { ok: false, suite: 'refuser', raison: `le fichier encodé diffère du résultat contrôlé · ${apres.pixelsHorsZone} pixel(s) hors zone` };
    const octets = new Uint8Array(png.buffer, png.byteOffset, png.length);
    return {
      ok: true, octets, mime: 'image/png', largeur: original.largeur, hauteur: original.hauteur, parentAssetId: lignes.source.id,
      trace: { source: p.source.assetId, masque: p.masque.assetId, fonduPx: p.fonduPx, redimension, controle: r.controle, controleApresEncodage: apres },
    };
  } catch (e) {
    return { ok: false, suite: 'refuser', raison: `retouche impossible · ${((e as Error).message ?? '').split('\n')[0]!.slice(0, 200)}` };
  }
}
