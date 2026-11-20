import { describe, it, expect } from 'vitest';
import { privilegesEquipe, accesTotalAdmissible, pouvoirFondateur } from '../src/studios/securite';
import { voitDepensePlateforme } from '../src/spend-guard';
import { ROLES_PLATEFORME, accesTotal } from '../src/equipe-plateforme';

/**
 * Suivi de #1108 (I1) · LA règle des privilèges d'équipe hors studio
 * (`effectiveAccess`, `personnelPlateforme`) · formule Business forcée,
 * dépense de la plateforme, face équipe (aucun verrou de formule).
 *
 * Grille complète · chaque rôle × admissible ou non × fondateur codé ou non.
 * La référence est écrite à la main, pas dérivée de la règle.
 */
const RIEN = { formuleBusiness: false, depensePlateforme: false, faceEquipe: false };
const TOUT = { formuleBusiness: true, depensePlateforme: true, faceEquipe: true };
const GRADE = { formuleBusiness: false, depensePlateforme: false, faceEquipe: true };

describe('privilegesEquipe · accès total ADMISSIBLE ou fondateur codé, rien d’autre', () => {
  it('accès total admissible · tout', () => {
    expect(privilegesEquipe({ fondateurCode: false, equipe: { role: 'adminplus', plateformeAdmissible: true } })).toEqual(TOUT);
    expect(privilegesEquipe({ fondateurCode: false, equipe: { role: 'admin', plateformeAdmissible: true } })).toEqual(TOUT);
  });

  it('accès total NON admissible · rien (face client, formule réelle)', () => {
    expect(privilegesEquipe({ fondateurCode: false, equipe: { role: 'adminplus', plateformeAdmissible: false } })).toEqual(RIEN);
    expect(privilegesEquipe({ fondateurCode: false, equipe: { role: 'admin', plateformeAdmissible: false } })).toEqual(RIEN);
    expect(privilegesEquipe({ fondateurCode: false, equipe: { role: 'admin' } }), 'admissibilité absente = non admissible').toEqual(RIEN);
  });

  it('fondateur codé · tout, même si la lecture de l’admissibilité a sauté', () => {
    expect(privilegesEquipe({ fondateurCode: true, equipe: { role: 'adminplus', plateformeAdmissible: true } })).toEqual(TOUT);
    expect(privilegesEquipe({ fondateurCode: true, equipe: { role: 'adminplus' } })).toEqual(TOUT);
    // Sans équipe (aucune lecture) · formule et dépense, pas de face équipe à poser.
    expect(privilegesEquipe({ fondateurCode: true, equipe: null })).toEqual({ formuleBusiness: true, depensePlateforme: true, faceEquipe: false });
  });

  it('rôle gradé ADMISSIBLE · face équipe · ni Business ni dépense', () => {
    for (const role of ROLES_PLATEFORME.filter((r) => !accesTotal(r))) {
      expect(privilegesEquipe({ fondateurCode: false, equipe: { role, plateformeAdmissible: true } }), role).toEqual(GRADE);
    }
  });

  it('rôle gradé NON admissible · rien (« Fermer aussi » · face client, comme l’accès total)', () => {
    for (const role of ROLES_PLATEFORME.filter((r) => !accesTotal(r))) {
      expect(privilegesEquipe({ fondateurCode: false, equipe: { role, plateformeAdmissible: false } }), role).toEqual(RIEN);
      expect(privilegesEquipe({ fondateurCode: false, equipe: { role } }), `${role} · admissibilité absente = non admissible`).toEqual(RIEN);
    }
  });

  it('client (sans équipe) · rien', () => {
    expect(privilegesEquipe({ fondateurCode: false, equipe: null })).toEqual(RIEN);
    expect(privilegesEquipe({ fondateurCode: false, equipe: undefined })).toEqual(RIEN);
  });

  it('une seule règle · Business et dépense suivent `accesTotalAdmissible` (hors fondateur), la dépense est lue par `voitDepensePlateforme`', () => {
    for (const role of ROLES_PLATEFORME) for (const plateformeAdmissible of [true, false, undefined]) {
      const equipe = { role, plateformeAdmissible };
      const p = privilegesEquipe({ fondateurCode: false, equipe });
      expect(p.formuleBusiness, `${role}/${plateformeAdmissible}`).toBe(accesTotalAdmissible(equipe));
      expect(voitDepensePlateforme({ fondateurCode: false, equipe }), `${role}/${plateformeAdmissible}`).toBe(p.depensePlateforme);
    }
  });
});

describe('pouvoirFondateur · « Codé seul »', () => {
  it('la liste codée ouvre · `FOUNDER_EMAILS` seul n’ouvre rien', () => {
    expect(pouvoirFondateur({ fondateurCode: true, fondateurEnvironnement: false })).toBe(true);
    expect(pouvoirFondateur({ fondateurCode: true, fondateurEnvironnement: true })).toBe(true);
    expect(pouvoirFondateur({ fondateurCode: false, fondateurEnvironnement: true }), 'une adresse de FOUNDER_EMAILS reçoit les pouvoirs fondateur').toBe(false);
    expect(pouvoirFondateur({ fondateurCode: false, fondateurEnvironnement: false })).toBe(false);
  });
});
