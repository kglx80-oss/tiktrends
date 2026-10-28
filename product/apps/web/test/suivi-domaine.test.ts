import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { siteMarque } from '@tiktrends/core';

/**
 * Le domaine capté au « Suivre » ouvre le lien « site » sur la puce.
 *
 * Sans stockage, « Marques suivies » n'avait que la bibliothèque · pas le site.
 * On capte le domaine de la créa qui a servi à suivre, et on le rend.
 */

const INSPO = readFileSync(join(process.cwd(), 'app/actions/inspo.ts'), 'utf8');
// Vague 4 · « Suivre » et les marques suivies sont servis par Spatial (Veille, Radar).
const BTN = readFileSync(join(process.cwd(), 'spatial/vues/veille/client.tsx'), 'utf8');
const MARQUES = readFileSync(join(process.cwd(), 'app/(spatial)/sp/radar/page.tsx'), 'utf8') + readFileSync(join(process.cwd(), 'spatial/vues/veille/Radar.tsx'), 'utf8');
const SCHEMA = readFileSync(join(process.cwd(), '../../packages/db/src/schema.ts'), 'utf8');

describe('siteMarque · le lien construit tient (résultat)', () => {
  it('un domaine stocké donne une URL https propre', () => {
    expect(siteMarque({ landingDomain: 'klorea.com' })).toBe('https://klorea.com');
    expect(siteMarque({ landingDomain: null })).toBeNull();
  });
});

describe('le domaine circule du Suivre à la puce', () => {
  it('la colonne existe dans le schéma des marques suivies', () => {
    const bloc = SCHEMA.slice(SCHEMA.indexOf('followedBrands = pgTable'), SCHEMA.indexOf('followedBrands = pgTable') + 700);
    expect(bloc).toMatch(/domain: text\('domain'\)/);
  });

  it('le bouton Suivre transmet le domaine de la créa', () => {
    expect(BTN).toMatch(/domain: ad\?\.landingDomain/);
  });

  it('l’action range le domaine à l’insertion', () => {
    const bloc = INSPO.slice(INSPO.indexOf('export async function followBrand'), INSPO.indexOf('export async function unfollowBrand'));
    expect(bloc).toMatch(/domain/);
    expect(bloc, 'le domaine n’est plus rangé').toMatch(/\.values\(\{[^}]*domain/s);
  });

  it('la puce rend le lien site depuis le domaine stocké', () => {
    expect(MARQUES).toMatch(/siteWeb: siteMarque\(\{ landingDomain: f\.domain \?\? undefined \}\)/);
    expect(MARQUES).toMatch(/\{m\.gestes\.siteWeb && <a className="btn sm" href=\{m\.gestes\.siteWeb\}[^>]*>Site<\/a>\}/);
  });
});
