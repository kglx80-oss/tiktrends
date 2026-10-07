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
 */

import type { MessageCompile } from './noyau';
import { guardedAnthropic } from '../../spend-guard';
import { costOfTokens } from '@tiktrends/core';

export interface AppelModele {
  profil: string;
  messages: ReadonlyArray<MessageCompile>;
  maxJetonsSortie: number;
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
export const PROFILS_ROUTES_ANTHROPIC: readonly string[] = ['reasoning_structured'];

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
      const client = guardedAnthropic({ workspaceId: a.workspaceId, action: a.action });
      if (!client) throw new Error('Fournisseur non configuré.');
      const modele = modeleTexte();
      const system = a.messages.filter((m) => m.role === 'system').map((m) => ({ type: 'text' as const, text: m.contenu }));
      const user = a.messages.filter((m) => m.role === 'user').map((m) => ({ role: 'user' as const, content: m.contenu }));
      const res = await client.messages.create({ model: modele, max_tokens: a.maxJetonsSortie, system, messages: user });
      const texte = res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
      const entree = res.usage?.input_tokens ?? 0;
      const sortie = res.usage?.output_tokens ?? 0;
      return { texte, modele, jetonsEntree: entree, jetonsSortie: sortie, coutUsd: costOfTokens(modele, entree, sortie) };
    },
  };
}
