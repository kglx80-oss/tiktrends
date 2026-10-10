import { describe, expect, it } from 'vitest';
import type { InspoAd } from '@tiktrends/integrations';
import { studioDepuisVeille } from '../lib/veille-link';

/**
 * Le pont veille → préparation d'un projet Studios (anciennement Pubs IA, retirées le 10/10).
 *
 * ── Le défaut réparé ─────────────────────────────────────────────────────────
 *
 * Le bouton « Générer une variante » pointait vers `/studio` (le hub des hooks),
 * pas vers les Pubs IA, avec `?brand=` et `?inspo=` que la page ne lit pas · un
 * clic sans suite. Et il passait la copy concurrente MOT POUR MOT. On vérifie
 * ici l'URL produite, pas qu'une fonction est appelée · c'est le RÉSULTAT qui
 * décide si le pont mène quelque part.
 */

const ad = (o: Partial<InspoAd>): InspoAd => ({
  id: 'x', platform: 'meta', status: 'active', daysRunning: 0, ...o,
} as InspoAd);

function angleDe(url: string): string {
  const q = url.split('?')[1] ?? '';
  const m = new URLSearchParams(q).get('angle');
  return m ?? '';
}

describe('le pont mène à la préparation d’un projet, armé', () => {
  it('vise /studio/projets/nouveau (type pub), jamais un ancien studio ni le hub', () => {
    const url = studioDepuisVeille(ad({ body: 'La crème qui tient 24 h', daysRunning: 40 }));
    expect(url.startsWith('/studio/projets/nouveau?')).toBe(true);
    expect(new URLSearchParams(url.split('?')[1]).get('type')).toBe('ads');
    expect(studioDepuisVeille(ad({ mediaType: 'video', body: 'x', daysRunning: 40 } as Partial<InspoAd>)).includes('type=video'), 'une vidéo prépare un projet vidéo').toBe(true);
  });

  it('porte le brief distillé, pas la copy brute', () => {
    const url = studioDepuisVeille(ad({ body: 'La crème qui tient 24 h', callToAction: 'Shop Now', daysRunning: 40 }));
    const angle = angleDe(url);
    expect(angle, 'l’angle éprouvé est transmis').toContain('éprouvée');
    expect(angle, 'l’instruction d’adaptation survit').toContain('nos mots');
  });

  it('sans matière (ni brief ni source), pointe quand même vers le bon écran, à vide', () => {
    expect(studioDepuisVeille(ad({ id: '' }))).toBe('/studio/projets/nouveau?type=ads');
  });

  // CDC v8 · F07 · la PROVENANCE suit le lien · « Décline cette piste » ne perd
  // plus la référence de la source, comme Sauvegardes portait la sienne.
  it('porte une référence structurée de la source (plateforme:id) et le nom de l’annonceur', () => {
    const url = studioDepuisVeille(ad({ id: '789', platform: 'meta', advertiserName: 'Klorea', body: 'x', daysRunning: 40 }));
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('src'), 'la clé structurée unique de la source').toBe('meta:789');
    expect(q.get('srcnom'), 'le nom de l’annonceur, pour l’afficher').toBe('Klorea');
  });

  it('porte la source même sans brief distillé · la provenance ne dépend pas de la matière', () => {
    const url = studioDepuisVeille(ad({ id: '789', platform: 'meta', advertiserName: 'Klorea' }));
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('src')).toBe('meta:789');
    expect(q.get('angle'), 'pas de brief sans matière').toBeNull();
  });

  it('sans identifiant de source, aucune provenance inventée', () => {
    const url = studioDepuisVeille(ad({ id: '', body: 'x', daysRunning: 40 }));
    expect(new URLSearchParams(url.split('?')[1]).get('src')).toBeNull();
  });

  it('avec une pub sauvegardée en référence, elle suit le lien (source du projet) · angle ET référence', () => {
    const REF = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const url = studioDepuisVeille(ad({ body: 'La crème qui tient 24 h', daysRunning: 40 }), { ref: REF });
    const q = new URLSearchParams(url.split('?')[1]);
    expect(q.get('ref')).toBe(REF);
    expect(new URLSearchParams(studioDepuisVeille(ad({ body: 'x', daysRunning: 40 }), { ref: '../x' }).split('?')[1]).get('ref'), 'référence forgée ignorée').toBeNull();
    expect(q.get('angle'), 'le brief accompagne la structure').toContain('éprouvée');
  });

  it('sans référence, l’angle seul · aucune référence inventée', () => {
    const url = studioDepuisVeille(ad({ body: 'x', daysRunning: 40 }));
    expect(new URLSearchParams(url.split('?')[1]).get('ref'), 'pas de référence inventée').toBeNull();
  });
});
