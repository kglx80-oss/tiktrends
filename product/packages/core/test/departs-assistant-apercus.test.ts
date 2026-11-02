import { describe, expect, it } from 'vitest';
import {
  apercuSauvegardeVeille, imageAffichable, lienAdAffiche, mediaAdDemande, ORIGINES_DEPART_ASSISTANT, routeApercuAdAdsmap, sourceMediaAd, vignetteAdAffichee, vignetteSourceAd,
} from '../src';

/** Les aperçus des départs de l'assistant · une projection d'affichage, jamais une adresse signée ni brute du stockage. */
describe('départs de l’assistant · ce que le navigateur reçoit', () => {
  const AD = '0b3c9a52-2f1e-4c1b-9a8e-1d2c3b4a5f60';

  it('la liste des départs fait foi · ni doublon, ni vide', () => {
    expect(ORIGINES_DEPART_ASSISTANT.length).toBeGreaterThan(0);
    expect(new Set(ORIGINES_DEPART_ASSISTANT).size).toBe(ORIGINES_DEPART_ASSISTANT.length);
  });

  it('un « Lien de l’Ad » rangé au stockage passe par la route gardée de l’ad · adresse stable, sans clé', () => {
    const vu = lienAdAffiche(AD, 'https://stockage.exemple/tt/assets/ws/1700-ab-gagnante.png', true);
    expect(vu).toBe(`/api/adsmap/${AD}/apercu`);
    expect(vu).toBe(routeApercuAdAdsmap(AD));
    expect(vu).not.toContain('assets/');
  });

  it('un lien externe ou un libellé est rendu tel qu’il a été saisi · aucun lien, aucun aperçu', () => {
    expect(lienAdAffiche(AD, 'https://drive.google.com/file/d/x/view', false)).toBe('https://drive.google.com/file/d/x/view');
    expect(lienAdAffiche(AD, 'Dossier Drive « Juin »', false)).toBe('Dossier Drive « Juin »');
    expect(lienAdAffiche(AD, null, false)).toBeNull();
    expect(lienAdAffiche(AD, '', true)).toBeNull();
  });

  it('la route encode l’identifiant · un identifiant hostile ne sort pas du chemin', () => {
    expect(routeApercuAdAdsmap('../x?y')).toBe('/api/adsmap/..%2Fx%3Fy/apercu');
  });

  it('une sauvegarde Veille · vignette de régie telle quelle, objet du stockage sans aperçu (jamais signé)', () => {
    expect(apercuSauvegardeVeille('https://scontent.cdn.exemple/v.jpg', false)).toBe('https://scontent.cdn.exemple/v.jpg');
    expect(apercuSauvegardeVeille('https://stockage.exemple/tt/assets/ws/1700-ab-v.png', true)).toBeNull();
    expect(apercuSauvegardeVeille(null, false)).toBeNull();
  });

  const STOCKAGE = 'https://stockage.exemple/tt/assets/ws/';
  const estObjet = (u: string) => u.startsWith(STOCKAGE);

  it('la route d’un média · `lien` sans paramètre (adresse #1015 inchangée), `vignette` et `brief` nommés · tout autre paramètre refusé', () => {
    expect(routeApercuAdAdsmap(AD, 'lien')).toBe(`/api/adsmap/${AD}/apercu`);
    expect(routeApercuAdAdsmap(AD, 'vignette')).toBe(`/api/adsmap/${AD}/apercu?media=vignette`);
    expect(routeApercuAdAdsmap(AD, 'brief')).toBe(`/api/adsmap/${AD}/apercu?media=brief`);
    expect([null, 'lien', 'vignette', 'brief', 'autre', ''].map(mediaAdDemande)).toEqual(['lien', 'lien', 'vignette', 'brief', null, null]);
  });

  it('la vignette d’une ad · miniature de la créa, puis son fichier, puis le lien de l’ad · jamais une page de partage ni un libellé', () => {
    expect(vignetteSourceAd({ miniature: `${STOCKAGE}mini.jpg`, fichier: `${STOCKAGE}f.png`, lien: `${STOCKAGE}ad.png` })).toBe(`${STOCKAGE}mini.jpg`);
    expect(vignetteSourceAd({ miniature: null, fichier: `${STOCKAGE}f.png`, lien: `${STOCKAGE}ad.png` })).toBe(`${STOCKAGE}f.png`);
    expect(vignetteSourceAd({ miniature: 'https://drive.google.com/file/d/x/view', lien: `${STOCKAGE}ad.png` })).toBe(`${STOCKAGE}ad.png`);
    expect(vignetteSourceAd({ lien: 'Dossier Drive « Juin »' })).toBeNull();
    expect(sourceMediaAd('vignette', { miniature: `${STOCKAGE}mini.jpg`, lien: `${STOCKAGE}ad.png` }), 'la route sert la même vignette que l’écran').toBe(`${STOCKAGE}mini.jpg`);
    expect(sourceMediaAd('lien', { miniature: `${STOCKAGE}mini.jpg`, lien: ` ${STOCKAGE}ad.png ` })).toBe(`${STOCKAGE}ad.png`);
    expect(sourceMediaAd('brief', { lien: `${STOCKAGE}ad.png`, brief: `${STOCKAGE}brief.png` })).toBe(`${STOCKAGE}brief.png`);
    expect(sourceMediaAd('brief', { lien: `${STOCKAGE}ad.png`, brief: '  ' })).toBeNull();
  });

  it('la vignette affichée · un objet du stockage passe par la route gardée (`?media=vignette`), une image de régie telle quelle, rien d’ouvrable · null', () => {
    const vue = vignetteAdAffichee(AD, { miniature: `${STOCKAGE}mini.jpg`, lien: 'https://cdn.regie.exemple/ad.jpg' }, estObjet);
    expect(vue).toBe(`/api/adsmap/${AD}/apercu?media=vignette`);
    expect(vue).not.toContain('assets/');
    expect(vignetteAdAffichee(AD, { miniature: 'https://cdn.regie.exemple/mini.jpg', lien: `${STOCKAGE}ad.png` }, estObjet)).toBe('https://cdn.regie.exemple/mini.jpg');
    expect(vignetteAdAffichee(AD, { lien: 'https://drive.google.com/file/d/x/view' }, estObjet)).toBeNull();
  });

  it('le brief affiché · objet du stockage par la route gardée (`?media=brief`), lien externe tel quel', () => {
    expect(lienAdAffiche(AD, `${STOCKAGE}brief.png`, true, 'brief')).toBe(`/api/adsmap/${AD}/apercu?media=brief`);
    expect(lienAdAffiche(AD, 'https://docs.google.com/document/d/b', false, 'brief')).toBe('https://docs.google.com/document/d/b');
  });

  it('une image affichable · la route de l’application passe telle quelle, jamais une adresse protocole-relative ; sinon une adresse ouvrable', () => {
    expect(imageAffichable(`/api/adsmap/${AD}/apercu?media=vignette`)).toBe(`/api/adsmap/${AD}/apercu?media=vignette`);
    expect(imageAffichable('//hote.exemple/x.png')).toBeNull();
    expect(imageAffichable('/\\hote.exemple/x.png')).toBeNull();
    expect(imageAffichable('https://cdn.regie.exemple/v.jpg')).toBe('https://cdn.regie.exemple/v.jpg');
    expect(imageAffichable('https://drive.google.com/file/d/x/view')).toBeNull();
    expect(imageAffichable('Dossier')).toBeNull();
    expect(imageAffichable(null)).toBeNull();
  });
});
