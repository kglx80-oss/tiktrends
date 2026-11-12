import { describe, expect, it } from 'vitest';
import {
  FILTRES_LOTS, RAISON_LISTE_A_CONCLURE, actionAConclure, attendArbitrage, dansFiltreLots, etatLotSpatial, gestesClavierLot, gestesListeLots,
  lienLotSpatial, lotArbitrable, lotConcluable, porteeListeLots, presentationLot, selectionAConclure, sousListeAConclure,
  type ContexteLots, type EtatLotSpatial, type FaitsAdSpatial, type FaitsLotSpatial, type VerdictValue,
} from '../src';

/**
 * « À conclure » ouvert aux membres qui peuvent arbitrer · la règle au noyau.
 *  · la portée suit les gardes EXISTANTES (fonction `lots` · arbitrage) ·
 *    aucune n'est créée ;
 *  · la sélection · les lots qu'on peut conclure (`lotConcluable`, la règle de
 *    « Conclure le lot »), un par état réel, dans l'ordre reçu ;
 *  · le filtre « À conclure » de l'admin rend la MÊME liste ;
 *  · les gestes par rôle · le membre ne voit ni « Nouveau lot », ni les autres
 *    filtres, ni la barre « Itérer » · la raison est écrite ;
 *  · une ligne « À conclure » mène toujours à la fiche du lot.
 */

const MAINTENANT = new Date('2026-11-12T12:00:00Z');
const CTX: ContexteLots = { maintenant: MAINTENANT, fenetreJours: 7 };
const il = (j: number) => new Date(MAINTENANT.getTime() - j * 86_400_000).toISOString();

function ad(id: string, v: { calcule: VerdictValue | null; valide?: boolean } | null): FaitsAdSpatial {
  return {
    id, variante: id, statut: 'live', hypothese: null, variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
    verdict: v ? { calcule: v.calcule, retenu: v.valide ? v.calcule : null, statut: v.valide ? 'validated' : 'computed', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null,
  };
}
function lot(id: string, statut: string, lanceIl: number | null, ads: FaitsAdSpatial[]): FaitsLotSpatial {
  return { id, numero: Number(id.replace(/\D/g, '')) || 1, but: `But ${id}`, statut, lanceLe: lanceIl === null ? null : il(lanceIl), ads, protocole: null };
}

/** Un lot par état réel · le plus récent d'abord (l'ordre de `chargerLots`). */
const LOTS: Array<[EtatLotSpatial, FaitsLotSpatial]> = [
  ['composition', lot('l8', 'planned', null, [ad('a8', null)])],
  ['pret', lot('l7', 'ready', null, [ad('a7', null)])],
  ['diffusion', lot('l6', 'testing', 2, [ad('a6', { calcule: 'winner' })])],
  ['a_importer', lot('l5', 'testing', 20, [ad('a5', null)])],
  ['a_conclure', lot('l4', 'testing', 20, [ad('a4a', { calcule: 'winner' }), ad('a4b', { calcule: 'loser' })])],
  ['non_concluant', lot('l3', 'testing', 20, [ad('a3', { calcule: 'inconclusive' })])],
  ['conclu', lot('l2', 'analyzed', 30, [ad('a2', { calcule: 'winner', valide: true })])],
  ['importe', lot('l1', 'analyzed', null, [ad('a1', { calcule: 'winner' })])],
];

describe('« À conclure » · les fixtures couvrent chaque état réel', () => {
  it('chaque lot est dans l’état annoncé (sinon la suite ne prouverait rien)', () => {
    for (const [etat, l] of LOTS) expect(etatLotSpatial(l, CTX), l.id).toBe(etat);
  });
});

describe('la portée de la liste suit les gardes existantes · aucune permission nouvelle', () => {
  it('fonction `lots` (admin) · la liste complète · arbitrage seul (membre) · « À conclure » · ni l’un ni l’autre · refus', () => {
    expect(porteeListeLots({ lotsOuverts: true, arbitrageOuvert: true })).toBe('complete');
    expect(porteeListeLots({ lotsOuverts: false, arbitrageOuvert: true })).toBe('a-conclure');
    expect(porteeListeLots({ lotsOuverts: false, arbitrageOuvert: false })).toBeNull();
    // Sans la garde de l'arbitrage, rien n'est lu · même si la fonction `lots` était ouverte.
    expect(porteeListeLots({ lotsOuverts: true, arbitrageOuvert: false })).toBeNull();
  });
});

describe('la sélection · les lots qu’on peut conclure, la règle de « Conclure le lot »', () => {
  it('à conclure et non concluant (des verdicts attendent) · jamais en préparation, en diffusion, à importer, conclu ni importé', () => {
    expect(selectionAConclure(LOTS.map(([, l]) => l), CTX).map((l) => l.id)).toEqual(['l4', 'l3']);
  });
  it('l’ordre reçu est gardé (le plus récent d’abord)', () => {
    const inverse = LOTS.map(([, l]) => l).reverse();
    expect(selectionAConclure(inverse, CTX).map((l) => l.id)).toEqual(['l3', 'l4']);
  });
  it('un lot arbitrable sans verdict qui attend n’est pas concluable · la règle ne regarde pas que l’état', () => {
    expect(lotConcluable('a_conclure', [ad('x', { calcule: 'winner', valide: true })])).toBe(false);
    expect(lotConcluable('a_conclure', [ad('x', { calcule: 'winner' })])).toBe(true);
    expect(lotConcluable('conclu', [ad('x', { calcule: 'winner' })])).toBe(false);
  });
  it('« Conclure le lot » (touche C de la fiche) est ouvert EXACTEMENT sur les lots de la liste', () => {
    for (const [etat, l] of LOTS) {
      const ouvert = gestesClavierLot({ etat, ads: l.ads, planIds: new Set() }).conclure.href !== null;
      expect(ouvert, `${l.id} · ${etat}`).toBe(selectionAConclure([l], CTX).length === 1);
    }
  });
});

describe('le filtre « À conclure » de l’admin rend la même liste que celle du membre', () => {
  it('même ensemble, même ordre', () => {
    const admin = LOTS.map(([, l]) => l).filter((l) => dansFiltreLots(etatLotSpatial(l, CTX), 'conclure')).map((l) => l.id);
    expect(admin).toEqual(selectionAConclure(LOTS.map(([, l]) => l), CTX).map((l) => l.id));
  });
  it('un état arbitrable a toujours un verdict qui attend · le filtre (par état) et la règle (état et verdicts) ne divergent pas', () => {
    for (const [etat, l] of LOTS) if (lotArbitrable(etat)) expect(l.ads.some(attendArbitrage), l.id).toBe(true);
    for (const [etat] of LOTS) expect(dansFiltreLots(etat, 'conclure'), etat).toBe(lotArbitrable(etat));
  });
});

describe('les gestes visibles par rôle', () => {
  it('admin · « Nouveau lot », les cinq filtres, « Tous » d’abord, la barre « Itérer », aucune raison', () => {
    const g = gestesListeLots('complete', { admin: true });
    expect(g).toEqual({ creer: true, filtres: FILTRES_LOTS, filtreInitial: 'tous', raison: null, boucle: true });
  });
  it('membre · le seul filtre « À conclure », rien à composer ni à lancer, pas de barre « Itérer », la raison écrite', () => {
    const g = gestesListeLots('a-conclure', { admin: false });
    expect(g.creer).toBe(false);
    expect(g.filtres.map((f) => f.libelle)).toEqual(['À conclure']);
    expect(g.filtreInitial).toBe('conclure');
    expect(g.boucle).toBe(false);
    expect(g.raison).toBe(RAISON_LISTE_A_CONCLURE);
    expect(RAISON_LISTE_A_CONCLURE).toMatch(/Composer, préparer, lancer ou dupliquer un lot est réservé aux admins/);
  });
  it('la portée « À conclure » ne compose jamais, même si l’appelant se dit admin', () => {
    expect(gestesListeLots('a-conclure', { admin: true }).creer).toBe(false);
  });
  it('sous-titre · le compte et la marque, au singulier, au pluriel, à vide', () => {
    expect(sousListeAConclure(1, 'Neva')).toBe('1 lot à conclure · Neva');
    expect(sousListeAConclure(3, 'Neva')).toBe('3 lots à conclure · Neva');
    expect(sousListeAConclure(0, 'Neva')).toBe('Aucun lot à conclure · Neva');
  });
});

describe('une ligne « À conclure » mène à la fiche du lot, où l’arbitrage existe', () => {
  it('jamais l’import · le libellé et le relief de l’état sont gardés', () => {
    for (const [, l] of LOTS) {
      const p = presentationLot(l, CTX);
      const a = actionAConclure(p);
      expect(a.href, l.id).toBe(lienLotSpatial(l.id));
      expect(a.libelle).toBe(p.action.libelle);
      expect(a.primaire).toBe(p.action.primaire);
    }
  });
});
