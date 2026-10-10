/**
 * ContextResolver serveur · construit le `context` d'une tâche (cahier §8.3).
 *
 * Ce qu'il ajoute, et lui seul :
 *  - la DIRECTION ARTISTIQUE de la marque déjà saisie dans l'outil (règles
 *    créatives, DA visuelle, description, promesse, ton…), relue dans `brands`
 *    pour (espace, marque) et mise en forme par le noyau (`extraitDaMarque` :
 *    champs vides ignorés, total borné). Elle entre EN TÊTE des extraits de
 *    connaissance, marquée `untrusted_data` · aucune variable de gabarit
 *    nouvelle. Même interrupteur que les connaissances (`connaissances: false`) ;
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

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { extraitDaMarque, versionsApplicables, type ExtraitDaMarque, type TypeConnaissance } from '@tiktrends/core';
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

/** La DA de la marque, relue dans SA portée (espace ET marque) · `null` sans marque ou sans DA. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function lireDaMarque(portee: { workspaceId: string; brandId: string }): Promise<ExtraitDaMarque | null> {
  // Portée synthétique (banc d'évaluation) · aucune marque en base à relire.
  if (!UUID.test(portee.brandId) || !UUID.test(portee.workspaceId)) return null;
  const B = schema.brands;
  const [m] = await db.select({
    name: B.name, creativeRules: B.creativeRules, brandKit: B.brandKit, description: B.description, usp: B.usp,
    audience: B.audience, tone: B.tone, category: B.category, colors: B.colors, fonts: B.fonts,
    preferredWords: B.preferredWords, avoidWords: B.avoidWords,
  }).from(B).where(and(eq(B.id, portee.brandId), eq(B.workspaceId, portee.workspaceId))).limit(1);
  return m ? extraitDaMarque(portee.brandId, m) : null;
}

export async function construireContexte(portee: { workspaceId: string; brandId: string }, e: EntreeContexte): Promise<{ contexte: ContexteTache; sources: SourceSnapshot[] }> {
  const sources: SourceSnapshot[] = [];
  const knowledgeExcerpts: Extrait[] = [];
  if (e.connaissances !== false) {
    const da = await lireDaMarque(portee);
    if (da) {
      knowledgeExcerpts.push({ sourceId: da.sourceId, version: da.version, text: da.text, trust: 'untrusted_data' });
      sources.push({ type: 'connaissance', id: da.sourceId, version: da.version, titre: da.titre });
    }
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
