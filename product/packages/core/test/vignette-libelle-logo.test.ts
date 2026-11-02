import { describe, expect, it } from 'vitest';
import { AIDE_LOGO_SANS_GESTION, RAISONS_LOGO_CHARTE, bilanLogosCharte, libelleLogoCharte, vignetteMarqueAffichee, type VerificationEmpreinte } from '../src';

/**
 * Deux règles de l'affichage d'un logo (garde globale `adresses-brutes-pages-db`) ·
 * on lit le RÉSULTAT.
 *  · Veille · Formats · un logo par défaut NON servi laisse l'initiale de la
 *    marque et, s'il est à réimporter, le signal · plus de miniature vide ;
 *  · Identité · un logo importé se nomme par son fichier, jamais par
 *    l'adresse privée du stockage.
 */
const MD5 = 'd41d8cd98f00b204e9800998ecf8427e';
const LOGO = 'https://cdn.exemple.test/bucket/assets/ws/1700000000000-abcd1234-logo.png';
const PHOTO = 'https://cdn.exemple.test/bucket/assets/ws/2-cd-produit.png';
const bilan = (v: VerificationEmpreinte | null) => bilanLogosCharte({ logos: [LOGO], defaut: LOGO, empreintes: { [LOGO]: MD5 }, verifications: new Map([[LOGO, v]]) });
const base = { brandId: 'b1', nom: '  maison Aurore', photoProduit: null, logo: LOGO, peutGerer: false };

describe('vignetteMarqueAffichee · Veille · Formats', () => {
  it('une photo produit passe d’abord · ni initiale ni signal, même avec un logo remplacé', () => {
    expect(vignetteMarqueAffichee({ ...base, photoProduit: PHOTO, bilanLogo: bilan({ ok: false, raison: 'remplace' }) })).toEqual({ image: { source: 'produit', url: PHOTO }, initiale: null, signal: null });
  });
  it('logo servi (intact, ou sans empreinte) · son image, ni initiale ni signal', () => {
    expect(vignetteMarqueAffichee({ ...base, bilanLogo: bilan({ ok: true, empreinte: MD5 }) })).toEqual({ image: { source: 'logo', url: LOGO }, initiale: null, signal: null });
    expect(vignetteMarqueAffichee({ ...base, bilanLogo: null })).toEqual({ image: { source: 'logo', url: LOGO }, initiale: null, signal: null });
  });
  it('logo REMPLACÉ · l’initiale de la marque et le signal « Logo à réimporter », avec la raison · sans lien pour qui ne gère pas', () => {
    expect(vignetteMarqueAffichee({ ...base, bilanLogo: bilan({ ok: false, raison: 'remplace' }) })).toEqual({
      image: null, initiale: 'M',
      signal: { libelle: 'Logo à réimporter', raison: RAISONS_LOGO_CHARTE.remplace, lien: null, aide: AIDE_LOGO_SANS_GESTION },
    });
  });
  it('logo REMPLACÉ, administrateur · le signal mène à l’Identité', () => {
    expect(vignetteMarqueAffichee({ ...base, peutGerer: true, bilanLogo: bilan({ ok: false, raison: 'absent' }) }).signal?.lien).toBe('/brands/b1/identite');
  });
  it('logo non vérifiable (indisponible) · l’initiale, aucun signal (le devis le relira)', () => {
    expect(vignetteMarqueAffichee({ ...base, bilanLogo: bilan(null) })).toEqual({ image: null, initiale: 'M', signal: null });
  });
  it('ni photo ni logo · rien (le repli de la miniature, inchangé)', () => {
    expect(vignetteMarqueAffichee({ ...base, logo: null, bilanLogo: null })).toEqual({ image: null, initiale: null, signal: null });
  });
});

describe('libelleLogoCharte · Identité', () => {
  it('un objet du stockage · « Logo importé · <fichier> », sans le préfixe du dépôt ni l’adresse', () => {
    expect(libelleLogoCharte(LOGO, 'assets/ws/1700000000000-abcd1234-logo.png')).toBe('Logo importé · logo.png');
    expect(libelleLogoCharte(LOGO, 'assets/ws/drive-1AbC.png')).toBe('Logo importé · drive-1AbC.png');
    expect(libelleLogoCharte(LOGO, 'assets/ws/')).toBe('Logo importé');
  });
  it('une adresse externe · montrée sans son schéma, comme avant', () => {
    expect(libelleLogoCharte('https://site.exemple.fr/logo.png', null)).toBe('site.exemple.fr/logo.png');
    expect(libelleLogoCharte('http://site.exemple.fr/l.svg', undefined)).toBe('site.exemple.fr/l.svg');
  });
});
