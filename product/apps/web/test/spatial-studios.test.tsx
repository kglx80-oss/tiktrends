// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChoixIterationSpatial } from '@tiktrends/core';
import { parite, squelette, fragmentReference } from './spatial/parite';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Spatial · rubrique Studios (D1) · `/studio/projets`, `/studio/prompts`,
 * `/studio/projets/nouveau`, `/studio/iterer`.
 *
 * 1 · PARITÉ DE STRUCTURE · chaque vue, rendue avec des props équivalentes à la
 *     maquette (mêmes nombres d'éléments), reproduit le squelette du fragment
 *     de référence. Les seules exclusions (`ignorer`) visent un contenu FICTIF
 *     de la maquette, chacune justifiée là où elle est posée, et chaque zone
 *     exclue a sa propre assertion sur ce que l'écran réel y rend.
 * 2 · COMPORTEMENT · les gestes appellent les VRAIES actions serveur (mockées
 *     ici), et rien d'autre · aucune génération, aucun débit.
 */

const routeur = { push: vi.fn(), refresh: vi.fn() };
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets', useRouter: () => routeur }));
const archivage = { supprimerProjet: vi.fn(async () => ({ ok: true as const })), restaurerProjet: vi.fn(async () => ({ ok: true as const })) };
vi.mock('../app/actions/studios/archivage', () => archivage);
const sources = { creerProjetDepuisContexte: vi.fn(async () => ({ ok: true as const, projet: { id: 'p-ctx', title: 't', kind: 'ads', brandId: 'b1' }, versionId: 'v', deja: false })) };
vi.mock('../app/actions/studios/sources', () => sources);
const projets = { creerProjet: vi.fn(async () => ({ ok: true as const, projet: { id: 'p-vide' }, version: { id: 'v', n: 1 } })) };
vi.mock('../app/actions/studios/projets', () => projets);
const marques = { setActiveBrand: vi.fn(async () => {}) };
vi.mock('../app/actions/brands', () => marques);

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { Studios } = await import('../spatial/vues/studios/Studios');
const { Prompts } = await import('../spatial/vues/studios/Prompts');
const { NouveauProjet } = await import('../spatial/vues/studios/NouveauProjet');
const { Iterer } = await import('../spatial/vues/studios/Iterer');
const { SOUS_NAV_STUDIOS } = await import('../spatial/vues/studios/sous-nav');
type ProjetSpatial = import('../spatial/vues/studios/GrilleProjets').ProjetSpatial;
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;

const toasts: string[] = [];
const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: (m) => { toasts.push(m); },
};
// React 19 fait précéder le rendu serveur des `<link rel="preload">` de ses images · ce sont des indications au navigateur, pas le DOM de la vue.
const rendre = (n: ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>).replace(/^(?:<link[^>]*>)+/, '');

/** Les images de la maquette sont UNE photo d'exemple recolorée (`filter`, `transform`) pour simuler des créas différentes · ici, de vraies images. */
const PH = '.ph';

/* ─────────────────────────────── jeux de props ─────────────────────────────── */

const img = 'https://cdn.exemple/creative.jpg';
const projet = (i: number, couverture: ProjetSpatial['couverture'], classe: string, segments: ProjetSpatial['segments'], etape: ProjetSpatial['etape'] = 'production'): ProjetSpatial => ({
  id: `p${i}`, href: `/studio/projets/p${i}`, title: `Projet ${i}`, marque: 'M', libelleType: 'Pub statique', etape,
  couverture, version: 'V1', pastille: { libelle: 'En production', classe }, segments, libelleStp: 'M', reprise: 'il y a 2 j',
});
const PROJETS: ProjetSpatial[] = [
  projet(1, [{ src: img, texte: 'a' }, { src: img, texte: 'b', classe: 'won' }, { src: img, texte: 'c', format: '916' }], 'c', ['on', 'on', 'cur', '']),
  projet(2, [{ src: img, texte: 'a' }, { src: img, texte: 'b' }], 'c', ['on', 'cur', '', '']),
  projet(3, [{ src: img, texte: 'a' }, { src: img, texte: 'b', format: '916' }], 'c', ['on', 'on', 'on', 'cur']),
  projet(4, [{ src: img, texte: 'a' }, { src: img, texte: 'b' }], 'w', ['on', 'on', 'cur', ''], 'brief_pret'),
  projet(5, [{ src: img, texte: ' ' }], '', ['cur', '', '', ''], 'brief_a_completer'),
  projet(6, [{ src: img, texte: 'a', format: '916' }], '', ['cur', '', '', ''], 'brief_a_completer'),
];
const carteIter = (id: string, classe: string, icone: string) => ({
  id, flux: [{ src: img, texte: 'gagnante', classe: 'won', tag: 'Gagnante' }, { src: img, texte: 'nouvelle', classe: 'v', tag: 'Nouvelle' }],
  pastille: { libelle: 'Gagnante · Lot #1 conclu', classe, icone }, titre: 'Concept · B',
  mesure: { valeur: '27 %', libelle: 'taux d’accroche', detail: 'sur 7 jours · Meta' }, garde: 'Garde · visuel', change: 'Change · accroche',
  raison: 'Raison réelle.', iterer: '/studio/projets/nouveau?type=ads&iter=x', note: 'Gratuit ici',
});
const propsStudios = (o: Partial<Parameters<typeof Studios>[0]> = {}) => ({
  sousNav: SOUS_NAV_STUDIOS,
  iterations: { etat: 'liste' as const, cartes: [carteIter('a1', 'w', 'flask'), carteIter('a2', 'g', 'bulb')], autre: { href: '/studio/iterer', titre: 'Itérer sur une autre créa', sous: 'x' } },
  projets: PROJETS, nouveau: { href: '/studio/projets/nouveau' }, peutArchiver: true, vide: null, ...o,
});

const choix = (id: string, pastilles: ChoixIterationSpatial['pastilles'], selectionnable = true): ChoixIterationSpatial => ({
  adId: id, titre: `Concept · ${id}`, pastilles, chiffres: [{ libelle: 'ROAS', valeur: '2,10' }, { libelle: 'Dépense', valeur: '3 120 €' }],
  raison: 'Raison du plan.', vignette: img, selectionnable, change: { variable: 'Accroche', garde: 'Visuel et Offre' },
  lien: selectionnable ? `/studio/projets/nouveau?type=ads&iter=${id}` : null,
});
const CHOIX = [
  choix('b', [{ libelle: 'Conseillé', classe: 'g' }, { libelle: 'Décliner', classe: 'w' }]),
  choix('a', [{ libelle: 'Corriger', classe: 'w' }]),
  choix('p', [{ libelle: 'Repartir', classe: 'r' }]),
  choix('c', [{ libelle: 'Décliner', classe: 'g' }], false),
  choix('v', [{ libelle: 'Décliner', classe: 'c' }], false),
];

const propsNouveau = (o: Partial<Parameters<typeof NouveauProjet>[0]> = {}): Parameters<typeof NouveauProjet>[0] => ({
  sous: 'Studios · Marque', etat: { etat: 'pret', marque: { id: 'b1', nom: 'Marque' }, libelle: 'Nouveau concept créatif' },
  marques: [{ id: 'b1', nom: 'Marque', active: true }, { id: 'b2', nom: 'Autre', active: false }], ajouterMarque: '/brands/new',
  initial: { type: 'ads', titre: 'Pub statique · Marque', objectif: '', etape: 1 },
  titresParDefaut: { ads: 'Pub statique · Marque', image: 'Image · Marque', video: 'Vidéo · Marque', text: 'Textes · Marque' },
  produits: [{ id: 'pr1', nom: 'Lunettes' }], notes: [], repris: [], annonce: null, retourVeille: null, ...o,
});

/* ─────────────────────────────── 1 · parité ─────────────────────────────── */

describe('Spatial · Studios · parité de structure avec la maquette', () => {
  it('« Studios » reproduit la maquette', () => {
    const html = rendre(<Studios {...propsStudios()} />);
    const p = parite(html, 'studios', {
      ignorer: [
        PH,
        // La maquette filtre par cinq STATUTS fictifs · le modèle réel n'a que des ÉTAPES (Tous + 3), voir l'assertion dédiée.
        '.toolbar > .seg',
        // Quatre gestes par carte dans la maquette · seul « Archiver » a une action réelle (assertion dédiée).
        '.pacts',
        // Carte 1 de la maquette = lot « à conclure » (« Conclure d’abord ») · le plan réel ne montre que des verdicts arbitrés.
        '.itc:first-child .foot2',
      ],
    });
    expect(p.rendu).toEqual(p.reference);
  });

  it('les filtres sont les étapes RÉELLES, avec leurs compteurs · et les gestes de carte se réduisent à « Archiver »', () => {
    const t = document.createElement('template');
    t.innerHTML = rendre(<Studios {...propsStudios()} />);
    const filtres = [...t.content.querySelectorAll('.toolbar > .seg > button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]);
    expect(filtres).toEqual([['Tous · 6', 'true'], ['Brief à compléter · 2', 'false'], ['Brief prêt · 1', 'false'], ['En production · 3', 'false']]);
    const pacts = [...t.content.querySelectorAll('.pacts')];
    expect(pacts).toHaveLength(6);
    for (const a of pacts) {
      expect(squelette(a.outerHTML)).toEqual(['div.pacts', '  button', '    svg.i.s @i-folder']);
      expect(a.querySelector('button')!.getAttribute('aria-label')).toMatch(/^Archiver /);
    }
    // Sans droit d'archiver, aucun geste n'est rendu.
    t.innerHTML = rendre(<Studios {...propsStudios({ peutArchiver: false })} />);
    expect(t.content.querySelectorAll('.pacts')).toHaveLength(0);
  });

  it('« Prompts conseillés » reproduit la maquette', () => {
    // Autant de variables que chaque prompt de la maquette (4, 2, 3, 2).
    const P = (id: string, rec: boolean, vars: number) => ({
      id, categorie: 'iterer', titre: 't', description: 'd', morceaux: Array.from({ length: vars }, (_, i) => [{ texte: ' texte ' }, { texte: `VAR${i}`, variable: true }]).flat(),
      pastilles: [...(rec ? [{ libelle: 'Recommandé', classe: 'g' }] : []), { libelle: 'Image', classe: '' }, { libelle: 'Textes', classe: '' }],
      requis: 'r', appui: 'a', utiliser: '/studio/projets/nouveau',
    });
    const html = rendre(<Prompts sousNav={SOUS_NAV_STUDIOS}
      categories={[{ cle: 'iterer', libelle: 'Itérer · 4' }, { cle: 'b', libelle: 'b' }, { cle: 'c', libelle: 'c' }, { cle: 'd', libelle: 'd' }, { cle: 'e', libelle: 'e' }, { cle: 'f', libelle: 'f', bientot: true }]}
      contexte={<>Contexte <b>réel</b></>} prompts={[P('1', true, 4), P('2', true, 2), P('3', false, 3), P('4', false, 2)]} vide={{ titre: '', texte: '' }} />);
    const p = parite(html, 'prompts');
    expect(p.rendu).toEqual(p.reference);
  });

  it('« Prompts conseillés » sans dépôt réel · ni catégorie, ni contexte, ni prompt d’exemple, l’état vide le dit', () => {
    const t = document.createElement('template');
    t.innerHTML = rendre(<Prompts sousNav={SOUS_NAV_STUDIOS} categories={[]} contexte={null} prompts={[]} vide={{ titre: 'Aucun prompt conseillé publié pour l’instant', texte: 'x' }} />);
    expect(t.content.querySelector('.pcats')).toBeNull();
    expect(t.content.querySelector('.banner')).toBeNull();
    expect(t.content.querySelector('.prompt')).toBeNull();
    expect(t.content.querySelector('.tile h3')!.textContent).toBe('Aucun prompt conseillé publié pour l’instant');
  });

  it('« Nouveau projet » (étape 1) reproduit la maquette', () => {
    const html = rendre(<NouveauProjet {...propsNouveau()} />);
    // Le bandeau Jarvis de la maquette vend un remplissage payant de l'étape, service qui n'existe pas avant le projet (assertion dédiée).
    const p = parite(html, 'nouveau', { ignorer: ['.jfill'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('le bandeau Jarvis dit où il propose vraiment, sans aucun bouton payant', () => {
    const t = document.createElement('template');
    t.innerHTML = rendre(<NouveauProjet {...propsNouveau()} />);
    const j = t.content.querySelector('section.jfill')!;
    expect(squelette(j.outerHTML)).toEqual(['section.jfill', '  span.orb', '  div.jft', '    strong', '    small']);
    expect(j.textContent).toMatch(/prix avant le clic/);
    expect(t.content.querySelectorAll('.jfill button')).toHaveLength(0);
  });

  it('« Nouvelle itération » (étape 1) reproduit la maquette', () => {
    const html = rendre(<Iterer sous="Itération · Marque" resume="5 suites proposées" choix={CHOIX} initial="b" vide={null} />);
    // La vignette est l'image RÉELLE de la pub · la maquette y peint une accroche d'exemple (`.band`).
    const p = parite(html, 'iterer', { ignorer: ['.itadv'] });
    expect(p.rendu).toEqual(p.reference);
  });

  it('les gardes de parité voient un écart · retirer une classe les fait tomber', () => {
    const ref = squelette(fragmentReference('studios'), { ignorer: [PH, '.toolbar > .seg', '.pacts', '.itc:first-child .foot2'] });
    const casse = rendre(<Studios {...propsStudios()} />).replace('class="ctanew"', 'class="cta"');
    expect(squelette(casse, { ignorer: [PH, '.toolbar > .seg', '.pacts', '.itc:first-child .foot2'] })).not.toEqual(ref);
  });
});

/* ─────────────────────────────── 2 · comportement ─────────────────────────────── */

let root: Root | null = null;
let el: HTMLDivElement | null = null;
beforeEach(() => {
  el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
  toasts.length = 0; vi.clearAllMocks();
});
afterEach(() => { act(() => { root?.unmount(); }); document.body.innerHTML = ''; root = null; el = null; });
const monter = async (n: ReactNode) => { await act(async () => { root!.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const cliquer = async (b: Element | null | undefined) => { expect(b, 'élément à cliquer').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); };
const boutons = (sel: string, texte: string | RegExp) => [...document.querySelectorAll(sel)].find((b) => (typeof texte === 'string' ? b.textContent === texte : texte.test(b.textContent ?? '')));

describe('Spatial · Studios · les gestes appellent les vraies actions', () => {
  it('filtrer par étape ne montre que les projets de cette étape · le compteur est réel', async () => {
    await monter(<Studios {...propsStudios()} />);
    await cliquer(boutons('.toolbar .seg button', 'Brief à compléter · 2'));
    expect([...document.querySelectorAll('.pcard h3')].map((h) => h.textContent)).toEqual(['Projet 5', 'Projet 6']);
    await cliquer(boutons('.toolbar .seg button', 'Tous · 6'));
    expect(document.querySelectorAll('.pcard')).toHaveLength(6);
  });

  it('« Archiver » appelle `supprimerProjet` (réversible), retire la carte, et « Annuler » appelle `restaurerProjet`', async () => {
    await monter(<Studios {...propsStudios()} />);
    await cliquer(document.querySelector('button[aria-label="Archiver Projet 2"]'));
    expect(archivage.supprimerProjet).toHaveBeenCalledWith({ projectId: 'p2' });
    expect([...document.querySelectorAll('.pcard h3')].map((h) => h.textContent)).not.toContain('Projet 2');
    expect(boutons('.toolbar .seg button', /^Tous/)!.textContent).toBe('Tous · 5');
    expect(document.querySelector('.banner')!.textContent).toMatch(/Projet 2.*archivé/);
    await cliquer(boutons('.banner button', 'Annuler'));
    expect(archivage.restaurerProjet).toHaveBeenCalledWith({ projectId: 'p2' });
    expect(document.querySelectorAll('.pcard')).toHaveLength(6);
  });

  it('un refus du serveur garde la carte et dit pourquoi', async () => {
    archivage.supprimerProjet.mockResolvedValueOnce({ ok: false, message: 'Une génération est encore en cours.' } as never);
    await monter(<Studios {...propsStudios()} />);
    await cliquer(document.querySelector('button[aria-label="Archiver Projet 1"]'));
    expect(document.querySelectorAll('.pcard')).toHaveLength(6);
    expect(toasts).toEqual(['Une génération est encore en cours.']);
  });

  it('« Nouvelle itération » · choisir une pub sélectionnable met à jour la barre ; une piste non gagnante reste désactivée', async () => {
    await monter(<Iterer sous="s" resume="r" choix={CHOIX} initial="b" vide={null} />);
    const orn = document.getElementById('orn')!;
    expect(orn.hidden).toBe(false);
    expect(orn.textContent).toMatch(/On change accroche de Concept · b/);
    await cliquer(document.querySelector('[data-itad="a"]'));
    expect(document.querySelector('[data-itad="a"]')!.getAttribute('aria-pressed')).toBe('true');
    expect((document.querySelector('[data-itad="c"]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer(boutons('#orn button', 'Préparer le projet'));
    // La reprise RÉELLE du brief d'itération (préparation du projet, écran porté) · aucune génération.
    expect(routeur.push).toHaveBeenCalledWith('/studio/projets/nouveau?type=ads&iter=a');
  });

  it('« Nouveau projet » · le type choisi, un titre, et « Créer le projet » appelle `creerProjet` · rien d’autre', async () => {
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer(document.querySelector('[data-wliv="image"]'));
    expect(document.querySelector('[data-wliv="image"]')!.getAttribute('aria-pressed')).toBe('true');
    await cliquer(document.querySelector('[data-wfrom="zero"]'));
    expect((document.querySelector('label.field input') as HTMLInputElement).value).toBe('Image · Marque');
    await cliquer(boutons('#orn button', 'Créer le projet'));
    expect(projets.creerProjet).toHaveBeenCalledWith({ brandId: 'b1', kind: 'image', title: 'Image · Marque' });
    expect(sources.creerProjetDepuisContexte).not.toHaveBeenCalled();
    expect(routeur.push).not.toHaveBeenCalledWith(expect.stringContaining('nouveau'));
  });

  it('« Nouveau projet » · un objectif repris (test Adsmap) passe par `creerProjetDepuisContexte`, avec sa clé de clic', async () => {
    await monter(<NouveauProjet {...propsNouveau({ initial: { type: 'ads', titre: 'Itération de B', objectif: 'Test source Adsmap : x', etape: 2 }, repris: ['Le brief du test Adsmap gagnant est repris'] })} />);
    expect(document.querySelector('.banner')!.textContent).toMatch(/repris/);
    await cliquer(boutons('#orn button', 'Créer le projet'));
    expect(sources.creerProjetDepuisContexte).toHaveBeenCalledWith(expect.objectContaining({ brandId: 'b1', kind: 'ads', titre: 'Itération de B', objectif: 'Test source Adsmap : x', cleClic: expect.stringMatching(/^sp-[a-z0-9]+$/) }));
    expect(projets.creerProjet).not.toHaveBeenCalled();
  });

  it('« Nouveau projet » · changer de marque passe par `setActiveBrand` puis relit la page', async () => {
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer(boutons('.opt2', 'Autre'));
    expect(marques.setActiveBrand).toHaveBeenCalledWith('b2');
    expect(routeur.refresh).toHaveBeenCalled();
  });

  it('en lecture seule, aucun geste de création n’est rendu', async () => {
    await monter(<NouveauProjet {...propsNouveau({ etat: { etat: 'lecture-seule', message: 'Ton rôle permet de lire les projets, pas d’en créer.' } })} />);
    expect(document.querySelector('.pickc')).toBeNull();
    expect(document.getElementById('orn')!.hidden).toBe(true);
    expect(document.body.textContent).toMatch(/pas d’en créer/);
  });
});
