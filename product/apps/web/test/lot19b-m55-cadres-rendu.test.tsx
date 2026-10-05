// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  creerConnaissance, publierVersion, nouvelleVersion, validerSaisie, vueConnaissance, apercuContextePlateforme, refConnaissance,
  ATTRIBUT_ROLE_CADRE, type Connaissance, type SaisieConnaissance, type Resultat,
} from '@tiktrends/core';

/**
 * Message 55 · les écrans de #724 RENDUS portent les cadres de la charte (#725 ·
 * `--line` cadres, `--line-2` contrôles, `--r-card` 20, `--r-md` 12).
 *
 * Sur le modèle de `lot19a-accueil-cadres-rendu` · la garde source exempte une
 * carte-lien qui porte la cible tactile, et ne voit pas les rayons < 13 · on
 * rend donc chaque écran (statique, ou monté en jsdom pour les états ouverts
 * par un geste) et on LIT chaque style de bloc bordé.
 *
 * Ce qui n'est pas un cadre est reconnu au rendu · pilule (999, 50 %), contrôle
 * compact (`inline-flex`), pastille (< 40 px), champ composite DÉCLARÉ
 * (`data-cadre="controle"`, charte), forme (coins inégaux · bulle de
 * conversation, voir `classerCadre`).
 */

const h = vi.hoisted(() => ({ session: null as unknown, vue: null as unknown, erreur: null as string | null, thread: null as unknown }));
vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('../lib/auth', () => ({ getSession: async () => h.session }));
vi.mock('next/navigation', () => ({ redirect: (u: string) => { throw new Error('REDIRECT ' + u); }, useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: unknown; children: ReactNode }) => <a href={typeof href === 'string' ? href : '#'} {...p}>{children}</a> }));
vi.mock('../app/actions/connaissances', () => ({
  chargerConnaissancesAction: async () => (h.erreur ? { error: h.erreur } : { vue: h.vue }),
  creerConnaissanceAction: async () => ({}), nouvelleVersionAction: async () => ({}),
  publierConnaissanceAction: async () => ({}), retirerConnaissanceAction: async () => ({}),
}));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: async () => (h.thread ? { thread: h.thread } : { error: 'ERREUR_FIL_55' }), clearChatAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-draft', () => ({ draftConceptAction: async () => ({}) }));
vi.mock('../app/actions/jarvis', () => ({ trainJarvisAction: async () => ({}), saveJarvisLearningsAction: async () => ({}), saveJarvisRulesAction: async () => ({}), proposeJarvisRulesAction: async () => ({}) }));
vi.mock('../app/actions/adsmap-analyze', () => ({
  analyzeAssetsAction: async () => ({}),
  analysisCoverageAction: async () => ({ coverage: { total: 10, described: 4, manual: 0, withoutAsset: 0, fromWritten: 0, pendingAsset: 6, pendingWritten: 0, nextBatch: 6, nextCostUsd: 0.12, totalCostUsd: 0.12 } }),
}));
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
    layers: [
      { key: 'a', icon: 'target', title: 'Ancrage marque', what: 'Direction artistique.', state: 'partial', detail: '2/4', fix: { label: 'Compléter la marque', href: '/brands/b1' } },
      { key: 'b', icon: 'brain', title: 'Règles', what: 'Règles maison.', state: 'off', detail: '0', fix: null },
      { key: 'c', icon: 'chart', title: 'Mémoire', what: 'Mesurée.', state: 'on', detail: 'ok', fix: null },
    ],
    liveCount: 1, dataCount: 1, summary: '',
  }),
}));
vi.mock('../lib/spend-guard', () => ({ spendStatus: async () => ({ blocked: true, summary: 'Plafond synthétique atteint.' }) }));
vi.mock('../lib/deployment', () => ({ currentDeployment: async () => ({ ok: false, summary: 'Écart synthétique.', renderVersion: 1, applied: 3, inBuild: 4, build: 'abc1234' }) }));

import ConnaissancesPage from '../app/(app)/admin/connaissances/page';
import { EcranConnaissances, Formulaire } from '../app/(app)/admin/connaissances/EcranConnaissances';
import type { VueAdminConnaissances } from '../app/actions/connaissances';
import SourcesPage from '../app/(app)/jarvis/sources/page';
import { RefusJarvis } from '../app/(app)/jarvis/RefusJarvis';
import { JarvisContexte } from '../app/(app)/jarvis/JarvisContexte';
import { JarvisChat } from '../app/(app)/jarvis/JarvisChat';
import { DescribePanel } from '../app/(app)/jarvis/DescribePanel';
import AdminBackstage from '../app/(app)/admin/page';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom ne fait pas défiler · le fil appelle `scrollTo` à chaque tour.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

/* -------------------------------------------------------------------------- */
/*  La lecture · chaque style de bloc bordé, rendu                            */
/* -------------------------------------------------------------------------- */

const BALISE = /<(a|div|section|article|p|li|ol|ul|pre)\b([^>]*)>/g;
/** jsdom écrit `border: 1px solid …; ` · on ramène à la forme du rendu serveur. */
const normaliser = (html: string) => html.replace(/style="([^"]*)"/g, (_m, st: string) => `style="${st.replace(/;\s*/g, ';').replace(/:\s+/g, ':').replace(/;$/, '')}"`);

export function cadresHorsRole(brut: string): string[] {
  const html = normaliser(brut);
  const fautes: string[] = [];
  for (const [, tag, attrs] of html.matchAll(BALISE)) {
    const st = /style="([^"]*)"/.exec(attrs!)?.[1];
    if (!st) continue;
    const bordure = /(?:^|;)border:1px (solid|dashed) ([^;]+)/.exec(st);
    if (!bordure) continue;
    if (/(?:^|;)border-style:dashed/.test(st)) bordure[1] = 'dashed';
    if (new RegExp(`${ATTRIBUT_ROLE_CADRE}="controle"`).test(attrs!)) continue; // champ composite déclaré
    const rayon = /border-radius:([^;]+)/.exec(st)?.[1]?.trim() ?? '';
    if (/999|50%|--r-pill/.test(rayon)) continue; // pilule
    if (rayon.split(/\s+/).length > 1 && new Set(rayon.split(/\s+/)).size > 1) continue; // forme · coins inégaux
    if (/(?:^|;)display:inline-flex/.test(st)) continue; // contrôle compact ou puce
    const dim = /(?:^|;)(?:width|height):(\d+)px/.exec(st);
    if (dim && +dim[1]! < 40) continue; // pastille
    const extrait = st.slice(0, 90);
    if (bordure[1] === 'solid' && bordure[2] === 'var(--line-2)') fautes.push(`<${tag}> cadre plein en --line-2 · ${extrait}`);
    if (bordure[1] === 'dashed' && bordure[2] !== 'var(--line-2)') fautes.push(`<${tag}> état vide hors rôle (pointillé ${bordure[2]}) · ${extrait}`);
    if (!/^var\(--r-(card|md)\)$/.test(rayon)) fautes.push(`<${tag}> rayon « ${rayon || 'aucun'} » hors rôle · ${extrait}`);
  }
  return fautes;
}
const nCadres = (html: string) => [...normaliser(html).matchAll(BALISE)].filter((m) => /border:1px/.test(m[2]!)).length;

/* -------------------------------------------------------------------------- */
/*  Les données                                                               */
/* -------------------------------------------------------------------------- */

const ok = <T,>(r: Resultat<T>): T => { if (!r.ok) throw new Error(r.erreur); return r.valeur; };
const s = (o: Partial<SaisieConnaissance>) => ok(validerSaisie({ titre: 'T', type: 'instruction', texte: 'x', origine: { mode: 'saisie' }, portee: { niveau: 'plateforme' }, ...o }));
const T = '2026-10-05T08:00:00.000Z';
const ID = (k: number) => `0000005${k}-bbbb-4bbb-8bbb-bbbbbbbbbbbb`;
function fixtures(): Connaissance[] {
  let a = creerConnaissance(ID(1), s({ titre: 'Méthode', type: 'methode', texte: 'Une variable à la fois.' }), 'e', T);
  a = ok(publierVersion(a, 1, 'e', T));
  a = ok(nouvelleVersion(a, s({ titre: 'Méthode', type: 'methode', texte: 'v2' }), 1, 'e', T));
  const b = creerConnaissance(ID(2), s({ titre: 'Brouillon', type: 'donnees', texte: 'CPM' }), 'e', T);
  return [a, b];
}
const vue = (l: Connaissance[]): VueAdminConnaissances => ({
  items: l.map((c) => ({ ...vueConnaissance(c), usage: { [refConnaissance(c.id, 1)]: { inclus: 2, cite: 1, dernierInclus: T, dernierCite: T } } })),
  apercu: apercuContextePlateforme(l),
});
const VALEURS = (niveau: 'plateforme' | 'espace' | 'marque') => ({ titre: 'T', type: 'methode' as const, texte: 'x', mode: 'saisie' as const, fichier: null, niveau, workspaceId: niveau === 'plateforme' ? '' : 'w', brandId: niveau === 'marque' ? 'b' : '' });
const fondateur = { user: { id: 'u', email: 'kguilbaux@agence-glx.fr', name: 'K' }, workspaceId: 'w', workspaceName: 'Espace', role: 'owner', plan: 'business', equipe: { role: 'adminplus', matrice: {} } };
const membreCore = { ...fondateur, user: { id: 'u2', email: 'membre@client.test', name: null }, role: 'member', plan: 'core', equipe: null };

/* -------------------------------------------------------------------------- */
/*  Montage jsdom · les états ouverts par un geste                            */
/* -------------------------------------------------------------------------- */

let root: Root | undefined;
let conteneur: HTMLDivElement | undefined;
afterEach(() => { if (root) act(() => root!.unmount()); conteneur?.remove(); root = undefined; conteneur = undefined; h.thread = null; h.erreur = null; });
async function monter(node: ReactNode): Promise<HTMLDivElement> {
  conteneur = document.createElement('div');
  document.body.appendChild(conteneur);
  const r = createRoot(conteneur);
  root = r;
  await act(async () => { r.render(node); });
  await act(async () => { await new Promise((x) => setTimeout(x, 0)); });
  return conteneur;
}
const clic = async (c: HTMLElement, texte: string) => {
  const b = [...c.querySelectorAll('button')].find((x) => x.textContent?.startsWith(texte));
  if (!b) throw new Error(`bouton « ${texte} » introuvable`);
  await act(async () => { b.click(); });
};

/* -------------------------------------------------------------------------- */

describe('message 55 · écrans de #724 rendus · chaque cadre porte son rôle', () => {
  const ecrans: Array<[string, () => Promise<string>]> = [
    ['/admin/connaissances · liste + formulaire', async () => { h.session = fondateur; h.vue = vue(fixtures()); return renderToStaticMarkup(await ConnaissancesPage()); }],
    ['/admin/connaissances · lecture en échec', async () => { h.session = fondateur; h.erreur = 'Lecture impossible.'; return renderToStaticMarkup(await ConnaissancesPage()); }],
    ['/admin/connaissances · vide', async () => renderToStaticMarkup(<EcranConnaissances vueInitiale={vue([])} espaces={[]} marques={[]} />)],
    ['formulaire · élargissement de portée', async () => renderToStaticMarkup(<Formulaire initial={VALEURS('plateforme')} porteeAvant={{ niveau: 'marque', workspaceId: 'w', brandId: 'b' }} titreFormulaire="v2" espaces={[]} marques={[]} occupe={false} onAnnuler={() => {}} onEnvoyer={async () => true} />)],
    ['formulaire · portée espace', async () => renderToStaticMarkup(<Formulaire initial={VALEURS('espace')} titreFormulaire="Nouvelle" espaces={[{ id: 'w', name: 'E' }]} marques={[]} occupe={false} onEnvoyer={async () => true} />)],
    ['carte · versions dépliées, publication ouverte et refusée (jsdom)', async () => {
      const c = await monter(<EcranConnaissances vueInitiale={vue(fixtures())} espaces={[]} marques={[]} />);
      await clic(c, 'Versions (');
      await clic(c, 'Publier v2');
      await clic(c, 'Publier v2');
      await clic(c, 'Publier'); // le formulaire, sans la case
      return c.innerHTML;
    }],
    ['/jarvis/sources · fondateur (déploiement, dépense bloquée, moteurs)', async () => { h.session = fondateur; return renderToStaticMarkup(await SourcesPage()); }],
    ['/jarvis/sources · membre Core (sans la mémoire Plus)', async () => { h.session = membreCore; return renderToStaticMarkup(await SourcesPage()); }],
    ['DescribePanel · tranche chiffrée (jsdom)', async () => (await monter(<DescribePanel />)).innerHTML],
    ['/jarvis · refus (offre, rôle)', async () => renderToStaticMarkup(<><RefusJarvis titre="Jarvis" why="plan" owner /><RefusJarvis titre="Jarvis" why="role" owner={false} /></>)],
    ['JarvisChat · fil en échec (jsdom)', async () => (await monter(<JarvisChat />)).innerHTML],
    ['JarvisChat · fil chargé (jsdom)', async () => {
      h.thread = { turns: [{ id: '1', role: 'user', content: 'Q', at: T }, { id: '2', role: 'assistant', content: 'R', at: T }], starters: [], measuredAds: 0, brandName: 'Neva', contexte: { brandId: 'b1', identity: null, rules: null, hooks: null, connaissances: null }, sources: {} };
      return (await monter(<JarvisChat />)).innerHTML;
    }],
    ['JarvisContexte · connaissances incluses', async () => renderToStaticMarkup(
      <JarvisContexte contexte={{ brandId: 'b', identity: 'Identité', rules: 'Règles', hooks: null, connaissances: { inclus: [{ ref: 'Kaaaa-v1', titre: 'Itérer', type: 'methode', tronquee: true }], horsPlace: 1 } }} brandName="Neva" measuredAds={2} onClose={() => {}} />,
    )],
    ['/admin · tableau de bord (carte Connaissances)', async () => { h.session = fondateur; return renderToStaticMarkup(await AdminBackstage()); }],
  ];

  it('on lit bien des cadres', async () => {
    let n = 0;
    for (const [, rendre] of ecrans) n += nCadres(await rendre());
    expect(n).toBeGreaterThanOrEqual(40);
  });
  for (const [nom, rendre] of ecrans) {
    it(nom, async () => {
      const html = await rendre();
      expect(nCadres(html), `${nom} · aucun cadre lu`).toBeGreaterThan(0);
      const fautes = cadresHorsRole(html);
      expect(fautes, `Cadre(s) hors rôle :\n${fautes.join('\n')}`).toEqual([]);
    });
  }

  it('les cartes de la liste et le formulaire sont des surfaces · l’état vide est `vide`', async () => {
    const liste = normaliser(renderToStaticMarkup(<EcranConnaissances vueInitiale={vue(fixtures())} espaces={[]} marques={[]} />));
    const article = /<article\b[^>]*style="([^"]*)"/.exec(liste)?.[1] ?? '';
    expect(article, 'carte de connaissance non rendue').not.toBe('');
    expect(article).toContain('border:1px solid var(--line);border-radius:var(--r-card)');
    const vide = normaliser(renderToStaticMarkup(<EcranConnaissances vueInitiale={vue([])} espaces={[]} marques={[]} />));
    expect(vide).toMatch(/border:1px dashed var\(--line-2\);border-radius:var\(--r-card\)[^"]*"><p[^>]*>Aucune connaissance/);
  });

  it('l’avertissement avant publication · signal au rayon d’une tuile (plateforme), tuile neutre (espace)', () => {
    const p = renderToStaticMarkup(<Formulaire initial={VALEURS('plateforme')} titreFormulaire="N" espaces={[]} marques={[]} occupe={false} onEnvoyer={async () => true} />);
    expect(/data-avant-publication="plateforme" style="([^"]*)"/.exec(p)?.[1]).toContain('border:1px solid rgba(245,166,35,.45);border-radius:var(--r-md)');
    const e = renderToStaticMarkup(<Formulaire initial={VALEURS('espace')} titreFormulaire="N" espaces={[]} marques={[]} occupe={false} onEnvoyer={async () => true} />);
    expect(/data-avant-publication="espace" style="([^"]*)"/.exec(e)?.[1]).toContain('border:1px solid var(--line);border-radius:var(--r-md)');
  });
});
