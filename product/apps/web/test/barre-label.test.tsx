import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BarreLabel } from '../components/BarreLabel';

/**
 * La ligne « libellé · valeur · barre » qui classe media mix, CTA, landings.
 * Elle vivait recopiée à la main avec sa barre nue (muette, menteuse sur les
 * petites parts). On éprouve le RÉSULTAT rendu : une progressbar accessible,
 * une part proportionnée, un filet minimal, et la valeur libre affichée telle
 * quelle (compte OU pourcentage).
 */

function largeur(html: string): number {
  return Number(html.match(/width:(\d+)%/)?.[1] ?? -1);
}
function aria(html: string): number {
  return Number(html.match(/aria-valuenow="(\d+)"/)?.[1] ?? -1);
}

describe('BarreLabel · une ligne classée, sa barre parle', () => {
  it('rend une progressbar accessible · plus de div de largeur nu', () => {
    const html = renderToStaticMarkup(<BarreLabel label="facebook" n={30} max={40} />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('facebook');
    expect(aria(html)).toBe(75); // 30/40 = 75 %
  });

  it('la valeur affichée est libre · un pourcentage formaté au lieu du compte', () => {
    const html = renderToStaticMarkup(<BarreLabel label="image" n={3} max={4} valeur="75%" />);
    expect(html).toContain('75%');
    // La part reste calculée sur n/max, indépendante du texte affiché.
    expect(aria(html)).toBe(75);
  });

  it('sans valeur explicite, affiche le compte brut', () => {
    const html = renderToStaticMarkup(<BarreLabel label="En savoir plus" n={12} max={20} tronque />);
    expect(html).toContain('>12<');
  });

  it('une part minuscule reste VISIBLE · filet minimal atteint l’écran', () => {
    // 1/100 = 1 % → aria garde 1, largeur relevée à 3 % (sinon barre invisible).
    const html = renderToStaticMarkup(<BarreLabel label="rare" n={1} max={100} />);
    expect(aria(html)).toBe(1);
    expect(largeur(html)).toBeGreaterThanOrEqual(3);
  });

  it('une part nulle ne rend aucune largeur', () => {
    const html = renderToStaticMarkup(<BarreLabel label="zéro" n={0} max={100} />);
    expect(largeur(html)).toBe(0);
    expect(aria(html)).toBe(0);
  });
});

/**
 * La page concurrent est un composant serveur (imports `server-only`) · on ne
 * peut pas la rendre ici, alors on éprouve l'ADOPTION par la source, comme pour
 * les états vides. Le RÉSULTAT, lui, est garanti par le rendu de BarreLabel
 * ci-dessus.
 */
describe('la page concurrent a adopté BarreLabel · plus de barre à la main', () => {
  const src = readFileSync(join(process.cwd(), 'app/(app)/brands/[id]/competitors/[name]/page.tsx'), 'utf8');
  it('importe et utilise BarreLabel', () => {
    expect(src).toContain("import { BarreLabel }");
    expect(src).toContain('<BarreLabel');
  });
  it('ne calcule plus aucune largeur de barre à la main', () => {
    // Le motif banni : une largeur en pourcentage interpolée (gabarit `…%`).
    expect(src, 'largeur de barre écrite à la main').not.toMatch(/width:\s*`[^`]*%[^`]*`/);
  });
});
