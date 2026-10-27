import type { EtatJob } from '../../studios/machines';
import { extraireCitations } from '../../connaissances';
import { parseAnswer } from '../../adsmap/jarvis-actions';
import { sansTiretCadratin } from '../../ponctuation-ecran';
import { LIBELLES_NATURE_FAIT, LIBELLES_OBJECTIF_V5, LIBELLES_PLATEFORME_V5, type BriefCanonique } from '../../studios/brief';
import type { HypotheseTest } from '../../studios/sources/hypotheses';
import type { ClassePastille } from './noeuds';

/**
 * Spatial · les règles de l'écran PROJET (maquette `projet`) · en-tête,
 * geste « Générer… », état d'une création, fiche marque. Pur, sans base ni
 * réseau. Les libellés DÉCIDÉS vivent ici, jamais dans le JSX.
 */

/** `Neva · Publicité · V3` · la ligne au-dessus du titre (maquette : `small`). */
export function sousTitreProjet(p: { marque: string; libelleType: string; versionN: number; ancienne: boolean }): string {
  const morceaux = [p.marque.trim(), p.libelleType.trim(), `V${p.versionN}`].filter(Boolean);
  return `${morceaux.join(' · ')}${p.ancienne ? ' · lecture seule' : ''}`;
}

/** La pastille d'état de l'en-tête · la version affichée est TOUJOURS celle que le serveur garde. */
export function pastilleEnregistrement(p: { versionN: number; ancienne: boolean }): { classe: ClassePastille; libelle: string; icone: 'check' | 'lock' } {
  return p.ancienne
    ? { classe: 'w', libelle: `Version ${p.versionN} · lecture seule`, icone: 'lock' }
    : { classe: 'c', libelle: `Enregistré · version ${p.versionN}`, icone: 'check' };
}

export interface EntreeGenerer {
  kind: string;
  projetId: string;
  ancienne: boolean;
  /** Le brief porte une composition ou un objectif · assez pour préparer. */
  cadre: boolean;
  /** Capacité de génération de l'espace (image, ou vidéo pour un projet vidéo). */
  generationActive: boolean;
  /** Liens de l'atelier, déjà filtrés par les interrupteurs (`null` = coupé). */
  liens: { produit: string | null; video: string | null; textes: string | null };
}

/**
 * « Générer… » (barre du canvas) · le MÊME prochain geste que la fiche V5
 * (`ParcoursProjet`) : la préparation dans l'atelier, où le devis est montré
 * AVANT tout lancement. Le clic ne génère jamais rien · c'est un lien.
 */
export function gesteGenerer(e: EntreeGenerer): { href: string | null; libelle: string; raison: string | null } {
  if (e.ancienne) return { href: `/studio/projets/${e.projetId}`, libelle: 'Reprendre la version courante', raison: null };
  const cible = e.kind === 'video' ? 'video' : e.kind === 'text' ? 'textes' : 'image';
  const lien = cible === 'video' ? e.liens.video : cible === 'textes' ? e.liens.textes : e.liens.produit;
  const libelle = cible === 'image' ? 'Préparer l’image…' : cible === 'video' ? 'Préparer la vidéo…' : 'Écrire les textes…';
  if (!lien) return { href: null, libelle, raison: 'Cet atelier n’est pas activé pour ton espace.' };
  if (cible !== 'textes' && !e.generationActive) return { href: null, libelle, raison: 'La génération n’est pas activée pour cet espace · la préparation reste dans l’atelier.' };
  if (!e.cadre) return { href: null, libelle, raison: 'Cadre d’abord le concept avec Jarvis · le brief n’a ni objectif ni composition.' };
  return { href: lien, libelle, raison: null };
}

export interface EtatGeneration {
  libelle: string;
  classe: ClassePastille;
  /** Un média est livré et lisible. */
  pret: boolean;
  /** Le travail continue côté serveur · la page se relit d'elle-même. */
  actif: boolean;
}

/** L'état RÉEL d'une génération (job) · remplace l'animation simulée de la maquette. */
export function etatGeneration(etat: EtatJob): EtatGeneration {
  switch (etat) {
    case 'queued': case 'claimed': return { libelle: 'En file', classe: '', pret: false, actif: true };
    case 'running': case 'persisting': return { libelle: 'En cours', classe: 'c', pret: false, actif: true };
    case 'completed': return { libelle: 'Prête', classe: 'g', pret: true, actif: false };
    case 'failed': return { libelle: 'Échec', classe: 'w', pret: false, actif: false };
    case 'cancel_requested': return { libelle: 'Annulation demandée', classe: 'w', pret: false, actif: true };
    case 'cancelled': return { libelle: 'Annulée', classe: '', pret: false, actif: false };
    case 'reconciliation_required': return { libelle: 'Vérification en cours', classe: 'w', pret: false, actif: true };
  }
}

/** Relire la page tant qu'un travail est en cours · le même rythme que l'écran vidéo V5. */
export const RELECTURE_CREATIONS_MS = 4_000;

export function relectureNecessaire(etats: readonly EtatJob[]): boolean {
  return etats.some((e) => etatGeneration(e).actif);
}

export interface FicheMarqueResumee { score: number; ton: string | null; couleurs: number; manques: string[] }

/** Le nœud et la tuile « Fiche marque » · complétude RÉELLE (`completudeFicheMarque`), ton saisi. */
export function resumeFicheMarque(nom: string, f: FicheMarqueResumee): { titre: string; texte: string } {
  const ton = f.ton?.trim();
  const morceaux = [ton ? `Ton ${ton.length > 40 ? `${ton.slice(0, 39)}…` : ton}` : null, f.couleurs ? `${f.couleurs} couleur${f.couleurs > 1 ? 's' : ''}` : null];
  const manque = f.manques.length ? `${f.manques.length} élément${f.manques.length > 1 ? 's' : ''} à compléter` : 'Fiche complète';
  return { titre: `${nom || 'Marque'} · ${f.score} %`, texte: [...morceaux.filter(Boolean), manque].join(' · ') };
}

/** Coupe un texte long à la mesure d'une bulle · jamais au milieu d'un mot quand c'est possible. */
export function extraitBulle(t: string, max = 240): string {
  const s = t.replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  const coupe = s.slice(0, max - 1);
  const espace = coupe.lastIndexOf(' ');
  return `${(espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trimEnd()}…`;
}

/**
 * Le texte d'un tour de Jarvis tel qu'on le LIT · sans marqueurs de source
 * (`[[SOURCE:…]]`), sans bloc d'actions, sans tiret cadratin. Mêmes règles que
 * le fil V5 (`Tour`).
 */
export function texteTourJarvis(contenu: string): string {
  const { texte } = extraireCitations(contenu);
  return sansTiretCadratin(parseAnswer(texte).text).trim();
}

/**
 * Une hypothèse « Si …, alors … » découpée pour mettre ses deux mots
 * charnières en gras (maquette : `<b>Si</b> … <b>alors</b> …`). Le texte est
 * celui du brief, tel quel · rien n'est réécrit, seuls les mots sont repérés.
 */
export function segmentsHypothese(enonce: string): Array<{ texte: string; fort: boolean }> {
  const out: Array<{ texte: string; fort: boolean }> = [];
  const re = /(^|[\s(«"'’])(Si|si|alors|Alors)(?=[\s,])/g;
  let dernier = 0;
  for (let m = re.exec(enonce); m; m = re.exec(enonce)) {
    const debut = m.index + m[1]!.length;
    if (debut > dernier) out.push({ texte: enonce.slice(dernier, debut), fort: false });
    out.push({ texte: m[2]!, fort: true });
    dernier = debut + m[2]!.length;
  }
  if (dernier < enonce.length) out.push({ texte: enonce.slice(dernier), fort: false });
  return out.filter((s) => s.texte.length > 0);
}

/** Ce qu'un couloir vide dit · un état honnête, jamais un nœud d'exemple. */
export const VIDE_COULOIR: Readonly<Record<'contexte' | 'hypothese' | 'creations' | 'mesure' | 'iteration', string>> = {
  contexte: 'Aucun contexte lu pour ce projet.',
  hypothese: 'Aucune hypothèse au brief.',
  creations: 'Aucune création retenue.',
  mesure: 'Aucun test rattaché.',
  iteration: 'Aucune itération.',
};

export interface ChampBriefSpatial { libelle: string; valeurs: string[]; options: boolean }

/**
 * Le brief en lignes `dt / dd` (maquette : `dl.kv2`) · les champs RENSEIGNÉS
 * seulement, dans l'ordre de la fiche V5. `options` · rendu en pastilles
 * (`span.opt2.on`), sinon en texte.
 */
export function champsBrief(b: BriefCanonique, h: HypotheseTest | null): ChampBriefSpatial[] {
  const out: ChampBriefSpatial[] = [];
  const pose = (libelle: string, valeurs: ReadonlyArray<string | null | undefined>, options = false) => {
    const v = valeurs.map((x) => (x ?? '').trim()).filter(Boolean);
    if (v.length) out.push({ libelle, valeurs: v, options });
  };
  pose('Objectif', [b.objectifType ? LIBELLES_OBJECTIF_V5[b.objectifType] : null], true);
  pose('But', [b.objective]);
  pose('Cible', [b.audience]);
  pose('Plateformes', (b.plateformes ?? []).map((p) => LIBELLES_PLATEFORME_V5[p]), true);
  pose('Persona', [b.personaRef?.label]);
  pose('Angle', [b.angle]);
  pose('Concept', [b.concept]);
  pose('Message', [b.composition]);
  pose('Ton', [b.styleIntent]);
  if (h) {
    pose('Hypothèse', [h.statement]);
    pose('Variable testée', [b.testedVariable || h.variable]);
    pose('Témoin', [h.control]);
    pose('Traitement', [h.treatment]);
    pose('Mesure', [h.metric]);
    pose('Règle de décision', [h.decisionRule]);
    pose('Limites', h.limitations);
  } else {
    pose('Variable testée', [b.testedVariable]);
  }
  pose('Formats', b.formats, true);
  pose('Textes', b.texts);
  pose('Invariants', b.invariants);
  pose('Exclusions', b.exclusions, true);
  for (const k of ['observed', 'measured', 'declared'] as const) {
    pose(`Faits ${LIBELLES_NATURE_FAIT[k].toLowerCase()}s`, b.facts.filter((f) => f.kind === k && !(h && (f.id === h.id || f.id.startsWith(`${h.id}.`)))).map((f) => f.claim));
  }
  return out;
}

/**
 * Les segments FIXES sous `/studio/projets/` (création de projet) · le motif
 * porté `/studio/projets/[id]` les attrape aussi tant que leur propre écran
 * Spatial n'existe pas (un segment statique de l'arbre Spatial passe toujours
 * avant `[id]`). La fiche projet ne les prend jamais pour un identifiant.
 */
export const SEGMENTS_RESERVES_PROJETS: readonly string[] = ['nouveau'];

export function segmentReserveProjets(id: string): boolean {
  return SEGMENTS_RESERVES_PROJETS.includes(id);
}
