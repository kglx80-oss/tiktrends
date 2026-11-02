import { describe, expect, it } from 'vitest';
import {
  ajouterMedias, appliquerPage, clePage, compteCorbeille, comptesDrive, dossiersEteints, donneesDrive, elementsGlissables, ETAT_DRIVE_INITIAL, FENETRE_BIBLIOTHEQUE,
  gesteTelechargement, gestesSelection, glissable, lireCurseur, lireDemandePage, motifRecherche, noteSelectionPartielle, normaliserRechercheDrive, pagesInitiales,
  PAGE_BIBLIOTHEQUE, RECHERCHE_MAX_CARACTERES, REFUS_PAGE, reprise, suiteListe, TRANSLITTERATION_SQL, videListe, vueDrive, MESSAGE_PAGE,
  type DossierSource, type EtatDrive, type LigneCompteBibliotheque, type MediaSource,
} from '../src';

/**
 * Bibliothèque · au-delà de la fenêtre chargée · règles pures. La page ne
 * charge que les plus récents ; les COMPTES EXACTS font foi pour chaque nombre,
 * une liste partielle le dit et dit quoi demander, le curseur et la demande
 * venus du navigateur sont relus, la recherche serveur suit la même
 * normalisation que l'écran.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const D1 = U(9001), D2 = U(9002), DJ = U(9003), DS = U(9004);
const dossier = (id: string, extra: Partial<DossierSource> = {}): DossierSource => ({ id, parentId: null, name: id === D1 ? 'Gros dossier' : id, locked: false, deletedAt: null, createdAt: T0, ...extra });
const media = (id: string, extra: Partial<MediaSource> = {}): MediaSource => ({
  id, name: `${id}.jpg`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=${id}`, thumbUrl: null, sizeBytes: 1000, createdAt: T0, folderId: null, rights: null,
  ia: { utilisable: true, template: false, tags: [] }, ...extra,
});
const ligne = (dossierId: string | null, n: number, extra: Partial<LigneCompteBibliotheque> = {}): LigneCompteBibliotheque => ({ dossierId, kind: 'image', mimeType: 'image/jpeg', supprime: false, n, octets: n * 1000, sansTaille: 0, ...extra });
const C = { t: '2026-10-20T09:00:00.123456Z', id: U(1) };
const etat = (o: Partial<EtatDrive> = {}): EtatDrive => ({ ...ETAT_DRIVE_INITIAL, ...o });

/** Un espace de 1 250 fichiers vivants, dont la page n'a chargé que 3 · D1 en compte 700, la racine 540 (dont 40 rangés dans un dossier hors portée), D2 10. */
const SOURCES = {
  dossiers: [dossier(D1), dossier(D2, { parentId: D1 }), dossier(DJ, { deletedAt: T0 }), dossier(DS, { parentId: DJ })],
  medias: [media(U(1), { folderId: D1 }), media(U(2), { folderId: D1 }), media(U(3)), media(U(4), { deletedAt: T0 })],
  comptes: [
    ligne(D1, 690), ligne(D1, 10, { kind: 'video', mimeType: 'video/mp4' }), ligne(D2, 10), ligne(null, 500, { sansTaille: 7 }), ligne(U(7777), 40),
    ligne(null, 3, { kind: 'other', mimeType: 'application/pdf' }), ligne(DJ, 5), ligne(DS, 2),
    ligne(null, 30, { supprime: true }), ligne(D1, 4, { supprime: true, kind: 'video', mimeType: 'video/mp4' }),
  ],
};
const D = donneesDrive(SOURCES);
const PAGES = pagesInitiales({ vivants: C, corbeille: null });

describe('comptesDrive · la requête agrégée rangée comme l’écran', () => {
  it('un dossier inconnu (hors portée) compte à la racine, comme le fichier y est rangé', () => {
    const c = comptesDrive(SOURCES.comptes, new Set(SOURCES.dossiers.map((d) => d.id)));
    expect(c.vivants['r:assets']).toEqual({ tous: 543, image: 540, video: 0, audio: 0, autre: 3 });
    expect(c.vivants[D1]).toEqual({ tous: 700, image: 690, video: 10, audio: 0, autre: 0 });
    expect(c.vivants[U(7777)]).toBeUndefined();
    expect(c.corbeille).toEqual({ tous: 34, image: 30, video: 4, audio: 0, autre: 0 });
    expect(c.volume).toEqual({ octets: (690 + 10 + 10 + 500 + 40 + 3 + 5 + 2 + 30 + 4) * 1000, inconnus: 7 });
    expect(c.sansTaille['r:assets']).toBe(7);
  });
  it('un SVG est une image, un PDF un « autre » · une ligne illisible ne compte pas', () => {
    const c = comptesDrive([ligne(null, 2, { mimeType: 'image/svg+xml' }), ligne(null, -3), ligne(null, Number.NaN), ligne(null, 1, { kind: 'audio', mimeType: 'audio/mpeg' })], new Set());
    expect(c.vivants['r:assets']).toEqual({ tous: 3, image: 2, video: 0, audio: 1, autre: 0 });
  });
});

describe('vueDrive · les nombres sont EXACTS quand la page a lu les comptes', () => {
  const v = vueDrive(D, etat());
  it('onglet, arbre, carte · les fichiers non chargés comptent, les dossiers éteints non', () => {
    expect(v.onglets.find((o) => o.id === 'r:assets')!.compte).toBe(543 + 700 + 10);
    expect(v.arbre.find((n) => n.nom === 'Gros dossier')!.compte).toBe(710);
    expect(v.dossiers.find((x) => x.id === D1)!.compte).toBe(710);
    // Sans comptes · les seuls fichiers chargés (le comportement d'avant, données de démonstration).
    expect(vueDrive(donneesDrive({ dossiers: SOURCES.dossiers, medias: SOURCES.medias }), etat()).dossiers.find((x) => x.id === D1)!.compte).toBe(2);
  });
  it('la corbeille et le volume · exacts', () => {
    expect(compteCorbeille(D)).toBe(1 + 34);
    expect(v.volume).toBe('1,2 Mo de médias importés · taille inconnue pour 7');
  });
  it('un dossier dont aucun fichier n’est chargé n’est jamais dit « vide »', () => {
    const d = donneesDrive({ ...SOURCES, medias: [] });
    expect(vueDrive(d, etat({ chemin: ['r:assets', D1, D2] })).vide).toBeNull();
    expect(vueDrive(d, etat({ chemin: ['r:assets', D1, D2], type: 'video' })).vide?.titre).toBe('Ce dossier est vide');
  });
  it('une source bornée atteinte · l’onglet le dit (« 400+ »)', () => {
    const b = vueDrive(donneesDrive({ ...SOURCES, bornes: { creations: true } }), etat());
    expect(b.onglets.map((o) => o.plus)).toEqual([false, true, false]);
    expect(vueDrive(D, etat()).onglets.map((o) => o.plus)).toEqual([false, false, false]);
  });
});

describe('suiteListe · une liste partielle le dit, et dit quoi demander', () => {
  it('un dossier partiel · affichés sur total, la page suivante depuis la fenêtre', () => {
    const e = etat({ chemin: ['r:assets', D1] });
    const s = suiteListe(D, e, vueDrive(D, e), PAGES)!;
    expect([s.affiches, s.total, s.restants]).toEqual([2, 700, 698]);
    expect(s.texte).toBe('2 fichiers affichés sur 700 · les plus récents sont chargés d’abord, la sélection porte sur les fichiers affichés.');
    expect(s.demande).toEqual({ portee: { type: 'dossier', dossier: D1 }, filtre: 'tous', curseur: C });
  });
  it('le filtre de type compte ses seuls fichiers · reprend la frontière de la liste sans filtre', () => {
    const e = etat({ chemin: ['r:assets', D1], type: 'video' });
    const avant = suiteListe(D, e, vueDrive(D, e), PAGES)!;
    expect([avant.affiches, avant.total, avant.demande?.filtre]).toEqual([0, 10, 'video']);
    const C2 = { t: '2026-10-19T00:00:00.000001Z', id: U(50) };
    const apres = appliquerPage(PAGES, clePage({ type: 'dossier', dossier: D1 }), { suivant: C2 });
    expect(suiteListe(D, e, vueDrive(D, e), apres)!.demande?.curseur).toEqual(C2);
  });
  it('une liste lue jusqu’au bout · plus de demande ; complète · rien à dire', () => {
    const e = etat({ chemin: ['r:assets', D1] });
    const fin = appliquerPage(PAGES, clePage({ type: 'dossier', dossier: D1 }), { suivant: null });
    expect(suiteListe(D, e, vueDrive(D, e), fin)!.demande).toBeNull();
    const petit = donneesDrive({ ...SOURCES, comptes: [ligne(D1, 2)] });
    expect(suiteListe(petit, e, vueDrive(petit, e), PAGES)).toBeNull();
  });
  it('la fenêtre complète (curseur null) · aucune demande, même si un compte a bougé', () => {
    const e = etat({ chemin: ['r:assets', D1] });
    expect(suiteListe(D, e, vueDrive(D, e), pagesInitiales({ vivants: null, corbeille: null }))!.demande).toBeNull();
  });
  it('la corbeille · ses propres comptes et sa propre fenêtre', () => {
    const e = etat({ section: 'corbeille' });
    const s = suiteListe(D, e, vueDrive(D, e), pagesInitiales({ vivants: null, corbeille: C }))!;
    expect([s.affiches, s.total, s.demande?.portee]).toEqual([1, 34, { type: 'corbeille' }]);
  });
  it('une recherche · lue sur le serveur depuis son début, en cours tant que le total manque', () => {
    const e = etat({ recherche: '  Été ' });
    const s = suiteListe(D, e, vueDrive(D, e), PAGES)!;
    expect([s.total, s.texte, s.demande]).toEqual([null, MESSAGE_PAGE.enCours, { portee: { type: 'recherche', q: 'ete' }, filtre: 'tous', curseur: null }]);
    const lue = appliquerPage(PAGES, s.cle, { suivant: C, total: 450 });
    const s2 = suiteListe(D, e, vueDrive(D, e), lue)!;
    expect([s2.total, s2.restants, s2.demande?.curseur]).toEqual([450, 450, C]);
    expect(suiteListe(D, e, vueDrive(D, e), appliquerPage(PAGES, s.cle, { suivant: null, total: 0 }))).toBeNull();
  });
  it('hors d’une liste de fichiers · récents, filtre par tag, racine du drive · rien', () => {
    for (const e of [etat({ section: 'recents' }), etat({ tag: 'rouge' }), etat({ chemin: [] })]) expect(suiteListe(D, e, vueDrive(D, e), PAGES)).toBeNull();
  });
  it('une source bornée (Créations) · dit sous la liste, sans bouton', () => {
    const d = donneesDrive({ ...SOURCES, bornes: { creations: true } });
    const e = etat({ chemin: ['r:creations'] });
    const s = suiteListe(d, e, vueDrive(d, e), null)!;
    expect([s.texte, s.demande]).toEqual(['Les 400 créations Studios les plus récentes sont affichées · les plus anciennes restent dans leur projet.', null]);
  });
  it('l’état vide se tait tant que la liste a une suite · la phrase de sélection le dit', () => {
    const e = etat({ chemin: ['r:assets', D1] });
    const s = suiteListe(D, e, vueDrive(D, e), PAGES);
    expect(videListe({ titre: 'x' }, s)).toBeNull();
    expect(videListe({ titre: 'x' }, null)).toEqual({ titre: 'x' });
    expect(noteSelectionPartielle(s, 1)).toBe('La sélection porte sur les fichiers affichés · 698 autres fichiers ne sont pas chargés.');
    expect([noteSelectionPartielle(s, 0), noteSelectionPartielle(null, 3)]).toEqual([null, null]);
  });
});

describe('reprise · où reprendre une liste', () => {
  const d1 = { type: 'dossier' as const, dossier: D1 };
  it('sa frontière, sinon celle sans filtre, sinon la fenêtre, sinon la fin', () => {
    const C2 = { t: C.t, id: U(2) }, C3 = { t: C.t, id: U(3) };
    expect(reprise(PAGES, d1, 'image')).toEqual(C);
    const p = appliquerPage(PAGES, clePage(d1, 'tous'), { suivant: C2 });
    expect(reprise(p, d1, 'image')).toEqual(C2);
    expect(reprise(appliquerPage(p, clePage(d1, 'image'), { suivant: C3 }), d1, 'image')).toEqual(C3);
    expect(reprise(appliquerPage(PAGES, clePage(d1, 'tous'), { suivant: null }), d1, 'video')).toBe('fin');
    expect(reprise(pagesInitiales({ vivants: null, corbeille: null }), d1, 'tous')).toBe('fin');
    expect(reprise(PAGES, { type: 'recherche', q: 'x' }, 'tous')).toBeNull();
  });
});

describe('ajouterMedias · une page rejoint les données, sans doublon', () => {
  it('rangée comme la page, un fichier déjà là reste tel quel, une sortie Studios n’entre pas', () => {
    const n = ajouterMedias(D, [media(U(1), { name: 'doublon.jpg' }), media(U(10), { folderId: D2 }), media(U(11), { folderId: U(7777) }), media(U(12), { studio: { projetId: 'p', projetTitre: 'P', href: '/p' } })]);
    expect(n.fichiers.length).toBe(D.fichiers.length + 2);
    expect(n.fichiers.find((f) => f.id === U(1))!.nom).toBe(`${U(1)}.jpg`);
    expect(n.fichiers.find((f) => f.id === U(10))!.parent).toBe(D2);
    expect(n.fichiers.find((f) => f.id === U(11))!.parent).toBe('r:assets');
    expect(n.comptes).toBe(D.comptes);
    expect(ajouterMedias(D, [])).toBe(D);
  });
});

describe('lireCurseur · lireDemandePage · rien du navigateur n’atteint la requête sans être relu', () => {
  it('le curseur · la microseconde et un UUID, sinon rien', () => {
    expect(lireCurseur({ t: C.t, id: C.id.toUpperCase() })).toEqual(C);
    for (const raw of [null, 'x', { t: '2026-10-20T09:00:00.123Z', id: C.id }, { t: C.t, id: 'x' }, { t: `${C.t}' or 1=1`, id: C.id }, { t: '2026-13-45T09:00:00.123456Z', id: C.id }]) expect(lireCurseur(raw), JSON.stringify(raw)).toBeNull();
  });
  it('une demande valide · dossier, racine, corbeille, recherche normalisée', () => {
    expect(lireDemandePage({ portee: { type: 'dossier', dossier: D1.toUpperCase() } })).toEqual({ ok: true, demande: { portee: { type: 'dossier', dossier: D1 }, filtre: 'tous', curseur: null } });
    expect(lireDemandePage({ portee: { type: 'dossier', dossier: 'r:assets' }, filtre: 'video', curseur: C })).toEqual({ ok: true, demande: { portee: { type: 'dossier', dossier: 'r:assets' }, filtre: 'video', curseur: C } });
    expect(lireDemandePage({ portee: { type: 'corbeille' } })).toMatchObject({ ok: true });
    expect(lireDemandePage({ portee: { type: 'recherche', q: ' ÉTÉ ' } })).toMatchObject({ ok: true, demande: { portee: { type: 'recherche', q: 'ete' } } });
  });
  it('tout écart refuse la demande ENTIÈRE', () => {
    for (const raw of [null, {}, { portee: { type: 'dossier', dossier: 'r:creations' } }, { portee: { type: 'dossier', dossier: "x' or 1=1" } }, { portee: { type: 'corbeille' }, filtre: 'pdf' },
      { portee: { type: 'corbeille' }, curseur: { t: 'hier', id: C.id } }, { portee: { type: 'recherche', q: '   ' } }, { portee: { type: 'autre' } }]) {
      expect(lireDemandePage(raw), JSON.stringify(raw)).toEqual({ ok: false, raison: REFUS_PAGE.illisible });
    }
    expect(lireDemandePage({ portee: { type: 'recherche', q: 'a'.repeat(RECHERCHE_MAX_CARACTERES + 1) } })).toEqual({ ok: false, raison: REFUS_PAGE.recherche });
    expect(lireDemandePage({ portee: { type: 'recherche', q: 'a'.repeat(RECHERCHE_MAX_CARACTERES) } })).toMatchObject({ ok: true });
  });
  it('les bornes mesurées', () => {
    expect([FENETRE_BIBLIOTHEQUE, PAGE_BIBLIOTHEQUE]).toEqual([400, 200]);
  });
});

describe('la recherche serveur suit la normalisation de l’écran', () => {
  /** `translate(lower(x), de, vers)` · `lower()` d'une base en langue C (ASCII seul), le cas le plus strict. */
  const commeLaBase = (x: string) => {
    const bas = x.replace(/[A-Z]/g, (c) => c.toLowerCase());
    const { de, vers } = TRANSLITTERATION_SQL;
    const de2 = [...de], vers2 = [...vers];
    return [...bas].map((c) => { const i = de2.indexOf(c); return i < 0 ? c : (vers2[i] ?? ''); }).join('');
  };
  it('chaque lettre latine accentuée, majuscule ou décomposée, donne le texte de l’écran', () => {
    const noms = ['Été', 'ÉTÉ', 'été', 'Crème brûlée', 'Œuvre', 'ÇA', 'Ångström', 'Øre', 'Łódź', 'Ñandú', 'ß', 'Façade ŸÆ'];
    for (let cp = 0xc0; cp <= 0x24f; cp++) noms.push(String.fromCodePoint(cp));
    for (const n of noms) expect(commeLaBase(n), `${n} (${[...n].map((c) => c.codePointAt(0)!.toString(16)).join(' ')})`).toBe(normaliserRechercheDrive(n).normalize('NFC'));
  });
  it('le motif · `%`, `_` et `\\` restent littéraux', () => {
    expect(motifRecherche('100%_a\\b')).toBe('%100\\%\\_a\\\\b%');
  });
  it('les dossiers éteints · en corbeille ou sous un ancêtre en corbeille', () => {
    expect(dossiersEteints(SOURCES.dossiers).sort()).toEqual([DJ, DS].sort());
  });
});

describe('elementsGlissables · la règle de `glissable`, calculée une fois', () => {
  it('égale à `glissable` élément par élément, dans chaque section et en lecture seule', () => {
    const d = donneesDrive({
      dossiers: [...SOURCES.dossiers, dossier('sys', { locked: true })],
      medias: [...SOURCES.medias, media(U(20), { folderId: DJ }), media(U(21), { folderId: DS }), media(U(22), { studio: { projetId: 'p', projetTitre: 'P', href: '/p' } }), media(U(23), { historique: { libelle: 'x', telecharger: '/x' } })],
    });
    for (const ctx of [{ section: 'drive' as const, lectureSeule: null }, { section: 'recents' as const, lectureSeule: null }, { section: 'corbeille' as const, lectureSeule: null }, { section: 'drive' as const, lectureSeule: 'Lecture seule.' }]) {
      const attendu = [...d.fichiers.map((f) => f.id), ...d.dossiers.map((x) => x.id)].filter((id) => glissable(d, id, ctx));
      expect([...elementsGlissables(d, ctx)].sort(), JSON.stringify(ctx)).toEqual(attendu.sort());
    }
    expect(elementsGlissables(d, { section: 'drive', lectureSeule: null }).has(U(1))).toBe(true);
  });
  it('linéaire · 5 000 fichiers en moins d’une seconde (`glissable` par carte en prenait des dizaines)', () => {
    const d = donneesDrive({ dossiers: SOURCES.dossiers, medias: Array.from({ length: 5000 }, (_, i) => media(U(100 + i), { folderId: i % 2 ? D1 : null })) });
    const t = performance.now();
    expect(elementsGlissables(d, { section: 'drive', lectureSeule: null }).size).toBe(5000 + 2);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});

describe('gesteTelechargement · l’archive d’un dossier compte TOUS ses fichiers, pas les seuls chargés', () => {
  it('le titre dit le nombre et le volume exacts · le plafond de nombre s’applique aux comptes', () => {
    const d = donneesDrive({ ...SOURCES, comptes: [ligne(D1, 300), ligne(D2, 10, { sansTaille: 2 })] });
    const g = gesteTelechargement(d, gestesSelection(d, [D1], { section: 'drive', lectureSeule: null, ia: false }));
    expect(g.ouvert).toBe(true);
    expect(g.titre).toBe('Archive ZIP de 2 dossiers et 310 fichiers · 303 Ko · taille de 2 fichiers relue au lancement');
    const gros = donneesDrive({ ...SOURCES, comptes: [ligne(D1, 690)] });
    const r = gesteTelechargement(gros, gestesSelection(gros, [D1], { section: 'drive', lectureSeule: null, ia: false }));
    expect([r.ouvert, r.titre]).toEqual([false, expect.stringMatching(/690 fichiers/)]);
  });
});
