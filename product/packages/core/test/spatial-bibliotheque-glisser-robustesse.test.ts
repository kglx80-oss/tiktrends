import { describe, expect, it } from 'vitest';
import {
  annonceSurvol, chargeAbandonnee, chargeOrpheline, donneesDrive, GARDE_CHARGE_MS, refusAuLacher, REFUS_DEPOT, VEILLE_DEFILEMENT_MS,
  type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · glisser-déposer · la ROBUSTESSE du glisser · règles pures :
 *  · le refus dit au lâcher (`refusAuLacher`) · la phrase du verdict, sauf
 *    rien de refusé sous le pointeur, un dépôt ailleurs ou une annulation dite ;
 *  · la garde de la charge (`GARDE_CHARGE_MS`, `chargeAbandonnee`) · seulement
 *    une source sortie du document, après le silence des `dragover` ;
 *  · la charge orpheline à la relecture (`chargeOrpheline`).
 */

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name: id, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 2048, createdAt: T0, folderId: null, rights: null, ...extra,
});
const d = donneesDrive({
  dossiers: [dossier('photos'), dossier('ugc'), dossier('jete', { deletedAt: T0 })],
  medias: [media('a', { folderId: 'photos' }), media('b'), media('poubelle', { deletedAt: T0 })],
});

describe('refusAuLacher · la raison dite au lâcher sur une cible refusée', () => {
  const sous = annonceSurvol(null, 'ugc', { ok: false, raison: REFUS_DEPOT.dossierIci });

  it('lâchée sur la cible refusée (aucun dépôt, `dropEffect` none, ou rien dit par le navigateur) · la phrase du verdict', () => {
    expect([refusAuLacher(sous, { effet: 'none' }), refusAuLacher(sous, { effet: null }), refusAuLacher(sous, {})])
      .toEqual([REFUS_DEPOT.dossierIci, REFUS_DEPOT.dossierIci, REFUS_DEPOT.dossierIci]);
  });

  it('rien de refusé sous le pointeur (vide, cible qui accepte, la source) · rien', () => {
    expect([
      refusAuLacher(null, { effet: 'none' }),
      refusAuLacher(annonceSurvol(null, 'ugc', { ok: true, destination: 'ugc', nom: 'UGC' }), { effet: 'none' }),
      refusAuLacher(annonceSurvol(null, 'ugc', null), { effet: 'none' }),
    ]).toEqual([null, null, null]);
  });

  it('un dépôt a eu lieu ailleurs (`dropEffect` move, copy, link) · rien', () => {
    expect(['move', 'copy', 'link'].map((effet) => refusAuLacher(sous, { effet }))).toEqual([null, null, null]);
  });

  it('annulé par l’utilisateur, quand le navigateur le dit (Échap · `mozUserCancelled`) · rien', () => {
    expect([refusAuLacher(sous, { effet: 'none', annule: true }), refusAuLacher(sous, { effet: 'none', annule: false })]).toEqual([null, REFUS_DEPOT.dossierIci]);
  });
});

describe('la garde de la charge · sans `dragend`', () => {
  it('la valeur · celle de la veille du défilement (1 000 ms), presque deux fois l’écart maximal des `dragover` (350 + 200 ms)', () => {
    expect([GARDE_CHARGE_MS, GARDE_CHARGE_MS === VEILLE_DEFILEMENT_MS, GARDE_CHARGE_MS >= 1.8 * (350 + 200)]).toEqual([1000, true, true]);
  });

  it('abandonnée seulement si la source a quitté le document ET après la garde · jamais avant, jamais une source encore là', () => {
    expect([
      chargeAbandonnee({ silenceMs: GARDE_CHARGE_MS, sourceDansDocument: false }),
      chargeAbandonnee({ silenceMs: 60_000, sourceDansDocument: false }),
      chargeAbandonnee({ silenceMs: GARDE_CHARGE_MS - 1, sourceDansDocument: false }),
      // La source est là · son `dragend` désarmera · le silence dit seulement que le pointeur a quitté la fenêtre.
      chargeAbandonnee({ silenceMs: GARDE_CHARGE_MS, sourceDansDocument: true }),
      chargeAbandonnee({ silenceMs: 60_000, sourceDansDocument: true }),
    ]).toEqual([true, true, false, false, false]);
  });
});

describe('chargeOrpheline · la relecture des données', () => {
  it('tous les éléments existent, vivants · la charge tient', () => {
    expect([
      chargeOrpheline(d, { type: 'fichiers', ids: ['a', 'b'] }),
      chargeOrpheline(d, { type: 'dossier', id: 'ugc', nom: 'ugc' }),
      chargeOrpheline(d, { type: 'dossiers', ids: ['photos', 'ugc'] }),
    ]).toEqual([false, false, false]);
  });

  it('un seul élément absent de la liste relue, ou passé à la corbeille · orpheline', () => {
    expect([
      chargeOrpheline(d, { type: 'fichiers', ids: ['a', 'disparu'] }),
      chargeOrpheline(d, { type: 'fichiers', ids: ['a', 'poubelle'] }),
      chargeOrpheline(d, { type: 'dossier', id: 'disparu', nom: 'x' }),
      chargeOrpheline(d, { type: 'dossier', id: 'jete', nom: 'jete' }),
      chargeOrpheline(d, { type: 'dossiers', ids: ['photos', 'jete'] }),
    ]).toEqual([true, true, true, true, true]);
  });

  it('le type compte · un id de dossier dans une charge de fichiers (et l’inverse) n’existe pas', () => {
    expect([chargeOrpheline(d, { type: 'fichiers', ids: ['ugc'] }), chargeOrpheline(d, { type: 'dossier', id: 'a', nom: 'a' })]).toEqual([true, true]);
  });
});
