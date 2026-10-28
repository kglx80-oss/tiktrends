import { redirect } from 'next/navigation';
import { CHEMIN_PROJETS } from '@tiktrends/core';

/** Ancienne entrée « Studio IA » · les Studios sont désormais la liste des projets. */
export default function AncienHub() {
  redirect(CHEMIN_PROJETS);
}
