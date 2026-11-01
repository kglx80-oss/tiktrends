// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { CIBLE_TACTILE_PX, PRIMITIVES_TACTILES, ZOOM_VUE_SECTION, connexionDrive, donneesDrive, entreesRail, entreesRailEspace, LOT_ANALYSE_IMAGES, type DossierSource, type MediaSource } from '@tiktrends/core';

/**
 * Spatial · les CASES DE SÉLECTION de la Bibliothèque au téléphone (mode
 * `zone` des cibles tactiles). Mesuré au banc à 390 px · 24,7 px à l'écran en
 * grille, 20,9 px en liste (zoom 0,95), lignes de la liste au pas de 43,7 px.
 * `agrandir` déformerait la case, `deborder` effacerait sa bordure · c'est un
 * enfant vide qui reçoit la cible, la case garde son dessin.
 *
 * On MONTE la vraie coquille et la vraie Bibliothèque (téléphone simulé), la
 * vraie feuille chargée dans le document (la position calculée d'une case en
 * dépend · absolue en grille, statique en liste), et on lit le DOM obtenu.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('@tiktrends/db', () => ({ db: undefined, schema: {} }));
vi.mock('next/navigation', () => ({ usePathname: () => '/assets', useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock('../app/actions/brands', () => ({ setActiveBrand: vi.fn() }));
vi.mock('../app/actions/notifications', () => ({ fetchNotifications: vi.fn(), markAllNotificationsRead: vi.fn(), markNotificationRead: vi.fn() }));
vi.mock('../app/actions/studios/projets', () => ({ listerProjets: vi.fn() }));
vi.mock('../app/actions/jarvis-chat', () => ({ chatThreadAction: vi.fn(), clearChatAction: vi.fn() }));
vi.mock('../app/actions/assets', () => ({
  uploadImageAssetsAction: vi.fn(), presignAssetUploadAction: vi.fn(), registerUploadedAssetAction: vi.fn(), deleteAssetAction: vi.fn(),
  importAssetAction: vi.fn(), toggleAssetAiAction: vi.fn(), basculerTemplateAction: vi.fn(), tagAssetAction: vi.fn(), tagUntaggedImagesAction: vi.fn(), basculerAssetsIaAction: vi.fn(),
}));
vi.mock('../app/actions/bibliotheque-dossiers', () => ({
  creerDossierAction: vi.fn(), supprimerDossierAction: vi.fn(), restaurerDossierAction: vi.fn(), affecterAssetDossierAction: vi.fn(), definirDroitsAssetAction: vi.fn(),
  definirTagDossierAction: vi.fn(), definirTagDossiersAction: vi.fn(), affecterAssetsDossierAction: vi.fn(), definirDroitsAssetsAction: vi.fn(),
}));
vi.mock('../app/actions/drive', () => ({ syncDriveNowAction: vi.fn(), getDrivePickerConfigAction: vi.fn(), setDriveFolderAction: vi.fn(), syncDriveFilesAction: vi.fn() }));

const { Coquille } = await import('../spatial/coquille/Coquille');
const { Bibliotheque } = await import('../spatial/vues/bibliotheque/Bibliotheque');

const CSS = readFileSync(join(__dirname, '..', 'spatial', 'spatial.css'), 'utf8');
/** Les déclarations d'une règle de la feuille (sélecteur exact, première occurrence). */
const regle = (selecteur: string) => CSS.match(new RegExp(`(?:^|[}\\s])${selecteur.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
const px = (decl: string, prop: string) => Number(decl.match(new RegExp(`(?:^|;)${prop}:(\\d+(?:\\.\\d+)?)px`))?.[1] ?? NaN);

let telephone = true;
const ecouteurs = new Set<() => void>();
window.matchMedia = ((q: string) => ({
  get matches() { return q === '(max-width: 760px)' && telephone; }, media: q,
  addEventListener: (_: string, f: () => void) => ecouteurs.add(f), removeEventListener: (_: string, f: () => void) => ecouteurs.delete(f),
})) as unknown as typeof window.matchMedia;
const basculer = (t: boolean) => act(() => { telephone = t; ecouteurs.forEach((f) => f()); });

const T0 = '2026-10-20T10:00:00.000Z';
const dossier = (id: string, name: string): DossierSource => ({ id, parentId: null, name, locked: false, deletedAt: null, createdAt: T0 });
const media = (id: string): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] },
});
const ouverts = new Set(['/studio/projets', '/veille', '/adsmap', '/assets', '/jarvis', '/brands', '/settings']);
const marque = { id: 'b1', nom: 'Neva' };
type Donnees = Parameters<typeof Coquille>[0]['donnees'];
const DONNEES: Donnees = {
  entrees: entreesRail({ ouverts, marque }), espace: entreesRailEspace({ ouverts, marque }),
  marque: { ...marque, logoUrl: null, imageUrl: null }, marques: [{ id: 'b1', nom: 'Neva' }], peutGererMarques: true, admin: true,
  passer: null, railOuvert: false, espaceNom: 'GLX', nonLues: 0, deconnexion: async () => {},
  utilisateur: { nom: 'Kevin', initiales: 'K', email: 'k@x.fr', role: 'Fondateur' }, credits: { solde: 0, dotation: 0, illimite: true },
};
const PROPS: Parameters<typeof Bibliotheque>[0] = {
  donnees: donneesDrive({ dossiers: [dossier('d-photos', 'Photos produit')], medias: [media('m1'), media('m2')] }),
  lectureSeule: null, stockage: true, drive: connexionDrive({ available: true, needBrand: false, connected: false, folderId: null, folderName: null }), maintenant: T0,
  gestion: { analyse: { cout: 1, raison: null, sansTags: 0, maxLot: LOT_ANALYSE_IMAGES }, selecteurDrive: false, admin: false, messageDrive: null },
};
const ecran = () => <Coquille donnees={DONNEES}><Bibliotheque {...PROPS} /></Coquille>;

let racine: Root | null = null;
let hote: HTMLElement;
let feuille: HTMLStyleElement | null = null;
const monter = async () => {
  feuille = document.createElement('style'); feuille.textContent = CSS; document.head.appendChild(feuille);
  hote = document.createElement('div'); document.body.appendChild(hote);
  await act(async () => { racine = createRoot(hote); racine.render(ecran()); });
  await act(async () => { await Promise.resolve(); });
  return hote;
};
const enListe = async () => { await act(async () => { (hote.querySelector('button[aria-label="Liste"]') as HTMLButtonElement).click(); }); await act(async () => { await Promise.resolve(); }); };
const cases = () => [...hote.querySelectorAll<HTMLButtonElement>('button.dchk')];
const zoneDe = (b: Element) => b.querySelector<HTMLElement>(':scope > [data-zone-tactile]');
afterEach(() => { act(() => racine?.unmount()); racine = null; hote?.remove(); feuille?.remove(); telephone = true; delete document.body.dataset.sec; });

const ZOOM = ZOOM_VUE_SECTION.bibliotheque!;
/** La cible posée sous le zoom de la Bibliothèque (47 px · 44,65 à l'écran). */
const CIBLE = Math.ceil(CIBLE_TACTILE_PX / ZOOM);

describe('Spatial · cases de sélection · ce que la maquette dessine (la cause)', () => {
  it('la feuille · case de 26 px (grille), 22 px (liste), lignes rembourrées de 6 et espacées de 4 · la table le recopie', () => {
    const grille = PRIMITIVES_TACTILES.find((p) => p.selecteur === '.dchk')!;
    const liste = PRIMITIVES_TACTILES.find((p) => p.selecteur === '.dtr .dchk')!;
    expect(grille.hauteur, '`.dchk{height}` a changé · relire la table des primitives').toBe(px(regle('.dchk'), 'height'));
    expect(liste.hauteur, '`.dtr .dchk{height}` a changé').toBe(px(regle('.dtr .dchk'), 'height'));
    expect(liste.ligne, 'la case de la liste ne déclare plus sa ligne · le pas resterait à 43,7 px à l’écran').toBeDefined();
    expect(regle('.dtr'), '`.dtr{padding}` a changé · relire `ligne.rembourrage`').toContain(`padding:${liste.ligne!.rembourrage}px `);
    expect(px(regle('.dtbl'), 'gap'), '`.dtbl{gap}` a changé · relire `ligne.ecart`').toBe(liste.ligne!.ecart);
    // La case dessine une bordure · `deborder` la remplacerait par la sienne, transparente.
    expect(regle('.dchk')).toMatch(/border:1\.5px solid/);
    // Et la feuille la décale (top/left) · une case de liste rendue relative glisserait sans `auto`.
    expect(regle('.dchk')).toMatch(/top:12px;left:12px/);
    expect(ZOOM).toBe(0.95);
  });
});

describe('Spatial · cases de sélection · la coquille montée au téléphone', () => {
  it('grille · chaque case garde son dessin (aucun style posé) et son enfant vide devient une zone de 47 px centrée · 44,65 à l’écran', async () => {
    await monter();
    expect(document.body.dataset.sec).toBe('bibliotheque');
    const cs = cases();
    expect(cs.map((b) => b.getAttribute('aria-label'))).toEqual(['Sélectionner m1.jpg', 'Sélectionner m2.jpg']);
    for (const b of cs) {
      expect(b.getAttribute('style'), `${b.getAttribute('aria-label')} · la case de la grille a été restylée (dessin ou place)`).toBeNull();
      const z = zoneDe(b);
      expect(z, 'la case n’a pas d’enfant `[data-zone-tactile]`').not.toBeNull();
      expect(z!.getAttribute('aria-hidden')).toBe('true');
      const s = z!.style;
      expect([s.position, s.left, s.top, s.width, s.height, s.marginLeft, s.marginTop], 'zone de la case').toEqual(['absolute', '50%', '50%', `${CIBLE}px`, `${CIBLE}px`, `-${CIBLE / 2}px`, `-${CIBLE / 2}px`]);
      expect(parseFloat(s.width) * ZOOM, 'zone sous 44 px à l’écran').toBeGreaterThanOrEqual(CIBLE_TACTILE_PX);
    }
  });

  it('liste · fichiers ET dossiers · la case devient relative sans glisser, reçoit la marge qui porte le pas à 47 px, sa zone la cible', async () => {
    await monter();
    await enListe();
    const cs = cases();
    expect(cs.map((b) => b.getAttribute('aria-label'))).toEqual(['Sélectionner Photos produit', 'Sélectionner m1.jpg', 'Sélectionner m2.jpg']);
    const liste = PRIMITIVES_TACTILES.find((p) => p.selecteur === '.dtr .dchk')!;
    for (const b of cs) {
      const s = b.style;
      expect(s.position, 'case statique · sa zone se poserait sur la ligne entière').toBe('relative');
      expect([s.top, s.right, s.bottom, s.left], 'case relative · la feuille la ferait glisser de 12 px').toEqual(['auto', 'auto', 'auto', 'auto']);
      expect([s.width, s.height, s.minWidth, s.minHeight, s.borderWidth, s.borderColor, s.background, s.marginLeft, s.marginRight], 'le dessin de la case a changé').toEqual(['', '', '', '', '', '', '', '', '']);
      const m = parseFloat(s.marginTop);
      expect(s.marginBottom).toBe(s.marginTop);
      const pas = 2 * liste.ligne!.rembourrage + liste.hauteur! + 2 * m + liste.ligne!.ecart;
      expect(pas * ZOOM, `pas des lignes sous 44 px à l’écran (marge ${s.marginTop}) · deux zones voisines se recouvriraient`).toBeGreaterThanOrEqual(CIBLE_TACTILE_PX);
      expect(zoneDe(b)!.style.width).toBe(`${CIBLE}px`);
      expect(zoneDe(b)!.style.height).toBe(`${CIBLE}px`);
    }
  });

  it('quitter le format téléphone retire exactement ce qui a été posé · case et zone', async () => {
    await monter();
    await enListe();
    expect(cases()[0]!.style.position).toBe('relative');
    basculer(false);
    for (const b of cases()) {
      expect(b.getAttribute('style') ?? '', 'un style posé au téléphone reste au bureau').toBe('');
      expect(zoneDe(b)!.getAttribute('style') ?? '', 'la zone garde sa taille au bureau').toBe('');
    }
  });
});

describe('Spatial · cases de sélection · le bureau ne change pas', () => {
  it('au bureau, ni la case ni sa zone ne reçoivent de style (grille et liste)', async () => {
    telephone = false;
    await monter();
    for (const b of cases()) { expect(b.getAttribute('style')).toBeNull(); expect(zoneDe(b)!.getAttribute('style')).toBeNull(); }
    await enListe();
    for (const b of cases()) { expect(b.getAttribute('style')).toBeNull(); expect(zoneDe(b)!.getAttribute('style')).toBeNull(); }
  });

  it('le rendu serveur porte l’enfant vide, sans style', () => {
    const html = renderToStaticMarkup(ecran());
    expect(html).toContain('<button type="button" class="dchk " aria-pressed="false" aria-label="Sélectionner m1.jpg"><span data-zone-tactile="" aria-hidden="true"></span></button>');
  });
});
