import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import LegalLayout from '../app/legal/layout';
import { LEGAL_NAV } from '../lib/legal';

/**
 * Recette N · pages légales à 390 px. Mesuré dans le navigateur · les six
 * liens de l'en-tête (le logo et les cinq documents) faisaient 26 à 31 px de
 * haut, côte à côte, sur les six pages /legal/* · une navigation qu'on vise au
 * doigt sur téléphone.
 *
 * On REND le vrai gabarit et on lit l'en-tête · chaque lien doit offrir une
 * cible d'au moins 44 px de haut, et la liste des documents doit rester entière.
 */
const html = renderToStaticMarkup(<LegalLayout><main>contenu</main></LegalLayout>);
const entete = html.slice(html.indexOf('<header'), html.indexOf('</header>'));
const liens = [...entete.matchAll(/<a ([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({ attrs: m[1]!, texte: m[2]!.replace(/<[^>]+>/g, '').trim() }));
const HAUT_MIN = /min-height:(4[4-9]|[5-9]\d)px/;

describe('Recette N · /legal · l’en-tête se vise au doigt (≥ 44 px)', () => {
  it('l’en-tête porte le logo et les cinq documents', () => {
    expect(liens.map((l) => l.texte)).toEqual(['TikTrends', ...LEGAL_NAV.map((l) => l.label)]);
  });

  it('chaque lien de l’en-tête offre au moins 44 px de haut', () => {
    for (const l of liens) {
      expect(l.attrs, `« ${l.texte} » reste une cible de moins de 44 px de haut dans l’en-tête légal`).toMatch(HAUT_MIN);
    }
  });
});
