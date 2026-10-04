import { describe, expect, it } from 'vitest';
import { encartMetaAnalytics, etatConnecteur, PHASE_CONNECTEUR_LABEL } from '../src';

/** Recette #106b · l'encart Meta d'Analytics suit la même phase que Connexions. */
describe('encartMetaAnalytics', () => {
  it('à brancher · seule phase qui invite à connecter', () => {
    expect(encartMetaAnalytics('a_brancher')?.cta.libelle).toBe('Connecter Meta Ads ›');
    for (const p of ['compte_a_choisir', 'connecte_sans_donnees'] as const) {
      expect(encartMetaAnalytics(p)?.cta.libelle, `« ${PHASE_CONNECTEUR_LABEL[p]} » invite encore à connecter`).not.toMatch(/Connecter/);
      expect(encartMetaAnalytics(p)?.cta.href).toBe('/connections');
    }
  });
  it('connecté sans données · dit que la première synchronisation est en attente', () => {
    expect(encartMetaAnalytics(etatConnecteur({ connecte: true, donnees: false }))?.titre).toMatch(/première synchronisation en attente/);
  });
  it('opérationnel · pas d’encart (les KPI s’affichent)', () => {
    expect(encartMetaAnalytics(etatConnecteur({ connecte: true, donnees: true }))).toBeNull();
  });
});
