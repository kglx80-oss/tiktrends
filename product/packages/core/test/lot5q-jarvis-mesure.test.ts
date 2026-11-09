import { describe, expect, it } from 'vitest';
import {
  BORNE_MESURE_JARVIS, EFFECTIF_MIN_MESURE_JARVIS, EXEMPLES_PAR_PAGE_JARVIS, FIN_CORRIGER, FIN_TESTER, LIBELLE_CORRIGER, LIBELLE_TESTER, MESURE_AJOUTE_JARVIS,
  MESURE_EXTRACTION_JARVIS, MESURE_TEMPS_MESURE_JARVIS, RAISON_SANS_VARIANTE_STUDIO, RAISON_TESTER_FERME, REFUS_GESTE_JARVIS,
  ajouteEnTete, classerReponseJarvis, comparaisonBanc, correctionDepuisReponse, extraitAnonymise, gestesEssaiTexteJarvis, lienCorrigerJarvis, lienTesterJarvis,
  lireFiltreMesureJarvis, lireGesteEssaiJarvis, mesurerExtractionJarvis, preparationCorrigerJarvis, preparationTesterJarvis, reponseConseille, variableDesignee,
  vueMesureJarvis, wilsonInterval, type ReponseStockee, type VarianteEssaiJarvis,
} from '../src';
import { CORPUS_AJOUTE_JARVIS, CORPUS_CONTROLE_JARVIS, CORPUS_REPONSES_JARVIS } from './fixtures/jarvis-reponses';

/**
 * Lot 5 quater V5 · Jarvis mesuré sur ses vraies réponses, « Tester », « Corriger
 * le texte », « ajoute ». Règles PURES du noyau · aucun modèle, aucune base.
 */

const table = (m: ReturnType<typeof mesurerExtractionJarvis>) => Object.fromEntries([...m.lignes, m.total].map(({ genre, ...x }) => [genre, x]));

describe('« ajoute » · un conseil en TÊTE de proposition seulement', () => {
  it('le corpus « ajoute » · mesure refaite = `MESURE_AJOUTE_JARVIS`, aucun pré-choix faux (ni sur les deux autres corpus)', () => {
    expect(table(mesurerExtractionJarvis(CORPUS_AJOUTE_JARVIS))).toEqual(MESURE_AJOUTE_JARVIS);
    for (const c of [CORPUS_AJOUTE_JARVIS, CORPUS_REPONSES_JARVIS, CORPUS_CONTROLE_JARVIS]) expect(mesurerExtractionJarvis(c).total.fausse, 'pré-choix faux').toBe(0);
    // Le conseil d'une variable que #1054 manquait au réglage est repris · le tableau du module le dit.
    expect(MESURE_EXTRACTION_JARVIS.reglage.une).toEqual({ n: 34, rienDeSur: 2, juste: 32, fausse: 0 });
  });
  it('impératif en tête · début, après « : », après une introduction sans verbe · jamais un sujet, « et », une virgule d’énumération, un participe, « ajoute à cela »', () => {
    for (const t of ['ajoute une preuve', 'prochain test : ajoute une preuve', 'pour la v3, ajoute une preuve', 'ensuite, ajoute une preuve', '- ajoute une preuve', 'ajoutez une preuve', 'ajouter une preuve en ouverture']) expect(ajouteEnTete(t), t).toBe(true);
    for (const t of ['la v2 ajoute une preuve', 'la v1 garde l\'accroche, ajoute une preuve et gagne', 'garde l\'offre et ajoute une preuve', 'ajoute a cela que la v3 gagne', 'la v1, qui ajoute une voix off, retient', 'elle ajoute une remise']) expect(ajouteEnTete(t), t).toBe(false);
    expect(variableDesignee('Ajouté en fin de vidéo, le témoignage ne sert à rien.'), 'participe passé').toBeNull();
    expect(variableDesignee('La V1 gagne. Ajoute un témoignage client.')).toBe('proof');
    expect(reponseConseille('La V2 ajoute un témoignage et gagne.')).toBe(false);
  });
});

/* ───────────────────────── l'écran de mesure ───────────────────────── */

const PAR_CAUSE: Record<string, string> = {
  sure: 'La V1 gagne. Teste une nouvelle accroche, plus directe.',
  aucun_conseil: 'La V1 gagne nettement · 18 € par achat contre 31 €.',
  negation: 'Ne change pas l’accroche, elle fonctionne.',
  hors_liste: 'Teste une nouvelle couleur de fond, plus chaude.',
  plusieurs: 'Teste une nouvelle accroche et une autre offre.',
  pub_ambigue: 'Teste une nouvelle accroche sur la V1 ou sur la V2.',
};

describe('les causes de silence · la règle rejouée telle quelle', () => {
  it('chaque cause a son cas · et la classe « sûre » rend la variable', () => {
    for (const [cle, t] of Object.entries(PAR_CAUSE)) expect(classerReponseJarvis(t).classe, t).toBe(cle);
    expect(classerReponseJarvis(PAR_CAUSE.sure!).variables).toEqual(['hook']);
    expect(classerReponseJarvis(PAR_CAUSE.negation!).variables, 'les variables niées sont dites').toEqual(['hook']);
    expect(classerReponseJarvis(PAR_CAUSE.pub_ambigue!).codes).toEqual(['v1', 'v2']);
  });
  it('les corpus · « sûre » exactement là où l’extraction présélectionne', () => {
    for (const r of [...CORPUS_REPONSES_JARVIS, ...CORPUS_CONTROLE_JARVIS, ...CORPUS_AJOUTE_JARVIS]) {
      const c = classerReponseJarvis(r.texte);
      expect(c.classe === 'sure' || c.classe === 'pub_ambigue', r.texte).toBe(variableDesignee(r.texte) !== null);
    }
  });
});

const NOMS = ['Maison Beta', 'Lumina'];
function semis(): ReponseStockee[] {
  // 3 sûres, 2 aucun conseil, 1 négation, 1 hors liste, 2 plusieurs, 1 pub ambiguë · 4 d'un autre membre (comptées, jamais en exemple).
  const l: Array<[string, boolean]> = [
    [PAR_CAUSE.sure!, true], [PAR_CAUSE.sure!, true], ['La V2 gagne. Teste un CTA plus concret chez Maison Beta, voir https://exemple.fr/x ou k@x.fr.', true],
    [PAR_CAUSE.aucun_conseil!, true], ['SECRET_AUTRE_MEMBRE · la V3 gagne.', false],
    [PAR_CAUSE.negation!, true], [PAR_CAUSE.hors_liste!, false],
    [PAR_CAUSE.plusieurs!, true], [PAR_CAUSE.plusieurs!, false], [PAR_CAUSE.pub_ambigue!, false],
  ];
  return l.map(([texte, mienne], i) => ({ texte, mienne, le: `2026-11-0${(i % 9) + 1}T10:00:00Z` }));
}

describe('la vue · chiffres justes, exemples de la personne seulement, anonymisés, paginés', () => {
  it('n, rien de sûr, causes, intervalle, comparaison au banc', () => {
    const v = vueMesureJarvis(semis(), { classe: null, page: 1, noms: NOMS });
    expect([v.n, v.rienDeSur, v.tronque]).toEqual([10, 7, false]);
    expect(Object.fromEntries(v.causes.map((c) => [c.cle, c.n]))).toEqual({ sure: 3, aucun_conseil: 2, negation: 1, hors_liste: 1, plusieurs: 2, pub_ambigue: 1 });
    expect(v.taux?.pct).toBe(70);
    const iv = { lo: wilsonInterval(7, 10, 0.975).lo, hi: wilsonInterval(7, 10, 0.975).hi };
    expect([v.taux!.bas, v.taux!.haut]).toEqual([Math.round(iv.lo * 1000) / 10, Math.round(iv.hi * 1000) / 10]);
    expect(v.comparaison, 'sous l’effectif minimal, on se tait').toContain('Trop peu de réponses pour comparer au banc (10 sur 30 au moins)');
    expect(v.banc).toEqual({ pct: 35.9, n: 64, rienDeSur: 23 });
    expect(v.exemplesPossibles, 'seules les réponses de la personne fournissent des exemples').toBe(6);
    expect(JSON.stringify(v)).not.toContain('SECRET_AUTRE_MEMBRE');
  });
  it('anonymisation · ni marque connue (de l’espace ou d’un autre), ni adresse, ni le fournisseur · tronqué', () => {
    const e = extraitAnonymise('Teste un CTA chez Maison Beta et LUMINA, écris à k@x.fr, vois https://exemple.fr/x, www.site.com, boutique.shop, @compte, 06 12 34 56 78, Trendtrack.', NOMS);
    expect(e).not.toMatch(/Maison Beta|lumina|k@x\.fr|exemple\.fr|site\.com|boutique\.shop|@compte|06 12|trendtrack/i);
    expect(e).toContain('[marque]');
    expect(e).toContain('[adresse]');
    expect([...extraitAnonymise('Teste une accroche. '.repeat(40), [])].length).toBeLessThanOrEqual(220);
    expect(extraitAnonymise('La V1 gagne. Les chiffres sont stables. Teste une accroche. Fin.', []), 'la phrase où la règle se décide').toBe('Teste une accroche. Fin.');
    const v = vueMesureJarvis(semis(), { classe: 'sure', page: 1, noms: NOMS });
    expect(v.exemples.map((x) => x.classe)).toEqual(['sure', 'sure', 'sure']);
    expect(JSON.stringify(v.exemples)).not.toMatch(/Maison Beta|exemple\.fr|k@x/);
  });
  it('pagination · dix par page, liens précédente / suivante, filtre gardé · une valeur forgée est ignorée', () => {
    const beaucoup: ReponseStockee[] = Array.from({ length: 25 }, (_, i) => ({ texte: PAR_CAUSE.sure!, mienne: true, le: `2026-11-01T00:00:${String(i).padStart(2, '0')}Z` }));
    const p1 = vueMesureJarvis(beaucoup, { classe: 'sure', page: 1, noms: [] });
    expect([p1.exemples.length, p1.pages, p1.precedente, p1.suivante]).toEqual([EXEMPLES_PAR_PAGE_JARVIS, 3, null, '/admin/jarvis-mesure?cause=sure&page=2']);
    const p3 = vueMesureJarvis(beaucoup, { classe: 'sure', page: 9, noms: [] });
    expect([p3.page, p3.exemples.length, p3.exemples[0]!.rang, p3.suivante]).toEqual([3, 5, 21, null]);
    expect(lireFiltreMesureJarvis({ cause: 'negation', page: '2' })).toEqual({ classe: 'negation', page: 2 });
    expect(lireFiltreMesureJarvis({ cause: 'DROP TABLE', page: '-1' })).toEqual({ classe: null, page: 1 });
  });
  it('bornée · au plus N réponses lues, et l’écran dit qu’il en manque', () => {
    const trop = Array.from({ length: BORNE_MESURE_JARVIS + 7 }, () => ({ texte: PAR_CAUSE.sure!, mienne: false, le: '2026-11-01T00:00:00Z' }));
    const v = vueMesureJarvis(trop, { classe: null, page: 1, noms: [] });
    expect([v.n, v.tronque]).toEqual([BORNE_MESURE_JARVIS, true]);
  });
  it('la borne N est dérivée de l’intervalle · ±4,3 points à 500 réponses autour du banc, ±17 à 30', () => {
    const demi = (n: number) => { const k = Math.round(n * 0.38); const i = wilsonInterval(k, n, 0.975); return Math.round(((i.hi - i.lo) / 2) * 1000) / 10; };
    expect(demi(BORNE_MESURE_JARVIS)).toBeCloseTo(4.3, 0);
    expect(demi(EFFECTIF_MIN_MESURE_JARVIS)).toBeGreaterThan(16);
  });
  it('comparer au banc · « s’écarte » seulement si l’intervalle EXCLUT son taux', () => {
    expect(comparaisonBanc(200, 76)).toContain('Compatible avec le banc');
    expect(comparaisonBanc(200, 140)).toContain('Plus de silences que le banc');
    expect(comparaisonBanc(200, 20)).toContain('Moins de silences que le banc');
  });
  it('rapide · 500 réponses réalistes (≈ 1 200 signes) classées sous le plafond large, le temps mesuré consigné', () => {
    const corpus = [...CORPUS_REPONSES_JARVIS, ...CORPUS_CONTROLE_JARVIS, ...CORPUS_AJOUTE_JARVIS];
    const intro = 'Voici ma lecture du lot. Les chiffres viennent de tes résultats Meta des quatorze derniers jours, la dépense est suffisante pour lire un écart. ';
    const fin = '\n\nPoints de vigilance · la fréquence monte sur la V2, surveille la fatigue créative. Le coût par mille reste stable. Reviens vers moi quand le lot aura trois jours de plus.';
    const reponses = Array.from({ length: BORNE_MESURE_JARVIS }, (_, i) => ({ texte: `${intro.repeat(4)}${corpus[i % corpus.length]!.texte}${fin.repeat(2)}`, mienne: i % 2 === 0, le: '2026-11-01T00:00:00Z' }));
    const longueur = reponses.reduce((s, r) => s + r.texte.length, 0) / reponses.length;
    expect(longueur).toBeGreaterThan(900);
    const t0 = performance.now();
    const v = vueMesureJarvis(reponses, { classe: null, page: 1, noms: NOMS });
    const ms = performance.now() - t0;
    console.info(`[mesure Jarvis] ${v.n} réponses de ${Math.round(longueur)} signes · ${Math.round(ms)} ms (consigné · ${MESURE_TEMPS_MESURE_JARVIS.regleMs.join(' à ')} ms)`);
    expect(v.n).toBe(BORNE_MESURE_JARVIS);
    expect(ms, 'plafond large, machine partagée').toBeLessThan(1000);
  });
});

/* ───────────────────────── « Tester » et « Corriger le texte » ───────────────────────── */

const P = '11111111-1111-4111-8111-111111111111';
const P2 = '22222222-2222-4222-8222-222222222222';
const R = '33333333-3333-4333-8333-333333333333';
const LOT = { type: 'lot' as const, id: '44444444-4444-4444-8444-444444444444' };
const PROJ = { type: 'projet' as const, id: P };
const va = (o: Partial<VarianteEssaiJarvis> & { varianteId: string; nom: string }): VarianteEssaiJarvis => ({ projectId: P, enTest: false, rattachable: true, essai: true, ...o });
const V1 = va({ varianteId: 'aaaaaaaa-0000-4000-8000-000000000001', nom: 'V1', enTest: true, rattachable: false });
const V2 = va({ varianteId: 'aaaaaaaa-0000-4000-8000-000000000002', nom: 'V2', enTest: true, rattachable: false, projectId: P2 });
const IMG = va({ varianteId: 'aaaaaaaa-0000-4000-8000-000000000003', nom: 'Image 1 du lot 1' });
const IMG2 = va({ varianteId: 'aaaaaaaa-0000-4000-8000-000000000004', nom: 'Image 2 du lot 1' });

describe('« Tester » · présent seulement quand la réponse conseille un test d’une variante désignée sûrement', () => {
  it('projet · une variante sans test · le lien vers son rattachement · rien d’autre dans l’adresse que des identifiants', () => {
    const g = gestesEssaiTexteJarvis({ texte: 'Teste l’image 2 du lot 1 dès cette semaine.', reponse: R, contexte: PROJ, variantes: [IMG, IMG2] })!;
    expect(g.tester).toEqual({ libelle: LIBELLE_TESTER, href: lienTesterJarvis(P, PROJ, R), varianteId: IMG2.varianteId, detail: 'Rattacher Image 2 du lot 1 au test' });
    expect(lienTesterJarvis(P, PROJ, R)).toBe(`/studio/projets/${P}?geste=tester&reponse=${R}&contexte=projet&id=${P}#variantes`);
    expect(g.corriger, 'aucune correction conseillée · rien').toBeNull();
  });
  it('lot · la pub nommée a déjà son test · le lot d’essai de SON projet', () => {
    const g = gestesEssaiTexteJarvis({ texte: 'La V2 gagne. Teste-la contre une nouvelle accroche.', reponse: R, contexte: LOT, variantes: [V1, V2] })!;
    expect(g.tester && 'href' in g.tester ? [g.tester.href, g.tester.detail] : g.tester).toEqual([lienTesterJarvis(P2, LOT, R), 'Lot d’essai avec V2']);
  });
  it('rien de sûr · aucun lien, et la phrase dit pourquoi · aucun conseil de test · rien du tout', () => {
    expect(gestesEssaiTexteJarvis({ texte: 'Teste une nouvelle accroche.', reponse: R, contexte: LOT, variantes: [V1, V2] })!.tester).toEqual({ raison: 'Jarvis ne nomme aucune des pubs de départ (V1, V2) · rien n’est présélectionné, choisis la pub puis la variable.' });
    expect(gestesEssaiTexteJarvis({ texte: 'Teste la V3.', reponse: R, contexte: LOT, variantes: [V1], exclus: ['V3'] })!.tester, 'une autre pub du contexte nommée seule').toEqual({ raison: 'Jarvis parle de V3, qui n’est pas une gagnante arbitrée de ce contexte · rien n’est présélectionné, choisis la pub puis la variable.' });
    expect(gestesEssaiTexteJarvis({ texte: 'Teste la V1.', reponse: R, contexte: LOT, variantes: [] })!.tester).toEqual({ raison: `${RAISON_SANS_VARIANTE_STUDIO.charAt(0).toUpperCase()}${RAISON_SANS_VARIANTE_STUDIO.slice(1)}.` });
    expect(gestesEssaiTexteJarvis({ texte: 'Teste la V1.', reponse: R, contexte: LOT, variantes: [{ ...V1, essai: false }] })!.tester).toEqual({ raison: RAISON_TESTER_FERME });
    expect(gestesEssaiTexteJarvis({ texte: 'La V1 gagne nettement. La V1 a été testée la semaine dernière.', reponse: R, contexte: LOT, variantes: [V1] })!.tester, 'un participe n’est pas un conseil').toBeNull();
    expect(gestesEssaiTexteJarvis({ texte: 'Teste la V1.', reponse: 'pas-un-uuid', contexte: LOT, variantes: [V1] }), 'réponse sans identifiant lisible').toBeNull();
    expect(gestesEssaiTexteJarvis({ texte: 'Teste la V1.', reponse: R, contexte: { type: 'resultats', id: 'ensemble' }, variantes: [V1] }), 'un contexte sans ces gestes').toBeNull();
  });
});

describe('« Corriger le texte » · une correction de texte conseillée, une variante sûre, la consigne lue', () => {
  it('la correction lue · type, consigne bornée, texte cité · deux types · rien', () => {
    expect(correctionDepuisReponse('La V1 gagne. Reformule l’accroche : « Dormez enfin, sans pilule ».')).toEqual({ etat: 'sure', type: 'hook', consigne: 'Reformule l’accroche : « Dormez enfin, sans pilule ».', proposition: 'Dormez enfin, sans pilule' });
    expect(correctionDepuisReponse('Corrige le texte de la V2, il promet trop.')).toMatchObject({ etat: 'sure', type: null, proposition: null });
    expect(correctionDepuisReponse('Garde l’accroche, réécris le CTA.')).toMatchObject({ etat: 'sure', type: 'cta' });
    expect(correctionDepuisReponse('Reformule l’accroche et le CTA.')).toEqual({ etat: 'plusieurs', types: ['hook', 'cta'] });
    expect(correctionDepuisReponse('Change l’accroche de la V2.'), 'une itération, pas une correction').toEqual({ etat: 'aucune' });
    expect(correctionDepuisReponse('La V2 corrige le tir avec son accroche.'), '« corrige » descriptif, pas en tête').toEqual({ etat: 'aucune' });
    expect(correctionDepuisReponse('Reformule l’accroche, avec « A » ou « B ».'), 'deux citations · aucune n’est posée').toMatchObject({ etat: 'sure', proposition: null });
  });
  it('sous la réponse · le lien vers l’atelier Textes du projet de la variante · plusieurs textes · la raison', () => {
    const g = gestesEssaiTexteJarvis({ texte: 'Reformule l’accroche de la V2 : « 7 nuits pour dormir enfin ».', reponse: R, contexte: LOT, variantes: [V1, V2] })!;
    expect(g.corriger).toEqual({ libelle: LIBELLE_CORRIGER, href: lienCorrigerJarvis(P2, LOT, R), varianteId: V2.varianteId, detail: 'Hook de V2' });
    expect(lienCorrigerJarvis(P2, LOT, R)).toBe(`/studio/projets/${P2}/textes?geste=corriger&reponse=${R}&contexte=lot&id=${LOT.id}`);
    expect(gestesEssaiTexteJarvis({ texte: 'Reformule l’accroche et le CTA de la V2.', reponse: R, contexte: LOT, variantes: [V1, V2] })!.corriger).toEqual({ raison: 'Jarvis fait corriger plusieurs textes à la fois (Hook, CTA) · rien n’est pré-rempli, corrige-les un par un dans l’atelier.' });
  });
});

describe('l’écran d’arrivée · la même règle rejouée, la variante dans CE projet, rien d’enregistré', () => {
  const admises = () => ['hook', 'offer', 'cta'];
  it('« Tester » · rattacher (la variable cochée si admise) · lot d’essai (accroche) · autre projet → la phrase de refus', () => {
    expect(preparationTesterJarvis('Teste l’image 1 du lot 1 avec une nouvelle accroche.', { projectId: P, variantes: [IMG, IMG2], admises })).toEqual({
      varianteId: IMG.varianteId, mode: 'rattacher', variable: 'hook', essaiVariable: null,
      note: `Préparé depuis Jarvis · Image 1 du lot 1, prête à être rattachée à un test · la variable que Jarvis désigne est cochée · relis chaque champ. ${FIN_TESTER}`,
    });
    expect(preparationTesterJarvis('Teste l’image 1 du lot 1 avec une autre musique.', { projectId: P, variantes: [IMG, IMG2], admises }).variable, 'non admise · rien de coché').toBeNull();
    expect(preparationTesterJarvis('La V1 gagne. Teste-la avec une nouvelle accroche.', { projectId: P, variantes: [V1], admises })).toMatchObject({ varianteId: V1.varianteId, mode: 'essai', essaiVariable: 'accroche' });
    expect(preparationTesterJarvis('Teste la V2.', { projectId: P, variantes: [V1, V2], admises }).note, 'une adresse vers un autre projet').toBe(REFUS_GESTE_JARVIS);
    expect(preparationTesterJarvis('La V1 gagne.', { projectId: P, variantes: [V1], admises }).varianteId, 'aucun conseil de test').toBeNull();
  });
  it('« Corriger le texte » · la consigne et le texte cité · autre projet → refus · rien de sûr → rien', () => {
    expect(preparationCorrigerJarvis('Reformule l’accroche de la V1 : « Dormez enfin ».', { projectId: P, variantes: [V1, V2] })).toEqual({
      varianteId: V1.varianteId, type: 'hook', consigne: 'Reformule l’accroche de la V1 : « Dormez enfin ».', proposition: 'Dormez enfin',
      note: `Préparé depuis Jarvis pour V1 · le texte que Jarvis propose est dans le champ « Écrire à la main », relis-le. ${FIN_CORRIGER}`,
    });
    expect(preparationCorrigerJarvis('Reformule l’accroche de la V2.', { projectId: P, variantes: [V1, V2] }).note).toBe(REFUS_GESTE_JARVIS);
    expect(preparationCorrigerJarvis('Reformule l’accroche.', { projectId: P, variantes: [V1, IMG] })).toMatchObject({ varianteId: null, consigne: null, proposition: null });
  });
  it('l’adresse · ok, absente, ou refusée à la moindre forgerie', () => {
    const sp = Object.fromEntries(new URL(`http://x${lienTesterJarvis(P, LOT, R)!}`).searchParams);
    expect(lireGesteEssaiJarvis(sp, 'tester')).toEqual({ etat: 'ok', reponse: R, contexte: LOT });
    expect(lireGesteEssaiJarvis({}, 'tester')).toEqual({ etat: 'absente' });
    expect(lireGesteEssaiJarvis(sp, 'corriger'), 'un autre geste').toEqual({ etat: 'refus' });
    expect(lireGesteEssaiJarvis({ ...sp, reponse: 'x' }, 'tester')).toEqual({ etat: 'refus' });
    expect(lireGesteEssaiJarvis({ ...sp, contexte: 'resultats', id: 'ensemble' }, 'tester')).toEqual({ etat: 'refus' });
  });
});
