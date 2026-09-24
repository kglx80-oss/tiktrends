import { describe, expect, it, beforeEach } from 'vitest';
import { equipeDepuisLignes } from '../lib/equipe-plateforme';
import { effectiveAccess } from '../lib/access';
import { unlimitedCredits, noterCreditsStaff } from '../lib/credits';

/**
 * PR 4 · le rôle d'ÉQUIPE entre dans la session et prend effet.
 *
 * On éprouve le RÉSULTAT des trois pièces câblées, sans base :
 *  - `equipeDepuisLignes` (façonnage pur : filet fondateur, accès total = matrice
 *    vide, rôle gradé = matrice portée, inconnu = null) ;
 *  - `effectiveAccess` (equipe présent → `Access.equipe` posé ; accès total →
 *    formule forcée business ; client inchangé) ;
 *  - le registre de crédits auto-cicatrisant (inscription / retrait).
 *
 * Un fondateur codé en dur du dépôt · voir lib/founder (FONDATEURS).
 */
const FOND = 'kguilbaux@agence-glx.fr';
const AUTRE = 'personne@exemple.fr';

describe('equipeDepuisLignes · façonnage', () => {
  it('fondateur sans ligne staff → adminplus, matrice vide (filet)', () => {
    const e = equipeDepuisLignes(FOND, null, []);
    expect(e).toEqual({ role: 'adminplus', matrice: {} });
  });

  it('accès total (admin) → matrice VIDE quelles que soient les lignes de droits', () => {
    const e = equipeDepuisLignes(AUTRE, 'admin', [{ role: 'membre', rubriques: ['studio'] }]);
    expect(e).toEqual({ role: 'admin', matrice: {} });
  });

  it('rôle gradé → matrice portée telle quelle (rôle → rubriques)', () => {
    const e = equipeDepuisLignes(AUTRE, 'membre', [
      { role: 'membre', rubriques: ['studio', 'adsmap'] },
      { role: 'dev', rubriques: null },
    ]);
    expect(e).toEqual({ role: 'membre', matrice: { membre: ['studio', 'adsmap'], dev: [] } });
  });

  it('ni staff ni fondateur → null (compte client)', () => {
    expect(equipeDepuisLignes(AUTRE, null, [])).toBeNull();
  });
});

describe('effectiveAccess · equipe prime, client inchangé', () => {
  it('client (equipe absent) → pas de face équipe, formule conservée', () => {
    const a = effectiveAccess({ role: 'member', plan: 'core', user: { email: AUTRE } });
    expect(a.equipe).toBeUndefined();
    expect(a.plan).toBe('core');
  });

  it('équipe à accès total → Access.equipe posé + formule forcée business', () => {
    const a = effectiveAccess({
      role: 'client_viewer', plan: 'starter', user: { email: AUTRE },
      equipe: { role: 'admin', matrice: {} },
    });
    expect(a.equipe).toEqual({ role: 'admin', matrice: {} });
    expect(a.plan).toBe('business');
  });

  it('équipe gradée (non fondateur) → Access.equipe posé, formule de l’espace conservée', () => {
    const a = effectiveAccess({
      role: 'client_viewer', plan: 'starter', user: { email: AUTRE },
      equipe: { role: 'membre', matrice: {} },
    });
    expect(a.equipe).toEqual({ role: 'membre', matrice: {} });
    expect(a.plan).toBe('starter');
  });
});

describe('crédits · registre équipe auto-cicatrisant', () => {
  beforeEach(() => noterCreditsStaff(AUTRE, false)); // état propre

  it('un fondateur est illimité sans inscription', () => {
    expect(unlimitedCredits(FOND)).toBe(true);
  });

  it('un client non inscrit n’est pas illimité', () => {
    expect(unlimitedCredits(AUTRE)).toBe(false);
  });

  it('inscription → illimité ; retrait (rétrogradation) → plus illimité', () => {
    noterCreditsStaff(AUTRE, true);
    expect(unlimitedCredits(AUTRE)).toBe(true);
    noterCreditsStaff(AUTRE, false);
    expect(unlimitedCredits(AUTRE)).toBe(false);
  });
});
