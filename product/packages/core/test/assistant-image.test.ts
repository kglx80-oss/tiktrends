import { describe, it, expect } from 'vitest';
import {
  ETAPES_IMAGE, manqueImage, etapeImageComplete, etapeImageAccessible,
  premiereImageIncomplete, peutGenererImage, etapeImageSuivante, recapitulatifImage,
  type EtatAssistantImage,
} from '../src/assistant-image';

const base: EtatAssistantImage = {
  mode: 'i2i', aPhotoProduit: true, description: 'un thé sur une table', direction: '', ratio: '1:1', nombre: 1, moteur: 'nano',
};
const etat = (o: Partial<EtatAssistantImage> = {}): EtatAssistantImage => ({ ...base, ...o });

describe('l’assistant Image avance une décision à la fois', () => {
  it('les étapes sont ordonnées · produit, scène, style, volume', () => {
    expect([...ETAPES_IMAGE]).toEqual(['produit', 'scene', 'style', 'volume']);
  });

  it('un état complet peut générer', () => {
    expect(peutGenererImage(etat())).toBe(true);
    expect(premiereImageIncomplete(etat())).toBeNull();
  });
});

describe('chaque étape sait dire ce qui lui manque', () => {
  it('mise en scène sans photo · l’étape produit le dit, et propose l’issue', () => {
    const s = etat({ aPhotoProduit: false });
    expect(manqueImage('produit', s)).toContain('photo');
    expect(etapeImageComplete('produit', s)).toBe(false);
    // La première incomplète est bien « produit » · on ne saute pas.
    expect(premiereImageIncomplete(s)).toBe('produit');
  });

  it('texte → image ne réclame aucune photo', () => {
    expect(manqueImage('produit', etat({ mode: 't2i', aPhotoProduit: false }))).toBe('');
  });

  it('une scène vide bloque à l’étape scène', () => {
    const s = etat({ description: '   ' });
    expect(manqueImage('scene', s)).toContain('cris');
    expect(premiereImageIncomplete(s)).toBe('scene');
  });

  it('le style ne réclame rien · « Variées » est un choix', () => {
    expect(manqueImage('style', etat({ direction: '' }))).toBe('');
  });

  it('le volume exige un moteur et un nombre valable', () => {
    expect(manqueImage('volume', etat({ moteur: '' }))).toContain('moteur');
    expect(manqueImage('volume', etat({ nombre: 0 }))).toContain('combien');
  });
});

describe('on ne saute pas une étape non faite', () => {
  it('« style » n’est accessible qu’une fois produit et scène faits', () => {
    expect(etapeImageAccessible('style', etat({ description: '' }))).toBe(false);
    expect(etapeImageAccessible('style', etat())).toBe(true);
  });

  it('l’étape suivante avance d’un cran, jamais plus', () => {
    expect(etapeImageSuivante('produit')).toBe('scene');
    expect(etapeImageSuivante('volume')).toBeNull();
  });
});

describe('le récapitulatif relit avant de payer', () => {
  it('nomme la scène, la direction et le volume', () => {
    const r = recapitulatifImage(etat({ nombre: 3 }), { direction: 'Studio packshot', moteur: 'Nano Banana' });
    expect(r.find((l) => l.etape === 'style')!.valeur).toBe('Studio packshot');
    expect(r.find((l) => l.etape === 'volume')!.valeur).toContain('3 visuel');
    expect(r.find((l) => l.etape === 'volume')!.valeur).toContain('Nano Banana');
  });

  it('en texte → image, le produit se lit « sans photo »', () => {
    const r = recapitulatifImage(etat({ mode: 't2i', aPhotoProduit: false }), {});
    expect(r.find((l) => l.etape === 'produit')!.valeur.toLowerCase()).toContain('texte');
  });
});
