/**
 * Studios · L3 · contrat d'un fournisseur de génération et d'un stockage.
 *
 * Types seuls (et deux erreurs typées). Le worker ne connaît que ce contrat ;
 * un adaptateur réel (fal, Higgsfield…) le réalisera plus tard. L'adaptateur
 * SIMULÉ des tests vit dans `packages/integrations/src/studios-simule.ts` et
 * refuse de démarrer en production.
 *
 * Le contrat distingue ce qui compte pour l'argent :
 *  · `ErreurFournisseurCertaine` · la requête est REFUSÉE, rien n'est facturé ;
 *  · `ErreurFournisseurIncertaine` · on ne sait pas (réponse perdue, délai) :
 *    la requête a pu être acceptée et facturée.
 */

import type { ConstatSortie } from './media';
import type { ProfilOperation } from './tarifs';

export interface DemandeFournisseur {
  /** Clé idempotente, posée en base AVANT l'appel (`cleFournisseurDuJob`). */
  cleIdempotence: string;
  operations: ReadonlyArray<{ operation: string; profil: ProfilOperation }>;
  /** Paramètres natifs déjà résolus · jamais de secret, jamais d'URL signée durable. */
  parametres: Record<string, unknown>;
}

export interface SortieFournisseur {
  operation: string;
  /** Référence opaque chez le fournisseur, pour télécharger. */
  ref: string;
  constat?: ConstatSortie | null;
}

export type StatutFournisseur =
  | { etat: 'en_cours'; progression?: number }
  | { etat: 'reussi'; sorties: SortieFournisseur[]; coutUsdMicros: number | null }
  | { etat: 'echoue'; facture: boolean; coutUsdMicros: number | null; motif: string }
  | { etat: 'annule'; facture: boolean; coutUsdMicros: number | null }
  | { etat: 'inconnu' };

export interface FournisseurStudio {
  readonly nom: string;
  /** Vrai pour l'adaptateur des tests · ses médias ne sont jamais présentés comme réels. */
  readonly simule: boolean;
  /** Le fournisseur sait retrouver une requête par sa clé idempotente. */
  readonly rechercheParCle: boolean;
  soumettre(d: DemandeFournisseur): Promise<{ requestId: string }>;
  statut(requestId: string): Promise<StatutFournisseur>;
  chercherParCle?(cle: string): Promise<string | null>;
  annuler?(requestId: string): Promise<void>;
  telecharger(requestId: string, ref: string): Promise<{ octets: Uint8Array; mimeAnnonce: string }>;
}

export interface StockageStudio {
  deposer(cle: string, octets: Uint8Array, mime: string): Promise<void>;
  /** Relecture après dépôt · `null` si absent. Sert à prouver « stocké ». */
  relire(cle: string): Promise<Uint8Array | null>;
}

export class ErreurFournisseurCertaine extends Error {
  readonly certaine = true;
  constructor(message: string) { super(message); this.name = 'ErreurFournisseurCertaine'; }
}

export class ErreurFournisseurIncertaine extends Error {
  readonly certaine = false;
  constructor(message: string) { super(message); this.name = 'ErreurFournisseurIncertaine'; }
}

export function estErreurCertaine(e: unknown): e is ErreurFournisseurCertaine {
  return e instanceof Error && (e as { certaine?: unknown }).certaine === true;
}
