'use client';

import { useRouter } from 'next/navigation';
import { PanneauPropositions } from '../PanneauPropositions';

/**
 * Le panneau des propositions (L4-A) monté dans la page projet (L4-B).
 *
 * Il vise TOUJOURS la version courante du projet, même quand la page montre
 * une version ancienne : une proposition s'applique à la courante ou rend un
 * conflit, jamais à l'historique. Une application crée une version · la page
 * se recharge pour l'afficher.
 */
export function PropositionsProjet({ projectId, versionCourante }: { projectId: string; versionCourante: { id: string; n: number } }) {
  const router = useRouter();
  return <PanneauPropositions projectId={projectId} versionCourante={versionCourante} onVersionChangee={() => router.refresh()} />;
}
