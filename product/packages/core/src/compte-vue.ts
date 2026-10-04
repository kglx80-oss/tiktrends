/**
 * Équipe, Usage, Crédits · ce que les écrans de compte affichent (recette #106,
 * sous-lot Équipe/Usage/Crédits/Support). Pur · ni base ni réseau.
 *
 * Mesuré à la lecture et en local avant correctif · motifs machine affichés
 * bruts (« adsmap:propose:… »), allocation et ajustements rangés en « Autre »,
 * répartition calculée sur les 120 derniers mouvements sous un titre « 30 jours »,
 * « Consommé ce cycle » à 100 % avec un historique vide (et négatif au-delà de
 * l'allocation), invitations expirées listées « en attente ».
 */

export interface FamilleMouvement { label: string; icon: string }

/** La famille lisible d'un motif du grand livre (ordre = priorité). */
export function familleMouvement(motif: string): FamilleMouvement {
  const r = motif.toLowerCase();
  if (r.startsWith('adsmap:')) return { label: 'Adsmap', icon: 'map' };
  if (r.startsWith('market:')) return { label: 'Veille', icon: 'search' };
  if (r.includes('rembours')) return { label: 'Remboursement', icon: 'coin' };
  if (r.includes('allocation')) return { label: 'Allocation', icon: 'card' };
  if (r.includes('ajustement')) return { label: 'Ajustement', icon: 'coin' };
  if (r.includes('recharge')) return { label: 'Recharge', icon: 'coin' };
  if (r.includes('abonnement') || r.includes('formule') || r.includes('période de test')) return { label: 'Abonnement', icon: 'card' };
  if (r.includes('pubs') || r.includes('clone') || r.includes('studio')) return { label: 'Pubs IA', icon: 'sparkles' };
  if (r.includes('vidéo')) return { label: 'Vidéo IA', icon: 'film' };
  if (r.includes('image') || r.includes('visuel')) return { label: 'Image IA', icon: 'image' };
  if (r.includes('assistant')) return { label: 'Assistant', icon: 'chat' };
  if (r.includes('assets') || r.includes('tagging')) return { label: 'Assets', icon: 'layers' };
  if (r.includes('jarvis') || r.includes('angles suggérés')) return { label: 'Jarvis', icon: 'brain' };
  if (r.includes('concurrent')) return { label: 'Veille', icon: 'search' };
  if (r.includes('marque') || r.includes('profil') || r.includes('produits')) return { label: 'Marque', icon: 'tag' };
  return { label: 'Autre', icon: 'file' };
}

const MOTIFS_MACHINE: Array<[RegExp, string]> = [
  [/^adsmap:propose:/i, 'Adsmap · propositions de concepts'],
  [/^adsmap:asset_analysis:/i, 'Adsmap · analyse d’un asset'],
  [/^market:analyze:/i, 'Veille · analyse du marché'],
];

/** Le motif tel qu'un client le lit · les clés machine deviennent une phrase. */
export function libelleMotif(motif: string): string {
  for (const [re, txt] of MOTIFS_MACHINE) if (re.test(motif)) return txt;
  if (/^[a-z_]+:[a-z_]+:/i.test(motif)) return 'Action interne';
  return motif;
}

/**
 * La répartition de la consommation par famille sur une fenêtre · `tronquee`
 * dit que les lignes lues (bornées à `limite`) ne couvrent peut-être pas toute
 * la fenêtre · l'écran le dit au lieu d'afficher un total qui ne colle pas.
 */
export function repartitionConsommation(
  lignes: Array<{ delta: number; reason: string; createdAt: Date }>,
  depuis: Date,
  limite: number,
): { familles: Array<{ label: string; icon: string; total: number }>; tronquee: boolean } {
  const m = new Map<string, { icon: string; total: number }>();
  for (const l of lignes) {
    if (l.delta >= 0 || l.createdAt < depuis) continue;
    const f = familleMouvement(l.reason);
    const cur = m.get(f.label) ?? { icon: f.icon, total: 0 };
    cur.total += -l.delta;
    m.set(f.label, cur);
  }
  const plusAncienne = lignes.length ? lignes[lignes.length - 1]!.createdAt : null;
  const tronquee = lignes.length >= limite && !!plusAncienne && plusAncienne >= depuis;
  return { familles: [...m.entries()].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.total - a.total), tronquee };
}

/**
 * « Consommé ce cycle » · part de l'allocation consommée, bornée à 0..100 ·
 * null (non affichable) en illimité ou sans allocation ; au-delà de
 * l'allocation (recharge), on le dit plutôt qu'afficher un pourcentage négatif.
 */
export function partConsommeeCycle(p: { allocation: number; solde: number; illimite: boolean; mouvements: number }): { pct: number | null; note: string | null } {
  if (p.illimite) return { pct: null, note: 'Illimité · pas de cycle à consommer.' };
  if (p.allocation <= 0) return { pct: null, note: 'Aucune allocation sur cette formule.' };
  if (p.mouvements === 0) return { pct: null, note: 'Aucun mouvement enregistré · rien n’a été consommé.' };
  if (p.solde >= p.allocation) return { pct: 0, note: p.solde > p.allocation ? 'Solde au-dessus de l’allocation (recharge ou ajustement).' : null };
  return { pct: Math.min(100, Math.max(0, Math.round(((p.allocation - p.solde) / p.allocation) * 100))), note: null };
}

/** Une invitation « en attente » dont la date est passée ne mène plus nulle part. */
export function etatInvitation(expiresAt: Date | null | undefined, maintenant: Date): 'en_attente' | 'expiree' {
  return expiresAt && expiresAt.getTime() <= maintenant.getTime() ? 'expiree' : 'en_attente';
}
