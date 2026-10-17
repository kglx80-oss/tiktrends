import { describe, it, expect } from 'vitest';
import {
  ETAPES_ASSISTANT, ETAPES_RAIL, etapeDisponible, etapeProjetSuivante, etapeProjetPrecedente, etatRail,
  etapeBriefPrete, etapeProjetComplete, construireBriefV5, verifierCreationAssistant, saisieBriefVide,
  type SaisieBriefV5,
} from '../src/studios/ux/assistant-projet';
import { validerFormeBrief, CLES_BRIEF } from '../src/studios/brief';

/**
 * Raccord V5 · Lot 2a · la MACHINE D'ÉTAPES et la RÈGLE du brief, au RÉSULTAT.
 *
 * On vérifie ce que les fonctions RENDENT : les transitions, l'état du rail, la
 * complétude, et surtout que le brief composé passe `validerFormeBrief` (donc
 * est écrivable) et restitue les champs V5 choisis. Chaque assertion ci-dessous
 * a été éprouvée par mutation (cf. note en fin de fichier).
 */

const pleine = (): SaisieBriefV5 => ({
  intention: 'Vendre les lunettes aux parents',
  audience: 'Parents d’enfants de 4 à 10 ans',
  objectifType: 'conversion',
  plateformes: ['meta_feed', 'tiktok'],
  persona: { id: 'p1', label: 'Claire, maman active' },
  angle: 'Le premier plongeon',
  concept: 'Un été ludique',
  contraintes: 'Montrer le produit en entier\nPas de visage identifiable',
});

describe('machine d’étapes · seules start et brief sont câblées', () => {
  it('le parcours a start + brief actifs, le reste « bientôt »', () => {
    const parStatut = Object.fromEntries(ETAPES_ASSISTANT.map((e) => [e.id, e.statut]));
    expect(parStatut).toEqual({ start: 'actif', brief: 'actif', strategie: 'bientot', direction: 'bientot', format: 'bientot', creation: 'bientot' });
    expect(ETAPES_RAIL.map((e) => e.id)).toEqual(['brief', 'strategie', 'direction', 'format', 'creation']);
    expect(etapeDisponible('brief')).toBe(true);
    expect(etapeDisponible('strategie')).toBe(false);
  });

  it('les transitions sautent les étapes « bientôt »', () => {
    expect(etapeProjetSuivante('start')).toBe('brief');
    expect(etapeProjetSuivante('brief')).toBeNull(); // strategie est « bientôt »
    expect(etapeProjetPrecedente('brief')).toBe('start');
    expect(etapeProjetPrecedente('start')).toBeNull();
  });

  it('l’état du rail · une étape « bientôt » le reste, jamais « faite »', () => {
    expect(etatRail('brief', 'brief')).toBe('current');
    expect(etatRail('strategie', 'brief')).toBe('bientot');
    expect(etatRail('format', 'brief')).toBe('bientot');
    // même si l'étape courante était plus loin, les « bientôt » ne deviennent pas « done »
    expect(etatRail('strategie', 'format')).toBe('bientot');
    // une étape actif franchie est « done »
    expect(etatRail('brief', 'format')).toBe('done');
  });
});

describe('brief composé · forme valide et restitution des champs V5', () => {
  it('un brief vide a exactement les treize champs canoniques et reste valide', () => {
    const b = construireBriefV5(saisieBriefVide());
    expect(Object.keys(b).sort()).toEqual([...CLES_BRIEF].sort());
    expect(validerFormeBrief(b)).toEqual([]);
  });

  it('un brief V5 complet est bien formé et porte chaque choix', () => {
    const b = construireBriefV5(pleine());
    expect(validerFormeBrief(b)).toEqual([]);
    expect(b.objective).toBe('Vendre les lunettes aux parents');
    expect(b.audience).toBe('Parents d’enfants de 4 à 10 ans');
    expect(b.objectifType).toBe('conversion');
    expect(b.plateformes).toEqual(['meta_feed', 'tiktok']);
    expect(b.personaRef).toEqual({ id: 'p1', label: 'Claire, maman active' });
    expect(b.angle).toBe('Le premier plongeon');
    expect(b.concept).toBe('Un été ludique');
    expect(b.invariants).toEqual(['Montrer le produit en entier', 'Pas de visage identifiable']);
  });

  it('les champs V5 non renseignés sont ABSENTS (compat ascendante), pas vides', () => {
    const b = construireBriefV5({ ...saisieBriefVide(), intention: 'x' });
    expect('objectifType' in b).toBe(false);
    expect('plateformes' in b).toBe(false);
    expect('personaRef' in b).toBe(false);
    expect('angle' in b).toBe(false);
    expect('concept' in b).toBe(false);
  });

  it('plateformes dédupliquées et remises en ordre canonique · aucun doublon refusé', () => {
    const b = construireBriefV5({ ...pleine(), plateformes: ['tiktok', 'meta_feed', 'tiktok'] });
    expect(b.plateformes).toEqual(['meta_feed', 'tiktok']);
    expect(validerFormeBrief(b)).toEqual([]);
  });
});

describe('complétude et vérification avant envoi', () => {
  it('l’étape brief est prête dès que l’intention est saisie', () => {
    expect(etapeBriefPrete(saisieBriefVide())).toBe(false);
    expect(etapeBriefPrete({ ...saisieBriefVide(), intention: 'Un objectif' })).toBe(true);
  });

  it('start est toujours complète (type par défaut), brief selon intention + titre', () => {
    const e = { type: 'ads' as const, titre: 'Mon projet', saisie: { ...saisieBriefVide(), intention: 'x' } };
    expect(etapeProjetComplete('start', e)).toBe(true);
    expect(etapeProjetComplete('brief', e)).toBe(true);
    expect(etapeProjetComplete('brief', { ...e, saisie: saisieBriefVide() })).toBe(false);
    expect(etapeProjetComplete('brief', { ...e, titre: '  ' })).toBe(false);
    expect(etapeProjetComplete('strategie', e)).toBe(false); // « bientôt » · jamais complète
  });

  it('verifierCreationAssistant · rend le brief prêt, ou le message à corriger', () => {
    const ok = verifierCreationAssistant({ type: 'ads', titre: 'Projet', saisie: pleine() });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(validerFormeBrief(ok.brief)).toEqual([]);
      expect(ok.brief.objectifType).toBe('conversion');
    }
    expect(verifierCreationAssistant({ type: 'ads', titre: '', saisie: pleine() }).ok).toBe(false);
    expect(verifierCreationAssistant({ type: 'ads', titre: 'Projet', saisie: saisieBriefVide() }).ok).toBe(false);
  });
});

/*
 * Mutations éprouvées (cassées → test rouge sur la bonne assertion → restaurées) :
 *  · construireBriefV5 sans dédup des plateformes → « plateformes dédupliquées » tombe (doublon).
 *  · poser objectifType même vide → « champs V5 ABSENTS » tombe.
 *  · etapeProjetSuivante('brief') rendant 'strategie' → « transitions sautent bientôt » tombe.
 *  · etatRail ignorant le statut 'bientot' → « reste bientôt » tombe (renverrait 'done').
 */
