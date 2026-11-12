import { describe, it, expect } from 'vitest';
import {
  CHEMIN_MES_MENTIONS, COMPTES_VIDES, EXTRAIT_MAX_MENTION, MENTIONS_MAX_LUES, MENTIONS_PAR_PAGE, TEXTES_MES_MENTIONS, TYPES_NOTIF_MENTION,
  ancreCommentaire, ancreNote, extraitCommentaire, extraitSegments, filDeLaMention, genreDeNotif, lienFilMention, lienLigneeProjet, lienMesMentions,
  ligneMention, lireCommentaireCible, lireFiltresMentions, lireNoeudCible, paginationMentions, projetDuLienMention, segmentsCommentaire, totalDuFiltre,
  typesDuFiltre, vueMesMentions,
  type ComptesMentions, type FilLu, type FilMentionnant, type SegmentCommentaire,
} from '../src';

/**
 * « Mes mentions » · les RÈGLES, en pur.
 *  · la sélection · seuls les deux types de mention, les filtres lus
 *    défensivement, l'adresse du projet lue dans la notification ;
 *  · le fil d'une mention · même genre, même projet, l'extrait de la
 *    notification qui désigne le fil (texte courant ou ancien), l'instant le
 *    plus proche qui départage · aucun fil relu · `null` (hors de la portée) ;
 *  · l'extrait · borné, une mention jamais coupée, des segments de TEXTE ;
 *  · la ligne · hors de la portée, rien du fil · résolu, dit · le lien vers
 *    l'ancre stable du commentaire ou le nœud de la note ;
 *  · la page · filtres comptés, pages bornées, phrase du vide.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const P1 = u(1); const P2 = u(2);
const T0 = Date.UTC(2026, 10, 1, 9, 0);
const min = (n: number) => T0 + n * 60_000;
const fil = (o: Partial<FilMentionnant> & Pick<FilMentionnant, 'id'>): FilMentionnant => ({ genre: 'commentaire', projetId: P1, textes: ['Bonjour'], instants: [T0], ...o });

describe('la sélection · types, filtres, projet de la notification', () => {
  it('seuls les deux types de mention sont lus · le filtre choisit lesquels', () => {
    expect(TYPES_NOTIF_MENTION).toEqual({ commentaire: 'studio_comment_mention', note: 'studio_note_mention' });
    expect(['studio_comment_mention', 'studio_note_mention', 'studio_comment', 'ticket_new', ''].map(genreDeNotif)).toEqual(['commentaire', 'note', null, null, null]);
    expect(typesDuFiltre('tous')).toEqual(['studio_comment_mention', 'studio_note_mention']);
    expect(typesDuFiltre('commentaires')).toEqual(['studio_comment_mention']);
    expect(typesDuFiltre('notes')).toEqual(['studio_note_mention']);
  });

  it('les filtres de l’adresse · défensifs, page entière ≥ 1, aller-retour par le lien', () => {
    expect(lireFiltresMentions({})).toEqual({ lecture: 'toutes', type: 'tous', page: 1 });
    expect(lireFiltresMentions(null)).toEqual({ lecture: 'toutes', type: 'tous', page: 1 });
    expect(lireFiltresMentions({ lecture: 'non-lues', type: 'notes', page: '3' })).toEqual({ lecture: 'non-lues', type: 'notes', page: 3 });
    expect(lireFiltresMentions({ lecture: ['non-lues', 'toutes'], type: ['commentaires'], page: ['2'] })).toEqual({ lecture: 'non-lues', type: 'commentaires', page: 2 });
    for (const page of ['0', '-1', '1.5', 'abc', '99999', '<script>']) expect(lireFiltresMentions({ page }).page, `page « ${page} »`).toBe(1);
    expect(lireFiltresMentions({ lecture: 'lues', type: 'tout' })).toEqual({ lecture: 'toutes', type: 'tous', page: 1 });
    expect(lienMesMentions({ lecture: 'toutes', type: 'tous', page: 1 })).toBe(CHEMIN_MES_MENTIONS);
    const f = { lecture: 'non-lues', type: 'notes', page: 4 } as const;
    expect(lienMesMentions(f)).toBe('/studio/mentions?lecture=non-lues&type=notes&page=4');
    expect(lireFiltresMentions(Object.fromEntries(new URLSearchParams(lienMesMentions(f).split('?')[1])))).toEqual(f);
  });

  it('le projet d’une notification · l’adresse écrite par les commentaires et les notes, rien d’autre', () => {
    expect(projetDuLienMention(`/studio/projets/${P1}#activite`)).toBe(P1);
    expect(projetDuLienMention(lienLigneeProjet(P2))).toBe(P2);
    expect(projetDuLienMention(`/studio/projets/${P1.toUpperCase()}`)).toBe(P1);
    for (const x of [null, undefined, '', '/studio/projets/abc#activite', `/brands/${P1}`, `https://ailleurs.test/studio/projets/${P1}`, `/studio/projets/${P1}x`]) {
      expect(projetDuLienMention(x), String(x)).toBeNull();
    }
  });
});

describe('le fil d’une mention · retrouvé parmi ceux relus dans la portée', () => {
  it('l’extrait de la notification désigne le fil · son texte courant ou un ancien', () => {
    const a = fil({ id: u(10), textes: ['Le produit est flou'], instants: [min(0)] });
    const b = fil({ id: u(11), textes: ['Vu avec @Zoé · à revoir', 'Ancien texte sans mention'], instants: [min(1), min(30)] });
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: extraitCommentaire('Le produit est flou'), creeLe: min(31) }, [a, b])).toBe(u(10));
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: extraitCommentaire('Ancien texte sans mention'), creeLe: min(0) }, [a, b])).toBe(u(11));
  });

  it('même texte · l’instant le plus proche (création ou modification) départage', () => {
    const a = fil({ id: u(20), textes: ['Même texte'], instants: [min(0)] });
    const b = fil({ id: u(21), textes: ['Même texte'], instants: [min(10)] });
    const c = fil({ id: u(22), textes: ['Même texte', 'avant'], instants: [min(-100), min(20)] });
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: 'Même texte', creeLe: min(1) }, [a, b, c])).toBe(u(20));
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: 'Même texte', creeLe: min(11) }, [a, b, c])).toBe(u(21));
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: 'Même texte', creeLe: min(21) }, [a, b, c]), 'une modification qui a mentionné').toBe(u(22));
  });

  it('aucun texte ne redonne l’extrait (historique perdu) · le plus proche du même projet', () => {
    const a = fil({ id: u(30), textes: ['x'], instants: [min(0)] });
    const b = fil({ id: u(31), textes: ['y'], instants: [min(50)] });
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: 'introuvable', creeLe: min(49) }, [a, b])).toBe(u(31));
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: null, creeLe: min(1) }, [a, b])).toBe(u(30));
  });

  it('autre projet, autre genre, rien de relu, projet illisible · `null` (hors de la portée)', () => {
    const a = fil({ id: u(40), textes: ['Texte'], instants: [min(0)] });
    const n = fil({ id: u(41), genre: 'note', textes: ['Texte'], instants: [min(0)] });
    expect(filDeLaMention({ genre: 'commentaire', projetId: P2, corps: 'Texte', creeLe: min(0) }, [a, n])).toBeNull();
    expect(filDeLaMention({ genre: 'note', projetId: P1, corps: 'Texte', creeLe: min(0) }, [a])).toBeNull();
    expect(filDeLaMention({ genre: 'note', projetId: P1, corps: 'Texte', creeLe: min(0) }, [a, n])).toBe(u(41));
    expect(filDeLaMention({ genre: 'commentaire', projetId: P1, corps: 'Texte', creeLe: min(0) }, [])).toBeNull();
    expect(filDeLaMention({ genre: 'commentaire', projetId: null, corps: 'Texte', creeLe: min(0) }, [a])).toBeNull();
  });
});

describe('l’extrait · borné, mentions entières sous le nom courant, du texte', () => {
  const texte = (s: readonly SegmentCommentaire[]) => s.map((x) => (x.type === 'texte' ? x.texte : x.nom)).join('');
  const zoe = '00000000-0000-4000-8000-000000000099';

  it('court · tel quel, espaces resserrés', () => {
    const s = segmentsCommentaire('Vu avec @Zoé\n\n  à revoir', [{ id: zoe, debut: 8, longueur: 4 }], () => 'Zoé Martin');
    const e = extraitSegments(s);
    expect(e.tronque).toBe(false);
    expect(texte(e.segments)).toBe('Vu avec @Zoé Martin à revoir');
    expect(e.segments.find((x) => x.type === 'mention')).toEqual({ type: 'mention', id: zoe, nom: '@Zoé Martin', ancien: false });
  });

  it('long · au plus la borne de l’extrait de la notification, coupé à une espace, « … »', () => {
    const long = `${'mot '.repeat(80)}fin`;
    const e = extraitSegments([{ type: 'texte', texte: long }]);
    expect(EXTRAIT_MAX_MENTION).toBe(140);
    expect(e.tronque).toBe(true);
    const t = texte(e.segments);
    expect([...t].length).toBeLessThanOrEqual(EXTRAIT_MAX_MENTION + 1);
    expect(t.endsWith('mot…'), t).toBe(true);
    expect(t).toBe(extraitCommentaire(long));
  });

  it('une mention n’est jamais coupée · elle entre entière ou s’arrête avant', () => {
    const s: SegmentCommentaire[] = [{ type: 'texte', texte: 'a'.repeat(130) }, { type: 'mention', id: zoe, nom: '@Zoé Martinez Delacroix', ancien: false }, { type: 'texte', texte: ' suite' }];
    const e = extraitSegments(s);
    expect(e.tronque).toBe(true);
    expect(e.segments.some((x) => x.type === 'mention')).toBe(false);
    expect(texte(e.segments)).toBe(`${'a'.repeat(130)}…`);
    const ok = extraitSegments([{ type: 'texte', texte: 'Vu ' }, s[1]!, { type: 'texte', texte: ` ${'b'.repeat(200)}` }]);
    expect(ok.segments[1]).toEqual(s[1]);
  });

  it('`<script>` reste un segment de TEXTE, jamais du balisage · l’ancien membre est dit', () => {
    const s = segmentsCommentaire('<script>alert(1)</script> @x', [{ id: zoe, debut: 26, longueur: 2 }], () => null);
    const e = extraitSegments(s);
    expect(e.segments[0]).toEqual({ type: 'texte', texte: '<script>alert(1)</script> ' });
    expect(e.segments[1]).toMatchObject({ type: 'mention', nom: '@un ancien membre', ancien: true });
  });
});

describe('le lien vers le fil · l’ancre stable, le nœud de la note', () => {
  it('commentaire · onglet Activité, l’ancre du commentaire', () => {
    expect(ancreCommentaire(u(7).toUpperCase())).toBe(`commentaire-${u(7)}`);
    expect(lienFilMention({ genre: 'commentaire', id: u(7), projetId: P1 })).toBe(`/studio/projets/${P1}?commentaire=${u(7)}#commentaire-${u(7)}`);
  });

  it('note · la lignée, son nœud choisi, l’ancre de la note · une clé de nœud invalide est tue', () => {
    expect(ancreNote(u(8))).toBe(`note-${u(8)}`);
    expect(lienFilMention({ genre: 'note', id: u(8), projetId: P1, noeud: `creation:${u(9)}` }))
      .toBe(`/studio/projets/${P1}?disposition=libre&graphe=lignee&noeud=${encodeURIComponent(`creation:${u(9)}`)}#note-${u(8)}`);
    expect(lienFilMention({ genre: 'note', id: u(8), projetId: P1, noeud: 'pas un nœud' })).toBe(`${lienLigneeProjet(P1)}#note-${u(8)}`);
    expect(lienFilMention({ genre: 'note', id: u(8), projetId: P1, noeud: null })).toBe(`${lienLigneeProjet(P1)}#note-${u(8)}`);
  });

  it('la fiche relit l’adresse · un identifiant, une clé de nœud, rien d’autre', () => {
    expect(lireCommentaireCible({ commentaire: u(7).toUpperCase() })).toBe(u(7));
    for (const v of [undefined, '', 'abc', `${u(7)}x`, ['<b>']]) expect(lireCommentaireCible({ commentaire: v }), String(v)).toBeNull();
    expect(lireNoeudCible({ noeud: `creation:${u(9)}` })).toBe(`creation:${u(9)}`);
    expect(lireNoeudCible({ noeud: [`brief:${u(9)}`] })).toBe(`brief:${u(9)}`);
    for (const v of [undefined, '', 'pas un nœud', 'creation:a b', 'x'.repeat(400)]) expect(lireNoeudCible({ noeud: v }), String(v)).toBeNull();
  });
});

describe('la ligne · relue dans la portée, ou rien du fil', () => {
  const lu = (o: Partial<FilLu> = {}): FilLu => ({
    id: u(50), genre: 'commentaire', projetId: P1, projet: 'Sérum', auteur: 'Anne', segments: [{ type: 'texte', texte: 'Texte du fil' }], resolu: null, noeud: null, ...o,
  });
  const n = { id: u(60), genre: 'commentaire' as const, quand: '01/11/2026 · 10:00', lue: false };

  it('hors de la portée · « Fil hors de ta portée », ni auteur, ni projet, ni extrait, ni lien', () => {
    const l = ligneMention(n, null);
    expect(l).toEqual({ id: u(60), genre: 'commentaire', libelle: 'Commentaire', quand: n.quand, lue: false, fil: null, horsPortee: 'Fil hors de ta portée' });
    expect(TEXTES_MES_MENTIONS.horsPortee).toBe('Fil hors de ta portée');
    expect(ligneMention(n, lu({ genre: 'note' })).fil, 'un fil d’un autre genre n’est pas celui de la mention').toBeNull();
  });

  it('dans la portée · qui, projet, extrait borné, ouvert, lien vers l’ancre', () => {
    const l = ligneMention(n, lu());
    expect(l.horsPortee).toBeNull();
    expect(l.fil).toEqual({
      auteur: 'Anne', projet: 'Sérum', extrait: [{ type: 'texte', texte: 'Texte du fil' }], tronque: false, etat: 'ouvert', libelleEtat: 'Ouvert', phraseEtat: null,
      href: `/studio/projets/${P1}?commentaire=${u(50)}#commentaire-${u(50)}`,
    });
  });

  it('résolu · dit, avec qui l’a résolu · la note au féminin', () => {
    expect(ligneMention(n, lu({ resolu: { par: 'Rémi', quand: '02/11/2026 · 11:00' } })).fil).toMatchObject({ etat: 'resolu', libelleEtat: 'Résolu', phraseEtat: 'Commentaire résolu par Rémi · 02/11/2026 · 11:00' });
    const note = ligneMention({ ...n, genre: 'note' }, lu({ genre: 'note', resolu: { par: 'Rémi', quand: 'q' }, noeud: `creation:${u(9)}` }));
    expect(note.libelle).toBe('Note de la lignée');
    expect(note.fil).toMatchObject({ etat: 'resolu', libelleEtat: 'Résolue', phraseEtat: 'Note résolue par Rémi · q' });
    expect(note.fil!.href).toContain(`#note-${u(50)}`);
  });
});

describe('la page · filtres comptés, pages bornées, vide dit', () => {
  const c: ComptesMentions = { commentaire: { toutes: 30, nonLues: 4 }, note: { toutes: 5, nonLues: 1 } };

  it('les comptes par filtre', () => {
    expect(totalDuFiltre(c, { lecture: 'toutes', type: 'tous' })).toBe(35);
    expect(totalDuFiltre(c, { lecture: 'non-lues', type: 'tous' })).toBe(5);
    expect(totalDuFiltre(c, { lecture: 'non-lues', type: 'notes' })).toBe(1);
    expect(totalDuFiltre(c, { lecture: 'toutes', type: 'commentaires' })).toBe(30);
  });

  it('les pages · 20 par page, la page ramenée dans les bornes, au plus 500 listées et c’est dit', () => {
    expect(MENTIONS_PAR_PAGE).toBe(20);
    expect(paginationMentions(0, 1)).toEqual({ page: 1, pages: 1, debut: 0, tronque: false });
    expect(paginationMentions(35, 2)).toEqual({ page: 2, pages: 2, debut: 20, tronque: false });
    expect(paginationMentions(35, 9)).toEqual({ page: 2, pages: 2, debut: 20, tronque: false });
    expect(paginationMentions(35, 0)).toEqual({ page: 1, pages: 2, debut: 0, tronque: false });
    expect(paginationMentions(10_000, 9999)).toEqual({ page: MENTIONS_MAX_LUES / MENTIONS_PAR_PAGE, pages: 25, debut: 480, tronque: true });
  });

  it('la vue · filtres comptés et actifs, liens des pages, vide selon le filtre', () => {
    const v = vueMesMentions({ filtres: { lecture: 'toutes', type: 'tous', page: 1 }, comptes: c, lignes: [ligneMention({ id: u(1), genre: 'note', quand: 'q', lue: true }, null)] });
    expect(v.lecture.map((f) => [f.libelle, f.href, f.actif])).toEqual([['Toutes · 35', '/studio/mentions', true], ['Non lues · 5', '/studio/mentions?lecture=non-lues', false]]);
    expect(v.types.map((f) => f.libelle)).toEqual(['Tout · 35', 'Commentaires · 30', 'Notes · 5']);
    expect([v.page, v.pages, v.precedente, v.suivante, v.vide, v.tronque]).toEqual([1, 2, null, '/studio/mentions?page=2', null, null]);
    const p2 = vueMesMentions({ filtres: { lecture: 'toutes', type: 'tous', page: 7 }, comptes: c, lignes: [] });
    expect([p2.page, p2.precedente, p2.suivante]).toEqual([2, '/studio/mentions', null]);
    expect(vueMesMentions({ filtres: { lecture: 'toutes', type: 'tous', page: 1 }, comptes: COMPTES_VIDES, lignes: [] }).vide).toBe(TEXTES_MES_MENTIONS.vide);
    expect(vueMesMentions({ filtres: { lecture: 'non-lues', type: 'tous', page: 1 }, comptes: { ...c, commentaire: { toutes: 30, nonLues: 0 }, note: { toutes: 5, nonLues: 0 } }, lignes: [] }).vide).toBe(TEXTES_MES_MENTIONS.videNonLues);
    expect(vueMesMentions({ filtres: { lecture: 'toutes', type: 'notes', page: 1 }, comptes: { ...c, note: { toutes: 0, nonLues: 0 } }, lignes: [] }).vide).toBe(TEXTES_MES_MENTIONS.videType.notes);
    expect(vueMesMentions({ filtres: { lecture: 'toutes', type: 'tous', page: 1 }, comptes: { commentaire: { toutes: 600, nonLues: 0 }, note: COMPTES_VIDES.note }, lignes: [] }).tronque).toBe(TEXTES_MES_MENTIONS.tronque);
  });
});
