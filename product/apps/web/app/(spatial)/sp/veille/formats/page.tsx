import { redirect } from 'next/navigation';
import { cartesStyles, compterFormats, detecterTendances, observationsSauvegardes, perimetreFormats, statsParStyle } from '@tiktrends/core';
import { getSession } from '../../../../../lib/auth';
import { FEATURES, canAccess, denyReason } from '../../../../../lib/rbac';
import { effectiveAccess } from '../../../../../lib/access';
import { getActiveBrand } from '../../../../../lib/brands';
import { TousLesFormats } from '../../../../../spatial/vues/formats/TousLesFormats';
import { AccesFerme } from '../../../../../spatial/vues/formats/AccesFerme';
import { SOUS_NAV_VEILLE } from '../../../../../spatial/vues/formats/sous-nav';
import { lireImageMarque, lireSauvegardes, lireSuivis, sauvegardesPourTendances } from './donnees';

export const dynamic = 'force-dynamic';

const Veille = FEATURES.find((f) => f.key === 'inspo')!;

/**
 * « Tous les formats » (Spatial) · mêmes gardes que `/veille/formats` (V5) ·
 * session, puis la fonctionnalité Veille (rôle et formule). Les chiffres de
 * chaque style viennent des sauvegardes CLASSÉES (noyau · `statsParStyle`),
 * la hausse de la règle des tendances (`detecterTendances`) · rien d'autre.
 */
export default async function FormatsSpatial() {
  const s = await getSession();
  if (!s) redirect('/login');
  const access = effectiveAccess(s);
  if (!canAccess(access, Veille)) return <AccesFerme titre="Tous les formats" sousNav={SOUS_NAV_VEILLE} actif="/veille/formats" raison={denyReason(access, Veille) === 'plan' ? 'plan' : 'role'} />;

  const marque = await getActiveBrand(s.workspaceId);
  const [annonces, suivis, image] = await Promise.all([lireSauvegardes(s, marque), lireSuivis(s, marque), lireImageMarque(marque)]);
  const stats = statsParStyle(annonces);
  const { tendances } = detecterTendances(observationsSauvegardes(sauvegardesPourTendances(annonces), suivis), Date.now());
  const compte = compterFormats(annonces);

  return (
    <TousLesFormats
      sousNav={SOUS_NAV_VEILLE}
      styles={cartesStyles(stats, tendances).map((c) => ({ cle: c.style.cle, stats: c.stats, hausse: c.hausse }))}
      image={image}
      marque={marque?.name ?? null}
      perimetre={perimetreFormats(compte, marque?.name ?? null)}
    />
  );
}
