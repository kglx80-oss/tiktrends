import { redirect } from 'next/navigation';
import { redirectionAnalytics, type ParamsRequete } from '@tiktrends/core';

/**
 * `/analytics` · route historique, toujours valide (lot 19A).
 *
 * L'Analytics vit désormais DANS l'Accueil · `/dashboard?vue=analytics`, rendu
 * par le même composant et les mêmes calculs (`components/accueil/VueAnalytics`).
 * Cette route redirige côté serveur en PRÉSERVANT chaque paramètre de requête,
 * dans son ordre (`redirectionAnalytics`, noyau). Le fragment (`#…`) ne parvient
 * jamais au serveur · le navigateur le reporte sur la cible (RFC 9110 §10.2.2),
 * et les ancres de la vue (`#attribution`) y existent à l'identique.
 *
 * Mêmes gardes qu'avant · la session est exigée par la coquille (`(app)/layout`),
 * aucune garde de rôle n'existait ici et aucune n'est inventée.
 */
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<ParamsRequete> }) {
  redirect(redirectionAnalytics(await searchParams));
}
