import { describe, it, expect } from 'vitest';
import {
  permissionsStudio, PERMISSIONS_PLATEFORME, PERMISSIONS_ESPACE, type RoleEspace, type SujetStudio,
} from '../src/studios/permissions';
import { ROLES_PLATEFORME, ROLES_ACCES_TOTAL } from '../src/equipe-plateforme';

const ROLES: RoleEspace[] = ['owner', 'admin', 'member', 'client_viewer'];
const EQUIPES: Array<string | null> = [null, ...ROLES_PLATEFORME];

/** Toutes les combinaisons de session possibles (rôle d'espace × ouverture studio × rôle d'équipe). */
function toutesLesSessions(): SujetStudio[] {
  const out: SujetStudio[] = [];
  for (const roleEspace of ROLES) for (const studioOuvert of [true, false]) for (const roleEquipe of EQUIPES) out.push({ roleEspace, studioOuvert, roleEquipe });
  return out;
}

describe('SEC-03 · un lecteur ne génère jamais', () => {
  it('client_viewer n’a ni studio.generate, ni studio.propose, ni studio.export, quelle que soit la session', () => {
    const fautives = toutesLesSessions()
      .filter((s) => s.roleEspace === 'client_viewer')
      .filter((s) => { const p = permissionsStudio(s).espace; return p.has('studio.generate') || p.has('studio.propose') || p.has('studio.export'); });
    expect(fautives, `lecteur autorisé à agir : ${JSON.stringify(fautives)}`).toEqual([]);
  });

  it('studio fermé (offre, rôle ou matrice) → aucune permission d’espace', () => {
    const fautives = toutesLesSessions().filter((s) => !s.studioOuvert && permissionsStudio(s).espace.size > 0);
    expect(fautives).toEqual([]);
  });

  it('un membre avec le studio ouvert génère · on n’a rien retiré aux droits acquis', () => {
    for (const roleEspace of ['member', 'admin', 'owner'] as const) {
      const p = permissionsStudio({ roleEspace, studioOuvert: true, roleEquipe: null }).espace;
      expect([...p].sort(), roleEspace).toEqual([...PERMISSIONS_ESPACE].sort());
    }
  });

  it('un rôle forgé n’ouvre rien', () => {
    const p = permissionsStudio({ roleEspace: 'superuser' as RoleEspace, studioOuvert: true, roleEquipe: null });
    expect(p.espace.size + p.plateforme.size).toBe(0);
  });
});

describe('SEC-09 · un admin d’espace n’a aucune permission de portée plateforme', () => {
  it('owner et admin d’espace, hors équipe à accès total, n’ont AUCUNE permission plateforme', () => {
    const fautives = toutesLesSessions()
      .filter((s) => s.roleEquipe === null || !ROLES_ACCES_TOTAL.includes(s.roleEquipe as never))
      .filter((s) => permissionsStudio(s).plateforme.size > 0);
    expect(fautives, `permission plateforme hors accès total : ${JSON.stringify(fautives)}`).toEqual([]);
  });

  it('seul l’accès total plateforme (adminplus, admin d’équipe) ouvre les prompts, le routage et les traces', () => {
    for (const roleEquipe of ROLES_ACCES_TOTAL) {
      const p = permissionsStudio({ roleEspace: 'client_viewer', studioOuvert: false, roleEquipe }).plateforme;
      expect([...p].sort(), roleEquipe).toEqual([...PERMISSIONS_PLATEFORME].sort());
    }
  });

  it('la liste d’accès total recopiée suit celle de l’équipe plateforme', () => {
    const ouvrent = ROLES_PLATEFORME.filter((r) => permissionsStudio({ roleEspace: 'member', studioOuvert: true, roleEquipe: r }).plateforme.size > 0);
    expect(ouvrent).toEqual([...ROLES_ACCES_TOTAL]);
  });
});
