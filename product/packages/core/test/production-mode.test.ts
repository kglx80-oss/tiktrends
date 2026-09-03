import { describe, expect, it } from 'vitest';
import {
  PRODUCTION_MODES, PRODUCTION_LABEL, PRODUCTION_RESUME, coquilleUtile, estMode,
  garanties, poseUneCouche, promptPubEntiere, reserves, texteAttenduDansImage,
} from '../src/production-mode';

const copie = {
  kicker: '3 ACTIONS 1 GESTE',
  headline: 'L’eau nickel, sans y penser',
  benefits: ['Anti-algues + clarifiant', 'Désinfectant + anti-UV', 'Résultat visible en 24h'],
  cta: 'Je teste Klorea',
  brandName: 'KLOREA',
};

describe('chaque mode dit ce qu’il tient et ce qu’il ne tient pas', () => {
  it('les deux ont un libellé, un résumé, des garanties et des réserves', () => {
    for (const m of PRODUCTION_MODES) {
      expect(PRODUCTION_LABEL[m], m).toBeTruthy();
      expect(PRODUCTION_RESUME[m], m).toBeTruthy();
      expect(garanties(m).length, m).toBeGreaterThan(0);
      expect(reserves(m).length, m).toBeGreaterThan(0);
    }
  });

  it('aucun mode ne prétend tout garantir', () => {
    // Un mode sans réserve serait un argument de vente, pas une description.
    for (const m of PRODUCTION_MODES) {
      expect(reserves(m).length, m).toBeGreaterThan(0);
    }
  });

  it('seule la composition garantit les textes', () => {
    // C'est LA raison de garder les deux · un modèle d'images écrit juste le
    // plus souvent, pas toujours.
    expect(garanties('composee').join(' ')).toContain('exacts');
    expect(garanties('entiere').join(' ')).not.toContain('exacts');
    expect(reserves('entiere').join(' ')).toContain('trompe');
  });

  it('les deux garantissent la fidélité du produit', () => {
    // C'est le point éliminatoire · un mode qui ne le tient pas n'a rien à
    // faire dans la liste.
    for (const m of PRODUCTION_MODES) {
      expect(garanties(m).join(' '), m).toContain('produit');
    }
  });
});

describe('ce que le mode décide en aval', () => {
  it('une pub entière ne reçoit pas de couche de texte', () => {
    // Lui superposer nos mots les écrirait deux fois, l'un sur l'autre.
    expect(poseUneCouche('entiere')).toBe(false);
    expect(poseUneCouche('composee')).toBe(true);
  });

  it('une recette sans mode se compose, comme avant', () => {
    // Les publicités d'avant n'en portent pas · elles ne doivent pas changer
    // d'allure parce qu'on a ajouté un mode.
    expect(poseUneCouche(null)).toBe(true);
    expect(poseUneCouche(undefined)).toBe(true);
  });

  it('le texte dans l’image est attendu en mode entier, et seulement là', () => {
    // Signaler « du texte est cuit dans l'image » sur une pub entière
    // transformerait la réussite en alerte.
    expect(texteAttenduDansImage('entiere')).toBe(true);
    expect(texteAttenduDansImage('composee')).toBe(false);
    expect(texteAttenduDansImage(null)).toBe(false);
  });

  it('la coquille n’a plus de sens en mode entier', () => {
    // Un réglage sans effet est pire qu'un réglage absent · on croit avoir dirigé.
    expect(coquilleUtile('entiere')).toBe(false);
    expect(coquilleUtile('composee')).toBe(true);
  });

  it('reconnaît ce qui vient du navigateur', () => {
    expect(estMode('entiere')).toBe(true);
    expect(estMode('nimporte')).toBe(false);
    expect(estMode(null)).toBe(false);
  });
});

describe('la consigne de publicité entière', () => {
  const p = promptPubEntiere({ copie, sceneBrief: 'bottle on a pool edge', avecProduit: true });

  it('reproduit chaque chaîne exactement, sans en décrire aucune', () => {
    // Un modèle à qui on DÉCRIT une accroche en invente une autre · la copie
    // écrite par Jarvis serait remplacée par une phrase quelconque.
    expect(p).toContain('L’eau nickel, sans y penser');
    expect(p).toContain('3 ACTIONS 1 GESTE');
    expect(p).toContain('Je teste Klorea');
    for (const b of copie.benefits) expect(p).toContain(b);
    expect(p).toMatch(/exactly, character for character/i);
  });

  it('verrouille l’étiquette, pas seulement « le produit »', () => {
    // « Garde le produit » s'interprète comme « garde l'idée du produit ».
    expect(p).toMatch(/label text and its typography/i);
    expect(p).toMatch(/do not redraw, restyle, translate or paraphrase/i);
  });

  it('rappelle le français et ses accents', () => {
    expect(p).toMatch(/FRENCH with all accents/i);
  });

  it('interdit d’ajouter du texte non demandé', () => {
    // Sinon le modèle invente un slogan, un prix, une mention légale.
    expect(p).toMatch(/Do NOT add any text that is not listed/i);
  });

  it('ne dicte pas de coordonnées de mise en page', () => {
    // Le modèle en compose une meilleure que celle qu'on lui dicterait · c'est
    // la raison d'être de ce mode.
    expect(p).not.toMatch(/\b(top left corner|bottom third|x:|y:|pixels?)\b/i);
    expect(p).toMatch(/headline dominates/i);
  });

  it('ne demande pas les champs vides', () => {
    const nu = promptPubEntiere({ copie: { headline: 'Seule' }, sceneBrief: 'x', avecProduit: false });
    expect(nu).not.toMatch(/call-to-action button:/);
    expect(nu).not.toMatch(/offer badge:/);
    expect(nu).toContain('Seule');
  });

  it('dit quand il n’y a pas de photo produit', () => {
    const sans = promptPubEntiere({ copie, sceneBrief: 'x', avecProduit: false });
    expect(sans).toMatch(/No product photo is provided/i);
    expect(sans).not.toMatch(/EXACT product/i);
  });

  it('n’envoie jamais plus de trois bénéfices', () => {
    const trop = promptPubEntiere({
      copie: { ...copie, benefits: ['a', 'b', 'c', 'd', 'e'] }, sceneBrief: 'x', avecProduit: true,
    });
    expect(trop).not.toContain('bullet 4');
  });
});
