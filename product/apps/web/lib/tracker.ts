import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { ttSearchAds, ttSearchTikTok, ttSearchGoogle, type InspoAd } from '@tiktrends/integrations';

/**
 * Tracking concurrents : re-scanne les marques suivies via Trendtrack, détecte les
 * NOUVELLES pubs (ids jamais vus), les consigne dans brand_tracker_events et notifie
 * l'équipe. Le 1er scan pose une baseline (pas d'événement) pour ne pas tout signaler.
 * Best-effort : une marque en échec n'arrête pas les autres.
 */
const PER_BRAND = 24;      // pubs récupérées par marque à chaque scan
const CAP_NEW = 15;        // nouvelles pubs max consignées par marque et par scan
const SEEN_CAP = 600;      // borne de la mémoire d'ids par marque

async function fetchCurrentAds(apiKey: string, platform: string, name: string): Promise<InspoAd[]> {
  try {
    if (platform === 'tiktok') return (await ttSearchTikTok({ apiKey }, { search: name, limit: PER_BRAND })).ads;
    if (platform === 'google') return (await ttSearchGoogle({ apiKey }, { search: name, limit: PER_BRAND })).ads;
    return (await ttSearchAds({ apiKey }, { search: name, searchIn: 'brand', sortBy: 'newest', status: 'all', limit: PER_BRAND })).ads;
  } catch { return []; }
}

export async function scanWorkspaceTracker(workspaceId: string): Promise<{ scanned: number; newAds: number }> {
  const apiKey = process.env.TRENDTRACK_API_KEY;
  if (!db || !apiKey) return { scanned: 0, newAds: 0 };

  const brands = await db.select().from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, workspaceId));
  let newAds = 0;

  for (const fb of brands) {
    const ads = await fetchCurrentAds(apiKey, fb.platform, fb.name);
    if (!ads.length) continue;
    const currentIds = ads.map((a) => a.id).filter((x): x is string => !!x);
    if (!currentIds.length) continue; // rien d'exploitable : on ne pose pas de base vide
    // Une base vide serait traitée comme « rien vu » et signalerait tout à chaque passage.
    const stored = Array.isArray(fb.seenAdIds) ? (fb.seenAdIds as string[]) : null;
    const seen = stored && stored.length ? stored : null;

    if (seen === null) {
      // Baseline : on mémorise sans rien signaler.
      await db.update(schema.followedBrands).set({ seenAdIds: currentIds.slice(0, SEEN_CAP), lastCheckedAt: new Date() }).where(eq(schema.followedBrands.id, fb.id));
      continue;
    }

    const seenSet = new Set(seen);
    const fresh = ads.filter((a) => a.id && !seenSet.has(a.id)).slice(0, CAP_NEW);
    if (fresh.length) {
      await db.insert(schema.brandTrackerEvents).values(fresh.map((a) => ({
        workspaceId, followedBrandId: fb.id, platform: fb.platform, advertiserName: fb.name, kind: 'new' as const, snapshot: a,
      })));
      newAds += fresh.length;
    }
    // On ne mémorise que les annonces RÉELLEMENT signalées (+ l'historique) : au-delà du
    // plafond, les nouveautés restantes seront remontées au prochain passage, pas perdues.
    const reported = fresh.map((a) => a.id).filter((x): x is string => !!x);
    const merged = [...reported, ...seen];
    const dedup = Array.from(new Set(merged)).slice(0, SEEN_CAP);
    await db.update(schema.followedBrands).set({ seenAdIds: dedup, lastCheckedAt: new Date() }).where(eq(schema.followedBrands.id, fb.id));
  }

  // Notifie l'équipe (admin+) si des nouveautés.
  if (newAds > 0) {
    try {
      const members = await db.select({ uid: schema.workspaceMembers.userId, role: schema.workspaceMembers.role })
        .from(schema.workspaceMembers).where(eq(schema.workspaceMembers.workspaceId, workspaceId));
      const targets = members.filter((m) => m.role === 'owner' || m.role === 'admin' || m.role === 'member').map((m) => m.uid);
      if (targets.length) {
        await db.insert(schema.notifications).values(targets.map((uid) => ({
          workspaceId, userId: uid, type: 'tracker',
          title: `${newAds} nouvelle${newAds > 1 ? 's' : ''} pub${newAds > 1 ? 's' : ''} chez tes concurrents`,
          body: 'Des marques que tu suis ont sorti de nouvelles créas.', href: '/saved',
        })));
      }
    } catch { /* notif best-effort */ }
  }

  return { scanned: brands.length, newAds };
}

/** Scan de tous les espaces ayant au moins une marque suivie (cron). */
export async function scanAllTracker(): Promise<{ workspaces: number; newAds: number }> {
  if (!db || !process.env.TRENDTRACK_API_KEY) return { workspaces: 0, newAds: 0 };
  const rows = await db.selectDistinct({ ws: schema.followedBrands.workspaceId }).from(schema.followedBrands);
  let newAds = 0;
  for (const r of rows) { const res = await scanWorkspaceTracker(r.ws); newAds += res.newAds; }
  return { workspaces: rows.length, newAds };
}

/** Marque comme vues les nouveautés de l'espace (après consultation du fil). */
export async function markTrackerSeen(workspaceId: string): Promise<void> {
  if (!db) return;
  await db.update(schema.brandTrackerEvents).set({ seenAt: new Date() })
    .where(and(eq(schema.brandTrackerEvents.workspaceId, workspaceId), sql`${schema.brandTrackerEvents.seenAt} is null`));
}
