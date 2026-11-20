/**
 * ADSMAP · contrôle de protocole (§6.2 du cahier des charges).
 *
 * Ce fichier décide d'une seule chose, mais elle gouverne tout le reste : les
 * verdicts d'un lot sont-ils COMPARABLES entre eux ?
 *
 * En CBO, ou dès qu'une annonce reçoit trois fois le budget d'une autre, la
 * meilleure ad du lot est celle que Meta a choisi de servir, pas celle qui
 * convainc. Un verdict absolu n'a alors aucun sens · le moteur le sait et se
 * dégrade (RELATIVE_WINNER, INSUFFICIENT_DELIVERY) au lieu de mentir.
 *
 * Pur : les données arrivent déjà lues.
 */

export type ProtocolStructure = 'abo_one_adset_per_ad' | 'abo_single_adset' | 'cbo_tolerated';

export interface ProtocolRules {
  structure: ProtocolStructure;
  campaignNamePattern: string;      // ex : « [ADSMAP] TEST {brand} B{batch} »
  budgetVarianceTolerance: number;  // ex : 0.2
  minSpendShare: number;            // ex : 0.35 · part de 1/n en dessous de laquelle il y a sous-diffusion
}

/** Une annonce du lot, telle que la synchro la remonte. */
export interface ProtocolAd {
  adId: string;
  adName: string;
  adsetId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  adsetDailyBudget: number | null;
  spend: number;
  /** `null` · INCONNU (ensemble jamais lu chez Meta, ni sur l'instance ni au relais du lot) · absent · non fourni. */
  campaignBudgetOptimization?: boolean | null;
}

export type ViolationCode =
  | 'campaign_name'      // le lot ne tourne pas dans la campagne attendue
  | 'cbo'                // budget piloté au niveau campagne
  | 'cbo_inconnu'        // on ne sait pas si le budget est piloté par la campagne (ensembles non lus)
  | 'shared_adset'       // plusieurs annonces dans le même ad set
  | 'budget_variance'    // budgets d'ad sets trop dispersés
  | 'spend_share'        // une annonce n'a pas reçu sa part
  | 'no_data';           // rien à contrôler

export interface ProtocolViolation {
  code: ViolationCode;
  /** Message affichable tel quel, avec ce qu'il faut faire. */
  message: string;
  /** Annonces concernées · sert à marquer les verdicts individuellement. */
  adIds: string[];
}

export interface ProtocolCheck {
  compliant: boolean;
  violations: ProtocolViolation[];
  /** Part de dépense de chaque annonce, rapportée à la part attendue (1/n). */
  spendShare: Record<string, number>;
  /** Annonces sous-diffusées · leur verdict devient INSUFFICIENT_DELIVERY. */
  underDelivered: string[];
}

const pct = (x: number) => `${Math.round(x * 100)} %`;
const eur = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 0 });

/**
 * Le nom de campagne attendu, motif résolu.
 * `{brand}` et `{batch}` sont remplacés ; le reste est comparé sans tenir compte
 * de la casse ni des espaces multiples, parce que personne ne recopie un nom au
 * caractère près.
 */
export function resolveCampaignName(pattern: string, brand: string, batch: number): string {
  return pattern.replace(/\{brand\}/gi, brand).replace(/\{batch\}/gi, String(batch));
}

const loose = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Contrôle un lot.
 *
 * On ne cherche pas la conformité pour elle-même : chaque violation dit ce qu'elle
 * coûte (« les verdicts de ce lot ne seront que relatifs ») et ce qu'il faut faire.
 */
export function checkProtocol(
  ads: ProtocolAd[],
  rules: ProtocolRules,
  ctx: { brandName: string; batchNumber: number },
): ProtocolCheck {
  const violations: ProtocolViolation[] = [];
  const spendShare: Record<string, number> = {};

  if (!ads.length) {
    return {
      compliant: false,
      violations: [{ code: 'no_data', message: 'Aucune annonce rattachée à ce lot dans le compte publicitaire · rien à contrôler.', adIds: [] }],
      spendShare, underDelivered: [],
    };
  }

  // Part de dépense · rapportée à la part égale attendue (1/n).
  const total = ads.reduce((a, x) => a + x.spend, 0);
  const attendue = total / ads.length;
  for (const a of ads) spendShare[a.adId] = attendue > 0 ? a.spend / attendue : 0;

  // 1 · Nom de campagne · on ne bloque pas, on signale : le lot peut tourner
  // ailleurs pour de bonnes raisons, mais alors le rattachement est fragile.
  const attendu = loose(resolveCampaignName(rules.campaignNamePattern, ctx.brandName, ctx.batchNumber));
  const horsCampagne = ads.filter((a) => !a.campaignName || !loose(a.campaignName).includes(attendu.split('{')[0]!.trim() || attendu));
  if (attendu && horsCampagne.length === ads.length) {
    violations.push({
      code: 'campaign_name',
      message: `Aucune annonce ne tourne dans une campagne nommée « ${resolveCampaignName(rules.campaignNamePattern, ctx.brandName, ctx.batchNumber)} ». Le rattachement se fait alors au nom d'annonce seul, ce qui est plus fragile.`,
      adIds: horsCampagne.map((a) => a.adId),
    });
  }

  // 2 · CBO · c'est la violation qui coûte le plus cher, donc on la nomme en clair.
  const cbo = ads.filter((a) => a.campaignBudgetOptimization);
  if (cbo.length && rules.structure !== 'cbo_tolerated') {
    violations.push({
      code: 'cbo',
      message: `Le budget est piloté au niveau de la campagne (CBO). Meta concentre alors la dépense sur une ou deux annonces : les autres n'ont jamais leur chance, et la « gagnante » est celle que l'algorithme a choisi de servir. Les verdicts de ce lot resteront relatifs.`,
      adIds: cbo.map((a) => a.adId),
    });
  }

  // 2 bis · CBO INCONNU · une annonce qui a dépensé sans qu'on sache qui pilote son
  // budget ne se compare pas · le silence vaut mieux qu'un « gagnant » que Meta a
  // peut-être choisi (§6.1). Une annonce sans dépense ne biaise rien · sa
  // sous-diffusion est dite à part (5).
  const inconnu = ads.filter((a) => a.campaignBudgetOptimization === null && a.spend > 0);
  if (inconnu.length && rules.structure !== 'cbo_tolerated') {
    violations.push({
      code: 'cbo_inconnu',
      message: `Le CBO de ${inconnu.length} annonce(s) n'est pas établi · leur ensemble n'a pas été lu chez Meta (droits ou quota, ensemble archivé, annonce terminée que la synchro ne relit plus) et aucune autre annonce de leur campagne ne le dit · on ne sait pas si leur budget est piloté par la campagne. Les verdicts de ce lot resteront relatifs tant qu'il n'est pas établi · par une lecture réussie des ensembles de cette campagne, ou par un export Ads Manager avec la colonne budget de l'ensemble.`,
      adIds: inconnu.map((a) => a.adId),
    });
  }

  // 3 · Un ad set par annonce.
  if (rules.structure === 'abo_one_adset_per_ad') {
    const parAdset = new Map<string, string[]>();
    for (const a of ads) {
      if (!a.adsetId) continue;
      parAdset.set(a.adsetId, [...(parAdset.get(a.adsetId) ?? []), a.adId]);
    }
    const partages = [...parAdset.values()].filter((v) => v.length > 1);
    if (partages.length) {
      violations.push({
        code: 'shared_adset',
        message: `${partages.flat().length} annonces partagent un même ad set. Le budget s'y répartit tout seul, donc leurs résultats ne se comparent pas · un ad set par annonce.`,
        adIds: partages.flat(),
      });
    }
  }

  // 4 · Dispersion des budgets d'ad sets.
  const budgets = ads.map((a) => a.adsetDailyBudget).filter((b): b is number => typeof b === 'number' && b > 0);
  if (budgets.length >= 2) {
    const min = Math.min(...budgets);
    const max = Math.max(...budgets);
    const ecart = min > 0 ? (max - min) / min : Infinity;
    if (ecart > rules.budgetVarianceTolerance) {
      violations.push({
        code: 'budget_variance',
        message: `Les budgets quotidiens vont de ${eur(min)} € à ${eur(max)} € (${pct(ecart)} d'écart, toléré ${pct(rules.budgetVarianceTolerance)}). À budgets inégaux, la comparaison mesure le budget autant que la créa.`,
        adIds: ads.filter((a) => a.adsetDailyBudget === max || a.adsetDailyBudget === min).map((a) => a.adId),
      });
    }
  }

  // 5 · Sous-diffusion · une annonce qui n'a pas reçu sa part n'a pas été testée.
  const sous = ads.filter((a) => spendShare[a.adId]! < rules.minSpendShare);
  if (sous.length) {
    violations.push({
      code: 'spend_share',
      message: `${sous.length} annonce(s) ont reçu moins de ${pct(rules.minSpendShare)} de la dépense attendue : elles n'ont pas été testées, elles ont été ignorées. Leur verdict sera « sous-diffusée ».`,
      adIds: sous.map((a) => a.adId),
    });
  }

  // Le nom de campagne seul ne disqualifie pas le lot : c'est une gêne de
  // rattachement, pas un biais de mesure.
  const bloquantes = violations.filter(estBloquante);

  return {
    compliant: bloquantes.length === 0,
    violations,
    spendShare,
    underDelivered: sous.map((a) => a.adId),
  };
}

/** Une violation qui retire la comparabilité du lot · le nom de campagne et la sous-diffusion n'en retirent pas. */
const estBloquante = (v: { code: string }) => v.code !== 'campaign_name' && v.code !== 'spend_share';

/**
 * Vrai si la SEULE chose qui retire sa comparabilité au lot est un CBO inconnu ·
 * rien n'est à corriger dans la structure, c'est la lecture des ensembles qu'il
 * faut rétablir. Lit les violations telles qu'écrites (`protocol_check_json`).
 */
export function protocoleSeulementInconnu(violations: ReadonlyArray<{ code: string }> | null | undefined): boolean {
  const b = (violations ?? []).filter(estBloquante);
  return b.length > 0 && b.every((v) => v.code === 'cbo_inconnu');
}

/** Résumé d'une phrase pour l'entête du lot et la file de décisions. */
export function summarizeProtocol(check: ProtocolCheck): string {
  if (check.violations.some((v) => v.code === 'no_data')) return 'Lot non rattaché au compte publicitaire.';
  if (check.compliant && !check.violations.length) return 'Protocole respecté · les verdicts de ce lot sont comparables.';
  if (check.compliant) return 'Protocole respecté, avec des réserves mineures · les verdicts restent comparables.';
  const cbo = check.violations.find((v) => v.code === 'cbo');
  if (cbo) return 'Budget piloté par la campagne : les verdicts de ce lot ne seront que relatifs.';
  if (protocoleSeulementInconnu(check.violations)) return 'CBO non établi · les verdicts de ce lot ne seront que relatifs tant qu’il ne l’est pas.';
  return `${check.violations.length} écart(s) au protocole · les verdicts de ce lot ne sont pas comparables entre eux.`;
}
