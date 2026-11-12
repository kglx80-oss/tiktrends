import { describe, expect, it } from 'vitest';
import {
  CLE_PROVENANCE_NOTE, ERREUR_TOLEREE_BILAN, LIBELLE_HYPOTHESE_NOTE, LIBELLE_ITERER_COMMENTAIRE, LIBELLE_ITERER_NOTE, LONGUEUR_PARTIE_MAX, MAX_PERSONAS_LECTURE,
  MIN_REFERENCE_PERSONA, MIN_VERDICTS_PERSONA, NIVEAU_BILAN_PROVENANCE, NIVEAU_BILAN_PROVENANCE_VOLUME, NOTE_NOTE_PROVENANCE, PROVENANCES_TEST,
  RAISON_COMMENTAIRE_AUTRE_MARQUE, RAISON_COMMENTAIRE_NON_GAGNANTE, RAISON_NOTE_AUTRE_MARQUE, RAISON_NOTE_NON_GAGNANTE, REFUS_GESTE_NOTE, REFUS_HYPOTHESE_NOTE,
  RESTE_MAX_BILAN, RESTE_MAX_NIVEAU_BILAN, TEXTES_FIL_ITERATION, VIDE_ITERATION_SANS_ADSMAP,
  bilanProvenances, departDepuisCommentaire, departDepuisFil, departHypotheseDepuisNote, gesteHypotheseNote, gesteIterationCommentaire, gesteIterationNote,
  lienHypotheseNote, lienIterationCommentaire, lienIterationFil, libelleOrigine, lireDemandeProvenanceNote, lireGesteCommentaire, lireGesteFil,
  lireGesteHypotheseNote, lireOrigineHypothese, lireProvenanceNote, noeudDeGeste, provenanceCarte, provenanceDuTest, provenanceNoteAdmise,
  provenanceNoteHypotheseAdmise, refOrigineHypothese, refProvenanceNote, sansTiretCadratin, variableDepuisReponse, variablesIteration,
  type EntreeLecturePersona, type NotePourGeste, type ParentIteration, type ProvenanceTest,
} from '../src';

/**
 * Lot 11 V5 · des NOTES de la lignée à l'hypothèse et à l'itération · les
 * règles PURES. On vérifie un RÉSULTAT · le geste rendu (lien ou raison) selon
 * le TYPE du nœud, l'adresse (deux identifiants, jamais le texte), le départ
 * de l'écran Itérer (la règle du commentaire, écrite UNE fois pour les deux
 * fils · le commentaire garde ses phrases à l'identique), le départ du
 * formulaire d'hypothèse (énoncé proposé, note citée, variable seulement si
 * sûre), la provenance « Note de la lignée » posée ou non, et le bilan à dix
 * provenances SANS aucun seuil changé.
 */

const U = (n: number) => `b0b00000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const NOTE = U(1); const P = U(2); const AD = U(3); const AUTRE_AD = U(4); const VAR = U(5); const VER = U(6);

/* ───────────────────────── quel nœud propose quoi ───────────────────────── */

describe('le type du nœud dit le geste · création / résultat → Itérer, brief / hypothèse → hypothèse, rien ailleurs', () => {
  it('lu sur la clé stable · tout autre nœud, un lien, une clé mal formée · aucun geste', () => {
    expect(noeudDeGeste(`creation:${VAR}`)).toEqual({ geste: 'iterer', type: 'creation', varianteId: VAR });
    expect(noeudDeGeste(`resultat:${VAR.toUpperCase()}`)).toEqual({ geste: 'iterer', type: 'resultat', varianteId: VAR });
    expect(noeudDeGeste(`brief:${VER}`)).toEqual({ geste: 'hypothese', type: 'brief', versionId: VER });
    expect(noeudDeGeste(`hypothese:${VER}`)).toEqual({ geste: 'hypothese', type: 'hypothese', versionId: VER });
    for (const k of ['marque', `direction:${VER}`, `groupe:${VAR}`, `apprentissage:${VAR}`, `iteration:${VER}`, `reference:${VAR}`, `projet-copie:${P}`,
      `creation:${VAR}>resultat:${VAR}`, 'creation:pas-un-uuid', ` creation:${VAR}`, null, 42]) {
      expect(noeudDeGeste(k), String(k)).toBeNull();
    }
  });
});

/* ───────────────────────── « Itérer depuis cette note » ───────────────────────── */

const gagnante = { adsmapAdId: AD, verdict: { validated: 'winner' as const, comparable: true } };
const ouvert = { resultats: true, marqueActive: true };
const n = (o: Partial<NotePourGeste> = {}): NotePourGeste => ({ id: NOTE, projetId: P, noeud: `creation:${VAR}`, test: gagnante, ...o });

describe('« Itérer depuis cette note » · la règle de « Itérer depuis ce commentaire », réutilisée', () => {
  it('l’adresse · la note et son projet, jamais le texte · relue à l’identique · un identifiant mal formé est un refus', () => {
    const href = lienIterationFil('note', { id: NOTE, projetId: P })!;
    expect(href).toBe(`/studio/iterer?note=${NOTE}&projet=${P}`);
    expect(lireGesteFil(Object.fromEntries(new URL(`http://x${href}`).searchParams))).toEqual({ etat: 'ok', fil: 'note', id: NOTE, projetId: P });
    expect(lireGesteFil({})).toEqual({ etat: 'absente' });
    expect(lireGesteFil({ note: NOTE })).toEqual({ etat: 'refus', fil: 'note' });
    expect(lireGesteFil({ note: 'Change l’accroche', projet: P })).toEqual({ etat: 'refus', fil: 'note' });
    // Deux sources à la fois · refus (une seule source de pré-choix).
    expect(lireGesteFil({ note: NOTE, commentaire: U(9), projet: P })).toEqual({ etat: 'refus', fil: 'commentaire' });
    expect(lienIterationFil('note', { id: 'x', projetId: P })).toBeNull();
  });

  it('le commentaire garde EXACTEMENT son adresse et sa lecture · une note dans l’adresse ne le concerne pas', () => {
    expect(lienIterationCommentaire({ commentaireId: U(9), projetId: P })).toBe(`/studio/iterer?commentaire=${U(9)}&projet=${P}`);
    expect(lireGesteCommentaire({ commentaire: U(9), projet: P })).toEqual({ etat: 'ok', commentaireId: U(9), projetId: P });
    expect(lireGesteCommentaire({ note: NOTE, projet: P })).toEqual({ etat: 'absente' });
    expect(lireGesteFil({ commentaire: U(9), projet: P })).toEqual({ etat: 'ok', fil: 'commentaire', id: U(9), projetId: P });
  });

  it('présent seulement sur une création ou un résultat TESTÉ · une création sans test, un brief, un lot · aucun geste', () => {
    const attendu = { libelle: LIBELLE_ITERER_NOTE, href: `/studio/iterer?note=${NOTE}&projet=${P}`, raison: null };
    expect(gesteIterationNote(n(), ouvert)).toEqual(attendu);
    expect(gesteIterationNote(n({ noeud: `resultat:${VAR}` }), ouvert)).toEqual(attendu);
    expect(gesteIterationNote(n({ test: null }), ouvert)).toBeNull();
    for (const noeud of [`brief:${VER}`, `hypothese:${VER}`, `groupe:${VAR}`, 'marque']) expect(gesteIterationNote(n({ noeud }), ouvert), noeud).toBeNull();
  });

  it('fermé, sa raison écrite · Résultats fermé, autre marque active, pub non gagnante · la même décision que le commentaire, cas par cas', () => {
    expect(gesteIterationNote(n(), { resultats: false, marqueActive: true })).toEqual({ libelle: LIBELLE_ITERER_NOTE, href: null, raison: VIDE_ITERATION_SANS_ADSMAP });
    expect(gesteIterationNote(n(), { resultats: true, marqueActive: false })?.raison).toBe(RAISON_NOTE_AUTRE_MARQUE);
    const phrase = { [RAISON_COMMENTAIRE_AUTRE_MARQUE]: RAISON_NOTE_AUTRE_MARQUE, [RAISON_COMMENTAIRE_NON_GAGNANTE]: RAISON_NOTE_NON_GAGNANTE, [VIDE_ITERATION_SANS_ADSMAP]: VIDE_ITERATION_SANS_ADSMAP } as Record<string, string>;
    for (const verdict of [{ validated: 'winner' as const, comparable: true }, { validated: 'loser' as const, comparable: true }, { validated: null, comparable: true }, { validated: 'winner' as const, comparable: false }, null]) {
      for (const o of [ouvert, { resultats: false, marqueActive: true }, { resultats: true, marqueActive: false }]) {
        const test = { adsmapAdId: AD, verdict };
        const k = gesteIterationCommentaire({ id: NOTE, projetId: P, cible: 'creation', test }, o)!;
        const g = gesteIterationNote(n({ test }), o)!;
        expect([g.href, g.raison], JSON.stringify([verdict, o])).toEqual([k.href?.replace('commentaire=', 'note=') ?? null, k.raison ? phrase[k.raison] : null]);
        expect(k.libelle).toBe(LIBELLE_ITERER_COMMENTAIRE);
      }
    }
  });
});

/* ───────────────────────── le départ de l'écran Itérer ───────────────────────── */

const parent: ParentIteration = {
  adId: AD, verdict: 'winner', comparable: true, lignee: [],
  propositions: [{ variable: 'opening_visual', mode: 'more', freeze: ['offer'], stage: 'hook', edgeLegal: true }],
};
const choix = variablesIteration(parent);

describe('le départ depuis une note · la règle du commentaire, seules les phrases du fil changent', () => {
  it('une note qui désigne sûrement une variable admise · pré-cochée, et la phrase le dit « par la note »', () => {
    const d = departDepuisFil('note', 'Il faudrait changer l’accroche, elle est trop longue.', AD, choix);
    expect([d.adId, d.variable, d.hypothese]).toEqual([AD, 'hook', 'Il faudrait changer l’accroche, elle est trop longue.']);
    expect(d.note).toBe('Le texte de la note est proposé comme hypothèse, modifiable. Variable désignée par la note · Accroche. Rien n’est créé sans ton clic sur « Créer l’itération ».');
  });

  it('rien de sûr · aucune variable, la raison dite pour la note · même variable que le commentaire et que Jarvis sur un banc de textes', () => {
    expect(departDepuisFil('note', 'L’accroche est trop longue sur cette création.', AD, choix).note).toContain('La note ne désigne aucune variable sûrement');
    expect(departDepuisFil('note', 'Change l’accroche et la musique.', AD, choix).note).toContain('La note évoque plusieurs variables (Accroche, Son)');
    for (const t of ['Change l’accroche.', 'Teste une vignette différente.', 'Garde l’accroche, change le bouton.', 'Teste un autre angle.', 'Rien à dire.']) {
      expect(departDepuisFil('note', t, AD, choix).variable, t).toBe(departDepuisCommentaire(t, AD, choix).variable);
      expect(departDepuisFil('note', t, AD, choix).variable, t).toBe(variableDepuisReponse(t, choix).variable);
    }
  });

  it('le commentaire garde ses phrases à l’identique (`departDepuisCommentaire` = `departDepuisFil(\'commentaire\')`)', () => {
    expect(departDepuisCommentaire('Il faudrait changer l’accroche.', AD, choix).note).toBe('Le texte du commentaire est proposé comme hypothèse, modifiable. Variable désignée par le commentaire · Accroche. Rien n’est créé sans ton clic sur « Créer l’itération ».');
    expect(departDepuisCommentaire('Rien à dire.', AD, choix)).toEqual(departDepuisFil('commentaire', 'Rien à dire.', AD, choix));
    expect(TEXTES_FIL_ITERATION.commentaire.libelle).toBe('Itérer depuis ce commentaire');
  });
});

/* ───────────────────────── « Formuler une hypothèse » ───────────────────────── */

describe('« Formuler une hypothèse » · sur un nœud brief ou hypothèse · le formulaire existant, pré-rempli, la note citée', () => {
  it('l’adresse · la note et son projet, jamais le texte · relue · mal formée, refus', () => {
    const href = lienHypotheseNote({ noteId: NOTE, projetId: P })!;
    expect(href).toBe(`/adsmap/hypotheses?note=${NOTE}&projet=${P}`);
    expect(lireGesteHypotheseNote(Object.fromEntries(new URL(`http://x${href}`).searchParams))).toEqual({ etat: 'ok', noteId: NOTE, projetId: P });
    expect(lireGesteHypotheseNote({})).toEqual({ etat: 'absente' });
    expect(lireGesteHypotheseNote({ note: NOTE })).toEqual({ etat: 'refus' });
    expect(lireGesteHypotheseNote({ note: 'Si on…', projet: P })).toEqual({ etat: 'refus' });
    expect(lienHypotheseNote({ noteId: NOTE, projetId: 'x' })).toBeNull();
  });

  it('présent seulement sur un brief ou une hypothèse · fermé avec la raison de la porte des hypothèses (formule, rôle, marque active)', () => {
    const ok = { adsmap: 'ok' as const, marqueActive: true };
    for (const noeud of [`brief:${VER}`, `hypothese:${VER}`]) {
      expect(gesteHypotheseNote({ id: NOTE, projetId: P, noeud }, ok)).toEqual({ libelle: LIBELLE_HYPOTHESE_NOTE, href: `/adsmap/hypotheses?note=${NOTE}&projet=${P}`, raison: null });
    }
    for (const noeud of [`creation:${VAR}`, `resultat:${VAR}`, `direction:${VER}`, 'marque']) expect(gesteHypotheseNote({ id: NOTE, projetId: P, noeud }, ok), noeud).toBeNull();
    const h = (o: { adsmap: 'ok' | 'plan' | 'role'; marqueActive: boolean }) => gesteHypotheseNote({ id: NOTE, projetId: P, noeud: `brief:${VER}` }, o);
    expect(h({ adsmap: 'plan', marqueActive: true })).toEqual({ libelle: LIBELLE_HYPOTHESE_NOTE, href: null, raison: 'Les hypothèses vivent dans Adsmap, ouvert à partir de l’offre Plus.' });
    expect(h({ adsmap: 'role', marqueActive: true })?.raison).toBe('Ton rôle ne permet pas d’écrire dans Adsmap.');
    expect(h({ adsmap: 'ok', marqueActive: false })?.raison).toBe('Une hypothèse se range dans la marque active · ouvre d’abord cette marque.');
  });

  it('le départ · le texte de la note dans le « Si… », la note citée, rien d’enregistré · sans variable sûre, aucune', () => {
    const d = departHypotheseDepuisNote('L’hypothèse est trop large, à resserrer avant le prochain lot', { auteur: 'Zoé', noeud: 'Hypothèse · version 1' });
    expect(d.depart).toEqual({ parties: { si: 'L’hypothèse est trop large, à resserrer avant le prochain lot', alors: '', parceQue: '' }, variable: null });
    expect(d.note).toBe('Source · la note de Zoé sur « Hypothèse · version 1 » · « L’hypothèse est trop large, à resserrer avant le prochain lot ». Son texte est proposé dans le « Si… », modifiable. La note ne désigne aucune variable sûrement · choisis-la. Rien n’est enregistré sans ton clic sur « Ranger dans « À formuler » ».');
    expect(departHypotheseDepuisNote('Change l’accroche.', { auteur: null, noeud: 'Brief · version 2' }).note).toMatch(/^Source · ta note sur « Brief · version 2 »/);
  });

  it('une note déjà écrite « Si…, alors…, parce que… » est reprise partie par partie · une variable SÛRE est choisie, deux ne le sont pas', () => {
    const d = departHypotheseDepuisNote('Si on change l’accroche, alors le coût par achat baisse, parce que la V2 a gagné.', { auteur: 'Zoé', noeud: 'Brief · version 1' });
    expect(d.depart).toEqual({ parties: { si: 'on change l’accroche', alors: 'le coût par achat baisse', parceQue: 'la V2 a gagné' }, variable: 'hook' });
    expect(d.note).toContain('Sa phrase « Si…, alors…, parce que… » est reprise, modifiable. Variable désignée par la note · Accroche.');
    const deux = departHypotheseDepuisNote('Change l’accroche et la musique.', { auteur: 'Zoé', noeud: 'Brief · version 1' });
    expect([deux.depart.variable, deux.note.includes('La note évoque plusieurs variables (Accroche, Son) · aucune n’est choisie')]).toEqual([null, true]);
  });

  it('une note longue · chaque partie bornée au champ du formulaire, la citation au début, et c’est dit', () => {
    const long = `Change l’accroche ${'x'.repeat(1200)}`;
    const d = departHypotheseDepuisNote(long, { auteur: 'Zoé', noeud: 'Brief · version 1' });
    expect([...d.depart.parties.si].length).toBe(LONGUEUR_PARTIE_MAX);
    expect(d.note).toContain(`seul le début de chaque partie (${LONGUEUR_PARTIE_MAX} caractères) est repris, relis-le`);
    expect(d.note).toContain('…».'.replace('»', ' »'));
  });
});

/* ───────────────────────── la provenance « Note de la lignée » ───────────────────────── */

describe('la provenance « Note de la lignée » · posée seulement quand la note relue désigne la pub de départ (itération) ou est bien elle (hypothèse)', () => {
  it('lue défensivement · identifiants seuls, jamais le texte · mal formée, rien', () => {
    const p = { noteId: NOTE, projetId: P };
    expect(refProvenanceNote(p)).toEqual({ [CLE_PROVENANCE_NOTE]: p });
    expect(lireProvenanceNote({ commentaire: null, ...refProvenanceNote(p) })).toEqual(p);
    expect(lireDemandeProvenanceNote({ noteId: 'Change l’accroche', projetId: P })).toBeNull();
    expect(lireDemandeProvenanceNote({ noteId: NOTE })).toBeNull();
    expect(lireProvenanceNote(null)).toBeNull();
  });

  it('itération · admise quand la pub de test du nœud EST la pub de départ · sinon rien', () => {
    const p = { noteId: NOTE, projetId: P };
    expect(provenanceNoteAdmise(p, { adDeLaNote: AD.toUpperCase(), parentAdId: AD })).toEqual(p);
    expect(provenanceNoteAdmise(p, { adDeLaNote: AUTRE_AD, parentAdId: AD })).toBeNull();
    expect(provenanceNoteAdmise(p, { adDeLaNote: null, parentAdId: AD })).toBeNull();
    expect(provenanceNoteAdmise(null, { adDeLaNote: AD, parentAdId: AD })).toBeNull();
  });

  it('hypothèse · « Note de la lignée » si la note relue est la note demandée · sinon « À la main »', () => {
    const p = { noteId: NOTE, projetId: P };
    const o = provenanceNoteHypotheseAdmise(p, { noteId: NOTE, projetId: P, noeud: 'Hypothèse · version 1' });
    expect(o).toEqual({ type: 'note', noeud: 'Hypothèse · version 1', noteId: NOTE, projetId: P });
    expect(provenanceNoteHypotheseAdmise(p, null)).toEqual({ type: 'libre' });
    expect(provenanceNoteHypotheseAdmise(p, { noteId: U(8), projetId: P, noeud: 'x' })).toEqual({ type: 'libre' });
    expect(provenanceNoteHypotheseAdmise(p, { noteId: NOTE, projetId: U(8), noeud: 'x' })).toEqual({ type: 'libre' });
    expect(provenanceNoteHypotheseAdmise(null, { noteId: NOTE, projetId: P, noeud: 'x' })).toEqual({ type: 'libre' });
    // Gardée sur l'ad et relue · libellé de carte et lien vers la lignée du projet.
    expect(lireOrigineHypothese(refOrigineHypothese(o))).toEqual(o);
    expect(libelleOrigine(o)).toBe('Note de la lignée · Hypothèse · version 1');
    expect(provenanceCarte(o)).toEqual({ libelle: 'Note de la lignée · Hypothèse · version 1', href: `/studio/projets/${P}?disposition=libre&graphe=lignee`, lien: 'Voir la lignée du projet' });
  });

  it('l’ordre de lecture · hypothèse libre (une note d’hypothèse comprise), Jarvis, commentaire, note, itération ordinaire', () => {
    const note = { noteId: NOTE, projetId: P };
    const c = { commentaireId: U(9), projetId: P };
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', note })).toBe('note');
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', commentaire: c, note })).toBe('commentaire');
    expect(provenanceDuTest({ origine: { type: 'note', noeud: 'Brief · version 1', noteId: NOTE, projetId: P }, typeAd: 'ideation' })).toBe('note');
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', note: null })).toBe('iteration');
  });
});

/* ───────────────────────── le bilan · dix provenances, aucun seuil changé ───────────────────────── */

const entrees = (p: ProvenanceTest | null, k: number, k2: number): EntreeLecturePersona[] =>
  Array.from({ length: k2 }, (_, i) => ({ persona: p ? { id: p, nom: PROVENANCES_TEST.find((x) => x.cle === p)!.libelle } : null, issue: i < k ? 'gagne' as const : 'perd' as const }));

describe('le bilan à dix provenances · « Note de la lignée » lue à sa place, AUCUN seuil changé', () => {
  it('les seuils mesurés sont ceux d’avant, à l’identique', () => {
    expect([MAX_PERSONAS_LECTURE, MIN_VERDICTS_PERSONA, MIN_REFERENCE_PERSONA, NIVEAU_BILAN_PROVENANCE, NIVEAU_BILAN_PROVENANCE_VOLUME, RESTE_MAX_NIVEAU_BILAN, RESTE_MAX_BILAN, ERREUR_TOLEREE_BILAN])
      .toEqual([6, 4, 4, 0.975, 0.99, 80, 160, 0.15]);
  });

  it('« Note de la lignée » après « Commentaire », avant l’itération ordinaire · quand elle parle, sous son nom', () => {
    expect(PROVENANCES_TEST.map((p) => p.cle)).toEqual(['tag', 'veille', 'apprentissage', 'persona', 'offre', 'libre', 'jarvis', 'commentaire', 'note', 'iteration']);
    const b = bilanProvenances([...entrees('note', 6, 6), ...entrees(null, 0, 10)]);
    expect(b.groupes.map((g) => [g.cle, g.libelle, g.lecture])).toEqual([['note', 'Note de la lignée', 'au_dessus']]);
    expect(b.regle).toContain(`10 provenances, ${MAX_PERSONAS_LECTURE} lues au plus à la fois, silence au-delà`);
  });

  it('« Note de la lignée » sous l’effectif · les mêmes intervalles, au même niveau, que sans provenance (elle est dans le reste)', () => {
    const six = PROVENANCES_TEST.slice(0, 6).flatMap((p) => entrees(p.cle, p.cle === 'offre' ? 6 : 1, 6));
    const avec = bilanProvenances([...six, ...entrees('note', 2, 3), ...entrees(null, 0, 4)]);
    const sans = bilanProvenances([...six, ...entrees(null, 2, 3), ...entrees(null, 0, 4)]);
    expect([avec.niveau, avec.reste]).toEqual([sans.niveau, sans.reste]);
    const lus = (b: typeof avec) => b.groupes.filter((g) => g.lecture !== 'effectif').map((g) => [g.cle, g.lecture, g.intervalle, g.reference]);
    expect(lus(avec)).toEqual(lus(sans));
    expect(avec.groupes.find((g) => g.cle === 'note')?.lecture).toBe('effectif');
  });

  it('sept qui parlent (six + « Note de la lignée ») · au-delà du mesuré, le bilan se tait et le dit', () => {
    const b = bilanProvenances([...PROVENANCES_TEST.slice(0, 6).flatMap((p) => entrees(p.cle, 1, 6)), ...entrees('note', 1, 6), ...entrees(null, 0, 4)]);
    expect([b.parle, b.niveau]).toEqual([false, null]);
    expect(b.phrase).toBe(`7 provenances ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée · le bilan se tait.`);
  });
});

describe('les phrases · sans tiret cadratin', () => {
  it('toutes', () => {
    const d = departHypotheseDepuisNote('Change l’accroche.', { auteur: 'Zoé', noeud: 'Brief · version 1' });
    for (const t of [LIBELLE_ITERER_NOTE, LIBELLE_HYPOTHESE_NOTE, REFUS_GESTE_NOTE, REFUS_HYPOTHESE_NOTE, RAISON_NOTE_AUTRE_MARQUE, RAISON_NOTE_NON_GAGNANTE, NOTE_NOTE_PROVENANCE, d.note,
      departDepuisFil('note', 'Change l’accroche.', AD, choix).note, ...Object.values(TEXTES_FIL_ITERATION.note)]) {
      expect(sansTiretCadratin(t), t).toBe(t);
    }
  });
});
