/**
 * Politique de conversation · le texte de Jarvis tiré du registre, assemblé
 * par le code. PUR : ni base, ni réseau, ni modèle.
 *
 * ── Ce qui vient du registre, ce qui reste dans le code ──────────────────────
 *
 * Le registre porte le TEXTE (socle, titres, phrases de prudence et de
 * registre, « où envoyer »), versionné et publié par release. Le code garde
 * l'ASSEMBLAGE, qui est une politique déterministe : l'ordre des blocs (les
 * règles maison en dernier), les seuils de prudence (0, < 10, < 40), les
 * plafonds de longueur des données (identité 1500, mémoire 9000, règles 2000)
 * et le séparateur que le bloc de connaissances sait retrouver.
 *
 * Variables : seules les sections de prudence acceptent `{{effectif}}`, rendu
 * UNE fois par un entier du serveur. Toute autre variable, ou une accolade
 * orpheline, refuse la version (aucun repli).
 */

import { SEPARATEUR_CONSIGNE } from '@tiktrends/core';
import { constat, empreinteContenu, MOTIF_VERSION, type Constat } from './noyau';

export const CLE_CONVERSATION_JARVIS = 'jarvis.conversation';
/** Clés de politique de conversation connues du code · une autre est refusée. */
export const CLES_CONVERSATION: readonly string[] = [CLE_CONVERSATION_JARVIS];

export const SECTIONS_CONVERSATION = [
  'socle', 'titreMarque', 'titreMemoire', 'memoireVide', 'prudenceAucun', 'prudencePeu', 'prudenceMoyen',
  'prudenceBeaucoup', 'registreDebut', 'registreAvance', 'ouEnvoyer', 'titreRegles',
] as const;
export type SectionConversation = (typeof SECTIONS_CONVERSATION)[number];
export type SectionsConversation = Record<SectionConversation, string>;

/** Variables admises, par section · `{{effectif}}` seulement dans la prudence chiffrée. */
const VARIABLES_PERMISES: Partial<Record<SectionConversation, readonly string[]>> = {
  prudencePeu: ['effectif'], prudenceMoyen: ['effectif'], prudenceBeaucoup: ['effectif'],
};

/** Sections dont le texte est un TITRE · une seule ligne. */
const TITRES: ReadonlySet<SectionConversation> = new Set(['titreMarque', 'titreMemoire', 'titreRegles']);

export const LIMITE_SECTION = 8000;

export interface PolitiqueConversation {
  key: string;
  version: string;
  title: string;
  status: 'draft';
  origin: string;
  justification: string;
  sections: SectionsConversation;
  /** Absent de la source · calculé à l'import (comme les recettes), vérifié s'il est fourni. */
  contentHash?: string;
}

const CHAMPS = ['key', 'version', 'title', 'status', 'origin', 'justification', 'sections', 'contentHash'] as const;
const MOTIF_VARIABLE = /\{\{\s*([^{}]*?)\s*\}\}/g;

function estObjet(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Valide une politique de conversation · rend tous les constats d'un coup. */
export function validerPolitiqueConversation(brut: unknown): { ok: true; politique: PolitiqueConversation; contentHash: string } | { ok: false; constats: Constat[] } {
  const sortie: Constat[] = [];
  if (!estObjet(brut)) return { ok: false, constats: [constat('CONVERSATION_STRUCTURE', '', 'La politique doit être un objet.')] };
  for (const k of Object.keys(brut)) if (!(CHAMPS as readonly string[]).includes(k)) sortie.push(constat('PACK_CHAMP_INCONNU', `/${k}`, `Champ « ${k} » inconnu · refusé plutôt qu'ignoré.`));
  for (const k of ['key', 'version', 'title', 'origin', 'justification'] as const) {
    if (typeof brut[k] !== 'string' || !(brut[k] as string).trim()) sortie.push(constat('PACK_TYPE', `/${k}`, `« ${k} » doit être un texte non vide.`));
  }
  if (typeof brut.key === 'string' && !CLES_CONVERSATION.includes(brut.key)) sortie.push(constat('CONVERSATION_CLE_INCONNUE', '/key', `Clé « ${brut.key} » inconnue du code · aucun consommateur ne la lirait.`));
  if (typeof brut.version === 'string' && !MOTIF_VERSION.test(brut.version)) sortie.push(constat('PACK_VERSION', '/version', `Version « ${brut.version} » hors format X.Y.Z.`));
  if (brut.status !== 'draft') sortie.push(constat('PACK_STATUT_NON_BROUILLON', '/status', 'Le statut du contenu reste « draft » · le cycle de vie est porté par le registre.'));
  const sections = brut.sections;
  if (!estObjet(sections)) sortie.push(constat('CONVERSATION_STRUCTURE', '/sections', 'sections doit être un objet.'));
  else {
    for (const k of Object.keys(sections)) if (!(SECTIONS_CONVERSATION as readonly string[]).includes(k)) sortie.push(constat('PACK_CHAMP_INCONNU', `/sections/${k}`, `Section « ${k} » inconnue.`));
    for (const s of SECTIONS_CONVERSATION) {
      const texte = sections[s];
      const cible = `/sections/${s}`;
      if (typeof texte !== 'string' || !texte.trim()) { sortie.push(constat('PACK_CHAMP_MANQUANT', cible, `Section « ${s} » absente ou vide.`)); continue; }
      if ([...texte].length > LIMITE_SECTION) sortie.push(constat('CONVERSATION_SECTION_LONGUE', cible, `Section au-delà de ${LIMITE_SECTION} caractères.`));
      if (TITRES.has(s) && texte.includes('\n')) sortie.push(constat('CONVERSATION_TITRE_MULTILIGNE', cible, 'Un titre tient sur une ligne.'));
      const permises = VARIABLES_PERMISES[s] ?? [];
      let couvertes = 0;
      for (const m of texte.matchAll(MOTIF_VARIABLE)) {
        couvertes++;
        if (!permises.includes(m[1] ?? '')) sortie.push(constat('PACK_VARIABLE_INCONNUE', cible, `Variable « ${m[1]} » non admise dans cette section.`));
      }
      const orphelines = Math.max(texte.split('{{').length - 1, texte.split('}}').length - 1) - couvertes;
      if (orphelines !== 0) sortie.push(constat('PACK_GABARIT_MAL_FORME', cible, 'Accolades doubles orphelines.'));
      for (const p of permises) if (!texte.includes(`{{${p}}}`)) sortie.push(constat('PACK_VARIABLE_ABSENTE', cible, `Variable « ${p} » attendue dans cette section.`));
    }
  }
  if (sortie.length > 0) return { ok: false, constats: sortie };
  const contentHash = empreinteContenu(brut);
  if (typeof brut.contentHash === 'string' && brut.contentHash !== contentHash) {
    return { ok: false, constats: [constat('PACK_EMPREINTE_FAUSSE', '/contentHash', 'Empreinte déclarée ≠ recalculée.')] };
  }
  return { ok: true, politique: brut as unknown as PolitiqueConversation, contentHash };
}

/* -------------------------------------------------------------------------- */
/*  Assemblage · politique déterministe, identique au code d'avant            */
/* -------------------------------------------------------------------------- */

export type NiveauRegistre = 'debut' | 'intermediaire' | 'avance';

export interface DonneesConversation {
  brandName: string;
  identity?: string | null;
  memory: string;
  rules?: string | null;
  measuredAds: number;
  canAdsmap: boolean;
  canPropose?: boolean;
  niveau?: NiveauRegistre | null;
  /** Bloc d'actions · produit par le code (`actionsPromptBlock`), contrat du lecteur de marqueurs. */
  blocActions: string;
}

/** Plafonds des DONNÉES insérées · repris de l'assemblage d'avant. */
export const PLAFONDS_CONVERSATION = { identite: 1500, memoire: 9000, regles: 2000 } as const;
/** Seuils de prudence · un effectif sous 10 parle de tendances, sous 40 de tendances solides. */
export const SEUILS_PRUDENCE = { peu: 10, moyen: 40 } as const;

function rendre(texte: string, valeurs: Readonly<Record<string, string>>): string {
  return texte.replace(MOTIF_VARIABLE, (_m, nom: string) => {
    const v = valeurs[nom];
    if (v === undefined) throw new Error(`Variable « ${nom} » non résolue.`);
    return v;
  });
}

function prudence(s: SectionsConversation, n: number): string {
  const effectif = { effectif: String(n) };
  if (n === 0) return s.prudenceAucun;
  if (n < SEUILS_PRUDENCE.peu) return rendre(s.prudencePeu, effectif);
  if (n < SEUILS_PRUDENCE.moyen) return rendre(s.prudenceMoyen, effectif);
  return rendre(s.prudenceBeaucoup, effectif);
}

/**
 * La consigne système de la conversation. Ordre : socle, marque, mémoire,
 * prudence, registre, où envoyer, actions, règles maison EN DERNIER.
 */
export function assemblerConsigneJarvis(p: Pick<PolitiqueConversation, 'sections'>, d: DonneesConversation): string {
  const s = p.sections;
  const blocs: string[] = [s.socle];
  const identite = d.identity ? `\n${d.identity.trim().slice(0, PLAFONDS_CONVERSATION.identite)}` : '';
  blocs.push(`${s.titreMarque}\n${d.brandName}${identite}`);
  blocs.push(d.memory.trim()
    ? `${s.titreMemoire}\n${d.memory.trim().slice(0, PLAFONDS_CONVERSATION.memoire)}`
    : `${s.titreMemoire}\n${s.memoireVide}`);
  blocs.push(prudence(s, d.measuredAds));
  if (d.niveau === 'debut') blocs.push(s.registreDebut);
  else if (d.niveau === 'avance') blocs.push(s.registreAvance);
  if (d.canAdsmap) blocs.push(s.ouEnvoyer);
  if (d.canPropose) blocs.push(d.blocActions);
  if (d.rules?.trim()) blocs.push(`${s.titreRegles}\n${d.rules.trim().slice(0, PLAFONDS_CONVERSATION.regles)}`);
  return blocs.join(SEPARATEUR_CONSIGNE);
}
