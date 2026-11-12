import { describe, expect, it } from 'vitest';
import {
  CLE_PROVENANCE_COMMENTAIRE, LIBELLE_ITERER_COMMENTAIRE, LONGUEUR_MAX_HYPOTHESE_ITERATION, MAX_PERSONAS_LECTURE, NOTE_COPIE_SANS_LIEN, PROVENANCES_TEST,
  RAISON_COMMENTAIRE_AUTRE_MARQUE, RAISON_COMMENTAIRE_NON_GAGNANTE, VIDE_ITERATION_SANS_ADSMAP, LIENS_AUDIT_ENTRE_PROJETS,
  bilanProvenances, couloirsDepuisLignee, departDepuisCommentaire, detailsCopieDe, entreeJournal, estIdLignee, gesteIterationCommentaire, journalProjet,
  legendeLignee, lienIterationCommentaire, ligneeEnListe, lireCopieDe, lireDemandeProvenanceCommentaire, lireGesteCommentaire, lireProvenanceCommentaire,
  projeterLignee, provenanceCommentaireAdmise, provenanceDuTest, refProvenanceCommentaire, variableDepuisReponse, variablesIteration,
  type CommentairePourGeste, type DonneesVariantes, type EntreeLecturePersona, type EntreeLignee, type FaitJournal, type ParentIteration, type ProvenanceTest,
} from '../src';

/**
 * Du commentaire à l'itération, et la duplication dite partout · les règles
 * PURES. On vérifie un RÉSULTAT · le geste rendu (lien ou raison), le départ
 * de l'écran Itérer (hypothèse, variable seulement si sûre · la règle de
 * Jarvis rejouée, pas recopiée), la provenance posée ou non, le bilan à neuf
 * provenances sans seuil changé, la phrase du journal du projet source et les
 * liens de la lignée · rien d'inventé sans `copieDe`.
 */

const U = (n: number) => `a0a00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const K = U(1); const P = U(2); const AD = U(3); const AUTRE_AD = U(4);

/* ───────────────────────── l'adresse et le geste ───────────────────────── */

describe('« Itérer depuis ce commentaire » · l’adresse ne porte que deux identifiants, le geste dit pourquoi il est fermé', () => {
  it('l’adresse · commentaire et projet, relue à l’identique · un identifiant mal formé ou absent est un refus, rien n’est deviné', () => {
    const href = lienIterationCommentaire({ commentaireId: K, projetId: P })!;
    expect(href).toBe(`/studio/iterer?commentaire=${K}&projet=${P}`);
    expect(lireGesteCommentaire(Object.fromEntries(new URL(`http://x${href}`).searchParams))).toEqual({ etat: 'ok', commentaireId: K, projetId: P });
    expect(lireGesteCommentaire({})).toEqual({ etat: 'absente' });
    expect(lireGesteCommentaire({ commentaire: K })).toEqual({ etat: 'refus' });
    expect(lireGesteCommentaire({ commentaire: 'Change l’accroche', projet: P })).toEqual({ etat: 'refus' });
    expect(lienIterationCommentaire({ commentaireId: 'x', projetId: P })).toBeNull();
  });

  const gagnante = { adsmapAdId: AD, verdict: { validated: 'winner' as const, comparable: true } };
  const k = (o: Partial<CommentairePourGeste> = {}): CommentairePourGeste => ({ id: K, projetId: P, cible: 'creation', test: gagnante, ...o });
  const ouvert = { resultats: true, marqueActive: true };

  it('présent seulement sur une création testée · une version, une création sans test · aucun geste', () => {
    expect(gesteIterationCommentaire(k(), ouvert)).toEqual({ libelle: LIBELLE_ITERER_COMMENTAIRE, href: lienIterationCommentaire({ commentaireId: K, projetId: P }), raison: null });
    expect(gesteIterationCommentaire(k({ cible: 'version' }), ouvert)).toBeNull();
    expect(gesteIterationCommentaire(k({ test: null }), ouvert)).toBeNull();
  });

  it('fermé, sa raison écrite · Résultats fermé, autre marque active, pub non gagnante arbitrée (perdante, calculée seulement, hors protocole)', () => {
    expect(gesteIterationCommentaire(k(), { resultats: false, marqueActive: true })).toEqual({ libelle: LIBELLE_ITERER_COMMENTAIRE, href: null, raison: VIDE_ITERATION_SANS_ADSMAP });
    expect(gesteIterationCommentaire(k(), { resultats: true, marqueActive: false })?.raison).toBe(RAISON_COMMENTAIRE_AUTRE_MARQUE);
    for (const verdict of [{ validated: 'loser' as const, comparable: true }, { validated: null, comparable: true }, { validated: 'winner' as const, comparable: false }, null]) {
      expect(gesteIterationCommentaire(k({ test: { adsmapAdId: AD, verdict } }), ouvert), JSON.stringify(verdict)).toEqual({ libelle: LIBELLE_ITERER_COMMENTAIRE, href: null, raison: RAISON_COMMENTAIRE_NON_GAGNANTE });
    }
  });
});

/* ───────────────────────── le départ de l'écran Itérer ───────────────────────── */

const parent: ParentIteration = {
  adId: AD, verdict: 'winner', comparable: true, lignee: [],
  propositions: [{ variable: 'opening_visual', mode: 'more', freeze: ['offer'], stage: 'hook', edgeLegal: true }],
};
const choix = variablesIteration(parent);

describe('le départ · le texte en hypothèse, la variable SEULEMENT si le texte la désigne sûrement (règle de Jarvis, rejouée)', () => {
  it('« changer l’accroche » · l’accroche, admise · pré-cochée, et la note le dit', () => {
    const d = departDepuisCommentaire('Il faudrait changer l’accroche, elle est trop longue.', AD, choix);
    expect([d.adId, d.variable, d.hypothese]).toEqual([AD, 'hook', 'Il faudrait changer l’accroche, elle est trop longue.']);
    expect(d.note).toContain('Variable désignée par le commentaire · Accroche.');
    expect(d.note).toContain('Rien n’est créé sans ton clic sur « Créer l’itération ».');
  });

  it('rien de sûr · une remarque sans conseil, deux variables, une variable fermée (structurelle) · aucune variable, la raison dite', () => {
    const remarque = departDepuisCommentaire('L’accroche est trop longue sur cette création.', AD, choix);
    expect([remarque.variable, remarque.note.includes('ne désigne aucune variable sûrement')]).toEqual([null, true]);
    const deux = departDepuisCommentaire('Change l’accroche et la musique.', AD, choix);
    expect([deux.variable, deux.note.includes('plusieurs variables (Accroche, Son)')]).toEqual([null, true]);
    const fermee = departDepuisCommentaire('Teste un autre angle sur cette création.', AD, choix);
    expect([fermee.variable, fermee.note.includes('désigne angle, qui n’est pas admise pour cette pub')]).toEqual([null, true]);
    // Gelée par le plan (l'offre a gagné) · fermée.
    expect(departDepuisCommentaire('Teste une autre offre.', AD, choix).variable).toBeNull();
  });

  it('la règle est CELLE de Jarvis · même variable, même motif, sur un banc de textes (réutilisée, pas recopiée)', () => {
    for (const t of ['Change l’accroche.', 'Teste une vignette différente.', 'Garde l’accroche, change le bouton.', 'La V2 ajoute un témoignage.', 'Ajoute une preuve : avant et après.', 'Raccourcir la vidéo et changer la musique.', 'Rien à dire.']) {
      expect(departDepuisCommentaire(t, AD, choix).variable, t).toBe(variableDepuisReponse(t, choix).variable);
    }
  });

  it('une pub hors plan (choix absent) · le texte reste proposé, aucune variable · un commentaire trop long est coupé à la borne du champ, et c’est dit', () => {
    expect(departDepuisCommentaire('Change l’accroche.', AD, null)).toMatchObject({ variable: null, hypothese: 'Change l’accroche.' });
    const long = `Change l’accroche. ${'x'.repeat(1500)}`;
    const d = departDepuisCommentaire(long, AD, choix);
    expect([...d.hypothese].length).toBe(LONGUEUR_MAX_HYPOTHESE_ITERATION);
    expect(d.note).toContain(`il dépasse ${LONGUEUR_MAX_HYPOTHESE_ITERATION} caractères`);
    expect(d.variable).toBe('hook');
  });
});

/* ───────────────────────── la provenance « Commentaire » ───────────────────────── */

describe('la provenance « Commentaire » · posée seulement quand le commentaire relu désigne la pub de départ', () => {
  it('lue défensivement · identifiants seuls, jamais le texte · mal formée, rien', () => {
    const p = { commentaireId: K, projetId: P };
    expect(refProvenanceCommentaire(p)).toEqual({ [CLE_PROVENANCE_COMMENTAIRE]: p });
    expect(lireProvenanceCommentaire({ hypotheseLibre: null, ...refProvenanceCommentaire(p) })).toEqual(p);
    expect(lireDemandeProvenanceCommentaire({ commentaireId: 'Change l’accroche', projetId: P })).toBeNull();
    expect(lireDemandeProvenanceCommentaire({ commentaireId: K })).toBeNull();
    expect(lireProvenanceCommentaire(null)).toBeNull();
  });

  it('admise · la pub de la création commentée EST la pub de départ · sinon rien (hors portée, autre pub)', () => {
    const p = { commentaireId: K, projetId: P };
    expect(provenanceCommentaireAdmise(p, { adDuCommentaire: AD.toUpperCase(), parentAdId: AD })).toEqual(p);
    expect(provenanceCommentaireAdmise(p, { adDuCommentaire: AUTRE_AD, parentAdId: AD })).toBeNull();
    expect(provenanceCommentaireAdmise(p, { adDuCommentaire: null, parentAdId: AD })).toBeNull();
    expect(provenanceCommentaireAdmise(null, { adDuCommentaire: AD, parentAdId: AD })).toBeNull();
  });

  it('l’ordre de lecture · hypothèse libre, puis Jarvis, puis commentaire, puis itération ordinaire', () => {
    const c = { commentaireId: K, projetId: P };
    const j = { reponseId: U(9), contexte: { type: 'lot' as const, id: U(10) } };
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', commentaire: c })).toBe('commentaire');
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', jarvis: j, commentaire: c })).toBe('jarvis');
    expect(provenanceDuTest({ origine: { type: 'libre' }, typeAd: 'iteration', commentaire: c })).toBe('libre');
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', commentaire: null })).toBe('iteration');
  });
});

const entrees = (p: ProvenanceTest | null, k: number, n: number): EntreeLecturePersona[] =>
  Array.from({ length: n }, (_, i) => ({ persona: p ? { id: p, nom: PROVENANCES_TEST.find((x) => x.cle === p)!.libelle } : null, issue: i < k ? 'gagne' as const : 'perd' as const }));

describe('le bilan à dix provenances (lot 11 · « Note de la lignée » ajoutée) · « Commentaire » lue à sa place, AUCUN seuil changé', () => {
  it('dix provenances, « Commentaire » avant l’itération ordinaire · une provenance qui parle se lit sous son nom', () => {
    expect(PROVENANCES_TEST.map((p) => p.cle)).toEqual(['tag', 'veille', 'apprentissage', 'persona', 'offre', 'libre', 'jarvis', 'commentaire', 'note', 'iteration']);
    const b = bilanProvenances([...entrees('commentaire', 6, 6), ...entrees(null, 0, 10)]);
    expect(b.groupes.map((g) => [g.cle, g.libelle, g.lecture])).toEqual([['commentaire', 'Commentaire', 'au_dessus']]);
    expect(b.regle).toContain(`10 provenances, ${MAX_PERSONAS_LECTURE} lues au plus à la fois, silence au-delà`);
  });
  it('« Commentaire » sous l’effectif · les mêmes intervalles, au même niveau, que si elle n’avait pas de provenance (elle est dans le reste)', () => {
    const six = PROVENANCES_TEST.slice(0, 6).flatMap((p) => entrees(p.cle, p.cle === 'offre' ? 6 : 1, 6));
    const avec = bilanProvenances([...six, ...entrees('commentaire', 2, 3), ...entrees(null, 0, 4)]);
    const sans = bilanProvenances([...six, ...entrees(null, 2, 3), ...entrees(null, 0, 4)]);
    expect([avec.niveau, avec.reste]).toEqual([sans.niveau, sans.reste]);
    const lus = (b: typeof avec) => b.groupes.filter((g) => g.lecture !== 'effectif').map((g) => [g.cle, g.lecture, g.intervalle, g.reference]);
    expect(lus(avec), 'la provenance « Commentaire » sous l’effectif change la lecture des autres').toEqual(lus(sans));
    expect(avec.groupes.find((g) => g.cle === 'commentaire')?.lecture).toBe('effectif');
  });
  it('sept qui parlent (six + « Commentaire ») · au-delà du mesuré, le bilan se tait et le dit', () => {
    const b = bilanProvenances([...PROVENANCES_TEST.slice(0, 6).flatMap((p) => entrees(p.cle, 1, 6)), ...entrees('commentaire', 1, 6), ...entrees(null, 0, 4)]);
    expect([b.parle, b.niveau]).toEqual([false, null]);
    expect(b.phrase).toBe(`7 provenances ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée · le bilan se tait.`);
  });
});

/* ───────────────────────── la duplication · le journal du projet source ───────────────────────── */

describe('la duplication dite sur le projet SOURCE · seulement depuis `copieDe`, rien d’inventé', () => {
  const S = U(20); const V = U(21); const C = U(22);

  it('le lien · deux identifiants, relus défensivement · mal formé ou absent, rien', () => {
    expect(lireCopieDe(detailsCopieDe({ projectId: S, versionId: V }))).toEqual({ projectId: S, versionId: V });
    expect(lireCopieDe({ copieDe: { projectId: S } })).toBeNull();
    expect(lireCopieDe({ copieDe: { projectId: 'Crème', versionId: V } })).toBeNull();
    expect(lireCopieDe(null)).toBeNull();
    expect(LIENS_AUDIT_ENTRE_PROJETS.map((l) => [l.cle, l.action])).toEqual([['copieDe', 'project.create']]);
  });

  it('« Dupliqué en « … » » · la version copiée, le lien vers la copie · une copie illisible se dit sans titre ni lien', () => {
    const e = entreeJournal({ source: 'duplication', id: 'e1', le: '2026-11-09T10:00:00.000Z', acteur: 'Toi', copie: { id: C, titre: 'Copie de Crème' }, versionN: 2 }, { projectId: S });
    expect([e.type, e.phrase, e.detail, e.lien, e.versionN, e.acteur]).toEqual([
      'projet', 'Dupliqué en « Copie de Crème »', 'Depuis la version 2 · la copie reprend la structure, sans générations, exports, tests ni mesures',
      { href: `/studio/projets/${C}`, libelle: 'Ouvrir la copie' }, 2, 'Toi',
    ]);
    const x = entreeJournal({ source: 'duplication', id: 'e2', le: '2026-11-09T10:00:00.000Z', acteur: null, copie: null, versionN: null }, { projectId: S });
    expect([x.phrase, x.lien, x.acteur]).toEqual(['Projet dupliqué', null, 'Automatique']);
    expect(x.detail).toBe('la copie n’est pas lisible avec tes droits');
  });

  it('dans le journal · triée avec le reste, comptée dans « Projet »', () => {
    const faits: FaitJournal[] = [
      { source: 'version', id: V, le: '2026-11-08T10:00:00.000Z', acteur: 'Toi', versionN: 2, raison: 'Accroche' },
      { source: 'duplication', id: 'e1', le: '2026-11-09T10:00:00.000Z', acteur: 'Toi', copie: { id: C, titre: 'Copie de Crème' }, versionN: 2 },
    ];
    const j = journalProjet(faits, { projectId: S });
    expect(j.entrees.map((e) => e.phrase)).toEqual(['Dupliqué en « Copie de Crème »', 'Version 2 enregistrée']);
    expect(j.filtres).toEqual([{ cle: 'versions', libelle: 'Versions', n: 1 }, { cle: 'projet', libelle: 'Projet', n: 1 }]);
  });

  it('la copie · avec le lien, sa raison seule · d’avant le lien, elle dit que le projet source ne la mentionne pas', () => {
    const f = (details: unknown) => entreeJournal({
      source: 'audit', id: 'e', le: '2026-11-09T10:00:00.000Z', acteur: 'Toi', action: 'project.create', cible: { type: 'studio_project', id: C },
      versionApresId: U(23), versionN: 1, etatApres: null, raison: 'création', raisonVersion: 'Copie de « Crème » (version 2) · structure seule', details,
    }, { projectId: C }).detail;
    expect(f(detailsCopieDe({ projectId: S, versionId: V }))).toBe('Copie de « Crème » (version 2) · structure seule');
    expect(f(null)).toBe(`Copie de « Crème » (version 2) · structure seule · ${NOTE_COPIE_SANS_LIEN}`);
  });
});

/* ───────────────────────── la lignée · les projets frères ───────────────────────── */

function entree(freres?: EntreeLignee['freres']): EntreeLignee {
  const donnees: DonneesVariantes = {
    projet: { id: 'p1', titre: 'Crème', versionCouranteId: 'v2' },
    versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' }, { id: 'v2', n: 2, parentId: 'v1', creeLe: '2026-10-06' }],
    lots: [], variantes: [],
    adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] }, droits: { proposer: true }, relecture: { disponible: false, raison: null, coutMaxUsd: null },
  };
  return { projet: { id: 'p1', titre: 'Crème', marque: 'Neva' }, sources: [], briefs: {}, donnees, ...(freres ? { freres } : {}) };
}

describe('la lignée relie les projets frères · un lien seulement s’il existe en données, catégorie « Copie » déclarée dans la légende', () => {
  it('sans `copieDe` · aucun nœud de projet, aucun lien « Copie », la légende ne le dit pas', () => {
    const m = projeterLignee(entree());
    expect(m.noeuds.filter((n) => n.type === 'copie' || n.type === 'projet_source')).toEqual([]);
    expect(m.liens.filter((l) => l.categorie === 'copie')).toEqual([]);
    expect(legendeLignee(m).map((e) => e.categorie)).not.toContain('copie');
    expect(projeterLignee(entree({ source: null, copies: [] })).empreinte).toBe(m.empreinte);
  });

  it('le projet source · relié au brief racine · la copie · reliée au brief de la version copiée · la légende compte « Copie »', () => {
    const m = projeterLignee(entree({ source: { id: 'p0', titre: 'Crème mère', versionId: 'x' }, copies: [{ id: 'p2', titre: 'Copie de Crème', versionId: 'v2' }, { id: 'p3', titre: 'Copie ancienne', versionId: 'inconnue' }] }));
    const copies = m.liens.filter((l) => l.categorie === 'copie').map((l) => [l.de, l.vers, l.libelle]);
    expect(copies).toEqual([['brief:v1', 'projet-copie:p3', 'Copie'], ['brief:v2', 'projet-copie:p2', 'Copie'], ['projet-source:p0', 'brief:v1', 'Copie']]);
    const n = (id: string) => m.noeuds.find((x) => x.id === id)!;
    expect([n('projet-source:p0').titre, n('projet-source:p0').destination]).toEqual(['Projet source · Crème mère', '/studio/projets/p0']);
    expect([n('projet-copie:p2').titre, n('projet-copie:p2').resume, n('projet-copie:p2').destination]).toEqual(['Copie · Copie de Crème', 'Dupliqué depuis la version 2 de ce projet · la copie reprend la structure, sans générations, exports, tests ni mesures.', '/studio/projets/p2']);
    // Chaque lien va strictement vers la droite (DAG).
    for (const l of m.liens) expect(m.grille[l.de]!.colonne, `${l.de} > ${l.vers}`).toBeLessThan(m.grille[l.vers]!.colonne);
    expect(legendeLignee(m).find((e) => e.categorie === 'copie')).toMatchObject({ libelle: 'Copie', nombre: 3, trait: 'tirets longs' });
    expect(['projet-source:p0', 'projet-copie:p2'].every(estIdLignee)).toBe(true);
    // Les couloirs · la source au Contexte, la copie à l'Itération · avec leur écran.
    const couloirs = couloirsDepuisLignee(m, { versionVue: 'v2' });
    expect(couloirs.find((c) => c.cle === 'contexte')!.noeuds.find((x) => x.id === 'projet-source:p0')).toMatchObject({ etiquette: 'PROJET SOURCE', titre: 'Crème mère', lien: { href: '/studio/projets/p0', libelle: 'Ouvrir le projet source' } });
    expect(couloirs.find((c) => c.cle === 'iteration')!.noeuds.find((x) => x.id === 'projet-copie:p2')).toMatchObject({ etiquette: 'COPIE', lien: { href: '/studio/projets/p2', libelle: 'Ouvrir la copie' } });
    // En liste · dit dans les deux sens, catégorie en toutes lettres.
    const liste = ligneeEnListe(m, []);
    expect(liste.find((x) => x.id === 'projet-copie:p2')!.vientDe).toEqual([{ id: 'brief:v2', titre: 'Brief · version 2', categorie: 'Copie' }]);
  });

  it('le projet lui-même n’est jamais son propre frère · rien d’inventé', () => {
    const m = projeterLignee(entree({ source: { id: 'p1', titre: 'Crème', versionId: 'v1' }, copies: [{ id: 'p1', titre: 'Crème', versionId: 'v1' }] }));
    expect(m.liens.filter((l) => l.categorie === 'copie')).toEqual([]);
  });
});
