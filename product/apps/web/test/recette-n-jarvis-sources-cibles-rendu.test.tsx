import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Recette N · /jarvis/sources à 390 px. Mesuré dans le navigateur ·
 * « Retour à la conversation » 158×19 px, les gestes des couches (« Compléter
 * la marque › », « Décrire les créas › »…) 326×17 px, « Détail › » 38×18 px,
 * le dépliant de la mémoire 358×19 px, « Voir les formules › » ~33 px · des
 * liens seuls sur leur ligne, visés au doigt.
 *
 * On REND la vraie page (session fondateur simulée, couches et mémoire
 * simulées, ni base ni réseau ni modèle) et on lit ces cibles · chacune doit
 * offrir au moins 44 px de haut. Les boutons d'IA (Décrire, Entraîner) ne sont
 * pas rendus ici · composants clients simulés, aucun appel.
 */
const etat = vi.hoisted(() => ({ voitMemoire: true }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('redirect ' + u); } }));
vi.mock('../lib/auth', () => ({ getSession: async () => ({ workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', user: { id: 'u', email: 'fondateur@exemple.invalid', name: 'K' } }) }));
vi.mock('@tiktrends/db', () => ({ db: null, schema: {} }));
vi.mock('../lib/rbac', async (orig) => ({ ...(await orig<typeof import('../lib/rbac')>()), canAccess: () => etat.voitMemoire }));
vi.mock('../lib/access', () => ({ effectiveAccess: () => ({}) }));
vi.mock('../lib/founder', () => ({ isFounder: () => true }));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => ({ id: 'b1', name: 'Neva' }) }));
vi.mock('../lib/jarvis-memory', () => ({
  jarvisMeasuredMemory: async () => 'Mémoire mesurée synthétique',
  jarvisStats: async () => ({
    stats: [{ dimension: 'mechanism', key: 'Preuve sociale', nConclusive: 3, hitRate: 0.5, nWinners: 1, nBaby: 0 }],
    globalRate: 0.3, nAds: 5, tauxProtocole: { taux: null, succes: 0, evaluables: 0 },
  }),
}));
vi.mock('../lib/jarvis-state', () => ({
  STATE_LABEL: { on: 'actif', partial: 'partiel', off: 'éteint', always: 'toujours actif' },
  jarvisSnapshot: async () => ({
    layers: [{ key: 'ancrage', icon: 'target', title: 'Ancrage marque', what: 'Direction artistique.', state: 'partial', detail: '2/4', fix: { label: 'Compléter la marque', href: '/brands/b1' } }],
    liveCount: 0, dataCount: 1, summary: '',
  }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ blocked: false, summary: 'Plafond synthétique.' }) }));
vi.mock('../lib/deployment', () => ({ currentDeployment: async () => null }));
vi.mock('../app/(app)/jarvis/JarvisRules', () => ({ JarvisRules: () => null }));
vi.mock('../app/(app)/jarvis/JarvisTraining', () => ({ JarvisTraining: () => null }));
vi.mock('../app/(app)/jarvis/DescribePanel', () => ({ DescribePanel: () => null }));

import JarvisSourcesPage from '../app/(app)/jarvis/sources/page';

const HAUT_MIN = /min-height:(4[4-9]|[5-9]\d)px/;
/** La balise ouvrante de l'élément `tag` dont le texte visible est `texte`. */
function balise(html: string, tag: string, texte: string): string {
  const m = [...html.matchAll(new RegExp(`<${tag} ([^>]*)>([\\s\\S]*?)</${tag}>`, 'g'))]
    .find((x) => x[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() === texte);
  return m ? m[1]! : '';
}

describe('Recette N · /jarvis/sources · les liens seuls se visent au doigt (≥ 44 px)', () => {
  it('retour, geste de couche, détail de dépense, dépliant de la mémoire', async () => {
    etat.voitMemoire = true;
    const html = renderToStaticMarkup(await JarvisSourcesPage());
    for (const [tag, texte] of [
      ['a', 'Retour à la conversation'],
      ['a', 'Compléter la marque ›'],
      ['a', 'Détail ›'],
      ['summary', 'Voir la mémoire de performance utilisée pour la génération'],
    ] as const) {
      const b = balise(html, tag, texte);
      expect(b, `« ${texte} » introuvable dans la page rendue`).not.toBe('');
      expect(b, `« ${texte} » reste une cible de moins de 44 px de haut à 390`).toMatch(HAUT_MIN);
    }
  });

  it('sans l’offre Plus · « Voir les formules › »', async () => {
    etat.voitMemoire = false;
    const html = renderToStaticMarkup(await JarvisSourcesPage());
    const b = balise(html, 'a', 'Voir les formules ›');
    expect(b, '« Voir les formules › » introuvable').not.toBe('');
    expect(b, '« Voir les formules › » reste une cible de moins de 44 px de haut').toMatch(HAUT_MIN);
  });
});
