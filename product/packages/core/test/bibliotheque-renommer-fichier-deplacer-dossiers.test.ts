import { describe, expect, it } from 'vitest';
import {
  validerNomFichier, validerRenommageFichier, extensionNomFichier, baseNomFichier, refusNomFichierTropLong, messageFichierRenomme,
  LONGUEUR_MAX_NOM_FICHIER, EXTENSIONS_CONSERVEES, REFUS_FICHIER, nomFichierArchive,
  validerDeplacementDossiers, refusDeplacementTropLarge, REFUS_DOSSIER, TAG_SELECTION_MAX, validerNomDossier, LONGUEUR_MAX_NOM_DOSSIER,
  destinationsDeplacementSelection, messageDossiersDeplaces, donneesDrive, menuFichier,
  type DossierPlat, type DossierSource, type MediaSource,
} from '../src';

/**
 * Bibliothèque · RENOMMER UN FICHIER et DÉPLACER PLUSIEURS DOSSIERS · règles
 * pures. On lit ce qui SORT de la règle (le nom enregistré, la phrase du
 * refus, la liste acceptée) · et, pour l'anti-cycle groupé, l'arbre FINAL
 * simulé sur des arbres et des sélections tirés au hasard.
 */

describe('nom de fichier · rogné, non vide, borné, extension connue conservée', () => {
  it('l’extension connue est conservée · ajoutée si la saisie ne la porte pas, gardée telle quelle sinon', () => {
    expect(validerNomFichier('IMG_0042.jpg', '  Flacon face  ')).toEqual({ ok: true, nom: 'Flacon face.jpg' });
    expect(validerNomFichier('IMG_0042.jpg', 'Flacon.JPG')).toEqual({ ok: true, nom: 'Flacon.JPG' });
    expect(validerNomFichier('clip.MOV', 'Rush 1')).toEqual({ ok: true, nom: 'Rush 1.MOV' });
    // Une autre extension saisie ne change pas le type · celle du fichier s'ajoute (le nom dit le vrai type).
    expect(validerNomFichier('IMG_0042.jpg', 'Flacon.png')).toEqual({ ok: true, nom: 'Flacon.png.jpg' });
    // Une fin qui n'est pas une extension connue n'en est pas une · rien n'est ajouté.
    expect(validerNomFichier('Shooting v1.2', 'Shooting final')).toEqual({ ok: true, nom: 'Shooting final' });
    expect(validerNomFichier('Rapport.final', 'Rapport')).toEqual({ ok: true, nom: 'Rapport' });
    expect(validerNomFichier('sans extension', 'Nouveau')).toEqual({ ok: true, nom: 'Nouveau' });
  });

  it('extension et base · ce que la fenêtre présélectionne', () => {
    expect([extensionNomFichier('photo.JPEG'), baseNomFichier('photo.JPEG')]).toEqual(['.JPEG', 'photo']);
    expect([extensionNomFichier('v1.2'), baseNomFichier('v1.2')]).toEqual(['', 'v1.2']);
    expect([extensionNomFichier('.jpg'), extensionNomFichier('archive.tar.pdf')]).toEqual(['', '.pdf']);
  });

  it('chaque extension conservée est vue comme une extension par l’archive (elle n’en ajoute pas une seconde)', () => {
    for (const e of EXTENSIONS_CONSERVEES) expect([e, nomFichierArchive(`photo.${e}`, 'zzz')]).toEqual([e, `photo.${e}`]);
  });

  it('vide, extension seule, illisible · refusés avec la phrase de la fenêtre', () => {
    expect(validerNomFichier('a.jpg', '   ')).toEqual({ ok: false, raison: REFUS_FICHIER.vide });
    expect(validerNomFichier('a.jpg', ' .JPG ')).toEqual({ ok: false, raison: REFUS_FICHIER.vide });
    expect(validerNomFichier('a.jpg', 42)).toEqual({ ok: false, raison: REFUS_FICHIER.invalide });
    expect(validerRenommageFichier(null, 'x')).toEqual({ ok: false, raison: REFUS_FICHIER.introuvable });
    expect(validerRenommageFichier({ name: 'a.jpg' }, 'b')).toEqual({ ok: true, nom: 'b.jpg' });
  });

  it(`au plus ${LONGUEUR_MAX_NOM_FICHIER} caractères, extension conservée comprise`, () => {
    expect(LONGUEUR_MAX_NOM_FICHIER).toBe(160);
    expect(validerNomFichier('x', 'n'.repeat(160))).toEqual({ ok: true, nom: 'n'.repeat(160) });
    expect(validerNomFichier('x', 'n'.repeat(161))).toEqual({ ok: false, raison: refusNomFichierTropLong('') });
    expect(validerNomFichier('a.jpg', 'n'.repeat(156))).toEqual({ ok: true, nom: `${'n'.repeat(156)}.jpg` });
    expect(validerNomFichier('a.jpg', 'n'.repeat(157))).toEqual({ ok: false, raison: 'Nom trop long (max 160 caractères, extension .jpg comprise).' });
  });

  it('caractères de contrôle, C1, contrôles bidi et séparateurs de ligne refusés · les liants d’émoji permis', () => {
    for (const c of ['\n', '\t', '\u007f', '\u0085', '\u061c', '\u200e', '\u200f', '\u2028', '\u2029', '\u202a', '\u202e', '\u2066', '\u2069']) {
      expect([c.codePointAt(0)!.toString(16), validerNomFichier('a', `photo${c}gpj.exe`)]).toEqual([c.codePointAt(0)!.toString(16), { ok: false, raison: REFUS_FICHIER.interdit }]);
    }
    const famille = 'Équipe \u{1F468}\u200d\u{1F469}\u200d\u{1F467}';
    expect(validerNomFichier('a', famille)).toEqual({ ok: true, nom: famille });
  });

  it('le nom de DOSSIER garde exactement la règle de la création (helper partagé)', () => {
    expect(validerNomDossier('  Hiver  ')).toEqual({ ok: true, nom: 'Hiver' });
    expect(validerNomDossier('')).toEqual({ ok: false, raison: 'Donne un nom au dossier.' });
    expect(validerNomDossier('x'.repeat(LONGUEUR_MAX_NOM_DOSSIER + 1))).toEqual({ ok: false, raison: `Nom trop long (max ${LONGUEUR_MAX_NOM_DOSSIER} caractères).` });
    expect(validerNomDossier('a\u0085b')).toEqual({ ok: true, nom: 'a\u0085b' });
    expect(validerNomDossier('a\nb')).toEqual({ ok: false, raison: 'Le nom ne peut pas contenir de caractère de contrôle.' });
    expect(validerNomDossier(1)).toEqual({ ok: false, raison: 'Nom de dossier invalide.' });
  });

  it('le message de l’écran', () => {
    expect(messageFichierRenomme('Flacon.jpg')).toBe('Fichier renommé en « Flacon.jpg »');
  });
});

/* ───────────────────────────── Déplacement groupé ───────────────────────────── */

/** Des UUID à lettres (a-f) · la casse change la chaîne, le dédoublonnage insensible à la casse se voit. */
const uid = (n: number) => `abcdefab-0000-4000-8000-${String(n).padStart(12, '0')}`;
const S = uid(1), H = uid(2), R = uid(3), A = uid(4), Y = uid(5), M = uid(6), INCONNU = uid(99);
const plat = (id: string, name: string, parentId: string | null, o: Partial<DossierPlat> = {}): DossierPlat => ({ id, parentId, name, brandId: null, locked: false, ...o });
/** Shooting › Hiver › Rushs ; Archives ; Photos système (verrouillé) ; Marque (autre marque). */
const ARBRE: DossierPlat[] = [
  plat(S, 'Shooting', null), plat(H, 'Hiver', S), plat(R, 'Rushs', H), plat(A, 'Archives', null),
  plat(Y, 'Photos système', null, { locked: true }), plat(M, 'Marque', null, { brandId: uid(50) }),
];

describe('déplacer plusieurs dossiers · tout ou rien, anti-cycle pour chacun et entre eux', () => {
  it('acceptés · la liste dédoublonnée (casse ignorée), dans l’ordre', () => {
    expect(validerDeplacementDossiers(ARBRE, [R, A], S)).toEqual({ ok: true, ids: [R, A] });
    expect(validerDeplacementDossiers(ARBRE, [H, H.toUpperCase(), A], null)).toEqual({ ok: true, ids: [H, A] });
    expect(validerDeplacementDossiers(ARBRE, [R], A.toUpperCase())).toEqual({ ok: true, ids: [R] });
  });

  const REFUS: Array<[string, unknown, string | null, string]> = [
    ['la destination fait partie de la sélection', [S, A], A, REFUS_DOSSIER.destinationSelectionnee],
    ['vers un descendant d’un des dossiers', [A, S], R, `« Shooting » · ${REFUS_DOSSIER.descendant}`],
    ['un dossier et son sous-dossier (entre eux)', [S, H], A, REFUS_DOSSIER.imbriques],
    ['un dossier et son petit-enfant (entre eux)', [R, S], A, REFUS_DOSSIER.imbriques],
    ['un dossier système', [A, Y], S, `« Photos système » · ${REFUS_DOSSIER.systemeDeplacer}`],
    ['un dossier inconnu (autre espace, corbeille) · sans dire lequel', [A, INCONNU], S, REFUS_DOSSIER.selectionIntrouvable],
    ['vers un dossier introuvable', [A], INCONNU, REFUS_DOSSIER.destinationIntrouvable],
    ['vers un dossier système', [A], Y, REFUS_DOSSIER.destinationSysteme],
    ['vers une autre marque', [A], M, `« Archives » · ${REFUS_DOSSIER.autreMarque}`],
    ['une liste illisible', 'pas une liste', null, REFUS_DOSSIER.selectionIllisible],
    ['un identifiant virtuel', [A, 'r:assets'], null, REFUS_DOSSIER.selectionIllisible],
    ['une liste vide', [], null, REFUS_DOSSIER.selectionVide],
  ];
  for (const [quoi, ids, dest, raison] of REFUS) {
    it(`${quoi} · refusé`, () => {
      expect(validerDeplacementDossiers(ARBRE, ids, dest)).toEqual({ ok: false, raison });
    });
  }

  it(`au-delà de ${TAG_SELECTION_MAX} dossiers · refusé avec la phrase de la barre`, () => {
    const beaucoup = Array.from({ length: TAG_SELECTION_MAX + 1 }, (_, i) => plat(uid(1000 + i), `D${i}`, null));
    expect(validerDeplacementDossiers(beaucoup, beaucoup.map((x) => x.id), null)).toEqual({ ok: false, raison: refusDeplacementTropLarge(TAG_SELECTION_MAX + 1) });
    expect(validerDeplacementDossiers(beaucoup, beaucoup.slice(1).map((x) => x.id), null)).toMatchObject({ ok: true });
  });

  it('au hasard · une sélection acceptée ne crée JAMAIS de cycle dans l’arbre final, et toute sélection qui en créerait un est refusée', () => {
    // mulberry32 · un tirage reproductible (graine fixe).
    let graine = 7;
    const hasard = (n: number) => {
      graine = (graine + 0x6d2b79f5) | 0;
      let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return (((t ^ (t >>> 14)) >>> 0) % n);
    };
    let acceptes = 0, cycles = 0;
    for (let cas = 0; cas < 3000; cas++) {
      const n = 3 + hasard(7);
      const ids = Array.from({ length: n }, (_, i) => uid(200 + i));
      // Une forêt · chaque nœud a pour parent un nœud d'indice inférieur, ou aucun.
      const arbre = ids.map((id, i) => plat(id, `N${i}`, i && hasard(3) ? ids[hasard(i)]! : null));
      const sel = [...new Set(Array.from({ length: 1 + hasard(3) }, () => ids[hasard(n)]!))];
      const dest = hasard(4) ? ids[hasard(n)]! : null;
      const v = validerDeplacementDossiers(arbre, sel, dest);
      // L'arbre FINAL simulé · chaque dossier sélectionné sous `dest`.
      const parent = new Map(arbre.map((x) => [x.id, sel.includes(x.id) ? dest : x.parentId] as const));
      const boucle = ids.some((depart) => {
        const vus = new Set<string>();
        for (let c: string | null = parent.get(depart) ?? null; c != null; c = parent.get(c) ?? null) { if (c === depart || vus.has(c)) return true; vus.add(c); }
        return false;
      });
      if (v.ok) { acceptes++; expect(boucle, `cas ${cas} · accepté mais l’arbre final boucle`).toBe(false); }
      if (boucle) { cycles++; expect(v.ok, `cas ${cas} · l’arbre final bouclerait et la règle accepte`).toBe(false); }
    }
    // Le tirage couvre les deux issues (sinon le test ne prouverait rien).
    expect([acceptes > 300, cycles > 300], `acceptés ${acceptes} · cycles ${cycles}`).toEqual([true, true]);
  });

  it('le message de l’écran', () => {
    expect([messageDossiersDeplaces(1, 'Archives'), messageDossiersDeplaces(3, 'Archives')]).toEqual(['1 dossier déplacé dans « Archives »', '3 dossiers déplacés dans « Archives »']);
  });
});

/* ───────────────────────────── Ce que l'écran propose ───────────────────────────── */

const T0 = '2026-10-20T10:00:00.000Z';
const source = (id: string, name: string, parentId: string | null, o: Partial<DossierSource> = {}): DossierSource => ({ id, parentId, name, locked: false, deletedAt: null, createdAt: T0, ...o });
const media = (id: string, o: Partial<MediaSource> = {}): MediaSource => ({ id, name: 'face.jpg', kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 10, createdAt: T0, folderId: null, rights: null, ...o });
const DONNEES = donneesDrive({
  dossiers: [source(S, 'Shooting', null), source(H, 'Hiver', S), source(R, 'Rushs', H), source(A, 'Archives', null), source(Y, 'Photos système', null, { locked: true })],
  medias: [media(uid(300)), media(uid(301), { deletedAt: T0 })],
});

describe('« Déplacer vers… » de la barre · chaque destination jugée par la règle de l’action', () => {
  it('Shooting et Archives · la racine est « déjà ici », les destinations interdites restent proposées, fermées avec leur phrase', () => {
    const o = destinationsDeplacementSelection(DONNEES, [S, A]);
    expect(o.map((x) => [x.nom, x.actuel, x.raison])).toEqual([
      ['Assets de la marque · non classé', true, null],
      ['Archives', false, REFUS_DOSSIER.destinationSelectionnee],
      ['Photos système', false, REFUS_DOSSIER.destinationSysteme],
      ['Shooting', false, REFUS_DOSSIER.destinationSelectionnee],
      ['Shooting › Hiver', false, `« Shooting » · ${REFUS_DOSSIER.descendant}`],
      ['Shooting › Hiver › Rushs', false, `« Shooting » · ${REFUS_DOSSIER.descendant}`],
    ]);
  });

  it('des parents différents · aucune destination « déjà ici » ; une sélection imbriquée ferme tout', () => {
    expect(destinationsDeplacementSelection(DONNEES, [R, A]).filter((x) => x.actuel)).toEqual([]);
    expect(destinationsDeplacementSelection(DONNEES, [R, A]).find((x) => x.id === S)?.raison).toBeNull();
    expect(new Set(destinationsDeplacementSelection(DONNEES, [S, H]).filter((x) => !x.actuel).map((x) => x.raison))).toEqual(new Set([REFUS_DOSSIER.imbriques, REFUS_DOSSIER.destinationSelectionnee, REFUS_DOSSIER.destinationSysteme, `« Shooting » · ${REFUS_DOSSIER.descendant}`]));
    expect(destinationsDeplacementSelection(DONNEES, [])).toEqual([]);
  });
});

describe('menu « … » d’un fichier · « Renommer »', () => {
  it('un fichier vivant · ouvert, juste après l’aperçu ; fermé en lecture seule ; absent dans la corbeille', () => {
    expect(menuFichier(DONNEES, uid(300), { section: 'drive', lectureSeule: null }).slice(0, 3).map((x) => [x.cle, x.libelle, x.ouvert, x.raison])).toEqual([
      ['apercu', 'Aperçu', true, null], ['renommer', 'Renommer', true, null], ['ranger', 'Déplacer vers…', true, null],
    ]);
    expect(menuFichier(DONNEES, uid(300), { section: 'drive', lectureSeule: 'Lecture seule.' }).find((x) => x.cle === 'renommer')).toMatchObject({ ouvert: false, raison: 'Lecture seule.' });
    expect(menuFichier(DONNEES, uid(301), { section: 'corbeille', lectureSeule: null }).map((x) => x.cle)).not.toContain('renommer');
  });
});
