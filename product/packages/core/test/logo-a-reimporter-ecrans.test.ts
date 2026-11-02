import { describe, expect, it } from 'vitest';
import {
  AIDE_LOGO_SANS_GESTION, RAISONS_LOGO_CHARTE, annonceLogosAReimporter, bilanLogosCharte, cheminIdentiteMarque, logoParDefautAffiche,
  type VerificationEmpreinte,
} from '../src';

/**
 * Ailleurs que la fiche Identité · ce qu'un écran montre du logo par défaut
 * (vue d'ensemble, coquille, accueil) et l'annonce des Studios avant la
 * préparation payante · on lit le RÉSULTAT des règles, à partir du MÊME bilan
 * que la fiche (`bilanLogosCharte`).
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const U1 = 'https://cdn.exemple.test/bucket/assets/ws/1-ab-logo.png';
const U2 = 'https://cdn.exemple.test/bucket/assets/ws/2-cd-logo.png';
const bilan = (o: { defaut?: string | null; logos?: string[]; v: Record<string, VerificationEmpreinte | null> }) =>
  bilanLogosCharte({ logos: o.logos ?? [], defaut: o.defaut ?? null, empreintes: { [U1]: MD5, [U2]: MD5 }, verifications: new Map(Object.entries(o.v)) });
const REMPLACE = { ok: false, raison: 'remplace' } as const;
const ABSENT = { ok: false, raison: 'absent' } as const;
const INJOIGNABLE = { ok: false, raison: 'illisible' } as const;
const CONFORME = { ok: true, empreinte: MD5 } as const;

describe('logoParDefautAffiche · le logo par défaut ailleurs que la fiche', () => {
  it('rien de vérifié (logo sans empreinte, bilan absent) ou servi · l’image, aucun signal', () => {
    expect(logoParDefautAffiche({ bilan: null, brandId: 'b', peutGerer: true })).toEqual({ image: true, signal: null });
    expect(logoParDefautAffiche({ bilan: bilan({ defaut: U1, v: { [U1]: CONFORME } }), brandId: 'b', peutGerer: true })).toEqual({ image: true, signal: null });
  });
  it('remplacé · l’initiale et « Logo à réimporter », sa raison, le chemin vers l’Identité pour un admin', () => {
    expect(logoParDefautAffiche({ bilan: bilan({ defaut: U1, v: { [U1]: REMPLACE } }), brandId: 'b 1', peutGerer: true })).toEqual({
      image: false, signal: { libelle: 'Logo à réimporter', raison: RAISONS_LOGO_CHARTE.remplace, lien: '/brands/b%201/identite', aide: 'Réimporte-le dans l’Identité de la marque.' },
    });
  });
  it('disparu · même signal, raison « n’est plus dans le stockage »', () => {
    expect(logoParDefautAffiche({ bilan: bilan({ defaut: U1, v: { [U1]: ABSENT } }), brandId: 'b', peutGerer: true }).signal?.raison).toBe(RAISONS_LOGO_CHARTE.absent);
  });
  it('sans gestion de la marque · aucun lien (la fiche le renverrait), qui peut le faire', () => {
    expect(logoParDefautAffiche({ bilan: bilan({ defaut: U1, v: { [U1]: REMPLACE } }), brandId: 'b', peutGerer: false }).signal).toEqual({
      libelle: 'Logo à réimporter', raison: RAISONS_LOGO_CHARTE.remplace, lien: null, aide: AIDE_LOGO_SANS_GESTION,
    });
  });
  it('stockage injoignable · l’initiale, JAMAIS « à réimporter »', () => {
    expect(logoParDefautAffiche({ bilan: bilan({ defaut: U1, v: { [U1]: INJOIGNABLE } }), brandId: 'b', peutGerer: true })).toEqual({ image: false, signal: null });
  });
  it('une variante remplacée ne touche pas le logo par défaut', () => {
    expect(logoParDefautAffiche({ bilan: bilan({ defaut: U1, logos: [U1, U2], v: { [U1]: CONFORME, [U2]: REMPLACE } }), brandId: 'b', peutGerer: true })).toEqual({ image: true, signal: null });
  });
  it('le chemin de l’Identité', () => {
    expect(cheminIdentiteMarque('abc')).toBe('/brands/abc/identite');
  });
});

describe('annonceLogosAReimporter · Studios, avant la préparation payante', () => {
  const logos = [{ assetId: 'logo_1', url: U1, libelle: 'Logo principal' }, { assetId: 'logo_2', url: U2, libelle: 'Logo · variante 1' }];
  const tous = bilan({ logos: [U1, U2], v: { [U1]: REMPLACE, [U2]: REMPLACE } });

  it('seul un logo UTILISÉ est annoncé · un logo de la charte non lié ne concerne pas ce visuel', () => {
    expect(annonceLogosAReimporter({ utilises: [], logos, bilan: tous, brandId: 'b', peutGerer: true })).toBeNull();
    const a = annonceLogosAReimporter({ utilises: ['pph_x', 'logo_2'], logos, bilan: tous, brandId: 'b', peutGerer: true });
    expect(a?.logos).toEqual([{ assetId: 'logo_2', libelle: 'Logo · variante 1' }]);
  });
  it('un logo : le message dit lequel, la conséquence et quoi faire avant de préparer ; lien Identité pour un admin', () => {
    expect(annonceLogosAReimporter({ utilises: ['logo_1'], logos, bilan: tous, brandId: 'b', peutGerer: true })).toEqual({
      logos: [{ assetId: 'logo_1', libelle: 'Logo principal' }], lien: '/brands/b/identite',
      message: 'Logo à réimporter · « Logo principal » : son fichier a été remplacé ou n’est plus dans le stockage depuis l’import. Il ne sera pas envoyé au fournisseur d’images et une consigne qui le lie ne pourra pas être générée · réimporte-le dans l’Identité de la marque avant de préparer ton visuel.',
    });
  });
  it('plusieurs logos · au pluriel, chacun une fois', () => {
    const a = annonceLogosAReimporter({ utilises: ['logo_1', 'logo_2', 'logo_1'], logos: [...logos, logos[0]!], bilan: tous, brandId: 'b', peutGerer: true });
    expect(a?.logos.map((l) => l.assetId)).toEqual(['logo_1', 'logo_2']);
    expect(a?.message).toMatch(/^Logos à réimporter · « Logo principal », « Logo · variante 1 » : leurs fichiers ont été remplacés ou ne sont plus dans le stockage/);
    expect(a?.message).toContain('réimporte-les dans l’Identité');
  });
  it('sans gestion · aucun lien, qui peut le faire', () => {
    const a = annonceLogosAReimporter({ utilises: ['logo_1'], logos, bilan: tous, brandId: 'b', peutGerer: false });
    expect(a?.lien).toBeNull();
    expect(a?.message).toContain('un administrateur de l’espace peut le faire dans l’Identité de la marque.');
  });
  it('servi, ou injoignable · rien n’est annoncé (le devis relira)', () => {
    expect(annonceLogosAReimporter({ utilises: ['logo_1'], logos, bilan: bilan({ logos: [U1], v: { [U1]: CONFORME } }), brandId: 'b', peutGerer: true })).toBeNull();
    expect(annonceLogosAReimporter({ utilises: ['logo_1'], logos, bilan: bilan({ logos: [U1], v: { [U1]: INJOIGNABLE } }), brandId: 'b', peutGerer: true })).toBeNull();
  });
  it('textes d’écran · sans tiret cadratin', () => {
    const a = annonceLogosAReimporter({ utilises: ['logo_1', 'logo_2'], logos, bilan: tous, brandId: 'b', peutGerer: false })!;
    for (const t of [a.message, AIDE_LOGO_SANS_GESTION]) expect(t).not.toContain('—');
  });
});
