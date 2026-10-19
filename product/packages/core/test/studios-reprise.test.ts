import { describe, it, expect } from 'vitest';
import { ETATS_JOB } from '../src/studios/machines';
import {
  etatReprise as repriseDe, progressionLisible as pct, libelleOperationJob as libOp,
  uneTacheInterrompue as uneInterrompue, tacheActive,
} from '../src/studios/execution/reprise';

/**
 * Garde · Lot 5 · la règle d'écran de reprise (matrice V5 Étape 6). On vérifie
 * des RÉSULTATS de la projection pure, pas la présence d'un appel.
 *
 * Le point load-bearing : `reconciliation_required` est le SEUL état qui bloque
 * la relance, et son explication ne promet JAMAIS « aucun débit ».
 */
describe('etatReprise · relance bloquée sur réconciliation', () => {
  it('reconciliation_required est interrompu, coût incertain, relance BLOQUÉE', () => {
    const e = repriseDe('reconciliation_required');
    expect(e.interrompu).toBe(true);
    expect(e.coutIncertain).toBe(true);
    expect(e.relanceBloquee).toBe(true);
    expect(e.ton).toBe('interrompu');
  });

  it('la relance n’est bloquée QUE par reconciliation_required', () => {
    for (const etat of ETATS_JOB) {
      const bloquee = repriseDe(etat).relanceBloquee;
      expect(bloquee, `relance bloquée pour ${etat}`).toBe(etat === 'reconciliation_required');
    }
  });

  it('aucun état terminal ni actif n’est « interrompu »', () => {
    for (const etat of ETATS_JOB) {
      expect(repriseDe(etat).interrompu, `interrompu pour ${etat}`).toBe(etat === 'reconciliation_required');
    }
  });

  it('l’explication d’interruption ne promet jamais « aucun débit »', () => {
    const txt = repriseDe('reconciliation_required').explication.toLowerCase();
    expect(txt).not.toMatch(/aucun débit|aucun crédit|rien n’a été débité|rien n’a été facturé|gratuit/);
    expect(txt, 'le rapprochement est annoncé').toMatch(/rapproch/);
  });

  it('chaque état a un titre non vide', () => {
    for (const etat of ETATS_JOB) expect(repriseDe(etat).titre.length).toBeGreaterThan(0);
  });
});

describe('progressionLisible · jamais de pourcentage fabriqué', () => {
  it('rend null pour l’absence ou une valeur non réelle', () => {
    for (const v of [undefined, null, NaN, Infinity, -Infinity, -0.1, 1.5, 42] as const) {
      expect(pct(v), `progression ${String(v)}`).toBeNull();
    }
  });
  it('rend un entier 0..100 pour une fraction réelle', () => {
    expect(pct(0)).toBe(0);
    expect(pct(0.5)).toBe(50);
    expect(pct(1)).toBe(100);
    expect(pct(0.333)).toBe(33);
  });
});

describe('libelleOperationJob · fallback honnête', () => {
  it('connaît les opérations usuelles, et renvoie l’identifiant brut sinon', () => {
    expect(libOp('keyframe:s_image')).toBe('Image');
    expect(libOp('controle:vision')).toBe('Contrôle visuel');
    expect(libOp('clip:intro')).toBe('Vidéo');
    expect(libOp('operation_inconnue_xyz')).toBe('operation_inconnue_xyz');
  });
});

describe('uneTacheInterrompue / tacheActive', () => {
  it('vrai dès qu’une tâche est en réconciliation', () => {
    expect(uneInterrompue(['completed', 'running'])).toBe(false);
    expect(uneInterrompue(['completed', 'reconciliation_required'])).toBe(true);
  });
  it('tacheActive distingue le travail en cours des états terminaux/interrompus', () => {
    expect(tacheActive('running')).toBe(true);
    expect(tacheActive('queued')).toBe(true);
    expect(tacheActive('completed')).toBe(false);
    expect(tacheActive('reconciliation_required')).toBe(false);
    expect(tacheActive('cancel_requested')).toBe(false);
  });
});
