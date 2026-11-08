import { describe, expect, it } from 'vitest';
import {
  COLLECTIONS_MAX_PAR_SAUVEGARDE, FILTRES_LOCAUX_VIDES, FILTRES_SAUVEGARDES, LONGUEUR_MAX_NOTE, LONGUEUR_MAX_TAG, MESSAGE_TAG_IGNORE, TAG_TOUS, TAGS_MAX_PAR_SAUVEGARDE,
  cleTag, collectionsDeSauvegarde, collectionsSauvegardes, controlesLocaux, dansCollection, ecrireFiltresLocaux, ecritureCollections, filtrerLocal,
  filtrerSauvegardes, lienSauvegardesTag, lireFiltresLocaux, lireTagSauvegardes, messageSauvegarde, pucesLocales, rattacherTags, retirerFiltreLocal,
  tagsPresents, validerCollections, validerNote, validerRenommage, validerTag, validerTags, type PubLocale,
} from '../src';

/**
 * Lot 6 V5 · Veille · tags, note et collections d'une sauvegarde · règles
 * PURES (`spatial/veille/tags-veille`) et filtre « Tags » de la barre des
 * filtres locaux (`filtres-locaux`). Chaque garde lit un RÉSULTAT · la clé
 * calculée, la liste filtrée, l'adresse écrite, la phrase de refus.
 */

describe('un tag · normalisation (casse, espaces, accents) et refus dits', () => {
  it('« Hook UGC » = « hook  ugc » = «  HOOK UGC » = « Hook ÜGC » · une seule clé, la première écriture garde son libellé', () => {
    expect(cleTag('Hook UGC')).toBe('hook ugc');
    expect(cleTag('  hook \t ugc ')).toBe('hook ugc');
    expect(cleTag('HOOK UGC')).toBe('hook ugc');
    expect(cleTag('Hook ÜGC')).toBe('hook ugc');
    expect(cleTag('Témoignage')).toBe(cleTag('temoignage'));
    const v = validerTags(['Hook UGC', 'hook  ugc', ' HOOK ugc ', 'Prix barré']);
    expect(v).toEqual({ ok: true, tags: [{ cle: 'hook ugc', nom: 'Hook UGC' }, { cle: 'prix barre', nom: 'Prix barré' }] });
  });
  it('vide, trop long, sans lettre ni chiffre, d’un autre type · refusé avec sa phrase, rien de coupé en douce', () => {
    expect(validerTag('   ')).toEqual({ ok: false, raison: 'Un tag ne peut pas être vide.' });
    const long = 'x'.repeat(LONGUEUR_MAX_TAG + 1);
    const r = validerTag(long);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.raison).toMatch(new RegExp(`^Un tag tient en ${LONGUEUR_MAX_TAG} signes au plus`));
    expect(validerTag('x'.repeat(LONGUEUR_MAX_TAG))).toMatchObject({ ok: true });
    expect(validerTag('···')).toEqual({ ok: false, raison: 'Un tag doit contenir au moins une lettre ou un chiffre.' });
    expect(validerTag(42)).toMatchObject({ ok: false });
    expect(validerTag('ligne\nnouvelle')).toEqual({ ok: true, tag: { cle: 'ligne nouvelle', nom: 'ligne nouvelle' } });
  });
  it('au plus 10 tags par sauvegarde · les doublons ne comptent qu’une fois', () => {
    const dix = Array.from({ length: TAGS_MAX_PAR_SAUVEGARDE }, (_, i) => `t${i}`);
    expect(validerTags([...dix, 'T0', ' t1 '])).toMatchObject({ ok: true });
    expect(validerTags([...dix, 'onze'])).toEqual({ ok: false, raison: '10 tags au plus par sauvegarde · retire-en 1.' });
    expect(validerTags('Hook')).toMatchObject({ ok: false });
  });
});

describe('la note · facultative, bornée, jamais coupée', () => {
  it('vide ou absente = pas de note · bords nus, retours à la ligne gardés', () => {
    expect(validerNote(null)).toEqual({ ok: true, note: null });
    expect(validerNote('   \n ')).toEqual({ ok: true, note: null });
    expect(validerNote('  Le hook\r\ntient 3 s  ')).toEqual({ ok: true, note: 'Le hook\ntient 3 s' });
  });
  it('trop longue · refusée avec le compte, pas tronquée', () => {
    expect(validerNote('a'.repeat(LONGUEUR_MAX_NOTE))).toMatchObject({ ok: true });
    expect(validerNote('a'.repeat(LONGUEUR_MAX_NOTE + 1))).toEqual({ ok: false, raison: `La note tient en ${(1000).toLocaleString('fr-FR')} signes au plus · elle en compte ${(1001).toLocaleString('fr-FR')}.` });
    expect(validerNote(12)).toMatchObject({ ok: false });
  });
});

describe('collections · plusieurs par sauvegarde, le dossier en tête', () => {
  it('validation · nettoyées, doublons exacts fusionnés, ordre gardé, plafond', () => {
    expect(validerCollections([' Hiver ', 'Hooks', 'Hiver', ''])).toEqual({ ok: true, collections: ['Hiver', 'Hooks'] });
    expect(validerCollections(Array.from({ length: COLLECTIONS_MAX_PAR_SAUVEGARDE + 1 }, (_, i) => `c${i}`))).toMatchObject({ ok: false });
    expect(validerCollections(['x'.repeat(61)])).toMatchObject({ ok: false });
  });
  it('lecture · liens 0070 s’il y en a (dossier en tête), sinon le dossier · écriture · le dossier = la première', () => {
    expect(collectionsDeSauvegarde('Hiver', [])).toEqual(['Hiver']);
    expect(collectionsDeSauvegarde(null, null)).toEqual([]);
    expect(collectionsDeSauvegarde('Hooks', ['Hiver', 'Hooks'])).toEqual(['Hooks', 'Hiver']);
    expect(ecritureCollections(['Hooks', 'Hiver'])).toEqual({ folder: 'Hooks', liens: ['Hooks', 'Hiver'] });
    expect(ecritureCollections([])).toEqual({ folder: null, liens: [] });
  });
  it('une sauvegarde dans deux collections compte dans chacune, et n’est pas « Non classée »', () => {
    const items = [{ folder: 'Hooks', collections: ['Hooks', 'Hiver'] }, { folder: null, collections: [] }, { folder: 'Hiver' }];
    expect(collectionsSauvegardes(items)).toEqual([
      { cle: 'all', libelle: 'Toutes les sauvegardes', n: 3 }, { cle: 'f:Hiver', libelle: 'Hiver', n: 2 }, { cle: 'f:Hooks', libelle: 'Hooks', n: 1 }, { cle: 'none', libelle: 'Non classées', n: 1 },
    ]);
    expect(dansCollection('Hooks', 'f:Hiver', ['Hooks', 'Hiver'])).toBe(true);
    expect(dansCollection('Hooks', 'none', ['Hooks', 'Hiver'])).toBe(false);
    expect(dansCollection('Hooks', 'f:Hiver')).toBe(false);
  });
});

describe('vocabulaire · réemploi, renommage', () => {
  const voc = [{ id: 't1', cle: 'hook ugc', nom: 'Hook UGC' }, { id: 't2', cle: 'prix barre', nom: 'Prix barré' }];
  it('une clé connue réemploie le tag existant · une clé neuve est à créer', () => {
    expect(rattacherTags(voc, [{ cle: 'hook ugc', nom: 'hook ugc' }, { cle: 'avant apres', nom: 'Avant / après' }]))
      .toEqual({ existants: ['t1'], aCreer: [{ cle: 'avant apres', nom: 'Avant / après' }] });
  });
  it('renommer vers la clé d’un AUTRE tag · refusé · vers sa propre clé (casse) · accepté', () => {
    expect(validerRenommage('t2', 'HOOK ugc', voc)).toEqual({ ok: false, raison: 'Le tag « Hook UGC » existe déjà · choisis un autre nom.' });
    expect(validerRenommage('t1', 'hook UGC', voc)).toEqual({ ok: true, tag: { cle: 'hook ugc', nom: 'hook UGC' } });
  });
  it('le message après le oui dit ce qui a été gardé', () => {
    expect(messageSauvegarde({ nouvelle: true, tags: 2, note: true, collections: 1 })).toBe('Pub gardée dans tes sauvegardes · 2 tags, 1 collection, une note');
    expect(messageSauvegarde({ nouvelle: false, tags: 0, note: false, collections: 0 })).toBe('Sauvegarde mise à jour');
  });
});

/* ───────────────────────── filtre « Tags » (V20) ───────────────────────── */

const t = (nom: string) => ({ cle: cleTag(nom), nom });
const PUBS: Array<PubLocale & { nom: string }> = [
  { nom: 'A', tags: [t('Hook UGC'), t('Prix barré')], sauvee: true },
  { nom: 'B', tags: [t('Hook UGC')], sauvee: true },
  { nom: 'C', tags: [], sauvee: false },
  { nom: 'D', sauvee: true, tags: [t('Prix barré')] },
];

describe('filtre local « Tags » · sur les pubs chargées', () => {
  it('« Hook UGC » ne garde que A et B, dans l’ordre · « hook ugc » écrit autrement désigne le même tag', () => {
    const f = { ...FILTRES_LOCAUX_VIDES, tag: cleTag('  HOOK ugc ') };
    expect(filtrerLocal(PUBS, f, (p) => p).map((p) => p.nom)).toEqual(['A', 'B']);
    expect(filtrerLocal(PUBS, { ...FILTRES_LOCAUX_VIDES, tag: 'prix barre' }, (p) => p).map((p) => p.nom)).toEqual(['A', 'D']);
    expect(filtrerLocal(PUBS, FILTRES_LOCAUX_VIDES, (p) => p)).toHaveLength(4);
  });
  it('le contrôle s’ouvre avec un tag qui sépare · options et effectifs · fermé avec sa raison sinon', () => {
    expect(controlesLocaux(PUBS).tags).toEqual({ ouvert: true, raison: null, options: [{ valeur: 'hook ugc', libelle: 'Hook UGC', n: 2 }, { valeur: 'prix barre', libelle: 'Prix barré', n: 2 }] });
    expect(controlesLocaux([{ tags: [] }, {}]).tags).toEqual({ ouvert: false, raison: 'Aucune de ces pubs ne porte de tag · pose-les en sauvegardant', options: [] });
    expect(controlesLocaux([{ tags: [t('Hook')] }, { tags: [t('hook')] }]).tags).toMatchObject({ ouvert: false, raison: 'Toutes ces pubs portent les mêmes tags' });
  });
  it('la puce dit le libellé, se retire seule · l’adresse garde la clé, une forme non canonique est ignorée', () => {
    const f = { ...FILTRES_LOCAUX_VIDES, tag: 'hook ugc', cta: 'Acheter' };
    expect(pucesLocales(f, new Map([['hook ugc', 'Hook UGC']])).map((p) => p.libelle)).toEqual(['Appel à l’action · Acheter', 'Tag · Hook UGC']);
    expect(retirerFiltreLocal(f, 'tag')).toEqual({ ...f, tag: null });
    const qs = ecrireFiltresLocaux('?q=piscine', f);
    expect(qs).toBe('?q=piscine&cta=Acheter&tag=hook+ugc');
    expect(lireFiltresLocaux(Object.fromEntries(new URLSearchParams(qs))).tag).toBe('hook ugc');
    expect(lireFiltresLocaux({ tag: 'Hook UGC' }).tag, 'une clé non canonique est devinée').toBeNull();
    expect(lireFiltresLocaux({ tag: 'x'.repeat(41) }).tag).toBeNull();
  });
});

describe('/saved · le filtre par tag et « Voir » de /tags', () => {
  const items = [
    { platform: 'meta', video: false, texte: 'a', annonceur: 'A', format: null, tags: [t('Hook UGC')] },
    { platform: 'meta', video: false, texte: 'b', annonceur: 'B', format: null, tags: [] },
    { platform: 'meta', video: true, texte: 'c', annonceur: 'C', format: null, tags: [t('hook ugc'), t('Prix')] },
  ];
  it('filtrer par clé · seules les sauvegardes qui portent le tag · « tous » ne filtre rien', () => {
    expect(filtrerSauvegardes(items, { ...FILTRES_SAUVEGARDES, tag: 'hook ugc' }).map((i) => i.annonceur)).toEqual(['A', 'C']);
    expect(filtrerSauvegardes(items, { ...FILTRES_SAUVEGARDES, tag: TAG_TOUS })).toHaveLength(3);
    expect(filtrerSauvegardes(items, FILTRES_SAUVEGARDES)).toHaveLength(3);
  });
  it('« Voir » mène à `/saved?tag=<clé>` · relu contre les tags RÉELS · inconnu → ignoré et dit', () => {
    expect(lienSauvegardesTag('hook ugc')).toBe('/saved?tag=hook%20ugc');
    const dispo = tagsPresents(items);
    expect(dispo).toEqual([{ cle: 'hook ugc', nom: 'Hook UGC', n: 2 }, { cle: 'prix', nom: 'Prix', n: 1 }]);
    expect(lireTagSauvegardes({ tag: 'hook ugc' }, dispo)).toEqual({ cle: 'hook ugc', ignore: false });
    expect(lireTagSauvegardes({ tag: 'Hook UGC' }, dispo)).toEqual({ cle: 'hook ugc', ignore: false });
    expect(lireTagSauvegardes({ tag: 'autre marque' }, dispo)).toEqual({ cle: TAG_TOUS, ignore: true });
    expect(lireTagSauvegardes({}, dispo)).toEqual({ cle: TAG_TOUS, ignore: false });
    expect(MESSAGE_TAG_IGNORE).toMatch(/toutes les sauvegardes sont affichées/);
  });
});
