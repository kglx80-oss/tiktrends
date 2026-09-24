import { describe, expect, it } from 'vitest';
import { CLES_RUBRIQUES, type MatriceDroits } from '@tiktrends/core';
import {
  FEATURES, canAccess, denyReason, railNav, rubriqueDeFeature, type Access,
} from '../lib/rbac';

/**
 * L'accès à double face · CLIENT (rôle d'espace + formule) OU ÉQUIPE (rôle
 * plateforme + matrice de rubriques). On vérifie le RÉSULTAT des deux, et surtout
 * qu'ajouter l'équipe NE CHANGE RIEN pour le client (le chemin `equipe` absent
 * est identique à avant).
 */

const feat = (key: string) => FEATURES.find((f) => f.key === key)!;

describe('rbac · le client est INCHANGÉ (equipe absent)', () => {
  const clientPlus: Access = { role: 'admin', plan: 'business' };
  const clientCore: Access = { role: 'member', plan: 'core' };

  it('un client business voit Adsmap · un client core est verrouillé par la formule', () => {
    expect(canAccess(clientPlus, feat('adsmap'))).toBe(true);
    expect(canAccess(clientCore, feat('adsmap'))).toBe(false);
    expect(denyReason(clientCore, feat('adsmap'))).toBe('plan');
  });

  it('le rail client filtre par rôle et verrouille par formule, comme avant', () => {
    const grpsCore = railNav(clientCore).flatMap((g) => g.items);
    const adsmap = grpsCore.find((i) => i.key === 'adsmap');
    expect(adsmap, 'Adsmap est listé mais verrouillé (formule)').toBeTruthy();
    expect(adsmap!.locked).toBe(true);
  });
});

describe('rbac · l’équipe interne (equipe présent)', () => {
  const matriceVide: MatriceDroits = {};
  const membre: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'membre', matrice: matriceVide } };
  const adminEquipe: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'admin', matrice: matriceVide } };

  it('un rôle matriciel voit ses rubriques, pas les autres · sans jamais de verrou formule', () => {
    // Membre (défaut) voit Studio, pas Adsmap · et jamais « verrouillé par la formule ».
    expect(canAccess(membre, feat('ads'))).toBe(true);       // ads → rubrique studio
    expect(canAccess(membre, feat('adsmap'))).toBe(false);   // adsmap absent des défauts membre
    expect(denyReason(membre, feat('adsmap'))).toBe('role');
    const items = railNav(membre).flatMap((g) => g.items);
    expect(items.every((i) => i.locked === false), 'l’équipe n’est jamais verrouillée par la formule').toBe(true);
  });

  it('Admin (équipe) voit TOUT, quelle que soit la matrice', () => {
    for (const f of FEATURES) expect(canAccess(adminEquipe, f), `admin doit voir ${f.key}`).toBe(true);
  });

  it('la matrice éditable ouvre une rubrique par défaut fermée', () => {
    const membreAvecAdsmap: Access = { role: 'client_viewer', plan: 'starter', equipe: { role: 'membre', matrice: { membre: ['studio', 'adsmap'] } } };
    expect(canAccess(membreAvecAdsmap, feat('adsmap'))).toBe(true);
  });
});

describe('rbac · le mapping feature → rubrique ne dérive pas', () => {
  it('toute feature (hors support) a une rubrique connue du noyau', () => {
    for (const f of FEATURES) {
      if (f.key === 'support') { expect(rubriqueDeFeature(f.key)).toBeNull(); continue; }
      const rub = rubriqueDeFeature(f.key);
      expect(rub, `feature ${f.key} sans rubrique`).not.toBeNull();
      expect(CLES_RUBRIQUES.includes(rub!), `rubrique inconnue « ${rub} » pour ${f.key}`).toBe(true);
    }
  });
});
