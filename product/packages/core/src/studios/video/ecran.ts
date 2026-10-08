/**
 * Studios · L6-A · l'écran vidéo en mots · disponibilités, entrée du
 * storyboard, états des images clés.
 *
 * Pur. Une capacité que le fournisseur ou l'infrastructure ne permet pas
 * d'exécuter n'est jamais présentée comme disponible : l'animation reste
 * « Vidéo indisponible · aucun décodeur vidéo » tant que le worker ne sait
 * pas vérifier une vidéo produite (capacité SONDÉE, `capaciteVideo`), et
 * reste indisponible tant qu'aucun fournisseur d'animation n'est branché
 * (`FOURNISSEUR_ANIMATION_BRANCHE`), même décodeur prouvé.
 */

import type { ContenuVersion, ModeParole } from '../document';
import type { BriefCanonique } from '../brief';
import { documentBrief } from '../textes/textes';
import { jsonCanonique, sha256Hex, empreinteContenu } from '../version';
import type { Disponibilite } from '../image/parcours';
import { idsPlansAlloues, PLANS_MAX, DUREE_CIBLE_MIN_MS, DUREE_CIBLE_MAX_MS } from './plans';

export const LIBELLE_ANIMATION_INDISPONIBLE = 'Vidéo indisponible · aucun décodeur vidéo';
export const RAISON_ANIMATION_INDISPONIBLE = 'Le service ne sait pas encore vérifier une vidéo produite : aucune animation n’est proposée, devisée ni facturée. Les images clés, le montage et le texte restent utilisables.';
export const RAISON_ANIMATION_SANS_FOURNISSEUR = 'Le service sait vérifier une vidéo produite, mais aucun fournisseur d’animation n’est branché : aucune animation n’est proposée, devisée ni facturée. Les images clés, le montage et le texte restent utilisables.';
export const LIBELLE_ANIMATION_SANS_FOURNISSEUR = 'Vidéo indisponible · aucun fournisseur d’animation';

/**
 * Le libellé court suit la CAUSE (raccord vague 7) : une fois le décodeur
 * sondé, dire « aucun décodeur » contredirait la raison affichée à côté.
 */
export function libelleAnimationIndisponible(a: { raison: string }): string {
  return a.raison === RAISON_ANIMATION_SANS_FOURNISSEUR ? LIBELLE_ANIMATION_SANS_FOURNISSEUR : LIBELLE_ANIMATION_INDISPONIBLE;
}

export interface EntreeDisponibiliteVideo {
  peutGenerer: boolean;
  peutProposer: boolean;
  releasePubliee: boolean;
  fournisseurTexte: boolean;
  plafondAtteint: boolean;
  fournisseurImage: boolean;
  /** Capacité SONDÉE du worker (`capaciteVideo(...).decodage`), jamais une constante. */
  decodeurVideo: boolean;
  /** Un fournisseur d'animation est branché · absent = non. */
  fournisseurVideo?: boolean;
  briefPresent: boolean;
}

export interface DisponibiliteVideo {
  storyboard: Disponibilite;
  montage: Disponibilite;
  consigne: Disponibilite;
  devis: Disponibilite;
  lancement: Disponibilite;
  animation: Disponibilite;
}

const oui: Disponibilite = { disponible: true, raison: '' };
const non = (raison: string): Disponibilite => ({ disponible: false, raison });

/** La première cause qui empêche chaque geste, dite en clair. */
export function disponibiliteVideo(e: EntreeDisponibiliteVideo): DisponibiliteVideo {
  const texte = (quoi: string): Disponibilite => !e.peutGenerer ? non(`Ton rôle permet de consulter, pas de ${quoi} (appel texte payant).`)
    : !e.releasePubliee ? non('Aucune version des consignes n’est publiée : cette tâche n’est pas encore activée. Rien n’est facturé · le chemin manuel reste ouvert.')
    : !e.fournisseurTexte ? non('Le fournisseur de texte n’est pas configuré sur ce serveur. Rien n’est facturé · le chemin manuel reste ouvert.')
    : e.plafondAtteint ? non('Le plafond de dépense est atteint · aucun appel avant le prochain cycle.')
    : oui;
  const storyboardBase = texte('générer un storyboard');
  const storyboard = storyboardBase.disponible && !e.briefPresent ? non('Ce projet n’a pas de brief · le storyboard se construit à partir du brief.') : storyboardBase;
  return {
    storyboard,
    montage: e.peutProposer ? oui : non('Ton rôle permet de consulter, pas de modifier le montage.'),
    consigne: texte('compiler la consigne d’une image clé'),
    devis: e.peutGenerer ? oui : non('Ton rôle permet de consulter, pas de demander un devis.'),
    lancement: !e.peutGenerer ? non('Ton rôle permet de consulter, pas de lancer une génération.')
      : !e.fournisseurImage ? non('Le fournisseur d’images n’est pas branché sur ce serveur · aucun lancement possible, rien n’est débité.')
      : e.plafondAtteint ? non('Le plafond de dépense est atteint · aucun lancement avant le prochain cycle.')
      : oui,
    animation: !e.decodeurVideo ? non(RAISON_ANIMATION_INDISPONIBLE)
      : e.fournisseurVideo !== true ? non(RAISON_ANIMATION_SANS_FOURNISSEUR)
      : oui,
  };
}

/* ───────────────────────────── Entrée du storyboard ──────────────────────── */

const fait = (id: string, version: string, claim: string) => {
  const content = { id, claim: claim.slice(0, 12_000), sourceIds: [] as string[], kind: 'declared' as const, confidence: 'high' as const };
  return { id, version, schemaKey: 'Fact', content, sha256: sha256Hex(jsonCanonique(content)) };
};

/**
 * L'entrée de `storyboard.plan` · le brief (document résolu), les fiches
 * d'identité et le produit du projet (documents que les plans peuvent citer),
 * les identifiants de plans ALLOUÉS par le serveur.
 */
export function entreeStoryboard(e: { brief: BriefCanonique; versionId: string; contenu: ContenuVersion; nbPlans: number; dureeCibleMs: number; speechMode: ModeParole }) {
  const nb = Math.min(PLANS_MAX, Math.max(1, Math.floor(e.nbPlans)));
  const ids = idsPlansAlloues(Object.keys(e.contenu.shots.byId), nb);
  const docBrief = documentBrief(e.brief, e.versionId);
  const docs = [docBrief];
  for (const [cid, f] of Object.entries(e.contenu.characterRefs)) {
    const claim = Object.entries(f).filter(([, v]) => typeof v === 'string' || Array.isArray(v)).map(([k, v]) => `${k} : ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ');
    docs.push(fait(cid, empreinteContenu(f).slice(0, 16), `Personnage ${cid} · ${claim || 'fiche sans attribut'}`));
  }
  if (e.contenu.productRef) docs.push(fait(e.contenu.productRef.productId, empreinteContenu(e.contenu.productRef).slice(0, 16), `Produit du projet · ${String((e.contenu.productRef as { nom?: unknown }).nom ?? e.contenu.productRef.productId)}`));
  return {
    idsAlloues: ids,
    taskInputs: {
      briefId: docBrief.id, targetDurationMs: Math.min(DUREE_CIBLE_MAX_MS, Math.max(DUREE_CIBLE_MIN_MS, Math.round(e.dureeCibleMs))), shotCount: nb, speechMode: e.speechMode,
    },
    resolvedDocuments: docs,
    allocatedIds: ids.map((id, ordinal) => ({ id, entityType: 'shot' as const, ordinal })),
    invariants: [
      ...e.brief.invariants,
      ...e.brief.exclusions.map((x) => `Exclusion : ${x}`),
      'Chaque plan garde sujet, action, cadrage, caméra, lumière, décor, narration et texte écran dans leurs champs propres.',
    ].slice(0, 100),
    facts: e.brief.facts.map((f) => ({ id: f.id, claim: f.claim, sourceIds: [...f.sourceIds], kind: f.kind, confidence: f.confidence })),
  };
}
