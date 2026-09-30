import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HomeBandeau } from '../components/HomeBandeau';
import { HomeMarques } from '../components/HomeMarques';

/**
 * La Home (Kevin, 30/09) · un bandeau à la une PUIS les marques du compte, avant
 * le reste. On vérifie le RÉSULTAT rendu, pas la présence d'un appel : le CTA
 * pointe une route réelle, chaque marque a sa carte-lien, l'active passe en tête,
 * les états (zéro/une/plusieurs, nom long) tiennent, et la hiérarchie est clouée.
 */
const marques = [
  { id: 'b-un', name: 'Neva' },
  { id: 'b-deux', name: 'Une marque au nom vraiment très long qui doit être tronqué proprement' },
  { id: 'b-trois', name: 'Klorea' },
];

describe('Accueil · bandeau à la une · analyse d’abord, fond calme', () => {
  const html = renderToStaticMarkup(
    <HomeBandeau contenu={{ titre: 'Prépare ton prochain test', sous: 'Analyse tes résultats, choisis quoi tester ensuite.', ctaLabel: 'Voir mes tests', href: '/adsmap', ctaSecLabel: 'Créer une pub', hrefSec: '/studio/ads' }} />,
  );
  it('copie orientée décision · pas de promesse « winneuse »', () => {
    expect(html).toContain('Prépare ton prochain test');
    expect(html, 'la copie « winneuse » doit avoir disparu').not.toContain('winneuse');
  });
  it('CTA PRIMAIRE vers l’analyse, création en SECONDAIRE', () => {
    // Primaire = analyse (Adsmap), et il précède le secondaire (création).
    expect(html).toContain('Voir mes tests');
    expect(html).toContain('href="/adsmap"');
    expect(html).toContain('href="/studio/ads"');
    expect(html.indexOf('/adsmap')).toBeLessThan(html.indexOf('/studio/ads'));
  });
  it('fond CALME (surface) avec accent rose CIBLÉ sur le CTA (pas un aplat)', () => {
    // La surface sombre porte le fond ; l'accent rose est sur le CTA primaire.
    expect(html, 'le fond n’est plus calme (surface)').toContain('var(--surface)');
    expect(html, 'l’accent rose du CTA a disparu').toContain('var(--grad-accent)');
  });
});

describe('Accueil · cartes des marques (Recent Projects)', () => {
  it('une carte-lien par marque, active en tête + aria-current, action « Nouvelle marque »', () => {
    const html = renderToStaticMarkup(<HomeMarques marques={marques} activeId="b-deux" />);
    for (const m of marques) expect(html, `la marque ${m.name} manque`).toContain(m.name);
    expect(html).toContain('href="/brands/b-un"');
    expect(html).toContain('href="/brands/b-deux"');
    // Active en tête · son bloc précède les autres.
    expect(html.indexOf('/brands/b-deux')).toBeLessThan(html.indexOf('/brands/b-un'));
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('Marque active');
    expect(html).toContain('href="/brands/new"');
    expect(html).toContain('Nouvelle marque');
  });

  it('nom long tronqué (ellipsis, nowrap), sans casser la carte', () => {
    const html = renderToStaticMarkup(<HomeMarques marques={marques} activeId={null} />);
    expect(html).toContain('text-overflow:ellipsis');
    expect(html).toContain('white-space:nowrap');
  });

  it('zéro marque · invite à créer, aucune fausse carte de marque', () => {
    const html = renderToStaticMarkup(<HomeMarques marques={[]} activeId={null} />);
    expect(html).toContain('Crée ta première marque');
    expect(html).toContain('href="/brands/new"');
    // Aucune carte de marque fictive (pas de /brands/<id> autre que new).
    expect(html).not.toMatch(/\/brands\/b-/);
  });
});

describe('Accueil · hiérarchie · bandeau PUIS marques, avant le reste', () => {
  const src = readFileSync(join(process.cwd(), 'components', 'AssistantHome.tsx'), 'utf8');
  it('le bandeau est rendu avant les marques, elles-mêmes avant la prochaine étape', () => {
    const iB = src.indexOf('{bandeau}');
    const iM = src.indexOf('{marques}');
    const iP = src.indexOf('{prochaineEtape}');
    expect(iB, 'le bandeau n’est pas rendu').toBeGreaterThan(-1);
    expect(iM, 'les marques doivent suivre le bandeau').toBeGreaterThan(iB);
    expect(iP, 'la prochaine étape doit suivre les marques').toBeGreaterThan(iM);
  });
});
