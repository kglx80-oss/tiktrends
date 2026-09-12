import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Landing } from '../app/Landing';

/**
 * Ce que la page d’accueil AFFICHE, et les règles d’interface du dépôt.
 *
 * ── Pourquoi ce fichier existe ───────────────────────────────────────────────
 *
 * La landing a régressé plusieurs fois sans qu’aucun test ne l’attrape · le
 * titre du hero décentré (un `max-width` figé sur le h1 le décalait dès que la
 * ligne dépassait la largeur en Geist · la police de repli tenait dedans, d’où
 * un défaut invisible en test), une bordure incohérente, le mur de créatives
 * noyé. À chaque fois, seul un screenshot manuel a vu le défaut.
 *
 * On rend donc la page et on lit le HTML émis · styles compris, car le style de
 * la landing est embarqué dans le composant. On vérifie un RÉSULTAT, jamais la
 * présence d’un appel : un bloc mort ne produit aucun texte, et un h1
 * recontraint réintroduit le `max-width` qu’on interdit ici.
 *
 * Pas de DOM · `renderToStaticMarkup` suffit, on ne clique pas.
 */

const html = renderToStaticMarkup(<Landing />);

describe('accueil · règles d’interface du dépôt', () => {
  it('aucun tiret cadratin · on écrit « · »', () => {
    expect(html, 'un tiret cadratin (—) s’est glissé dans la page').not.toContain('—');
  });

  it('marque blanche · « Trendtrack » n’apparaît jamais', () => {
    expect(html, '« Trendtrack » réapparaît à l’écran').not.toMatch(/Trendtrack/i);
  });

  it('« Adsmap » s’écrit Adsmap, jamais ADSMAP', () => {
    expect(html, 'Adsmap absent de la page').toContain('Adsmap');
    expect(html, 'ADSMAP en capitales à l’écran').not.toContain('ADSMAP');
  });
});

describe('accueil · le hero et son contenu tiennent', () => {
  it('le titre du hero n’est pas recontraint en largeur (sinon il se décentre)', () => {
    const regle = html.match(/\.lp-h1\{[^}]*\}/)?.[0] ?? '';
    expect(regle, 'la règle .lp-h1 est introuvable dans le style émis').not.toBe('');
    expect(regle, 'un max-width sur .lp-h1 casse le centrage du titre du hero').not.toContain('max-width');
  });

  it('les quatre prix réels sont affichés', () => {
    for (const prix of ['0€', '99€', '299€', '990€']) {
      expect(html, `le prix ${prix} a disparu de la grille tarifs`).toContain(prix);
    }
  });

  it('les appels à l’action mènent à l’inscription et à la connexion', () => {
    expect(html, 'aucun CTA vers /signup').toContain('href="/signup"');
    expect(html, 'aucun lien vers /login').toContain('href="/login"');
  });
});

describe('accueil · transitions et animations', () => {
  it('les animations continues sont définies (entrée, carrousel, flottement)', () => {
    for (const kf of ['@keyframes lpRise', '@keyframes lpMarqL', '@keyframes lpFloaty', '@keyframes lpEnter']) {
      expect(html, `${kf} a disparu du style`).toContain(kf);
    }
  });

  it('les sections se révèlent au défilement', () => {
    const n = html.split('lp-reveal').length - 1;
    expect(n, `révélation câblée sur trop peu de sections (${n})`).toBeGreaterThanOrEqual(6);
    expect(html, 'la révélation n’est pas pilotée par le défilement').toContain('animation-timeline:view()');
  });

  it('le défilement des ancres est doux', () => {
    expect(html, 'scroll-behavior:smooth absent').toContain('scroll-behavior:smooth');
  });

  it('le mouvement est coupé pour qui le demande (accessibilité)', () => {
    expect(html, 'aucun garde prefers-reduced-motion').toContain('prefers-reduced-motion');
  });
});
