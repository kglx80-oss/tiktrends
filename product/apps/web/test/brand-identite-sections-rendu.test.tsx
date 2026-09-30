import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * H3 · l'identité visuelle se lit en DEUX sections distinctes, avec des ancres
 * fiables et un index qui y mène. Le défaut qu'on garde : deux libellés qui
 * mèneraient au MÊME point (ancres confondues), ou une section « Couleurs &
 * typographie » qui disparaît. On RÉEND le composant et on lit le HTML · on ne
 * teste pas la présence d'un appel, on lit ce qui s'affiche.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }) }));
// Les actions serveur tirent tout le graphe serveur (auth, db, ai) · hors sujet
// pour un test de RENDU. Stubs · on lit ce qui s'affiche.
vi.mock('../app/actions/brand-detail', () => ({
  importBrandDAAction: async () => ({}),
  saveBrandDAAction: async () => ({}),
  extractBrandVisualDaAction: async () => {},
  saveBrandVisualDaAction: async () => {},
}));

import { BrandDA } from '../app/(app)/brands/[id]/BrandDA';

function html(over: Partial<{ colors: string[]; fonts: string[]; logoUrl: string | null }> = {}): string {
  return renderToStaticMarkup(
    <BrandDA
      brandId="b1"
      logoUrl={over.logoUrl !== undefined ? over.logoUrl : 'https://x/logo.png'}
      logos={[]}
      colors={over.colors ?? ['#0a7d5a', '#f4e9d8']}
      fonts={over.fonts ?? ['Inter', 'Playfair Display']}
      daVisuelle={null}
    />,
  );
}

describe('H3 · l’identité visuelle · deux sections distinctes et ancrées', () => {
  it('porte les DEUX ancres de section, sur des points DISTINCTS', () => {
    const out = html();
    const iCouleurs = out.indexOf('id="couleurs"');
    const iCharte = out.indexOf('id="charte"');
    expect(iCouleurs, 'la section « Styles » (#couleurs) manque').toBeGreaterThan(-1);
    expect(iCharte, 'la section « Brand kits » (#charte) manque').toBeGreaterThan(-1);
    expect(iCouleurs, 'les deux ancres tombent au MÊME point · un seul repère pour deux libellés').not.toBe(iCharte);
  });

  it('les deux sections portent les libellés de Kevin · « Styles », « Brand kits », titre ET index', () => {
    const out = html();
    const sCoul = out.slice(out.indexOf('id="couleurs"'), out.indexOf('id="charte"'));
    const sChart = out.slice(out.indexOf('id="charte"'));
    expect(sCoul, 'la section #couleurs ne s’intitule pas « Styles »').toContain('Styles');
    expect(sChart, 'la section #charte ne s’intitule pas « Brand kits »').toContain('Brand kits');
    const index = out.slice(0, out.indexOf('id="couleurs"'));
    expect(index, 'l’index ne propose pas « Styles »').toContain('Styles');
    expect(index, 'l’index ne propose pas « Brand kits »').toContain('Brand kits');
  });

  it('chaque section dit ce qu’elle CONTIENT (sous-titre honnête, pas de capacité inventée)', () => {
    const out = html();
    expect(out, 'Styles ne dit pas qu’il s’agit des couleurs et de la typographie').toContain('Couleurs et typographie de la marque');
    expect(out, 'Brand kits ne dit pas ce que contient le kit').toContain('logo, variantes et style déduit du site');
    expect(out, 'le sous-titre promet plusieurs kits alors qu’il y en a un par marque').toContain('Le kit de cette marque');
  });

  it('l’index de sections a deux liens vers les DEUX ancres distinctes', () => {
    const out = html();
    expect(out, 'le lien d’index vers #couleurs manque').toContain('href="#couleurs"');
    expect(out, 'le lien d’index vers #charte manque').toContain('href="#charte"');
    // Les deux liens ne visent pas le même point · deux libellés, deux ancres.
    expect(out.indexOf('href="#couleurs"'), 'les deux liens d’index visent la même ancre').not.toBe(out.indexOf('href="#charte"'));
  });

  it('la palette garde ses pastilles + HEX (marquage PaletteMarque inchangé)', () => {
    const out = html({ colors: ['#0a7d5a', '#f4e9d8'] });
    expect(out, 'la pastille de couleur (data-pastille avec le HEX) a disparu').toContain('data-pastille="#0a7d5a"');
    expect(out, 'le nom accessible de la couleur (avec son HEX) a disparu').toContain('Couleur #0a7d5a');
  });

  it('la typographie liste chaque police en toutes lettres', () => {
    const out = html({ fonts: ['Inter', 'Playfair Display'] });
    expect(out).toContain('Inter');
    expect(out).toContain('Playfair Display');
  });

  it('l’aperçu de police est HONNÊTE · pas de spécimen fidèle tant que la fonte n’est pas prouvée chargée', () => {
    // Sans navigateur (rendu statique), aucune fonte n'est prouvée chargée ·
    // « Aa Bb Cc » rendu dans une fonte non chargée MENT (Playfair sans
    // empattements). L'aperçu ne montre alors PAS de spécimen · il nomme la
    // police. Garde contre le retour d'un faux spécimen inconditionnel.
    const out = html({ fonts: ['Playfair Display'] });
    expect(out, 'un spécimen « Aa Bb Cc » est montré sans preuve que la fonte est chargée').not.toContain('Aa Bb Cc');
    expect(out, 'l’aperçu non prouvé doit se nommer honnêtement, pas simuler la fonte').toContain('police de la marque');
  });

  it('le logo se pose sur une assise NEUTRE (contraste des logos sombres · même choix que #708)', () => {
    // L'ancien `rgba(255,255,255,.06)`, quasi transparent sur la surface sombre,
    // effaçait un logo sombre (ex. Klorea). L'assise neutre le rend lisible.
    const out = html({ logoUrl: 'https://x/logo.png' });
    expect(out, 'le logo n’est pas sur l’assise neutre #767676').toContain('background:#767676');
    expect(out, 'l’ancienne assise quasi transparente du logo (rgba .06) subsiste').not.toContain('rgba(255,255,255,.06)');
  });

  it('les deux ancres réservent en-tête + index (le titre tombe SOUS l’index collant)', () => {
    const out = html();
    // 65 (en-tête mesuré) + 57 (index + marges) + 12 · une pour chaque section.
    const scrolls = out.match(/scroll-margin-top:134px/g) ?? [];
    expect(scrolls.length, 'une section au moins ne réserve pas la place de l’en-tête ET de l’index').toBeGreaterThanOrEqual(2);
  });

  it('l’index est COLLANT sous l’en-tête, sur fond opaque · jamais glissé derrière après un saut', () => {
    // Recette #710 · après un saut, l'index restait au-dessus de la section,
    // donc SOUS l'en-tête collant, puces coupées.
    const out = html();
    const nav = out.slice(out.lastIndexOf('<nav', out.indexOf('href="#couleurs"')), out.indexOf('href="#couleurs"'));
    expect(nav, 'l’index n’est plus collant · il repartira sous l’en-tête').toContain('position:sticky');
    expect(nav, 'l’index ne se cale pas juste sous l’en-tête (65px)').toContain('top:65px');
    expect(nav, 'l’index collant est transparent · le contenu défilerait à travers').toContain('background:var(--bg)');
  });

  it('l’état vide (ni couleur ni police) reste propre et garde le geste « Récupérer la DA »', () => {
    const out = html({ colors: [], fonts: [], logoUrl: null });
    expect(out, 'l’ancre #couleurs doit tenir même à vide').toContain('id="couleurs"');
    expect(out, 'l’état vide doit s’expliquer, pas montrer une boîte vide').toContain('Aucune couleur ni police');
    expect(out, 'le geste « Récupérer la DA » doit rester visible à vide').toContain('Récupérer la DA');
  });
});
