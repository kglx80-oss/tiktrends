import type { EtatJob } from '../../studios/machines';
import { etatGeneration } from './projet';
import type { ClassePastille } from './noeuds';

/**
 * Spatial · les règles du STUDIO VIDÉO (maquette `video`) · lecteur, plans,
 * gestes payants d'un plan, pistes du montage. Pur.
 *
 * La maquette montre des « variantes » A/B/C et six leviers simulés (accroche,
 * voix, musique…) avec un rendu qui progresse tout seul. Ici, chaque ligne est
 * un PLAN réel du storyboard, chaque levier un GESTE réel de la chaîne vidéo
 * (consigne, devis, lancement de l'image clé, puis du clip), avec son prix
 * annoncé AVANT le clic, et l'état vient des jobs du serveur.
 */

export type EtatSortie = 'valide' | 'obsolete' | 'a_produire';

/** `0:04` · repère de temps de la maquette. */
export function minuteSeconde(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Cinq repères, du début à la fin (0, ¼, ½, ¾, fin). */
export function reperesTemps(totalMs: number): string[] {
  return [0, 0.25, 0.5, 0.75, 1].map((f) => minuteSeconde(f * totalMs));
}

/** `9:16 · 15 s` · format et durée sous le lecteur. */
export function legendeFormat(f: { largeur: number; hauteur: number }, totalMs: number): string {
  const pgcd = (a: number, b: number): number => (b ? pgcd(b, a % b) : a);
  const d = pgcd(f.largeur, f.hauteur) || 1;
  return `${f.largeur / d}:${f.hauteur / d} · ${Math.round(totalMs / 1000)} s`;
}

export interface PlanPourMontage { purpose: string; onScreenText: readonly string[]; narration: string }
export interface SegmentMontage { shotId: string; rang: number; dureeMs: number }

export interface PistesMontage {
  scenes: Array<{ shotId: string; libelle: string; flex: number }>;
  textes: Array<{ shotId: string; libelle: string; flex: number }>;
  voix: { titre: string; texte: string };
  musique: { titre: string };
  reperes: string[];
}

/** Les pistes du montage · une part de largeur par plan, proportionnelle à sa durée réelle ou estimée. */
export function pistesMontage(e: {
  segments: readonly SegmentMontage[];
  plans: Readonly<Record<string, PlanPourMontage>>;
  totalMs: number;
  nomVoix: string | null;
  nomMusique: string | null;
  sansTexte: boolean;
}): PistesMontage {
  const total = e.segments.reduce((t, s) => t + Math.max(0, s.dureeMs), 0);
  const part = (ms: number) => (total > 0 ? ms / total : 1 / Math.max(1, e.segments.length));
  const scenes = e.segments.map((s) => ({ shotId: s.shotId, libelle: e.plans[s.shotId]?.purpose.trim() || `Plan ${s.rang}`, flex: part(s.dureeMs) }));
  const textes = e.segments.map((s) => {
    const t = e.sansTexte ? [] : (e.plans[s.shotId]?.onScreenText ?? []).map((x) => x.trim()).filter(Boolean);
    return { shotId: s.shotId, libelle: t.length ? t.join(' · ') : '–', flex: part(s.dureeMs) };
  });
  const narration = e.segments.map((s) => e.plans[s.shotId]?.narration.trim() ?? '').filter(Boolean).join(' ');
  return {
    scenes, textes,
    voix: { titre: e.nomVoix ? `Voix · ${e.nomVoix}` : 'Voix', texte: narration || 'Aucune narration' },
    musique: { titre: e.nomMusique ? `Musique · ${e.nomMusique}` : 'Musique · aucune' },
    reperes: reperesTemps(e.totalMs),
  };
}

export interface JobPlan { operation: string; etat: EtatJob }

/** Le plan concerné par un job (`keyframe:<plan>`, `clip:<plan>`) · `null` sinon. */
export function planDuJob(operation: string): { plan: string; nature: 'keyframe' | 'clip' } | null {
  const i = operation.indexOf(':');
  if (i < 0) return null;
  const nature = operation.slice(0, i);
  return nature === 'keyframe' || nature === 'clip' ? { plan: operation.slice(i + 1), nature } : null;
}

/** L'état d'un plan, dit en mots · la génération réelle en cours prime, puis ce qui est produit. */
export function etatPlan(e: { shotId: string; keyframe: EtatSortie; clip: EtatSortie; jobs: readonly JobPlan[] }): { libelle: string; classe: ClassePastille; actif: boolean } {
  // Les jobs arrivent du plus récent au plus ancien (lecture serveur).
  const siens = e.jobs.filter((j) => planDuJob(j.operation)?.plan === e.shotId);
  const actif = siens.find((j) => etatGeneration(j.etat).actif);
  if (actif) return { ...etatGeneration(actif.etat), actif: true };
  if (e.clip === 'valide') return { libelle: 'Animé', classe: 'g', actif: false };
  if (e.keyframe === 'valide') return { libelle: 'Image clé prête', classe: 'g', actif: false };
  if (siens[0]?.etat === 'failed') return { libelle: 'Échec', classe: 'w', actif: false };
  if (e.keyframe === 'obsolete' || e.clip === 'obsolete') return { libelle: 'Obsolète', classe: 'w', actif: false };
  return { libelle: 'À produire', classe: '', actif: false };
}

export interface DisponibiliteGeste { disponible: boolean; raison: string }

export type CleGestePlan = 'consigne' | 'retenir' | 'devis' | 'lancer' | 'devis-clip' | 'lancer-clip';

export interface GestePlan {
  cle: CleGestePlan;
  titre: string;
  sous: string;
  /** Prix annoncé AVANT le clic (pastille du levier). */
  prix: string;
  actif: boolean;
  raison: string | null;
  /** Le geste engage de l'argent ou un appel payant · confirmation explicite. */
  payant: boolean;
}

export interface EntreeGestesPlan {
  disponibilite: { consigne: DisponibiliteGeste; montage: DisponibiliteGeste; devis: DisponibiliteGeste; lancement: DisponibiliteGeste; animation: DisponibiliteGeste };
  keyframe: { etat: EtatSortie; consigneEnAttente: boolean; consigneRetenue: { ok: boolean; motif: string } | null; devisCredits: number | null };
  clip: { keyframePrete: boolean; devisCredits: number | null };
  prixImageCredits: number;
  prixClip: { credits: number; dureeS: number };
  /** Coût maximal d'un appel texte, déjà dit en clair (`libelleCoutTexteEstime`). */
  coutTexte: string;
}

const cr = (n: number) => `${n} cr.`;

/** Les six gestes d'un plan, dans l'ordre de la chaîne · chacun dit pourquoi il est inactif. */
export function gestesPlan(e: EntreeGestesPlan): GestePlan[] {
  const d = e.disponibilite;
  const k = e.keyframe;
  const retenueOk = !!k.consigneRetenue?.ok;
  const raisonDevis = !k.consigneRetenue ? 'Retiens d’abord une consigne compilée pour ce plan.' : !k.consigneRetenue.ok ? k.consigneRetenue.motif : !d.devis.disponible ? d.devis.raison : null;
  const raisonClip = !d.animation.disponible ? d.animation.raison : !e.clip.keyframePrete ? 'Produis d’abord l’image clé de ce plan : le clip part d’elle.' : !d.devis.disponible ? d.devis.raison : null;
  return [
    { cle: 'consigne', titre: 'Consigne de l’image', sous: 'Jarvis écrit la consigne du plan', prix: e.coutTexte, payant: true, actif: d.consigne.disponible, raison: d.consigne.disponible ? null : d.consigne.raison },
    { cle: 'retenir', titre: 'Retenir la consigne', sous: 'Nouvelle version · aucun coût', prix: cr(0), payant: false, actif: k.consigneEnAttente && d.montage.disponible, raison: !k.consigneEnAttente ? 'Aucune consigne compilée en attente.' : d.montage.disponible ? null : d.montage.raison },
    { cle: 'devis', titre: k.etat === 'valide' ? 'Devis d’une variante' : 'Devis de l’image clé', sous: 'Prix figé · rien n’est débité', prix: cr(e.prixImageCredits), payant: false, actif: retenueOk && d.devis.disponible, raison: raisonDevis },
    { cle: 'lancer', titre: 'Lancer l’image clé', sous: 'Débite le devis au lancement', prix: cr(k.devisCredits ?? e.prixImageCredits), payant: true, actif: k.devisCredits !== null && d.lancement.disponible, raison: k.devisCredits === null ? 'Demande d’abord un devis.' : d.lancement.disponible ? null : d.lancement.raison },
    { cle: 'devis-clip', titre: 'Devis du clip animé', sous: `Clip de ${e.prixClip.dureeS} s depuis l’image clé`, prix: cr(e.prixClip.credits), payant: false, actif: raisonClip === null, raison: raisonClip },
    { cle: 'lancer-clip', titre: 'Animer le plan', sous: 'Débite le devis du clip', prix: cr(e.clip.devisCredits ?? e.prixClip.credits), payant: true, actif: e.clip.devisCredits !== null && d.lancement.disponible && d.animation.disponible, raison: e.clip.devisCredits === null ? 'Demande d’abord le devis du clip.' : !d.animation.disponible ? d.animation.raison : d.lancement.disponible ? null : d.lancement.raison },
  ];
}

/** Ce que le lecteur montre · la dernière vidéo finale, sinon la première image clé valide, sinon rien. */
export function sourceLecteur(e: { finale: { url: string } | null; imagesCles: ReadonlyArray<{ url: string } | null> }): { type: 'video' | 'image'; src: string } | null {
  if (e.finale) return { type: 'video', src: e.finale.url };
  const img = e.imagesCles.find((x) => x !== null);
  return img ? { type: 'image', src: img.url } : null;
}
