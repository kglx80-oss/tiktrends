'use client';

import { usePathname } from 'next/navigation';
import { Vue } from '../../../spatial/communs/base';

/**
 * Le filet de l'interface Spatial · un écran qui échoue au rendu n'emporte ni
 * la coquille ni le travail en cours. On le dit, on propose de réessayer, et
 * d'ouvrir le MÊME écran dans l'ancienne interface (`?ui=v5`, réversible par
 * `?ui=spatial`), qui reste servie tant que la bascule n'est pas finie.
 */
export default function ErreurSpatial({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const chemin = usePathname() || '/dashboard';
  return (
    <Vue>
      <section className="tile" role="alert" style={{ maxWidth: 640, margin: '48px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2>Cet écran n’a pas pu s’afficher</h2>
        <p>Rien n’a été perdu. Réessaie, ou ouvre le même écran dans l’ancienne interface en attendant la correction.{error.digest ? ` Référence : ${error.digest}.` : ''}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn pri" onClick={() => reset()}>Réessayer</button>
          <a className="btn" href={`${chemin}?ui=v5`}>Ouvrir dans l’ancienne interface</a>
        </div>
      </section>
    </Vue>
  );
}
