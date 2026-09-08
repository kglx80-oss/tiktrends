'use server';

import { eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { getSession } from '../../lib/auth';
import { getActiveBrand } from '../../lib/brands';
import { ttSearchAds, type InspoAd } from '@tiktrends/integrations';
import { termeDecouverte, decouvertes, PROVEN_DAYS, type RadarCandidate } from '@tiktrends/core';
import { logAndTranslate } from '../../lib/error-log';

/**
 * La découverte · les créas éprouvées de TA catégorie que tu ne suis pas.
 *
 * Le radar ne regarde que les marques suivies · ce fichier ouvre l'autre œil.
 * Il cherche par catégorie, ne garde que ce qui a SURVÉCU (filtre côté source
 * via `minDaysRunning`, puis re-vérifié par le noyau), écarte ce qu'on a déjà vu
 * ou qu'on suit déjà, et rend une liste prête à envoyer au studio via le pont
 * de veille. La décision de ce qui remonte vit dans le noyau, testée · ici on
 * récolte et on branche.
 *
 * Gratuit · aucune description, aucun modèle. La survie vient de la source, le
 * tri est de l'arithmétique. Le seul coût est la requête de veille elle-même,
 * bornée en effectif.
 */

export interface DecouverteResult {
  ads?: InspoAd[];
  /** Pourquoi la liste est vide · une catégorie manquante n'est pas une panne. */
  note?: string;
  error?: string;
}

const LIMITE_RECOLTE = 40;
const LIMITE_AFFICHEE = 12;

export async function decouverteMarcheAction(): Promise<DecouverteResult> {
  const s = await getSession();
  if (!s || !db) return { error: 'Session expirée.' };
  const apiKey = process.env.TRENDTRACK_API_KEY;
  if (!apiKey) return { note: 'La veille n’est pas configurée.' };

  const brand = await getActiveBrand(s.workspaceId);
  if (!brand) return { note: 'Choisis une marque active pour découvrir sa catégorie.' };

  const [row] = await db.select({ category: schema.brands.category })
    .from(schema.brands).where(eq(schema.brands.id, brand.id)).limit(1);
  const terme = termeDecouverte({ category: row?.category ?? null });
  if (!terme) {
    return { note: 'Renseigne la catégorie de la marque pour activer la découverte.' };
  }

  // 1 · Récolte · la source filtre déjà sur la survie et classe par longévité.
  let ads: InspoAd[];
  try {
    const r = await ttSearchAds({ apiKey }, {
      search: terme, searchIn: 'ad_copy', status: 'active',
      sortBy: 'longestRunning', order: 'desc', minDaysRunning: PROVEN_DAYS, limit: LIMITE_RECOLTE, offset: 0,
    });
    ads = r.ads;
  } catch (e) {
    return { error: logAndTranslate('decouverte:search', e, { subject: 'la découverte de marché', workspaceId: s.workspaceId }) };
  }
  if (!ads.length) return { note: `Rien d’éprouvé trouvé dans « ${terme} » pour l’instant.` };

  // 2 · Ce qu'on connaît / suit déjà · pour ne remonter que du neuf.
  const [connusRows, savedRows, suiviesRows] = await Promise.all([
    db.select({ externalId: schema.marketCreatives.externalId }).from(schema.marketCreatives).where(eq(schema.marketCreatives.workspaceId, s.workspaceId)),
    db.select({ externalId: schema.savedAds.externalId }).from(schema.savedAds).where(eq(schema.savedAds.workspaceId, s.workspaceId)),
    db.select({ name: schema.followedBrands.name }).from(schema.followedBrands).where(eq(schema.followedBrands.workspaceId, s.workspaceId)),
  ]);
  const connus = new Set<string>([...connusRows, ...savedRows].map((r) => r.externalId).filter(Boolean));
  const suivis = new Set<string>(suiviesRows.map((r) => r.name).filter(Boolean));

  // 3 · Sélection · la règle vit dans le noyau.
  const candidats: RadarCandidate[] = ads.map((a) => ({
    externalId: a.id,
    advertiser: a.advertiserName ?? null,
    daysRunning: a.daysRunning ?? 0,
    reachDelta30d: a.reachDelta30d ?? null,
    liveAdsCount: a.liveAdsCount ?? null,
    format: a.mediaType ?? null,
    hasImage: !!(a.thumbnailUrl || a.mediaUrl),
    hasText: !!a.body,
  }));
  const retenus = decouvertes(candidats, { connus, suivis });

  // On rend les InspoAd d'origine, dans l'ordre décidé par le noyau.
  const parId = new Map(ads.map((a) => [a.id, a]));
  const out = retenus.map((c) => parId.get(c.externalId)).filter((a): a is InspoAd => !!a).slice(0, LIMITE_AFFICHEE);
  if (!out.length) return { note: `Tout ce qui est éprouvé dans « ${terme} », tu le suis ou l’as déjà vu.` };
  return { ads: out };
}
