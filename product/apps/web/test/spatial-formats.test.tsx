// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CLES_STYLES, ECRANS_SPATIAUX, STYLES_CREA, statsParStyle, type CarteTendance, type CleStyle, type EtapeTendance, type StatsStyle } from '@tiktrends/core';
import { fragmentReference, squelette } from './spatial/parite';

vi.mock('next/navigation', () => ({ usePathname: () => '/veille/formats', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { TousLesFormats } from '../spatial/vues/formats/TousLesFormats';
import { PageFormat, type ExempleFormat } from '../spatial/vues/formats/PageFormat';
import { Tendances } from '../spatial/vues/formats/Tendances';
import { Composition } from '../spatial/vues/formats/Composition';

/**
 * Parité de structure des écrans C2 · Formats et tendances. Chaque vue est
 * rendue avec des props ÉQUIVALENTES à la maquette (mêmes nombres d'éléments,
 * lus dans le fragment), puis comparée au squelette du fragment.
 *
 * Retraits documentés du fragment de RÉFÉRENCE (et seulement eux) · ce que la
 * maquette simule sans aucune source réelle et que l'écran n'affiche donc pas :
 *  · formats · les menus « Occasion » et « Secteur » (compteurs hachés) ;
 *  · f-<clé> · l'onglet « Modèles TikTrends » (aucun modèle réel par format) ;
 *  · tendances · le bloc « Pertinence pour <marque> » (aucune source).
 * `ignorer` · les miniatures d'EXEMPLES (compositions fictives dans la
 * maquette, vraie vignette d'annonce ici) · `.vitem .comp`, `.trex`.
 */

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);

const doc = (html: string) => { const t = document.createElement('template'); t.innerHTML = html; return t.content; };
/** La sous-navigation de la maquette, telle quelle (7 entrées, badge compris). */
const SOUS_NAV_MAQUETTE = [
  { href: '/veille', libelle: 'Pubs du moment' }, { href: '/veille/concurrents', libelle: 'Concurrents' }, { href: '/veille/formats', libelle: 'Formats' },
  { href: '/veille/tendances', libelle: 'Tendances' }, { href: '/saved', libelle: 'Sauvegardes' }, { href: '/veille/scale', libelle: 'Ce qui scale' },
  { href: '/radar', libelle: <>Radar<span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 6, font: '700 9px/1.5 var(--sf)', letterSpacing: '.06em', background: 'linear-gradient(135deg,#ffd48a,#ff9f6e)', color: '#2a1a00', verticalAlign: 1 }}>PRO</span></> },
];
// React 19 hisse des `<link rel="preload">` d'images AVANT la vue · on compare
// donc à partir de `div.view`, des deux côtés.
const VUE = { selecteur: 'div.view' };
const O_PAGE = { ...VUE, ignorer: ['.vitem .comp'] };
const O_TEND = { ...VUE, ignorer: ['.trex'] };
const stats = (n: number): StatsStyle => ({ mesure: true, n, joursMoyens: 30, partLongue: 50 });

/* ───────────────────────── Tous les formats ───────────────────────── */

function propsFormats() {
  const f = doc(fragmentReference('formats'));
  const articles = [...f.querySelectorAll('article.fcard2')];
  const styles = articles.map((a, i) => {
    const cle = a.querySelector('a.fv')!.getAttribute('href')!.slice(3) as CleStyle;
    const up = /En hausse · \+(\d+)/.exec(a.querySelector('.fbadge')?.textContent ?? '');
    return { cle, stats: stats(articles.length - i), hausse: up ? Number(up[1]) : null };
  });
  // L'encart « En hausse » montre les 4 plus fortes hausses · celles du fragment.
  for (const [k, v] of [...f.querySelectorAll('.ftrend a.ftrr')].map((a, i) => [a.getAttribute('href')!.slice(3), 100 - i] as const)) styles.find((s) => s.cle === k)!.hausse = v;
  return { styles, n: articles.length };
}

describe('Spatial C2 · « Tous les formats » reproduit la maquette', () => {
  const referenceFormats = () => fragmentReference('formats')
    .replace(/<button type="button" class="fdd" data-fdd="occ"[\s\S]*?<\/button>/, '')
    .replace(/<button type="button" class="fdd" data-fdd="sec"[\s\S]*?<\/button>/, '');

  it('même squelette que le fragment (28 cartes, encart « En hausse », barre, compteur)', () => {
    const { styles, n } = propsFormats();
    expect(n).toBe(28);
    const html = rendre(<TousLesFormats sousNav={SOUS_NAV_MAQUETTE} styles={styles} image="https://x/produit.jpg" marque="Acme" perimetre="Compté sur tes 12 sauvegardes classées" />);
    expect(squelette(html, VUE)).toEqual(squelette(referenceFormats(), VUE));
  });

  it('la garde voit un écart · une carte de moins, ou l’encart « En hausse » absent, la font tomber', () => {
    const { styles } = propsFormats();
    const ref = squelette(referenceFormats(), VUE);
    const sansHausse = rendre(<TousLesFormats sousNav={SOUS_NAV_MAQUETTE} styles={styles.map((s) => ({ ...s, hausse: null }))} image={null} marque={null} perimetre="" />);
    expect(squelette(sansHausse, VUE)).not.toEqual(ref);
    const ampute = referenceFormats().replace(/<article class="fcard2[\s\S]*?<\/article>/, '');
    expect(squelette(ampute, VUE)).not.toEqual(ref);
  });

  it('sans chiffre réel · aucun rang, aucune hausse, aucun encart · le périmètre le dit', () => {
    const html = rendre(<TousLesFormats sousNav={SOUS_NAV_MAQUETTE} styles={STYLES_CREA.map((s) => ({ cle: s.cle, stats: statsParStyle([])[s.cle], hausse: null }))} image={null} marque={null} perimetre="Aucune sauvegarde classée · les chiffres se remplissent quand tu classes tes sauvegardes" />);
    const d = doc(html);
    expect(d.querySelectorAll('article.fcard2')).toHaveLength(28);
    expect(d.querySelector('.ftrend')).toBeNull();
    expect(d.querySelectorAll('.fbadge')).toHaveLength(0);
    expect(d.querySelector('.fsum .faint')!.textContent).toContain('Aucune sauvegarde classée');
    // Un style sans format de classement le dit, au lieu d'un zéro trompeur.
    const probsol = [...d.querySelectorAll('article.fcard2')].find((a) => a.querySelector('strong')!.textContent === 'Problème / Solution')!;
    expect(probsol.querySelector('.fsts')!.textContent).toBe('Aucun format de classement' + 'n/c tournent +30 j');
    // Aucune trace de la marque de démo ni d'un compteur fictif.
    for (const x of ['Neva', 'Julie', '12 000', '4,8/5', '2 300', 'Ploufy']) expect(html.includes(x), x).toBe(false);
  });

  it('recherche, famille et choix d’un style · le choix mène à la VRAIE préparation de projet', async () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    await act(async () => { racine.render(<FournisseurSpatial value={CTX}><TousLesFormats sousNav={SOUS_NAV_MAQUETTE} styles={propsFormats().styles} image={null} marque="Acme" perimetre="p" /></FournisseurSpatial>); });
    const q = hote.querySelector<HTMLInputElement>('#fq')!;
    const saisir = async (v: string) => act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(q, v);
      q.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await saisir('big logo');
    expect(hote.querySelector('#fcount')!.textContent).toBe('1 style');
    expect([...hote.querySelectorAll('article.fcard2:not([hidden]) strong')].map((s) => s.textContent)).toEqual(['Gros logo']);
    expect(hote.querySelector<HTMLElement>('.fnone')!.hidden).toBe(true);
    await saisir('zzz');
    expect(hote.querySelector<HTMLElement>('.fnone')!.hidden).toBe(false);
    await saisir('');
    // Famille « Natif » · menu, option, puce de retrait.
    await act(async () => { hote.querySelector<HTMLButtonElement>('.fdd')!.click(); });
    const natif = [...hote.querySelectorAll<HTMLButtonElement>('.fopt')].find((b) => b.querySelector('span')!.textContent === 'Natif')!;
    await act(async () => { natif.click(); });
    expect(hote.querySelector('.fpanel')).toBeNull();
    const natifs = STYLES_CREA.filter((s) => s.famille === 'Natif').length;
    expect(hote.querySelectorAll('article.fcard2')).toHaveLength(natifs);
    expect(hote.querySelector('.fsum .chip')!.textContent).toBe('Natif');
    await act(async () => { hote.querySelector<HTMLButtonElement>('.fsum .chip')!.click(); });
    expect(hote.querySelectorAll('article.fcard2')).toHaveLength(28);
    // Choisir · le plateau propose la préparation réelle, consigne du format en `angle`.
    await act(async () => { hote.querySelector<HTMLButtonElement>('article.fcard2 [aria-pressed]')!.click(); });
    const lien = hote.querySelector<HTMLAnchorElement>('.ftray a.btn.pri')!;
    expect(lien.getAttribute('href')).toMatch(/^\/studio\/projets\/nouveau\?type=ads&angle=Format\+%C2%AB\+/);
    await act(async () => { hote.querySelector<HTMLButtonElement>('.ftray .btn.ghost.ic')!.click(); });
    expect(hote.querySelector('.ftray')).toBeNull();
    await act(async () => { racine.unmount(); });
    hote.remove();
  });
});

/* ───────────────────────── Page d'un style (×28) ───────────────────────── */

function propsPage(cle: CleStyle) {
  const f = doc(fragmentReference(`f-${cle}`));
  const items = [...f.querySelectorAll('article.vitem')];
  const exemples: ExempleFormat[] = items.map((it, i) => ({
    id: `e${i}`, annonceur: { nom: `Annonceur ${i}`, initiale: 'A', couleur: '#ffb3c7' }, pays: 'FR', vignette: 'https://x/v.jpg',
    longue: !!it.querySelector('.scale'), diffusion: 'Active · 40 j', iterer: '/studio/projets/nouveau?type=ads',
  }));
  const pill = f.querySelector('.fhi .kc .pill.g, .fhi .kc .pill.w');
  return {
    exemples,
    pastille: pill ? { classe: pill.classList.contains('g') ? 'g' as const : 'w' as const, texte: '+12 pts ce mois' } : null,
  };
}

describe('Spatial C2 · la page d’un style · UNE vue pour les 28 fragments f-<clé>', () => {
  const reference = (cle: string) => fragmentReference(`f-${cle}`).replace(/<button type="button" data-ftab="mod"[\s\S]*?<\/button>/, '');
  const page = (cle: CleStyle, o: Partial<React.ComponentProps<typeof PageFormat>> = {}) => {
    const p = propsPage(cle);
    return rendre(<PageFormat sousNav={SOUS_NAV_MAQUETTE} cle={cle} image="https://x/produit.jpg" marque="Acme" pastille={p.pastille}
      tuiles={[['Pubs classées', '14'], ['Diffusion moyenne', '38 j'], ['Tournent +30 j', '57 %'], ['Tes tests', '0']]}
      nouveauProjet="/studio/projets/nouveau?type=ads" meilleurExemple="/studio/projets/nouveau?type=ads&ref=x" exemples={p.exemples} formatClassement="Avant / après" {...o} />);
  };

  it('une adresse dynamique déclarée, une page, et chaque clé a son fragment', () => {
    expect(ECRANS_SPATIAUX.map((e) => e.chemin)).toEqual(expect.arrayContaining(['/veille/formats', '/veille/formats/[format]', '/veille/tendances']));
    expect(existsSync(join(__dirname, '..', 'app', '(spatial)', 'sp', 'veille', 'formats', '[format]', 'page.tsx'))).toBe(true);
    for (const k of CLES_STYLES) expect(fragmentReference(`f-${k}`).length, k).toBeGreaterThan(1000);
  });

  // Les 28 · la miniature de chaque style (le portage de `compS`) est comparée
  // telle quelle, seules les miniatures d'exemples sont ignorées.
  for (const cle of CLES_STYLES) {
    it(`f-${cle} reproduit la maquette`, () => {
      expect(squelette(page(cle), O_PAGE)).toEqual(squelette(reference(cle), O_PAGE));
    });
  }

  it('la garde voit un écart · une miniature fausse, un exemple de moins ou une tuile de moins la font tomber', () => {
    const ref = squelette(reference('chat'), O_PAGE);
    // La miniature d'un autre style à la place de la sienne.
    const seule = (cle: CleStyle) => renderToStaticMarkup(<Composition cle={cle} image="https://x/produit.jpg" marque="Acme" />).replace(/^(<link[^>]*>)+/, '');
    const original = page('chat');
    expect(original.includes(seule('chat'))).toBe(true);
    const autre = original.replace(seule('chat'), seule('notes'));
    expect(squelette(autre, O_PAGE)).not.toEqual(ref);
    expect(squelette(page('chat', { exemples: propsPage('chat').exemples.slice(1) }), O_PAGE)).not.toEqual(ref);
    expect(squelette(page('chat', { tuiles: [['a', '1'], ['b', '2'], ['c', '3']] }), O_PAGE)).not.toEqual(ref);
  });

  it('sans exemple · l’état vide dit pourquoi, sans geste « meilleur exemple »', () => {
    const vide = doc(page('avap', { exemples: [], meilleurExemple: null }));
    expect(vide.querySelector('.vfeed')).toBeNull();
    expect(vide.querySelector('.dempty h3')!.textContent).toBe('Aucune sauvegarde classée « Avant / après »');
    expect(vide.querySelector('.fhi .btn.pri')).toBeNull();
    const horsListe = doc(page('notes', { exemples: [], meilleurExemple: null, formatClassement: null }));
    expect(horsListe.querySelector('.dempty h3')!.textContent).toBe('Ce style n’a pas de format de classement');
    expect(horsListe.querySelector('.seg.sec button')!.textContent).toBe('Exemples sauvegardés · 0');
  });

  it('les onglets basculent le contenu · anatomie (zones, règles) et « Tes créas »', async () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    const p = propsPage('avap');
    await act(async () => { racine.render(<FournisseurSpatial value={CTX}><PageFormat sousNav={SOUS_NAV_MAQUETTE} cle="avap" image={null} marque={null} pastille={null} tuiles={[]} nouveauProjet="/studio/projets/nouveau?type=ads" meilleurExemple={null} exemples={p.exemples} formatClassement="Avant / après" /></FournisseurSpatial>); });
    const onglet = (i: number) => hote.querySelectorAll<HTMLButtonElement>('.seg.sec button')[i]!;
    expect(hote.querySelectorAll('.vitem')).toHaveLength(p.exemples.length);
    await act(async () => { onglet(1).click(); });
    expect(onglet(1).getAttribute('aria-pressed')).toBe('true');
    expect(hote.querySelectorAll('.zl li')).toHaveLength(3);
    expect(hote.querySelectorAll('.anat .zm')).toHaveLength(3);
    expect(hote.querySelector('.vfeed')).toBeNull();
    await act(async () => { onglet(2).click(); });
    expect(hote.querySelector('.dempty a.btn.pri')!.getAttribute('href')).toBe('/studio/projets/nouveau?type=ads');
    await act(async () => { racine.unmount(); });
    hote.remove();
  });
});

/* ───────────────────────── Tendances ───────────────────────── */

const ETAPE: Record<string, EtapeTendance> = { 'Émergente': 'emergente', 'En croissance': 'croissance', 'Au pic': 'pic', 'En déclin': 'declin' };

function propsTendances() {
  const f = doc(fragmentReference('tendances'));
  const cartes: CarteTendance[] = [...f.querySelectorAll('article.trc')].map((a, i) => {
    const declin = !!a.querySelector('.trcta .pill.w');
    return {
      cle: `t${i}`, type: a.querySelector('.trh .pill')!.textContent!, etape: ETAPE[a.querySelector('.trst')!.textContent!]!, nom: `Tendance ${i}`, sous: 'Sous-titre',
      part: 40, ecart: declin ? '−18 pts' : '+20 pts', hausse: !declin, marques: 4, concurrents: 1, jours: '20 j', semaines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      vignettes: ['https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'], pourquoi: 'Parce que.',
      cta: declin ? { primaire: null, alerte: 'En recul · à éviter pour l’instant', voir: { libelle: 'Voir', href: '/veille/formats/avap' } }
        : { primaire: { libelle: 'Créer', href: '/studio/projets/nouveau' }, alerte: null, voir: { libelle: 'Voir', href: '/veille/formats/avap' } },
    };
  });
  const types = [...f.querySelectorAll('.pcats .chip')].slice(1).map((b) => ({ cle: b.textContent!, libelle: b.textContent! }));
  const sources = [...f.querySelectorAll('.trs')].map((s, i) => ({ lettre: 'M', couleur: '#0467df', nom: `Source ${i}`, detail: 'd', actif: !s.classList.contains('off') }));
  const alertes = [...f.querySelectorAll('.tral .member')].map((m, i) => ({ libelle: `Alerte ${i}`, actif: true, raison: 'r' }));
  const canaux = [...f.querySelectorAll('.tral ~ .kc .chip')].map((c, i) => ({ libelle: `Canal ${i}`, actif: c.getAttribute('aria-pressed') === 'true' }));
  return { cartes, types, sources, alertes, canaux };
}

describe('Spatial C2 · « Tendances » reproduit la maquette', () => {
  const reference = () => fragmentReference('tendances').replace(/<div class="trfit">[\s\S]*?<span class="faint">[^<]*<\/span><\/div>/g, '');
  const vue = (o: Partial<React.ComponentProps<typeof Tendances>> = {}) => {
    const p = propsTendances();
    return rendre(<Tendances sousNav={SOUS_NAV_MAQUETTE} capteur={{ actif: true, etat: 'Armé · dernier passage le 26 octobre', raisonInterrupteur: 'r' }}
      sources={p.sources} radar="/adsmap/radar" surveille={{ libelle: 'Concurrents suivis', href: '/saved?onglet=marques' }}
      kpis={[['2 140', 'a'], ['6', 'b'], ['2', 'c'], ['3', 'd']]} tendances={p.cartes} types={p.types} silence="s" alertes={p.alertes} canaux={p.canaux} {...o} />);
  };

  it('même squelette que le fragment (6 tendances, courbe, filtres, explication, alertes)', () => {
    const p = propsTendances();
    expect(p.cartes).toHaveLength(6);
    expect(squelette(vue(), O_TEND)).toEqual(squelette(reference(), O_TEND));
  });

  it('la garde voit un écart · une tendance de moins, ou le bloc de pertinence laissé dans la référence, la font tomber', () => {
    const ref = squelette(reference(), O_TEND);
    expect(squelette(vue({ tendances: propsTendances().cartes.slice(1) }), O_TEND)).not.toEqual(ref);
    expect(squelette(vue(), O_TEND)).not.toEqual(squelette(fragmentReference('tendances'), O_TEND));
  });

  it('le silence est dit · aucune carte, aucune courbe à points, l’explication et les effectifs', () => {
    const d = doc(vue({ tendances: [], silence: 'Pas encore assez d’annonces pour comparer deux mois (il en faut 5 par mois) · format 2 ce mois / 1 le mois d’avant.' }));
    expect(d.querySelectorAll('article.trc')).toHaveLength(0);
    expect(d.querySelectorAll('.trcv .trdot')).toHaveLength(0);
    expect(d.querySelector('.trgrid .dempty h3')!.textContent).toBe('Aucune tendance mesurée');
    expect(d.querySelector('.trgrid .dempty p')!.textContent).toContain('il en faut 5 par mois');
    // L'interrupteur du radar est en lecture seule · il dépense, il s'arme dans son écran.
    expect(d.querySelector('.trstat .sw2')!.hasAttribute('disabled')).toBe(true);
    for (const x of ['Neva', 'Ploufy', 'Lagonette', '1 860', 'Prototype', 'Pertinence pour']) expect(d.textContent!.includes(x), x).toBe(false);
  });

  it('filtres par type et par étape, et « Masquer » · un état d’écran', async () => {
    const hote = document.createElement('div');
    document.body.appendChild(hote);
    const racine = createRoot(hote);
    const p = propsTendances();
    await act(async () => { racine.render(<FournisseurSpatial value={CTX}><Tendances sousNav={SOUS_NAV_MAQUETTE} capteur={{ actif: false, etat: 'e', raisonInterrupteur: 'r' }} sources={[]} radar={null} surveille={{ libelle: 'l', href: '/saved' }} kpis={[]} tendances={p.cartes} types={p.types} silence="s" alertes={[]} canaux={[]} /></FournisseurSpatial>); });
    const n = () => hote.querySelectorAll('article.trc').length;
    expect(n()).toBe(6);
    await act(async () => { [...hote.querySelectorAll<HTMLButtonElement>('.pcats .chip')].find((b) => b.textContent === 'Format')!.click(); });
    expect(n()).toBe(2);
    await act(async () => { [...hote.querySelectorAll<HTMLButtonElement>('.toolbar .seg button')].find((b) => b.textContent === 'En déclin')!.click(); });
    expect(n()).toBe(1);
    await act(async () => { [...hote.querySelectorAll<HTMLButtonElement>('.toolbar .seg button')].find((b) => b.textContent === 'Toutes étapes')!.click(); });
    await act(async () => { [...hote.querySelectorAll<HTMLButtonElement>('.pcats .chip')].find((b) => b.textContent === 'Toutes')!.click(); });
    await act(async () => { hote.querySelector<HTMLButtonElement>('article.trc .trx')!.click(); });
    expect(n()).toBe(5);
    expect(hote.querySelectorAll('.trleg span')).toHaveLength(5);
    expect(hote.querySelectorAll('.trcv .trdot')).toHaveLength(5);
    expect(hote.querySelector('.trhero a.btn.pri')).toBeNull(); // radar fermé · pas de lien
    await act(async () => { racine.unmount(); });
    hote.remove();
  });
});
