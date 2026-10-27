import { describe, expect, it } from 'vitest';
import {
  donneesDrive, vueDrive, cheminVers, cheminValide, dossiersRangement, formatTaille, libelleJour, pastilleDroit, connexionDrive, typeFichier,
  ETAT_DRIVE_INITIAL, RACINES_DRIVE,
  quandConversation, ilYA, lireQuestionJarvis, LONGUEUR_MAX_QUESTION_JARVIS, reponseLisible, extraitConversation, filtrerConversations, iterationsRecentes,
  type DossierSource, type MediaSource, type EtatDrive,
} from '../src';

const T = (j: number) => new Date(Date.UTC(2026, 9, 20 + j, 10)).toISOString();
const dossier = (id: string, name: string, parentId: string | null = null, o: Partial<DossierSource> = {}): DossierSource => ({ id, parentId, name, locked: false, deletedAt: null, createdAt: T(0), ...o });
let n = 0;
const media = (folderId: string | null, o: Partial<MediaSource> = {}): MediaSource => ({
  id: `m${++n}`, name: `fichier ${n}`, kind: 'image', mimeType: 'image/jpeg', source: 'upload', url: `/api/asset?id=m${n}`, thumbUrl: null, sizeBytes: 1024, createdAt: T(0), folderId, rights: null, ...o,
});
const etat = (o: Partial<EtatDrive> = {}): EtatDrive => ({ ...ETAT_DRIVE_INITIAL, ...o });

describe('Spatial · Bibliothèque · construction du drive', () => {
  it('trois racines RÉELLES · « Exports Meta » (sans source) n’existe pas', () => {
    expect(RACINES_DRIVE.map((r) => r.nom)).toEqual(['Assets de la marque', 'Créations', 'Anciens studios']);
  });

  it('un dossier au parent inconnu remonte aux assets · un média au dossier inconnu aussi', () => {
    const d = donneesDrive({ dossiers: [dossier('a', 'Orphelin', 'disparu')], medias: [media('fantome')] });
    expect(d.dossiers.find((x) => x.id === 'a')!.parent).toBe('r:assets');
    expect(d.fichiers[0]!.parent).toBe('r:assets');
  });

  it('les sorties Studios se rangent par projet sous « Créations », en lecture seule', () => {
    const s = (p: string) => media(null, { source: 'studios', studio: { projetId: p, projetTitre: `Projet ${p}`, href: `/studio/projets/${p}` } });
    const d = donneesDrive({ dossiers: [], medias: [s('1'), s('1'), s('2')] });
    const v = vueDrive(d, etat({ chemin: ['r:creations'] }));
    expect(v.dossiers.map((x) => [x.nom, x.compte])).toEqual([['Projet 1', 2], ['Projet 2', 1]]);
    expect(d.fichiers.every((f) => f.lectureSeule && f.droit === null)).toBe(true);
    expect(v.nouveau).toBeNull(); // on ne crée pas de dossier dans un espace en lecture seule
  });

  it('un SVG est un fichier (jamais une vignette), un PDF aussi', () => {
    expect(typeFichier('image', 'image/svg+xml')).toBe('svg');
    expect(typeFichier('other', 'application/pdf')).toBe('pdf');
    expect(donneesDrive({ dossiers: [], medias: [media(null, { mimeType: 'image/svg+xml' })] }).fichiers[0]!.vignette).toBeNull();
  });
});

describe('Spatial · Bibliothèque · ce que montre l’écran', () => {
  const base = () => {
    n = 0;
    return donneesDrive({
      dossiers: [dossier('a', 'Photos'), dossier('b', 'Packshots', 'a'), dossier('t', 'Jeté', null, { deletedAt: T(1) }), dossier('t2', 'Dedans', 't', { deletedAt: T(1) })],
      medias: [media('a', { createdAt: T(1) }), media('b', { createdAt: T(3), sizeBytes: null }), media('t', { name: 'perdu' }), media(null, { name: 'Racine', createdAt: T(2) })],
    });
  };

  it('à l’ouverture · « Assets de la marque », ses dossiers vivants, ses médias non classés, bannière', () => {
    const v = vueDrive(base(), ETAT_DRIVE_INITIAL);
    expect(v.fil.map((c) => c.libelle)).toEqual(['Mon drive', 'Assets de la marque']);
    expect(v.dossiers.map((x) => x.nom)).toEqual(['Photos']);
    expect(v.fichiers.map((x) => x.nom)).toEqual(['Racine']);
    expect(v.banniere).toBe(true);
    expect(v.nouveau).toEqual({ dans: 'Assets de la marque', parentId: null });
    expect(v.onglets.find((o) => o.actif)?.id).toBe('r:assets');
  });

  it('un dossier en corbeille et son contenu disparaissent du drive, des comptes et de la recherche', () => {
    const v = vueDrive(base(), ETAT_DRIVE_INITIAL);
    expect(v.onglets[0]!.compte).toBe(3);
    expect(vueDrive(base(), etat({ recherche: 'perdu' })).fichiers).toEqual([]);
    expect(vueDrive(base(), etat({ recherche: 'jete' })).dossiers).toEqual([]);
  });

  it('la corbeille montre les sommets supprimés (le sous-dossier revient avec son parent), avec leur contenu', () => {
    const v = vueDrive(base(), etat({ section: 'corbeille' }));
    expect(v.dossiers.map((x) => [x.nom, x.compte, x.sousDossiers])).toEqual([['Jeté', 1, 1]]);
    expect(v.fil.map((c) => c.libelle)).toEqual(['Corbeille']);
    expect(vueDrive(donneesDrive({ dossiers: [], medias: [] }), etat({ section: 'corbeille' })).vide?.titre).toBe('La corbeille est vide');
  });

  it('dans un dossier réel · « Nouveau sous-dossier » vise CE dossier', () => {
    const d = base();
    const v = vueDrive(d, etat({ chemin: cheminVers(d, 'a') }));
    expect(v.fil.map((c) => c.libelle)).toEqual(['Mon drive', 'Assets de la marque', 'Photos']);
    expect(v.nouveau).toEqual({ dans: 'Photos', parentId: 'a' });
    expect(v.banniere).toBe(false);
  });

  it('récents · les fichiers vivants du plus récent au plus ancien · recherche sans accents', () => {
    expect(vueDrive(base(), etat({ section: 'recents' })).fichiers.map((f) => f.creeLe)).toEqual([T(3), T(2), T(1)]);
    const v = vueDrive(base(), etat({ recherche: 'PÀCK' }));
    expect(v.dossiers.map((x) => x.nom)).toEqual(['Packshots']);
    expect(v.fil[0]!.libelle).toBe('Résultats pour « PÀCK »');
  });

  it('l’arbre suit les nœuds dépliés · un chemin vers un dossier jeté est coupé', () => {
    const d = base();
    const replie = vueDrive(d, etat({ ouverts: new Set() })).arbre.map((x) => x.nom);
    expect(replie).toEqual(['Assets de la marque', 'Créations', 'Anciens studios']);
    const ouvert = vueDrive(d, etat({ ouverts: new Set(['r:assets', 'a']) })).arbre.map((x) => [x.nom, x.niveau]);
    expect(ouvert).toEqual([['Assets de la marque', 0], ['Photos', 1], ['Packshots', 2], ['Créations', 0], ['Anciens studios', 0]]);
    expect(cheminValide(d, ['r:assets', 't', 't2'])).toEqual(['r:assets']);
  });

  it('le volume dit ce qui est MESURÉ · aucun quota inventé', () => {
    const v = vueDrive(base(), ETAT_DRIVE_INITIAL);
    expect(v.volume).toBe('3 Ko de médias importés · taille inconnue pour 1');
    expect(v.volume).not.toMatch(/sur \d/);
  });

  it('les destinations de rangement · non classé puis les dossiers réels vivants, par chemin', () => {
    expect(dossiersRangement(base()).map((x) => x.nom)).toEqual(['Assets de la marque · non classé', 'Photos', 'Photos › Packshots']);
  });
});

describe('Spatial · Bibliothèque · formats et états', () => {
  it('tailles et jours comme la maquette', () => {
    expect(formatTaille(2_516_582)).toBe('2,4 Mo');
    expect(formatTaille(900)).toBe('1 Ko');
    expect(formatTaille(null)).toBe('Taille inconnue');
    const maintenant = new Date(T(5));
    expect(libelleJour(T(5), maintenant)).toBe('Aujourd’hui');
    expect(libelleJour(T(4), maintenant)).toBe('Hier');
    expect(libelleJour(T(0), maintenant)).toBe('20 oct.');
  });

  it('droits · libellés exacts du catalogue, « À préciser » en alerte, non classé neutre', () => {
    expect(pastilleDroit('photo_marque')).toEqual({ classe: 'g', libelle: 'Photo de la marque' });
    expect(pastilleDroit('a_preciser')).toEqual({ classe: 'w', libelle: 'À préciser' });
    expect(pastilleDroit(null).classe).toBe('');
    expect(pastilleDroit('pirate').classe).toBe('w');
  });

  it('Google Drive · jamais « connecté » sans jeton, jamais de synchro sans dossier', () => {
    const s = { available: true, needBrand: false, connected: true, folderId: null, folderName: null };
    expect(connexionDrive(null).etat).toBe('indisponible');
    expect(connexionDrive({ ...s, available: false }).etat).toBe('indisponible');
    expect(connexionDrive({ ...s, connected: false }).etat).toBe('a-connecter');
    expect(connexionDrive(s)).toEqual({ etat: 'connecte', resume: 'Aucun dossier choisi', peutSynchroniser: false });
    expect(connexionDrive({ ...s, folderId: 'f', folderName: 'Shooting' }).peutSynchroniser).toBe(true);
  });
});

describe('Spatial · Jarvis · règles de l’écran', () => {
  const maintenant = new Date('2026-10-27T15:00:00.000Z');

  it('date courte · heure, hier, jour de la semaine, date', () => {
    expect(quandConversation('2026-10-27T09:05:00.000Z', maintenant)).toBe('09:05');
    expect(quandConversation('2026-10-26T09:05:00.000Z', maintenant)).toBe('hier');
    expect(quandConversation('2026-10-26T09:05:00.000Z', maintenant)).not.toBe('lun.');
    expect(quandConversation('2026-10-23T09:05:00.000Z', maintenant)).toBe('ven.');
    expect(quandConversation('2026-10-18T09:05:00.000Z', maintenant)).toBe('18 oct.');
    expect(quandConversation('2026-10-01T09:05:00.000Z', maintenant)).toBe('1er oct.');
    expect(ilYA('2026-10-27T14:48:00.000Z', maintenant)).toBe('il y a 12 min');
    expect(ilYA('2026-10-21T15:00:00.000Z', maintenant)).toBe('il y a 6 j');
  });

  it('une réponse lisible · marqueurs retirés, seules les actions gratuites de navigation restent', () => {
    const r = reponseLisible('Teste B — maintenant. [[SOURCE:K1-v1]] [[ACTION:lots]] [[ACTION:draft|une accroche]]');
    expect(r.texte).not.toMatch(/\[\[|—/);
    expect(r.actions.map((a) => a.cle)).toEqual(['lots']);
    expect(r.actions[0]!.href).toBe('/adsmap/lots');
  });

  it('extrait plat et borné · recherche dans le titre et l’extrait, sans accents', () => {
    expect(extraitConversation('a'.repeat(100))).toHaveLength(70);
    expect(extraitConversation(null)).toBe('');
    const l = [{ titre: 'Plan créa', extrait: 'semaine 1' }, { titre: 'Accroches', extrait: 'Été à soi' }];
    expect(filtrerConversations(l, 'ete').map((c) => c.titre)).toEqual(['Accroches']);
    expect(filtrerConversations(l, '  ')).toHaveLength(2);
  });

  it('dernières itérations · les vrais lots, statut et ton de la maquette, quatre au plus', () => {
    const lots = [1, 2, 3, 4, 5].map((k) => ({ id: `l${k}`, number: k, goal: k === 5 ? 'Accroche courte' : null, status: k === 5 ? 'testing' : 'analyzed', createdAt: `2026-10-2${k}T10:00:00.000Z` }));
    const it = iterationsRecentes(lots, maintenant);
    expect(it).toHaveLength(4);
    expect(it[0]).toMatchObject({ titre: 'Lot #5 · Accroche courte', pastille: { classe: 'c', libelle: 'En diffusion' }, href: '/adsmap/lots?lot=l5' });
    expect(it[1]!.pastille).toEqual({ classe: 'g', libelle: 'Analysé' });
    expect(iterationsRecentes([], maintenant)).toEqual([]);
  });

  it('la question de l’adresse (`?q=`) · brouillon sans HTML, borné, première valeur seulement', () => {
    expect(lireQuestionJarvis('  Quel angle <b>tester</b> ?  ')).toBe('Quel angle tester ?');
    expect(lireQuestionJarvis('<script>alert(1)</script>Salut')).toBe('alert(1) Salut');
    expect(lireQuestionJarvis(['Première', 'Seconde'])).toBe('Première');
    expect(lireQuestionJarvis(undefined)).toBe('');
    expect(lireQuestionJarvis('a\u0000b')).toBe('a b');
    expect(lireQuestionJarvis('x'.repeat(5000))).toHaveLength(LONGUEUR_MAX_QUESTION_JARVIS);
    expect(lireQuestionJarvis('1 < 2 > 0')).not.toMatch(/[<>]/);
  });
});
