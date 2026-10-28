import { redirect } from 'next/navigation';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import type { InspoAd } from '@tiktrends/integrations';
import { alertesSemaine, apercuImage, bibliothequePub, compterNouveautes, etatConnexionMeta, etatScanNouveautes, libelleBibliotheque, ligneRadarCreatif, manqueRadarCreatif, nouveautesSemaine, pastilleMarque, resumeRadarCreatif, siteMarque } from '@tiktrends/core';
import { buildLiveAnalysis } from '../../../../lib/analysis';
import { getSession } from '../../../../lib/auth';
import { FEATURES, canAccess, denyReason, roleAtLeast, PLAN_LABEL, type Plan } from '../../../../lib/rbac';
import { effectiveAccess } from '../../../../lib/access';
import { getActiveBrand } from '../../../../lib/brands';
import { lireConnexionMeta } from '../../../../lib/connexion-meta';
import { Radar, type MarqueRadar } from '../../../../spatial/vues/veille/Radar';
import { pastilleRadar } from '../veille/acces';

export const dynamic = 'force-dynamic';

const feature = FEATURES.find((f) => f.key === 'radar')!;

/** La recherche des annonces d'une marque dans la Veille (Meta · par nom · TikTok · par domaine). */
function voirMarque(platform: string, name: string, domain: string | null): string {
  const p = new URLSearchParams();
  if (platform === 'tiktok' && domain) { p.set('q', domain); p.set('p', 'tiktok'); }
  else { p.set('q', name); p.set('p', platform === 'google' ? 'google' : 'meta'); if (platform !== 'google') p.set('searchIn', 'brand'); }
  return `/veille?${p}`;
}

/**
 * « Radar » (Spatial) · même garde que le Radar V5 (fonctionnalité `radar`). La
 * maquette en fait la veille des concurrents · on la sert avec les données de
 * suivi RÉELLES : marques suivies de la marque active, nouvelles pubs relevées
 * par le suivi (`brand_tracker_events`). Aucun appel au fournisseur ici.
 */
export default async function RadarSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  const ouvert = canAccess(access, feature);
  const raison = denyReason(access, feature);
  const brand = db ? await getActiveBrand(s.workspaceId) : null;

  const maintenant = new Date();
  let marques: MarqueRadar[] = [];
  let evenements: Array<{ advertiserName: string; createdAt: Date; unseen: boolean; followedBrandId: string | null; snapshot: InspoAd }> = [];
  let comptes: ReturnType<typeof compterNouveautes> = new Map();
  if (db && roleAtLeast(s.role, 'member')) {
    const fl = await db.select().from(schema.followedBrands)
      .where(brand ? and(eq(schema.followedBrands.workspaceId, s.workspaceId), eq(schema.followedBrands.brandId, brand.id)) : eq(schema.followedBrands.workspaceId, s.workspaceId))
      .orderBy(desc(schema.followedBrands.createdAt));
    const ev = await db.select({ advertiserName: schema.brandTrackerEvents.advertiserName, createdAt: schema.brandTrackerEvents.createdAt, seenAt: schema.brandTrackerEvents.seenAt, followedBrandId: schema.brandTrackerEvents.followedBrandId, snapshot: schema.brandTrackerEvents.snapshot })
      .from(schema.brandTrackerEvents).where(eq(schema.brandTrackerEvents.workspaceId, s.workspaceId))
      .orderBy(desc(schema.brandTrackerEvents.createdAt)).limit(200);
    const ids = new Set(fl.map((f) => f.id));
    evenements = ev.filter((e) => e.followedBrandId && ids.has(e.followedBrandId))
      .map((e) => ({ advertiserName: e.advertiserName, createdAt: e.createdAt as Date, unseen: !e.seenAt, followedBrandId: e.followedBrandId, snapshot: e.snapshot as InspoAd }));
    // LA règle de comptage · l'en-tête (alertes) et chaque carte lisent les MÊMES comptes,
    // par marque suivie, sur la même fenêtre (planche v4 · « 3 nouvelles pubs » au-dessus de « Aucune nouveauté »).
    comptes = compterNouveautes(evenements, maintenant);
    marques = fl.map((f) => {
      const siens = evenements.filter((e) => e.followedBrandId === f.id);
      return {
        cle: f.id, nom: f.name, ...pastilleMarque(f.name),
        site: f.domain ?? (f.platform === 'tiktok' ? 'TikTok' : f.platform === 'google' ? 'Google' : 'Meta'),
        vignettes: siens.slice(0, 3).map((e) => apercuImage({ isVideo: (e.snapshot?.mediaType ?? '').toLowerCase().includes('vid'), thumbnailUrl: e.snapshot?.thumbnailUrl, mediaUrl: e.snapshot?.mediaUrl })),
        nouveautes: (comptes.get(f.id)?.semaine ?? 0) > 0 ? nouveautesSemaine(comptes.get(f.id)) : null,
        voir: voirMarque(f.platform, f.name, f.domain),
        gestes: (() => {
          const biblio = bibliothequePub({ platform: f.platform, name: f.name });
          return { plateforme: f.platform, biblio: biblio ? { href: biblio.url, libelle: libelleBibliotheque(biblio)! } : null, siteWeb: siteMarque({ landingDomain: f.domain ?? undefined }) };
        })(),
      };
    });
  }

  const parCle = new Map(marques.map((m) => [m.cle, m]));
  const alertes = alertesSemaine(marques, comptes).map((a) => ({
    titre: a.titre,
    texte: 'Relevé par le suivi des marques que tu suis · ouvre ses pubs pour voir ce qui change.',
    action: { href: parCle.get(a.cle)?.voir ?? '/veille?vue=suivies', libelle: 'Voir ses pubs' },
  }));
  // Radar créatif (vague 3) · les créas Meta RÉELLES de la marque active, notées comme l'ancien écran · jamais d'exemple.
  // L'état de la connexion Meta · LA même lecture et LA même règle que l'Accueil et la vue
  // Analytics (planche v4 · le Radar disait « Brancher Meta Ads » à un compte synchronisé).
  let creatif: { maj: string | null; resume: ReturnType<typeof resumeRadarCreatif>; lignes: ReturnType<typeof ligneRadarCreatif>[] } | null = null;
  let connexionMeta: { libelle: string; manque: { texte: string; action: string } } | undefined;
  if (db && ouvert && brand) {
    const lue = await lireConnexionMeta(brand.id, s.workspaceId);
    if (lue) {
      const etat = etatConnexionMeta(lue.entree, new Date());
      connexionMeta = { libelle: etat.libelle, manque: manqueRadarCreatif(etat) };
    }
    const ins = lue?.insights ?? null;
    if (ins?.ads?.length) {
      const rows = buildLiveAnalysis(ins.ads);
      const kpiLe = lue!.entree.kpiLe;
      creatif = { maj: kpiLe ? new Date(kpiLe).toLocaleDateString('fr-FR') : null, resume: resumeRadarCreatif(rows), lignes: rows.map(ligneRadarCreatif) };
    }
  }
  const plan = PLAN_LABEL[feature.minPlan as Plan];

  return (
    <Radar
      ouvert={ouvert}
      pastilleRadar={pastilleRadar(access)}
      alertes={alertes}
      suivi={ouvert ? {
        scan: etatScanNouveautes({ veilleActive: !!process.env.TRENDTRACK_API_KEY, marquesSuivies: marques.length }),
        nonVues: evenements.filter((e) => e.unseen).length,
        explorer: !!process.env.TRENDTRACK_API_KEY,
      } : undefined}
      creatif={ouvert ? creatif : undefined}
      connexionMeta={ouvert ? connexionMeta : undefined}
      marques={marques}
      inclus={`Inclus dans ton offre ${PLAN_LABEL[s.plan as Plan] ?? ''}`.trim()}
      verrou={ouvert ? null : {
        titre: raison === 'plan' ? `Inclus dès l’offre ${plan}` : 'Accès réservé',
        texte: raison === 'plan'
          ? `Le Radar suit les marques de ton choix et relève leurs nouvelles pubs. Il s’ouvre avec l’offre ${plan}.`
          : 'Ton rôle ne permet pas d’utiliser le Radar · demande l’accès à un administrateur de l’espace.',
        passer: raison === 'plan' && s.role === 'owner'
          ? { href: '/billing', libelle: `Passer à ${plan} · Radar inclus` }
          : { raison: raison === 'plan' ? 'Seul le propriétaire change d’offre' : 'Accès à demander à un administrateur' },
        superposition: alertes.length
          ? { titre: `${alertes.length} alerte${alertes.length > 1 ? 's' : ''} t’attend${alertes.length > 1 ? 'ent' : ''}`, sous: 'Débloque le Radar pour les voir' }
          : { titre: 'Le Radar est fermé pour ton espace', sous: 'Débloque-le pour suivre tes concurrents' },
      }}
    />
  );
}

