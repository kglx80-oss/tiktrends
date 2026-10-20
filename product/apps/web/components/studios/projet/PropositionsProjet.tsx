'use client';

import { useRouter } from 'next/navigation';
import { CIBLE_TACTILE_MIN } from '@tiktrends/core';
import { PanneauPropositions } from '../PanneauPropositions';
import { useEspaceCreation } from '../../EspaceCreation';

/**
 * Le panneau des propositions (L4-A) monté dans la page projet (L4-B).
 *
 * Il vise TOUJOURS la version courante du projet, même quand la page montre
 * une version ancienne : une proposition s'applique à la courante ou rend un
 * conflit, jamais à l'historique. Une application crée une version · la page
 * se recharge pour l'afficher.
 *
 * UX V2 · lot 2 · Jarvis MASQUABLE (barre de projet, choix mémorisé). Masqué,
 * le panneau reste MONTÉ (caché) · une demande en cours de rédaction n'est pas
 * perdue · et une ligne dit qu'il est masqué, avec le geste pour le rouvrir.
 */
export function PropositionsProjet({ projectId, versionCourante, rechargerSignal }: { projectId: string; versionCourante: { id: string; n: number }; rechargerSignal?: number }) {
  const router = useRouter();
  const { jarvisMasque, basculerJarvis } = useEspaceCreation();
  return (
    <>
      {jarvisMasque && (
        <p data-etat="jarvis-masque" style={{ margin: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--ink-2)' }}>
          Le panneau Jarvis est masqué.
          <button type="button" onClick={basculerJarvis} style={{ minHeight: CIBLE_TACTILE_MIN, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 13, fontWeight: 650, cursor: 'pointer' }}>Afficher Jarvis</button>
        </p>
      )}
      <div hidden={jarvisMasque || undefined} data-jarvis={jarvisMasque ? 'masque' : 'visible'}>
        <PanneauPropositions projectId={projectId} versionCourante={versionCourante} rechargerSignal={rechargerSignal} onVersionChangee={() => router.refresh()} />
      </div>
    </>
  );
}
