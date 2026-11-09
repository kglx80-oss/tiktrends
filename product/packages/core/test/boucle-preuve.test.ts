import { describe, it, expect } from 'vitest';
import {
  ERREUR_TOLEREE_BILAN, MIN_REFERENCE_PERSONA, MIN_VERDICTS_PERSONA, NIVEAU_BILAN_PROVENANCE, NIVEAU_BILAN_PROVENANCE_VOLUME, NOTE_GESTES_SILENCE,
  PROVENANCES_TEST, RAISON_ITERER_SANS_GAGNANTE, RESTE_MAX_BILAN, RESTE_MAX_NIVEAU_BILAN,
  bilanProvenances, cartesHypotheses, conclusionLot, entreesBilanProvenances, etatLotSpatial, gestesPersonaLot, lecturePersonas,
  niveauBilanProvenances, provenanceCarte, provenanceDuTest, referenceConclusion, regleBilanProvenances, resultatHypothese, wilsonInterval,
  type EntreeLecturePersona, type FaitsAdSpatial, type FaitsLotSpatial, type LectureConclusion, type OrigineHypotheseLibre, type ProvenanceTest,
} from '../src';

/**
 * Boucler la preuve · les RÈGLES, en pur.
 *  · le résultat d'une hypothèse est CALCULÉ depuis la conclusion du lot qui la
 *    teste · rien avant que le lot soit conclu · confirmée, infirmée, sans
 *    conclusion, chacune avec son chiffre et le lien vers le lot ;
 *  · la provenance rappelée sur la carte, avec le lien vers sa source ;
 *  · le bilan par provenance · muet sous le seuil, présent au-dessus avec ses
 *    deux intervalles, plus strict que la lecture par persona · et ses seuils
 *    MESURÉS, recalculés ici (l'erreur de famille exacte tombe si on les relâche) ;
 *  · les gestes P06 · seulement pour un persona qui se détache.
 */

const ad = (id: string, v: 'winner' | 'loser' | null, o: Partial<FaitsAdSpatial> & { arbitre?: boolean } = {}): FaitsAdSpatial => {
  const { arbitre = true, ...reste } = o;
  return {
    id, variante: id, statut: 'done', hypothese: 'Si on teste, alors ça baisse, parce que.', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
    verdict: v ? { calcule: v, retenu: arbitre ? v : null, statut: arbitre ? 'validated' : 'computed', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null,
    ...reste,
  };
};
const lot = (id: string, numero: number, ads: FaitsAdSpatial[], o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({ id, numero, but: null, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null, ...o });
const CTX = { maintenant: new Date('2026-11-09T00:00:00Z'), fenetreJours: 14 };
const TAG: OrigineHypotheseLibre = { type: 'tag', tag: 'Hook UGC', cle: 'hook ugc', savedAdIds: [], total: 3 };

/** Le lot testé et sa référence (les autres lots), puis la conclusion telle que la page la calcule. */
function conclure(cible: FaitsLotSpatial, autres: FaitsLotSpatial[]): { etat: ReturnType<typeof etatLotSpatial>; c: LectureConclusion } {
  const lots = [cible, ...autres];
  const etat = etatLotSpatial(cible, CTX);
  return { etat, c: conclusionLot(cible, etat, referenceConclusion(lots, cible.id)) };
}
const REF = [lot('r', 1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x, i) => ad(`r${x}`, i === 0 ? 'winner' : 'loser')))];

describe('le résultat d’une hypothèse · calculé depuis la conclusion du lot qui la teste', () => {
  it('avant que le lot soit conclu (à conclure, en diffusion) · aucun résultat, la carte reste « En test »', () => {
    const l = lot('l', 3, ['1', '2', '3', '4'].map((x) => ad(`a${x}`, 'winner', { arbitre: false })));
    const { etat, c } = conclure(l, REF);
    expect(etat).toBe('a_conclure');
    expect(resultatHypothese({ id: 'l', numero: 3, etat }, c), 'aucun résultat avant la conclusion du lot').toBeNull();
    const [carte] = cartesHypotheses([{ ad: l.ads[0]!, concept: 'C', bande: null, origine: TAG, lot: { id: 'l', numero: 3, etat, jour: null, conclusion: c } }], []);
    expect([carte!.colonne, carte!.resultat ?? null], 'aucun résultat avant la conclusion du lot').toEqual(['test', null]);
    const enDiffusion = lot('d', 4, [ad('d1', null)], { lanceLe: '2026-11-05T00:00:00Z' });
    expect(resultatHypothese({ id: 'd', numero: 4, etat: etatLotSpatial(enDiffusion, CTX) }, conclure(enDiffusion, REF).c)).toBeNull();
  });

  it('conclu · 4 gagnantes sur 4 contre 1 sur 8 · « Confirmée », le chiffre clé et le lien vers le lot', () => {
    const l = lot('l', 3, ['1', '2', '3', '4'].map((x) => ad(`a${x}`, 'winner')));
    const { etat, c } = conclure(l, REF);
    expect([etat, c.conclusion]).toEqual(['conclu', 'confirmee']);
    const r = resultatHypothese({ id: 'l', numero: 3, etat }, c)!;
    expect(r).toMatchObject({ statut: 'confirmee', libelle: 'Confirmée', classe: 'g', lot: { numero: 3, href: '/adsmap/lots/l' } });
    expect(r.chiffre).toMatch(/^4 gagnantes sur 4 variantes tranchées \(\d+ % à 100 %\) · la marque, 1 sur 8 dans ses autres lots \(\d+ % à \d+ %\)$/);
  });

  it('conclu · 0 gagnante sur 4 contre 7 sur 8 · « Infirmée »', () => {
    const ref = [lot('r', 1, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x, i) => ad(`r${x}`, i === 0 ? 'loser' : 'winner')))];
    const l = lot('l', 3, ['1', '2', '3', '4'].map((x) => ad(`a${x}`, 'loser')));
    const { etat, c } = conclure(l, ref);
    expect(resultatHypothese({ id: 'l', numero: 3, etat }, c)).toMatchObject({ statut: 'infirmee', libelle: 'Infirmée', classe: 'r' });
  });

  it('conclu sous l’effectif, ou dans le bruit, ou historique importé · « Sans conclusion », la raison en chiffre', () => {
    const petit = lot('p', 5, [ad('p1', 'winner'), ad('p2', 'loser')]);
    const a = conclure(petit, REF);
    expect(resultatHypothese({ id: 'p', numero: 5, etat: a.etat }, a.c)).toMatchObject({
      statut: 'sans_conclusion', libelle: 'Sans conclusion', classe: '',
      chiffre: `2 variantes tranchées au protocole · il en faut 4 pour qu’un lot ait le droit de conclure`,
    });
    const bruit = lot('b', 6, [ad('b1', 'winner'), ad('b2', 'loser'), ad('b3', 'loser'), ad('b4', 'loser')]);
    const b = conclure(bruit, REF);
    expect(b.c.conclusion).toBe('non_concluante');
    expect(resultatHypothese({ id: 'b', numero: 6, etat: b.etat }, b.c)!.chiffre).toMatch(/^1 gagnante sur 4 variantes tranchées/);
    const imp = lot('i', 7, [ad('i1', 'winner')], { statut: 'analyzed', lanceLe: null });
    const i = conclure(imp, REF);
    expect(i.etat).toBe('importe');
    expect(resultatHypothese({ id: 'i', numero: 7, etat: i.etat }, i.c)!.chiffre).toContain('Historique repris du tableau');
  });

  it('la carte · colonne « Conclue », la pastille EST le résultat du lot (pas le verdict de la variante), la provenance et son lien', () => {
    // La variante a1 est perdante · le lot entier est confirmé · la carte dit le lot.
    const l = lot('l', 3, [ad('a1', 'loser'), ad('a2', 'winner'), ad('a3', 'winner'), ad('a4', 'winner'), ad('a5', 'winner')]);
    const ref = [lot('r', 1, Array.from({ length: 10 }, (_, i) => ad(`r${i}`, 'loser')))];
    const { etat, c } = conclure(l, ref);
    expect(c.conclusion).toBe('confirmee');
    const [carte] = cartesHypotheses([{ ad: l.ads[0]!, concept: 'C', bande: null, origine: TAG, lot: { id: 'l', numero: 3, etat, jour: null, conclusion: c } }], [], { marqueId: null });
    expect(carte, 'la carte ne dit pas le résultat du lot').toMatchObject({ colonne: 'conclue', conclusion: { libelle: 'Confirmée', classe: 'g', icone: 'check' }, resultat: { statut: 'confirmee' } });
    expect(carte!.provenance).toEqual({ libelle: 'Veille · tag « Hook UGC » · 3 sauvegardes', href: '/saved?tag=hook%20ugc', lien: 'Voir les sauvegardes du tag « Hook UGC »' });
    // Sans conclusion passée (lot non lu), l'arbitrage de la variante garde l'ancien rendu.
    const [sans] = cartesHypotheses([{ ad: l.ads[0]!, concept: 'C', bande: null, origine: null, lot: { id: 'l', numero: 3, etat, jour: null } }], []);
    expect([sans!.conclusion?.libelle, sans!.resultat ?? null, sans!.provenance ?? null]).toEqual(['Infirmée', null, null]);
  });
});

describe('la provenance rappelée · le lien vers la source quand elle en a une', () => {
  const M = 'b0b00000-0000-4000-8000-000000000001';
  it('tag, apprentissage, persona (marque active), pub de la Veille, à la main', () => {
    expect(provenanceCarte(TAG).href).toBe('/saved?tag=hook%20ugc');
    expect(provenanceCarte({ type: 'apprentissage', enonce: 'Les questions accrochent', learningId: null })).toEqual({ libelle: 'Apprentissage · Les questions accrochent', href: '/adsmap/apprentissages', lien: 'Voir les apprentissages' });
    expect(provenanceCarte({ type: 'persona', persona: 'Léa, 34 ans', personaId: null, accroche: null }, { marqueId: M }).href).toBe(`/brands/${M}/personas`);
    expect(provenanceCarte({ type: 'persona', persona: 'Léa', personaId: null, accroche: null }, { marqueId: '../x' }).href).toBeNull();
    expect(provenanceCarte({ type: 'veille', annonceur: 'Nike', savedAdId: null })).toEqual({ libelle: 'Veille · Nike', href: null, lien: null });
    expect(provenanceCarte({ type: 'libre' }).libelle).toBe('Idée d’équipe');
  });
  it('la provenance d’un test · l’hypothèse libre d’abord, sinon un geste de Jarvis relu, sinon une itération, sinon rien', () => {
    const J = { reponseId: 'a0a00000-0000-4000-8000-000000000001', contexte: { type: 'lot' as const, id: 'a0a00000-0000-4000-8000-000000000002' } };
    expect(provenanceDuTest({ origine: TAG, typeAd: 'iteration', jarvis: J })).toBe('tag');
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration', jarvis: J })).toBe('jarvis');
    expect(provenanceDuTest({ origine: null, typeAd: 'iteration' })).toBe('iteration');
    expect(provenanceDuTest({ origine: null, typeAd: 'ideation' })).toBeNull();
    expect(PROVENANCES_TEST.map((p) => p.cle)).toEqual(['tag', 'veille', 'apprentissage', 'persona', 'libre', 'jarvis', 'iteration']);
  });
});

/* ───────────────────────── le bilan par provenance ───────────────────────── */

const entrees = (p: ProvenanceTest | null, k: number, n: number): EntreeLecturePersona[] =>
  Array.from({ length: n }, (_, i) => ({ persona: p ? { id: p, nom: PROVENANCES_TEST.find((x) => x.cle === p)!.libelle } : null, issue: i < k ? 'gagne' as const : 'perd' as const }));

describe('le bilan par provenance · le silence par défaut, la parole avec ses deux intervalles', () => {
  it('rien de tranché, puis sous l’effectif · le bilan se tait et le dit', () => {
    expect(bilanProvenances([]).phrase).toBe('Aucune variante tranchée au protocole · rien à lire par provenance pour l’instant.');
    const b = bilanProvenances([...entrees('tag', 3, 3), ...entrees(null, 0, 10)]);
    expect(b.parle).toBe(false);
    expect(b.groupes).toEqual([expect.objectContaining({ cle: 'tag', lecture: 'effectif', phrase: `3 variantes tranchées · il en faut ${MIN_VERDICTS_PERSONA} pour qu’une provenance ait le droit de parler.` })]);
    expect(b.phrase).toBe(`Aucune provenance n’a encore ${MIN_VERDICTS_PERSONA} variantes tranchées · le bilan se tait, faute d’effectif.`);
    expect(b.general).toEqual({ k: 3, n: 13 });
  });

  it('au-dessus du seuil · 6 sur 6 contre 0 sur 10 · « au-dessus », les deux intervalles au niveau mesuré', () => {
    const b = bilanProvenances([...entrees('tag', 6, 6), ...entrees(null, 0, 10)]);
    expect([b.parle, b.niveau, b.reste]).toEqual([true, NIVEAU_BILAN_PROVENANCE, 10]);
    const g = b.groupes[0]!;
    expect(g.lecture).toBe('au_dessus');
    expect(g.intervalle).toEqual(wilsonInterval(6, 6, NIVEAU_BILAN_PROVENANCE));
    expect(g.reference).toEqual({ k: 0, n: 10, intervalle: wilsonInterval(0, 10, NIVEAU_BILAN_PROVENANCE) });
    expect(g.phrase).toMatch(/^6 gagnantes sur 6 variantes tranchées \(\d+ % à 100 %\) · nettement au-dessus du reste de la marque, 0 sur 10 \(0 % à \d+ %\)\.$/);
    expect(b.phrase).toBe('Tag de Veille récurrent au-dessus du reste de la marque, intervalles disjoints au niveau 0,975.');
  });

  it('plus strict que la lecture par persona · 5 sur 5 contre 3 sur 10 détache un persona (0,95), pas une provenance (0,975)', () => {
    const e = [...entrees('tag', 5, 5), ...entrees(null, 3, 10)];
    expect(lecturePersonas(e, [{ id: 'tag', nom: 'Tag' }]).groupes[0]!.lecture).toBe('au_dessus');
    const b = bilanProvenances(e);
    expect([b.parle, b.groupes[0]!.lecture]).toEqual([false, 'dans_le_bruit']);
    expect(b.phrase).toContain('le silence est la conclusion par défaut');
  });

  it('le niveau suit le reste hors provenances · 0,975 jusqu’à 80, 0,99 jusqu’à 160, silence au-delà, et c’est dit', () => {
    expect([niveauBilanProvenances(RESTE_MAX_NIVEAU_BILAN), niveauBilanProvenances(RESTE_MAX_NIVEAU_BILAN + 1), niveauBilanProvenances(RESTE_MAX_BILAN), niveauBilanProvenances(RESTE_MAX_BILAN + 1)], 'le bilan parle au-delà du volume mesuré')
      .toEqual([NIVEAU_BILAN_PROVENANCE, NIVEAU_BILAN_PROVENANCE_VOLUME, NIVEAU_BILAN_PROVENANCE_VOLUME, null]);
    expect(bilanProvenances([...entrees('tag', 6, 6), ...entrees(null, 0, 100)]).niveau).toBe(NIVEAU_BILAN_PROVENANCE_VOLUME);
    const trop = bilanProvenances([...entrees('tag', 6, 6), ...entrees(null, 0, 161)]);
    expect([trop.parle, trop.niveau, trop.groupes[0]!.lecture]).toEqual([false, null, 'non_mesure']);
    expect(trop.phrase).toBe('161 variantes tranchées hors des provenances lues · au-delà de 160, la règle n’est pas mesurée · le bilan se tait.');
  });

  it('les entrées · lots suivis seulement (un historique importé n’entre pas), le témoin sans issue', () => {
    const lots = [lot('l', 1, [ad('a', 'winner'), ad('t', 'winner', { variable: 'none_control' })]), lot('i', 2, [ad('i', 'winner')], { statut: 'analyzed', lanceLe: null })];
    const e = entreesBilanProvenances(lots, () => 'tag');
    expect(e.map((x) => [x.persona?.id, x.issue])).toEqual([['tag', 'gagne'], ['tag', null]]);
  });

  it('la règle dite à l’écran porte les seuils des modules', () => {
    expect(regleBilanProvenances()).toBe(`Règle · une hypothèse gagne quand sa variante est tranchée gagnante au protocole · au moins ${MIN_VERDICTS_PERSONA} variantes tranchées pour une provenance et ${MIN_REFERENCE_PERSONA} dans le reste de la marque · l’intervalle de la provenance doit exclure celui du reste (niveau 0,975, 0,99 au-delà de 80 variantes hors provenances, silence au-delà de 160).`);
  });
});

/* ───────────────── les seuils, recalculés (loi binomiale exacte) ───────────────── */

const binom = (n: number, p: number) => { const o: number[] = []; let c = 1; for (let k = 0; k <= n; k++) { if (k > 0) c = (c * (n - k + 1)) / k; o.push(c * p ** k * (1 - p) ** (n - k)); } return o; };
/**
 * P(au moins une provenance se détache à tort) · K provenances de n verdicts, U
 * hors provenances, toutes au taux p0 · au niveau DU MODULE (`niveauBilanProvenances`)
 * ou au niveau imposé · programmation dynamique exacte sur le total.
 */
function erreurFamille(K: number, n: number, U: number, p0: number, niveau: number | null = niveauBilanProvenances(U)): number {
  const N = K * n + U;
  if (niveau === null || n < MIN_VERDICTS_PERSONA || N - n < MIN_REFERENCE_PERSONA) return 0;
  const d = binom(n, p0), du = binom(U, p0), S = K * n;
  let silence = 0;
  for (let T = 0; T <= N; T++) {
    let q = new Array<number>(S + 1).fill(0); q[0] = 1;
    for (let j = 0; j < K; j++) {
      const nq = new Array<number>(S + 1).fill(0);
      for (let s = 0; s <= S; s++) {
        if (!q[s]) continue;
        for (let k = 0; k <= n && s + k <= S; k++) {
          const r = T - k;
          if (r < 0 || r > N - n) continue;
          const a = wilsonInterval(k, n, niveau), b = wilsonInterval(r, N - n, niveau);
          if (a.lo > b.hi || a.hi < b.lo) continue;
          nq[s + k] = nq[s + k]! + q[s]! * d[k]!;
        }
      }
      q = nq;
    }
    for (let u = 0; u <= U; u++) { const s = T - u; if (s >= 0 && s <= S) silence += du[u]! * q[s]!; }
  }
  return 1 - silence;
}

describe('les seuils mesurés · l’erreur de famille exacte reste sous 15 %', () => {
  it('les points les plus durs du tableau, au niveau que le module choisit', () => {
    const pires = [
      { K: 6, n: 6, U: 10, p0: 0.5 }, { K: 6, n: 8, U: 20, p0: 0.5 }, { K: 6, n: 6, U: 40, p0: 0.5 }, { K: 6, n: 6, U: 80, p0: 0.5 },
      { K: 4, n: 4, U: 20, p0: 0.5 }, { K: 6, n: 6, U: 160, p0: 0.5 },
    ];
    for (const x of pires) expect(erreurFamille(x.K, x.n, x.U, x.p0), JSON.stringify(x)).toBeLessThanOrEqual(ERREUR_TOLEREE_BILAN);
  }, 120_000);
  it('le niveau des personas (0,95) ne suffirait pas ici · ni 0,975 au-delà de 80 · c’est pour ça qu’ils sont relevés', () => {
    expect(erreurFamille(4, 5, 20, 0.5, 0.95)).toBeGreaterThan(ERREUR_TOLEREE_BILAN);
    expect(erreurFamille(6, 6, 160, 0.5, NIVEAU_BILAN_PROVENANCE)).toBeGreaterThan(ERREUR_TOLEREE_BILAN);
  }, 120_000);
});

/* ───────────────────────── les gestes P06 ───────────────────────── */

describe('les gestes depuis la lecture par persona · seulement quand un persona se détache', () => {
  const LEA = { id: 'lea', nom: 'Léa, 34 ans' };
  const [G1, G2, G9] = ['1', '2', '9'].map((x) => `a0a00000-0000-4000-8000-00000000000${x}`) as [string, string, string];
  const plan = new Set([G2, G9]);
  const o = { numeroLot: 3, testsDuLot: [G1, G2], testsDeLaMarque: [G9, G1, G2], planIds: plan };
  it('dans le bruit, sous l’effectif · aucun geste', () => {
    for (const lecture of ['dans_le_bruit', 'effectif', 'reference', 'trop_de_personas'] as const) {
      expect(gestesPersonaLot({ persona: LEA, lecture, k: 1, n: 4, reference: { k: 1, n: 4 } }, o), `un geste pour un persona qui ne se détache pas · ${lecture}`).toBeNull();
    }
    expect(NOTE_GESTES_SILENCE).toContain('ne se détache');
  });
  it('au-dessus · Itérer part de la gagnante DU LOT présente dans le plan · l’hypothèse cite le persona et ses verdicts', () => {
    const g = gestesPersonaLot({ persona: LEA, lecture: 'au_dessus', k: 6, n: 6, reference: { k: 0, n: 10 } }, o)!;
    expect(g.iterer).toEqual({ href: `/studio/iterer?iter=${G2}`, adId: G2, raison: null });
    expect(g.hypothese.depart, 'le départ invente un résultat attendu ou perd le persona').toEqual({ parties: { si: 'on décline nos prochaines créas pour Léa', alors: '', parceQue: 'ses variantes gagnent nettement plus souvent que le reste de la marque (6 sur 6 contre 0 sur 10)' }, variable: null });
    expect(g.hypothese.note).toContain('lot #3');
  });
  it('en dessous, sans gagnante dans le plan · Itérer fermé avec sa raison, l’hypothèse reste proposée', () => {
    const g = gestesPersonaLot({ persona: LEA, lecture: 'en_dessous', k: 0, n: 6, reference: { k: 8, n: 10 } }, { ...o, planIds: new Set() })!;
    expect(g.iterer).toEqual({ href: null, adId: null, raison: RAISON_ITERER_SANS_GAGNANTE });
    expect(g.hypothese.depart.parties.si).toBe('on change d’approche pour Léa');
    expect(g.hypothese.depart.parties.parceQue).toContain('nettement moins souvent');
  });
});
