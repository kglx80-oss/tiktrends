import { redirect } from 'next/navigation';
import { and, eq, gte, sql } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import {
  FENETRE_TENDANCE_JOURS, LIBELLE_TYPE_TENDANCE, TYPES_TENDANCE, carteTendance, detecterTendances, etatRadarTendances, kpisTendances,
  lienNouveauProjet, observationsMarche, observationsSauvegardes, silenceTendances, sourcesTendances, type CreaMarchePourTendance,
} from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../../lib/rbac';
import { effectiveAccess } from '../../../../../lib/access';
import { getActiveBrand } from '../../../../../lib/brands';
import { radarState } from '../../../../../lib/radar';
import { Tendances } from '../../../../../spatial/vues/formats/Tendances';
import { AccesFerme } from '../../../../../spatial/vues/formats/AccesFerme';
import { SOUS_NAV_VEILLE } from '../../../../../spatial/vues/formats/sous-nav';
import { lireSauvegardes, lireSuivis, sauvegardesPourTendances } from '../formats/donnees';

export const dynamic = 'force-dynamic';

const Veille = FEATURES.find((f) => f.key === 'inspo')!;
const Adsmap = FEATURES.find((f) => f.key === 'adsmap')!;
const JOUR = 86_400_000;

/**
 * « Tendances » (Spatial) · adresse NOUVELLE, sans écran V5. Gardes de la
 * Veille. Lit ce qui est déjà en base, sans rien déclencher ni dépenser ·
 * les sauvegardes classées (formats) et les créas concurrentes décrites par le
 * radar et le suivi de marques (`market_creatives` · accroche, composition),
 * sur trois fenêtres de 30 jours. La règle vit au noyau (`detecterTendances`).
 */
export default async function TendancesSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  if (!canAccess(access, Veille)) return <AccesFerme titre="Tendances" sousNav={SOUS_NAV_VEILLE} actif="/veille/tendances" raison={denyReason(access, Veille) === 'plan' ? 'plan' : 'role'} />;

  const maintenant = Date.now();
  const depuis = new Date(maintenant - 3 * FENETRE_TENDANCE_JOURS * JOUR);
  const marque = await getActiveBrand(s.workspaceId);
  const [annonces, suivis, marche, radar] = await Promise.all([
    lireSauvegardes(s, marque),
    lireSuivis(s, marque),
    db
      ? db.select({
        creeLe: schema.marketCreatives.createdAt, hookType: schema.marketCreatives.hookType,
        composition: sql<string | null>`${schema.marketCreatives.analysis}->>'composition'`,
        annonceur: schema.marketCreatives.advertiser, provenance: schema.marketCreatives.provenance,
        jours: schema.marketCreatives.daysRunning, plateforme: schema.marketCreatives.platform,
      }).from(schema.marketCreatives).where(and(
        eq(schema.marketCreatives.workspaceId, s.workspaceId),
        ...(marque ? [eq(schema.marketCreatives.brandId, marque.id)] : []),
        gte(schema.marketCreatives.createdAt, depuis),
      )).limit(5000)
      : Promise.resolve([]),
    marque ? radarState(s.workspaceId, marque.id) : Promise.resolve(null),
  ]);

  const sauvegardes = sauvegardesPourTendances(annonces);
  const lignesMarche: CreaMarchePourTendance[] = marche.map((r) => ({ ...r, creeLe: (r.creeLe as Date).toISOString() }));
  const resultat = detecterTendances([...observationsSauvegardes(sauvegardes, suivis), ...observationsMarche(lignesMarche)], maintenant);

  // Le volume réel par source sur les 90 jours lus (sauvegardes classées + créas décrites).
  const parPlateforme: Record<string, number> = {};
  for (const a of sauvegardes) if (a.classee && Date.parse(a.sauvegardeLe) >= depuis.getTime()) parPlateforme[a.plateforme] = (parPlateforme[a.plateforme] ?? 0) + 1;
  for (const r of marche) parPlateforme[r.plateforme] = (parPlateforme[r.plateforme] ?? 0) + 1;

  const radarOuvert = !!marque && canAccess(access, Adsmap);
  const lienProjet = (consigne: string) => lienNouveauProjet({ type: 'ads', angle: consigne });

  return (
    <Tendances
      sousNav={SOUS_NAV_VEILLE}
      capteur={{
        actif: !!radar?.armed,
        etat: etatRadarTendances(radar),
        raisonInterrupteur: 'Le radar dépense à chaque passage · il s’arme dans son écran, coût annoncé avant',
      }}
      sources={sourcesTendances(parPlateforme)}
      radar={radarOuvert ? '/adsmap/radar' : null}
      surveille={{ libelle: 'Concurrents suivis', href: '/saved?onglet=marques' }}
      kpis={kpisTendances(resultat)}
      tendances={resultat.tendances.map((t) => carteTendance(t, { lienProjet, radarOuvert }))}
      types={TYPES_TENDANCE.map((t) => ({ cle: LIBELLE_TYPE_TENDANCE[t], libelle: LIBELLE_TYPE_TENDANCE[t] }))}
      silence={silenceTendances(resultat)}
      alertes={[{ libelle: 'Nouvelles pubs chez une marque suivie', actif: suivis.size > 0, raison: suivis.size > 0 ? 'Toujours active · aucun réglage par alerte pour l’instant' : 'Suis un concurrent pour la recevoir' }]}
      canaux={[{ libelle: 'Dans l’app', actif: true }]}
    />
  );
}
