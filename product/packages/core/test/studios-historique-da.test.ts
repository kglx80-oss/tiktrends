import { describe, it, expect } from 'vitest';
import {
  texteDaMarque, extraitDaMarque, idExtraitDaMarque, DA_TOTAL_MAX, DA_REGLES_MAX, DA_CHAMP_MAX, MARQUE_DA_TRONQUEE,
} from '../src/studios/sources/da-marque';
import {
  creationReutilisable, referenceCreation, apercuCreation, libelleCreation, creationsHorsMarque,
} from '../src/studios/sources/creation';
import { lireReferenceSource, referenceSource, annonceObservee, titreSource, presentationSource } from '../src/studios/sources/reference';
import { exclusionsSource, fuitesConcurrent, structureImportable } from '../src/studios/sources/import';

/**
 * Studios · reprendre l'existant · RÉSULTATS du noyau :
 *  · la DA de marque déjà saisie devient un texte borné, sans champ vide ;
 *  · une création précédente devient une source de la marque, réutilisable,
 *    sans aucune des exclusions réservées aux concurrents.
 */

const T0 = new Date('2026-10-10T08:00:00Z');

describe('DA de marque · texte transmis aux tâches Studios', () => {
  it('reprend les règles créatives, la DA visuelle et les champs de la fiche, règles en tête', () => {
    const t = texteDaMarque({
      name: 'Maison Lune',
      creativeRules: 'Toujours un fond crème.\n\n\nJamais de rouge vif.',
      brandKit: { style: 'éditorial minimaliste', aEviter: ['rendu stock', ''] },
      description: 'Cosmétique solide, fabriquée en Bretagne.',
      usp: 'Zéro plastique',
      tone: 'Chaleureux',
      colors: ['#F4EDE1', ' ', '#2B2B2B'],
      avoidWords: ['miracle'],
    })!;
    expect(t.split('\n')).toEqual([
      'Direction artistique de « Maison Lune », saisie par l’équipe dans l’outil :',
      'Règles créatives de la marque :',
      'Toujours un fond crème.',
      'Jamais de rouge vif.',
      'Style visuel : éditorial minimaliste',
      'À proscrire visuellement : rendu stock',
      'Description : Cosmétique solide, fabriquée en Bretagne.',
      'Promesse (USP) : Zéro plastique',
      'Ton : Chaleureux',
      'Couleurs : #F4EDE1, #2B2B2B',
      'Mots à éviter : miracle',
    ]);
  });

  it('ignore les champs vides · aucune ligne sans valeur, et rien du tout sans DA', () => {
    const t = texteDaMarque({ name: 'X', creativeRules: '   ', description: '', usp: null, colors: [], brandKit: { style: '' }, tone: 'Direct' })!;
    expect(t).toBe('Direction artistique de « X », saisie par l’équipe dans l’outil :\nTon : Direct');
    expect(texteDaMarque({ name: 'X', creativeRules: ' \n ', description: null, colors: ['', ' '], brandKit: null })).toBeNull();
    expect(extraitDaMarque('b1', { name: 'X' })).toBeNull();
  });

  it('borne chaque champ et le total · la coupe est dite, les règles enregistrées tiennent entières', () => {
    const regles = 'r'.repeat(DA_REGLES_MAX);
    const long = 'd'.repeat(5000);
    const t = texteDaMarque({ creativeRules: regles, description: long, usp: long, audience: long, tone: long, category: long })!;
    expect([...t].length).toBe(DA_TOTAL_MAX);
    expect(t.endsWith(MARQUE_DA_TRONQUEE)).toBe(true);
    expect(t).toContain(regles);
    const seul = texteDaMarque({ description: long })!;
    expect(seul).toContain(`Description : ${'d'.repeat(DA_CHAMP_MAX - 1)}…`);
    expect(seul).not.toContain('d'.repeat(DA_CHAMP_MAX));
  });

  it('extrait stable par marque · la version suit le texte (la trace dit quelle DA a été lue)', () => {
    const a = extraitDaMarque('b1', { creativeRules: 'Fond crème' })!;
    const b = extraitDaMarque('b1', { creativeRules: 'Fond crème' })!;
    const c = extraitDaMarque('b1', { creativeRules: 'Fond noir' })!;
    expect(a.sourceId).toBe(idExtraitDaMarque('b1'));
    expect(a.version).toBe(b.version);
    expect(a.version).not.toBe(c.version);
    expect(a.version).toMatch(/^da-[a-f0-9]{16}$/);
  });
});

const PUB = { id: '11111111-1111-4111-8111-111111111111', brandId: 'b_a1', kind: 'ad', status: 'completed', assetUrls: ['https://cdn.test/scene.png'], input: { headline: 'Le sérum qui tient', subhead: 'Sans parfum', cta: 'Essayer' }, createdAt: T0 };

describe('création précédente · source de la marque', () => {
  it('seules les images et pubs terminées, avec une image https, sont réutilisables', () => {
    expect(creationReutilisable(PUB)).toBe(true);
    expect(creationReutilisable({ ...PUB, status: 'archived' })).toBe(false);
    expect(creationReutilisable({ ...PUB, kind: 'script' })).toBe(false);
    expect(creationReutilisable({ ...PUB, assetUrls: ['http://cdn.test/x.png'] })).toBe(false);
    expect(creationReutilisable({ ...PUB, assetUrls: null })).toBe(false);
    expect(referenceCreation({ ...PUB, status: 'queued' }, { workspaceId: 'ws', observeLe: T0 })).toBeNull();
  });

  it('référence durable · type creation, droit interne, marque de la création, texte de la pub repris', () => {
    const r = referenceCreation(PUB, { workspaceId: 'ws', observeLe: T0 })!;
    expect(r).toMatchObject({ type: 'creation', droit: 'creation_interne', generationId: PUB.id, savedAdId: null, portee: { workspaceId: 'ws', brandId: 'b_a1' }, statut: 'active', plateforme: 'interne', annonceur: '' });
    expect(r.extraitAutorise).toBe('Le sérum qui tient · Sans parfum');
    expect(r.modalites).toEqual(['image', 'texte']);
    expect(lireReferenceSource(JSON.parse(JSON.stringify(r)))).toEqual(r);
    expect(titreSource(r)).toBe('Création précédente');
    expect(presentationSource(r)).toBe('Création précédente de la marque cible, produite dans l’outil, ajoutée le 2026-10-10 · elle se reprend et se décline.');
    expect(apercuCreation(PUB)).toBe(`/api/ad/${PUB.id}`);
    expect(apercuCreation({ ...PUB, kind: 'image' })).toBe('https://cdn.test/scene.png');
    expect(libelleCreation(PUB)).toBe('Pub IA · Le sérum qui tient · Sans parfum');
    expect(libelleCreation({ kind: 'image', input: { prompt: 'un flacon' } })).toBe('Image IA');
  });

  it('une image IA ne prête aucun texte · sa consigne au modèle n’est pas une accroche', () => {
    const r = referenceCreation({ ...PUB, kind: 'image', input: { prompt: 'Un flacon sur du lin' } }, { workspaceId: 'ws', observeLe: T0 })!;
    expect(r.extraitAutorise).toBe('');
    expect(r.observations.map((o) => o.element)).not.toContain('accroche');
  });

  it('aucune exclusion de concurrent · reprendre son propre texte n’est pas une fuite', () => {
    const r = referenceCreation(PUB, { workspaceId: 'ws', observeLe: T0 })!;
    expect(exclusionsSource(r)).toEqual([]);
    expect(structureImportable([r]).exclusions).toEqual([]);
    expect(fuitesConcurrent([{ chemin: 'texts/0', texte: 'Le sérum qui tient · Sans parfum, essayez le maintenant' }], [r])).toEqual([]);
    // Témoin · la même phrase venue d'un concurrent EST une fuite.
    const concurrent = referenceSource({ type: 'veille_ad', annonce: annonceObservee({ id: '9', platform: 'meta', advertiserName: 'Rival', body: 'Le sérum qui tient · Sans parfum, essayez le maintenant' })!, savedAdId: null, portee: { workspaceId: 'ws', brandId: null }, observeLe: T0, format: null, retourVeille: null });
    expect(fuitesConcurrent([{ chemin: 'texts/0', texte: 'Le sérum qui tient · Sans parfum, essayez le maintenant' }], [concurrent]).length).toBeGreaterThan(0);
    expect(exclusionsSource(concurrent).length).toBeGreaterThan(0);
  });

  it('une création ne se greffe pas sur une autre marque', () => {
    const r = referenceCreation(PUB, { workspaceId: 'ws', observeLe: T0 })!;
    expect(creationsHorsMarque([r], 'b_a1')).toEqual([]);
    expect(creationsHorsMarque([r], 'b_a2')).toEqual([r.sourceId]);
  });
});
