import { describe, expect, it } from 'vitest';
import { apercuSauvegardeVeille, lienAdAffiche, ORIGINES_DEPART_ASSISTANT, routeApercuAdAdsmap } from '../src';

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
});
