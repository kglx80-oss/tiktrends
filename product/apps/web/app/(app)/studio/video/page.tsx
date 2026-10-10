import { redirect } from 'next/navigation';
import { destinationAncienneAdresse } from '@tiktrends/core';

/**
 * Ancienne adresse de création (studio retiré le 10/10) · elle ne fait plus
 * que rediriger vers les projets Studios, contexte repris dans la préparation
 * d'un projet (`destinationAncienneAdresse`, noyau). Rien n'est créé ici.
 */
export default async function AncienneAdresse({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  redirect(destinationAncienneAdresse('/studio/video', await searchParams));
}
