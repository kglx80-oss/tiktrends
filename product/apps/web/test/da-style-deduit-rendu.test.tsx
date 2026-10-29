import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Le STYLE que l'agent déduit du site doit se VOIR en mots · sinon c'est une
 * boîte noire : l'utilisateur dépense, ça contraint la génération, mais il ne
 * peut ni vérifier ni corriger ce que l'agent a compris. On rend le composant
 * et on lit le HTML · un champ oublié ou un rendu vide se verrait ici.
 *
 * On ne teste PAS la présence d'un appel · on lit ce qui s'affiche.
 */
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), useSearchParams: () => new URLSearchParams(), usePathname: () => '/brands/b1/identite' }));

// Vague 2 · la fiche V5 est retirée · le style déduit se lit sur l'Identité
// Spatiale (tuile « Style visuel », règle `styleVisuelMarque` du noyau).
import { styleVisuelMarque, type DaVisuelleMarque } from '@tiktrends/core';
import { Identite } from '../spatial/vues/marque/Identite';
import { sousNavMarque } from '../spatial/vues/marque/base';

const da = {
  style: 'éditorial minimaliste, beaucoup de blanc',
  photo: 'macro produit sur fond crème',
  ambiance: 'premium et rassurant',
  lumiere: 'lumière naturelle douce',
  couleurs: 'tons crème et vert sauge',
  aEviter: ['rendu stock', 'dégradés criards'],
};

const action = async () => {};
function html(over: { daVisuelle?: typeof da | null } = {}): string {
  const st = styleVisuelMarque(('daVisuelle' in over ? over.daVisuelle : da) as DaVisuelleMarque | null);
  const out = renderToStaticMarkup(
    <Identite
      sousNav={sousNavMarque('b1')} brandId="b1" favicon={{ brandId: 'b1', image: null, initiale: 'A', titre: 't', detail: 'd', recuperer: null, raisonRecuperer: null, importLogo: { logos: [], defaut: null, couleurs: [], polices: [], actions: null, raison: 'r' } }}
      sync={{ brandId: 'b1', site: null, relancer: null, raison: 'r', cout: null }} identite={{ complet: true, lignes: [] }} couleurs={[]} typo={[]} ton={{ complet: true, lignes: [] }} vocabulaire={[]}
      gestion={{
        nom: 'A', champs: [], edition: { action, valeurs: {} },
        style: { lignes: st.lignes, champs: st.champs, analyser: action, cout: 5, raison: null, corriger: action },
        logos: { logos: [], defaut: null, apercus: {}, couleurs: [], polices: [], enregistrer: null },
        sourcing: { prix: '5 crédits', proposer: null, ajouter: null, raison: 'r' }, connexions: [], supprimer: null, retours: {},
      }}
    />,
  );
  const i = out.indexOf('data-geste="style-visuel"');
  return out.slice(i, out.indexOf('</section>', i));
}

describe('Le style déduit du site se voit et se corrige', () => {
  it('rend chaque facette du style déduit, en mots', () => {
    const out = html();
    expect(out, 'le style déduit n’est pas listé').toContain('<dt>Style</dt>');
    for (const bout of [da.style, da.photo, da.ambiance, da.lumiere, da.couleurs]) {
      expect(out, `facette absente du rendu : ${bout}`).toContain(bout);
    }
    expect(out, 'les éléments « à éviter » ne sont pas rendus').toContain('rendu stock');
    expect(out, 'les éléments « à éviter » ne sont pas rendus').toContain('dégradés criards');
  });

  it('une DA vide n’affiche aucun bloc de style (rien à montrer)', () => {
    const out = html({ daVisuelle: null });
    expect(out, 'un bloc de style s’affiche alors qu’il n’y a rien').not.toContain('<dt>');
    expect(out).toContain('Aucun style déduit');
  });

  it('la correction du style ne dépense pas · action gardée, écrit brandKit', () => {
    const src = readFileSync(join(process.cwd(), 'app/actions/brand-detail.ts'), 'utf8');
    const i = src.indexOf('export async function saveBrandVisualDaAction');
    expect(i, 'l’action de correction du style est introuvable').toBeGreaterThan(-1);
    const j = src.indexOf('\nexport ', i + 10);
    const fn = src.slice(i, j > i ? j : i + 900);
    expect(fn, 'la marque n’est pas gardée (guardBrand)').toContain('guardBrand(brandId)');
    expect(fn, 'la correction n’écrit pas dans brandKit').toContain('brandKit: da');
    // Levier GRATUIT · aucune dépense ne doit se glisser dans cette action.
    expect(fn, 'la correction ne doit pas réserver de crédits').not.toContain('reserveCredits(');
    expect(fn, 'la correction ne doit pas appeler l’IA').not.toContain('guardedAnthropic(');
  });

  it('une DA malformée (aEviter en chaîne) ne fait PAS tomber le rendu', () => {
    // C'est la forme qui crashait la page marque côté client après l'analyse ·
    // renderToStaticMarkup lève si le composant lève. On rend, on ne casse pas.
    const casse = { style: 'net et lumineux', aEviter: 'surcharge, stock' } as unknown as typeof da;
    let out = '';
    expect(() => { out = html({ daVisuelle: casse }); }, 'le rendu a levé sur une DA malformée').not.toThrow();
    expect(out, 'le style tient malgré la DA malformée').toContain('net et lumineux');
  });

  it('l’écran de marque passe la DA visuelle à l’écran', () => {
    const page = readFileSync(join(process.cwd(), 'app/(spatial)/sp/brands/[id]/identite/page.tsx'), 'utf8');
    expect(page, 'brandKit n’est pas transmis à l’Identité').toContain('styleVisuelMarque(b.brandKit as DaVisuelleMarque | null)');
  });
});
