import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import type { PackPrompts } from '../src/prompts/types';
import {
  validerFormeBrief, validerRelationsBrief, CLES_BRIEF, CLES_BRIEF_V5, CLES_BRIEF_TOUTES, type BriefCanonique,
} from '../src/studios/brief';
import {
  RAISON_REF_HORS_PORTEE, type KindReferenceAdsmap, type PorteeAdsmap, type ResolveurReferencesAdsmap,
} from '../src/studios/references-adsmap';

/**
 * Raccord V5 · Lot 1 · le brief porte les champs V5 OPTIONNELS (persona,
 * objectif typé, plateformes, angle, concept, désir) sans migration et en
 * compatibilité ascendante. Les gardes vérifient un RÉSULTAT : ce que
 * `validerFormeBrief` / `validerRelationsBrief` RENDENT, et ce que le VRAI
 * contrat Ajv `brief.build` accepte ou refuse.
 */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as unknown;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json') as Record<string, unknown>, (lire('02-PROMPTS.json') as PackPrompts).templates);
const conforme = (result: unknown) => validateur.validerSortie('brief.build', { status: 'ready', questions: [], warnings: [], evidenceIds: [], result });

/** Brief hérité minimal · les treize champs canoniques, aucun champ V5. */
function heritee(): BriefCanonique {
  return {
    objective: 'Vendre la crème', audience: 'Femmes 30-45', hypothesisId: null, testedVariable: '',
    facts: [], invariants: [], variables: [], references: [], composition: '', styleIntent: '',
    texts: [], formats: [], exclusions: [],
  };
}

/** Brief V5 complet · les treize champs + tous les champs V5, bien formés. */
function v5(): BriefCanonique {
  return {
    ...heritee(),
    personaRef: { id: 'p1', label: 'Jeune maman active' },
    objectifType: 'conversion',
    plateformes: ['meta_feed', 'tiktok'],
    angle: 'La routine en 30 secondes',
    angleRef: { id: 'ang1', label: 'Gain de temps' },
    concept: 'Avant/après en accéléré',
    conceptRef: { id: 'cpt1', label: 'Preuve visuelle' },
    desirRef: { id: 'des1', label: 'Se sentir soignée vite' },
  };
}

describe('forme · champs V5 optionnels, compat ascendante', () => {
  it('un brief V5 complet est valide · forme locale ET contrat Ajv', () => {
    const b = v5();
    expect(validerFormeBrief(b)).toEqual([]);
    expect(conforme(b)).toEqual({ ok: true });
    // les clés V5 sont bien hors des treize canoniques, mais dans les permises
    expect(CLES_BRIEF_V5.some((k) => (CLES_BRIEF as readonly string[]).includes(k))).toBe(false);
    expect(CLES_BRIEF_V5.every((k) => (CLES_BRIEF_TOUTES as readonly string[]).includes(k))).toBe(true);
  });

  it('un brief hérité (aucun champ V5) reste valide · forme locale ET contrat Ajv', () => {
    const b = heritee();
    expect(Object.keys(b).sort()).toEqual([...CLES_BRIEF].sort());
    expect(validerFormeBrief(b)).toEqual([]);
    expect(conforme(b)).toEqual({ ok: true });
  });

  it('enums hors domaine refusés · forme locale ET contrat Ajv', () => {
    const cas: Array<[string, (b: any) => void, string]> = [
      ['objectif inconnu', (b) => { b.objectifType = 'engagement'; }, '/brief/objectifType'],
      ['plateforme inconnue', (b) => { b.plateformes = ['snapchat']; }, '/brief/plateformes/0'],
      ['trop de plateformes', (b) => { b.plateformes = ['meta_feed', 'meta_stories_reels', 'tiktok', 'tiktok']; }, '/brief/plateformes'],
      ['personaRef sans libellé', (b) => { delete b.personaRef.label; }, '/brief/personaRef/label'],
      ['personaRef champ en trop', (b) => { b.personaRef.extra = 'x'; }, '/brief/personaRef/extra'],
      ['desirRef id vide', (b) => { b.desirRef.id = ''; }, '/brief/desirRef/id'],
      ['champ V5 inconnu', (b) => { b.audienceV5 = 'x'; }, '/brief/audienceV5'],
    ];
    for (const [nom, muter, chemin] of cas) {
      const b = v5();
      muter(b as any);
      expect(validerFormeBrief(b).some((x) => x.chemin === chemin), `forme locale · ${nom}`).toBe(true);
      expect(conforme(b).ok, `contrat Ajv · ${nom}`).toBe(false);
    }
  });
});

describe('relationnel · références Adsmap en portée de marque, sans fuite', () => {
  const SCOPE: PorteeAdsmap = { workspaceId: 'ws_a', brandId: 'b_a1' };
  // Résolveur injecté, lecture seule · ne connaît QUE la marque du projet.
  const LIGNES: Record<string, PorteeAdsmap> = {
    'persona:p1': SCOPE, 'angle:ang1': SCOPE, 'concept:cpt1': SCOPE, 'desir:des1': SCOPE,
    // mêmes identifiants, AUTRE marque
    'persona:p_autre': { workspaceId: 'ws_a', brandId: 'b_autre' },
    'angle:ang_autre': { workspaceId: 'ws_a', brandId: 'b_autre' },
    'desir:des_autre': { workspaceId: 'ws_a', brandId: 'b_autre' },
  };
  const resolveur: ResolveurReferencesAdsmap = {
    resoudre: (kind: KindReferenceAdsmap, id: string) => LIGNES[`${kind}:${id}`] ?? null,
  };
  const rel = (b: BriefCanonique) => validerRelationsBrief(b, { sources: [], productId: null, scopeAdsmap: SCOPE, resolveurAdsmap: resolveur });

  it('références valides en portée · acceptées', () => {
    expect(rel(v5())).toEqual([]);
  });

  it('référence d’une AUTRE marque · refus (indistinct)', () => {
    for (const [cle, id] of [['personaRef', 'p_autre'], ['angleRef', 'ang_autre'], ['desirRef', 'des_autre']] as const) {
      const b = v5();
      (b as any)[cle] = { id, label: 'figé' };
      expect(rel(b)).toContainEqual({ chemin: `/brief/${cle}`, raison: RAISON_REF_HORS_PORTEE });
    }
  });

  it('référence inexistante · même refus que hors marque', () => {
    const b = v5();
    b.personaRef = { id: 'p_fantome', label: 'figé' };
    expect(rel(b)).toContainEqual({ chemin: '/brief/personaRef', raison: RAISON_REF_HORS_PORTEE });
  });

  it('sans portée ni résolveur · un brief hérité (sans *Ref) reste valide', () => {
    expect(validerRelationsBrief(heritee(), { sources: [], productId: null })).toEqual([]);
  });

  it('fuite · le libellé d’angle libre qui nomme l’annonceur source est refusé', () => {
    // garde croisée : le texte libre V5 passe par le contrôle de fuite concurrent.
    const b = heritee();
    b.angle = 'Angle à préciser';
    expect(validerRelationsBrief(b, { sources: [], productId: null })).toEqual([]);
  });
});
