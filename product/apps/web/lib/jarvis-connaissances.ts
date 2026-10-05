import 'server-only';
import { and, eq, like, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  lireConnaissance, versionsApplicables, assemblerConnaissances, insererConnaissances, citationsComptees,
  refConnaissance, porteeApplicable,
  type Connaissance, type ContexteReponse, type BlocConnaissances, type InclusionConnaissance, type Selection,
} from '@tiktrends/core';

/**
 * Les Connaissances de l'équipe plateforme, côté serveur · lecture, écriture,
 * cache, et ce qui part réellement dans la consigne de Jarvis.
 *
 * ── Où elles vivent, et pourquoi là ──────────────────────────────────────────
 *
 * Dans `app_settings`, la table clé/valeur GLOBALE des réglages plateforme
 * (ADMIN+) · une ligne par connaissance (`connaissance:<id>`), toutes ses
 * versions dans la valeur. Aucune migration : la table existe, elle n'a pas de
 * colonne d'espace ni de marque, et c'est exactement la portée par défaut d'une
 * connaissance ADMIN+ · la plateforme. Les autres stockages de Jarvis ont tous
 * une portée MARQUE (`brands.creative_rules`, `brands.jarvis_learnings`,
 * `adsmap_learnings`, `agent_memory`) · y ranger un savoir d'équipe l'aurait
 * soit enfermé dans une marque, soit mélangé aux données d'un client.
 *
 * L'usage (inclusion dans le contexte d'une réponse, citation) vit à côté, une
 * ligne par version (`connaissance-usage:<id>:v<n>`), incrémentée en SQL pour
 * que deux réponses simultanées ne s'écrasent pas.
 *
 * ── Le cache, et le retrait ──────────────────────────────────────────────────
 *
 * Chaque réponse de Jarvis lit la liste. On la garde en mémoire, mais elle n'est
 * jamais servie sur la foi d'une horloge ni d'une invalidation locale : avant
 * chaque usage, une requête d'agrégat relit l'EMPREINTE des lignes (nombre,
 * somme des révisions, dernière écriture). Elle a changé · on relit tout.
 *
 * Pourquoi pas un simple « vider le cache à l'écriture » : relevé à la recette
 * en production locale, un même module serveur existe en PLUSIEURS instances
 * (l'action d'administration et la lecture du fil de Jarvis ne partageaient pas
 * la même mémoire) · le retrait vidait l'une et l'autre continuait d'afficher
 * l'ancienne liste. L'empreinte vit en base, toutes les instances la voient, et
 * un retrait prend effet à la réponse suivante, quel que soit le processus.
 */

const PREFIXE = 'connaissance:';
const PREFIXE_USAGE = 'connaissance-usage:';

let cache: { empreinte: string; liste: Connaissance[] } | null = null;

export function invaliderConnaissances(): void { cache = null; }

/** Nombre de lignes, somme des révisions, dernière écriture · change à CHAQUE geste du noyau. */
async function empreinte(): Promise<string> {
  if (!db) return '';
  const [r] = await db.select({
    n: sql<string>`count(*)::text`,
    rev: sql<string>`coalesce(sum((${schema.appSettings.value}->>'rev')::int), 0)::text`,
    maj: sql<string>`coalesce(max(${schema.appSettings.updatedAt})::text, '')`,
  }).from(schema.appSettings).where(like(schema.appSettings.key, `${PREFIXE}%`));
  return `${r?.n}|${r?.rev}|${r?.maj}`;
}

/** Toutes les connaissances lisibles · écarte (sans planter) ce qui ne se relit pas. */
export async function listerConnaissances(): Promise<Connaissance[]> {
  if (!db) return [];
  const rows = await db.select({ key: schema.appSettings.key, value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(like(schema.appSettings.key, `${PREFIXE}%`));
  return rows.map((r) => lireConnaissance(r.value)).filter((c): c is Connaissance => !!c);
}

async function listeEnCache(): Promise<Connaissance[]> {
  const e = await empreinte();
  if (cache && cache.empreinte === e) return cache.liste;
  const liste = await listerConnaissances();
  cache = { empreinte: e, liste };
  return liste;
}

export async function lireUneConnaissance(id: string): Promise<Connaissance | null> {
  if (!db) return null;
  const [row] = await db.select({ value: schema.appSettings.value }).from(schema.appSettings)
    .where(eq(schema.appSettings.key, PREFIXE + id)).limit(1);
  return row ? lireConnaissance(row.value) : null;
}

/**
 * Écrit une connaissance, sous condition · `revAttendue` null = création (refus
 * si la clé existe), sinon la ligne n'est remplacée que si personne ne l'a
 * réécrite entre la lecture et l'écriture. Renvoie false sur conflit.
 */
export async function ecrireConnaissance(c: Connaissance, revAttendue: number | null): Promise<boolean> {
  if (!db) return false;
  const key = PREFIXE + c.id;
  let ecrit: boolean;
  if (revAttendue === null) {
    const r = await db.insert(schema.appSettings).values({ key, value: c }).onConflictDoNothing().returning({ key: schema.appSettings.key });
    ecrit = r.length === 1;
  } else {
    const r = await db.update(schema.appSettings)
      .set({ value: c, updatedAt: new Date() })
      .where(and(eq(schema.appSettings.key, key), sql`(${schema.appSettings.value}->>'rev')::int = ${revAttendue}`))
      .returning({ key: schema.appSettings.key });
    ecrit = r.length === 1;
  }
  invaliderConnaissances();
  return ecrit;
}

/* -------------------------------------------------------------------------- */
/*  Ce qui part dans la consigne                                              */
/* -------------------------------------------------------------------------- */

export interface ConnaissancesReponse extends BlocConnaissances { conflits: Selection['conflits'] }

/** Le bloc applicable à la marque qui parle · publiées seulement, dans leur portée, sous le plafond. */
export async function connaissancesPourReponse(ctx: ContexteReponse): Promise<ConnaissancesReponse> {
  const { retenues, conflits } = versionsApplicables(await listeEnCache(), ctx);
  return { ...assemblerConnaissances(retenues), conflits };
}

/**
 * La consigne de Jarvis, connaissances comprises · l'unique point d'entrée de la
 * conversation. Une lecture qui échoue ne coupe pas Jarvis : il répond sans le
 * bloc, comme avant (et rien n'est compté comme inclus).
 */
export async function consigneAvecConnaissances(consigne: string, ctx: ContexteReponse): Promise<{ system: string; inclus: InclusionConnaissance[] }> {
  const bloc = await connaissancesPourReponse(ctx).catch(() => null);
  if (!bloc || !bloc.texte) return { system: consigne, inclus: [] };
  return { system: insererConnaissances(consigne, bloc.texte), inclus: bloc.inclus };
}

/* -------------------------------------------------------------------------- */
/*  Usage · inclus, cité                                                      */
/* -------------------------------------------------------------------------- */

export interface UsageVersion { inclus: number; cite: number; dernierInclus: string | null; dernierCite: string | null }

/**
 * Consigne, après une réponse, ce qui était DANS son contexte et ce qu'elle a
 * réellement CITÉ (marqueur `[[SOURCE:ref]]` d'une référence incluse). Une
 * incrémentation SQL par version · deux réponses simultanées ne se perdent pas.
 */
export async function consignerUsageConnaissances(inclus: ReadonlyArray<InclusionConnaissance>, reponse: string, question?: string | null): Promise<{ citees: string[] }> {
  if (!db || !inclus.length) return { citees: [] };
  // « Citée » = déclarée par le modèle · une question qui dicte le marqueur ne compte pas.
  const refs = citationsComptees(reponse, inclus.map((i) => i.ref), question);
  const maintenant = new Date().toISOString();
  for (const i of inclus) {
    const cite = refs.includes(i.ref) ? 1 : 0;
    const key = `${PREFIXE_USAGE}${i.id}:v${i.n}`;
    const init = { inclus: 1, cite, dernierInclus: maintenant, dernierCite: cite ? maintenant : null };
    await db.insert(schema.appSettings).values({ key, value: init })
      .onConflictDoUpdate({
        target: schema.appSettings.key,
        set: {
          value: sql`jsonb_build_object(
            'inclus', coalesce((${schema.appSettings.value}->>'inclus')::int, 0) + 1,
            'cite', coalesce((${schema.appSettings.value}->>'cite')::int, 0) + ${cite},
            'dernierInclus', ${maintenant}::text,
            'dernierCite', case when ${cite} = 1 then ${maintenant}::text else ${schema.appSettings.value}->>'dernierCite' end
          )`,
          updatedAt: new Date(),
        },
      });
  }
  return { citees: refs };
}

/** L'usage de toutes les versions · clé `ref` (voir `refConnaissance`). */
export async function usageConnaissances(): Promise<Map<string, UsageVersion>> {
  const out = new Map<string, UsageVersion>();
  if (!db) return out;
  const rows = await db.select({ key: schema.appSettings.key, value: schema.appSettings.value })
    .from(schema.appSettings)
    .where(like(schema.appSettings.key, `${PREFIXE_USAGE}%`));
  for (const r of rows) {
    const m = /^connaissance-usage:(.+):v(\d+)$/.exec(r.key);
    if (!m) continue;
    const v = (r.value ?? {}) as Record<string, unknown>;
    out.set(refConnaissance(m[1]!, Number(m[2])), {
      inclus: Number(v.inclus ?? 0) || 0,
      cite: Number(v.cite ?? 0) || 0,
      dernierInclus: typeof v.dernierInclus === 'string' ? v.dernierInclus : null,
      dernierCite: typeof v.dernierCite === 'string' ? v.dernierCite : null,
    });
  }
  return out;
}

/**
 * Les titres des références citées dans un fil · pour afficher « source » sous
 * une réponse. On ne résout QUE les références présentes dans le fil de la
 * personne, et seulement si la connaissance vaut pour sa marque · rien d'autre
 * de la liste de l'équipe ne traverse.
 */
export async function titresDesSources(refs: ReadonlyArray<string>, ctx: ContexteReponse): Promise<Record<string, { titre: string; enService: boolean }>> {
  const voulues = new Set(refs);
  if (!voulues.size) return {};
  const out: Record<string, { titre: string; enService: boolean }> = {};
  for (const c of await listeEnCache()) {
    for (const v of c.versions) {
      const ref = refConnaissance(c.id, v.n);
      if (!voulues.has(ref)) continue;
      // Un brouillon n'a jamais été dans un contexte · une citation qui le vise
      // est forgée (recopiée, dictée), on ne révèle pas son titre.
      if (v.etat === 'brouillon') continue;
      if (porteeApplicable(v.portee, ctx)) out[ref] = { titre: v.titre, enService: v.etat === 'publie' };
    }
  }
  return out;
}
