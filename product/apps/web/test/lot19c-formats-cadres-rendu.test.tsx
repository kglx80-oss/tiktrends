import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

/**
 * Lot 19C · message 55 · les écrans des formats RENDUS portent les cadres de la
 * charte (#725 · `--line` cadres, `--line-2` contrôles, `--r-card` 20,
 * `--r-md` 12, `vide` en pointillé `--line-2`).
 *
 * La garde source (`lot19d-cadres-source`) exempte une carte-lien qui porte la
 * cible tactile · les cartes de format de `/veille/formats` (r14, `--line`)
 * passaient ainsi. On rend donc les écrans et on LIT chaque style de bloc
 * bordé (modèle · `lot19a-accueil-cadres-rendu`).
 *
 * `AdCard` est doublée · c'est un composant de la Veille (`HORS_LOT` · autre
 * lot) · on lit ici les cadres propres aux écrans des formats, pas les siens.
 */
const session = vi.hoisted(() => ({ plan: 'starter' as string }));
vi.mock('../components/AdCard', () => ({ AdCard: () => <div data-adcard="" /> }));
vi.mock('../components/Toast', () => ({ useToast: () => ({ toast: () => {} }), useToastSiPresent: () => null }));
vi.mock('next/navigation', () => ({
  redirect: (u: string) => { throw new Error('redirect ' + u); },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/veille/formats',
}));
vi.mock('../app/actions/inspo', () => ({ classerFormatSauvegarde: async () => ({ ok: true }), setSavedAdFolder: async () => {} }));
vi.mock('../app/actions/adsmap-bridge', () => ({ trackSavedAdAction: async () => ({}) }));
vi.mock('../lib/auth', () => ({
  getSession: async () => ({ user: { id: 'u', email: 'membre@test.local', name: 'M' }, workspaceId: 'w', workspaceName: 'W', role: 'member', plan: session.plan }),
}));
vi.mock('../lib/brands', () => ({ getActiveBrand: async () => null }));

import { CRITERES_FORMATS_DEFAUT, lireFormatCreatif, type CriteresFormats } from '@tiktrends/core';
import type { InspoAd } from '@tiktrends/integrations';
import { VueFormats, type AnnonceSauvegardee } from '../app/(app)/veille/formats/VueFormats';
import { PreparerTest } from '../app/(app)/veille/formats/PreparerTest';
import FormatsPage from '../app/(app)/veille/formats/page';
import { FormatChoix } from '../app/(app)/saved/FormatChoix';
import { SavedBoards } from '../components/SavedBoards';

const STYLE = /<(a|div|section|article|p|li|ul)\b[^>]*style="([^"]*)"/g;
function cadresHorsRole(html: string): string[] {
  const fautes: string[] = [];
  for (const [, tag, st] of html.matchAll(STYLE)) {
    const bordure = /(?:^|;)border:1px (solid|dashed) ([^;]+)/.exec(st!);
    if (!bordure) continue;
    if (/(?:^|;)border-style:dashed/.test(st!)) bordure[1] = 'dashed';
    const rayon = /border-radius:([^;]+)/.exec(st!)?.[1] ?? '';
    if (/999|50%|--r-pill/.test(rayon)) continue; // pilule
    if (/(?:^|;)display:inline-flex/.test(st!)) continue; // bouton-lien compact ou puce · un contrôle
    // Vignette ou pastille · mêmes bornes que la garde source (largeur fixe < 160, hauteur fixe < 40) ·
    // la pastille d'icône d'`Empty` (46 × 46) n'est pas un cadre.
    const w = /(?:^|;)width:(\d+)px/.exec(st!), h = /(?:^|;)height:(\d+)px/.exec(st!);
    if ((w && +w[1]! < 160) || (h && +h[1]! < 40)) continue;
    if (bordure[1] === 'solid' && bordure[2] === 'var(--line-2)') fautes.push(`<${tag}> cadre plein en --line-2 · ${st!.slice(0, 90)}`);
    if (bordure[1] === 'dashed' && bordure[2] !== 'var(--line-2)') fautes.push(`<${tag}> état vide hors rôle (pointillé ${bordure[2]}) · prends vide · ${st!.slice(0, 90)}`);
    if (!/^var\(--r-(card|md)\)$/.test(rayon)) fautes.push(`<${tag}> rayon « ${rayon || 'aucun'} » hors rôle · ${st!.slice(0, 90)}`);
  }
  return fautes;
}

const ad = (id: string, mediaType: string): InspoAd => ({ id, platform: 'meta', status: 'active', daysRunning: 7, mediaType, advertiserName: 'Annonceur ' + id });
const annonce = (id: string, mediaType: string, f: unknown, platform = 'meta'): AnnonceSauvegardee => ({
  id: 'sv-' + id, platform, externalId: id, ad: ad(id, mediaType), mediaType, daysRunning: 7,
  sauvegardeLe: '2026-10-01T10:00:00Z', format: lireFormatCreatif({ formatCreatif: f }), auteurNom: 'Camille',
});
const lot: AnnonceSauvegardee[] = [
  annonce('p1', 'image', { id: 'packshot', version: 1, date: '2026-10-04T09:00:00Z' }),
  annonce('p2', 'image', { id: 'packshot', version: 1, date: '2026-10-03T09:00:00Z' }, 'tiktok'),
  annonce('v1', 'video', { id: 'face_camera', version: 1 }),
  annonce('i1', 'image', { id: 'incertain', version: 1 }),
  annonce('n1', 'image', null),
];
const vue = (annonces: AnnonceSauvegardee[], c: Partial<CriteresFormats> = {}, adsmap = true) =>
  renderToStaticMarkup(<VueFormats annonces={annonces} criteres={{ ...CRITERES_FORMATS_DEFAUT, ...c }} marque="Neva" suivis={[]} adsmap={adsmap} />);
const saved = (indispo: string | null) => renderToStaticMarkup(
  <SavedBoards adsmap followKeys={[]} formatIndisponible={indispo}
    items={lot.map((a) => ({ id: a.id, ad: a.ad, folder: a.externalId === 'p1' ? 'Hooks' : null, externalId: a.externalId, platform: a.platform, format: a.format }))} />,
);

describe('lot 19C · écrans des formats rendus · chaque cadre porte son rôle', async () => {
  session.plan = 'starter';
  const verrou = renderToStaticMarkup(await FormatsPage({ searchParams: Promise.resolve({}) }));
  const ecrans: Array<[string, string]> = [
    ['Formats · liste (classées, à classer, incertaines, formats sans annonce)', vue(lot)],
    ['Formats · grille d’un format, pont Adsmap', vue(lot, { format: 'packshot' })],
    ['Formats · grille des non classées', vue(lot, { format: 'non_classe' })],
    ['Formats · aucune sauvegarde', vue([])],
    ['Formats · aucune classée', vue([annonce('n1', 'image', null)])],
    ['Formats · toutes classées (grille non classée vide)', vue([annonce('p1', 'image', { id: 'packshot', version: 1 })], { format: 'non_classe' })],
    ['Formats · filtres ouverts sans résultat', vue(lot, { media: 'video', plateforme: 'tiktok' })],
    ['Formats · verrou (sans la Veille)', verrou],
    ['PreparerTest', renderToStaticMarkup(<PreparerTest platform="meta" externalId="p1" />)],
    ['FormatChoix · ouvert', renderToStaticMarkup(<FormatChoix platform="meta" externalId="p1" mediaType="image" initial="packshot" />)],
    ['FormatChoix · indisponible', renderToStaticMarkup(<FormatChoix platform="meta" externalId="p1" mediaType="image" initial={null} indisponible="Classement réservé à la Veille · offre Core." />)],
    ['Sauvegardes · cartes avec Format', saved(null)],
    ['Sauvegardes · Format indisponible', saved('Classement réservé à la Veille · offre Core.')],
  ];
  it('on lit bien des cadres', () => {
    const n = ecrans.reduce((s, [, h]) => s + [...h.matchAll(STYLE)].filter((m) => /border:1px/.test(m[2]!)).length, 0);
    expect(n).toBeGreaterThanOrEqual(20);
  });
  for (const [nom, html] of ecrans) {
    it(nom, () => {
      const fautes = cadresHorsRole(html);
      expect(fautes, `Cadre(s) hors rôle :\n${fautes.join('\n')}`).toEqual([]);
    });
  }
  it('une carte de format est une `surface` (même cliquable, même à 44 px)', () => {
    const balise = /<a\b[^>]*data-format="packshot"[^>]*>/.exec(ecrans[0]![1])?.[0] ?? '';
    expect(balise, 'la carte Packshot n’est pas rendue').not.toBe('');
    expect(balise).toContain('border:1px solid var(--line);border-radius:var(--r-card)');
  });
  it('« à classer » et « incertaines » sont des états `vide` (pointillé --line-2, r-card)', () => {
    const aClasser = /<div\b[^>]*data-a-classer[^>]*>/.exec(ecrans[0]![1])?.[0] ?? '';
    expect(aClasser, 'le bandeau « à classer » n’est pas rendu').not.toBe('');
    expect(aClasser).toContain('border:1px dashed var(--line-2);border-radius:var(--r-card)');
    const incertaines = /<a\b[^>]*format=incertain[^>]*>/.exec(ecrans[0]![1])?.[0] ?? '';
    expect(incertaines, 'la carte « incertaines » n’est pas rendue').not.toBe('');
    expect(incertaines).toContain('border:1px dashed var(--line-2);border-radius:var(--r-card)');
  });
  it('un format sans annonce est une `tuile` (dans le dépliant)', () => {
    const li = /<ul data-formats-vides[^>]*>\s*<li\b[^>]*>/.exec(ecrans[0]![1])?.[0] ?? '';
    expect(li, 'la liste des formats sans annonce n’est pas rendue').not.toBe('');
    expect(li).toContain('border:1px solid var(--line);border-radius:var(--r-md)');
  });
  it('le verrou est une `surface`', () => {
    expect(verrou).toContain('Fonctionnalité incluse dès l’abonnement Core');
    expect(verrou).toMatch(/<div style="[^"]*border:1px solid var\(--line\);border-radius:var\(--r-card\)[^"]*text-align:center/);
  });
  it('les contrôles gardent la bordure des contrôles (choix, pont Adsmap)', () => {
    expect(ecrans[9]![1]).toMatch(/<select[^>]*style="[^"]*border:1px solid var\(--line-2\)/);
    expect(ecrans[8]![1]).toMatch(/<button[^>]*style="[^"]*border:1px solid var\(--line-2\)/);
  });
});
