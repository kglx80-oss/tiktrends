import { describe, expect, it } from 'vitest';
import {
  ETAT_DRIVE_INITIAL, MOTS_VOISINS_PUB, PREFIXE_TAG_MAIN, RAISONS_AJOUT_BRIEF, RAISONS_ECART_VERSEMENT, RAISON_TAGS_AUCUN, RAISON_TAGS_UN_SEUL, TAG_TEMPLATE,
  ajoutBriefApercu, controleTagsFichiers, dateAjoutComplete, donneesDrive, ecritureTagsMain, fusionTagsAnalyse, libelleDimensions, lienNouveauProjet,
  lireContexteNouveauProjet, lireMediasNouveauProjet, lireTagsFichier, mediasRetenusBrief, metaApercuComplet, navigationApercu, notesContexte,
  raisonMediasBrief, reglagesApercu, tagsVisibles, voisinsDetail, vueDrive,
  type EtatDrive, type MediaSource,
} from '../src';

/**
 * Lot 12 V5 · Bibliothèque · aperçu complet, tags à la main, références au
 * brief · les RÈGLES du noyau, prouvées au résultat (ce que la vue montre, ce
 * que la colonne devient, l'adresse produite).
 */

const NNBSP = String.fromCharCode(0x202f);
const T = (j: number) => `2026-10-${String(10 + j).padStart(2, '0')}T09:00:00.000Z`;
const u = (n: number) => `a${String(n).padStart(7, '0')}-0000-4000-8000-000000000000`;
let n = 0;
const media = (name: string, o: Partial<MediaSource> = {}): MediaSource => ({
  id: u(++n), name, kind: 'image', mimeType: 'image/png', source: 'upload', url: `/api/asset?id=${n}`, thumbUrl: null, sizeBytes: 2048, createdAt: T(n), folderId: null, rights: 'photo_marque',
  ia: { utilisable: true, template: false, tags: [] }, ...o,
});
const etat = (o: Partial<EtatDrive> = {}): EtatDrive => ({ ...ETAT_DRIVE_INITIAL, ...o });

describe('aperçu complet · précédent / suivant dans la liste AFFICHÉE · la règle de la Veille, des mots de fichier', () => {
  it('position, bornes dites, aucun bouclage, fichier sorti de la liste', () => {
    const l = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(navigationApercu(l, 'a')).toEqual({ position: 1, total: 3, precedente: null, suivante: 'b', raisonPrecedente: 'Premier fichier de la liste', raisonSuivante: null, libelle: 'Fichier 1 sur 3' });
    expect(navigationApercu(l, 'b')).toMatchObject({ precedente: 'a', suivante: 'c', raisonPrecedente: null, raisonSuivante: null, libelle: 'Fichier 2 sur 3' });
    expect(navigationApercu(l, 'c')).toMatchObject({ precedente: 'b', suivante: null, raisonSuivante: 'Dernier fichier de la liste' });
    expect(navigationApercu([{ id: 'a' }], 'a')).toMatchObject({ raisonPrecedente: 'Seul fichier de la liste', raisonSuivante: 'Seul fichier de la liste' });
    expect(navigationApercu(l, 'z')).toMatchObject({ position: 0, precedente: null, suivante: null, libelle: 'Ce fichier n’est plus dans la liste affichée' });
  });

  it('la Veille garde ses mots · la règle est partagée, pas recopiée', () => {
    expect(voisinsDetail(['x', 'y'], 'x')).toMatchObject({ libelle: 'Pub 1 sur 2', raisonPrecedente: 'Première pub de la liste' });
    expect(voisinsDetail(['x', 'y'], 'x', MOTS_VOISINS_PUB)).toEqual(voisinsDetail(['x', 'y'], 'x'));
  });

  it('la liste parcourue est celle que la vue affiche · filtre « Tags » compris, dans l’ordre de tri', () => {
    n = 0;
    const d = donneesDrive({ dossiers: [], medias: [
      media('c-tube.png', { ia: { utilisable: true, template: false, tags: ['plage'], main: ['Hook UGC'] } }),
      media('a-flacon.png', { ia: { utilisable: true, template: false, tags: [], main: ['hook  ugc'] } }),
      media('b-pot.png'),
    ] });
    const tous = vueDrive(d, etat());
    expect(tous.fichiers.map((f) => f.nom)).toEqual(['a-flacon.png', 'b-pot.png', 'c-tube.png']);
    const filtres = vueDrive(d, etat({ tagFichier: 'hook ugc' }));
    expect(filtres.fichiers.map((f) => f.nom), 'le filtre « Tags » ne garde pas les fichiers qui portent le tag').toEqual(['a-flacon.png', 'c-tube.png']);
    expect(navigationApercu(filtres.fichiers, filtres.fichiers[1]!.id)).toMatchObject({ libelle: 'Fichier 2 sur 2', raisonSuivante: 'Dernier fichier de la liste' });
  });
});

describe('aperçu complet · métadonnées, fond et zoom', () => {
  n = 0;
  const f = donneesDrive({ dossiers: [], medias: [media('visuel.png', { sizeBytes: 2_516_582 })] }).fichiers[0]!;
  it('dimensions LUES à l’affichage · rien d’inventé', () => {
    expect(libelleDimensions(1080, 1920)).toBe(`1${NNBSP}080 × 1${NNBSP}920 px`);
    expect(libelleDimensions(0, 10)).toBeNull();
    expect(libelleDimensions(Number.NaN, 10)).toBeNull();
    const m = (d: Parameters<typeof metaApercuComplet>[1]['dimensions']) => Object.fromEntries(metaApercuComplet(f, { dossier: 'Assets de la marque', dimensions: d }).map((x) => [x.cle, x.valeur]));
    expect(m({ etat: 'attente' }).dimensions).toBe('Lues à l’affichage…');
    expect(m({ etat: 'illisibles' }).dimensions).toBe('Non données par le fichier');
    expect(m({ etat: 'lues', largeur: 800, hauteur: 600 })).toMatchObject({ type: 'Image', dimensions: '800 × 600 px', poids: '2,4 Mo', source: 'Téléversé', ajoute: '11 octobre 2026', dossier: 'Assets de la marque', droits: 'Photo de la marque' });
    expect(dateAjoutComplete('pas une date')).toBe('Date inconnue');
  });
  it('fond et zoom · ouverts pour une image ou une vidéo, fermés avec leur raison sinon', () => {
    expect(reglagesApercu({ type: 'image' })).toEqual({ ouvert: true, raison: null });
    expect(reglagesApercu({ type: 'video' }).ouvert).toBe(true);
    expect(reglagesApercu({ type: 'audio' })).toEqual({ ouvert: false, raison: 'Un son n’a ni fond ni zoom.' });
    expect(reglagesApercu({ type: 'pdf' }).raison).toContain('télécharge-le');
  });
});

describe('tags posés à la main · la colonne `tags`, sans migration', () => {
  it('poser · la liste demandée remplace la main, les tags IA et le marqueur template restent', () => {
    const v = ecritureTagsMain(['plage', TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Ancien`], ['Hook UGC', 'hook  ugc', '  Packshot ']);
    expect(v).toEqual({ ok: true, tags: ['plage', TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Hook UGC`, `${PREFIXE_TAG_MAIN}Packshot`], main: [{ cle: 'hook ugc', nom: 'Hook UGC' }, { cle: 'packshot', nom: 'Packshot' }] });
    expect(ecritureTagsMain(['plage', `${PREFIXE_TAG_MAIN}A`], [])).toEqual({ ok: true, tags: ['plage'], main: [] });
  });
  it('le × d’un tag IA · `iaGardes` ne peut que RETIRER un tag IA · ni en ajouter, ni toucher la main ou le marqueur', () => {
    const col = ['plage', 'soleil', TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Hook`];
    expect(ecritureTagsMain(col, ['Hook'], ['soleil', 'inventé'])).toEqual({ ok: true, tags: ['soleil', TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Hook`], main: [{ cle: 'hook', nom: 'Hook' }] });
    expect(ecritureTagsMain(col, ['Hook'], [])).toMatchObject({ ok: true, tags: [TAG_TEMPLATE, `${PREFIXE_TAG_MAIN}Hook`] });
    expect(ecritureTagsMain(col, ['Hook'], 'plage')).toEqual({ ok: false, raison: 'Liste de tags illisible · recharge la page.' });
  });
  it('les règles de la Veille · vide, trop long, sans lettre, plus de 10 · refusés avec la phrase « par fichier »', () => {
    expect(ecritureTagsMain([], [''])).toEqual({ ok: false, raison: 'Un tag ne peut pas être vide.' });
    expect(ecritureTagsMain([], ['x'.repeat(41)])).toMatchObject({ ok: false, raison: expect.stringContaining('40 signes au plus') });
    expect(ecritureTagsMain([], ['!!!'])).toEqual({ ok: false, raison: 'Un tag doit contenir au moins une lettre ou un chiffre.' });
    expect(ecritureTagsMain([], Array.from({ length: 11 }, (_, i) => `t${i}`))).toEqual({ ok: false, raison: '10 tags au plus par fichier · retire-en 1.' });
    expect(ecritureTagsMain([], 'pas une liste')).toMatchObject({ ok: false });
  });
  it('une nouvelle analyse remplace les tags IA et GARDE la main et le marqueur · le modèle ne peut pas se faire passer pour la main', () => {
    const avant = ['plage', `${PREFIXE_TAG_MAIN}Hook UGC`, TAG_TEMPLATE];
    expect(fusionTagsAnalyse(avant, ['soleil', `${PREFIXE_TAG_MAIN}faux`, TAG_TEMPLATE])).toEqual(['soleil', `${PREFIXE_TAG_MAIN}Hook UGC`, TAG_TEMPLATE]);
    expect(fusionTagsAnalyse(null, ['soleil'])).toEqual(['soleil']);
  });
  it('lecture · la main d’un côté, l’analyse de l’autre · l’écran ne voit que les libellés', () => {
    const col = ['plage', `${PREFIXE_TAG_MAIN}Hook UGC`, `${PREFIXE_TAG_MAIN}hook ugc`, TAG_TEMPLATE];
    expect(lireTagsFichier(col)).toEqual({ main: [{ cle: 'hook ugc', nom: 'Hook UGC' }], ia: ['plage'] });
    expect(tagsVisibles(col).some((t) => t.includes('__')), 'un marqueur sort vers l’écran').toBe(false);
    expect(tagsVisibles(col)).toEqual(['plage', 'Hook UGC', 'hook ugc']);
  });
  it('le menu « Tags » · effectifs par clé, fermé avec sa raison quand il ne sépare rien', () => {
    const t = (main: string[], ia: string[] = []) => ({ tags: { main: main.map((nom) => ({ cle: nom.toLowerCase(), nom })), ia } });
    expect(controleTagsFichiers([t([]), t([])])).toEqual({ ouvert: false, raison: RAISON_TAGS_AUCUN, options: [] });
    expect(controleTagsFichiers([t(['Hook']), t(['Hook'])])).toMatchObject({ ouvert: false, raison: RAISON_TAGS_UN_SEUL });
    expect(controleTagsFichiers([t(['Hook']), t([], ['plage', 'hook'])])).toEqual({ ouvert: true, raison: null, options: [{ valeur: 'hook', libelle: 'Hook', n: 2 }, { valeur: 'plage', libelle: 'plage', n: 1 }] });
  });
  it('la recherche lit aussi les tags posés à la main · un tag de filtre absent de la vue ne vide pas la vue', () => {
    n = 0;
    const d = donneesDrive({ dossiers: [], medias: [media('un.png', { ia: { utilisable: true, template: false, tags: [], main: ['Été'] } }), media('deux.png')] });
    expect(vueDrive(d, etat({ recherche: 'ete' })).fichiers.map((f) => f.nom)).toEqual(['un.png']);
    const v = vueDrive(d, etat({ tagFichier: 'inconnu' }));
    expect(v.fichiers).toHaveLength(2);
    expect(v.tagsFichiers.actif).toBeNull();
  });
});

describe('« Ajouter au brief » · la règle du versement, l’assistant armé du fichier', () => {
  n = 0;
  const d = donneesDrive({ dossiers: [], medias: [
    media('ok.png'), media('rush.mp4', { kind: 'video', mimeType: 'video/mp4' }), media('douteuse.png', { rights: 'a_preciser' }),
    media('jetee.png', { deletedAt: T(1) }),
    media('sortie.png', { source: 'studios', studio: { projetId: 'p1', projetTitre: 'Projet', href: '/studio/projets/p1' } }),
  ] });
  const id = (nom: string) => d.fichiers.find((f) => f.nom === nom)!.id;
  it('ouvert pour une image aux droits autorisés · le lien de l’assistant porte CE fichier', () => {
    expect(ajoutBriefApercu(d, id('ok.png'), null)).toEqual({ ouvert: true, raison: null, nouveauProjet: `/studio/projets/nouveau?type=ads&media=${id('ok.png')}` });
  });
  it('fermé, la raison dite · vidéo, droits, corbeille, création des Studios, lecture seule', () => {
    expect(ajoutBriefApercu(d, id('rush.mp4'), null)).toEqual({ ouvert: false, raison: RAISONS_ECART_VERSEMENT.type, nouveauProjet: null });
    expect(ajoutBriefApercu(d, id('douteuse.png'), null).raison).toBe(RAISONS_ECART_VERSEMENT.droits);
    expect(ajoutBriefApercu(d, id('jetee.png'), null).raison).toBe(RAISONS_AJOUT_BRIEF.corbeille);
    expect(ajoutBriefApercu(d, id('sortie.png'), null).raison).toBe(RAISONS_AJOUT_BRIEF.lectureSeule);
    expect(ajoutBriefApercu(d, id('ok.png'), 'Lecture seule · offre').raison).toBe('Lecture seule · offre');
  });
  it('l’adresse · `media` répété, valeurs forgées ignorées, sans doublon, au plus 10 · relue dans le contexte', () => {
    const l = lienNouveauProjet({ type: 'ads', medias: [u(1), 'forgé', u(1).toUpperCase(), u(2)] });
    expect(l).toBe(`/studio/projets/nouveau?type=ads&media=${u(1)}&media=${u(2)}`);
    expect(lireMediasNouveauProjet({ media: Array.from({ length: 14 }, (_, i) => u(100 + i)) })).toHaveLength(10);
    const c = lireContexteNouveauProjet({ media: [u(1), 'x'] });
    expect(c.medias).toEqual([u(1)]);
    expect(c.aContexte, 'un média seul n’ouvre pas le brief').toBe(true);
  });
  it('relus pour la MARQUE ACTIVE · une autre marque, la corbeille, une vidéo, un inconnu sont écartés, comptés, jamais nommés', () => {
    const lignes = [
      { id: u(1), name: 'ok.png', kind: 'image', brandId: 'A1', rights: 'photo_marque', supprime: false },
      { id: u(2), name: 'commune.png', kind: 'image', brandId: null, rights: null, supprime: false },
      { id: u(3), name: 'secret-a2.png', kind: 'image', brandId: 'A2', rights: 'photo_marque', supprime: false },
      { id: u(4), name: 'jetee.png', kind: 'image', brandId: 'A1', rights: 'photo_marque', supprime: true },
      { id: u(5), name: 'rush.mp4', kind: 'video', brandId: 'A1', rights: 'photo_marque', supprime: false },
    ];
    const ids = [u(3), u(1), u(9), u(2), u(4), u(5)];
    expect(mediasRetenusBrief(lignes, ids, 'A1')).toEqual([{ id: u(1), nom: 'ok.png' }, { id: u(2), nom: 'commune.png' }]);
    expect(mediasRetenusBrief(lignes, ids, null)).toEqual([]);
    const notes = notesContexte(lireContexteNouveauProjet({ media: ids }), { refJointe: false, iteration: null, mediasRetenus: 2 });
    expect(notes).toEqual(['4 fichiers de la Bibliothèque de ce lien ne sont pas repris (à la corbeille, d’une autre marque, pas une image ou des droits qui n’autorisent pas la publicité) · rien n’est joint à sa place.']);
    expect(notes.join(' ')).not.toContain('secret');
  });
  it('rôle et portée CHOISIS avant de verser · jamais déduits', () => {
    expect(raisonMediasBrief(0, '', '')).toBeNull();
    expect(raisonMediasBrief(1, '', 'global')).toContain('Choisis un rôle');
    expect(raisonMediasBrief(1, 'style', '')).toContain('Choisis une portée');
    expect(raisonMediasBrief(1, 'style', 'global')).toBeNull();
  });
});
