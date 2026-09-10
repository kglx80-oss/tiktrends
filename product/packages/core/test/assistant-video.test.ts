import { describe, it, expect } from 'vitest';
import {
  ETAPES_VIDEO, manqueVideo, etapeVideoComplete, etapeVideoAccessible,
  premiereVideoIncomplete, peutGenererVideo, etapeVideoSuivante, recapitulatifVideo,
  type EtatAssistantVideo,
} from '../src/assistant-video';

const base: EtatAssistantVideo = { mode: 'i2v', imagePrete: true, description: 'léger zoom', ratio: '9:16', duree: 5 };
const etat = (o: Partial<EtatAssistantVideo> = {}): EtatAssistantVideo => ({ ...base, ...o });

describe('l’assistant Vidéo avance une décision à la fois', () => {
  it('les étapes sont ordonnées · départ, mouvement, format', () => {
    expect([...ETAPES_VIDEO]).toEqual(['depart', 'mouvement', 'format']);
  });

  it('un état complet peut générer', () => {
    expect(peutGenererVideo(etat())).toBe(true);
  });
});

describe('chaque étape sait dire ce qui lui manque', () => {
  it('animer une image sans image · l’étape départ le dit', () => {
    const s = etat({ mode: 'i2v', imagePrete: false });
    expect(manqueVideo('depart', s)).toContain('image de départ');
    expect(premiereVideoIncomplete(s)).toBe('depart');
  });

  it('texte → vidéo ne réclame pas d’image', () => {
    expect(manqueVideo('depart', etat({ mode: 't2v', imagePrete: false }))).toBe('');
  });

  it('texte → vidéo exige une description', () => {
    expect(manqueVideo('mouvement', etat({ mode: 't2v', description: '' }))).toContain('cris');
  });

  it('animer une image accepte un mouvement libre · rien à exiger', () => {
    expect(manqueVideo('mouvement', etat({ mode: 'i2v', description: '' }))).toBe('');
  });

  it('une durée nulle bloque au format', () => {
    expect(manqueVideo('format', etat({ duree: 0 }))).toContain('durée');
  });
});

describe('on ne saute pas une étape non faite', () => {
  it('le format n’est accessible qu’une fois départ et mouvement faits', () => {
    expect(etapeVideoAccessible('format', etat({ mode: 't2v', description: '' }))).toBe(false);
    expect(etapeVideoAccessible('format', etat({ mode: 't2v', description: 'un plan' }))).toBe(true);
  });

  it('l’étape suivante avance d’un cran', () => {
    expect(etapeVideoSuivante('depart')).toBe('mouvement');
    expect(etapeVideoSuivante('format')).toBeNull();
  });
});

describe('le récapitulatif relit avant de payer', () => {
  it('nomme le départ, le mouvement et le format', () => {
    const r = recapitulatifVideo(etat({ ratio: '1:1', duree: 10 }));
    expect(r.find((l) => l.etape === 'format')!.valeur).toContain('1:1');
    expect(r.find((l) => l.etape === 'format')!.valeur).toContain('10 s');
  });

  it('en i2v sans description, le mouvement se lit « libre »', () => {
    expect(recapitulatifVideo(etat({ mode: 'i2v', description: '' })).find((l) => l.etape === 'mouvement')!.valeur.toLowerCase()).toContain('libre');
  });
});
