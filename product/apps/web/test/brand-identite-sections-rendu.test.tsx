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
    expect(iCouleurs, 'la section « Couleurs & typographie » (#couleurs) manque').toBeGreaterThan(-1);
    expect(iCharte, 'la section « Charte & kit » (#charte) manque').toBeGreaterThan(-1);
    expect(iCouleurs, 'les deux ancres tombent au MÊME point · un seul repère pour deux libellés').not.toBe(iCharte);
  });

  it('les deux sections portent des libellés DISTINCTS', () => {
    const out = html();
    expect(out, 'le libellé « Couleurs & typographie » manque').toContain('Couleurs &amp; typographie');
    expect(out, 'le libellé « Charte &amp; kit » manque').toContain('Charte &amp; kit');
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

  it('les deux ancres portent scrollMarginTop (l’ancre ne cache pas le titre)', () => {
    const out = html();
    // 90px sur chaque section · une pour #couleurs, une pour #charte.
    const scrolls = out.match(/scroll-margin-top:90px/g) ?? [];
    expect(scrolls.length, 'une section au moins n’a pas de scrollMarginTop').toBeGreaterThanOrEqual(2);
  });

  it('l’état vide (ni couleur ni police) reste propre et garde le geste « Récupérer la DA »', () => {
    const out = html({ colors: [], fonts: [], logoUrl: null });
    expect(out, 'l’ancre #couleurs doit tenir même à vide').toContain('id="couleurs"');
    expect(out, 'l’état vide doit s’expliquer, pas montrer une boîte vide').toContain('Aucune couleur ni police');
    expect(out, 'le geste « Récupérer la DA » doit rester visible à vide').toContain('Récupérer la DA');
  });
});
