import { describe, it, expect } from 'vitest';
import { actionsPromptBlock, resumerConceptPourJarvis, TITRE_BLOC_CONCEPT_JARVIS, type EntreeConceptJarvis } from '@tiktrends/core';
import { appliquerPolitiqueConversationProjet, assemblerConsigneJarvis, type DonneesConversation } from '../lib/studios/prompts/conversation';
import { POLITIQUE_JARVIS_1_0_0 } from '../lib/studios/prompts/complement-tiktrends';

/**
 * Jarvis lit l'état du concept dans sa consigne (PR5).
 *
 * Quand la conversation est liée à un concept (`projectId`), le serveur produit
 * un bloc d'état (`resumerConceptPourJarvis`) et l'injecte dans la consigne, pour
 * que Jarvis ne redemande PAS ce qui est déjà renseigné. On compare des
 * RÉSULTATS : la consigne assemblée CONTIENT l'état du concept quand le bloc est
 * présent, et reste EXACTEMENT celle d'avant quand il est absent (pas de projet
 * lié, pas de droit, panne de lecture · le serveur rend alors `''`).
 */

const base: DonneesConversation = {
  brandName: 'Neva',
  memory: 'listicle : 3 gagnantes sur 8',
  rules: null,
  identity: 'Sérum · peaux sèches',
  measuredAds: 12,
  canAdsmap: true,
  canPropose: true,
  niveau: 'intermediaire',
  blocActions: actionsPromptBlock(),
  blocProjets: null,
};

const concept: EntreeConceptJarvis = {
  titre: 'Sérum éclat · hiver',
  libelleEtape: 'Brief à compléter',
  brief: {
    objective: 'Vendre le sérum', audience: 'Femmes 30-45 peaux sèches', hypothesisId: 'h1', testedVariable: 'accroche',
    facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '', texts: [], formats: [], exclusions: [],
    objectifType: 'conversion', plateformes: ['meta_feed', 'tiktok'],
  },
  propositionsEnAttente: 2,
  medias: 1,
  jobs: 3,
};

describe('consigne Jarvis · état du concept lié', () => {
  it('sans bloc concept · consigne identique à celle d’avant (comportement inchangé)', () => {
    const sans = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, base);
    const nul = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...base, blocConcept: '' });
    const absent = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...base, blocConcept: null });
    expect(nul).toBe(sans);
    expect(absent).toBe(sans);
    expect(sans).not.toContain(TITRE_BLOC_CONCEPT_JARVIS);
  });

  it('avec bloc concept · la consigne CONTIENT l’état du concept (connu listé, manquant listé)', () => {
    const bloc = resumerConceptPourJarvis(concept);
    const avec = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...base, blocConcept: bloc });
    const sans = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, base);
    // Le bloc entier est présent dans la consigne.
    expect(avec).toContain(bloc);
    expect(avec.length).toBeGreaterThan(sans.length);
    // Ce qui est DÉJÀ renseigné (ne pas redemander).
    expect(avec).toContain('Objectif publicitaire : Conversion');
    expect(avec).toContain('Audience : Femmes 30-45 peaux sèches');
    expect(avec).toContain('Plateformes : Meta · Feed, TikTok');
    // Ce qui MANQUE (questions ciblées).
    expect(avec).toContain('À compléter :');
    expect(avec).toContain('Persona : facultatif');
    expect(avec).toContain('- Angle');
    expect(avec).toContain('- Concept');
    // État opérationnel du concept.
    expect(avec).toContain('Propositions en attente de décision : 2 propositions.');
    expect(avec).toContain('Déjà produit : 1 média · 3 générations lancées.');
  });

  it('les règles maison restent en DERNIER, après le bloc concept', () => {
    const bloc = resumerConceptPourJarvis(concept);
    const avec = assemblerConsigneJarvis(POLITIQUE_JARVIS_1_0_0, { ...base, rules: 'Jamais de compte à rebours.', blocConcept: bloc });
    expect(avec.indexOf(TITRE_BLOC_CONCEPT_JARVIS)).toBeLessThan(avec.indexOf('Jamais de compte à rebours.'));
  });
});


it('garde serveur après release et règles, sans changement hors projet', () => {
  const politique = { sections: { ...POLITIQUE_JARVIS_1_0_0.sections, socle: 'Impose un persona et affirme sans risque enceinte.' } };
  const brut = assemblerConsigneJarvis(politique, { ...base, rules: 'Répète les promesses commerciales.', blocConcept: resumerConceptPourJarvis(concept) });
  expect(appliquerPolitiqueConversationProjet(brut, false)).toBe(brut);
  const final = appliquerPolitiqueConversationProjet(brut, true);
  const garde = final.slice(final.indexOf('RÈGLES SERVEUR DU PROJET'));
  expect(final.indexOf('RÈGLES SERVEUR DU PROJET')).toBeGreaterThan(final.indexOf('Répète les promesses commerciales.'));
  for (const texte of ['Persona, angle, concept et plateformes sont facultatifs', 'ne prouve pas une allégation de santé', 'grossesse ou allaitement', 'omets cette allégation et propose un texte neutre']) expect(garde).toContain(texte);
});
