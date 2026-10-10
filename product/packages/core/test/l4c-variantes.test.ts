import { describe, it, expect } from 'vitest';
import {
  sortiesOrdonnees, rangsDesLots, libelleVariante, natureDuMime, admissibiliteVariante, rangementVersion, traceDuBrief,
  validerSaisieTest, decisionRattachement, isolationVariable, champsCreatifsModifies, lireRegistre, ajouterAuRegistre, parentParIteration,
  lireResultat, arbitrerRelecture, briefIteration, vueVariantes,
  type VerdictLu, type DonneesVariantes, type EntreeRegistreIteration,
} from '../src/studios/variantes';
import { contenuVide } from '../src/studios/document';

/**
 * L4-C · noyau pur des variantes, des tests et de l'apprentissage.
 * FLOW-07 (rangement), FLOW-08 (image 3 du lot 4), FLOW-09 (inconclusif, brief
 * suivant), contribution FLOW-01 (hypothèse et sources jusqu'à la variante).
 */

const BRIEF = {
  objective: 'Faire acheter le sérum', audience: 'Peaux mixtes 25-35', hypothesisId: 'h1', testedVariable: 'hook',
  facts: [
    { id: 'h1', claim: 'Une accroche douleur fait mieux cliquer qu’une accroche bénéfice', sourceIds: ['src_veille_2', 'src_veille_1'], kind: 'hypothesis', confidence: 'medium' },
    { id: 'f2', claim: 'Le concurrent montre la texture', sourceIds: ['src_veille_1'], kind: 'observed', confidence: 'high' },
  ],
  invariants: ['flacon visible'], variables: ['hook'], references: [], composition: 'flacon au centre', styleIntent: 'lumière douce',
  texts: ['Marre des boutons ?'], formats: ['4:5'], exclusions: ['aucune promesse médicale'],
};
const contenu = (brief: Record<string, unknown> = BRIEF) => ({ ...contenuVide(), brief });

describe('FLOW-08 · une génération de quatre images donne quatre variantes nommées précisément', () => {
  const lignes = [{ operation: 'image:a' }, { operation: 'image:b' }, { operation: 'composition' }, { operation: 'image:c' }, { operation: 'image:d' }];
  const assets = { 'image:d': 'asset-d', 'image:a': 'asset-a', 'image:c': 'asset-c', 'image:b': 'asset-b' };

  it('l’ordre est celui des lignes du devis, restreint aux sorties livrées', () => {
    const s = sortiesOrdonnees(lignes, assets);
    expect(s.map((x) => [x.position, x.assetId])).toEqual([[1, 'asset-a'], [2, 'asset-b'], [3, 'asset-c'], [4, 'asset-d']]);
    expect(new Set(s.map((x) => x.assetId)).size, 'quatre sorties distinctes').toBe(4);
    // L'ordre du DEVIS, pas l'ordre alphabétique des opérations.
    const s2 = sortiesOrdonnees([{ operation: 'image:z' }, { operation: 'image:m' }, { operation: 'image:a' }], { 'image:a': 'A', 'image:m': 'M', 'image:z': 'Z' });
    expect(s2.map((x) => `${x.position}:${x.assetId}`)).toEqual(['1:Z', '2:M', '3:A']);
  });

  it('le rang du lot compte tous les lancements, dans l’ordre de création, et ne bouge jamais', () => {
    const jobs = [
      { id: 'j3', createdAt: '2026-10-03T10:00:00Z' }, { id: 'j1', createdAt: '2026-10-01T10:00:00Z' },
      { id: 'j4', createdAt: '2026-10-04T10:00:00Z' }, { id: 'j2', createdAt: '2026-10-02T10:00:00Z' },
    ];
    const r = rangsDesLots(jobs);
    expect(r.get('j4')).toBe(4);
    const r2 = rangsDesLots([...jobs, { id: 'j5', createdAt: '2026-10-05T10:00:00Z' }]);
    expect(r2.get('j4'), 'un lot plus récent ne renumérote pas les anciens').toBe(4);
  });

  it('« Image 3 du lot 4 » · jamais l’identifiant de génération', () => {
    expect(libelleVariante({ position: 3, lot: 4, nature: natureDuMime('image/png') })).toBe('Image 3 du lot 4');
    expect(libelleVariante({ position: 1, lot: 2, nature: natureDuMime('video/mp4') })).toBe('Vidéo 1 du lot 2');
  });
});

describe('FLOW-07 · un résultat ancien reste rangé dans SA version', () => {
  const job = { state: 'completed' as const, qualityStatus: 'pending' as const, projectId: 'p', projectVersionId: 'v2' };
  it('la version de la variante est celle du job, pas la courante', () => {
    const a = admissibiliteVariante({ job, asset: { projectId: 'p', storageState: 'stored' }, assetDansLeJob: true });
    expect(a).toEqual({ ok: true, versionId: 'v2', qualite: 'pending', aRelire: true });
    expect(rangementVersion('v2', 'v5')).toBe('anterieure');
    expect(rangementVersion('v5', 'v5')).toBe('courante');
  });
  it('écartée, non terminée, non stockée ou étrangère au lot · refus nommé', () => {
    expect(admissibiliteVariante({ job: { ...job, qualityStatus: 'rejected' }, asset: { projectId: 'p', storageState: 'stored' }, assetDansLeJob: true })).toMatchObject({ ok: false, code: 'QUALITY_REVIEW_REQUIRED' });
    expect(admissibiliteVariante({ job: { ...job, state: 'running' }, asset: { projectId: 'p', storageState: 'stored' }, assetDansLeJob: true })).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect(admissibiliteVariante({ job, asset: { projectId: 'p', storageState: 'pending' }, assetDansLeJob: true })).toMatchObject({ ok: false, code: 'INVARIANT_CONFLICT' });
    expect(admissibiliteVariante({ job, asset: { projectId: 'p', storageState: 'stored' }, assetDansLeJob: false })).toMatchObject({ ok: false, code: 'MISSING_REFERENCE' });
    expect(admissibiliteVariante({ job: { ...job, qualityStatus: 'passed' }, asset: { projectId: 'p', storageState: 'stored' }, assetDansLeJob: true })).toMatchObject({ ok: true, aRelire: false });
  });
});

describe('FLOW-01 · l’hypothèse et les sources du brief vont jusqu’à la variante', () => {
  it('lit l’hypothèse désignée, la variable et toutes les sources des faits', () => {
    expect(traceDuBrief(BRIEF)).toEqual({ hypothese: BRIEF.facts[0]!.claim, variable: 'hook', hypotheseId: 'h1', sourceIds: ['src_veille_1', 'src_veille_2'] });
    expect(traceDuBrief(null)).toEqual({ hypothese: null, variable: null, hypotheseId: null, sourceIds: [] });
  });
});

describe('Saisie du test · hypothèse, variable, objectif, protocole, période, métrique', () => {
  const ok = { hypothese: 'Une accroche douleur fait mieux cliquer', variable: 'hook', objectif: 'Baisser le CPA', protocole: 'abo_one_adset_per_ad', periodeDebut: '2026-10-10', periodeFin: '2026-10-17', metrique: 'cpa' };
  it('accepte une saisie complète', () => {
    expect(validerSaisieTest(ok, { aUnParent: false })).toMatchObject({ ok: true, saisie: { variable: 'hook', periode: { debut: '2026-10-10', fin: '2026-10-17' } } });
  });
  it('refuse champ par champ, avec le chemin fautif', () => {
    const r = validerSaisieTest({ ...ok, hypothese: 'court', periodeFin: '2026-10-09', metrique: 'likes' }, { aUnParent: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.violations.map((v) => v.chemin).sort()).toEqual(['hypothese', 'metrique', 'periodeFin']);
  });
  it('face à une parente, « rien (témoin) » est refusé · une offre testée exige l’offre', () => {
    expect(validerSaisieTest({ ...ok, variable: 'none_control' }, { aUnParent: true })).toMatchObject({ ok: false, violations: [{ chemin: 'variable' }] });
    expect(validerSaisieTest({ ...ok, variable: 'offer' }, { aUnParent: false })).toMatchObject({ ok: false, violations: [{ chemin: 'offreId' }] });
    expect(validerSaisieTest({ ...ok, periodeFin: '2027-03-01' }, { aUnParent: false })).toMatchObject({ ok: false, violations: [{ chemin: 'periodeFin' }] });
  });
});

describe('Unicité selon le domaine', () => {
  const lien = (variantId: string, adsmapAdId: string, adStatus = 'draft') => ({ linkId: `l-${variantId}-${adsmapAdId}`, variantId, adsmapAdId, adStatus });
  it('double clic · le même lien revient', () => {
    expect(decisionRattachement({ variantId: 'v1', adsmapAdId: null }, [lien('v1', 'ad1')], null)).toMatchObject({ action: 'existant', lien: { adsmapAdId: 'ad1' } });
    expect(decisionRattachement({ variantId: 'v1', adsmapAdId: 'ad1' }, [lien('v1', 'ad1')], lien('v1', 'ad1'))).toMatchObject({ action: 'existant' });
  });
  it('une fiche ne mesure qu’une variante · une variante n’a qu’un test ouvert', () => {
    expect(decisionRattachement({ variantId: 'v2', adsmapAdId: 'ad1' }, [], lien('v1', 'ad1'))).toMatchObject({ action: 'refus', code: 'INVARIANT_CONFLICT' });
    expect(decisionRattachement({ variantId: 'v1', adsmapAdId: 'ad9' }, [lien('v1', 'ad1')], null)).toMatchObject({ action: 'refus' });
  });
  it('un test clos libère la variante', () => {
    expect(decisionRattachement({ variantId: 'v1', adsmapAdId: null }, [lien('v1', 'ad1', 'done')], null)).toEqual({ action: 'creer' });
  });
});

describe('Isolation · un test ne prétend pas isoler une variable si plusieurs champs ont changé', () => {
  it('un seul champ · isolé', () => {
    const enfant = contenu({ ...BRIEF, texts: ['Encore des boutons ?'] });
    expect(isolationVariable(contenu(), enfant, 'hook')).toMatchObject({ statut: 'isole', champs: ['brief.texts'], pretendIsoler: true });
  });
  it('deux champs · ne prétend pas isoler, et le dit', () => {
    const enfant = { ...contenu({ ...BRIEF, texts: ['Encore des boutons ?'] }), styleRef: { lumiere: 'dure' } };
    const i = isolationVariable(contenu(), enfant, 'hook');
    expect(i).toMatchObject({ statut: 'plusieurs', pretendIsoler: false });
    expect(i.champs).toEqual(['brief.texts', 'styleRef']);
    expect(i.phrase).toContain('ne peut pas attribuer son résultat à l’accroche seule');
  });
  it('rien n’a changé (autre tirage du même lot) · aucun · sans parente · sans_parent', () => {
    expect(isolationVariable(contenu(), contenu(), 'hook')).toMatchObject({ statut: 'aucun', pretendIsoler: false });
    expect(isolationVariable(null, contenu(), 'hook')).toMatchObject({ statut: 'sans_parent', pretendIsoler: false });
  });
  it('la variable déclarée et l’hypothèse ne sont pas des champs créatifs', () => {
    expect(champsCreatifsModifies(contenu(), contenu({ ...BRIEF, testedVariable: 'cta', hypothesisId: 'h9' }))).toEqual([]);
  });
});

describe('Registre du projet · test_refs', () => {
  it('conserve les entrées d’autres formes et retrouve la parente d’une version', () => {
    const it1: EntreeRegistreIteration = { type: 'iteration', versionId: 'v3', depuisVersionId: 'v2', parentVariantId: 'var-1', linkId: 'l1', variable: 'hook', variableGardee: true, sourceIds: [], creeLe: '2026-10-07', creePar: 'u' };
    const r0 = [{ kind: 'autre', x: 1 }];
    const r1 = ajouterAuRegistre(r0, it1);
    expect(r1[0]).toEqual({ kind: 'autre', x: 1 });
    const l = lireRegistre(r1);
    expect(l.autres).toEqual([{ kind: 'autre', x: 1 }]);
    expect(parentParIteration(l, 'v3')).toBe('var-1');
    expect(parentParIteration(l, 'v2')).toBeNull();
  });
});

const V = (o: Partial<VerdictLu>): VerdictLu => ({ computed: null, validated: null, comparable: true, failedStage: null, killFlag: null, computedAt: '2026-10-06T00:00:00Z', ...o });

describe('FLOW-09 · lecture du résultat · les règles Adsmap, comparées à la référence', () => {
  it('aucun résultat · inconclusif, même variable', () => {
    const l = lireResultat({ variable: 'hook', isolation: 'sans_parent', verdict: null, parent: null });
    expect(l).toMatchObject({ conclusion: 'inconclusif', motif: 'aucun_resultat', variableSuivante: 'hook', garderVariable: true });
  });
  it('données insuffisantes (seuils Adsmap) · inconclusif, dit comme tel', () => {
    for (const computed of ['inconclusive', 'insufficient_delivery'] as const) {
      const l = lireResultat({ variable: 'hook', isolation: 'isole', verdict: V({ computed }), parent: { verdict: V({ computed: 'loser' }) } });
      expect(l.conclusion).toBe('inconclusif');
      expect(l.motif, 'les seuils Adsmap (minimum d’effectif) tranchent avant tout le reste').toBe('donnees_insuffisantes');
      expect(l.phrase).toMatch(/^Inconclusif · (non concluant|sous-diffusée) : pas assez de données/);
      expect(l.variableSuivante).toBe('hook');
    }
  });
  it('non comparable · un « gagnant » hors protocole reste inconclusif', () => {
    expect(lireResultat({ variable: 'hook', isolation: 'sans_parent', verdict: V({ computed: 'winner', comparable: false }), parent: null })).toMatchObject({ conclusion: 'inconclusif', motif: 'non_comparable', verdictEffectif: 'relative_winner' });
  });
  it('plusieurs champs changés · la variable n’est pas créditée', () => {
    expect(lireResultat({ variable: 'hook', isolation: 'plusieurs', verdict: V({ computed: 'winner' }), parent: { verdict: V({ computed: 'loser' }) } })).toMatchObject({ conclusion: 'inconclusif', motif: 'variable_non_isolee' });
  });
  it('référence absente ou au même niveau · inconclusif (comparer à la référence, jamais à zéro)', () => {
    expect(lireResultat({ variable: 'hook', isolation: 'isole', verdict: V({ computed: 'winner' }), parent: { verdict: null } })).toMatchObject({ conclusion: 'inconclusif', motif: 'reference_absente' });
    expect(lireResultat({ variable: 'hook', isolation: 'isole', verdict: V({ computed: 'winner' }), parent: { verdict: V({ computed: 'inconclusive' }) } })).toMatchObject({ motif: 'reference_absente' });
    expect(lireResultat({ variable: 'hook', isolation: 'isole', verdict: V({ computed: 'loser' }), parent: { verdict: V({ computed: 'loser' }) } })).toMatchObject({ conclusion: 'inconclusif', motif: 'meme_niveau' });
  });
  it('meilleure que la parente, une seule variable changée · soutenue, prochaine variable par les règles Adsmap', () => {
    const l = lireResultat({ variable: 'hook', isolation: 'isole', verdict: V({ computed: 'winner' }), parent: { verdict: V({ computed: 'loser' }) } });
    expect(l).toMatchObject({ conclusion: 'soutenue', reference: 'parente' });
    expect(l.variableSuivante).toBe('opening_visual');
    expect(l.prudence).toContain('pas une preuve de cause');
  });
  it('le verdict validé prime sur le calculé', () => {
    expect(lireResultat({ variable: 'hook', isolation: 'sans_parent', verdict: V({ computed: 'winner', validated: 'loser' }), parent: null })).toMatchObject({ conclusion: 'non_soutenue' });
  });
});

describe('Relecture IA · la règle pure prime sur le modèle', () => {
  const inconclusif = lireResultat({ variable: 'hook', isolation: 'sans_parent', verdict: V({ computed: 'inconclusive' }), parent: null });
  const soutenue = lireResultat({ variable: 'hook', isolation: 'sans_parent', verdict: V({ computed: 'winner' }), parent: null });
  it('données insuffisantes · le modèle ne peut pas conclure', () => {
    expect(arbitrerRelecture(inconclusif, 'supported')).toMatchObject({ conclusion: 'inconclusif', modeleSuivi: false, ecart: expect.stringContaining('les données ne le permettent pas') });
  });
  it('désaccord · inconclusif ; prudence du modèle acceptée ; accord · suivi', () => {
    expect(arbitrerRelecture(soutenue, 'not_supported')).toMatchObject({ conclusion: 'inconclusif', modeleSuivi: false });
    expect(arbitrerRelecture(soutenue, 'inconclusive')).toMatchObject({ conclusion: 'inconclusif', modeleSuivi: true });
    expect(arbitrerRelecture(soutenue, 'supported')).toMatchObject({ conclusion: 'soutenue', modeleSuivi: true, ecart: null });
  });
});

describe('FLOW-09 · le prochain brief garde sources, hypothèse et références ; seule la variable est posée', () => {
  it('copie exacte sauf la variable', () => {
    const r = briefIteration(BRIEF, 'opening_visual');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sourceIds).toEqual(['src_veille_1', 'src_veille_2']);
    const { testedVariable, variables, ...reste } = r.brief;
    const { testedVariable: _t, variables: _v, ...resteParent } = BRIEF;
    expect(reste).toEqual(resteParent);
    expect(testedVariable).toBe('opening_visual');
    expect(variables).toEqual(['hook', 'opening_visual']);
    expect(BRIEF.testedVariable, 'le brief parent n’est pas muté').toBe('hook');
  });
  it('sans brief · refus nommé', () => {
    expect(briefIteration(null, 'hook')).toMatchObject({ ok: false });
  });
});

describe('Vue · états, statuts séparés, rangement', () => {
  const base: DonneesVariantes = {
    projet: { id: 'p', titre: 'Sérum', versionCouranteId: 'v2' },
    versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' }, { id: 'v2', n: 2, parentId: 'v1', creeLe: '2026-10-02' }],
    lots: [], variantes: [],
    adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
    droits: { proposer: true },
    relecture: { disponible: false, raison: 'Aucune release publiée', coutMaxUsd: null },
  };
  const sortie = (position: number, varianteId: string | null = null) => ({ operation: `image:${position}`, position, assetId: `a${position}`, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64), varianteId });

  it('vide puis premier usage', () => {
    expect(vueVariantes(base).etat).toBe('vide');
    const d = { ...base, lots: [{ jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed' as const, qualite: 'requires_review' as const, creeLe: '2026-10-01', attendues: 4, sorties: [1, 2, 3, 4].map((p) => sortie(p)) }] };
    const v = vueVariantes(d);
    expect(v.etat).toBe('premier_usage');
    expect(v.versions[0]).toMatchObject({ titre: 'Version 1', courante: false });
    expect(v.versions[0]!.note).toContain('ne remplacent jamais la version courante');
    expect(v.versions[0]!.lots[0]).toMatchObject({ etatTechnique: 'Fichier enregistré', qualite: 'À revoir' });
    expect(v.versions[0]!.lots[0]!.sorties.map((s) => s.libelle)).toEqual(['Image 1 du lot 1', 'Image 2 du lot 1', 'Image 3 du lot 1', 'Image 4 du lot 1']);
  });

  it('lecteur · aucune sortie choisissable, la raison est dite', () => {
    const d = { ...base, droits: { proposer: false }, lots: [{ jobId: 'j1', lot: 1, versionId: 'v2', etat: 'completed' as const, qualite: 'passed' as const, creeLe: '2026-10-01', attendues: 1, sorties: [sortie(1)] }] };
    expect(vueVariantes(d).versions[0]!.lots[0]!.sorties[0]).toMatchObject({ choisir: false, raison: 'Ton rôle permet de consulter, pas de choisir.' });
  });

  it('génération active · comptée et annoncée', () => {
    const d = { ...base, lots: [{ jobId: 'j2', lot: 2, versionId: 'v2', etat: 'running' as const, qualite: 'pending' as const, creeLe: '2026-10-02', attendues: 4, sorties: [] }] };
    const v = vueVariantes(d);
    expect(v.enCours).toBe(1);
    expect(v.versions[0]!.lots[0]!.message).toContain('4 sorties en préparation');
    expect(v.versions[0]!.lots[0]!.qualite, 'rien à relire tant que le fichier n’est pas enregistré').toBeNull();
  });
});

describe('Coût d’une relecture · annoncé avant le clic, jamais gratuit', () => {
  it('plafond au tarif du modèle, arrondi au centime supérieur, jamais zéro', async () => {
    const { coutMaxRelectureUsd, libelleCoutRelecture } = await import('../src/studios/variantes');
    // 24 000 jetons × 3 $/M + 4 000 × 15 $/M = 0,132 $ → 0,14 $.
    expect(coutMaxRelectureUsd('claude-sonnet-5')).toBe(0.14);
    expect(coutMaxRelectureUsd('modele-simule')).toBeGreaterThan(0);
    expect(libelleCoutRelecture(0.14)).toBe('environ 0,14 $ (estimation) sur le plafond IA, aucun crédit');
  });
});
