'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useSpatial } from '../../coquille/contexte';
import { Ic } from '../../communs';

/**
 * « Rendre active » · la marque active de l'espace, par l'action EXISTANTE
 * (`setActiveBrand`, cookie de portée vérifiée côté serveur), puis l'écran se
 * relit. Le toast ne dit « c'est fait » qu'au retour sans erreur.
 */
export function RendreActive({ id, nom, choisir }: { id: string; nom: string; choisir: (id: string) => Promise<void> }) {
  const { toast } = useSpatial();
  const router = useRouter();
  const [encours, demarrer] = useTransition();
  return (
    <button type="button" className="btn sm pri" disabled={encours} aria-label={`Rendre « ${nom} » active`}
      onClick={() => demarrer(async () => {
        try { await choisir(id); toast(`${nom} est la marque active`); router.refresh(); } catch { toast('La marque n’a pas pu être changée. Réessaie.'); }
      })}>
      <Ic n="check" />{encours ? 'Changement…' : 'Rendre active'}
    </button>
  );
}
