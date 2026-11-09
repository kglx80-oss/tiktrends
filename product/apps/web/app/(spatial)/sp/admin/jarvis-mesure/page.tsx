import { lireFiltreMesureJarvis, vueMesureJarvis } from '@tiktrends/core';
import { lireReponsesPourMesure } from '../../../../../lib/jarvis-mesure';
import { MesureJarvis } from '../../../../../spatial/vues/admin/MesureJarvis';
import { bandeauSeul, porteAdmin } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * « Jarvis · mesure de l'extraction » (lot 5 quater V5) · porte `porteAdmin`
 * (admin de l'espace ET fondateur) AVANT toute lecture. LECTURE SEULE · les
 * réponses déjà stockées de l'ESPACE de la session (au plus 500, les plus
 * récentes), la règle du noyau rejouée (`vueMesureJarvis`) · aucun modèle
 * appelé, aucune écriture, aucune dépense. `?cause=…&page=…` filtre et
 * pagine les exemples (dix par page, anonymisés, tirés des réponses de la
 * personne qui lit).
 */
export default async function MesureJarvisSpatial({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await porteAdmin();
  const filtre = lireFiltreMesureJarvis((await searchParams) ?? {});
  const [bandeau, lu] = await Promise.all([bandeauSeul(), lireReponsesPourMesure(s)]);
  if (!lu) return <MesureJarvis bandeau={bandeau} etat="indisponible" raison="La base de données est injoignable · aucune réponse à mesurer." />;
  return <MesureJarvis bandeau={bandeau} etat="pret" vue={vueMesureJarvis(lu.reponses, { ...filtre, noms: lu.noms })} />;
}
