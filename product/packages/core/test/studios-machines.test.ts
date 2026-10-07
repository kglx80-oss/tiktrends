import { describe, it, expect } from 'vitest';
import {
  transitionJob, transitionProposition, transitionQualite, ETATS_JOB, TRANSITIONS_JOB, jobTerminal,
} from '../src/studios/machines';

describe('machine Proposal', () => {
  it('draft → proposed → approved, par les bons acteurs', () => {
    expect(transitionProposition('draft', 'proposed', 'auteur').ok).toBe(true);
    expect(transitionProposition('proposed', 'approved', 'utilisateur').ok).toBe(true);
  });
  it('un auteur (Jarvis) ne s’approuve pas lui-même ; une proposition approuvée ne revient pas', () => {
    expect(transitionProposition('proposed', 'approved', 'auteur')).toMatchObject({ ok: false });
    expect(transitionProposition('draft', 'approved', 'utilisateur')).toMatchObject({ ok: false });
    expect(transitionProposition('approved', 'proposed', 'auteur')).toMatchObject({ ok: false });
  });
});

describe('machine Job (plan 06 §4)', () => {
  it('le chemin nominal queued → claimed → running → persisting → completed', () => {
    expect(transitionJob('queued', 'claimed', 'worker').ok).toBe(true);
    expect(transitionJob('claimed', 'running', 'worker').ok).toBe(true);
    expect(transitionJob('running', 'persisting', 'worker').ok).toBe(true);
    expect(transitionJob('persisting', 'completed', 'finaliseur').ok).toBe(true);
  });

  it('aucun retour depuis un état terminal · un nouvel essai est un NOUVEAU job', () => {
    for (const de of ETATS_JOB.filter(jobTerminal)) {
      for (const vers of ETATS_JOB) expect(transitionJob(de, vers, 'worker').ok, `${de} → ${vers}`).toBe(false);
    }
  });

  it('reconciliation_required ne repart jamais en running (pas de nouvel appel aveugle)', () => {
    for (const a of ['worker', 'reconciliateur', 'service', 'utilisateur', 'finaliseur'] as const) {
      expect(transitionJob('reconciliation_required', 'running', a).ok).toBe(false);
      expect(transitionJob('reconciliation_required', 'queued', a).ok).toBe(false);
    }
  });

  it('un bail expiré AVANT soumission rend le job à la file ; running ne revient pas en file', () => {
    expect(transitionJob('claimed', 'queued', 'worker').ok).toBe(true);
    expect(transitionJob('running', 'queued', 'worker').ok).toBe(false);
  });

  it('seul l’utilisateur demande l’annulation ; seul le worker la conclut', () => {
    expect(transitionJob('running', 'cancel_requested', 'worker').ok).toBe(false);
    expect(transitionJob('running', 'cancel_requested', 'utilisateur').ok).toBe(true);
    expect(transitionJob('cancel_requested', 'cancelled', 'utilisateur').ok).toBe(false);
    expect(transitionJob('cancel_requested', 'persisting', 'worker').ok).toBe(true);
  });

  it('completed n’est posé que par le finaliseur', () => {
    const vers = Object.entries(TRANSITIONS_JOB).filter(([, t]) => 'completed' in t);
    expect(vers.map(([de]) => de)).toEqual(['persisting']);
    expect(transitionJob('persisting', 'completed', 'worker').ok).toBe(false);
  });
});

describe('QualityStatus séparé', () => {
  it('ne bouge que sur un job completed', () => {
    expect(transitionQualite('running', 'pending', 'passed', 'controle').ok).toBe(false);
    expect(transitionQualite('completed', 'pending', 'requires_review', 'controle').ok).toBe(true);
  });
  it('une relecture humaine tranche requires_review ; le contrôle automatique non', () => {
    expect(transitionQualite('completed', 'requires_review', 'passed', 'controle').ok).toBe(false);
    expect(transitionQualite('completed', 'requires_review', 'passed', 'relecteur').ok).toBe(true);
  });
});
