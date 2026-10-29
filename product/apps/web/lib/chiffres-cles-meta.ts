import 'server-only';
import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  chiffresClesMeta, etatConnexionMeta, fenetreChiffresMeta, jourParis,
  type ChiffresClesMeta, type EtatConnexionMeta, type JourneeAnnonceMeta,
} from '@tiktrends/core';
import { lireConnexionMeta, type ConnexionMetaLue } from './connexion-meta';

/**
 * LA lecture des chiffres clés Meta d'une marque · la même pour l'Accueil
 * (Reporting Meta), la vue Analytics, Jarvis (« Chiffres clés ») et le Radar
 * créatif (planche finale, D2 · quatre écrans, trois vérités).
 *
 * Une lecture de la connexion (`lireConnexionMeta`, la même que #939), puis,
 * SEULEMENT quand la règle en aura besoin (connexion branchée et aucun KPI de
 * compte stocké), les journées des annonces suivies sur 30 + 30 jours. La
 * décision (quelle source, quelle fenêtre, quels chiffres) est celle du noyau
 * · `chiffresClesMeta`. Aucun écran ne relit sa propre source pour ces chiffres.
 */
export interface ChiffresMetaLus {
  lue: ConnexionMetaLue;
  connexion: EtatConnexionMeta;
  chiffres: ChiffresClesMeta;
}

/** Plafond de lignes lues · ~60 jours × quelques centaines d'annonces suivies. */
const LIGNES_MAX = 20_000;

export async function lireChiffresClesMeta(brandId: string, workspaceId: string, maintenant = new Date()): Promise<ChiffresMetaLus | null> {
  if (!db) return null;
  const lue = await lireConnexionMeta(brandId, workspaceId);
  if (!lue) return null;
  const connexion = etatConnexionMeta(lue.entree, maintenant);
  const aujourdhui = jourParis(maintenant);
  const ins = lue.insights;
  const compte = ins?.window
    ? { window: ins.window, previous: ins.previous ?? null, releveLe: lue.entree.kpiLe ?? null, creas: Array.isArray(ins.ads) ? ins.ads.length : null }
    : null;
  const branche = connexion.phase === 'synchronise' || connexion.phase === 'jamais_synchronise';

  let annonces: JourneeAnnonceMeta[] | null = null;
  if (branche && !compte) {
    const f = fenetreChiffresMeta(aujourdhui);
    const M = schema.metricsDaily, I = schema.adInstances, C = schema.creatives;
    const lignes = await db.select({
      annonce: I.id, externe: I.externalAdId, ensemble: I.adsetName, creative: I.creativeId, date: M.date,
      depense: M.spend, impressions: M.impressions, clics: M.clicks, achats: M.conv, revenu: M.revenue, vues3s: M.v3s, vues75: M.p75,
    }).from(M)
      .innerJoin(I, eq(I.id, M.adInstanceId))
      .innerJoin(C, eq(C.id, I.creativeId))
      .where(and(eq(C.brandId, brandId), eq(I.platform, 'meta'), gte(M.date, f.precDebut), lte(M.date, f.fin)))
      .limit(LIGNES_MAX);
    // Le nom d'une annonce suivie · celui de sa pub dans Résultats (même espace), sinon son ensemble.
    const creatives = [...new Set(lignes.map((l) => l.creative))];
    const noms = new Map<string, string>();
    if (creatives.length) {
      const A = schema.ads;
      const rows = await db.select({ creative: A.creativeId, nom: A.generatedName }).from(A)
        .where(and(eq(A.workspaceId, workspaceId), inArray(A.creativeId, creatives)));
      for (const r of rows) if (r.creative && r.nom && !noms.has(r.creative)) noms.set(r.creative, r.nom);
    }
    annonces = lignes.map((l) => ({
      annonce: l.annonce, nom: noms.get(l.creative) ?? l.ensemble ?? `Annonce ${l.externe}`, date: String(l.date),
      depense: Number(l.depense ?? 0), impressions: Number(l.impressions ?? 0), clics: Number(l.clics ?? 0), achats: Number(l.achats ?? 0),
      revenu: Number(l.revenu ?? 0), vues3s: Number(l.vues3s ?? 0), vues75: Number(l.vues75 ?? 0),
    }));
  }

  return { lue, connexion, chiffres: chiffresClesMeta({ connexion, compte, annonces, aujourdhui }) };
}
