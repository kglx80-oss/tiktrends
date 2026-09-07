import { describe, expect, it } from 'vitest';
import {
  FAMILLES_CLASSEES, FAMILLES_FACTUREES, FAMILLES_SANS_FACTURE, rienNaEteFacture,
} from '../src/spend-refund';

/**
 * On ne rend que ce dont on est sûr.
 *
 * Le plafond existe pour empêcher une facture qu'on découvre. Rendre une
 * dépense à tort le percerait · c'est pour ça que le doute reste compté, et
 * c'est ça que ces tests tiennent.
 */

describe('ce qui autorise à rendre une dépense', () => {
  it('rend les refus arrivés avant tout calcul', () => {
    // Demande malformée, clé morte, référence illisible, modération, 429, et
    // notre propre garde réseau · dans les six cas, aucun GPU n'a démarré.
    for (const f of ['requete', 'acces', 'image', 'adresse', 'saturation', 'contenu']) {
      expect(rienNaEteFacture(f), `« ${f} » devrait être rendu`).toBe(true);
    }
  });

  it('garde compté tout ce qui a pu commencer à travailler', () => {
    // `delai` est le cas net : notre échéance tombe, pas celle du fournisseur ·
    // il finit l'image et la facture. C'est déjà la raison pour laquelle on ne
    // rejoue pas un délai dépassé.
    for (const f of ['delai', 'service', 'quota', 'reseau', 'autre']) {
      expect(rienNaEteFacture(f), `« ${f} » ne devrait pas être rendu`).toBe(false);
    }
  });

  it('une famille inconnue reste comptée', () => {
    // C'est le bon côté de l'erreur · une famille qu'on n'a pas su nommer n'est
    // pas une famille dont on sait qu'elle ne facture rien.
    for (const f of ['', 'inventee', 'DELAI', 'requete ']) {
      expect(rienNaEteFacture(f), `« ${f} » ne devrait pas être rendu`).toBe(false);
    }
  });

  it('aucune famille n’est des deux côtés', () => {
    // Un chevauchement rendrait la règle dépendante de l'ordre de lecture.
    const doublons = FAMILLES_SANS_FACTURE.filter((f) => (FAMILLES_FACTUREES as readonly string[]).includes(f));
    expect(doublons, `classée deux fois : ${doublons.join(', ')}`).toEqual([]);
    expect(FAMILLES_CLASSEES.length).toBe(new Set(FAMILLES_CLASSEES).size);
  });
});
