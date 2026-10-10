import { describe, it, expect } from 'vitest';
import { objetDansPortee, marquesAccessibles, marqueDansPortee } from '../src/studios/portee';
import { erreurStudio } from '../src/studios/erreurs';

const S = { workspaceId: 'ws_a', marquesDuWorkspace: ['b_a1', 'b_a2'], restrictionsMarque: [] as string[] };

describe('portée · espace, marque de l’espace, marque autorisée', () => {
  it('sans restriction, toutes les marques de l’espace (droits acquis)', () => {
    expect(marquesAccessibles(S)).toEqual(['b_a1', 'b_a2']);
    expect(objetDansPortee(S, { workspaceId: 'ws_a', brandId: 'b_a2' })).toBe(true);
  });

  it('SEC-01 · un objet d’un autre espace est hors portée, même avec une marque « connue »', () => {
    expect(objetDansPortee(S, { workspaceId: 'ws_b', brandId: 'b_a1' })).toBe(false);
    expect(objetDansPortee(S, { workspaceId: 'ws_b', brandId: 'b_b1' })).toBe(false);
  });

  it('une marque qui n’est pas de l’espace est hors portée', () => {
    expect(objetDansPortee(S, { workspaceId: 'ws_a', brandId: 'b_b1' })).toBe(false);
  });

  it('SEC-02 · restreint à la marque A, la marque B du même espace est hors portée', () => {
    const r = { ...S, restrictionsMarque: ['b_a1'] };
    expect(objetDansPortee(r, { workspaceId: 'ws_a', brandId: 'b_a1' })).toBe(true);
    expect(objetDansPortee(r, { workspaceId: 'ws_a', brandId: 'b_a2' })).toBe(false);
    expect(marqueDansPortee(r, 'b_a2')).toBe(false);
  });

  it('une restriction vers aucune marque de l’espace ne rouvre RIEN', () => {
    expect(marquesAccessibles({ ...S, restrictionsMarque: ['b_disparue'] })).toEqual([]);
  });

  it('session sans espace · rien n’est en portée', () => {
    expect(objetDansPortee({ ...S, workspaceId: '' }, { workspaceId: '', brandId: 'b_a1' })).toBe(false);
  });
});

describe('erreurs · NOT_FOUND est neutre', () => {
  it('ni cible, ni message personnalisé ne sortent sur un refus de portée', () => {
    const e = erreurStudio('NOT_FOUND', { traceId: 't1', targetIds: ['projet_secret'], message: 'Projet « Lancement B » introuvable' });
    expect(e.targetIds).toEqual([]);
    expect(e.message).not.toContain('Lancement');
    expect(e.status).toBe(404);
    expect(JSON.stringify(e)).not.toContain('projet_secret');
  });

  it('VERSION_CONFLICT porte le diff et la version courante', () => {
    const e = erreurStudio('VERSION_CONFLICT', { traceId: 't', targetIds: ['p1'], conflit: { versionCouranteId: 'v2', differences: [{ chemin: '/brief', base: null, courant: {} }] } });
    expect(e.status).toBe(409);
    expect(e.conflit?.versionCouranteId).toBe('v2');
    expect(e.recoverable).toBe(true);
  });
});
