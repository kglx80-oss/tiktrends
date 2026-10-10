/**
 * Studios · éditeur de calques · annuler et rétablir.
 *
 * Pur. L'historique garde des DOCUMENTS entiers, pas des patchs inverses : les
 * opérations ne mutent rien et partagent les calques inchangés, si bien qu'une
 * étape ne coûte que les calques touchés. Annuler rend exactement le document
 * d'avant (même empreinte), quel que soit le chemin.
 *
 * ── Borne ───────────────────────────────────────────────────────────────────
 *
 * `HISTORIQUE_MAX` = 100 étapes. Mesuré (`l5b-calques.test.ts`, « borne de
 * l'historique ») : un document de 40 calques sérialisé pèse 10 416 caractères (≈ 10 Ko) ; cent
 * copies COMPLÈTES feraient ≈ 1 Mo, le partage structurel en garde bien moins.
 * Au-delà de cent, l'étape la plus ancienne tombe. L'historique vit dans
 * l'onglet : il ne survit pas à un rechargement (la sauvegarde locale garde le
 * document, pas l'historique), et l'enregistrement serveur crée une version.
 */

import type { DocumentStudio } from '../document';
import { memeValeur } from './patch-document';
import type { ResultatOperation } from './operations';

export const HISTORIQUE_MAX = 100;

export interface EtapeHistorique {
  document: DocumentStudio;
  /** Le geste qui sépare cette étape de la suivante · « Déplacer « CTA » ». */
  libelle: string;
}

export interface HistoriqueCalques {
  passe: EtapeHistorique[];
  present: DocumentStudio;
  futur: EtapeHistorique[];
}

export function historiqueInitial(doc: DocumentStudio): HistoriqueCalques {
  return { passe: [], present: doc, futur: [] };
}

/** Nouvelle étape · efface le futur ; un document identique au présent n'ajoute rien. */
export function enregistrerEtape(h: HistoriqueCalques, doc: DocumentStudio, libelle: string, max = HISTORIQUE_MAX): HistoriqueCalques {
  if (doc === h.present || memeValeur(doc, h.present)) return h;
  const passe = [...h.passe, { document: h.present, libelle }];
  return { passe: passe.length > max ? passe.slice(passe.length - max) : passe, present: doc, futur: [] };
}

/** Applique le résultat d'une opération · un refus laisse l'historique tel quel. */
export function appliquerOperation(h: HistoriqueCalques, r: ResultatOperation): HistoriqueCalques {
  return r.ok ? enregistrerEtape(h, r.document, r.libelle) : h;
}

export function annulerEtape(h: HistoriqueCalques): HistoriqueCalques {
  const e = h.passe[h.passe.length - 1];
  if (!e) return h;
  return { passe: h.passe.slice(0, -1), present: e.document, futur: [{ document: h.present, libelle: e.libelle }, ...h.futur] };
}

export function retablirEtape(h: HistoriqueCalques): HistoriqueCalques {
  const [e, ...reste] = h.futur;
  if (!e) return h;
  return { passe: [...h.passe, { document: h.present, libelle: e.libelle }], present: e.document, futur: reste };
}

/** Libellé du geste qu'« Annuler » défera · `null` si rien à annuler. */
export function prochainAnnuler(h: HistoriqueCalques): string | null {
  return h.passe[h.passe.length - 1]?.libelle ?? null;
}

/** Libellé du geste que « Rétablir » refera · `null` si rien à rétablir. */
export function prochainRetablir(h: HistoriqueCalques): string | null {
  return h.futur[0]?.libelle ?? null;
}
