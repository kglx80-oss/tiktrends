import { describe, expect, it } from 'vitest';
import { controlesEnDouble, elementCourt, nomDeLigne, nomsDeControles, nomsDeLignes, nomsSansLibelleVisible, SEPARATEUR_NOM_LIGNE } from '../src';

/**
 * La règle des noms de ligne (WCAG 2.4.4 · 2.4.9 · 2.5.3) · le nom COMMENCE par
 * le libellé visible, puis nomme l'élément de la ligne · deux lignes au même
 * élément restent distinctes · la garde pure dit les doublons et les noms qui
 * perdent leur libellé visible.
 */
describe('nomDeLigne · nomsDeLignes · nomsDeControles', () => {
  it('« libellé · élément » · le libellé visible en tête · espaces resserrés · sans élément, le libellé seul', () => {
    expect(nomDeLigne('Fiche', 'V3 · Crème')).toBe('Fiche · V3 · Crème');
    expect(nomDeLigne('  Montrer   sur le canvas ', '  Résultat ·  V1 ')).toBe('Montrer sur le canvas · Résultat · V1');
    expect(nomDeLigne('Fiche', '')).toBe('Fiche');
    expect(nomDeLigne('Fiche', null)).toBe('Fiche');
    expect(SEPARATEUR_NOM_LIGNE).toBe(' · ');
    expect(nomDeLigne('Fiche', 'V1')).not.toMatch(new RegExp(String.fromCharCode(0x2014)));
  });

  it('une liste · un nom par ligne, dans l’ordre · un élément répété est numéroté à partir de sa deuxième occurrence', () => {
    expect(nomsDeLignes('Voir', ['Lot #1', 'Lot #2', 'Lot #1', 'Lot #1']), 'un élément répété n’est pas numéroté').toEqual(['Voir · Lot #1', 'Voir · Lot #2', 'Voir · Lot #1 · n° 2', 'Voir · Lot #1 · n° 3']);
    expect(new Set(nomsDeLignes('Voir', ['a', 'a', 'a'])).size, 'trois lignes au même élément · trois noms').toBe(3);
    expect(nomsDeLignes('Voir', [])).toEqual([]);
  });

  it('libellé par ligne · deux libellés différents au même élément ne sont pas des doublons · le même, si', () => {
    expect(nomsDeControles([['Voir', 'Lot #1'], ['Conclure', 'Lot #1'], ['Voir', 'Lot #1']])).toEqual(['Voir · Lot #1', 'Conclure · Lot #1', 'Voir · Lot #1 · n° 2']);
  });

  it('chaque nom construit contient son libellé visible, en tête', () => {
    for (const n of nomsDeLignes('Lancer comme itération', ['Prompt 1', 'Prompt 1', 'Prompt 2'])) expect(n.startsWith('Lancer comme itération · ')).toBe(true);
  });

  it('elementCourt · au plus `max` caractères, « … » en fin · un texte court passe tel quel', () => {
    expect(elementCourt('Si on tutoie, alors le clic tient.')).toBe('Si on tutoie, alors le clic tient.');
    const long = 'Si on passe au 9:16, alors le coût par achat baisse nettement, parce que le 9:16 occupe tout l’écran.';
    expect(elementCourt(long)).toHaveLength(60);
    expect(elementCourt(long).endsWith('…')).toBe(true);
    expect(elementCourt(long, 20)).toBe('Si on passe au 9:16…');
  });
});

describe('la garde pure · doublons et libellé visible', () => {
  it('deux noms égaux vers deux cibles · signalés · le même nom vers la même cible, ou deux noms différents · rien', () => {
    expect(controlesEnDouble([{ nom: 'Fiche', visible: 'Fiche', cible: 'lien /a' }, { nom: 'Fiche', visible: 'Fiche', cible: 'lien /b' }])).toEqual(['Fiche → lien /a | lien /b']);
    expect(controlesEnDouble([{ nom: 'Voir', visible: 'Voir', cible: 'lien /a' }, { nom: 'Voir', visible: 'Voir', cible: 'lien /a' }])).toEqual([]);
    expect(controlesEnDouble([{ nom: 'Fiche · V1', visible: 'Fiche', cible: 'lien /a' }, { nom: 'Fiche · V2', visible: 'Fiche', cible: 'lien /b' }])).toEqual([]);
    expect(controlesEnDouble([{ nom: 'Fait', visible: 'Fait', cible: 'bouton #1' }, { nom: 'Fait', visible: 'Fait', cible: 'bouton #4' }])).toHaveLength(1);
  });

  it('un nom qui ne contient pas le libellé visible · signalé · casse et espaces ignorés · un libellé sans lettre (« ← ») ignoré', () => {
    expect(nomsSansLibelleVisible([{ nom: 'Voir V3 sur le canvas', visible: 'Montrer sur le canvas', cible: 'bouton #1' }])).toEqual(['Voir V3 sur le canvas ⇐ Montrer sur le canvas']);
    expect(nomsSansLibelleVisible([{ nom: 'fiche ·  V3', visible: 'Fiche', cible: 'lien /a' }])).toEqual([]);
    expect(nomsSansLibelleVisible([{ nom: 'Déplacer à gauche', visible: '←', cible: 'bouton #2' }])).toEqual([]);
    expect(nomsSansLibelleVisible([{ nom: 'Fermer', visible: '', cible: 'bouton #3' }])).toEqual([]);
  });
});
