'use client';

import { Vue } from '../../../spatial/communs/base';

/**
 * Le filet de l'interface Spatial · un écran qui échoue au rendu n'emporte ni
 * la coquille ni le travail en cours. On le dit et on propose de réessayer ou
 * de revenir à l'accueil. L'ancienne interface est retirée · aucun lien vers
 * elle (`?ui=v5` n'existe plus).
 */
export default function ErreurSpatial({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <Vue>
      <section className="tile" role="alert" style={{ maxWidth: 640, margin: '48px auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2>Cet écran n’a pas pu s’afficher</h2>
        <p>Rien n’a été perdu. Réessaie, ou reviens à l’accueil en attendant la correction.{error.digest ? ` Référence : ${error.digest}.` : ''}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn pri" onClick={() => reset()}>Réessayer</button>
          <a className="btn" href="/dashboard">Revenir à l’accueil</a>
        </div>
      </section>
    </Vue>
  );
}
