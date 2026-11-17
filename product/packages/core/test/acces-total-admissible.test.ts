import { describe, it, expect, vi, afterEach } from 'vitest';

/**
 * M2 · `accesTotalAdmissible` décide des crédits illimités d'équipe
 * (`getSession` → `noterCreditsStaff`). La règle est « accès total ET
 * admissible », écrite telle quelle · pas « au moins une permission de portée
 * plateforme du studio ». Le second énoncé faisait dépendre l'argent d'un
 * catalogue de permissions qui n'a rien à voir avec lui · on le prouve en
 * vidant ce catalogue : la réponse ne doit pas bouger.
 */

const h = vi.hoisted(() => ({ viderPlateforme: false }));
vi.mock('../src/studios/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/studios/permissions')>();
  return {
    ...actual,
    permissionsStudio: (s: Parameters<typeof actual.permissionsStudio>[0]) => {
      const p = actual.permissionsStudio(s);
      return h.viderPlateforme ? { espace: p.espace, plateforme: new Set() } : p;
    },
  };
});

import { accesTotalAdmissible } from '../src/studios/securite';
import { ROLES_PLATEFORME, accesTotal } from '../src/equipe-plateforme';

afterEach(() => { h.viderPlateforme = false; });

describe('accesTotalAdmissible · accès total ET admissible, rien d’autre', () => {
  it('accès total admissible · oui (Admin+ et Admin)', () => {
    expect(accesTotalAdmissible({ role: 'adminplus', plateformeAdmissible: true })).toBe(true);
    expect(accesTotalAdmissible({ role: 'admin', plateformeAdmissible: true })).toBe(true);
  });

  it('accès total NON admissible · non (le compte qui a capté un e-mail staff)', () => {
    expect(accesTotalAdmissible({ role: 'adminplus', plateformeAdmissible: false })).toBe(false);
    expect(accesTotalAdmissible({ role: 'admin', plateformeAdmissible: false })).toBe(false);
    expect(accesTotalAdmissible({ role: 'admin' }), 'admissibilité absente = non admissible').toBe(false);
  });

  it('rôle gradé, même admissible · non', () => {
    for (const role of ROLES_PLATEFORME.filter((r) => !accesTotal(r))) {
      expect(accesTotalAdmissible({ role, plateformeAdmissible: true }), role).toBe(false);
    }
  });

  it('rôle inconnu ou forgé · non', () => {
    for (const role of ['', 'Admin', 'ADMINPLUS', 'owner', 'fondateur']) expect(accesTotalAdmissible({ role, plateformeAdmissible: true }), role).toBe(false);
  });

  it('null ou absent · non', () => {
    expect(accesTotalAdmissible(null)).toBe(false);
    expect(accesTotalAdmissible(undefined)).toBe(false);
  });

  it('ne dépend PAS du catalogue des permissions plateforme du studio', () => {
    h.viderPlateforme = true;
    expect(accesTotalAdmissible({ role: 'adminplus', plateformeAdmissible: true }), 'les crédits illimités suivent le catalogue des permissions studio').toBe(true);
    expect(accesTotalAdmissible({ role: 'adminplus', plateformeAdmissible: false })).toBe(false);
  });
});
