// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import type { InspoAd } from '@tiktrends/integrations';
import { FILTRES_OUTIL_SCALE, ligneRadarCreatif, requetesOutilsScale, resumeRadarCreatif, statsOutilsScale, type CreaNotee } from '@tiktrends/core';

/**
 * Vague 3 · les gestes des pages V5 de la Veille portés dans Spatial · « Ce qui
 * scale » (niche, filtres, tri, garder, requêtes), Sauvegardes (format, test,
 * filtres), Pubs du moment (retour, mémoire marché), Radar (créas notées).
 * Chaque garde lit le DOM rendu et l'appel réellement parti.
 */
const actions = vi.hoisted(() => ({
  saveAd: vi.fn(async () => ({ ok: true })), unsaveAd: vi.fn(async () => ({ ok: true })),
  followBrand: vi.fn(async () => ({ ok: true })), unfollowBrand: vi.fn(async () => ({ ok: true })),
  setSavedAdFolder: vi.fn(async () => ({ ok: true })),
  classerFormatSauvegarde: vi.fn(async (i: { format: string }) => ({ ok: true as const, format: i.format === 'non_classe' ? null : i.format, date: null })),
}));
const pont = vi.hoisted(() => ({ trackSavedAdAction: vi.fn(async () => ({})) }));
const marche = vi.hoisted(() => ({ marketViewAction: vi.fn(), learnFromFollowedAction: vi.fn(async () => ({ summary: '3 créas décrites.' })) }));
vi.mock('next/navigation', () => ({ usePathname: () => '/veille', useRouter: () => ({ push: () => {}, refresh: () => {} }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/inspo', () => actions);
vi.mock('../app/actions/adsmap-bridge', () => pont);
vi.mock('../app/actions/market-learn', () => marche);
const suivi = vi.hoisted(() => ({
  briefMarqueAction: vi.fn(async () => ({ brief: { total: 8, gagnants: 3, partVideo: 0.75, ancienneteMediane: 21, doyenneJours: 90, angles: [{ angle: 'testimonial', label: 'Témoignage', n: 5, part: 0.6 }], ctas: [{ cta: 'Acheter', n: 4 }], domaines: ['neva.fr'] } })),
  scanTrackerAction: vi.fn(async () => ({ scanned: 2, newAds: 3 })), markTrackerSeenAction: vi.fn(async () => {}),
  decouverteMarcheAction: vi.fn(async () => ({ ads: [{ id: 'd1', platform: 'meta', status: 'active', advertiserName: 'Découverte', daysRunning: 40 }] })),
  grammaireCategorieAction: vi.fn(async () => ({ lignes: [{ axe: 'Mise en page', valeur: 'Produit centré' }], n: 12 })),
  grammaireVideoAction: vi.fn(async () => ({ lignes: [], n: 0 })),
}));
vi.mock('../app/actions/brief-marque', () => ({ briefMarqueAction: suivi.briefMarqueAction }));
vi.mock('../app/actions/tracker', () => ({ scanTrackerAction: suivi.scanTrackerAction, markTrackerSeenAction: suivi.markTrackerSeenAction }));
vi.mock('../app/actions/decouverte', () => ({ decouverteMarcheAction: suivi.decouverteMarcheAction }));
vi.mock('../app/actions/layout-marche', () => ({ grammaireCategorieAction: suivi.grammaireCategorieAction }));
vi.mock('../app/actions/video-marche', () => ({ grammaireVideoAction: suivi.grammaireVideoAction }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { CeQuiScale } = await import('../spatial/vues/veille/CeQuiScale');
const { CollectionsSauvegardes } = await import('../spatial/vues/veille/sauvegardes-client');
const { MemoireMarche } = await import('../spatial/vues/veille/marche-client');
const { Radar } = await import('../spatial/vues/veille/Radar');

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const toasts: string[] = [];
const CTX = {
  utilisateur: { nom: 'U', initiales: 'U', email: 'u@x.fr', role: 'Membre' }, credits: { solde: 0, dotation: 0, illimite: false },
  nonLues: 0, ouvrirPalette: () => {}, basculer: () => {}, toast: (m: string) => { toasts.push(m); },
};
let racine: HTMLDivElement; let root: Root;
beforeEach(() => { racine = document.createElement('div'); document.body.appendChild(racine); root = createRoot(racine); toasts.length = 0; vi.clearAllMocks(); });
afterEach(() => { act(() => root.unmount()); racine.remove(); document.body.innerHTML = ''; });
const monter = async (n: React.ReactNode) => { await act(async () => { root.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const cliquer = async (e: Element | null | undefined) => { if (!e) throw new Error('élément absent'); await act(async () => { (e as HTMLElement).click(); }); };
const choisir = async (sel: HTMLSelectElement, v: string) => act(async () => { sel.value = v; sel.dispatchEvent(new Event('change', { bubbles: true })); });
const bouton = (texte: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.includes(texte));
const rendre = (n: React.ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>);

/* ───────────────────────── Ce qui scale ───────────────────────── */

const ad = (id: string, o: Partial<InspoAd>): InspoAd => ({ id, platform: 'meta', status: 'active', ...o }) as InspoAd;
const ligne = (id: string, rang: number, o: { video: boolean; annonceur: string; angle: 'testimonial' | 'offer'; jours: number; croissance: number }) => ({
  cle: `meta:${id}`, rang, image: null, accroche: `Accroche ${id}`, detail: o.annonceur, part: 50, jours: `${o.jours} j`, cloner: `/studio?ref=${id}`,
  o: { ...o, texte: `Texte ${id}`, reach: 0, depense: 0 },
  ad: ad(id, { advertiserName: o.annonceur, mediaType: o.video ? 'video' : 'image' }), sauvee: false, suivie: false,
  site: { href: `https://${id}.fr`, libelle: `Ouvrir ${id}.fr` }, biblio: null,
});
const LIGNES = [
  ligne('a', 1, { video: true, annonceur: 'Neva', angle: 'testimonial', jours: 90, croissance: 10 }),
  ligne('b', 2, { video: false, annonceur: 'Ploufy', angle: 'offer', jours: 40, croissance: 900 }),
  ligne('c', 3, { video: true, annonceur: 'Ploufy', angle: 'offer', jours: 20, croissance: 300 }),
];
const outils = (extra = {}) => ({
  niche: 'skincare', pays: 'FR', presets: [{ libelle: 'Skincare', href: '/veille/scale?q=skincare&country=FR', actif: true }],
  etat: 'Niche « skincare » · FR · en cache', rafraichir: '/veille/scale?q=skincare&country=FR&refresh=1',
  stats: statsOutilsScale(LIGNES), lignes: LIGNES, initial: FILTRES_OUTIL_SCALE, annonceurs: ['Neva', 'Ploufy'],
  angles: [{ cle: 'testimonial', libelle: 'Témoignage' }, { cle: 'offer', libelle: 'Offre' }], requetes: requetesOutilsScale('skincare', 'FR'), ...extra,
});
const ordre = () => [...document.querySelectorAll('.scaleL .srow')].map((r) => r.getAttribute('data-ligne'));

describe('Spatial · Ce qui scale · les outils du swipe file', () => {
  it('la niche se choisit (champ GET, niches, rafraîchir) · le résumé est calculé sur la source', () => {
    const html = rendre(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils()} />);
    expect(html).toMatch(/<form class="tile"[^>]*action="\/veille\/scale" method="get"/);
    expect(html).toContain('name="q" value="skincare"');
    expect(html).toContain('href="/veille/scale?q=skincare&amp;country=FR&amp;refresh=1"');
    expect(html).toContain('<span class="lbl">Vidéos</span><span class="v">2</span>');
    expect(html).toContain('Six requêtes de veille prêtes à copier');
  });
  it('la durée d’abord (maquette), puis le tri et les filtres réordonnent et réduisent réellement la liste', async () => {
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils()} />);
    expect(ordre()).toEqual(['meta:a', 'meta:b', 'meta:c']);
    const [, , tri] = [...document.querySelectorAll('.fields select')] as HTMLSelectElement[];
    await choisir(tri!, 'growth');
    expect(ordre()).toEqual(['meta:b', 'meta:c', 'meta:a']);
    await cliquer(bouton('Vidéos'));
    expect(ordre()).toEqual(['meta:c', 'meta:a']);
    expect(document.querySelector('[data-compte]')?.textContent).toBe('2 sur 3');
    expect(window.location.search).toContain('type=video');
    await cliquer(document.querySelector('button[aria-label="Retirer le critère · Vidéos"]'));
    expect(ordre()).toHaveLength(3);
  });
  it('garder passe par saveAd avec l’instantané · la requête se copie', async () => {
    const ecrire = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: ecrire }, configurable: true });
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils()} />);
    await cliquer(document.querySelector('[data-ligne="meta:b"] button[aria-pressed="false"]'));
    expect(actions.saveAd).toHaveBeenCalledWith({ platform: 'meta', externalId: 'b', snapshot: LIGNES[1]!.ad });
    await cliquer(document.querySelector('[aria-label="Requêtes à copier"] button'));
    expect(ecrire).toHaveBeenCalledWith(requetesOutilsScale('skincare', 'FR')[0]);
  });
  it('sans outils, l’écran reste celui de la maquette', () => {
    const html = rendre(<CeQuiScale sous="s" lignes={LIGNES} pastilleRadar={null} vide={null} />);
    expect(html).not.toContain('Analyser la niche');
    expect(html).not.toContain('Requêtes à copier');
  });
});

/* ───────────────────────── Sauvegardes ───────────────────────── */

const sauvegarde = (id: string, extra: Record<string, unknown> = {}) => ({
  id, platform: 'meta', externalId: `x${id}`, ad: ad(`x${id}`, { body: `Texte ${id}`, mediaType: 'image' }), folder: null,
  marque: { nom: `Marque ${id}`, initiale: 'M', fond: 'var(--glass2)' }, source: 'Meta', image: null, longue: null, video: false,
  meta: ['Active · 3 j', 'Image · Meta'] as [string, string], pastilles: [], cloner: '/studio', format: { id: null, versionAncienne: false }, ...extra,
});

describe('Spatial · Sauvegardes · format, test, filtres', () => {
  it('classer le format · un geste explicite, l’action reçoit le format, la file « à classer » se vide', async () => {
    await monter(<CollectionsSauvegardes items={[sauvegarde('1'), sauvegarde('2')]} creerProjet="/p" gestes={{ formatFerme: null, test: { ouvert: true } }} />);
    await choisir(document.querySelector('select[aria-label="Filtrer par format"]') as HTMLSelectElement, 'non_classe');
    expect(document.querySelectorAll('.vitem')).toHaveLength(2);
    const sel = document.querySelector('.vitem select[data-format-choix]') as HTMLSelectElement;
    await choisir(sel, 'packshot');
    expect(actions.classerFormatSauvegarde).not.toHaveBeenCalled();
    await cliquer(bouton('Enregistrer'));
    expect(actions.classerFormatSauvegarde).toHaveBeenCalledWith({ platform: 'meta', externalId: 'x1', format: 'packshot' });
    expect(document.querySelectorAll('.vitem')).toHaveLength(1);
    expect(toasts.at(-1)).toMatch(/^Enregistré · /);
  });
  it('un refus remet le choix enregistré et dit pourquoi', async () => {
    actions.classerFormatSauvegarde.mockResolvedValueOnce({ ok: false, error: 'Refusé par le serveur.' } as never);
    await monter(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" gestes={{ formatFerme: null, test: { ouvert: true } }} />);
    const sel = document.querySelector('.vitem select[data-format-choix]') as HTMLSelectElement;
    await choisir(sel, 'packshot');
    await cliquer(bouton('Enregistrer'));
    expect(sel.value).toBe('non_classe');
    expect(toasts.at(-1)).toBe('Refusé par le serveur.');
  });
  it('« Préparer un test » appelle le pont réel · fermé, la raison est dite et rien n’est proposé', async () => {
    await monter(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" gestes={{ formatFerme: null, test: { ouvert: true } }} />);
    await cliquer(bouton('Préparer un test'));
    expect(pont.trackSavedAdAction).toHaveBeenCalledWith({ platform: 'meta', externalId: 'x1' });
    expect(bouton('Brouillon de test créé')).toBeTruthy();
    const ferme = rendre(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" gestes={{ formatFerme: 'Classement réservé à la Veille · offre Core.', test: { ouvert: false, raison: 'Préparer un test dans Résultats · inclus dans l’offre Plus.' } }} />);
    expect(ferme).not.toContain('Préparer un test</button>');
    expect(ferme).toContain('inclus dans l’offre Plus');
    expect(ferme).toMatch(/<select[^>]*disabled=""[^>]*data-format-choix/);
  });
  it('la recherche filtre réellement · sans gestes, la toolbar reste celle de la maquette', async () => {
    await monter(<CollectionsSauvegardes items={[sauvegarde('1'), sauvegarde('2')]} creerProjet="/p" gestes={{ formatFerme: null, test: { ouvert: true } }} />);
    const champ = document.querySelector('input[aria-label="Chercher dans les sauvegardes"]') as HTMLInputElement;
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(champ, 'texte 2'); champ.dispatchEvent(new Event('input', { bubbles: true })); });
    expect([...document.querySelectorAll('.vitem .who')].map((w) => w.textContent)).toEqual(['MMarque 2Meta']);
    expect(rendre(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" />)).not.toContain('Chercher dans les sauvegardes');
  });
});

/* ───────────────────────── Mémoire marché ───────────────────────── */

describe('Spatial · Pubs du moment · mémoire marché', () => {
  it('la confrontation d’abord, le coût dit AVANT « Apprendre », l’action réelle puis la relecture', async () => {
    marche.marketViewAction.mockResolvedValue({ view: { rows: [], contrasts: [{ dimension: 'hook_type', key: 'question', kind: 'contredit', statement: 'Le marché ouvre sur une question, et ça perd chez toi.', sources: 4 }], sampleSize: 12, provenSize: 5, advertisers: 4, summary: '' } });
    await monter(<MemoireMarche marque="Neva" />);
    expect(document.body.textContent).toContain('Le marché dit l’inverse de tes chiffres');
    expect(document.body.textContent).toContain('4 sources');
    const b = bouton('Apprendre des marques suivies')!;
    expect(b.textContent).toContain('2 crédits par créa');
    expect(marche.learnFromFollowedAction).not.toHaveBeenCalled();
    await cliquer(b);
    expect(marche.learnFromFollowedAction).toHaveBeenCalled();
    expect(marche.marketViewAction).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).toContain('3 créas décrites.');
  });
});

/* ───────────────────────── Radar créatif ───────────────────────── */

const crea = (titre: string, bucket: CreaNotee['bucket']): CreaNotee => ({ title: titre, platform: 'meta', fingerprint: titre, spend: 120, impressions: 5000, daysActive: 12, grades: { hook: 'A', hold: 'B', ctr: 'C', conv: 'D', overall: 'B' }, globalScore: 2.5, bucket, diagnosis: ['Hook lent'] });
const propsRadar = { ouvert: true, pastilleRadar: null, alertes: [], marques: [], inclus: 'Inclus', verrou: null };

describe('Spatial · Radar · tes créas notées', () => {
  it('les créas RÉELLES notées A→D, la recommandation et le lien vers un projet', () => {
    const rows = [crea('Créa été', 'winner'), crea('Créa hiver', 'kill_candidate')];
    const html = rendre(<Radar {...propsRadar} creatif={{ maj: '20/10/2026', resume: resumeRadarCreatif(rows), lignes: rows.map(ligneRadarCreatif) }} />);
    expect(html).toContain('Radar créatif · tes créas notées');
    expect(html).toContain('<span class="pill g" style="margin-left:0" title="Hook · A">Hook A</span>');
    expect(html).toContain('Scaler · 1');
    expect(html).toContain('href="/studio/projets/nouveau?type=ads&amp;angle=Cr%C3%A9a+%C3%A9t%C3%A9"');
  });
  it('sans synchronisation · aucun exemple, le geste réel est de brancher Meta Ads · absent, l’écran de la maquette', () => {
    const html = rendre(<Radar {...propsRadar} creatif={null} />);
    expect(html).toContain('href="/connections"');
    expect(html).not.toContain('Score');
    expect(rendre(<Radar {...propsRadar} />)).not.toContain('Radar créatif');
  });
});

/* ───────────────────────── Radar · gestes de l'ancien onglet Sauvegardes ───────────────────────── */

const marqueSuivie = { cle: 'f1', nom: 'Neva', initiale: 'N', fond: 'var(--glass2)', site: 'neva.fr', vignettes: [], nouveautes: '2 nouvelles', voir: '/veille?q=Neva',
  gestes: { plateforme: 'meta', biblio: { href: 'https://www.facebook.com/ads/library/?q=Neva', libelle: 'Meta · rechercher l’annonceur' }, siteWeb: 'https://neva.fr' } };

describe('Spatial · Radar · marques suivies, nouveautés, exploration', () => {
  it('« Brief » lit les pubs de la marque (action réelle, sans IA) · la créa se prépare depuis l’angle dominant', async () => {
    await monter(<Radar {...propsRadar} marques={[marqueSuivie]} />);
    await cliquer(bouton('Brief'));
    expect(suivi.briefMarqueAction).toHaveBeenCalledWith({ platform: 'meta', name: 'Neva' });
    expect(document.body.textContent).toContain('3/8');
    expect(document.querySelector('[aria-label="Brief · Neva"] a.btn.pri')?.getAttribute('href')).toMatch(/^\/studio\/projets\/nouveau\?type=video&angle=/);
    expect(document.querySelector('[data-gestes-marque] button[aria-pressed="true"]')?.textContent).toContain('Suivi');
  });
  it('« Vérifier maintenant » et « Tout marquer vu » appellent le suivi réel · fermé, la raison est dite', async () => {
    await monter(<Radar {...propsRadar} marques={[marqueSuivie]} suivi={{ scan: { actif: true, raison: null }, nonVues: 2, explorer: false }} />);
    await cliquer(bouton('Vérifier maintenant'));
    expect(suivi.scanTrackerAction).toHaveBeenCalled();
    expect(toasts.at(-1)).toBe('3 nouvelle(s) pub(s) détectée(s)');
    await cliquer(bouton('Tout marquer vu'));
    expect(suivi.markTrackerSeenAction).toHaveBeenCalled();
    const ferme = rendre(<Radar {...propsRadar} suivi={{ scan: { actif: false, raison: 'Suis d’abord des marques dans la Veille.' }, nonVues: 0, explorer: false }} />);
    expect(ferme).toMatch(/<button type="button" class="btn sm" disabled="" title="Suis d’abord des marques dans la Veille\."/);
    expect(ferme).not.toContain('Tout marquer vu');
  });
  it('explorer · la découverte et la carte d’identité de la catégorie, à la demande seulement', async () => {
    await monter(<Radar {...propsRadar} suivi={{ scan: { actif: true, raison: null }, nonVues: 0, explorer: true }} />);
    expect(suivi.decouverteMarcheAction).not.toHaveBeenCalled();
    await cliquer(bouton('Trouver des créas éprouvées'));
    expect(document.body.textContent).toContain('Découverte');
    expect(bouton('Génère ta version') ?? document.querySelector('a.btn.sm[href^="/studio"]')).toBeTruthy();
    await cliquer(bouton('Lire ce qui gagne'));
    expect(suivi.grammaireCategorieAction).toHaveBeenCalled();
    expect(suivi.grammaireVideoAction).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Produit centré');
  });
});

/* ───────────────────────── Vague 4 · les gestes de l'écran Formats V5, dans Sauvegardes ───────────────────────── */

const { TousLesFormats } = await import('../spatial/vues/formats/TousLesFormats');

describe('Spatial · Sauvegardes · vague 4 · tri, incertaines, filtres de départ', () => {
  const G = { formatFerme: null, test: { ouvert: true as const } };
  const noms = () => [...document.querySelectorAll('.vitem .who')].map((w) => w.textContent?.replace(/^M|Meta$/g, ''));
  it('les quatre tris de l’écran Formats réordonnent réellement les cartes', async () => {
    await monter(<CollectionsSauvegardes gestes={G} creerProjet="/p" items={[
      sauvegarde('1', { sauvegardeLe: '2026-10-01T00:00:00Z', jours: 5 }),
      sauvegarde('2', { sauvegardeLe: '2026-10-03T00:00:00Z', jours: 50 }),
      sauvegarde('3', { sauvegardeLe: '2026-10-02T00:00:00Z', jours: 20 }),
    ]} />);
    expect(noms()).toEqual(['Marque 2', 'Marque 3', 'Marque 1']);
    await choisir(document.querySelector('select[aria-label="Trier les sauvegardes"]') as HTMLSelectElement, 'ancien');
    expect(noms()).toEqual(['Marque 1', 'Marque 3', 'Marque 2']);
    await choisir(document.querySelector('select[aria-label="Trier les sauvegardes"]') as HTMLSelectElement, 'duree');
    expect(noms()).toEqual(['Marque 2', 'Marque 3', 'Marque 1']);
  });
  it('une incertaine a sa propre file · elle ne se mêle pas aux non classées', async () => {
    await monter(<CollectionsSauvegardes gestes={G} creerProjet="/p" items={[sauvegarde('1'), sauvegarde('2', { format: { id: null, versionAncienne: true, etat: 'incertain' } })]} />);
    const filtre = document.querySelector('select[aria-label="Filtrer par format"]') as HTMLSelectElement;
    expect([...filtre.options].map((o) => o.textContent)).toContain('Incertaines · exclues des formats');
    await choisir(filtre, 'non_classe');
    expect(noms()).toEqual(['Marque 1']);
    await choisir(filtre, 'incertain');
    expect(noms()).toEqual(['Marque 2']);
    expect(rendre(<CollectionsSauvegardes gestes={G} creerProjet="/p" items={[sauvegarde('1')]} />)).not.toContain('Incertaines');
  });
  it('les filtres de départ (lus dans l’adresse par la page) s’appliquent au premier rendu · la provenance s’affiche', () => {
    const html = rendre(<CollectionsSauvegardes gestes={G} creerProjet="/p" filtresInitiaux={{ texte: '', format: 'packshot', media: 'tous', plateforme: 'tous', tri: 'recent' }} items={[
      sauvegarde('1'), sauvegarde('2', { format: { id: 'packshot', versionAncienne: false, etat: 'classe' }, sauvegardeLe: '2026-10-05T09:00:00Z', classeeLe: '2026-10-06T09:00:00Z', auteur: 'Kevin' }),
    ]} />);
    expect((html.match(/class="vitem"/g) ?? []).length).toBe(1);
    expect(html).toContain('Meta · sauvegardée le 05/10/2026 · classée le 06/10/2026 par Kevin');
  });
});

describe('Spatial · Tous les formats · vague 4 · les files de classement', () => {
  it('« Classer » et « incertaines » mènent aux Sauvegardes filtrées · absentes sans file', () => {
    const base = { sousNav: [], styles: [], image: null, marque: null, perimetre: 'p' };
    const html = rendre(<TousLesFormats {...base} files={[{ href: '/saved?format=non_classe', libelle: 'Classer mes 3 sauvegardes' }]} />);
    expect(html).toMatch(/<a class="chip" data-file-classement="true" href="\/saved\?format=non_classe">Classer mes 3 sauvegardes/);
    expect(rendre(<TousLesFormats {...base} />)).not.toContain('data-file-classement');
  });
});

describe('Spatial · Ce qui scale · vague 4 · l’analyse d’une marque', () => {
  it('le lien vers toutes ses pubs, seulement pour une marque', () => {
    const html = rendre(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils({ marque: { terme: 'rival.fr', href: '/veille?q=rival.fr' } })} />);
    expect(html).toMatch(/data-analyse-marque[^>]*>Analyse d’une marque · toutes les créas de <b>rival\.fr<\/b>.*href="\/veille\?q=rival\.fr"[^>]*>Voir toutes ses pubs/);
    expect(rendre(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils()} />)).not.toContain('data-analyse-marque');
  });
});

describe('Spatial · vague 4 · la vidéo d’une pub se lit (comme l’ancienne carte)', () => {
  const vid = { mediaType: 'video', mediaUrl: 'https://cdn.test/v.mp4', thumbnailUrl: 'https://cdn.test/v.jpg' };
  it('Sauvegardes · une vidéo lisible ouvre son fichier · une vidéo sans adresse garde la pastille seule', () => {
    const html = rendre(<CollectionsSauvegardes creerProjet="/p" items={[sauvegarde('1', { video: true, ad: ad('x1', vid) }), sauvegarde('2', { video: true, ad: ad('x2', { mediaType: 'video' }) })]} />);
    expect(html).toMatch(/<a class="play" href="https:\/\/cdn\.test\/v\.mp4" target="_blank"[^>]*aria-label="Lire la vidéo de Marque 1"/);
    expect((html.match(/class="play"/g) ?? []).length).toBe(2);
  });
  it('Ce qui scale · « Lire la vidéo » seulement pour une vidéo lisible', async () => {
    const lignes = [{ ...LIGNES[0]!, ad: ad('a', { advertiserName: 'Neva', ...vid }) }, LIGNES[1]!];
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils({ lignes })} />);
    const liens = [...document.querySelectorAll('.scaleL a')].filter((a) => a.textContent === 'Lire la vidéo');
    expect(liens.map((a) => a.getAttribute('href'))).toEqual(['https://cdn.test/v.mp4']);
  });
});

describe('Spatial · Ce qui scale · vague 4 · les filtres vivent dans l’adresse (ex lot 18B, swipe file V5)', () => {
  const sansOutilsUrl = () => window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR');
  afterEach(sansOutilsUrl);
  it('un changement réécrit l’adresse (niche gardée), sans entrée d’historique de plus · Réinitialiser la nettoie', async () => {
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR&annonceur=Ploufy');
    const avant = window.history.length;
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils({ initial: { ...FILTRES_OUTIL_SCALE, annonceur: 'Ploufy' } })} />);
    await cliquer(bouton('Vidéos'));
    expect(window.location.search, 'le filtre ne survit pas au rechargement').toBe('?q=skincare&country=FR&annonceur=Ploufy&type=video');
    expect(window.history.length).toBe(avant);
    await cliquer(bouton('Réinitialiser'));
    expect(window.location.search, 'la réinitialisation laisse des critères dans l’adresse').toBe('?q=skincare&country=FR');
  });
  it('revenu par le Retour avec une page restaurée sans critères · l’adresse est relue au montage', async () => {
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR&annonceur=Ploufy');
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils()} />);
    expect(document.querySelector('[data-compte]')?.textContent, 'critère de l’adresse non relu').toBe('2 sur 3');
    expect(document.querySelector('button[aria-label="Retirer le critère · Ploufy"]')).not.toBeNull();
  });
});

/* ───────── Vague 4 · les gardes de comportement des écrans V5 retirés (Sauvegardes, Formats, ★), portées ───────── */

describe('Spatial · Sauvegardes · vague 4 · aucun faux succès (ex lots 19C et 20B)', () => {
  const G = { formatFerme: null, test: { ouvert: true as const } };
  it('classer · panne réseau · le choix revient, l’échec est dit, le focus revient au choix (jamais sur la page)', async () => {
    actions.classerFormatSauvegarde.mockRejectedValueOnce(new Error('réseau') as never);
    await monter(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" gestes={G} />);
    const sel = document.querySelector('.vitem select[data-format-choix]') as HTMLSelectElement;
    await choisir(sel, 'packshot');
    const enr = bouton('Enregistrer')!;
    enr.focus();
    await cliquer(enr);
    expect(sel.value).toBe('non_classe');
    expect(toasts.at(-1)).toMatch(/^Échec de l’enregistrement/);
    expect(document.activeElement, 'le focus est tombé sur la page').toBe(sel);
  });
  it('classer · refus · même retour du focus · un focus parti sur une autre carte n’est pas repris', async () => {
    let finir: (v: unknown) => void = () => {};
    actions.classerFormatSauvegarde.mockImplementationOnce(() => new Promise((r) => { finir = r; }) as never);
    await monter(<CollectionsSauvegardes items={[sauvegarde('1'), sauvegarde('2')]} creerProjet="/p" gestes={G} />);
    const [s1, s2] = [...document.querySelectorAll('.vitem select[data-format-choix]')] as HTMLSelectElement[];
    await choisir(s1!, 'packshot');
    await cliquer(bouton('Enregistrer'));
    s2!.focus();
    await act(async () => { finir({ ok: false, error: 'Refusé par le serveur.' }); });
    expect(toasts.at(-1)).toBe('Refusé par le serveur.');
    expect(document.activeElement, 'le focus parti ailleurs a été volé').toBe(s2);
  });
  it('ranger · exception réseau · la créa reste dans sa collection, l’échec est dit, aucun « Rangée dans »', async () => {
    actions.setSavedAdFolder.mockRejectedValueOnce(new Error('réseau') as never);
    await monter(<CollectionsSauvegardes items={[sauvegarde('1', { folder: 'Hooks' }), sauvegarde('2', { folder: 'Ailleurs' })]} creerProjet="/p" gestes={G} />);
    await cliquer(bouton('Hooks'));
    await cliquer(bouton('Gardée'));
    await cliquer(bouton('Ranger dans « Ailleurs »'));
    expect(document.querySelectorAll('.vitem'), 'la créa a quitté sa collection sur un échec').toHaveLength(1);
    expect(toasts.join('|')).not.toMatch(/Rangée dans/);
    expect(toasts.at(-1)).toMatch(/^Échec/);
  });
  it('« Préparer un test » · après une erreur, un nouvel essai part · l’erreur s’efface pendant l’attente · double clic, une requête · le succès est définitif', async () => {
    pont.trackSavedAdAction.mockResolvedValueOnce({ error: 'Choisis d’abord une marque active.' } as never);
    await monter(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" gestes={G} />);
    await cliquer(bouton('Préparer un test'));
    expect(document.querySelector('.vitem [role="status"]')?.textContent).toBe('Choisis d’abord une marque active.');
    let finir: (v: unknown) => void = () => {};
    pont.trackSavedAdAction.mockImplementationOnce(() => new Promise((r) => { finir = r; }) as never);
    const b = bouton('Préparer un test')!;
    await act(async () => { b.click(); b.click(); });
    expect(document.querySelector('.vitem [role="status"]')?.textContent, 'l’erreur reste affichée pendant le nouvel essai').not.toMatch(/marque active/);
    await act(async () => { finir({}); });
    expect(pont.trackSavedAdAction, 'double clic · deux requêtes').toHaveBeenCalledTimes(2);
    const fait = bouton('Brouillon de test créé')!;
    expect(fait.disabled).toBe(true);
  });
  it('« Préparer un test » · exception réseau · le bouton n’est pas bloqué, l’échec est dit', async () => {
    pont.trackSavedAdAction.mockRejectedValueOnce(new Error('réseau') as never);
    await monter(<CollectionsSauvegardes items={[sauvegarde('1')]} creerProjet="/p" gestes={G} />);
    await cliquer(bouton('Préparer un test'));
    expect(document.querySelector('.vitem [role="status"]')?.textContent).toMatch(/^Échec/);
    expect(bouton('Préparer un test')!.disabled).toBe(false);
  });
});

describe('Spatial · Ce qui scale · vague 4 · les états vides se lisent (ex R15, swipe file V5)', () => {
  it('sans aucune créa · un état vide explicite · un filtre qui ne rend rien · un état distinct, avec « Réinitialiser »', async () => {
    const vide = rendre(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={{ titre: 'Aucune créa trouvée pour cette niche', texte: 't', action: null }} outils={outils({ lignes: [] })} />);
    expect(vide).toContain('Aucune créa trouvée pour cette niche');
    expect(vide).not.toContain('Aucune créa ne passe ces critères');
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR&texte=zzz-introuvable');
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils({ initial: { ...FILTRES_OUTIL_SCALE, texte: 'zzz-introuvable' } })} />);
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR');
    expect(document.body.textContent).toContain('Aucune créa ne passe ces critères');
    expect(document.querySelector('[data-compte]')?.textContent).toBe('0 sur 3');
    expect(bouton('Réinitialiser')).toBeTruthy();
  });
});

describe('Spatial · Ce qui scale · vague 4 · ergonomie du swipe file (ex lot ergonomie Veille)', () => {
  const champ = () => document.querySelector('.tile[aria-label="Filtrer et trier"] input') as HTMLInputElement;
  it('une puce retirée relâche SON critère, pas les autres', async () => {
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR&type=video&annonceur=Ploufy');
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils({ initial: { ...FILTRES_OUTIL_SCALE, type: 'video', annonceur: 'Ploufy' } })} />);
    await cliquer(document.querySelector('button[aria-label="Retirer le critère · Vidéos"]'));
    expect(document.querySelector('button[aria-label="Retirer le critère · Ploufy"]'), 'retirer « Vidéos » a relâché l’annonceur').not.toBeNull();
    expect(document.querySelector('button[aria-label="Retirer le critère · Vidéos"]')).toBeNull();
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR');
  });
  it('« / » hors champ met le focus sur la recherche · un select focalisé garde le focus', async () => {
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils()} />);
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' })); });
    expect(document.activeElement).toBe(champ());
    const sel = document.querySelector('.tile[aria-label="Filtrer et trier"] select') as HTMLSelectElement;
    sel.focus();
    await act(async () => { sel.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true })); });
    expect(document.activeElement, '« / » a volé le focus d’un select').toBe(sel);
  });
  it('réinitialiser rend le focus au champ (le bouton disparaît)', async () => {
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR&texte=zzz');
    await monter(<CeQuiScale sous="s" lignes={[]} pastilleRadar={null} vide={null} outils={outils({ initial: { ...FILTRES_OUTIL_SCALE, texte: 'zzz' } })} />);
    const r = bouton('Réinitialiser')!;
    r.focus();
    await cliquer(r);
    expect(bouton('Réinitialiser')).toBeUndefined();
    expect(document.activeElement, 'le focus est tombé sur la page').toBe(champ());
    window.history.replaceState(null, '', '/veille/scale?q=skincare&country=FR');
  });
});
