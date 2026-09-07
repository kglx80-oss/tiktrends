import { describe, expect, it } from 'vitest';
import { exemplesParDirection, meilleurExemple } from '../src/exemple-direction';

/**
 * La vignette sert à décider, pas à raconter l'historique.
 */

describe('quelle publicité représente une direction', () => {
  it('prend la meilleure note, pas la plus récente', () => {
    // C'est le changement de règle · la vignette montre ce que la direction
    // sait faire, parce que c'est ce qu'on obtiendra en la choisissant.
    const gagnant = meilleurExemple([
      { id: 'vieille-excellente', score: 84, rang: 1 },
      { id: 'recente-moyenne', score: 51, rang: 9 },
    ]);
    expect(gagnant?.id).toBe('vieille-excellente');
  });

  it('à note égale, la plus récente', () => {
    const gagnant = meilleurExemple([
      { id: 'ancienne', score: 70, rang: 2 },
      { id: 'recente', score: 70, rang: 8 },
    ]);
    expect(gagnant?.id).toBe('recente');
  });

  it('écarte les ratés, même quand ils sont les mieux notés', () => {
    // Une pub au produit déformé ou à l'accroche réécrite ne représente pas sa
    // direction · elle représente une génération manquée.
    const gagnant = meilleurExemple([
      { id: 'ratee', score: 90, grave: true, rang: 9 },
      { id: 'saine', score: 44, rang: 1 },
    ]);
    expect(gagnant?.id).toBe('saine');
  });

  it('ne montre rien quand tout est raté', () => {
    // Élire le moins mauvais et le présenter comme un exemple serait le seul
    // mensonge que cet écran puisse commettre.
    expect(meilleurExemple([
      { id: 'a', score: 80, grave: true, rang: 2 },
      { id: 'b', score: 60, grave: true, rang: 5 },
    ])).toBeNull();
  });

  it('une note absente ne vaut pas zéro', () => {
    // Les traiter comme nulles ferait gagner systématiquement les créas qu'on a
    // pris la peine d'analyser · ça mesurerait notre attention, pas la
    // direction.
    const gagnant = meilleurExemple([
      { id: 'notee-faible', score: 30, rang: 1 },
      { id: 'jamais-notee', rang: 9 },
    ]);
    expect(gagnant?.id, 'la non notée a été traitée comme un zéro').toBe('notee-faible');
  });

  it('entre deux non notées, la plus récente', () => {
    const gagnant = meilleurExemple([
      { id: 'vieille', rang: 1 },
      { id: 'recente', rang: 7 },
    ]);
    expect(gagnant?.id).toBe('recente');
  });

  it('sans candidat, rien', () => {
    expect(meilleurExemple([])).toBeNull();
  });
});

describe('un exemple par direction', () => {
  it('ne mélange jamais deux directions', () => {
    // Une vignette attribuée à la mauvaise direction vendrait une ambiance pour
    // une autre · c'est pire que pas de vignette du tout.
    const out = exemplesParDirection([
      { id: 'a1', direction: 'editorial', score: 60, rang: 1 },
      { id: 'a2', direction: 'editorial', score: 80, rang: 2 },
      { id: 'b1', direction: 'preuve', score: 40, rang: 3 },
    ]);
    expect(out.editorial?.id).toBe('a2');
    expect(out.preuve?.id).toBe('b1');
  });

  it('une direction sans créa saine n’apparaît pas', () => {
    const out = exemplesParDirection([
      { id: 'x', direction: 'bold', score: 90, grave: true, rang: 1 },
    ]);
    expect(out.bold).toBeUndefined();
  });

  it('ignore les créas sans direction consignée', () => {
    // Les publicités antérieures à l'enregistrement de la direction n'en
    // portent pas · les deviner attribuerait une vignette au hasard.
    const out = exemplesParDirection([
      { id: 'sans', direction: null, score: 99, rang: 9 },
      { id: 'avec', direction: 'nature', score: 20, rang: 1 },
    ]);
    expect(Object.keys(out)).toEqual(['nature']);
  });
});
