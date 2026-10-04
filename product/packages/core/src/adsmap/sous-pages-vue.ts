import { DEFAULT_VERDICT_CONFIG, type VerdictConfig } from './verdict';

/**
 * Sous-pages Adsmap · deux règles d'écran (recette #106). Pur.
 */

/**
 * Lots · « Marquer comme lancé » · le client ne vérifiait que les ads
 * bloquantes, le serveur exige que TOUTES soient prêtes · le bouton restait
 * cliquable avant « Préparer », pour échouer ensuite. Même règle des deux côtés,
 * et la raison est dite à l'écran (un `title` ne se lit pas au doigt).
 */
export function etatLancementLot(p: { statutLot: string; ads: Array<{ status: string }> }): { lancable: boolean; raison: string | null } {
  if (p.statutLot === 'testing' || p.statutLot === 'analyzed') return { lancable: false, raison: 'Ce lot est déjà lancé.' };
  if (!p.ads.length) return { lancable: false, raison: 'Ajoute au moins une ad au lot avant de le lancer.' };
  const pasPretes = p.ads.filter((a) => a.status !== 'ready' && a.status !== 'live').length;
  if (pasPretes) return { lancable: false, raison: `${pasPretes} ad(s) pas encore prête(s) · « Préparer le lot » d’abord, il dira ce qui manque à chacune.` };
  return { lancable: true, raison: null };
}

/**
 * Protocole · « Proposer des seuils depuis mes 30 derniers jours » remplaçait
 * TOUT le formulaire par les valeurs par défaut (structure, nom de campagne,
 * règle d'audience, durée), et même les seuils quand aucune donnée réelle
 * n'existait. Le geste ne touche plus qu'à ce qu'il MESURE · le CPA cible et les
 * indicateurs avancés calculés, et le budget par ad qui en découle. Sans donnée
 * réelle, rien n'est écrasé (les notes disent pourquoi).
 */
export function appliquerSuggestionSeuils<P extends { dailyBudgetPerAd: number }>(
  actuel: { protocol: P; verdict: VerdictConfig },
  s: { protocol: { dailyBudgetPerAd: number }; verdict: VerdictConfig; fromRealData: boolean },
): { protocol: P; verdict: VerdictConfig } {
  if (!s.fromRealData) return actuel;
  const d = DEFAULT_VERDICT_CONFIG;
  const li = { ...actuel.verdict.leadingIndicators };
  for (const k of ['hookRate', 'holdRate', 'ctr'] as const) {
    if (s.verdict.leadingIndicators[k] !== d.leadingIndicators[k]) li[k] = s.verdict.leadingIndicators[k];
  }
  return {
    protocol: { ...actuel.protocol, dailyBudgetPerAd: s.protocol.dailyBudgetPerAd },
    verdict: {
      ...actuel.verdict,
      targetCpa: s.verdict.targetCpa !== d.targetCpa ? s.verdict.targetCpa : actuel.verdict.targetCpa,
      leadingIndicators: li,
    },
  };
}
