import { notFound, redirect } from 'next/navigation';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  JOURS_LONGUE_DIFFUSION, consigneStyle, detecterTendances, estCleStyle, formatCreatif, lienNouveauProjet, ligneDiffusion,
  observationsSauvegardes, pastilleAnnonceur, pastilleTendanceStyle, statsParStyle, styleCrea, tuilesStyle,
} from '@tiktrends/core';
import { getSession } from '../../../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../../../lib/rbac';
import { effectiveAccess } from '../../../../../../lib/access';
import { getActiveBrand } from '../../../../../../lib/brands';
import { studioDepuisVeille } from '../../../../../../lib/veille-link';
import { PageFormat, type ExempleFormat } from '../../../../../../spatial/vues/formats/PageFormat';
import { AccesFerme } from '../../../../../../spatial/vues/formats/AccesFerme';
import { SOUS_NAV_VEILLE } from '../../../../../../spatial/vues/formats/sous-nav';
import { lireImageMarque, lireSauvegardes, lireSuivis, sauvegardesPourTendances } from '../donnees';

export const dynamic = 'force-dynamic';

const Veille = FEATURES.find((f) => f.key === 'inspo')!;
/** Les exemples montrés · les plus durables d'abord (la maquette en montre 6). */
const EXEMPLES_MAX = 12;

/**
 * La page d'un style (Spatial) · UNE page pour les 28 clés du catalogue
 * (`/veille/formats/<clé>`, maquette `f-<clé>`). Une clé hors catalogue → 404.
 * Exemples = sauvegardes classées dans le format normatif du style ; « Tes
 * tests » = concepts Adsmap créés depuis ces sauvegardes (`source_ref`).
 */
export default async function FormatSpatial({ params }: { params: Promise<{ format: string }> }) {
  const { format } = await params;
  if (!estCleStyle(format)) notFound();
  const s = await getSession();
  if (!s) redirect('/login');
  const style = styleCrea(format);
  const access = effectiveAccess(s);
  if (!canAccess(access, Veille)) return <AccesFerme titre={style.nom} sousNav={SOUS_NAV_VEILLE} actif="/veille/formats" raison={denyReason(access, Veille) === 'plan' ? 'plan' : 'role'} />;

  const marque = await getActiveBrand(s.workspaceId);
  const [annonces, suivis, image] = await Promise.all([lireSauvegardes(s, marque), lireSuivis(s, marque), lireImageMarque(marque)]);
  const stats = statsParStyle(annonces)[format];
  const { tendances } = detecterTendances(observationsSauvegardes(sauvegardesPourTendances(annonces), suivis), Date.now());
  const tendance = tendances.find((t) => t.type === 'format' && t.groupe === format) ?? null;

  const duStyle = style.formatNormatif
    ? annonces.filter((a) => a.format.etat === 'classe' && a.format.id === style.formatNormatif).sort((a, b) => (b.daysRunning ?? -1) - (a.daysRunning ?? -1))
    : [];

  let tests = 0;
  if (db && duStyle.length) {
    const [r] = await db.select({ n: sql<number>`count(*)` }).from(schema.concepts)
      .where(and(eq(schema.concepts.workspaceId, s.workspaceId), inArray(sql<string>`${schema.concepts.sourceRef}->>'savedAdId'`, duStyle.map((a) => a.id))));
    tests = Number(r?.n ?? 0);
  }

  const exemples: ExempleFormat[] = duStyle.slice(0, EXEMPLES_MAX).map((a) => ({
    id: a.id,
    annonceur: pastilleAnnonceur(a.ad.advertiserName),
    pays: a.ad.mainCountry ?? null,
    vignette: a.ad.thumbnailUrl ?? null,
    longue: (a.daysRunning ?? 0) >= JOURS_LONGUE_DIFFUSION,
    diffusion: ligneDiffusion(a.ad.status, a.daysRunning),
    iterer: studioDepuisVeille(a.ad, { ref: a.id }),
  }));

  return (
    <PageFormat
      sousNav={SOUS_NAV_VEILLE}
      cle={format}
      image={image}
      marque={marque?.name ?? null}
      pastille={pastilleTendanceStyle(tendance)}
      tuiles={tuilesStyle(stats, tests)}
      nouveauProjet={lienNouveauProjet({ type: 'ads', angle: consigneStyle(format) })}
      meilleurExemple={exemples[0]?.iterer ?? null}
      exemples={exemples}
      formatClassement={style.formatNormatif ? formatCreatif(style.formatNormatif).libelle : null}
    />
  );
}
