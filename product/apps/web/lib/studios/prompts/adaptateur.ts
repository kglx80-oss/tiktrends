/**
 * Adaptateur de modèle du résolveur · l'unique frontière vers un fournisseur.
 *
 * Le résolveur reçoit un `AdaptateurModele` : en production, celui-ci, qui
 * passe par la barrière de dépense existante (`guardedAnthropic`, plafond dur,
 * dépense écrite même sur échec) ; en test, un adaptateur SIMULÉ défini dans
 * `test/` seulement. Le résolveur refuse un adaptateur marqué `simule` hors de
 * l'environnement de test (garde éprouvée par `l2-resolveur-db.test.ts`).
 *
 * Aucun outil n'est exposé au modèle (la requête compilée porte `outils: []`).
 *
 * ── Vision (lot F-D) ─────────────────────────────────────────────────────────
 *
 * Le profil `vision_analysis` est routé vers le même modèle, avec des PIÈCES
 * NATIVES : les blocs `image` de l'API Messages (`ImageBlockParam`, source
 * `base64`, types png/jpeg/webp · seule forme que décrit le SDK installé,
 * @anthropic-ai/sdk 0.27.3). Les octets ont été lus par le SERVEUR dans la
 * portée de la tâche (`planifierPiecesVision`, résolveur) : aucune URL, aucune
 * donnée du client ne part comme image. Les images précèdent le texte dans le
 * message utilisateur, dans l'ordre de leur index natif ; l'index est celui
 * que chaque liaison `mediaBindings` déclare. Avant tout appel, l'adaptateur
 * revérifie le contrat (`controlerPiecesAppel` : profil, nombre, index,
 * empreinte égale aux octets, type relu) et refuse sans rien dépenser.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { MessageCompile } from './noyau';
import { guardedAnthropic } from '../../spend-guard';
import { costOfTokens } from '@tiktrends/core';
import { controlerPiecesAppel, type PieceNative } from '@tiktrends/core';

export type { PieceNative };

/** Refus du contrat des pièces natives · levé AVANT tout client, rien n'est dépensé. */
export class PiecesInvalides extends Error {
  constructor(readonly codes: string[]) { super(`Pièces natives refusées · ${codes.join(', ')}`); this.name = 'PiecesInvalides'; }
}

/** Le contrat des pièces, commun à l'adaptateur réel et aux adaptateurs simulés. */
export function exigerPiecesConformes(a: Pick<AppelModele, 'profil' | 'pieces'>): void {
  const defauts = controlerPiecesAppel(a.profil, a.pieces ?? []);
  if (defauts.length) throw new PiecesInvalides([...new Set(defauts.map((d) => d.code))]);
}

/** Le contenu du message utilisateur · images natives d'abord (ordre des index), puis le texte compilé. */
export function contenuUtilisateur(texte: string, pieces: ReadonlyArray<PieceNative>): string | Array<Anthropic.ImageBlockParam | Anthropic.TextBlockParam> {
  if (!pieces.length) return texte;
  return [
    ...[...pieces].sort((x, y) => x.index - y.index).map((p): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: p.mime, data: Buffer.from(p.octets).toString('base64') } })),
    { type: 'text', text: texte },
  ];
}

export interface AppelModele {
  profil: string;
  messages: ReadonlyArray<MessageCompile>;
  maxJetonsSortie: number;
  /** Pièces natives (profil `vision_analysis` seulement) · octets lus par le serveur, index = `nativeAttachmentIndex`. */
  pieces?: ReadonlyArray<PieceNative>;
  /** Imputation de la dépense (`ai_spend.workspace_id`, `action`). */
  workspaceId: string;
  action: string;
}

export interface ReponseModele {
  texte: string;
  modele: string;
  jetonsEntree: number;
  jetonsSortie: number;
  coutUsd: number;
}

export interface AdaptateurModele {
  readonly nom: string;
  /** Vrai pour un fournisseur simulé · interdit hors environnement de test. */
  readonly simule: boolean;
  /** Modèle servi pour un profil logique, ou `null` si ce lot ne le route pas. */
  modelePour(profil: string): string | null;
  appeler(a: AppelModele): Promise<ReponseModele>;
}

/** Profils logiques routés par CET adaptateur · les autres sont « non branchés » (onglet Routage). */
export const PROFILS_ROUTES_ANTHROPIC: readonly string[] = ['reasoning_structured', 'vision_analysis'];

export function modeleTexte(): string {
  return process.env.ANTHROPIC_GEN_MODEL || 'claude-sonnet-5';
}

/** L'adaptateur réel · `null` si le fournisseur n'est pas configuré (aucun repli). */
export function adaptateurAnthropicGarde(): AdaptateurModele | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return {
    nom: 'anthropic-garde',
    simule: false,
    modelePour: (profil) => (PROFILS_ROUTES_ANTHROPIC.includes(profil) ? modeleTexte() : null),
    async appeler(a) {
      exigerPiecesConformes(a);
      const client = guardedAnthropic({ workspaceId: a.workspaceId, action: a.action });
      if (!client) throw new Error('Fournisseur non configuré.');
      const modele = modeleTexte();
      const system = a.messages.filter((m) => m.role === 'system').map((m) => ({ type: 'text' as const, text: m.contenu }));
      // Les pièces vont dans le PREMIER message utilisateur (la compilation n'en produit qu'un).
      const user = a.messages.filter((m) => m.role === 'user').map((m, i) => ({ role: 'user' as const, content: contenuUtilisateur(m.contenu, i === 0 ? a.pieces ?? [] : []) }));
      const res = await client.messages.create({ model: modele, max_tokens: a.maxJetonsSortie, system, messages: user });
      const texte = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const entree = res.usage?.input_tokens ?? 0;
      const sortie = res.usage?.output_tokens ?? 0;
      return { texte, modele, jetonsEntree: entree, jetonsSortie: sortie, coutUsd: costOfTokens(modele, entree, sortie) };
    },
  };
}
