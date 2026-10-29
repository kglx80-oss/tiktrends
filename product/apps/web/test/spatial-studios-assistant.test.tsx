// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { construireBriefV5, messageHorsLigneStudio, saisieBriefVide, type BriefCanonique } from '@tiktrends/core';
import type { DevisImageVue, VueParcoursImage } from '../lib/studios/image/parcours';
import { parite, squelette } from './spatial/parite';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Spatial · « Nouveau projet » · l'assistant RÉEL porté dans l'écran Spatial
 * (vague 3). On rend la VRAIE vue (jsdom), on clique, on LIT le HTML :
 *  · l'étape 1 reproduit la maquette (parité de structure) ;
 *  · le brief porte les champs STRUCTURÉS (type d'objectif, plateformes,
 *    persona Adsmap, angle, concept) et « Continuer » crée le projet avec ce
 *    brief (`creerProjet`), gratuitement, sans aucun appel payant ;
 *  · chaque appel payant affiche son prix AVANT le bouton, et n'est lancé que
 *    par un clic ; le lot multi-formats passe par le devis serveur puis une
 *    confirmation explicite ; rien n'est débité sans « J'ai vérifié le devis ».
 */

const h = vi.hoisted(() => ({
  routeur: { push: vi.fn(), refresh: vi.fn() },
  vue: null as unknown,
  brief: null as unknown,
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/studio/projets/nouveau', useRouter: () => h.routeur }));
const projets = vi.hoisted(() => ({ creerProjet: vi.fn(async () => ({ ok: true as const, projet: { id: 'p1' }, version: { id: 'v1', n: 1 } })) }));
vi.mock('../app/actions/studios/projets', () => projets);
const sources = vi.hoisted(() => ({
  ajouterSourcesAuProjet: vi.fn(async () => ({ ok: true as const })),
  lireProjetDetail: vi.fn(async () => ({ ok: true as const, detail: { brief: h.brief, briefIllisible: false, version: { id: 'v1', n: 1 } } })),
  preparerCreation: vi.fn(async () => ({ ok: true as const, ia: { disponible: true, raison: null, plafondUsd: 0.13 } })),
  proposerHypotheses: vi.fn(async () => ({ ok: true as const, hypotheses: [{ id: 'h1', statement: 'Si la question ouvre, alors plus de vues', sourceIds: ['s1'], variable: 'accroche', control: 'a', treatment: 'b', invariants: [], metric: 'CTR', decisionRule: 'garder si +10 %', limitations: [] }] })),
}));
vi.mock('../app/actions/studios/sources', () => sources);
const departs = vi.hoisted(() => ({
  listerDepartsAssistant: vi.fn(async () => ({ ok: true as const, choix: [{ id: '11111111-1111-4111-8111-111111111111', titre: 'Marque X', detail: 'Annonce', apercu: null }] })),
  lireDepartAssistant: vi.fn(async (origine: string, id: string) => ({ ok: true as const, depart: { origine, id, titre: 'D’après Marque X', intention: '', sources: [{ type: 'sauvegarde', id }], testId: null } })),
}));
vi.mock('../app/actions/studios/departs-assistant', () => departs);
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn(async () => {}) }));
const jarvis = { disponible: true, motif: null, raison: '', coutMaxUsd: 0.05, mentionCout: 'Appel texte payant · 0,05 $ au plus, imputé au plafond de dépense.' };
const props = vi.hoisted(() => ({
  listerPropositions: vi.fn(async () => ({ ok: true as const, projectId: 'p1', versionCourante: { id: 'v1', n: 1 }, propositions: [], jarvis: { disponible: true, motif: null, raison: '', coutMaxUsd: 0.05, mentionCout: 'Appel texte payant · 0,05 $ au plus, imputé au plafond de dépense.' }, peutProposer: true, cibles: [] })),
  proposerBrief: vi.fn(async () => ({ ok: true as const, statut: 'proposee' })),
  creerPropositionManuelle: vi.fn(async () => ({ ok: true as const, statut: 'proposee', proposition: { id: 'prop-1' } })),
  appliquerProposition: vi.fn(async () => ({ ok: true as const, version: { id: 'v2', n: 2 }, deja: false })),
  rejeterProposition: vi.fn(async () => ({ ok: true as const })),
  inspecterProposition: vi.fn(),
}));
vi.mock('../app/actions/studios/propositions', () => props);
const image = vi.hoisted(() => ({
  lireParcoursImage: vi.fn(async () => (h.vue ? { ok: true as const, vue: h.vue } : { ok: false as const, code: 'UNSUPPORTED_CAPABILITY', message: 'Génération coupée pour cet espace.', targetIds: ['generation_image'], recoverable: true, traceId: 't' })),
  compilerConsigneImage: vi.fn(async () => ({ ok: true as const, statut: 'compilee' })),
  retenirConsigneImage: vi.fn(async () => ({ ok: true as const })),
  demanderDevisImage: vi.fn(async () => ({ ok: true as const, devis: { id: 'q1', inputHash: 'H' } })),
  approuverEtLancerImage: vi.fn(async () => ({ ok: true as const, job: { id: 'job-1' }, deja: false })),
}));
vi.mock('../app/actions/studios/image', () => image);
const lots = vi.hoisted(() => ({
  preparerLotFormats: vi.fn(async () => ({ ok: true as const, lot: { id: 'lot-1', projectId: 'p1', versionId: 'v1', nombre: 4, type: 'images-formats', formats: ['4:5', '9:16'], devis: [], totalCredits: 16, totalUsdMicros: 2_400_000, qualification: { nature: 'borne', libelle: 'maximum', raison: null }, expiresAt: new Date('2026-10-27T12:00:00Z'), empreinte: 'E1' } })),
  preparerLotImages: vi.fn(),
  approuverLotImages: vi.fn(async () => ({ ok: true as const, jobs: [{ id: 'j1' }, { id: 'j2' }] })),
}));
vi.mock('../app/actions/studios/lot-formats', () => ({ preparerLotFormats: lots.preparerLotFormats }));
vi.mock('../app/actions/studios/lot-images', () => ({ preparerLotImages: lots.preparerLotImages, approuverLotImages: lots.approuverLotImages }));
vi.mock('../app/actions/studios/variantes', () => ({ listerVariantes: vi.fn(async () => ({ ok: true, donnees: { variantes: [], droits: { proposer: true } } })), creerVariante: vi.fn() }));
vi.mock('../app/actions/studios/produit', () => ({ epinglerProduit: vi.fn(), lireProduitProjet: vi.fn(), importerPhotoProduit: vi.fn(), associerReference: vi.fn(), retirerReference: vi.fn(), trancherComposants: vi.fn() }));
vi.mock('../app/actions/studios/execution', () => ({ annulerJob: vi.fn() }));

const { FournisseurSpatial } = await import('../spatial/coquille/contexte');
const { NouveauProjet } = await import('../spatial/vues/studios/NouveauProjet');
const { FormatDevis } = await import('../spatial/vues/studios/assistant/FormatDevis');
const { ConfirmationDevis } = await import('../spatial/vues/studios/assistant/Confirmation');
type CtxSpatial = import('../spatial/coquille/contexte').CtxSpatial;
type Props = Parameters<typeof NouveauProjet>[0];

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false }, nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: ReactNode) => renderToStaticMarkup(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>).replace(/^(?:<link[^>]*>)+/, '');

const propsNouveau = (o: Partial<Props> = {}): Props => ({
  sous: 'Studios · Marque', etat: { etat: 'pret', marque: { id: 'b1', nom: 'Marque' }, libelle: 'Nouveau projet' },
  marques: [{ id: 'b1', nom: 'Marque', active: true }, { id: 'b2', nom: 'Autre', active: false }], ajouterMarque: '/brands/new',
  initial: { type: 'ads', titre: 'Pub statique · Marque', intention: '', etape: 'start' },
  titresParDefaut: { ads: 'Pub statique · Marque', image: 'Image · Marque', video: 'Vidéo · Marque', text: 'Textes · Marque' },
  personas: [{ id: 'per-1', label: 'Claire, maman active' }],
  produits: [{ id: 'pr1', nom: 'Lunettes', photos: [{ assetId: 'a1', apercu: '/a1.jpg', position: 1 }] }],
  contexte: { depart: null, references: [], notes: [], repris: [], retourVeille: null },
  ...o,
});

const brief = (o: Partial<BriefCanonique> = {}): BriefCanonique => ({ ...construireBriefV5({ ...saisieBriefVide(), intention: 'Vendre des lunettes' }), ...o });
const devis: DevisImageVue = {
  id: 'q1', inputHash: 'H', credits: 4, usdMicros: 600_000, expiresAt: '2026-10-27T10:30:00Z',
  qualification: { nature: 'borne', libelle: 'maximum', raison: null },
  lignes: [{ libelle: 'Image · publicité', usdMicros: 600_000, natureCout: 'borne', motifEstimation: null }],
} as DevisImageVue;
const vueParcours = (o: Partial<VueParcoursImage> = {}): VueParcoursImage => ({
  projet: { id: 'p1' }, version: { id: 'v1', n: 1 }, modes: [{ mode: 'generative_scene', libelle: 'Mise en scène', pret: true }],
  format: { largeur: 1080, hauteur: 1350, libelle: 'Portrait · 4:5', depuisBrief: true },
  disponibilite: { compilation: { disponible: true, raison: '' }, retenir: { disponible: true, raison: '' }, devis: { disponible: true, raison: '' }, lancement: { disponible: true, raison: '' } },
  coutCompilationUsd: 0.14, prix: { credits: 4, usdMicros: 600_000 }, enAttente: null, retenue: null, devis: null, jobs: [],
  controleVision: { disponible: false, borneParImageUsdMicros: 0 }, composantsObligatoires: [], peutRelire: true, ...o,
} as unknown as VueParcoursImage);

let root: Root | null = null;
beforeEach(() => {
  const el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
  const orn = document.createElement('div'); orn.id = 'orn'; orn.hidden = true; document.body.appendChild(orn);
  vi.clearAllMocks(); window.sessionStorage.clear(); h.vue = null; h.brief = brief();
});
afterEach(() => { act(() => { root?.unmount(); }); document.body.innerHTML = ''; root = null; });
const monter = async (n: ReactNode) => { await act(async () => { root!.render(<FournisseurSpatial value={CTX}>{n}</FournisseurSpatial>); }); };
const attendre = async () => { await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); }); };
const cliquer = async (b: Element | null | undefined) => { expect(b, 'élément à cliquer').toBeTruthy(); await act(async () => { (b as HTMLElement).click(); }); await attendre(); };
const $ = (s: string) => document.querySelector(s);
const saisir = async (sel: string, valeur: string) => {
  const c = $(sel) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  expect(c, sel).toBeTruthy();
  const proto = c instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : c instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(c, valeur); c.dispatchEvent(new Event(c instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
const cocher = async (sel: string) => { await cliquer($(sel)); };
/** Position d'un nœud dans le document · « A précède B ». */
const avant = (a: Element, b: Element) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

/** Du départ au projet créé, à l'étape stratégie. */
async function jusquaStrategie(o: Partial<Props> = {}) {
  await monter(<NouveauProjet {...propsNouveau(o)} />);
  if ($('[data-bouton="vers-brief"]')) await cliquer($('[data-bouton="vers-brief"]'));
  await saisir('[data-champ="intention"]', 'Vendre des lunettes');
  await cliquer($('[data-bouton="creer-projet"]'));
}

/* ───────────────────────────── 1 · parité ───────────────────────────── */

describe('Spatial · Nouveau projet · parité avec la maquette', () => {
  it('l’étape 1 reproduit la maquette · quatre puces, marque, livrable, point de départ', () => {
    const html = rendre(<NouveauProjet {...propsNouveau()} />);
    // Le bandeau Jarvis de la maquette vend un remplissage payant de l'étape, service qui n'existe pas avant le projet (assertion dédiée).
    const p = parite(html, 'nouveau', { ignorer: ['.jfill'] });
    expect(p.rendu).toEqual(p.reference);
    // Mutation éprouvée · une puce de plus fait tomber la parité.
    expect(squelette(html.replace('<span class="sep"></span>', '<span class="sep"></span><button type="button" disabled=""><b>9</b>x</button><span class="sep"></span>'), { ignorer: ['.jfill'] })).not.toEqual(p.reference);
  });

  it('les puces suivent l’ordre réel · Que créer ? · Brief · Stratégie & style · Format & devis', () => {
    const t = document.createElement('template');
    t.innerHTML = rendre(<NouveauProjet {...propsNouveau()} />);
    expect([...t.content.querySelectorAll('nav.steps button')].map((b) => b.textContent)).toEqual(['1Que créer ?', '2Brief', '3Stratégie & style', '4Format & devis']);
    const j = t.content.querySelector('section.jfill')!;
    expect(squelette(j.outerHTML)).toEqual(['section.jfill', '  span.orb', '  div.jft', '    strong', '    small']);
    expect(j.textContent).toMatch(/prix avant le clic/);
    expect(t.content.querySelectorAll('.jfill button')).toHaveLength(0);
  });
});

/* ───────────────────────────── 2 · brief structuré ───────────────────────────── */

describe('Spatial · Nouveau projet · le brief structuré', () => {
  it('rend chaque champ du brief V5 · objectif typé, plateformes, persona Adsmap facultatif', async () => {
    await monter(<NouveauProjet {...propsNouveau()} />);
    expect($('[data-zone="assistant-brief"]')).toBeNull();
    await cliquer($('[data-bouton="vers-brief"]'));
    for (const c of ['titre', 'intention', 'audience', 'contraintes', 'angle', 'concept', 'produit']) expect($(`[data-champ="${c}"]`), c).not.toBeNull();
    expect([...document.querySelectorAll('[data-champ="objectif-type"] [data-objectif]')].map((e) => e.getAttribute('data-objectif'))).toEqual(['notoriete', 'consideration', 'conversion', 'fidelisation']);
    expect(document.querySelectorAll('[data-champ="objectif-type"] [aria-pressed="true"]')).toHaveLength(0);
    expect([...document.querySelectorAll('[data-champ="plateformes"] [data-plateforme]')].map((e) => e.getAttribute('data-plateforme'))).toEqual(['meta_feed', 'meta_stories_reels', 'tiktok']);
    const persona = $('[data-champ="persona"]') as HTMLSelectElement;
    expect(persona.value).toBe('');
    expect([...persona.options].map((o) => o.textContent)).toEqual(['Aucun persona', 'Claire, maman active']);
    expect(document.getElementById('orn')!.textContent).toMatch(/gratuit/);
  });

  it('« Continuer » crée le projet AVEC le brief structuré, gratuitement · aucun appel payant', async () => {
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer($('[data-wliv="image"]'));
    await cliquer($('[data-bouton="vers-brief"]'));
    expect(($('[data-champ="titre"]') as HTMLInputElement).value).toBe('Image · Marque');
    await saisir('[data-champ="intention"]', 'Vendre des lunettes');
    await saisir('[data-champ="audience"]', 'Parents');
    await cliquer($('[data-objectif="conversion"]'));
    await cliquer($('[data-plateforme="tiktok"]'));
    await saisir('[data-champ="persona"]', 'per-1');
    await saisir('[data-champ="angle"]', 'La question qui accroche');
    await saisir('[data-champ="concept"]', 'Plongeon');
    await saisir('[data-champ="contraintes"]', 'Pas de promesse santé');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(projets.creerProjet).toHaveBeenCalledTimes(1);
    const e = (projets.creerProjet.mock.calls[0] as unknown[])[0] as { brandId: string; kind: string; title: string; contenu: { brief: BriefCanonique } };
    expect(e).toMatchObject({ brandId: 'b1', kind: 'image', title: 'Image · Marque' });
    expect(e.contenu.brief).toMatchObject({
      objective: 'Vendre des lunettes', audience: 'Parents', objectifType: 'conversion', plateformes: ['tiktok'],
      personaRef: { id: 'per-1', label: 'Claire, maman active' }, angle: 'La question qui accroche', concept: 'Plongeon', invariants: ['Pas de promesse santé'],
    });
    for (const f of [props.proposerBrief, sources.proposerHypotheses, image.compilerConsigneImage, image.approuverEtLancerImage, lots.approuverLotImages]) expect(f).not.toHaveBeenCalled();
    expect($('[data-zone="assistant-strategie"]')).not.toBeNull();
    expect($('nav.steps')!.getAttribute('data-etape')).toBe('strategie');
  });

  it('sans intention, rien n’est créé et la raison est dite', async () => {
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer($('[data-bouton="vers-brief"]'));
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(projets.creerProjet).not.toHaveBeenCalled();
    expect($('[role="alert"]')!.textContent).toMatch(/intention/);
  });

  // Porté de `l8b-hors-ligne` (« Préparer une création », composant V5 retiré) · créer hors ligne n'est jamais muet.
  it('créer hors ligne · le message « hors ligne » est dit, la saisie reste, aucun second appel', async () => {
    projets.creerProjet.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer($('[data-bouton="vers-brief"]'));
    await saisir('[data-champ="intention"]', 'Une accroche chiffrée augmente le clic');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect($('[role="alert"]')!.textContent).toContain(messageHorsLigneStudio('creation'));
    expect(($('[data-champ="intention"]') as HTMLTextAreaElement).value).toBe('Une accroche chiffrée augmente le clic');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(projets.creerProjet).toHaveBeenCalledTimes(1);
  });

  it('un produit choisi sans photo bloque la création · la photo choisie est épinglée après', async () => {
    const produit = await import('../app/actions/studios/produit');
    vi.mocked(produit.epinglerProduit).mockResolvedValue({ ok: true, version: { id: 'v2', n: 2 } } as never);
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer($('[data-bouton="vers-brief"]'));
    await saisir('[data-champ="intention"]', 'Vendre');
    await saisir('[data-champ="produit"]', 'pr1');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(projets.creerProjet).not.toHaveBeenCalled();
    expect($('[role="alert"]')!.textContent).toMatch(/photo du produit/);
    await saisir('[data-champ="photo-produit"]', 'a1');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(projets.creerProjet).toHaveBeenCalledTimes(1);
    expect(produit.epinglerProduit).toHaveBeenCalledWith({ projectId: 'p1', baseVersionId: 'v1', productId: 'pr1', photoId: 'a1' });
  });

  it('un lien de test repris ouvre le brief, dit ce qui est repris, et revérifie le test avant de créer', async () => {
    const depart = { origine: 'iteration' as const, id: 'it-1', titre: 'Itération de B', intention: 'Test source Adsmap : it-1', sources: [], testId: 'it-1' };
    await monter(<NouveauProjet {...propsNouveau({ initial: { type: 'ads', titre: 'Itération de B', intention: 'Test source Adsmap : it-1', etape: 'brief' }, contexte: { depart, references: [], notes: [], repris: ['Le brief du test Adsmap gagnant est repris'], retourVeille: null } })} />);
    expect($('.banner')!.textContent).toMatch(/repris/);
    expect(($('[data-champ="intention"]') as HTMLTextAreaElement).value).toBe('Test source Adsmap : it-1');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(departs.lireDepartAssistant).toHaveBeenCalledWith('iteration', 'it-1');
    expect(projets.creerProjet).toHaveBeenCalledTimes(1);
  });

  it('un test devenu inéligible bloque la création', async () => {
    departs.lireDepartAssistant.mockResolvedValueOnce({ ok: false, message: 'Ce test ne permet pas une reprise d’itération.' } as never);
    const depart = { origine: 'iteration' as const, id: 'it-1', titre: 'Itération', intention: 'x', sources: [], testId: 'it-1' };
    await monter(<NouveauProjet {...propsNouveau({ initial: { type: 'ads', titre: 'Itération', intention: 'x', etape: 'brief' }, contexte: { depart, references: [], notes: [], repris: [], retourVeille: null } })} />);
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(projets.creerProjet).not.toHaveBeenCalled();
    expect($('[role="alert"]')!.textContent).toMatch(/reprise d’itération/);
  });

  it('« Depuis la Veille » ouvre un panneau qui LIT, puis le choix relu devient une référence attachée après création', async () => {
    await monter(<NouveauProjet {...propsNouveau()} />);
    await cliquer($('[data-wfrom="veille"]'));
    expect(departs.listerDepartsAssistant).toHaveBeenCalledWith('veille');
    expect($('[role="dialog"]')).not.toBeNull();
    expect(projets.creerProjet).not.toHaveBeenCalled();
    await cliquer($('[data-depart-id]'));
    expect(departs.lireDepartAssistant).toHaveBeenCalledWith('veille', '11111111-1111-4111-8111-111111111111');
    expect($('[role="dialog"]')).toBeNull();
    expect($('[data-wfrom="veille"]')!.getAttribute('aria-pressed')).toBe('true');
    await cliquer($('[data-bouton="vers-brief"]'));
    expect(($('[data-champ="titre"]') as HTMLInputElement).value).toBe('D’après Marque X');
    expect($('[data-reference]')!.textContent).toBe('D’après Marque X');
    await saisir('[data-champ="intention"]', 'Vendre');
    await cliquer($('[data-bouton="creer-projet"]'));
    expect(sources.ajouterSourcesAuProjet).toHaveBeenCalledWith({ projectId: 'p1', sources: [{ type: 'sauvegarde', id: '11111111-1111-4111-8111-111111111111' }] });
  });

  it('sans marque active · on le dit, avec la porte vers les marques, sans assistant', async () => {
    await monter(<NouveauProjet {...propsNouveau({ etat: { etat: 'sans-marque', message: 'Choisis une marque active pour créer un projet.', lien: { href: '/brands', libelle: 'Choisir une marque' } } })} />);
    expect($('[data-zone="assistant-projet"]')!.getAttribute('data-etat')).toBe('sans-marque');
    expect($('a[href="/brands"]')).not.toBeNull();
    expect($('[data-bouton="vers-brief"]')).toBeNull();
  });

  it('en lecture seule, aucun geste de création n’est rendu', async () => {
    await monter(<NouveauProjet {...propsNouveau({ etat: { etat: 'lecture-seule', message: 'Ton rôle permet de lire les projets, pas d’en créer.' } })} />);
    expect($('.pickc')).toBeNull();
    expect($('[data-bouton="creer-projet"]')).toBeNull();
    expect(document.getElementById('orn')!.hidden).toBe(true);
    expect(document.body.textContent).toMatch(/pas d’en créer/);
  });
});

/* ───────────────────────────── 3 · stratégie & style ───────────────────────────── */

describe('Spatial · Nouveau projet · stratégie et style sur le projet créé', () => {
  it('le coût de Jarvis est affiché AVANT le bouton, et seul le clic l’appelle', async () => {
    await jusquaStrategie();
    const cout = $('[data-cout="angles"]')!;
    const bouton = $('[data-bouton="proposer-angles"]')!;
    expect(cout.textContent).toBe(jarvis.mentionCout);
    expect(avant(cout, bouton)).toBe(true);
    expect(props.proposerBrief).not.toHaveBeenCalled();
    await cliquer(bouton);
    expect(props.proposerBrief).toHaveBeenCalledTimes(1);
    expect(props.appliquerProposition).not.toHaveBeenCalled();
  });

  it('Jarvis indisponible (plafond, release absente) · la raison remplace le prix, et le bouton ne part pas', async () => {
    props.listerPropositions.mockResolvedValueOnce({ ok: true, projectId: 'p1', versionCourante: { id: 'v1', n: 1 }, propositions: [], jarvis: { ...jarvis, disponible: false, motif: 'PLAFOND', raison: 'Plafond de dépense atteint ce mois-ci.' }, peutProposer: true, cibles: [] } as never);
    await jusquaStrategie();
    expect($('[data-cout="angles"]')!.textContent).toBe('Plafond de dépense atteint ce mois-ci.');
    expect(($('[data-bouton="proposer-angles"]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer($('[data-bouton="proposer-angles"]'));
    expect(props.proposerBrief).not.toHaveBeenCalled();
  });

  it('« Enregistrer mon angle » crée une proposition manuelle bornée à `/brief/angle`, jamais appliquée seule', async () => {
    await jusquaStrategie();
    await saisir('[data-champ="angle-libre"]', 'Une question');
    await cliquer($('[data-bouton="ecrire-angle"]'));
    expect(props.creerPropositionManuelle).toHaveBeenCalledWith(expect.objectContaining({ projectId: 'p1', cible: 'brief', changes: [expect.objectContaining({ path: '/brief/angle', newValue: 'Une question' })], allowedPaths: ['/brief'] }));
    expect(props.appliquerProposition).not.toHaveBeenCalled();
  });

  it('sans source de la Veille, aucune suggestion d’hypothèse n’est offerte (dit honnêtement)', async () => {
    await jusquaStrategie();
    expect($('[data-etat="sans-source"]')).not.toBeNull();
    expect($('[data-bouton="proposer-hypotheses"]')).toBeNull();
    expect(sources.preparerCreation).not.toHaveBeenCalled();
  });

  it('avec une référence, le coût des hypothèses est LU avant le clic (lecture), puis le clic seul appelle Jarvis', async () => {
    const ref = { origine: 'veille' as const, id: 's1', titre: 'D’après X', intention: '', sources: [{ type: 'sauvegarde' as const, id: 's1' }], testId: null };
    await jusquaStrategie({ contexte: { depart: ref, references: [ref], notes: [], repris: [], retourVeille: null } });
    expect(sources.preparerCreation).toHaveBeenCalledWith({ sources: [{ type: 'sauvegarde', id: 's1' }], brandId: 'b1' });
    const cout = $('[data-cout="hypotheses"]')!;
    expect(cout.textContent).toContain('Appel IA · inclus · aucun crédit débité');  // en crédits (29/10) · jamais un montant en argent
    expect(sources.proposerHypotheses).not.toHaveBeenCalled();
    await cliquer($('[data-bouton="proposer-hypotheses"]'));
    expect(sources.proposerHypotheses).toHaveBeenCalledTimes(1);
    await cliquer($('[data-bouton="retenir-hypothese"]'));
    expect(props.creerPropositionManuelle).toHaveBeenCalledTimes(1);
    expect(props.appliquerProposition).not.toHaveBeenCalled();
  });

  it('« Valider la direction » écrit les champs modifiés par une proposition appliquée, sans appel IA, puis ouvre le format', async () => {
    h.vue = vueParcours();
    await jusquaStrategie();
    await cliquer($('[data-bouton="vers-direction"]'));
    expect($('[data-zone="assistant-direction"]')).not.toBeNull();
    expect($('[data-cout="direction"]')!.textContent).toBe(jarvis.mentionCout);
    await saisir('[data-champ="style-libre"]', 'Pastel, lumière douce');
    await cliquer($('[data-bouton="vers-format"]'));
    expect(props.creerPropositionManuelle).toHaveBeenCalledWith(expect.objectContaining({ cible: 'brief', changes: [expect.objectContaining({ path: '/brief/styleIntent', newValue: 'Pastel, lumière douce' })] }));
    expect(props.appliquerProposition).toHaveBeenCalledTimes(1);
    expect(props.proposerBrief).not.toHaveBeenCalled();
    expect($('[data-zone="assistant-format"]')).not.toBeNull();
  });
});

/* ───────────────────────────── 4 · format, devis, lot ───────────────────────────── */

describe('Spatial · Nouveau projet · format et devis', () => {
  const monterFormat = async (b: BriefCanonique, vue: VueParcoursImage | null, o: { lot?: boolean } = {}) => {
    h.vue = vue;
    const cb = { devis: vi.fn(), lot: vi.fn(), retour: vi.fn() };
    await monter(<FormatDevis projectId="p1" version={{ id: 'v1', n: 1 }} brief={b} onBriefChange={async () => {}} onDevisPret={cb.devis} onLotPret={o.lot === false ? undefined : cb.lot} onRetour={cb.retour} />);
    await attendre();
    return cb;
  };

  it('la préparation payante annonce son coût AVANT le bouton · le devis reste fermé tant que la consigne n’est pas validée', async () => {
    await monterFormat(brief(), vueParcours());
    const cout = $('[data-cout="compilation"]')!;
    expect(cout.textContent).toContain('Préparation · Appel IA · inclus · aucun crédit débité');  // en crédits (29/10) · jamais un montant en argent
    expect(avant(cout, $('[data-bouton="compiler-consigne"]')!)).toBe(true);
    expect(($('[data-bouton="voir-devis"]') as HTMLButtonElement).disabled).toBe(true);
    expect(image.compilerConsigneImage).not.toHaveBeenCalled();
    await cliquer($('[data-bouton="compiler-consigne"]'));
    // Le format choisi (défaut) est d'abord écrit dans le brief, gratuitement, puis la consigne est préparée.
    expect(props.creerPropositionManuelle).toHaveBeenCalledWith(expect.objectContaining({ changes: [expect.objectContaining({ path: '/brief/formats' })] }));
    expect(image.compilerConsigneImage).toHaveBeenCalledWith({ projectId: 'p1', mode: 'generative_scene' });
    expect(image.demanderDevisImage).not.toHaveBeenCalled();
  });

  it('deux formats et deux variantes · un LOT de quatre sorties, devis serveur sans débit', async () => {
    const cb = await monterFormat(brief({ formats: ['4:5'] }), vueParcours({ retenue: { verdict: { ok: true } } as never }));
    await cliquer($('[data-format="9:16"]'));
    await cliquer($('[data-nombre="1"]'));
    expect($('[data-champ="sorties"]')!.textContent).toBe('4 images');
    await cliquer($('[data-bouton="voir-devis"]'));
    expect(lots.preparerLotFormats).toHaveBeenCalledWith({ projectId: 'p1', formats: ['4:5', '9:16'], nombreParFormat: 2, controleVision: false });
    expect(cb.lot).toHaveBeenCalledTimes(1);
    expect(lots.approuverLotImages).not.toHaveBeenCalled();
    expect(image.approuverEtLancerImage).not.toHaveBeenCalled();
  });

  it('au moins un format reste choisi, et le nombre est borné à quatre', async () => {
    await monterFormat(brief({ formats: ['4:5'] }), vueParcours({ retenue: { verdict: { ok: true } } as never }));
    await cliquer($('[data-format="4:5"]'));
    expect($('[data-format="4:5"]')!.getAttribute('aria-pressed')).toBe('true');
    for (let i = 0; i < 6; i++) await cliquer($('[data-nombre="1"]'));
    expect($('[data-champ="nombre"]')!.textContent).toBe('4');
    expect(($('[data-nombre="1"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('génération coupée pour l’espace · état honnête, aucun bouton de devis', async () => {
    await monterFormat(brief(), null);
    expect($('[data-zone="format-non-active"]')!.textContent).toMatch(/Génération coupée/);
    expect($('[data-bouton="voir-devis"]')).toBeNull();
  });

  it('la confirmation d’un lot affiche le total AVANT le bouton, et ne lance rien sans « J’ai vérifié »', async () => {
    h.vue = vueParcours({ retenue: { verdict: { ok: true } } as never });
    h.brief = brief({ formats: ['4:5'] });
    await jusquaStrategie();
    await cliquer($('[data-bouton="vers-direction"]'));
    await cliquer($('[data-bouton="vers-format"]'));
    await cliquer($('[data-format="9:16"]'));
    await cliquer($('[data-nombre="1"]'));
    await cliquer($('[data-bouton="voir-devis"]'));
    const prix = $('[data-prix="lot"]')!;
    const confirmer = $('[data-bouton="confirmer-lot"]') as HTMLButtonElement;
    expect(prix.textContent).toMatch(/crédits/); expect(prix.textContent).not.toMatch(/\$/);  // en crédits (29/10) · jamais un montant en argent
    expect(avant(prix, confirmer)).toBe(true);
    expect(confirmer.disabled).toBe(true);
    await cliquer(confirmer);
    expect(lots.approuverLotImages).not.toHaveBeenCalled();
    await cocher('[data-champ="verifie"] input');
    await cliquer($('[data-bouton="confirmer-lot"]'));
    expect(lots.approuverLotImages).toHaveBeenCalledWith({ lotId: 'lot-1', empreinte: 'E1', creditsAnnonces: 16, usdMicrosAnnonces: 2_400_000, confirme: true });
    expect($('[data-zone="assistant-creation"]')).not.toBeNull();
    expect(image.lireParcoursImage).toHaveBeenLastCalledWith({ projectId: 'p1', jobIds: ['j1', 'j2'] });
  });
});

describe('Spatial · Nouveau projet · confirmation d’une image', () => {
  const monterConfirmation = async () => {
    const cb = { lance: vi.fn(), modifier: vi.fn() };
    await monter(<ConfirmationDevis projectId="p1" devis={devis} onModifier={cb.modifier} onLance={cb.lance} />);
    return cb;
  };

  it('le montant, les lignes et l’échéance s’affichent AVANT le bouton · verrouillé tant que le devis n’est pas vérifié', async () => {
    const cb = await monterConfirmation();
    const prix = $('[data-prix="devis"]')!;
    const bouton = $('[data-bouton="confirmer-generer"]') as HTMLButtonElement;
    expect(prix.textContent).toMatch(/^4 crédits/); expect(prix.textContent).not.toMatch(/\$/);  // en crédits (29/10) · jamais un montant en argent
    expect($('[data-lignes="devis"]')!.textContent).toMatch(/Image · publicité/);
    expect(avant(prix, bouton)).toBe(true);
    expect(bouton.disabled).toBe(true);
    await cocher('[data-champ="verifie"] input');
    await cliquer($('[data-bouton="confirmer-generer"]'));
    expect(image.approuverEtLancerImage).toHaveBeenCalledWith({ quoteId: 'q1', inputHash: 'H', creditsAnnonces: 4, idempotencyKey: expect.stringMatching(/^assist-/) });
    expect(cb.lance).toHaveBeenCalledWith({ id: 'job-1' });
  });

  it('un dépassement de plafond est MONTRÉ et rien n’est lancé', async () => {
    image.approuverEtLancerImage.mockResolvedValueOnce({ ok: false, code: 'BUDGET_EXCEEDED', message: 'Plafond de dépense atteint.' } as never);
    const cb = await monterConfirmation();
    await cocher('[data-champ="verifie"] input');
    await cliquer($('[data-bouton="confirmer-generer"]'));
    expect($('[role="alert"]')!.textContent).toMatch(/Plafond de dépense atteint/);
    expect(cb.lance).not.toHaveBeenCalled();
  });

  it('réponse PERDUE · message incertain, boutons verrouillés, aucun second appel', async () => {
    image.approuverEtLancerImage.mockRejectedValueOnce(new Error('réseau'));
    const cb = await monterConfirmation();
    await cocher('[data-champ="verifie"] input');
    await cliquer($('[data-bouton="confirmer-generer"]'));
    expect(($('[data-bouton="confirmer-generer"]') as HTMLButtonElement).disabled).toBe(true);
    expect(($('[data-bouton="modifier"]') as HTMLButtonElement).disabled).toBe(true);
    await cliquer($('[data-bouton="confirmer-generer"]'));
    expect(image.approuverEtLancerImage).toHaveBeenCalledTimes(1);
    expect(cb.lance).not.toHaveBeenCalled();
  });
});

describe('Spatial · Nouveau projet · vidéo et textes', () => {
  it('le format de textes mène à l’atelier textes réel · aucune lecture image ni vidéo, aucun devis image', async () => {
    await jusquaStrategie({ initial: { type: 'text', titre: 'Textes · Marque', intention: '', etape: 'start' } });
    await cliquer($('[data-bouton="vers-direction"]'));
    await cliquer($('[data-bouton="vers-format"]'));
    expect($('[data-zone="assistant-livrable"]')!.getAttribute('data-type')).toBe('text');
    expect([...document.querySelectorAll('#orn a')].map((a) => a.getAttribute('href'))).toContain('/studio/projets/p1/textes');
    expect(image.lireParcoursImage).not.toHaveBeenCalled();
    expect(image.demanderDevisImage).not.toHaveBeenCalled();
    expect(document.querySelector('.sech h2')!.textContent).toBe('Textes & devis');
  });

  it('le format d’une vidéo mène à l’atelier vidéo réel · aucune lecture image, aucun devis inventé', async () => {
    await jusquaStrategie({ initial: { type: 'video', titre: 'Vidéo · Marque', intention: '', etape: 'start' } });
    await cliquer($('[data-bouton="vers-direction"]'));
    await cliquer($('[data-bouton="vers-format"]'));
    expect($('[data-zone="assistant-livrable"]')!.getAttribute('data-type')).toBe('video');
    expect([...document.querySelectorAll('#orn a')].map((a) => a.getAttribute('href'))).toContain('/studio/projets/p1/video');
    expect(image.lireParcoursImage).not.toHaveBeenCalled();
    expect($('nav.steps')!.textContent).toMatch(/Format & devis/);
    expect(document.querySelector('.sech h2')!.textContent).toBe('Storyboard & devis');
  });
});
