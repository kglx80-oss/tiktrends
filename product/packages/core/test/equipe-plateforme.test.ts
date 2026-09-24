import { describe, expect, it } from 'vitest';
import {
  ROLES_PLATEFORME, ROLES_ACCES_TOTAL, ROLES_MATRICIELS, CLES_RUBRIQUES, DROITS_DEFAUT,
  accesTotal, creditIllimitePourRole, roleVoitRubrique, rubriquesDuRole,
  estRolePlateforme, estRoleMatriciel, nettoyerRubriques,
  type RolePlateforme,
} from '../src/equipe-plateforme';

/**
 * Les droits de l'équipe plateforme · on vérifie le RÉSULTAT (« ce rôle voit-il
 * cette rubrique ? »), pas la forme des tables. Un système de droits est
 * exactement le genre de code où une faute ouvre un accès de trop ou en ferme un
 * de trop · on cloue donc les deux bords : l'accès total voit tout quoi qu'on
 * fasse, et la lecture ne voit que ce qui est en lecture.
 */

describe('équipe plateforme · accès total (Admin+ / Admin)', () => {
  it('voit TOUTE rubrique, même absente de toute matrice', () => {
    for (const role of ROLES_ACCES_TOTAL) {
      expect(accesTotal(role)).toBe(true);
      for (const k of CLES_RUBRIQUES) {
        expect(roleVoitRubrique(role, k), `${role} doit voir ${k}`).toBe(true);
      }
      // Même une matrice qui NE coche rien ne peut pas leur retirer un accès.
      expect(roleVoitRubrique(role, 'finances', { [role]: [] })).toBe(true);
      expect(creditIllimitePourRole(role)).toBe(true);
    }
  });
});

describe('équipe plateforme · rôles matriciels', () => {
  it('les crédits ne sont illimités QUE pour l’accès total', () => {
    const matriciels = ROLES_PLATEFORME.filter((r) => !ROLES_ACCES_TOTAL.includes(r));
    for (const role of matriciels) expect(creditIllimitePourRole(role)).toBe(false);
  });

  it('Lecture ne voit pas les finances ni le studio · seulement de la lecture', () => {
    expect(roleVoitRubrique('lecture', 'finances')).toBe(false);
    expect(roleVoitRubrique('lecture', 'studio')).toBe(false);
    expect(roleVoitRubrique('lecture', 'dashboard')).toBe(true);
  });

  it('Dev voit la technique (coulisses) mais PAS les finances', () => {
    expect(roleVoitRubrique('dev', 'coulisses')).toBe(true);
    expect(roleVoitRubrique('dev', 'finances')).toBe(false);
  });

  it('la matrice éditable prime sur les défauts', () => {
    // Par défaut, Membre ne voit pas Adsmap · une matrice qui le coche le lui ouvre.
    expect(roleVoitRubrique('membre', 'adsmap')).toBe(false);
    expect(roleVoitRubrique('membre', 'adsmap', { membre: ['adsmap'] })).toBe(true);
    // Et une matrice qui vide un rôle matriciel le referme (hors accès total).
    expect(roleVoitRubrique('manager', 'dashboard', { manager: [] })).toBe(false);
  });

  it('une rubrique inconnue n’est JAMAIS visible (pas d’accès fantôme par faute de frappe)', () => {
    expect(roleVoitRubrique('manager', 'nexistepas')).toBe(false);
    expect(roleVoitRubrique('adminplus', 'nexistepas')).toBe(false);
  });

  it('les défauts ne référencent que des rubriques connues', () => {
    for (const [role, cles] of Object.entries(DROITS_DEFAUT)) {
      for (const k of cles) {
        expect(CLES_RUBRIQUES.includes(k), `défaut ${role} → rubrique inconnue « ${k} »`).toBe(true);
      }
    }
  });

  it('rubriquesDuRole rend exactement ce qui est visible', () => {
    const r: RolePlateforme = 'lecture';
    expect(rubriquesDuRole(r).sort()).toEqual([...DROITS_DEFAUT.lecture].sort());
  });
});

describe('équipe plateforme · gardes d’écriture (écran d’admin)', () => {
  it('ROLES_MATRICIELS exclut l’accès total', () => {
    expect(ROLES_MATRICIELS).not.toContain('adminplus');
    expect(ROLES_MATRICIELS).not.toContain('admin');
    expect(ROLES_MATRICIELS).toContain('membre');
    for (const r of ROLES_MATRICIELS) expect(estRoleMatriciel(r)).toBe(true);
    for (const r of ROLES_ACCES_TOTAL) expect(estRoleMatriciel(r)).toBe(false);
  });

  it('estRolePlateforme rejette une valeur forgée, accepte les rôles connus', () => {
    expect(estRolePlateforme('membre')).toBe(true);
    expect(estRolePlateforme('root')).toBe(false);
    expect(estRolePlateforme('')).toBe(false);
    expect(estRolePlateforme(null)).toBe(false);
    expect(estRolePlateforme(42)).toBe(false);
    for (const r of ROLES_PLATEFORME) expect(estRolePlateforme(r)).toBe(true);
  });

  it('nettoyerRubriques ne garde que le connu, déduplique, ordre canonique', () => {
    // Ordre d'entrée mélangé + doublon + clé forgée → sortie propre et ordonnée.
    const sale = ['studio', 'nexistepas', 'dashboard', 'studio', 'root'];
    expect(nettoyerRubriques(sale)).toEqual(['dashboard', 'studio']);
    // Types non-string ignorés · aucune exception, aucun accès fantôme.
    expect(nettoyerRubriques([42, null, {}, 'adsmap'])).toEqual(['adsmap']);
    expect(nettoyerRubriques([])).toEqual([]);
    // La sortie suit l'ordre de CLES_RUBRIQUES, jamais l'ordre d'entrée.
    const inverse = [...CLES_RUBRIQUES].slice().reverse();
    expect(nettoyerRubriques(inverse)).toEqual([...CLES_RUBRIQUES]);
  });
});
