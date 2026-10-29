import { describe, it, expect } from 'vitest';
import {
  ETAPES_ASSISTANT, ETAPES_RAIL, etapeDisponible, etapeProjetSuivante, etapeProjetPrecedente, etatRail, etapeRail,
  etapeBriefPrete, etapeProjetComplete, construireBriefV5, verifierCreationAssistant, saisieBriefVide,
  OPTIONS_FORMAT_ASSISTANT, saisieFormatDepuisBrief, formatDepuisBriefChoisi, changementFormatManuel,
  formatDejaEcrit, controleVisionDevis, etapeFormatPrete,
  type SaisieBriefV5, type SaisieFormat,
} from '../src/studios/ux/assistant-projet';
import { controleVisionActif } from '../src/studios/execution/tarifs';
import { validerFormeBrief, CLES_BRIEF, type BriefCanonique } from '../src/studios/brief';

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

describe('machine d’étapes · brief → stratégie → direction → format → confirm câblés', () => {
  it('le parcours est câblé jusqu’au suivi de création ; confirm n’ajoute pas de puce au rail', () => {
    const parStatut = Object.fromEntries(ETAPES_ASSISTANT.map((e) => [e.id, e.statut]));
    expect(parStatut).toEqual({ start: 'actif', brief: 'actif', strategie: 'actif', direction: 'actif', format: 'actif', confirm: 'actif', creation: 'actif' });
    // confirm (sous-vue de « Format & devis ») et start ne portent pas de puce · rail à cinq.
    expect(ETAPES_RAIL.map((e) => e.id)).toEqual(['brief', 'strategie', 'direction', 'format', 'creation']);
    expect(etapeDisponible('format')).toBe(true);
    expect(etapeDisponible('confirm')).toBe(true);
    expect(etapeDisponible('creation')).toBe(true);
  });

  it('les transitions vont direction → format → confirm → creation', () => {
    expect(etapeProjetSuivante('strategie')).toBe('direction');
    expect(etapeProjetSuivante('direction')).toBe('format');
    expect(etapeProjetSuivante('format')).toBe('confirm');
    expect(etapeProjetSuivante('confirm')).toBe('creation');
    expect(etapeProjetSuivante('creation')).toBeNull();
    expect(etapeProjetPrecedente('creation')).toBe('confirm');
    expect(etapeProjetPrecedente('confirm')).toBe('format'); // « Modifier » revient au format
    expect(etapeProjetPrecedente('format')).toBe('direction');
    expect(etapeProjetPrecedente('start')).toBeNull();
  });

  it('la puce du rail · confirm allume « Format & devis », pas une sixième puce', () => {
    expect(etapeRail('confirm')).toBe('format');
    expect(etapeRail('format')).toBe('format');
    expect(etapeRail('direction')).toBe('direction');
    // vu depuis la puce courante mappée, format est « current » pendant format ET confirm
    expect(etatRail('format', etapeRail('confirm'))).toBe('current');
    expect(etatRail('format', etapeRail('format'))).toBe('current');
  });

  it('l’état du rail distingue création à venir et création courante', () => {
    expect(etatRail('brief', 'brief')).toBe('current');
    expect(etatRail('strategie', 'brief')).toBe('todo');
    expect(etatRail('format', 'brief')).toBe('todo'); // format est câblé désormais, pas « bientôt »
    expect(etatRail('creation', 'confirm')).toBe('todo');
    expect(etatRail('creation', 'creation')).toBe('current');
    // une étape actif franchie est « done »
    expect(etatRail('brief', 'direction')).toBe('done');
    expect(etatRail('direction', etapeRail('confirm'))).toBe('done');
  });
});

describe('étape FORMAT & DEVIS · format réel + relecture, décisions Kevin', () => {
  const briefAvec = (formats: string[]): BriefCanonique => ({ ...construireBriefV5({ ...saisieBriefVide(), intention: 'x' }), formats });

  it('les trois formats de la maquette viennent du catalogue normatif (pas de sous-titre inventé)', () => {
    expect(OPTIONS_FORMAT_ASSISTANT.map((o) => o.format)).toEqual(['4:5', '1:1', '9:16']);
    const portrait = OPTIONS_FORMAT_ASSISTANT.find((o) => o.format === '4:5')!;
    expect(portrait.largeur).toBe(1080);
    expect(portrait.hauteur).toBe(1350);
    expect(portrait.libelle).toContain('Portrait');
    const story = OPTIONS_FORMAT_ASSISTANT.find((o) => o.format === '9:16')!;
    expect(story.placement.toLowerCase()).toContain('tiktok');
  });

  it('le format par défaut vient du brief quand il le dit, sinon le défaut annoncé ; relecture ON', () => {
    expect(saisieFormatDepuisBrief(null)).toEqual({ format: '4:5', relectureAuto: true });
    expect(saisieFormatDepuisBrief(briefAvec(['9:16']))).toEqual({ format: '9:16', relectureAuto: true });
    expect(formatDepuisBriefChoisi(null)).toBe(false);
    expect(formatDepuisBriefChoisi(briefAvec(['9:16']))).toBe(true);
  });

  it('« choisir ce format » écrit le ratio nu sur /brief/formats, reconnu par le format réel', () => {
    const c = changementFormatManuel('9:16');
    expect(c).toEqual({ op: 'replace', path: '/brief/formats', newValue: ['9:16'], reason: 'Format de sortie choisi · 9:16' });
    // appliqué au brief, le document réel lit bien 9:16
    const brief = { ...briefAvec([]), formats: c.newValue as string[] };
    expect(saisieFormatDepuisBrief(brief).format).toBe('9:16');
    expect(validerFormeBrief(brief)).toEqual([]);
  });

  it('formatDejaEcrit évite une proposition inutile quand le format est déjà celui du brief', () => {
    expect(formatDejaEcrit(briefAvec(['9:16']), '9:16')).toBe(true);
    expect(formatDejaEcrit(briefAvec(['9:16']), '4:5')).toBe(false);
    expect(formatDejaEcrit(null, '4:5')).toBe(false); // défaut non écrit ⇒ à écrire si choisi
  });

  it('relecture ⇒ paramètre controleVision du devis réel · EXPLICITE (29/10 · le défaut du serveur dépend du régime tarifaire)', () => {
    expect(controleVisionDevis({ format: '4:5', relectureAuto: true })).toBe(true);
    expect(controleVisionDevis({ format: '4:5', relectureAuto: false })).toBe(false);
    // `true` ne force rien · le serveur décide encore si la ligne est exécutable (`controleVisionActif`).
    expect(controleVisionActif({ demande: true, fournisseurVision: false, devisImage: true })).toBe(false);
    expect(controleVisionActif({ demande: true, fournisseurVision: true, devisImage: false })).toBe(false);
  });

  it('contrôle visuel · coché d’office en régime actuel, à la demande en V2', () => {
    expect(controleVisionActif({ demande: undefined, fournisseurVision: true, devisImage: true })).toBe(true);
    expect(controleVisionActif({ demande: undefined, fournisseurVision: true, devisImage: true, parDefaut: false })).toBe(false);
    expect(controleVisionActif({ demande: true, fournisseurVision: true, devisImage: true, parDefaut: false })).toBe(true);
    expect(controleVisionActif({ demande: false, fournisseurVision: true, devisImage: true })).toBe(false);
  });

  it('l’étape format est prête dès qu’un format valide est posé', () => {
    expect(etapeFormatPrete({ format: '4:5', relectureAuto: true })).toBe(true);
    expect(etapeFormatPrete({ format: 'xx' as never, relectureAuto: true })).toBe(false);
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
    // stratégie/direction se mesurent sur le brief relu (etapeStrategieRenseignee…), pas ici
    expect(etapeProjetComplete('strategie', e)).toBe(false);
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
 *  · etapeProjetSuivante('format') rendant null → « transitions direction → format → confirm » tombe.
 *  · etapeRail('confirm') rendant 'confirm' → « confirm allume Format & devis » tombe (sixième puce).
 *  · changementFormatManuel écrivant un libellé au lieu du ratio nu → « reconnu par le format réel » tombe.
 *  · controleVisionActif ignorant `parDefaut` → « à la demande en V2 » tombe.
 */
