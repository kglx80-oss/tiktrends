import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import type { PackPrompts } from '../src/prompts/types';
import {
  CONDITIONS_OFFRE_MAX, INTITULE_OFFRE_MAX, MAX_PERSONAS_LECTURE, MIN_REFERENCE_PERSONA, MIN_VERDICTS_PERSONA, NIVEAU_LECTURE_PERSONA,
  NIVEAU_LECTURE_PERSONA_NOMBREUX, PERSONAS_NIVEAU_DE_BASE, REFUS_ALLEGATION_INTROUVABLE, REFUS_OFFRE_INTROUVABLE, SANS_OFFRE_TEST,
  SIGNAL_ALLEGATION_A_PROUVER, TYPES_OFFRE,
  briefApresFormulaire, construireBriefV5, detailOffre, entreesLectureOffres, faitOffre, faitsAvecOffre, lectureOffres, lecturePersonas,
  libelleAttributionOffre, lienNouveauProjet, lireContexteNouveauProjet, manquesOffres, notesContexte, offreBriefDepuis, offreDuBrief,
  offreDuTest, ordonnerOffres, pastilleManquesOffres, regleLectureOffres, regleLecturePersonas, saisieBriefVide, saisieDepuisBrief,
  signalAllegation, statutAllegation, texteOffreBrief, validerAllegation, validerFormeBrief, validerOffre, validerRelationsBrief,
  wilsonInterval,
  type BriefCanonique, type EntreeLectureOffre, type FaitsAdSpatial, type FaitsLotSpatial, type PersonaRef,
} from '../src';

/**
 * Lot 9 bis V5 · offres et allégations de la marque, choisies au brief, lues
 * sur le lot · les RÈGLES, en pur.
 *  · la saisie d'une offre, d'une allégation (validées avant d'écrire, rien
 *    tronqué · une allégation prouvée cite sa preuve) ;
 *  · une allégation « à prouver » porte son signal ;
 *  · l'offre entre dans le brief comme FAIT DÉCLARÉ · le VRAI contrat Ajv du
 *    brief l'accepte tel quel (aucun contrat, aucun prompt touché) ;
 *  · l'offre d'un test (annonce ou brief, jamais fusionnés) ;
 *  · la lecture par offre EST la règle de la lecture par persona (mêmes
 *    sorties, mêmes seuils) · son erreur de famille, recalculée en loi
 *    binomiale exacte à travers `lectureOffres` elle-même, reste sous 15 %.
 */

const ID = (n: number) => `0ffe0000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('validerOffre · la saisie d’une offre', () => {
  it('une saisie complète · nettoyée, conditions gardées en clair', () => {
    expect(validerOffre({ intitule: '  Duo sérum   ', type: 'remise', conditions: ' −20 % dès 2 achetés ' }))
      .toEqual({ ok: true, offre: { intitule: 'Duo sérum', type: 'remise', conditions: '−20 % dès 2 achetés' } });
    expect(validerOffre({ intitule: 'Livraison offerte', type: 'livraison', conditions: '' })).toEqual({ ok: true, offre: { intitule: 'Livraison offerte', type: 'livraison', conditions: null } });
  });
  it('refus champ par champ · rien n’est tronqué en silence', () => {
    const v = validerOffre({ intitule: 'x'.repeat(INTITULE_OFFRE_MAX + 1), type: 'promo', conditions: 'c'.repeat(CONDITIONS_OFFRE_MAX + 1) });
    expect(v.ok).toBe(false);
    expect(!v.ok && v.erreurs.map((e) => e.champ).sort()).toEqual(['conditions', 'intitule', 'type']);
    const vide = validerOffre({ intitule: ' ', type: 'remise' });
    expect(!vide.ok && vide.erreurs).toEqual([{ champ: 'intitule', raison: 'L’intitulé de l’offre est obligatoire.' }]);
  });
  it('les types · remise, bundle, garantie, livraison, retours… · un type inconnu est refusé et la liste est dite', () => {
    expect(TYPES_OFFRE).toEqual(['remise', 'bundle', 'garantie', 'livraison', 'retours', 'essai', 'cadeau', 'autre']);
    const v = validerOffre({ intitule: 'a', type: '' });
    expect(!v.ok && v.erreurs[0]!.raison).toBe('Choisis le type de l’offre · remise, bundle, garantie, livraison, retours, essai, cadeau, autre.');
  });
  it('le refus hors marque est une seule phrase par objet', () => {
    expect(REFUS_OFFRE_INTROUVABLE).toBe('Cette offre n’existe pas dans cette marque.');
    expect(REFUS_ALLEGATION_INTROUVABLE).toBe('Cette allégation n’existe pas dans cette marque.');
  });
});

describe('validerAllegation · ce que la marque affirme, et sa preuve', () => {
  it('sans statut · « à prouver » par défaut', () => {
    expect(validerAllegation({ texte: 'Hydrate 24 h', preuve: '' })).toEqual({ ok: true, allegation: { texte: 'Hydrate 24 h', preuve: null, statut: 'a_prouver' } });
  });
  it('« prouvée » SANS preuve · refusée, l’erreur le dit sur la preuve', () => {
    const v = validerAllegation({ texte: 'Hydrate 24 h', preuve: '  ', statut: 'prouvee' });
    expect(!v.ok && v.erreurs).toEqual([{ champ: 'preuve', raison: 'Une allégation prouvée cite sa preuve ou sa source · sans elle, elle reste « à prouver ».' }]);
  });
  it('« prouvée » avec sa preuve · acceptée', () => {
    expect(validerAllegation({ texte: 'Hydrate 24 h', preuve: 'Étude Dermscan 2025, 32 volontaires', statut: 'prouvee' }))
      .toEqual({ ok: true, allegation: { texte: 'Hydrate 24 h', preuve: 'Étude Dermscan 2025, 32 volontaires', statut: 'prouvee' } });
  });
  it('un statut inconnu, un texte vide · refusés', () => {
    const v = validerAllegation({ texte: '', statut: 'certifiee' });
    expect(!v.ok && v.erreurs.map((e) => e.champ).sort()).toEqual(['statut', 'texte']);
  });
  it('une allégation « à prouver » porte son signal · une prouvée n’en porte pas · un statut inconnu en base se lit « à prouver »', () => {
    expect(signalAllegation('a_prouver')).toBe(SIGNAL_ALLEGATION_A_PROUVER);
    expect(SIGNAL_ALLEGATION_A_PROUVER).toBe('À prouver · ne l’affirme pas telle quelle tant que sa preuve manque');
    expect(signalAllegation('prouvee')).toBeNull();
    expect(statutAllegation('n’importe quoi')).toBe('a_prouver');
    expect(signalAllegation(null)).toBe(SIGNAL_ALLEGATION_A_PROUVER);
  });
});

describe('les offres lues · ordre, détail, conditions essentielles manquantes', () => {
  const o = (i: number, type: string | null, active = true) => ({ id: ID(i), intitule: `O${i}`, type, conditions: i % 2 ? 'dès 35 €' : null, active });
  it('les actives d’abord, chacune dans son ordre', () => {
    expect(ordonnerOffres([o(1, 'remise', false), o(2, 'bundle'), o(3, 'cadeau', false), o(4, 'essai')]).map((x) => x.intitule)).toEqual(['O2', 'O4', 'O1', 'O3']);
  });
  it('le détail · type puis conditions · une offre d’avant 0072 le dit', () => {
    expect(detailOffre(o(1, 'livraison'))).toBe('Livraison · dès 35 €');
    expect(detailOffre(o(2, 'garantie'))).toBe('Garantie');
    expect(detailOffre(o(3, null))).toBe('Type non précisé · dès 35 €');
  });
  it('livraison, retours, garantie · ce qu’aucune offre ACTIVE ne couvre, et la pastille accorde', () => {
    expect(manquesOffres([o(1, 'livraison'), o(2, 'garantie', false)])).toEqual(['retours', 'garantie']);
    expect(pastilleManquesOffres(['garantie'])).toBe('Garantie manquante');
    expect(pastilleManquesOffres(['retours'])).toBe('Retours manquants');
    expect(pastilleManquesOffres(['livraison', 'retours', 'garantie'])).toBe('Livraison, retours et garantie manquants');
    expect(pastilleManquesOffres(manquesOffres([o(1, 'livraison'), o(2, 'retours'), o(3, 'garantie')]))).toBeNull();
  });
});

/* ─────────────────────────── l'offre dans le brief ─────────────────────────── */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as unknown;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json') as Record<string, unknown>, (lire('02-PROMPTS.json') as PackPrompts).templates);
const conforme = (result: unknown) => validateur.validerSortie('brief.build', { status: 'ready', questions: [], warnings: [], evidenceIds: [], result });

const OFFRE = { id: ID(7), intitule: 'Duo sérum', type: 'remise', conditions: '−20 % dès 2 achetés' };

describe('l’offre entre dans le brief comme TEXTE · un fait déclaré, aucun champ nouveau', () => {
  const ob = offreBriefDepuis(OFFRE)!;
  it('le texte figé et le fait déclaré · `offre.<id>`, sans source, confiance haute', () => {
    expect(texteOffreBrief(OFFRE)).toBe('Offre de la marque · Duo sérum · Remise · −20 % dès 2 achetés');
    expect(faitOffre(ob)).toEqual({ id: `offre.${ID(7)}`, claim: 'Offre de la marque · Duo sérum · Remise · −20 % dès 2 achetés', sourceIds: [], kind: 'declared', confidence: 'high' });
    expect(offreBriefDepuis({ ...OFFRE, id: 'pas-un-id' })).toBeNull();
  });
  it('construireBriefV5 · le fait d’offre est là, la forme locale ET le VRAI contrat Ajv du brief l’acceptent, aucune clé nouvelle', () => {
    const b = construireBriefV5({ ...saisieBriefVide(), intention: 'Vendre le duo', offre: ob });
    expect(b.facts).toEqual([faitOffre(ob)]);
    expect(validerFormeBrief(b)).toEqual([]);
    expect(conforme(b)).toEqual({ ok: true });
    expect(validerRelationsBrief(b, { sources: [], productId: null })).toEqual([]);
    expect(Object.keys(b).sort()).toEqual(Object.keys(construireBriefV5({ ...saisieBriefVide(), intention: 'x' })).sort());
    // Sans offre · aucun fait, comme avant.
    expect(construireBriefV5({ ...saisieBriefVide(), intention: 'x' }).facts).toEqual([]);
  });
  it('relu · `offreDuBrief` et `saisieDepuisBrief` le retrouvent · un fait forgé ou une forme étrangère ne porte pas d’offre', () => {
    const b = construireBriefV5({ ...saisieBriefVide(), intention: 'x', offre: ob });
    expect(offreDuBrief(b)).toEqual(ob);
    expect(offreDuBrief(b.facts)).toEqual(ob);
    expect(saisieDepuisBrief(b).offre).toEqual(ob);
    expect(offreDuBrief({ facts: [{ id: 'offre.pas-un-id', claim: 'x' }] })).toBeNull();
    expect(offreDuBrief({ facts: 'x' })).toBeNull();
    expect(offreDuBrief(null)).toBeNull();
  });
  it('changer d’offre · seul le fait d’offre bouge · hypothèse et faits du produit restent', () => {
    const autres = [
      { id: 'h1', claim: 'Si…', sourceIds: [], kind: 'hypothesis' as const, confidence: 'medium' as const },
      { id: 'produit.prix', claim: 'Prix : 29 €', sourceIds: ['produit:p1'], kind: 'declared' as const, confidence: 'high' as const },
    ];
    const deux = offreBriefDepuis({ ...OFFRE, id: ID(8), intitule: 'Livraison offerte', type: 'livraison', conditions: null })!;
    expect(faitsAvecOffre([...autres, faitOffre(ob)], deux)).toEqual([...autres, faitOffre(deux)]);
    expect(faitsAvecOffre([...autres, faitOffre(ob)], null)).toEqual(autres);
  });
  it('briefApresFormulaire · le formulaire renvoyé change l’offre sans toucher l’hypothèse ni le style · rien ne change, rien n’est écrit', () => {
    const courant: BriefCanonique = {
      ...construireBriefV5({ ...saisieBriefVide(), intention: 'Vendre', offre: ob }),
      hypothesisId: 'h1', testedVariable: 'hook', variables: ['hook'], styleIntent: 'Lumière douce',
    };
    courant.facts = [{ id: 'h1', claim: 'Si…', sourceIds: [], kind: 'hypothesis', confidence: 'medium' }, ...courant.facts];
    const memeSaisie = construireBriefV5(saisieDepuisBrief(courant));
    expect(briefApresFormulaire(courant, memeSaisie)).toEqual({ brief: courant, change: false });
    const deux = offreBriefDepuis({ ...OFFRE, id: ID(9), intitule: 'Garantie 30 jours', type: 'garantie', conditions: null })!;
    const r = briefApresFormulaire(courant, construireBriefV5({ ...saisieDepuisBrief(courant), offre: deux }));
    expect(r.change).toBe(true);
    expect(r.brief.facts.map((f) => f.id)).toEqual(['h1', `offre.${ID(9)}`]);
    expect(r.brief).toMatchObject({ hypothesisId: 'h1', testedVariable: 'hook', styleIntent: 'Lumière douce' });
    const sans = briefApresFormulaire(courant, construireBriefV5({ ...saisieDepuisBrief(courant), offre: null }));
    expect(sans.brief.facts.map((f) => f.id)).toEqual(['h1']);
  });
});

describe('l’offre voyage dans le lien de Nouveau projet · sur le modèle du persona', () => {
  it('aller-retour · une valeur forgée est ignorée, et ce qui n’est pas repris est dit', () => {
    const href = lienNouveauProjet({ type: 'ads', offre: ID(7).toUpperCase() });
    expect(href).toBe(`/studio/projets/nouveau?type=ads&offre=${ID(7)}`);
    const c = lireContexteNouveauProjet(Object.fromEntries(new URLSearchParams(href.split('?')[1])));
    expect(c).toMatchObject({ offre: ID(7), aContexte: true });
    expect(lireContexteNouveauProjet({ offre: 'pas-un-id' }).offre).toBeNull();
    expect(lienNouveauProjet({ type: 'ads', offre: 'x' })).toBe('/studio/projets/nouveau?type=ads');
    expect(notesContexte(c, { refJointe: false, iteration: null, offreRetenue: false })).toEqual(['L’offre de ce lien n’est pas proposée pour la marque active (archivée ou d’une autre marque) · choisis-la dans « Quelle offre ? ».']);
    expect(notesContexte(c, { refJointe: false, iteration: null, offreRetenue: true })).toEqual([]);
  });
});

/* ───────────────────────── l'offre d'un test ───────────────────────── */

const A: PersonaRef = { id: 'a', nom: 'Duo sérum' };
const B: PersonaRef = { id: 'b', nom: 'Livraison offerte' };

describe('l’offre d’un test · annonce ou brief, jamais fusionnés', () => {
  it('le brief seul · l’offre du brief', () => {
    const t = offreDuTest({ annonce: null, brief: A });
    expect(t).toEqual({ offre: A, source: 'brief', annonce: null, brief: A, desaccord: false });
    expect(libelleAttributionOffre(t)).toBe('Duo sérum · d’après le brief du projet');
  });
  it('l’annonce seule, puis d’accord', () => {
    expect(libelleAttributionOffre(offreDuTest({ annonce: A, brief: null }))).toBe('Duo sérum · d’après le test');
    expect(libelleAttributionOffre(offreDuTest({ annonce: A, brief: A }))).toBe('Duo sérum · test et brief d’accord');
  });
  it('en désaccord · AUCUNE offre, et l’écran dit les deux', () => {
    const t = offreDuTest({ annonce: A, brief: B });
    expect(t.offre).toBeNull();
    expect(libelleAttributionOffre(t)).toBe('Offre à trancher · le test diffuse « Duo sérum », le brief du projet « Livraison offerte »');
  });
  it('rien · « Aucune offre »', () => {
    expect(libelleAttributionOffre(offreDuTest({ annonce: null, brief: null }))).toBe(SANS_OFFRE_TEST);
  });
});

/* ───────────────────────── la lecture par offre ───────────────────────── */

const e = (offre: PersonaRef | null, gagne: number, perd: number): EntreeLectureOffre[] => [
  ...Array.from({ length: gagne }, () => ({ offre, issue: 'gagne' as const })),
  ...Array.from({ length: perd }, () => ({ offre, issue: 'perd' as const })),
];

describe('lectureOffres · LA règle de la lecture par persona, avec les mots de l’offre', () => {
  it('sous le seuil · muette, et elle le dit', () => {
    const l = lectureOffres([...e(A, 3, 0), ...e(B, 0, 6)], [A, B]);
    expect(l.parle).toBe(false);
    expect(l.groupes[0]).toMatchObject({ lecture: 'effectif', intervalle: null });
    expect(l.groupes[0]!.phrase).toBe(`3 variantes tranchées · il en faut ${MIN_VERDICTS_PERSONA} pour qu’une offre ait le droit de parler.`);
    expect(lectureOffres(e(A, 3, 0), [A]).phrase).toBe('Aucune offre n’a encore 4 variantes tranchées · la lecture par offre se tait, faute d’effectif.');
  });
  it('au-dessus du seuil · elle parle, avec les deux intervalles', () => {
    const l = lectureOffres([...e(A, 6, 0), ...e(B, 0, 10)], [A, B]);
    const g = l.groupes.find((x) => x.ref.id === 'a')!;
    expect(g.lecture).toBe('au_dessus');
    expect(l.niveau).toBe(NIVEAU_LECTURE_PERSONA);
    const ip = wilsonInterval(6, 6, NIVEAU_LECTURE_PERSONA), ir = wilsonInterval(0, 10, NIVEAU_LECTURE_PERSONA);
    expect(g.phrase).toBe(`6 gagnantes sur 6 variantes tranchées (${Math.round(ip.lo * 100)} % à 100 %) · nettement au-dessus du reste de la marque, 0 sur 10 (0 % à ${Math.round(ir.hi * 100)} %).`);
    expect(l.phrase).toBe('Duo sérum au-dessus · Livraison offerte en dessous du reste de la marque, intervalles disjoints au niveau 0,95.');
  });
  it('dans le bruit · le silence d’ensemble est une conclusion', () => {
    expect(lectureOffres([...e(A, 3, 2), ...e(B, 2, 3)], [A, B]).phrase).toBe('Aucune offre ne se détache du reste de la marque · le silence est la conclusion la plus fréquente, il ne dit pas que les offres se valent.');
    expect(lectureOffres([], [A]).phrase).toBe('Aucune variante tranchée au protocole · rien à lire par offre pour l’instant.');
  });
  it('niveau corrigé pour le nombre d’offres · 0,975 de 5 à 6, silence au-delà de 6', () => {
    const os = (k: number) => Array.from({ length: k }, (_, i) => ({ id: `o${i}`, nom: `O${i}` }));
    const de = (k: number) => lectureOffres(os(k).flatMap((o, i) => e(o, i === 0 ? 6 : 0, i === 0 ? 0 : 6)), os(k));
    expect(de(PERSONAS_NIVEAU_DE_BASE).niveau).toBe(NIVEAU_LECTURE_PERSONA);
    expect(de(PERSONAS_NIVEAU_DE_BASE + 1).niveau).toBe(NIVEAU_LECTURE_PERSONA_NOMBREUX);
    const trop = de(MAX_PERSONAS_LECTURE + 1);
    expect(trop.niveau).toBeNull();
    expect(trop.groupes.every((g) => g.lecture === 'trop_de_personas')).toBe(true);
    expect(trop.phrase).toBe(`7 offres ont assez de verdicts · au-delà de ${MAX_PERSONAS_LECTURE}, la règle n’est pas mesurée · elle se tait.`);
  });
  it('la référence trop mince · muette', () => {
    expect(lectureOffres([...e(A, 5, 0), ...e(null, 0, MIN_REFERENCE_PERSONA - 1)], [A]).groupes[0]!.lecture).toBe('reference');
  });
  it('la règle dite à l’écran · les seuils du module des personas, mots de l’offre', () => {
    expect(regleLectureOffres()).toBe('Règle · au moins 4 variantes tranchées au protocole pour une offre et 4 dans le reste de la marque · l’intervalle de l’offre doit exclure celui du reste (niveau 0,95, 0,975 au-delà de 4 offres lues, silence au-delà de 6).');
    expect(regleLecturePersonas()).toBe('Règle · au moins 4 variantes tranchées au protocole pour un persona et 4 dans le reste de la marque · l’intervalle du persona doit exclure celui du reste (niveau 0,95, 0,975 au-delà de 4 personas lus, silence au-delà de 6).');
  });
  it('RÉUTILISÉE, pas recopiée · sur 300 jeux tirés, la lecture par offre et la lecture par persona rendent les mêmes groupes, comptes, intervalles et verdicts', () => {
    let graine = 7;
    const hasard = () => { graine = (graine * 1103515245 + 12345) % 2 ** 31; return graine / 2 ** 31; };
    for (let t = 0; t < 300; t++) {
      const k = 1 + Math.floor(hasard() * 8);
      const gs = Array.from({ length: k }, (_, i) => ({ id: `g${i}`, nom: `G${i}` }));
      const en = Array.from({ length: Math.floor(hasard() * 60) }, () => {
        const g = hasard() < 0.15 ? null : gs[Math.floor(hasard() * k)]!;
        const r = hasard();
        return { g, issue: r < 0.15 ? null : r < 0.45 ? ('gagne' as const) : ('perd' as const) };
      });
      const o = lectureOffres(en.map((x) => ({ offre: x.g, issue: x.issue })), gs);
      const p = lecturePersonas(en.map((x) => ({ persona: x.g, issue: x.issue })), gs);
      expect([o.parle, o.niveau, o.eligibles, o.tranchees, o.sansGroupe]).toEqual([p.parle, p.niveau, p.eligibles, p.tranchees, p.sansPersona]);
      expect(o.groupes.map((g) => [g.ref.id, g.lecture, g.k, g.n, g.intervalle, g.reference])).toEqual(p.groupes.map((g) => [g.persona.id, g.lecture, g.k, g.n, g.intervalle, g.reference]));
    }
  });
});

/* ───────────── l'erreur de famille, à travers `lectureOffres` elle-même ───────────── */

const binom = (n: number, p: number) => { const o: number[] = []; let c = 1; for (let k = 0; k <= n; k++) { if (k > 0) c = (c * (n - k + 1)) / k; o.push(c * p ** k * (1 - p) ** (n - k)); } return o; };
/** P(au moins une offre se détache à tort) · K offres de n verdicts, U sans offre, toutes au taux p0 · en appelant la VRAIE lecture. */
function erreurFamilleOffres(K: number, n: number, U: number, p0: number): number {
  const d = binom(n, p0), du = binom(U, p0);
  const os = Array.from({ length: K }, (_, i) => ({ id: `o${i}`, nom: `O${i}` }));
  const ks = new Array<number>(K).fill(0);
  let err = 0;
  const rec = (i: number, pr: number) => {
    if (i === K) {
      for (let u = 0; u <= U; u++) {
        const en = [...os.flatMap((o, j) => e(o, ks[j]!, n - ks[j]!)), ...e(null, u, U - u)];
        if (lectureOffres(en, os).parle) err += pr * du[u]!;
      }
      return;
    }
    for (let k = 0; k <= n; k++) { ks[i] = k; rec(i + 1, pr * d[k]!); }
  };
  rec(0, 1);
  return err;
}

describe('les seuils mesurés tiennent pour les offres · erreur de famille exacte sous 15 %', () => {
  it('K = 2 à 4 offres, n = 4 à 6, U = 0 ou 4, taux 0,1 à 0,5', () => {
    let pire = 0;
    for (const K of [2, 3, 4]) for (const n of K === 4 ? [4, 5] : [4, 6]) for (const U of [0, 4]) for (const p0 of [0.1, 0.3, 0.5]) pire = Math.max(pire, erreurFamilleOffres(K, n, U, p0));
    expect(pire).toBeGreaterThan(0);
    expect(pire).toBeLessThan(0.15);
  }, 60_000);
});

/* ───────────────────────── entrées · lots suivis seulement ───────────────────────── */

const ad = (id: string, v: 'winner' | 'loser' | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'live', hypothese: 'h', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: null, statut: 'computed', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null, ...o,
});
const lot = (id: string, ads: FaitsAdSpatial[], o: Partial<FaitsLotSpatial> = {}): FaitsLotSpatial => ({ id, numero: 1, but: null, statut: 'testing', lanceLe: '2026-10-01T00:00:00Z', ads, protocole: null, ...o });

describe('entrées de la lecture par offre · les lots suivis, le témoin sans issue', () => {
  it('un historique importé n’entre pas', () => {
    const en = entreesLectureOffres([lot('l1', [ad('a1', 'winner'), ad('t', 'winner', { variable: 'none_control' })]), lot('imp', [ad('i1', 'winner')], { statut: 'analyzed', lanceLe: null })], () => A);
    expect(en).toEqual([{ offre: A, issue: 'gagne' }, { offre: A, issue: null }]);
  });
});
