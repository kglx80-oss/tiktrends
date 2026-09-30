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

describe('Accueil · bandeau à la une (hero, CTA réel)', () => {
  const html = renderToStaticMarkup(
    <HomeBandeau contenu={{ titre: 'Trouve ta prochaine créative winneuse', sous: 'Analyse, hypothèse, variantes.', ctaLabel: 'Créer une pub', href: '/studio/ads' }} />,
  );
  it('affiche titre, sous-titre et un CTA vers une route réelle', () => {
    expect(html).toContain('Trouve ta prochaine créative winneuse');
    expect(html).toContain('Créer une pub');
    expect(html).toContain('href="/studio/ads"');
  });
  it('est le hero de la Home (dégradé accent · l’exception hero de la Home)', () => {
    expect(html).toContain('var(--grad-accent)');
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
