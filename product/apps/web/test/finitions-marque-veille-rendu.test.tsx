import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';

/**
 * Finitions relevées en recette 106b (Codex) · rendu lu, pas un appel constaté.
 * - fiche Marque · « Enregistrer le profil », « Récupérer la DA » (et « Éditer »
 *   sur la même rangée), « Générer maintenant » · 44 px (42 mesurés avant) ;
 * - aide de la Veille · nomme l'action réelle de la carte et ne promet aucun
 *   résultat (« Générer une variante » n'existe pas à l'écran).
 */
vi.mock('next/navigation', () => ({ redirect: () => { throw new Error('redirect'); }, useRouter: () => ({ refresh() {}, push() {}, replace() {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
const { stub } = vi.hoisted(() => ({ stub: () => new Proxy({}, { has: (_t: object, k: string | symbol) => k !== 'then', get: (_t: object, k: string | symbol) => (k === 'then' ? undefined : k === '__esModule' ? true : async () => ({})) }) }));
vi.mock('../app/actions/brands', stub);
vi.mock('../app/actions/brand-detail', stub);

import { BrandOverviewForm } from '../components/BrandOverviewForm';
import { BrandDA } from '../app/(app)/brands/[id]/BrandDA';
import { SubmitButton } from '../components/SubmitButton';

const h44 = `min-height:${CIBLE_TACTILE_MIN}px`;
const styleDu = (html: string, libelle: string) => {
  const i = html.indexOf(libelle); expect(i, `« ${libelle} » absent`).toBeGreaterThan(-1);
  const debut = html.lastIndexOf('<button', i); return html.slice(debut, html.indexOf('>', debut));
};

describe('Fiche Marque · trois boutons à 44 px', () => {
  it('« Enregistrer le profil »', () => {
    const html = renderToStaticMarkup(<BrandOverviewForm init={{ id: 'b', name: 'Neva', url: '', description: '', usp: '', audience: '', category: '', categoryNeeds: '', moreAbout: '', industry: '', industryTags: '', tone: '', languages: '', colors: '', fonts: '', preferredWords: '', avoidWords: '', competitors: '' }} />);
    expect(styleDu(html, 'Enregistrer le profil')).toContain(h44);
  });
  it('« Récupérer la DA » et « Éditer » (même rangée)', () => {
    const html = renderToStaticMarkup(<BrandDA brandId="b" logoUrl={null} colors={[]} fonts={[]} />);
    expect(styleDu(html, 'Récupérer la DA')).toContain(h44);
    expect(styleDu(html, 'Éditer')).toContain(h44);
  });
  it('« Générer maintenant » · la fiche passe 44 au bouton partagé, qui l’applique', () => {
    const page = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/page.tsx'), 'utf8');
    expect(page).toMatch(/label="Générer maintenant"[^>]*style=\{\{ minHeight: CIBLE_TACTILE_MIN \}\}/);
    const html = renderToStaticMarkup(<form><SubmitButton label="Générer maintenant" style={{ minHeight: CIBLE_TACTILE_MIN }} /></form>);
    expect(styleDu(html, 'Générer maintenant')).toContain(h44);
  });
});

describe('Fiche Marque · copie client sans « clé serveur » (recette #106)', () => {
  it('l’encart « Générer tout le profil » nomme le service, pas une clé', () => {
    const page = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/page.tsx'), 'utf8');
    expect(page, 'la fiche parle encore de clé serveur').not.toMatch(/clé IA serveur/);
    expect(page).toContain("messageServiceInactif('ia_profil')");
  });
});
