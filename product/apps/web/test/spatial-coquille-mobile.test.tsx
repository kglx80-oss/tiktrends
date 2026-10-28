// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { entreesRail, entreesRailEspace } from '@tiktrends/core';

/**
 * Spatial · la coquille en mobile (planche v4 · G1 et G15, banc à 390 px).
 *
 * Le CSS de la maquette est repris TEL QUEL (garde `spatial-fondation`) · deux
 * de ses règles cassent la mise en page mobile, et la coquille les neutralise
 * par un style en ligne. Chaque garde lit d'abord la règle FAUTIVE dans la
 * feuille (si la maquette change, la garde le dit), puis le HTML RENDU de la
 * coquille.
 *
 *  · G1 · `.rail .brandrow{width:100%}` · en barre du bas (≤ 760 px), logo et
 *    libellé de la rangée de marque sont masqués, mais la rangée réclamait
 *    toute la largeur de la barre · au banc, un bloc vide de 134 px et les
 *    quatre onglets comprimés à 20 px (cible tactile sous 44 px).
 *  · G15 · `html,body{min-height:100%}` · la hauteur de `html` est indéfinie,
 *    le pourcentage ne résout pas · sur une page plus courte que l'écran, le
 *    `body` opaque s'arrêtait sous le contenu (665 px sur 844 à Tagging) et le
 *    fond flou faisait une bande grise dessous.
 */

vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/tags', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn() }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn() }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn() }));

const { Coquille } = await import('../spatial/coquille/Coquille');
type Donnees = Parameters<typeof Coquille>[0]['donnees'];

const CSS = readFileSync(join(__dirname, '..', 'spatial', 'spatial.css'), 'utf8');
/** Les déclarations d'une règle de la feuille, à l'octet (sélecteur exact, hors et dans les @media). */
const regles = (selecteur: string) => [...CSS.matchAll(new RegExp(`(?:^|[}\\s])${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'gm'))].map((m) => m[1]!);
/** Le bloc `@media (max-width:760px){…}` qui contient la règle donnée. */
const dansMobile = (regle: string) => {
  for (const m of CSS.matchAll(/@media \(max-width:760px\)\{/g)) {
    let i = m.index! + m[0].length, prof = 1;
    const debut = i;
    while (prof > 0 && i < CSS.length) { if (CSS[i] === '{') prof++; else if (CSS[i] === '}') prof--; i++; }
    if (CSS.slice(debut, i).includes(regle)) return true;
  }
  return false;
};

const ouverts = new Set(['/studio/projets', '/veille', '/adsmap', '/assets', '/jarvis', '/brands', '/settings']);
const marque = { id: 'b1', nom: 'Neva' };
const DONNEES: Donnees = {
  entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
  marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }], peutGererMarques: true, admin: true,
  passer: null, railOuvert: false, espaceNom: 'GLX', nonLues: 0, deconnexion: async () => {},
  utilisateur: { nom: 'Kevin', initiales: 'K', email: 'k@x.fr', role: 'Fondateur' }, credits: { solde: 0, dotation: 0, illimite: true },
};
const rendu = () => {
  const t = document.createElement('template');
  t.innerHTML = renderToStaticMarkup(<Coquille donnees={DONNEES}><div className="view" /></Coquille>);
  return t.content;
};

describe('Spatial · coquille mobile · la barre du bas', () => {
  it('la feuille de la maquette donne toute la largeur à la rangée de marque et en masque les deux enfants en mobile (la cause de G1)', () => {
    expect(regles('.rail .brandrow').some((d) => /(^|;)width:100%/.test(d)), '`.rail .brandrow{width:100%}` a disparu de la feuille · relire G1').toBe(true);
    expect(dansMobile('.rail .logo{display:none}'), 'le logo n’est plus masqué en mobile · la rangée de marque redevient utile en barre du bas').toBe(true);
    expect(dansMobile('.rail .lab,'), 'le libellé n’est plus masqué en mobile').toBe(true);
  });

  it('la rangée de marque rendue ne réclame aucune largeur · `width:auto`, elle ne pousse plus les onglets', () => {
    const rangee = rendu().querySelector('nav.rail > .brandrow') as HTMLElement | null;
    expect(rangee, 'rangée de marque absente du rail').not.toBeNull();
    expect(rangee!.style.width, 'la rangée de marque reprend `width:100%` de la maquette · onglets écrasés à 20 px en barre mobile').toBe('auto');
  });

  it('chaque onglet visible de la barre mobile est une cible de 44 px (règle de la feuille), le bouton « Plus » 48 px', () => {
    expect(regles('.rail a').some((d) => d === 'width:44px;height:44px')).toBe(true);
    const plus = rendu().querySelector('nav.rail > #morebtn') as HTMLElement;
    expect([plus.style.width, plus.style.height]).toEqual(['48px', '48px']);
  });
});

describe('Spatial · coquille · le fond couvre la hauteur de l’écran', () => {
  it('la feuille pose un `min-height` en pourcentage sur `html,body` (la cause de G15)', () => {
    expect(regles('html,body').some((d) => d.includes('min-height:100%')), '`html,body{min-height:100%}` a disparu · relire G15').toBe(true);
  });

  it('le conteneur de l’application tient au moins la hauteur de l’écran · le `body` opaque ne s’arrête plus sous le contenu', () => {
    const app = rendu().querySelector('div.app') as HTMLElement | null;
    expect(app).not.toBeNull();
    expect(app!.style.minHeight, 'le `body` s’arrête sous le contenu · bande grise sous les pages courtes en mobile').toBe('100vh');
  });
});
