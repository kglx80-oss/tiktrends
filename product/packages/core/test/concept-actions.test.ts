import { describe, expect, it } from 'vitest';
import {
  ACTIONS_CONCEPT, actionsConceptResolues, demandeProposition, estActionConcept, nombreAppels,
  type ConceptActionKey, type ContexteActionsConcept,
} from '../src/studios/ux/concept-actions';

/**
 * Concept créatif V5 · PR6 · la règle PURE des actions typées du fil.
 *
 * On vérifie un RÉSULTAT (ce que la règle rend), jamais la présence d'un appel.
 *
 * Mutations qui doivent faire TOMBER ces gardes (éprouvées) :
 *  · rendre « Écrire le scénario » visible hors vidéo ⇒ `le scénario ne s'affiche
 *    que pour une vidéo` tombe ;
 *  · rendre « Préparer la création » active ⇒ `préparer reste grisée` tombe ;
 *  · ignorer `briefPret` (toujours actif) ⇒ `sans brief, une proposition est
 *    grisée` tombe ;
 *  · renvoyer un texte pour `preparer` dans `demandeProposition` ⇒ `preparer
 *    n'envoie aucune demande` tombe.
 */

const base: ContexteActionsConcept = {
  kind: 'ads', peutProposer: true, briefPret: true,
  jarvisDisponible: true, jarvisRaison: '', generationImageActive: false,
};
const etat = (r: ReturnType<typeof actionsConceptResolues>, k: ConceptActionKey) => r.find((x) => x.def.key === k);

describe('actionsConceptResolues · visibilité par type de projet', () => {
  it('ads · directions et accroches actives ; scénario non montré ; préparer grisée', () => {
    const r = actionsConceptResolues(base);
    expect(etat(r, 'directions')?.etat).toBe('actif');
    expect(etat(r, 'accroches')?.etat).toBe('actif');
    expect(etat(r, 'scenario'), 'le scénario ne s’affiche que pour une vidéo').toBeUndefined();
    expect(etat(r, 'preparer')?.etat, 'préparer reste grisée').toBe('desactive');
  });

  it('video · le scénario est montré et actif', () => {
    const r = actionsConceptResolues({ ...base, kind: 'video' });
    expect(etat(r, 'scenario')?.etat).toBe('actif');
  });

  it('text · accroches montrées, directions NON (visuel)', () => {
    const r = actionsConceptResolues({ ...base, kind: 'text' });
    expect(etat(r, 'accroches')?.etat).toBe('actif');
    expect(etat(r, 'directions')).toBeUndefined();
    expect(etat(r, 'scenario')).toBeUndefined();
  });
});

describe('actionsConceptResolues · exécutabilité (le premier blocage gagne)', () => {
  it('sans brief, une proposition est grisée avec la bonne raison', () => {
    const r = actionsConceptResolues({ ...base, briefPret: false });
    expect(etat(r, 'directions')?.etat).toBe('desactive');
    expect(etat(r, 'directions')?.raison).toMatch(/brief/i);
  });

  it('sans droit de proposer, la raison parle du rôle AVANT le brief', () => {
    const r = actionsConceptResolues({ ...base, peutProposer: false, briefPret: false });
    expect(etat(r, 'accroches')?.etat).toBe('desactive');
    expect(etat(r, 'accroches')?.raison).toMatch(/rôle/i);
  });

  it('Jarvis indisponible · la raison fournie est reprise telle quelle', () => {
    const r = actionsConceptResolues({ ...base, jarvisDisponible: false, jarvisRaison: 'Le plafond de dépense est atteint.' });
    expect(etat(r, 'directions')?.etat).toBe('desactive');
    expect(etat(r, 'directions')?.raison).toBe('Le plafond de dépense est atteint.');
  });

  it('préparer · raison selon la capacité generation_image', () => {
    const coupee = etat(actionsConceptResolues(base), 'preparer');
    expect(coupee?.raison).toMatch(/pas activée/i);
    const active = etat(actionsConceptResolues({ ...base, generationImageActive: true }), 'preparer');
    expect(active?.etat, 'préparer n’est jamais active en PR6').toBe('desactive');
    expect(active?.raison).toMatch(/branchée/i);
  });
});

describe('vocabulaire FERMÉ et demandes', () => {
  it('estActionConcept ne reconnaît que les clés déclarées', () => {
    expect(estActionConcept('directions')).toBe(true);
    expect(estActionConcept('supprimer_tout')).toBe(false);
    expect(estActionConcept(42)).toBe(false);
  });

  it('« 3 accroches » déclenche 3 appels, chacun un angle distinct', () => {
    const accroches = ACTIONS_CONCEPT.find((a) => a.key === 'accroches')!;
    expect(nombreAppels(accroches)).toBe(3);
    const d0 = demandeProposition('accroches', 0);
    const d1 = demandeProposition('accroches', 1);
    const d2 = demandeProposition('accroches', 2);
    expect(d0).not.toBe(d1);
    expect(d1).not.toBe(d2);
    expect(d0).toMatch(/textes du brief/i);
  });

  it('les propositions bornent leur demande au bon chemin', () => {
    expect(demandeProposition('directions')).toMatch(/intention de style/i);
    expect(demandeProposition('scenario')).toMatch(/composition/i);
    expect(ACTIONS_CONCEPT.find((a) => a.key === 'directions')!.cibleBrief!.chemin).toBe('/brief/styleIntent');
    expect(ACTIONS_CONCEPT.find((a) => a.key === 'accroches')!.cibleBrief!.chemin).toBe('/brief/texts');
    expect(ACTIONS_CONCEPT.find((a) => a.key === 'scenario')!.cibleBrief!.chemin).toBe('/brief/composition');
  });

  it('preparer n’envoie aucune demande (non branchée)', () => {
    expect(demandeProposition('preparer')).toBeNull();
    expect(nombreAppels(ACTIONS_CONCEPT.find((a) => a.key === 'preparer')!)).toBe(0);
  });

  it('aucun tiret cadratin dans les libellés ni les effets', () => {
    for (const a of ACTIONS_CONCEPT) {
      expect(a.label).not.toContain('—');
      expect(a.effet).not.toContain('—');
    }
  });
});

 describe('préparation image · navigation sans modèle', () => {
  it('active sans Jarvis, avec droits et brief courant', () => {
    expect(etat(actionsConceptResolues({ ...base, kind: 'image', generationImageActive: true, jarvisDisponible: false }), 'preparer')?.etat).toBe('actif');
  });
  it.each([
    { peutProposer: false }, { ancienneVersion: true }, { generationImageActive: false }, { briefPret: false },
  ])('respecte la garde %j', (garde) => {
    expect(etat(actionsConceptResolues({ ...base, kind: 'image', generationImageActive: true, ...garde }), 'preparer')?.etat).toBe('desactive');
  });
 });
