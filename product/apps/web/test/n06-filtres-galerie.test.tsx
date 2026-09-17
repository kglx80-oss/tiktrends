import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { BarreFiltresGalerie } from '../components/BarreFiltresGalerie';
import { CRITERES_DEFAUT, type CriteresGalerie } from '@tiktrends/core';

/**
 * CDC v7 · N06 (tranche 2) · la barre de filtres locale de la galerie.
 */

const crit = (o: Partial<CriteresGalerie> = {}): CriteresGalerie => ({ ...CRITERES_DEFAUT, ...o });
const html = (criteres: CriteresGalerie, nGarde = 41, nTotal = 41) => renderToStaticMarkup(
  <BarreFiltresGalerie criteres={criteres} onChange={() => {}}
    formats={['testimonial', 'offer']} formatLabel={(f) => (f === 'offer' ? 'Offre' : 'Témoignage')}
    nGarde={nGarde} nTotal={nTotal} />,
);

describe('BarreFiltresGalerie · champs nommés et résumé', () => {
  it('chaque champ porte un libellé associé (recherche + selects)', () => {
    const h = html(crit());
    // Autant de <label for="…"> que de champs avec id · pas de champ orphelin.
    const fors = [...h.matchAll(/<label[^>]*\sfor="([^"]+)"/g)].map((m) => m[1]);
    const ids = [...h.matchAll(/\s(?:id)="([^"]+)"/g)].map((m) => m[1]);
    expect(fors.length, 'au moins recherche + 4 selects').toBeGreaterThanOrEqual(5);
    for (const f of fors) expect(ids, `le label pointe un champ existant (${f})`).toContain(f);
  });

  it('sans critère actif · ni résumé ni « Effacer »', () => {
    const h = html(crit());
    expect(h).not.toContain('Effacer les filtres');
  });

  it('avec un critère actif · résumé (n sur total) + « Effacer »', () => {
    const h = html(crit({ format: 'offer', qualite: 'prete' }), 12, 41);
    expect(h, 'le compte honnête n’apparaît pas').toContain('12');
    expect(h).toContain('Offre');
    expect(h).toContain('Prête à diffuser');
    expect(h).toContain('Effacer les filtres');
  });
});

describe('N06 (tranche 2) · le câblage de la galerie (garde de source)', () => {
  const shell = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

  it('la grille est alimentée par la liste FILTRÉE, paginée sur elle', () => {
    expect(shell).toMatch(/filtrerTriGalerie\(/);
    expect(shell).toMatch(/const pagedAds = adsFiltrees\.slice/);
    expect(shell).toMatch(/total=\{adsFiltrees\.length\}/);
  });

  it('le détail s’ouvre par ID sur la liste complète · filtrer ne casse pas la nav', () => {
    expect(shell).toMatch(/const idx = ads\.findIndex\(\(x\) => x\.id === a\.id\)/);
  });

  it('changer un filtre revient à la première page', () => {
    expect(shell).toMatch(/onChange=\{\(c\) => \{ setCriteres\(c\); setAdsPage\(0\); \}\}/);
  });
});
