import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConnecteurBientot } from '../components/ConnecteurBientot';

/**
 * Un connecteur pas encore branchable annonce une feuille de route, pas une panne.
 *
 * ── Ce qu'on empêche ────────────────────────────────────────────────────────
 *
 * Le catalogue rendait chaque connecteur à venir avec un bouton « + Connecter »
 * désactivé · une cinquantaine de boutons grisés qui se lisent comme cassés. On
 * veut un STATUT « Bientôt », pas un geste refusé. On lit le RENDU, pas la
 * présence d'un appel.
 */

describe('la carte d’un connecteur à venir', () => {
  const html = renderToStaticMarkup(
    <ConnecteurBientot c={{ name: 'TikTok Ads', color: '#010101', glyph: 'T', priority: true }} />,
  );

  it('annonce le connecteur et son statut « Bientôt »', () => {
    expect(html).toContain('TikTok Ads');
    expect(html).toContain('Bientôt');
  });

  it('marque la priorité quand elle est posée', () => {
    expect(html).toContain('Prioritaire');
  });

  it('ne rend AUCUN bouton · rien à cliquer, donc rien qui promette un clic', () => {
    // Le défaut d'origine · un `<button disabled>+ Connecter</button>` qui se lit
    // comme cassé. Le statut le remplace.
    expect(html, 'un bouton subsiste dans la carte').not.toContain('<button');
    expect(html).not.toContain('+ Connecter');
  });
});

describe('le catalogue des connexions adopte la carte', () => {
  const SRC = readFileSync(join(process.cwd(), 'app/(app)/connections/page.tsx'), 'utf8');
  it('le catalogue rend ConnecteurBientot, plus de bouton désactivé à la main', () => {
    expect(SRC).toContain('<ConnecteurBientot');
    // Plus de bouton « + Connecter » désactivé écrit dans la page.
    expect(SRC, 'un bouton « + Connecter » subsiste dans le catalogue').not.toContain('+ Connecter');
  });
});
