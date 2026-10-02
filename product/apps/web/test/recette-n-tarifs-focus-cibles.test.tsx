import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import TarifsPage from '../app/tarifs/page';

/**
 * Recette N · /tarifs. Mesuré dans le navigateur ·
 * 1. La bascule mensuel / annuel est une case cachée (0×0 px) · au Tab, le focus
 *    s'y pose (14e arrêt) mais l'anneau se dessine sur une case invisible · rien
 *    ne montre où l'on est, alors qu'Espace bascule bien les prix.
 * 2. À 390 px, « Connexion » (72×23), « Démarrer » (102×43), les deux logos
 *    (~30 px) et les liens du pied de page (20 px) sont des cibles trop basses.
 *
 * On REND la page et on lit le HTML · la règle qui reporte l'anneau sur la
 * bascule VISIBLE doit exister, et chaque lien de la barre et du pied de page
 * doit offrir au moins 44 px de haut.
 */
const html = renderToStaticMarkup(<TarifsPage />);
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
const HAUT_MIN = /min-height:(4[4-9]|[5-9]\d)px/;
const liensDe = (bloc: string) => [...bloc.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1]!, texte: m[2]!.replace(/<[^>]+>/g, '').trim() }));

describe('Recette N · /tarifs · le focus de la bascule se voit', () => {
  it('la case cachée reporte son anneau de focus sur la bascule visible', () => {
    expect(html, 'la case de bascule a disparu').toContain('id="tp-annuel"');
    expect(css, 'aucun anneau visible quand la bascule mensuel / annuel a le focus clavier').toMatch(/#tp-annuel:focus-visible\s*~\s*\.tp-billrow\s+\.tp-toggle\s*\{[^}]*outline:\s*2px solid/);
  });
});

describe('Recette N · /tarifs · la barre et le pied de page se visent au doigt (≥ 44 px)', () => {
  it('barre du haut · logo, « Connexion », « Démarrer »', () => {
    const barre = html.slice(html.indexOf('<nav class="lp-nav"'), html.indexOf('</nav>'));
    const cibles = liensDe(barre).filter((l) => ['TikTrends', 'Connexion'].includes(l.texte));
    expect(cibles.map((l) => l.texte)).toEqual(['TikTrends', 'Connexion']);
    for (const l of cibles) expect(l.attrs, `« ${l.texte} » reste une cible de moins de 44 px de haut dans la barre`).toMatch(HAUT_MIN);
    expect(css, '« Démarrer » (.lp-btn.sm) reste sous 44 px de haut').toMatch(/\.lp-btn\.sm\{[^}]*min-height:44px/);
  });

  it('pied de page · logo et liens', () => {
    const pied = html.slice(html.indexOf('<footer'), html.indexOf('</footer>'));
    const liens = liensDe(pied);
    expect(liens.map((l) => l.texte)).toEqual(['TikTrends', 'Créatives', 'Méthode', 'Adsmap', 'Tarifs', 'Mentions légales']);
    for (const l of liens) expect(l.attrs, `« ${l.texte} » reste une cible de moins de 44 px de haut dans le pied de page`).toMatch(HAUT_MIN);
  });
});
