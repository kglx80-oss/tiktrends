import { describe, it, expect } from 'vitest';
import {
  CAPACITES_STUDIOS, DEFINITIONS_CAPACITES, EXPERIENCES_TOUJOURS_ACTIVES, capaciteActive, decisionCapacite, capacitesCoupees,
  capacitesDesOperations, capacitesDesLignes, lireReglagesEspace, validerReglagesEspace, messageCapaciteCoupee, cleInterrupteursEspace,
  type CapaciteStudio,
} from '../src/studios/interrupteurs';
import { OPERATION_IMAGE } from '../src/studios/image';
import { OPERATION_CONTROLE_VISION } from '../src/studios/execution/tarifs';

/**
 * F1 · interrupteurs par capacité et par espace (cahier 01 §14). La règle est
 * pure : on lui donne l'environnement et le réglage de l'espace, on lit la
 * DÉCISION. Chaque bloc ci-dessous a été éprouvé par mutation (voir le
 * message de commit).
 */

const WS = '11111111-1111-4111-8111-111111111111';
const AUTRE = '22222222-2222-4222-8222-222222222222';
const VIDE = {};
const actives = (env: Record<string, string>, espace: string | null = WS, reglages?: unknown) =>
  CAPACITES_STUDIOS.filter((c) => capaciteActive(c, { env, espace, reglages }));

describe('défauts · nouveautés incomplètes coupées, produit existant allumé', () => {
  it('sans aucun réglage, seules les capacités complètes sont actives', () => {
    expect(actives(VIDE)).toEqual(['projets', 'editeur', 'textes', 'export', 'canvas', 'propositions', 'identites']);
  });

  it('chaque capacité qui dépend d’un fournisseur non validé est marquée incomplète', () => {
    const incompletes = CAPACITES_STUDIOS.filter((c) => DEFINITIONS_CAPACITES[c].maturite === 'incomplete');
    expect(incompletes).toEqual(['generation_image', 'controle_visuel', 'video', 'voix', 'benchmark_reel', 'shadow']);
    for (const c of incompletes) expect(DEFINITIONS_CAPACITES[c].raison, c).toBeTruthy();
  });

  it('une capacité inconnue n’est jamais allumée, même « généralisée »', () => {
    expect(decisionCapacite('teleportation', { env: { STUDIOS_CAPACITES_GENERALES: 'teleportation' }, espace: WS })).toEqual({ active: false, source: 'inconnue' });
  });
});

describe('ancienne expérience · jamais coupée', () => {
  it('Studio historique, Pubs IA et ADMIN IA restent actifs même sous la coupure la plus large', () => {
    const tout = CAPACITES_STUDIOS.join(',') + ',' + EXPERIENCES_TOUJOURS_ACTIVES.join(',');
    const env = { STUDIOS_CAPACITES_COUPEES: tout };
    const reglages = { actives: [], coupees: [...CAPACITES_STUDIOS, ...EXPERIENCES_TOUJOURS_ACTIVES] };
    for (const x of EXPERIENCES_TOUJOURS_ACTIVES) {
      expect(decisionCapacite(x, { env, espace: WS, reglages }), x).toEqual({ active: true, source: 'toujours' });
    }
    expect(actives(env, WS, reglages)).toEqual([]);
  });
});

describe('pilote · espaces autorisés seulement', () => {
  const env = { STUDIOS_ESPACES_PILOTES: `${WS}, 33333333-3333-4333-8333-333333333333`, STUDIOS_CAPACITES_PILOTES: 'generation_image;controle_visuel' };
  it('un espace pilote reçoit les capacités pilotes, un autre espace non', () => {
    expect(decisionCapacite('generation_image', { env, espace: WS })).toEqual({ active: true, source: 'pilote_env' });
    expect(decisionCapacite('generation_image', { env, espace: AUTRE })).toEqual({ active: false, source: 'defaut' });
    expect(capaciteActive('video', { env, espace: WS }), 'la vidéo n’est pas dans la liste des capacités pilotes').toBe(false);
  });
  it('la casse de l’identifiant ne compte pas ; sans espace (décision de plateforme), aucun pilote', () => {
    expect(capaciteActive('generation_image', { env, espace: WS.toUpperCase() })).toBe(true);
    expect(capaciteActive('generation_image', { env, espace: null })).toBe(false);
  });
  it('le réglage plateforme d’un espace l’allume pour CET espace seulement', () => {
    const reglages = { actives: ['video'], coupees: [] };
    expect(decisionCapacite('video', { env: VIDE, espace: AUTRE, reglages })).toEqual({ active: true, source: 'pilote_espace' });
    expect(capaciteActive('video', { env: VIDE, espace: WS })).toBe(false);
  });
  it('un réglage d’espace n’allume jamais une capacité de plateforme', () => {
    expect(capaciteActive('benchmark_reel', { env: VIDE, espace: WS, reglages: { actives: ['benchmark_reel'], coupees: [] } })).toBe(false);
    expect(capaciteActive('benchmark_reel', { env: { STUDIOS_ESPACES_PILOTES: WS, STUDIOS_CAPACITES_PILOTES: 'benchmark_reel' }, espace: WS })).toBe(false);
  });
});

describe('généralisation et coupures', () => {
  it('la généralisation allume partout, y compris la plateforme', () => {
    const env = { STUDIOS_CAPACITES_GENERALES: 'video benchmark_reel' };
    expect(decisionCapacite('video', { env, espace: AUTRE })).toEqual({ active: true, source: 'generalisation' });
    expect(capaciteActive('benchmark_reel', { env, espace: null })).toBe(true);
  });
  it('la coupure globale gagne sur la généralisation, le pilote et le réglage d’espace', () => {
    const env = { STUDIOS_CAPACITES_COUPEES: 'textes,video', STUDIOS_CAPACITES_GENERALES: 'video', STUDIOS_ESPACES_PILOTES: WS, STUDIOS_CAPACITES_PILOTES: 'video' };
    expect(decisionCapacite('video', { env, espace: WS, reglages: { actives: ['video'], coupees: [] } })).toEqual({ active: false, source: 'coupure_globale' });
    expect(decisionCapacite('textes', { env, espace: WS })).toEqual({ active: false, source: 'coupure_globale' });
  });
  it('la coupure d’un espace gagne sur la généralisation, pour cet espace seulement', () => {
    const env = { STUDIOS_CAPACITES_GENERALES: 'video' };
    const reglages = { actives: [], coupees: ['video', 'textes'] };
    expect(decisionCapacite('video', { env, espace: WS, reglages })).toEqual({ active: false, source: 'coupure_espace' });
    expect(decisionCapacite('textes', { env, espace: WS, reglages })).toEqual({ active: false, source: 'coupure_espace' });
    expect(capaciteActive('video', { env, espace: AUTRE })).toBe(true);
  });
  it('capacitesCoupees rend exactement celles qui manquent', () => {
    expect(capacitesCoupees(['textes', 'video', 'generation_image', 'video'], { env: VIDE, espace: WS })).toEqual(['video', 'generation_image']);
  });
});

describe('capacités exigées par les opérations d’un devis ou d’un job', () => {
  it('image du studio Image, image clé vidéo, clip, identité, voix, vision, calcul', () => {
    expect(capacitesDesOperations([OPERATION_IMAGE])).toEqual(['generation_image']);
    expect(capacitesDesOperations(['keyframe:s_ouverture'])).toEqual(['video']);
    expect(capacitesDesOperations(['clip:s1'])).toEqual(['video']);
    expect(capacitesDesOperations(['identite:i1'])).toEqual(['generation_image']);
    expect(capacitesDesOperations(['voix:s1'])).toEqual(['voix']);
    expect(capacitesDesOperations([OPERATION_IMAGE, OPERATION_CONTROLE_VISION])).toEqual(['generation_image', 'controle_visuel']);
    expect(capacitesDesOperations(['composition', 'montage', 'export', 42])).toEqual([]);
  });
  it('les lignes sont lues défensivement', () => {
    expect(capacitesDesLignes([{ operation: OPERATION_IMAGE }, null, { operation: OPERATION_CONTROLE_VISION }, 'x'])).toEqual(['generation_image', 'controle_visuel']);
    expect(capacitesDesLignes('pas une liste')).toEqual([]);
  });
});

describe('réglage d’un espace · lecture et validation', () => {
  it('lecture défensive · inconnus et capacités de plateforme ignorés, la coupure gagne', () => {
    expect(lireReglagesEspace({ actives: ['video', 'video', 'benchmark_reel', 'zz', 'textes'], coupees: ['textes'] })).toEqual({ actives: ['video'], coupees: ['textes'] });
    expect(lireReglagesEspace(null)).toEqual({ actives: [], coupees: [] });
  });
  it('validation · chaque refus est nommé', () => {
    expect(validerReglagesEspace({ actives: ['video'], coupees: [] })).toEqual({ ok: true, reglages: { actives: ['video'], coupees: [] } });
    const r = validerReglagesEspace({ actives: ['video', 'benchmark_reel', 'zz'], coupees: ['video'] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.raisons).toEqual([
      '« Benchmark réel » se règle pour toute la plateforme, pas par espace',
      'capacité inconnue : zz',
      '« Vidéo · storyboard et images clés » à la fois allumée et coupée',
    ]);
    expect(validerReglagesEspace('x')).toEqual({ ok: false, raisons: ['réglage illisible · deux listes attendues (actives, coupées)'] });
  });
  it('la clé de stockage est propre à l’espace', () => {
    expect(cleInterrupteursEspace(WS)).toBe(`studios_interrupteurs:${WS}`);
  });
});

describe('le message du refus', () => {
  it('nomme la capacité, dit « non activé pour cet espace » et qu’aucune écriture ni débit n’a eu lieu', () => {
    const c: CapaciteStudio[] = ['video'];
    expect(messageCapaciteCoupee(c)).toBe('« Vidéo · storyboard et images clés » · non activé pour cet espace. Rien n’a été écrit ni débité.');
  });
});
