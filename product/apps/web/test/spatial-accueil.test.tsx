// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import {
  PASTILLES_JARVIS_ACCUEIL, raccourcisAccueil, periodeReporting, syntheseReporting, choixRapidesPeriode,
  type CarteConfiguration, type CarteQuoiIterer, type EtapeBoucleAccueil, type JourneeMesuree,
} from '@tiktrends/core';
import { parite, squelette, fragmentReference, type CorrectifParite } from './spatial/parite';

const pousse = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard', useRouter: () => ({ push: pousse, refresh: () => {} }) }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Accueil, type PropsAccueil } from '../spatial/vues/accueil/Accueil';
import { BarreJarvis, CarteConfigurationAccueil } from '../spatial/vues/accueil/interactifs';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);

/* ── Un jeu de props ÉQUIVALENT au fragment (mêmes nombres d'éléments) ── */

const etape = (cle: string, primaire: boolean) => ({ cle, libelle: cle, fait: false, detail: 'pourquoi', action: { libelle: 'Faire', href: '/x', primaire } });
const CARTE: CarteConfiguration = {
  fait: 2, total: 8, part: 25, titre: 'Configure TikTrends pour M',
  etapes: [{ cle: 'a', libelle: 'a', fait: true, detail: null, action: null }, etape('b', true), etape('c', false), etape('d', false)],
  prochaines: [etape('b', true), etape('c', false), etape('d', false)],
};

const AUJ = '2026-10-22';
const PERIODE = periodeReporting({ aujourdhui: AUJ });
const jours: JourneeMesuree[] = Array.from({ length: 28 }, (_, i) => ({
  date: new Date(Date.UTC(2026, 8, 24 + i)).toISOString().slice(0, 10),
  depense: 600 + 10 * i, impressions: 50_000, clics: 600 - i, achats: 80 + i, revenu: 1100 + 5 * i, vues3s: 12_000 + 30 * i,
}));
const SYNTHESE = syntheseReporting(jours, PERIODE)!;

const carteIt = (rang: number, o: Partial<CarteQuoiIterer> = {}): CarteQuoiIterer => ({
  adId: `ad${rang}`, rang, vignette: 'https://x/v.jpg', vertical: false, etiquette: { texte: 'Gagnante', classe: 'g' }, nom: `Lot #1 · ${rang}`,
  indicateurs: [{ libelle: 'ROAS', valeur: '2,10', classe: '' }, { libelle: 'Dépense', valeur: '3 120 €', classe: '' }, { libelle: 'CTR', valeur: '1 %', classe: '' }],
  recommande: false, titre: 't', raison: 'r', signaux: [{ texte: 's1', classe: 'g' }, { texte: 's2', classe: 'c' }, { texte: 's3', classe: 'g' }],
  garde: 'Garde · accroche', preuve: { niveau: 3, libelle: 'Mesuré' }, note: 'n', action: { libelle: 'Préparer l’itération', href: '/studio/x' }, ...o,
});
const CARTES: CarteQuoiIterer[] = [
  carteIt(1, { recommande: true, etiquette: { texte: 'Fatigue', classe: 'w' }, indicateurs: [{ libelle: 'ROAS', valeur: '2,10', classe: 'g' }, { libelle: 'D', valeur: '1', classe: '' }, { libelle: 'F', valeur: '3', classe: '' }], signaux: [{ texte: 'a', classe: 'w' }, { texte: 'b', classe: 'r' }, { texte: 'c', classe: 'g' }], preuve: { niveau: 2, libelle: 'Observé' } }),
  carteIt(2, { etiquette: { texte: 'A', classe: 'w' }, indicateurs: [{ libelle: 'ROAS', valeur: '1', classe: 'r' }, { libelle: 'D', valeur: '1', classe: '' }, { libelle: 'A', valeur: '2', classe: '' }], signaux: [{ texte: 'a', classe: 'r' }, { texte: 'b', classe: 'w' }, { texte: 'c', classe: 'g' }] }),
  carteIt(3, { etiquette: { texte: 'C', classe: 'r' }, indicateurs: [{ libelle: 'ROAS', valeur: '1', classe: 'r' }, { libelle: 'D', valeur: '1', classe: '' }, { libelle: 'C', valeur: '2', classe: '' }], signaux: [{ texte: 'a', classe: 'r' }, { texte: 'b', classe: 'w' }], preuve: { niveau: 1, libelle: 'À vérifier' } }),
  carteIt(4, { vertical: true, etiquette: { texte: 'T', classe: 'c' }, signaux: [{ texte: 'a', classe: 'c' }, { texte: 'b', classe: 'w' }, { texte: 'c', classe: 'c' }], preuve: { niveau: 1, libelle: 'À vérifier' } }),
];

const stage = (o: Partial<EtapeBoucleAccueil>): EtapeBoucleAccueil => ({ cle: 'hypotheses', icone: 'q', n: 1, titre: 't', sous: 's', href: '/adsmap', alerte: false, vignettes: [], progression: null, action: null, ...o });
const v = (o: { gagnante?: boolean; vertical?: boolean } = {}) => ({ url: 'https://x/v.jpg', gagnante: !!o.gagnante, vertical: !!o.vertical });
const ETAPES: EtapeBoucleAccueil[] = [
  stage({ cle: 'hypotheses', icone: 'q', action: 'Préparer un lot' }),
  stage({ cle: 'preparation', icone: 'cal', alerte: true, vignettes: [v()], action: 'Compléter' }),
  stage({ cle: 'diffusion', icone: 'flask', vignettes: [v({ vertical: true })], progression: { part: 43, texte: 'J6 / 14', note: 'Bilan le 30 oct.' } }),
  stage({ cle: 'atraiter', icone: 'check', alerte: true, vignettes: [v({ gagnante: true }), v()], action: 'Conclure le lot #1' }),
  stage({ cle: 'apprentissages', icone: 'bulb', action: 'Préparer la suite' }),
];

const PROPS: PropsAccueil = {
  surtitre: 'Mercredi 22 octobre · M', salutation: 'Bonjour K',
  jarvis: { titre: 'Comment je peux t’aider sur M ?', sources: ['Meta', 'TikTok', 'Veille', 'Fiche marque'], pastilles: PASTILLES_JARVIS_ACCUEIL },
  raccourcis: [
    { cle: 'nouveau', route: 'nouveau', icone: 'brush', titre: 'a', sous: 'a', href: '/studio/projets/nouveau', pastille: null },
    { cle: 'formats', route: 'formats', icone: 'eye', titre: 'b', sous: 'b', href: '/veille/formats', pastille: null },
    { cle: 'forfaits', route: 'forfaits', icone: 'spark', titre: 'c', sous: 'c', href: '/billing', pastille: null },
    { cle: 'importer', route: 'importer', icone: 'down', titre: 'd', sous: 'd', href: '/adsmap/import', pastille: null },
    { cle: 'fiche', route: 'marque', icone: 'tag', titre: 'e', sous: 'e', href: '/brands/b1', pastille: { valeur: '6', titre: '6 éléments' } },
  ],
  attente: '2 choses t’attendent : x et y.',
  maintenant: { titre: 'À faire maintenant : conclure le lot #1', detail: 'd', action: 'Conclure le lot', href: '/adsmap/lots?lot=l1' },
  configuration: { carte: CARTE, questionnaire: '/onboarding?redo=1', fiche: '/brands/b1' },
  reporting: { etat: 'mesures', sous: 'M · annonces rattachées à tes tests', periode: PERIODE, rapides: choixRapidesPeriode(AUJ), synthese: SYNTHESE },
  iterer: { etat: 'liste', cartes: CARTES, suite: { texte: '1 autre gagnante', detail: 'dans Suites' } },
  boucle: { etapes: ETAPES, href: '/adsmap' },
  nouveautes: [
    { id: 'n1', icone: 'spark', couleur: 'good', texte: 'a', quand: 'il y a 12 min', action: { libelle: 'Voir', href: '/a' } },
    { id: 'n2', icone: 'eye', couleur: 'chg', texte: 'b', quand: 'il y a 2 h', action: { libelle: 'Analyser', href: '/b' } },
    { id: 'n3', icone: 'flask', couleur: 'warn', texte: 'c', quand: 'hier', action: { libelle: 'Conclure', href: '/c' } },
    { id: 'n4', icone: 'chat', couleur: null, texte: 'd', quand: 'hier', action: { libelle: 'Ouvrir', href: '/jarvis' } },
  ],
  reprendre: { lignes: [1, 2, 3, 4].map((i) => ({ id: `p${i}`, href: `/studio/projets/p${i}`, titre: `P${i}`, vignette: 'https://x/p.jpg', detail: 'Création · Publicité · hier' })), tous: '/studio/projets', vide: null },
};

/**
 * `ignorer` · deux contenus réellement fictifs dans la maquette :
 *  · `.ad .ph` · la maquette recadre UNE photo d'exemple par des styles en ligne
 *    (object-position, scale, hue-rotate) · l'outil pose le média réel tel quel ;
 *  · le pied de la 4e carte « Quoi itérer » (« Suivre le lot #2 » + « Itérer
 *    quand même ») · c'est un diagnostic « en attente d'un lot » qu'aucune
 *    source ne calcule · l'outil n'en produit pas.
 */
const IGNORER = ['.ad .ph', '.qis > article:nth-of-type(4) .qa'];

/**
 * Correctifs de mise en page DÉCLARÉS (planche v4, banc) · le CSS de la
 * maquette, repris tel quel, rogne ou déborde à ces endroits · l'outil les
 * corrige en ligne, et la parité exige exactement ces écarts.
 */
const CORRECTIFS_ACCUEIL: CorrectifParite[] = [
  { selecteur: '.qrow .qt strong, .qrow .qt small', style: ['white-space'], motif: 'G13 · raccourcis tronqués à ~100 px à 1280 (« Nouveau pro… »)' },
  { selecteur: '.pipe .stage > .btn', style: ['white-space', 'max-width'], motif: 'G14 · « Conclure le lot #3 » déborde de son bouton à 1280' },
  { selecteur: '#suggestions .qb .kc:not([style]) .pill', style: ['white-space'], motif: 'G12 · la pastille « Garde · … » élargit la carte hors de l’écran à 390' },
  { selecteur: '#suggestions .qk', style: ['flex-wrap'], motif: 'G12 · mini-tuiles rognées (« RO… », « Dép… ») à 390' },
  { selecteur: '#suggestions .qk > div', style: ['flex'], motif: 'G12 · mini-tuiles rognées (« RO… », « Dép… ») à 390' },
];

describe('Spatial · Accueil · parité de structure avec la maquette', () => {
  it('« Bonjour … » reproduit la maquette (en-tête, Jarvis, raccourcis, configuration, reporting, itérations, boucle, nouveautés, reprise)', () => {
    const p = parite(rendre(<Accueil {...PROPS} />), 'accueil', { ignorer: IGNORER, correctifs: CORRECTIFS_ACCUEIL });
    expect(p.rendu).toEqual(p.reference);
  });

  it('chaque raccourci porte la route de la maquette · la couleur de son icône en dépend (spatial-routes.css)', () => {
    const r = raccourcisAccueil({ nouveauProjet: '/studio/projets/nouveau', formats: true, forfaits: true, importer: true, fiche: { href: '/brands/b1', manques: ['x'] } });
    const html = rendre(<Accueil {...PROPS} raccourcis={r} />);
    const routes = [...html.matchAll(/class="qa2 qa3"[^>]*data-route="([a-z]+)"/g)].map((m) => m[1]);
    const attendu = [...fragmentReference('accueil').matchAll(/class="qa2 qa3" href="#([a-z]+)"/g)].map((m) => m[1]);
    expect(attendu).toHaveLength(5);
    expect(routes).toEqual(attendu);
  });

  it('la garde voit un écart · une tuile de reporting en moins, une classe retirée, un bloc retiré la font tomber', () => {
    const ref = squelette(fragmentReference('accueil'), { ignorer: IGNORER });
    const sansKpi = { ...PROPS, reporting: { ...PROPS.reporting!, synthese: { ...SYNTHESE, kpis: SYNTHESE.kpis.slice(1) } } } as PropsAccueil;
    expect(squelette(rendre(<Accueil {...sansKpi} />), { ignorer: IGNORER })).not.toEqual(ref);
    expect(squelette(rendre(<Accueil {...PROPS} />).replace('class="tile nowbar"', 'class="tile"'), { ignorer: IGNORER })).not.toEqual(ref);
    expect(squelette(rendre(<Accueil {...PROPS} boucle={null} />), { ignorer: IGNORER })).not.toEqual(ref);
  });
});

describe('Spatial · Accueil · mise en page constatée au banc (planche v4)', () => {
  const dom = () => { const t = document.createElement('template'); t.innerHTML = rendre(<Accueil {...PROPS} />); return t.content; };
  const styles = (els: Iterable<Element>, prop: string) => [...els].map((e) => (e as HTMLElement).style.getPropertyValue(prop));

  it('G13 · le titre et le détail des raccourcis passent à la ligne au lieu d’être tronqués', () => {
    const qt = dom().querySelectorAll('.qrow .qt strong, .qrow .qt small');
    expect(qt.length).toBe(10);
    expect(styles(qt, 'white-space'), 'raccourcis tronqués (« Nouveau pro… ») · le texte complet n’est lisible nulle part').toEqual(Array(10).fill('normal'));
  });

  it('G14 · le libellé d’action d’une étape de la boucle passe à la ligne dans son bouton', () => {
    const btn = [...dom().querySelectorAll('.pipe .stage > .btn')] as HTMLElement[];
    expect(btn.map((b) => b.textContent)).toContain('Conclure le lot #1');
    for (const b of btn) {
      expect(b.style.whiteSpace, '« Conclure le lot #3 » déborde de son bouton').toBe('normal');
      expect(b.style.maxWidth).toBe('100%');
    }
  });

  it('G12 · les pastilles d’une gagnante passent à la ligne et les mini-tuiles aussi · la carte ne sort plus de l’écran', () => {
    const d = dom();
    const pastilles = d.querySelectorAll('#suggestions .qb .kc .pill');
    expect([...pastilles].map((p) => p.textContent)).toContain('Garde · accroche');
    expect(styles(pastilles, 'white-space').every((v) => v === 'normal'), 'une pastille `nowrap` élargit la carte hors de l’écran à 390').toBe(true);
    for (const qk of d.querySelectorAll('#suggestions .qk')) {
      expect((qk as HTMLElement).style.flexWrap, 'mini-tuiles rognées (« RO… ») · la troisième ne passe pas à la ligne').toBe('wrap');
      expect(styles(qk.children, 'flex').every((v) => v === '1 1 72px')).toBe(true);
    }
  });
});

describe('Spatial · Accueil · rien de la maquette ne fuit, un bloc sans source se tait', () => {
  it('sans aucune source, seuls l’en-tête et la salutation restent', () => {
    const neutre: CtxSpatial = { ...CTX, utilisateur: { nom: 'Camille Martin', initiales: 'CM', email: 'c@x.fr', role: 'Membre' }, credits: { solde: 80, dotation: 400, illimite: false } };
    const html = renderToStaticMarkup(<FournisseurSpatial value={neutre}><Accueil surtitre="Mardi 27 octobre" salutation="Bonjour" jarvis={null} raccourcis={[]} attente={null} maintenant={null} configuration={null} reporting={null} iterer={null} boucle={null} nouveautes={null} reprendre={null} /></FournisseurSpatial>);
    const d = document.createElement('div'); d.innerHTML = html;
    expect(d.querySelector('h1')?.textContent).toBe('Bonjour');
    for (const sel of ['.jhero', '.qrow', '.lead2', '.nowbar', '.cfgc', '#reporting', '#suggestions', '.pipe', '.grid2']) expect(d.querySelector(sel), sel).toBeNull();
    for (const mot of ['Neva', 'Kevin', 'Ploufy', 'plongeon', '1 240', 'lot #1']) expect(html).not.toContain(mot);
  });

  it('sans compte Meta connecté, le reporting dit de connecter et mène à /connections · aucun KPI', () => {
    const html = rendre(<Accueil {...PROPS} reporting={{ etat: 'connecter', sous: 'M · aucun compte', message: 'Connecte ton compte publicitaire Meta…', lien: { libelle: 'Connecter mes comptes', href: '/connections' } }} />);
    const d = document.createElement('div'); d.innerHTML = html;
    const r = d.querySelector('#reporting')!;
    expect(r.querySelector('.dkpis')).toBeNull();
    expect(r.querySelector('.dperw')).toBeNull();
    expect(r.querySelector('a.btn')?.getAttribute('href')).toBe('/connections');
  });

  it('les chiffres du reporting sont ceux de la synthèse, à l’écran', () => {
    const d = document.createElement('div'); d.innerHTML = rendre(<Accueil {...PROPS} />);
    const valeurs = [...d.querySelectorAll('#reporting .dk .v')].map((e) => e.textContent);
    expect(valeurs).toEqual(SYNTHESE.kpis.map((k) => k.valeur));
    expect(d.querySelectorAll('#reporting .dchart .bars rect').length).toBe(PERIODE.jours);
  });
});

describe('Spatial · Accueil · la barre Jarvis ouvre une vraie conversation, sans rien envoyer', () => {
  it('une pastille et la saisie mènent à /jarvis?q=… · aucun appel serveur', async () => {
    pousse.mockClear();
    const hote = document.createElement('div'); document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(<FournisseurSpatial value={CTX}><BarreJarvis titre="t" sources={[]} pastilles={PASTILLES_JARVIS_ACCUEIL} /></FournisseurSpatial>); });
    // Porté en Spatial, `/jarvis` se rejoint par le routeur ; sinon par un
    // rechargement (location.assign). La garde lit les deux.
    const assign = vi.fn();
    const vers = () => [...pousse.mock.calls, ...assign.mock.calls].map((c) => c[0] as string);
    const loc = window.location;
    Object.defineProperty(window, 'location', { configurable: true, value: { ...loc, assign } });
    try {
      await act(async () => { (hote.querySelector('button.chip') as HTMLButtonElement).click(); });
      expect(vers()).toEqual(['/jarvis?q=Strat%C3%A9gie+%3A+que+me+conseilles-tu+%3F']);
      const champ = hote.querySelector('#jhin') as HTMLInputElement;
      champ.value = '  Quel angle tester ?  ';
      await act(async () => { (hote.querySelector('form') as HTMLFormElement).requestSubmit(); });
      expect(vers().at(-1)).toBe('/jarvis?q=Quel+angle+tester+%3F');
      // Vide · rien ne part, la saisie reprend le focus.
      champ.value = '   ';
      await act(async () => { (hote.querySelector('form') as HTMLFormElement).requestSubmit(); });
      expect(vers()).toHaveLength(2);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: loc });
      await act(async () => racine.unmount());
      hote.remove();
    }
  });
});

describe('Spatial · Accueil · la carte de configuration se déplie sur les étapes réelles', () => {
  it('repliée · les trois prochaines ; dépliée · toutes, la faite cochée', async () => {
    const hote = document.createElement('div'); document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(<CarteConfigurationAccueil carte={CARTE} questionnaire="/onboarding?redo=1" fiche={null} />); });
    expect(hote.querySelectorAll('.cfgi').length).toBe(3);
    expect(hote.querySelector('.cfgm')?.textContent).toBe('Voir les 4 étapes · 8 requises');
    await act(async () => { (hote.querySelector('.cfgm') as HTMLButtonElement).click(); });
    expect(hote.querySelectorAll('.cfgi').length).toBe(4);
    expect(hote.querySelectorAll('.cfgi.ok').length).toBe(1);
    expect(hote.querySelector('.cfgm')?.textContent).toBe('Masquer les étapes terminées');
    await act(async () => racine.unmount());
    hote.remove();
  });
});
