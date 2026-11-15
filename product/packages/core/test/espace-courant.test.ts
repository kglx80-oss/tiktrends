import { describe, expect, it } from 'vitest';
import { comparerAppartenances, espaceCourant, type AppartenanceCandidate } from '../src';

/**
 * L'espace courant · la règle pure (`espaceCourant`) · l'espace le plus
 * ancien, puis le plus petit identifiant · jamais l'ordre reçu, jamais le rôle.
 * Le branchement dans `getSession` est éprouvé par
 * `apps/web/test/espace-courant-db.test.ts` (base réelle, jeton signé).
 */

type A = AppartenanceCandidate & { role: string };
const le = (j: number, h = 9) => new Date(Date.UTC(2026, 9, j, h));
const a = (workspaceId: string, j: number, role = 'member', h = 9): A => ({ workspaceId, espaceCreeLe: le(j, h), role });

/** Toutes les permutations · l'ordre reçu ne doit jamais compter. */
function permutations<T>(l: readonly T[]): T[][] {
  if (l.length <= 1) return [[...l]];
  return l.flatMap((x, i) => permutations([...l.slice(0, i), ...l.slice(i + 1)]).map((p) => [x, ...p]));
}

describe('espaceCourant', () => {
  it('aucune appartenance · pas d’espace courant', () => {
    expect(espaceCourant([])).toBeNull();
  });

  it('une seule appartenance · c’est elle, l’objet reçu tel quel (rôle compris)', () => {
    const seule = a('b7d0c1e2-0000-4000-8000-000000000001', 3, 'client_viewer');
    expect(espaceCourant([seule]), 'un compte à une appartenance ne retrouve pas la sienne').toBe(seule);
  });

  it('l’espace le plus ancien, quel que soit l’ordre reçu', () => {
    const vieux = a('ffffffff-0000-4000-8000-000000000001', 1, 'client_viewer');
    const milieu = a('00000000-0000-4000-8000-000000000002', 3, 'owner');
    const neuf = a('11111111-0000-4000-8000-000000000003', 5, 'admin');
    for (const p of permutations([vieux, milieu, neuf])) {
      expect(espaceCourant(p), 'l’espace courant dépend de l’ordre des appartenances reçues').toBe(vieux);
    }
  });

  it('à l’heure près · la date entière compte, pas seulement le jour', () => {
    const matin = a('99999999-0000-4000-8000-000000000001', 2, 'member', 8);
    const soir = a('00000000-0000-4000-8000-000000000002', 2, 'member', 20);
    for (const p of permutations([matin, soir])) expect(espaceCourant(p), 'l’heure de création ne départage pas').toBe(matin);
  });

  it('à instant égal · le plus petit identifiant, majuscules ou non', () => {
    // En majuscules, « 0B » passerait devant « 0a » (B < a en code) · comparé en minuscules, 0a < 0b.
    const petit = a('0a000000-0000-4000-8000-000000000001', 2, 'owner');
    const grand = a('0B000000-0000-4000-8000-000000000002', 2, 'member');
    for (const p of permutations([petit, grand])) expect(espaceCourant(p), 'à date égale, l’identifiant ne départage pas').toBe(petit);
    expect(comparerAppartenances(petit, grand)).toBeLessThan(0);
    expect(comparerAppartenances(grand, petit)).toBeGreaterThan(0);
    expect(comparerAppartenances(petit, { ...petit })).toBe(0);
  });

  it('le rôle ne compte pas · propriétaire ailleurs ne déplace pas l’espace courant', () => {
    const lectrice = a('cccccccc-0000-4000-8000-000000000001', 1, 'client_viewer');
    const proprietaire = a('aaaaaaaa-0000-4000-8000-000000000002', 4, 'owner');
    expect(espaceCourant([proprietaire, lectrice]), 'l’espace courant suit le rôle').toBe(lectrice);
    expect(espaceCourant([proprietaire, lectrice])!.role).toBe('client_viewer');
  });

  it('une date illisible passe après toutes les dates lisibles', () => {
    const illisible: A = { workspaceId: '00000000-0000-4000-8000-000000000000', espaceCreeLe: new Date('pas une date'), role: 'owner' };
    const lisible = a('ffffffff-0000-4000-8000-000000000009', 9);
    for (const p of permutations([illisible, lisible])) expect(espaceCourant(p), 'une date illisible passe devant').toBe(lisible);
    // Deux illisibles · l'identifiant départage encore.
    const autre: A = { ...illisible, workspaceId: '11111111-0000-4000-8000-000000000000' };
    for (const p of permutations([autre, illisible])) expect(espaceCourant(p)).toBe(illisible);
  });

  it('ne modifie pas la liste reçue', () => {
    const l = [a('22222222-0000-4000-8000-000000000001', 5), a('11111111-0000-4000-8000-000000000002', 1)];
    const copie = l.map((x) => ({ ...x }));
    espaceCourant(l);
    expect(l).toEqual(copie);
    expect(l[0]!.workspaceId).toBe('22222222-0000-4000-8000-000000000001');
  });
});
