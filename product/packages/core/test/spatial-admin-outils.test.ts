import { describe, expect, it } from 'vitest';
import { LARGEUR_MIN_TABLE_TELEPHONE, etatDeploiementAdmin, etatEssaiAdmin, styleTableDefilante, type DeploymentState } from '../src';

const etat = (o: Partial<DeploymentState>): DeploymentState => ({ renderVersion: 1, build: 'abc', inBuild: 10, applied: 10, behind: 0, ahead: false, codeIdentifie: true, ok: true, summary: '', ...o } as DeploymentState);

describe('Spatial · Admin · outils de la plateforme (vague 3)', () => {
  it('le diagnostic de déploiement dit un mot · jamais « à jour » quand le commit est inconnu', () => {
    expect(etatDeploiementAdmin(etat({}))).toEqual({ libelle: 'Schéma à jour · commit identifié', classe: 'g' });
    expect(etatDeploiementAdmin(etat({ ok: false, applied: null, behind: null }))).toEqual({ libelle: 'État illisible', classe: '' });
    expect(etatDeploiementAdmin(etat({ ok: false, behind: 2 }))).toEqual({ libelle: 'Migrations en attente', classe: 'r' });
    expect(etatDeploiementAdmin(etat({ ok: false, ahead: true }))).toEqual({ libelle: 'Base en avance', classe: 'w' });
    expect(etatDeploiementAdmin(etat({ ok: false, build: null, codeIdentifie: false }))).toEqual({ libelle: 'Schéma à jour · code non identifié', classe: 'w' });
  });

  it('l’état d’essai d’un compte de test', () => {
    expect(etatEssaiAdmin({ expired: false, daysLeft: null })).toEqual({ texte: 'Aucun', classe: '' });
    expect(etatEssaiAdmin({ expired: true, daysLeft: 0 })).toEqual({ texte: 'Expiré', classe: 'r' });
    expect(etatEssaiAdmin({ expired: false, daysLeft: 3 })).toEqual({ texte: '3 j restants', classe: 'w' });
    expect(etatEssaiAdmin({ expired: false, daysLeft: 1 })).toEqual({ texte: '1 j restant', classe: 'w' });
    expect(etatEssaiAdmin({ expired: false, daysLeft: 9 })).toEqual({ texte: '9 j restants', classe: 'g' });
  });

  it('une table défilante · colonne unique à largeur minimale, au-delà de l’écran d’un téléphone', () => {
    expect(styleTableDefilante(720)).toEqual({ overflowX: 'auto', gridTemplateColumns: 'minmax(720px, 1fr)' });
    expect(styleTableDefilante(-3).gridTemplateColumns).toBe('minmax(0px, 1fr)');
    // Les largeurs retenues dépassent la zone utile d'un écran de 390 px (~294 px) et la plus petite cellule mesurée (≥ 64 px).
    for (const v of Object.values(LARGEUR_MIN_TABLE_TELEPHONE)) expect(v).toBeGreaterThanOrEqual(640);
    // Planche v4 · G18 · le profil déclaré défilait de 34 px à 1280 (zone utile mesurée · 866 px) et rognait « Onboardé ».
    expect(LARGEUR_MIN_TABLE_TELEPHONE.declarations).toBeLessThanOrEqual(866);
  });
});
