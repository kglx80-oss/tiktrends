import { redirect } from 'next/navigation';
import { REFUS_GESTE_JARVIS, lireGesteEssaiJarvis, preparationCorrigerJarvis, type PreparationCorrigerJarvis } from '@tiktrends/core';
import { getSession } from '../../../../../../../lib/auth';
import { lireGesteEssaiPourProjet } from '../../../../../../../lib/jarvis-gestes';
import { lireTextesProjet } from '../../../../../../actions/studios/textes';
import { Textes } from '../../../../../../../spatial/vues/projet/Textes';
import { EtatProjet } from '../../../../../../../spatial/vues/projet/EtatProjet';
import { atelierDuProjet, raisonDuRefus } from '../donnees';

export const dynamic = 'force-dynamic';

/**
 * Atelier « Textes » · Spatial (`/studio/projets/[id]/textes`). Mêmes gardes et
 * même lecture que la page V5 · `lireTextesProjet` (garde studio, capacité
 * « textes », disponibilité de l'IA et plafond relus). Rien n'est écrit ni
 * appelé à la visite.
 *
 * Lot 5 quater (RJ G07) · `?geste=corriger&reponse=<uuid>&contexte=…&id=…` ·
 * « Corriger le texte » depuis une réponse de Jarvis · la réponse et la liste
 * fermée des variantes du contexte RELUES (`lireGesteEssaiPourProjet`), la
 * règle du noyau rejouée (`preparationCorrigerJarvis`), la variante dans CE
 * projet · la consigne s'affiche, le texte que Jarvis cite va dans le champ
 * « Écrire à la main » · rien n'est écrit, généré ni enregistré sans le clic,
 * l'écriture par l'IA garde son prix annoncé et sa barrière. Refusé, la phrase
 * neutre, rien de pré-rempli.
 */
export default async function TextesSpatial({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await getSession();
  if (!s) redirect('/login');
  const { id } = await params;
  const r = await lireTextesProjet({ projectId: id });
  if (!r.ok) return <EtatProjet raison={raisonDuRefus(r, s, 'Les projets du Studio')} projectId={id} titre="Textes" />;
  const geste = lireGesteEssaiJarvis((await searchParams) ?? {}, 'corriger');
  let jarvis: PreparationCorrigerJarvis | null = null;
  if (geste.etat !== 'absente') {
    const lu = geste.etat === 'ok' ? await lireGesteEssaiPourProjet(s, geste) : null;
    jarvis = lu ? preparationCorrigerJarvis(lu.texte, { projectId: r.vue.projet.id, variantes: lu.variantes, exclus: lu.exclus })
      : { varianteId: null, type: null, consigne: null, proposition: null, note: REFUS_GESTE_JARVIS };
  }
  return <Textes vue={r.vue} atelier={await atelierDuProjet(s, r.vue.projet.id)} {...(jarvis ? { jarvis } : {})} />;
}
