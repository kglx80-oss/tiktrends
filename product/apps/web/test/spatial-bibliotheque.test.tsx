// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { donneesDrive, encartKpiJarvis, connexionDrive, cheminPorte, type DossierSource, type MediaSource } from '@tiktrends/core';
import { squelette, fragmentReference, parite } from './spatial/parite';

vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: () => {}, refresh: () => {} }) }));
vi.mock('../app/actions/assets', () => ({ uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn() }));
const creerDossier = vi.fn(async () => ({ ok: true as const, id: 'n1' }));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: (...a: unknown[]) => creerDossier(...(a as [])), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(),
  affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn() }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn(), clearChatAction: vi.fn() }));
const creerConversation = vi.fn(async () => ({ id: 'c-new' }));
vi.mock('../app/actions/jarvis-conversations', () => ({ creerConversationAction: (...a: unknown[]) => creerConversation(...(a as [])) }));

import { FournisseurSpatial, type CtxSpatial } from '../spatial/coquille/contexte';
import { Bibliotheque } from '../spatial/vues/bibliotheque/Bibliotheque';
import { Jarvis } from '../spatial/vues/jarvis/Jarvis';
import { Mcp } from '../spatial/vues/mcp/Mcp';

const CTX: CtxSpatial = {
  utilisateur: { nom: 'Kevin Guilbaux', initiales: 'KG', email: 'k@x.fr', role: 'Propriétaire' },
  credits: { solde: 1240, dotation: 2000, illimite: false },
  nonLues: 4, ouvrirPalette: () => {}, basculer: () => {}, toast: () => {},
};
const rendre = (n: React.ReactNode, ctx: CtxSpatial = CTX) => renderToStaticMarkup(<FournisseurSpatial value={ctx}>{n}</FournisseurSpatial>);

/* ───────────────────────── Bibliothèque ───────────────────────── */

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
let n = 0;
const media = (folderId: string | null, kind: string, mimeType: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id: `m${++n}`, name: `f${n}`, kind, mimeType, source: 'upload', url: `/api/asset?id=m${n}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId, rights: null, ...extra,
});
const studio = (projetId: string) => media(null, 'image', 'image/png', { source: 'studios', studio: { projetId, projetTitre: projetId, href: `/studio/projets/${projetId}` } });

/** Un jeu RÉEL équivalent à la maquette · mêmes nombres d'éléments (5 dossiers d'assets, 3 projets, 1 ancienne création). */
function jeuMaquette() {
  n = 0;
  const dossiers = [dossier('d-photos', 'Photos produit'), dossier('d-life', 'Lifestyle & shooting'), dossier('d-ugc', 'UGC'), dossier('d-logos', 'Logos & charte'), dossier('d-sons', 'Musiques & sons')];
  const medias = [
    ...Array.from({ length: 4 }, () => media('d-photos', 'image', 'image/jpeg')),
    ...Array.from({ length: 2 }, () => media('d-life', 'image', 'image/jpeg')),
    ...Array.from({ length: 2 }, () => media('d-ugc', 'image', 'image/jpeg')),
    ...Array.from({ length: 2 }, () => media('d-logos', 'image', 'image/svg+xml')),
    media('d-sons', 'audio', 'audio/mpeg'),
    ...Array.from({ length: 5 }, () => studio('p1')), ...Array.from({ length: 2 }, () => studio('p2')), studio('p3'),
    media(null, 'image', 'image/png', { source: 'historique', historique: { libelle: 'Ancien studio', telecharger: '/x' } }),
  ];
  return donneesDrive({ dossiers, medias });
}

const propsBiblio = () => ({
  donnees: jeuMaquette(), lectureSeule: null, stockage: true,
  drive: connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null }),
  maintenant: T0,
});

/**
 * Ce que la maquette montre SANS source réelle, retiré du fragment avant la
 * comparaison (et seulement ça) · chaque ligne dit pourquoi.
 */
function bibliothequeSansFictif(html: string): string {
  return html
    // « Exports Meta » · aucun export n'est conservé · l'espace n'existe pas (onglet et nœud d'arbre).
    .replace(/<button type="button" class="" data-dgo="d-exp">[\s\S]*?<\/button>/, '')
    .replace(/<span class="tnsep"><\/span><div class="tnr lv0 " style="--lv:0"><span class="tnc"><\/span><button type="button" class="tnb" data-dgo="d-exp">[\s\S]*?<\/button><\/div>/, '')
    // Favoris et « Partagés avec le client » · aucune donnée ne les porte.
    .replace(/<button type="button" data-dsec="(favoris|partages)"[\s\S]*?<\/button>/g, '')
    // Tags de couleur · aucune colonne · pastilles, étiquettes, teintes et filtre de l'arbre.
    .replace(/<i class="tgdot"[^>]*><\/i>/g, '')
    .replace(/<span class="ftag"><i><\/i>[^<]*<\/span>/g, '')
    .replace(/<div class="fcard " style="--tc:[^"]*">/g, '<div class="fcard " style="">')
    .replace(/<button type="button" class="ftb [^"]*"[\s\S]*?<\/button>/g, '')
    .replace(/<div class="tgl">[\s\S]*?<\/div><\/div>/, '<div class="tgl"><small class="faint"></small></div></div>')
    // Variations de teinte d'une même photo d'exemple · nos vignettes sont les vrais fichiers.
    .replace(/filter:[^;"]*;/g, '')
    // Quota · aucun quota de stockage n'existe · seul le volume mesuré est affiché.
    .replace(/<div class="bar"><i><b style="width:12%"><\/b><\/i><\/div>/, '');
}

describe('Spatial · Bibliothèque reproduit la maquette', () => {
  it('structure identique au fragment (hors contenus sans source, retirés et justifiés)', () => {
    const html = rendre(<Bibliotheque {...propsBiblio()} />);
    const rendu = squelette(html);
    const reference = squelette(bibliothequeSansFictif(fragmentReference('bibliotheque')));
    expect(rendu).toEqual(reference);
  });

  it('la garde voit un écart · retirer une classe la fait tomber', () => {
    const html = rendre(<Bibliotheque {...propsBiblio()} />).replace('class="dsearch"', 'class=""');
    expect(squelette(html)).not.toEqual(squelette(bibliothequeSansFictif(fragmentReference('bibliotheque'))));
  });

  it('aucune donnée d’exemple de la maquette ne s’affiche', () => {
    const html = rendre(<Bibliotheque {...propsBiblio()} />);
    for (const x of ['Neva', 'Exports Meta', 'Favoris', 'Dropbox</strong><small>Connecter', '2,4 Go', '20 Go', 'Prototype']) expect(html, x).not.toContain(x);
    expect(html).toContain('Tags de couleur · bientôt');
    expect(html).toMatch(/<button type="button" class="dapp" disabled=""[^>]*Dropbox/);
  });

  it('lecture seule · la raison est dite, aucun geste d’écriture n’est proposé', () => {
    const html = rendre(<Bibliotheque {...propsBiblio()} lectureSeule="Ton offre ne permet pas d’ajouter des médias." />);
    expect(html).toContain('Lecture seule.');
    expect(html).toContain('Ton offre ne permet pas d’ajouter des médias.');
    expect(html).not.toContain('Nouveau sous-dossier');
    expect(html).not.toContain('class="fsel');
  });

  it('« Nouveau sous-dossier » crée un VRAI dossier, sous le dossier ouvert', async () => {
    creerDossier.mockClear();
    const prompt = vi.spyOn(window, 'prompt').mockReturnValue('Packshots');
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<FournisseurSpatial value={CTX}><Bibliotheque {...propsBiblio()} /></FournisseurSpatial>); });
    // Ouvre « Photos produit » puis crée dedans.
    const carte = [...el.querySelectorAll('button.fopen')].find((b) => b.textContent?.includes('Photos produit'))!;
    await act(async () => { (carte as HTMLButtonElement).click(); });
    expect(el.querySelector('nav.crumb strong')?.textContent).toBe('Photos produit');
    await act(async () => { (el.querySelector('button.fnew') as HTMLButtonElement).click(); });
    expect(creerDossier).toHaveBeenCalledWith({ nom: 'Packshots', parentId: 'd-photos' });
    prompt.mockRestore(); root.unmount(); el.remove();
  });

  it('la corbeille liste les VRAIS dossiers supprimés, et seulement eux', async () => {
    n = 0;
    const d = donneesDrive({ dossiers: [dossier('a', 'Vivant'), { ...dossier('b', 'Jeté'), deletedAt: T0 }], medias: [] });
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<FournisseurSpatial value={CTX}><Bibliotheque {...propsBiblio()} donnees={d} /></FournisseurSpatial>); });
    const corbeille = [...el.querySelectorAll('nav.dsec button')].find((b) => b.textContent?.includes('Corbeille'))!;
    await act(async () => { (corbeille as HTMLButtonElement).click(); });
    const noms = [...el.querySelectorAll('.fcard .ftx strong')].map((x) => x.textContent);
    expect(noms).toEqual(['Jeté']);
    root.unmount(); el.remove();
  });
});

/* ───────────────────────── Jarvis ───────────────────────── */

const propsJarvis = () => ({
  marque: { id: 'b1', nom: 'Marque réelle' },
  conversations: ['c1', 'c2', 'c3', 'c4'].map((id, i) => ({ id, titre: `Titre ${i}`, extrait: `Extrait ${i}`, majLe: T0 })),
  iterations: (['g', 'c', 'g', 'w'] as const).map((classe, k) => ({ id: `l${k}`, titre: `Lot #${k}`, pastille: { classe, libelle: 'Statut' }, quand: 'il y a 2 j', href: `/adsmap/lots?lot=l${k}` })),
  measuredAds: 0,
  kpi: encartKpiJarvis(null),
  cout: 'Aucun crédit débité pour la conversation.',
  maintenant: T0,
});

describe('Spatial · Jarvis reproduit la maquette', () => {
  it('structure identique au fragment (la suppression de conversation, sans action réelle, est absente)', () => {
    const html = rendre(<Jarvis {...propsJarvis()} />);
    // `button.jx` · aucune action ne supprime une conversation (seul le fil s'efface, dans la conversation ouverte).
    const reference = fragmentReference('jarvis').replace(/<button type="button" class="jx"[\s\S]*?<\/button>/g, '');
    expect(squelette(html)).toEqual(squelette(reference));
  });

  it('la garde voit un écart · retirer une classe la fait tomber', () => {
    const html = rendre(<Jarvis {...propsJarvis()} />).replace('class="jsearch"', 'class=""');
    const reference = fragmentReference('jarvis').replace(/<button type="button" class="jx"[\s\S]*?<\/button>/g, '');
    expect(squelette(html)).not.toEqual(squelette(reference));
  });

  it('le coût est annoncé avant l’envoi, aucun chiffre ni donnée d’exemple, automatisations désactivées', () => {
    const html = rendre(<Jarvis {...propsJarvis()} />);
    expect(html).toContain('Aucun crédit débité pour la conversation.');
    for (const x of ['Neva', '10 416', '7,85', 'Prototype', 'Pourquoi B a gagné']) expect(html, x).not.toContain(x);
    expect(html).toContain('n.c.');
    expect(html.match(/class="sw2"[^>]*disabled=""/g)?.length).toBe(1);
    expect(html.match(/<button class="btn sm" type="button" style="margin-left:auto" disabled=""/g)?.length).toBe(2);
  });

  it('une piste PRÉPARE la question · aucun envoi automatique', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    creerConversation.mockClear();
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<FournisseurSpatial value={CTX}><Jarvis {...propsJarvis()} /></FournisseurSpatial>); });
    const carte = el.querySelector('button.pickc') as HTMLButtonElement;
    await act(async () => { carte.click(); });
    expect((el.querySelector('#jin') as HTMLInputElement).value).toMatch(/Par où je commence/);
    // Changer de catégorie change réellement les cartes.
    const avant = el.querySelector('button.pickc strong')?.textContent;
    const accroches = [...el.querySelectorAll('.cats .chip')].find((b) => b.textContent === 'Accroches') as HTMLButtonElement;
    await act(async () => { accroches.click(); });
    expect(el.querySelector('button.pickc strong')?.textContent).not.toBe(avant);
    expect(el.querySelector('.sech h2')?.textContent).toBe('Prompts Accroches');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(creerConversation).not.toHaveBeenCalled();
    fetchSpy.mockRestore(); root.unmount(); el.remove();
  });

  it('`?q=` (Accueil) préremplit la saisie · aucun envoi, aucune conversation créée à l’ouverture', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    creerConversation.mockClear();
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<FournisseurSpatial value={CTX}><Jarvis {...propsJarvis()} brouillon="Quel angle tester ensuite ?" /></FournisseurSpatial>); });
    expect((el.querySelector('#jin') as HTMLInputElement).value).toBe('Quel angle tester ensuite ?');
    expect(el.querySelector('.jempty')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(creerConversation).not.toHaveBeenCalled();
    fetchSpy.mockRestore(); root.unmount(); el.remove();
  });

  it('la recherche filtre réellement les archives', async () => {
    const el = document.createElement('div'); document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => { root.render(<FournisseurSpatial value={CTX}><Jarvis {...propsJarvis()} /></FournisseurSpatial>); });
    const champ = el.querySelector('#jaq') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(champ, 'extrait 2');
      champ.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect([...el.querySelectorAll('#jarchlist .jit-t strong')].map((x) => x.textContent)).toEqual(['Titre 2']);
    root.unmount(); el.remove();
  });
});

/* ───────────────────────── MCP ───────────────────────── */

describe('Spatial · MCP TikTrends reproduit la maquette, en « bientôt »', () => {
  // Contenus FICTIFS de la maquette, sans aucune source (aucun serveur MCP) ·
  // le voyant « en ligne », les huit outils, l'activité. On compare tout le reste.
  const IGNORER = ['.mcpst', '.mtools', '.atable'];

  it('structure identique au fragment', () => {
    const p = parite(rendre(<Mcp />), 'mcp', { ignorer: IGNORER });
    expect(p.rendu).toEqual(p.reference);
  });

  it('la garde voit un écart · retirer une classe la fait tomber', () => {
    const html = rendre(<Mcp />).replace('class="mcpcode"', 'class=""');
    expect(squelette(html, { ignorer: IGNORER })).not.toEqual(squelette(fragmentReference('mcp'), { ignorer: IGNORER }));
  });

  it('le bloc de configuration ne passe pas sous le bouton « Copier » et ne défile pas (vu au banc, 1440 et 390)', () => {
    // Le bouton est absolu en haut à droite (.mcpcode .btn) et partage la hauteur
    // de la 1re ligne du <pre> (blanc · white-space:pre). Mesuré au banc (marge
    // 1re ligne → bouton, place utile du <pre>) :
    //   ancien texte, 1 ligne de 58 car. · chevauche de 51 px (1440), 243 px (390)
    //   « Aucune configuration. » 21 car. · +24 px à 390, chevauche de 6 px à 360, défile à 390
    //   « Rien à copier. » 14 car., lignes ≤ 24 car. · +267 / +75 / +45 px, place 452 / 260 / 230 px, aucun défilement
    const doc = new DOMParser().parseFromString(rendre(<Mcp />), 'text/html');
    const lignes = doc.querySelector('.mcpcode pre')!.textContent!.split('\n');
    expect(lignes[0]!.length).toBeLessThanOrEqual(14);
    expect(lignes.filter((l) => l.length > 24)).toEqual([]);
  });

  it('aucune clé, aucun outil, aucune adresse · chaque contrôle est désactivé', () => {
    const html = rendre(<Mcp />);
    for (const x of ['tt_live', 'mcp.tiktrends.app', 'Serveur en ligne', '99,98', 'lire_fiche_marque', 'neva']) expect(html, x).not.toContain(x);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const controles = [...doc.querySelectorAll('.view button, .view input')].filter((c) => !c.closest('header.top'));
    expect(controles.length).toBeGreaterThan(8);
    expect(controles.filter((c) => !c.hasAttribute('disabled'))).toEqual([]);
  });

  it('l’entrée MCP du rail reste « bientôt » sans lien (décision du chef de projet)', () => {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'packages', 'core', 'src', 'spatial', 'rail.ts'), 'utf8');
    expect(src).toMatch(/cle: 'mcp', href: null/);
    expect(cheminPorte('/mcp')).toBe(true);
  });
});
