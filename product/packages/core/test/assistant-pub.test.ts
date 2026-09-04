import { describe, expect, it } from 'vitest';
import {
  ETAPES, ETAPE_TITRE, ETAPE_ROLE, dureeAttendue, etapeAccessible, etapeComplete,
  etapePrecedente, etapeSuivante, manque, peutGenerer, premiereIncomplete, recapitulatif,
  type EtatAssistant,
} from '../src/assistant-pub';

const etat = (o: Partial<EtatAssistant> = {}): EtatAssistant => ({
  productId: 'p1', aPhotoProduit: true, aDesProduits: true,
  angle: '', offre: '', gabarits: ['benefits'], direction: '',
  mode: 'entiere', nombre: 2, moteur: 'nano',
  ...o,
});

describe('les étapes sont décrites entièrement', () => {
  it('chacune a un titre et un rôle', () => {
    for (const e of ETAPES) {
      expect(ETAPE_TITRE[e], e).toBeTruthy();
      expect(ETAPE_ROLE[e], e).toBeTruthy();
    }
  });

  it('l’ordre va du plus contraignant au moins contraignant', () => {
    // Le produit décide de la fidélité, le volume ne décide de rien d'autre
    // que du prix · les inverser ferait choisir un moteur avant de savoir ce
    // qu'on met en scène.
    expect(ETAPES[0]).toBe('produit');
    expect(ETAPES[ETAPES.length - 1]).toBe('volume');
  });
});

describe('ce qui manque est une phrase, pas un booléen', () => {
  it('nomme ce qui bloque, étape par étape', () => {
    expect(manque('produit', etat({ productId: '' }))).toContain('produit');
    expect(manque('message', etat({ gabarits: [] }))).toContain('type de pub');
    expect(manque('fabrication', etat({ mode: '' }))).toContain('fabriquée');
    expect(manque('volume', etat({ moteur: '' }))).toContain('moteur');
    expect(manque('volume', etat({ nombre: 0 }))).toContain('combien');
  });

  it('se tait quand l’étape est faite', () => {
    for (const e of ETAPES) expect(manque(e, etat()), e).toBe('');
  });
});

describe('ce qu’on n’exige pas', () => {
  it('une marque sans produit n’est pas bloquée sur le premier écran', () => {
    // Exiger un produit qui n'existe pas arrêterait une marque neuve avant
    // qu'elle ait rien pu faire.
    expect(etapeComplete('produit', etat({ aDesProduits: false, productId: '' }))).toBe(true);
  });

  it('l’angle reste facultatif', () => {
    // Jarvis sait écrire sans qu'on lui dicte l'angle · l'exiger inventerait
    // une contrainte que le serveur n'a pas.
    expect(etapeComplete('message', etat({ angle: '', offre: '' }))).toBe(true);
  });

  it('« variées » est un choix, pas une absence de choix', () => {
    expect(etapeComplete('style', etat({ direction: '' }))).toBe(true);
  });
});

describe('on ne saute pas une décision', () => {
  it('une étape n’est accessible que si tout ce qui précède est fait', () => {
    const sansGabarit = etat({ gabarits: [] });
    expect(etapeAccessible('message', sansGabarit)).toBe(true);
    expect(etapeAccessible('style', sansGabarit)).toBe(false);
    expect(etapeAccessible('volume', sansGabarit)).toBe(false);
  });

  it('la première étape est toujours accessible', () => {
    expect(etapeAccessible('produit', etat({ productId: '', gabarits: [] }))).toBe(true);
  });

  it('désigne la première étape à faire', () => {
    expect(premiereIncomplete(etat({ productId: '' }))).toBe('produit');
    expect(premiereIncomplete(etat({ gabarits: [] }))).toBe('message');
    expect(premiereIncomplete(etat())).toBeNull();
  });

  it('le bouton final n’est jamais le premier refus', () => {
    // Découvrir au dernier écran qu'il manquait quelque chose au premier est
    // exactement ce qu'on vient de corriger sur le bouton de génération.
    expect(peutGenerer(etat({ gabarits: [] }))).toBe(false);
    expect(peutGenerer(etat())).toBe(true);
  });
});

describe('la navigation', () => {
  it('avance d’un cran, même sur une étape déjà remplie', () => {
    // Sauter par-dessus une étape valide priverait de la relire, et c'est
    // souvent là qu'on corrige.
    expect(etapeSuivante('produit')).toBe('message');
    expect(etapeSuivante('volume')).toBeNull();
    expect(etapePrecedente('produit')).toBeNull();
    expect(etapePrecedente('message')).toBe('produit');
  });
});

describe('le récapitulatif', () => {
  it('couvre toutes les étapes', () => {
    // Cinq décisions oubliées ne valent pas mieux qu'onze décisions
    // simultanées · on relit avant de payer.
    const r = recapitulatif(etat(), {});
    expect(r.map((l) => l.etape)).toEqual([...ETAPES]);
    for (const l of r) expect(l.valeur, l.etape).toBeTruthy();
  });

  it('dit quand la marque n’a pas de produit, au lieu de laisser vide', () => {
    const r = recapitulatif(etat({ aDesProduits: false, productId: '' }), {});
    expect(r[0]!.valeur).toContain('pas de produit');
  });

  it('reprend l’angle et l’offre quand ils existent', () => {
    const r = recapitulatif(etat({ angle: 'Sans caféine', offre: '-20 %' }), {});
    expect(r[1]!.valeur).toContain('Sans caféine');
    expect(r[1]!.valeur).toContain('-20 %');
  });
});

describe('le temps annoncé avant de cliquer', () => {
  it('grandit avec le moteur', () => {
    // « Le bouton ne fonctionne pas » était en réalité « il travaille depuis
    // cinq minutes et rien ne me le dit ».
    const rapide = dureeAttendue(2, 90_000);
    const lent = dureeAttendue(2, 300_000);
    expect(rapide).not.toBe(lent);
    expect(lent).toContain('minutes');
  });

  it('compte les vagues, pas les images', () => {
    // Elles partent par groupes de trois · annoncer n × la durée serait
    // effrayant et faux.
    expect(dureeAttendue(3, 300_000)).toBe(dureeAttendue(1, 300_000));
    expect(dureeAttendue(6, 300_000)).not.toBe(dureeAttendue(3, 300_000));
  });

  it('reste lisible sur un petit lot rapide', () => {
    expect(dureeAttendue(1, 30_000)).toContain('moins d’une minute');
  });
});
