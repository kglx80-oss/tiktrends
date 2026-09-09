import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { briefConcurrent, type PubConcurrent } from '@tiktrends/core';

/**
 * « Analyser cette marque » lit la FORME du compte concurrent, sans IA.
 * On teste le résultat agrégé, pas la présence d'un appel.
 */

const pub = (o: Partial<PubConcurrent>): PubConcurrent => ({ daysRunning: 5, mediaType: 'image', ...o });

describe('briefConcurrent · la forme du compte', () => {
  it('compte les éprouvées, la part de vidéo, l’ancienneté', () => {
    const b = briefConcurrent([
      pub({ daysRunning: 40, mediaType: 'video', body: 'Avis vérifiés · noté 4,8', callToAction: 'Shop Now', landingDomain: 'www.klorea.com' }),
      pub({ daysRunning: 30, mediaType: 'video', body: '-30% aujourd’hui', callToAction: 'Shop Now', landingDomain: 'klorea.com/promo' }),
      pub({ daysRunning: 3, mediaType: 'image', body: 'Nouvelle routine', callToAction: 'En savoir plus', landingDomain: 'autre.com' }),
    ]);
    expect(b.total).toBe(3);
    expect(b.gagnants).toBe(2);          // deux tiennent ≥ 21 j
    expect(b.partVideo).toBeCloseTo(2 / 3, 5);
    expect(b.doyenneJours).toBe(40);
    expect(b.ancienneteMediane).toBe(30);
  });

  it('classe les angles, décroissant, avec leur part', () => {
    const b = briefConcurrent([
      pub({ body: '-30% promo' }), pub({ body: 'code promo -20%' }), pub({ body: 'Avis clients ★★★★★' }),
    ]);
    expect(b.angles[0]!.angle).toBe('offer');
    expect(b.angles[0]!.n).toBe(2);
    expect(b.angles[0]!.part).toBeCloseTo(2 / 3, 5);
  });

  it('déduplique les domaines (sans www ni chemin) et compte les CTA', () => {
    const b = briefConcurrent([
      pub({ landingDomain: 'www.klorea.com/a', callToAction: 'Shop Now' }),
      pub({ landingDomain: 'klorea.com/b', callToAction: 'Shop Now' }),
    ]);
    expect(b.domaines).toEqual(['klorea.com']);
    expect(b.ctas[0]).toEqual({ cta: 'Shop Now', n: 2 });
  });

  it('un lot vide ne casse rien', () => {
    const b = briefConcurrent([]);
    expect(b).toMatchObject({ total: 0, gagnants: 0, angles: [], domaines: [] });
  });
});

const ACTION = readFileSync(join(process.cwd(), 'app/actions/brief-marque.ts'), 'utf8');
const PAGE = readFileSync(join(process.cwd(), 'app/(app)/saved/page.tsx'), 'utf8');

describe('le brief marque reste GRATUIT et branché', () => {
  it('l’action n’appelle aucun modèle · pas de dépense', () => {
    expect(ACTION).toMatch(/briefConcurrent\(/);
    expect(ACTION, 'le brief marque ne doit pas décrire au modèle (coût)').not.toMatch(/analyzeAdAsset|guardedAnthropic|generate/);
  });
  it('la page Sauvegardes rend le composant Marques suivies', () => {
    expect(PAGE).toMatch(/MarquesSuivies/);
  });
});
