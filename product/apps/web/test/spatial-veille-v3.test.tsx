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

const ad = (id: string, o: Partial<InspoAd>): InspoAd => ({ id, platform: 'meta', status: 'active', ...o });
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
