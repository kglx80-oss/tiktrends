/**
 * ContextResolver serveur · construit le `context` d'une tâche (cahier §8.3).
 *
 * Ce qu'il ajoute, et lui seul :
 *  - les CONNAISSANCES publiées et applicables à (espace, marque), lues dans le
 *    stockage existant (`app_settings`, `lib/jarvis-connaissances.ts`) et
 *    sélectionnées par le noyau (`versionsApplicables` : publiée, non retirée,
 *    portée stricte). Relues à CHAQUE résolution : une connaissance retirée
 *    sort du snapshot suivant, sans cache à invalider (PROMPT-08) ;
 *  - les extraits de SOURCES fournis par le serveur, chacun marqué
 *    `trust: 'untrusted_data'` et son identifiant ajouté aux sources
 *    autorisées. Rien de ce texte ne devient une consigne : il part en JSON
 *    dans le message utilisateur (`compilerRequete`).
 *
 * Les faits produit, références, documents résolus, sélection et chemins
 * viennent de l'appelant (données L1, instantanés L4) ; ils sont recopiés tels
 * quels, jamais complétés par une valeur par défaut.
 */

import { versionsApplicables, type TypeConnaissance } from '@tiktrends/core';
import { listerConnaissances } from '../../jarvis-connaissances';
import type { ContexteTache, Extrait } from './noyau';

export interface SourceFournie { sourceId: string; version: string; text: string; titre?: string }

export interface EntreeContexte {
  language?: string;
  projectVersionId?: string | null;
  facts?: ContexteTache['facts'];
  invariants?: string[];
  references?: ContexteTache['references'];
  selectionIds?: string[];
  allowedPaths?: string[];
  resolvedDocuments?: ContexteTache['resolvedDocuments'];
  allocatedIds?: ContexteTache['allocatedIds'];
  mediaBindings?: ContexteTache['mediaBindings'];
  historySummary?: string;
  sources?: SourceFournie[];
  /** Faux pour une tâche qui ne lit pas les connaissances (par défaut : vrai). */
  connaissances?: boolean;
}

/** Ce qui est entré dans le snapshot · noms affichables et références pour la trace. */
export interface SourceSnapshot {
  type: 'connaissance' | 'source';
  id: string;
  version: string;
  titre: string;
  nature?: TypeConnaissance;
}

export async function construireContexte(portee: { workspaceId: string; brandId: string }, e: EntreeContexte): Promise<{ contexte: ContexteTache; sources: SourceSnapshot[] }> {
  const sources: SourceSnapshot[] = [];
  const knowledgeExcerpts: Extrait[] = [];
  if (e.connaissances !== false) {
    const { retenues } = versionsApplicables(await listerConnaissances(), portee);
    for (const r of retenues) {
      knowledgeExcerpts.push({ sourceId: r.id, version: r.ref, text: r.texte, trust: 'untrusted_data' });
      sources.push({ type: 'connaissance', id: r.id, version: r.ref, titre: r.titre, nature: r.type });
    }
  }
  const sourceExcerpts: Extrait[] = (e.sources ?? []).map((s) => ({ sourceId: s.sourceId, version: s.version, text: s.text, trust: 'untrusted_data' }));
  for (const s of e.sources ?? []) sources.push({ type: 'source', id: s.sourceId, version: s.version, titre: s.titre ?? s.sourceId });
  const contexte: ContexteTache = {
    tenantId: portee.workspaceId,
    brandId: portee.brandId,
    projectVersionId: e.projectVersionId ?? null,
    language: e.language ?? 'fr',
    authorizedSourceIds: [...new Set((e.sources ?? []).map((s) => s.sourceId))],
    facts: e.facts ?? [],
    invariants: e.invariants ?? [],
    references: e.references ?? [],
    selectionIds: e.selectionIds ?? [],
    allowedPaths: e.allowedPaths ?? [],
    knowledgeVersionIds: knowledgeExcerpts.map((k) => k.version),
    historySummary: e.historySummary ?? '',
    sourceExcerpts,
    knowledgeExcerpts,
    resolvedDocuments: e.resolvedDocuments ?? [],
    allocatedIds: e.allocatedIds ?? [],
    mediaBindings: e.mediaBindings ?? [],
  };
  return { contexte, sources };
}
