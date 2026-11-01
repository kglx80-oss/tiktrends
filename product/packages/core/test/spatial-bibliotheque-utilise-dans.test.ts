import { describe, expect, it } from 'vitest';
import {
  detailProjetCitant, rolesBibliothequeCites, utilisationsBibliotheque, vueUtiliseDans, PHRASES_UTILISE_DANS, PROJETS_APERCU_MAX, REFERENCES_LUES_MAX,
  type LigneProjetUtilisation,
} from '../src';

/**
 * Bibliothèque · « Utilisé dans » · règles pures. Les références du brief de
 * la version courante (`bib_<uuid>`) disent quels projets citent un fichier ·
 * rôles lus tels quels (libellés), illisibles ignorés, actifs avant archivés,
 * borne dite, rien n'est montré quand la lecture Studios n'est pas ouverte ou
 * que le fichier n'est pas un fichier de la bibliothèque.
 */

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ref = (uuid: string, role: string, extra: Record<string, unknown> = {}) => ({ assetId: `bib_${uuid}`, role, scope: 'global', ...extra });
const ligne = (id: string, references: unknown, extra: Partial<LigneProjetUtilisation> = {}): LigneProjetUtilisation =>
  ({ id, titre: `Projet ${id}`, marque: 'Marque A1', statut: 'active', references, ...extra });

describe('rolesBibliothequeCites · ce que le brief cite de la bibliothèque', () => {
  it('uuid (minuscules) → rôles en libellés, dédoublonnés, dans l’ordre du brief', () => {
    const m = rolesBibliothequeCites([ref(A.toUpperCase(), 'style'), ref(A, 'composition'), ref(A, 'style'), ref(B, 'logo')]);
    expect([...m]).toEqual([[A, ['Style', 'Composition']], [B, ['Logo']]]);
  });

  it('ignore ce qui n’est pas une référence lisible de la bibliothèque · autre préfixe, uuid invalide, rôle inconnu, forme illisible', () => {
    const m = rolesBibliothequeCites([
      { assetId: `prod_${A}`, role: 'style' }, { assetId: 'bib_pas-un-uuid', role: 'style' }, ref(A, 'inconnu'), null, 'bib_x', { role: 'style' },
    ]);
    expect(m.size).toBe(0);
    expect(rolesBibliothequeCites(null).size).toBe(0);
    expect(rolesBibliothequeCites({ assetId: `bib_${A}` }).size).toBe(0);
  });

  it(`borné aux ${REFERENCES_LUES_MAX} premières références`, () => {
    const refs = [...Array.from({ length: REFERENCES_LUES_MAX }, () => ref(A, 'style')), ref(B, 'style')];
    expect([...rolesBibliothequeCites(refs).keys()]).toEqual([A]);
  });
});

describe('utilisationsBibliotheque · fichier → projets qui le citent', () => {
  it('chaque fichier liste ses projets · lien vers « Produit et références », actifs d’abord puis archivés, doublon de projet compté une fois', () => {
    const u = utilisationsBibliotheque([
      ligne('p-archive', [ref(A, 'style')], { statut: 'archived' }),
      ligne('p1', [ref(A, 'composition'), ref(B, 'style')]),
      ligne('p2', [ref(B, 'logo')], { titre: '   ' }),
      ligne('p1', [ref(A, 'style')]),
    ], { borne: false });
    expect(u.parFichier[A]!.map((p) => [p.id, p.roles, p.archive, p.href])).toEqual([
      ['p1', ['Composition'], false, '/studio/projets/p1/produit'],
      ['p-archive', ['Style'], true, '/studio/projets/p-archive/produit'],
    ]);
    expect(u.parFichier[B]!.map((p) => [p.id, p.titre])).toEqual([['p1', 'Projet p1'], ['p2', 'Projet sans titre']]);
    expect(u.borne).toBe(false);
  });
});

describe('vueUtiliseDans · ce que l’aperçu montre', () => {
  const f = { id: A, lectureSeule: false };
  it('les projets qui le citent, sans phrase', () => {
    const v = vueUtiliseDans(utilisationsBibliotheque([ligne('p1', [ref(A, 'style')])], { borne: false }), f)!;
    expect([v.libelle, v.projets.map((p) => p.id), v.reste, v.phrase]).toEqual(['Utilisé dans', ['p1'], 0, null]);
    expect(detailProjetCitant(v.projets[0]!)).toBe('Marque A1 · Style');
  });

  it('aucun projet · la phrase le dit (et la borne quand elle est atteinte)', () => {
    const u = utilisationsBibliotheque([ligne('p1', [ref(B, 'style')])], { borne: false });
    expect(vueUtiliseDans(u, f)!.phrase).toBe(PHRASES_UTILISE_DANS.aucun);
    expect(vueUtiliseDans({ ...u, borne: true }, f)!.phrase).toBe(`${PHRASES_UTILISE_DANS.aucun} ${PHRASES_UTILISE_DANS.borne}`);
  });

  it(`au-delà de ${PROJETS_APERCU_MAX} projets · les plus récents montrés, le reste compté`, () => {
    const u = utilisationsBibliotheque(Array.from({ length: PROJETS_APERCU_MAX + 2 }, (_, i) => ligne(`p${i}`, [ref(A, 'style')])), { borne: false });
    const v = vueUtiliseDans(u, f)!;
    expect([v.projets.length, v.reste, v.phrase]).toEqual([PROJETS_APERCU_MAX, 2, 'Et 2 autres projets.']);
    expect(detailProjetCitant({ marque: 'M', roles: ['Style', 'Logo'], archive: true })).toBe('M · Style, Logo · archivé');
  });

  it('rien quand la lecture Studios n’est pas ouverte (null), ni pour une sortie Studios ou une ancienne création', () => {
    const u = utilisationsBibliotheque([ligne('p1', [ref(A, 'style')])], { borne: false });
    expect(vueUtiliseDans(null, f)).toBeNull();
    expect(vueUtiliseDans(u, { id: A, lectureSeule: true })).toBeNull();
  });
});
