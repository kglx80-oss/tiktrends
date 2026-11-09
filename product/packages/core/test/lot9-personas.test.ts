import { describe, it, expect } from 'vitest';
import {
  ELEMENTS_PERSONA_MAX, ERREUR_TOLEREE_PERSONA, MAX_PERSONAS_LECTURE, MIN_REFERENCE_PERSONA, MIN_VERDICTS_PERSONA,
  NIVEAU_LECTURE_PERSONA, NIVEAU_LECTURE_PERSONA_NOMBREUX, NOM_PERSONA_PROVISOIRE, PERSONAS_NIVEAU_DE_BASE, REFUS_PERSONA_INTROUVABLE,
  accesTestsPersona, bilanTestsPersona, choixRangPersona, entreesLecturePersonas, lecturePersonas, libelleAttribution, libelleRangPersona,
  lienNouveauProjet, lireContexteNouveauProjet, niveauLecturePersonas, notesContexte, ordonnerPersonas, personaDuTest, rangsAEcrire, rangsApres,
  regleLecturePersonas, testsDuPersona, validerPersona, wilsonInterval,
  type EntreeLecturePersona, type FaitsAdSpatial, type FaitsLotSpatial, type PersonaRef,
} from '../src';

/**
 * Lot 9 V5 · personas éditables et reliés aux tests · les RÈGLES, en pur.
 *  · la saisie d'une modification (validée avant d'écrire, rien tronqué) ;
 *  · le rang (1, 2, 3… sans trou, les autres se décalent) et l'ordre partout ;
 *  · le persona d'un test (carte ou brief, jamais fusionnés) ;
 *  · la lecture par persona · effectif minimum, intervalle qui doit exclure le
 *    reste de la marque, silence dit · et les seuils MESURÉS, recalculés ici
 *    (l'erreur de famille exacte tombe si l'un d'eux est relâché).
 */

describe('validerPersona · la saisie d’une modification', () => {
  const base = { nom: 'Léa, 34 ans', description: 'Maman pressée', segment: 'Jeunes parents', rang: '2', desirs: 'Gagner du temps\nDormir', freins: ['Prix'], objections: '' };
  it('une saisie complète · nettoyée, listes une par ligne, doublons retirés, rang entier', () => {
    const v = validerPersona({ ...base, desirs: 'Gagner du temps\n\n  Dormir  \ngagner du temps' });
    expect(v).toEqual({ ok: true, persona: { nom: 'Léa, 34 ans', description: 'Maman pressée', segment: 'Jeunes parents', rang: 2, desirs: ['Gagner du temps', 'Dormir'], freins: ['Prix'], objections: [] } });
  });
  it('vides · description et segment à null, « Sans rang » à null', () => {
    const v = validerPersona({ nom: 'Max', description: '  ', segment: '', rang: '' });
    expect(v.ok && v.persona).toMatchObject({ description: null, segment: null, rang: null, desirs: [], freins: [], objections: [] });
  });
  it('refus champ par champ · rien n’est tronqué en silence', () => {
    const v = validerPersona({ nom: ' ', segment: 's'.repeat(61), rang: '0', desirs: Array.from({ length: ELEMENTS_PERSONA_MAX + 1 }, (_, i) => `d${i}`), freins: ['x'.repeat(161)] });
    expect(v.ok).toBe(false);
    const champs = !v.ok ? v.erreurs.map((e) => e.champ) : [];
    expect(champs.sort()).toEqual(['desirs', 'freins', 'nom', 'rang', 'segment']);
  });
  it('le nom du persona provisoire des Studios est réservé', () => {
    const v = validerPersona({ nom: 'à qualifier' });
    expect(!v.ok && v.erreurs[0]!.raison).toContain(`« ${NOM_PERSONA_PROVISOIRE} » est réservé`);
  });
  it('rang · 1 à 50, entier · « 1.5 », « abc », 51 refusés', () => {
    for (const r of ['1.5', 'abc', 51, -1]) expect(validerPersona({ nom: 'A', rang: r }).ok, String(r)).toBe(false);
    expect(validerPersona({ nom: 'A', rang: 50 }).ok).toBe(true);
  });
  it('le refus hors marque est une seule phrase', () => {
    expect(REFUS_PERSONA_INTROUVABLE).toBe('Ce persona n’existe pas dans cette marque.');
  });
});

describe('rang · 1, 2, 3… sans trou, les autres se décalent', () => {
  const P = (id: string, rang: number | null) => ({ id, rang });
  it('c passe n°1 · a et b descendent', () => {
    expect(rangsApres([P('a', 1), P('b', 2), P('c', 3)], 'c', 1)).toEqual([P('a', 2), P('b', 3), P('c', 1)]);
    expect(rangsAEcrire([P('a', 1), P('b', 2), P('c', 3)], 'c', 1)).toEqual([P('a', 2), P('b', 3)]);
  });
  it('« Sans rang » · le persona sort du classement, les suivants remontent', () => {
    expect(rangsApres([P('a', 1), P('b', 2), P('c', 3)], 'a', null)).toEqual([P('a', null), P('b', 1), P('c', 2)]);
  });
  it('un rang trop grand · dernier du classement ; les sans-rang restent sans rang', () => {
    expect(rangsApres([P('a', 1), P('b', null), P('c', null)], 'c', 9)).toEqual([P('a', 1), P('b', null), P('c', 2)]);
  });
  it('quelle que soit la suite de changements, les rangs restent contigus et uniques', () => {
    let ps = ['a', 'b', 'c', 'd', 'e'].map((id) => P(id, null as number | null));
    let graine = 7;
    const hasard = () => { graine = (graine * 48271) % 2147483647; return graine; };
    for (let i = 0; i < 300; i++) {
      const id = ps[hasard() % ps.length]!.id;
      const r = hasard() % 7;
      ps = rangsApres(ps, id, r === 0 ? null : r);
      const rangs = ps.map((p) => p.rang).filter((x): x is number => x != null).sort((a, b) => a - b);
      expect(rangs).toEqual(rangs.map((_, j) => j + 1));
    }
  });
  it('ordre de lecture · classés par rang, puis les autres par nom', () => {
    const o = ordonnerPersonas([{ nom: 'Zoé', rang: null }, { nom: 'Bob', rang: 2 }, { nom: 'Anna', rang: null }, { nom: 'Yann', rang: 1 }]);
    expect(o.map((x) => x.nom)).toEqual(['Yann', 'Bob', 'Anna', 'Zoé']);
  });
  it('libellés et choix du rang', () => {
    expect(libelleRangPersona(1)).toBe('n°1');
    expect(libelleRangPersona(null)).toBeNull();
    expect(choixRangPersona(3).map((c) => c.libelle)).toEqual(['Sans rang', 'n°1', 'n°2', 'n°3']);
  });
});

describe('le persona d’un test · carte ou brief, jamais fusionnés', () => {
  const lea: PersonaRef = { id: 'p1', nom: 'Léa, 34 ans' };
  const max: PersonaRef = { id: 'p2', nom: 'Max' };
  const prov: PersonaRef = { id: 'p0', nom: NOM_PERSONA_PROVISOIRE };
  it('le brief seul (créa rattachée depuis les Studios, carte « À qualifier ») · le persona du brief', () => {
    const a = personaDuTest({ carte: prov, brief: lea });
    expect(a).toMatchObject({ persona: lea, source: 'brief', desaccord: false, carte: null });
    expect(libelleAttribution(a)).toBe('Léa · d’après le brief du projet');
  });
  it('la carte seule · le persona de la carte', () => {
    expect(personaDuTest({ carte: max, brief: null })).toMatchObject({ persona: max, source: 'carte' });
  });
  it('d’accord · le même', () => {
    expect(personaDuTest({ carte: lea, brief: lea })).toMatchObject({ persona: lea, source: 'accord' });
  });
  it('en désaccord · AUCUN persona, et l’écran dit les deux', () => {
    const a = personaDuTest({ carte: max, brief: lea });
    expect(a.persona).toBeNull();
    expect(libelleAttribution(a)).toBe('Persona à trancher · la carte dit Max, le brief du projet Léa');
  });
  it('rien · « Aucun persona »', () => {
    expect(libelleAttribution(personaDuTest({ carte: prov, brief: null }))).toContain('Aucun persona');
  });
});

/* ───────────────────────── la lecture par persona ───────────────────────── */

const LEA: PersonaRef = { id: 'lea', nom: 'Léa, 34 ans' };
const MAX: PersonaRef = { id: 'max', nom: 'Max' };
const SAM: PersonaRef = { id: 'sam', nom: 'Sam' };
const e = (persona: PersonaRef | null, gagne: number, perd: number): EntreeLecturePersona[] => [
  ...Array.from({ length: gagne }, () => ({ persona, issue: 'gagne' as const })),
  ...Array.from({ length: perd }, () => ({ persona, issue: 'perd' as const })),
];

describe('lecturePersonas · comparer au reste de la marque, jamais à zéro', () => {
  it('sous le seuil · muette, et elle le dit (effectif)', () => {
    const l = lecturePersonas([...e(LEA, 3, 0), ...e(MAX, 0, 6)], [LEA, MAX]);
    expect(l.parle).toBe(false);
    expect(l.groupes.find((g) => g.persona.id === 'lea')).toMatchObject({ lecture: 'effectif', intervalle: null });
    expect(l.groupes[0]!.phrase).toBe(`3 variantes tranchées · il en faut ${MIN_VERDICTS_PERSONA} pour qu’un persona ait le droit de parler.`);
  });
  it('au-dessus du seuil et nettement au-dessus · elle parle, avec les deux intervalles', () => {
    const l = lecturePersonas([...e(LEA, 6, 0), ...e(MAX, 0, 6), ...e(SAM, 0, 4)], [LEA, MAX, SAM]);
    const g = l.groupes.find((x) => x.persona.id === 'lea')!;
    expect(g.lecture).toBe('au_dessus');
    expect(l.niveau).toBe(NIVEAU_LECTURE_PERSONA);
    const ip = wilsonInterval(6, 6, NIVEAU_LECTURE_PERSONA), ir = wilsonInterval(0, 10, NIVEAU_LECTURE_PERSONA);
    expect(ip.lo).toBeGreaterThan(ir.hi);
    expect(g.phrase).toBe(`6 gagnantes sur 6 variantes tranchées (${Math.round(ip.lo * 100)} % à 100 %) · nettement au-dessus du reste de la marque, 0 sur 10 (0 % à ${Math.round(ir.hi * 100)} %).`);
    expect(l.parle).toBe(true);
    expect(l.phrase).toContain('Léa au-dessus');
  });
  it('un écart dans le bruit · « dans le bruit », et le silence d’ensemble est une conclusion', () => {
    const l = lecturePersonas([...e(LEA, 3, 2), ...e(MAX, 2, 3)], [LEA, MAX]);
    expect(l.groupes.map((g) => g.lecture)).toEqual(['dans_le_bruit', 'dans_le_bruit']);
    expect(l.phrase).toBe('Aucun persona ne se détache du reste de la marque · le silence est la conclusion la plus fréquente, il ne dit pas que les personas se valent.');
  });
  it('une référence trop mince · muette (« reference »)', () => {
    const l = lecturePersonas([...e(LEA, 5, 0), ...e(null, 0, MIN_REFERENCE_PERSONA - 1)], [LEA]);
    expect(l.groupes[0]!.lecture).toBe('reference');
  });
  it('les tests sans persona comptent dans la référence, jamais dans un groupe', () => {
    const l = lecturePersonas([...e(LEA, 2, 2), ...e(null, 0, 5)], [LEA]);
    expect(l.sansPersona).toBe(5);
    expect(l.groupes[0]!.reference).toEqual(expect.objectContaining({ k: 0, n: 5 }));
  });
  it('au-delà de 6 personas lus · non mesuré, la règle se tait', () => {
    const ps = Array.from({ length: MAX_PERSONAS_LECTURE + 1 }, (_, i) => ({ id: `p${i}`, nom: `P${i}` }));
    const l = lecturePersonas([...ps.flatMap((p, i) => e(p, i === 0 ? 6 : 0, i === 0 ? 0 : 6))], ps);
    expect(l.niveau).toBeNull();
    expect(l.parle).toBe(false);
    expect(l.groupes.every((g) => g.lecture === 'trop_de_personas')).toBe(true);
  });
  it('rien de tranché · la phrase le dit', () => {
    expect(lecturePersonas([], [LEA]).phrase).toBe('Aucune variante tranchée au protocole · rien à lire par persona pour l’instant.');
    expect(testsDuPersona(lecturePersonas([], [LEA]), 'lea')).toEqual({ lecture: 'aucun', phrase: 'Aucune variante tranchée au protocole ne cible ce persona · rien à lire.' });
  });
  it('la règle dite à l’écran porte les seuils du module', () => {
    expect(regleLecturePersonas()).toBe('Règle · au moins 4 variantes tranchées au protocole pour un persona et 4 dans le reste de la marque · l’intervalle du persona doit exclure celui du reste (niveau 0,95, 0,975 au-delà de 4 personas lus, silence au-delà de 6).');
  });
});

/* ───────────────── les seuils, recalculés (loi binomiale exacte) ───────────────── */

const binom = (n: number, p: number) => { const o: number[] = []; let c = 1; for (let k = 0; k <= n; k++) { if (k > 0) c = (c * (n - k + 1)) / k; o.push(c * p ** k * (1 - p) ** (n - k)); } return o; };
/** P(au moins un persona se détache à tort) · K personas de n verdicts, U sans persona, tous au taux p0 · avec les seuils DU MODULE. */
function erreurFamille(K: number, n: number, U: number, p0: number, niveau: number | null = niveauLecturePersonas(K)): number {
  if (niveau === null) return 0;
  const d = binom(n, p0), du = binom(U, p0);
  const ks = new Array<number>(K).fill(0);
  let err = 0;
  const rec = (i: number, pr: number) => {
    if (i === K) {
      for (let u = 0; u <= U; u++) {
        const tot = ks.reduce((a, b) => a + b, 0) + u, nt = K * n + U;
        let parle = false;
        for (let j = 0; j < K && !parle; j++) {
          if (n < MIN_VERDICTS_PERSONA || nt - n < MIN_REFERENCE_PERSONA) continue;
          const a = wilsonInterval(ks[j]!, n, niveau), r = wilsonInterval(tot - ks[j]!, nt - n, niveau);
          parle = a.lo > r.hi || a.hi < r.lo;
        }
        if (parle) err += pr * du[u]!;
      }
      return;
    }
    for (let k = 0; k <= n; k++) { ks[i] = k; rec(i + 1, pr * d[k]!); }
  };
  rec(0, 1);
  return err;
}

describe('les seuils mesurés · l’erreur de famille exacte reste sous 15 %', () => {
  it(`les points les plus durs du tableau · K=${PERSONAS_NIVEAU_DE_BASE} à ${MAX_PERSONAS_LECTURE}, au niveau que le module choisit`, () => {
    const pires = [
      { K: 2, n: 6, U: 4, p0: 0.5 }, { K: 3, n: 6, U: 4, p0: 0.5 }, { K: 4, n: 6, U: 4, p0: 0.5 }, { K: 4, n: 4, U: 4, p0: 0.5 },
      { K: 5, n: 6, U: 4, p0: 0.5 }, { K: 5, n: 5, U: 0, p0: 0.5 }, { K: 6, n: 5, U: 4, p0: 0.5 },
    ];
    for (const x of pires) expect(erreurFamille(x.K, x.n, x.U, x.p0), JSON.stringify(x)).toBeLessThanOrEqual(ERREUR_TOLEREE_PERSONA);
  }, 60_000);
  it('le niveau du lot (0,90) ne suffirait pas à 4 personas · c’est pour ça qu’il est relevé', () => {
    expect(erreurFamille(4, 6, 4, 0.7, 0.9)).toBeGreaterThan(ERREUR_TOLEREE_PERSONA);
    expect(erreurFamille(6, 5, 4, 0.5, NIVEAU_LECTURE_PERSONA)).toBeGreaterThan(ERREUR_TOLEREE_PERSONA);
    expect(niveauLecturePersonas(PERSONAS_NIVEAU_DE_BASE)).toBe(NIVEAU_LECTURE_PERSONA);
    expect(niveauLecturePersonas(PERSONAS_NIVEAU_DE_BASE + 1)).toBe(NIVEAU_LECTURE_PERSONA_NOMBREUX);
    expect(niveauLecturePersonas(MAX_PERSONAS_LECTURE + 1)).toBeNull();
  }, 60_000);
});

/* ───────────────────────── entrées, bilan, portes, lien ───────────────────────── */

const ad = (id: string, v: 'winner' | 'loser' | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: null, statut: 'computed', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null, ...o,
});
const lot = (id: string, ads: FaitsAdSpatial[], o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({ id, numero: 1, but: null, statut: 'testing', lanceLe: '2026-10-01T00:00:00Z', ads, protocole: null, ...o });

describe('entrées et bilan · lots suivis seulement, témoin exclu', () => {
  const lots = [
    lot('l1', [ad('a1', 'winner'), ad('a2', 'loser'), ad('a3', null), ad('t', 'winner', { variable: 'none_control' })]),
    lot('imp', [ad('i1', 'winner')], { statut: 'analyzed', lanceLe: null }),
    lot('l2', [ad('b1', 'loser')]),
  ];
  const attribution = (id: string) => (id.startsWith('a') || id === 'i1' || id === 't' ? LEA : null);
  it('un historique importé n’entre pas · le témoin n’a pas d’issue', () => {
    const en = entreesLecturePersonas(lots, attribution);
    expect(en.length).toBe(5);
    expect(en.filter((x) => x.issue).map((x) => x.issue)).toEqual(['gagne', 'perd', 'perd']);
  });
  it('« N tests · N lots » · tous les lots, verdict ou non', () => {
    expect(bilanTestsPersona(lots, attribution, 'lea')).toEqual({ tests: 5, lots: 2 });
  });
});

describe('portes et lien vers Nouveau projet', () => {
  it('les portes d’Adsmap et la marque active · la raison s’écrit', () => {
    expect(accesTestsPersona({ adsmap: 'ok', marqueActive: true })).toEqual({ lecture: null, validation: null });
    expect(accesTestsPersona({ adsmap: 'plan', marqueActive: true }).lecture).toContain('offre Plus');
    expect(accesTestsPersona({ adsmap: 'ok', marqueActive: false }).lecture).toContain('marque active');
  });
  it('le persona voyage dans le lien · une valeur forgée est ignorée, et ce qui n’est pas repris est dit', () => {
    const id = 'b0b00000-0000-4000-8000-000000000009';
    const href = lienNouveauProjet({ type: 'ads', persona: id.toUpperCase() });
    expect(href).toBe(`/studio/projets/nouveau?type=ads&persona=${id}`);
    const c = lireContexteNouveauProjet(Object.fromEntries(new URLSearchParams(href.split('?')[1])));
    expect(c).toMatchObject({ persona: id, aContexte: true });
    expect(lireContexteNouveauProjet({ persona: 'pas-un-id' }).persona).toBeNull();
    expect(notesContexte(c, { refJointe: false, iteration: null, personaRetenu: false })).toEqual(['Le persona de ce lien n’est pas proposé pour la marque active (retiré, écarté ou d’une autre marque) · choisis-le dans « Pour qui ? ».']);
    expect(notesContexte(c, { refJointe: false, iteration: null, personaRetenu: true })).toEqual([]);
  });
});
