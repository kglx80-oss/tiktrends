import type { FinPrevueAccueil } from '@tiktrends/core';
import { Ic, Lien } from '../../communs';

/**
 * Fiche d'un lot « Mesures à importer » · le geste « Importer les mesures du
 * lot #n » (`importFicheLot`, noyau · la même règle que l'Accueil) · ouvert, il
 * mène à l'import EXISTANT ouvert sur CE lot (`/adsmap/import?lot=`) · fermé
 * (rôle, formule), le bouton fermé et sa raison écrite à côté · sans source, la
 * phrase le dit, aucun bouton. Arrive par `actions`, sous la fiche, avec les
 * autres gestes réels · rien n'est écrit ici.
 */
export function ImporterMesuresLot({ lotId, f, fenetreIncomplete }: {
  lotId: string;
  f: FinPrevueAccueil;
  /**
   * La fiche d'un lot qu'on ARBITRE, mesures arrêtées (`reserveFenetreIncomplete`) · le même geste, sous
   * son propre titre (le lot n'est pas « Mesures à importer ») · `data-fenetre-incomplete` au lieu de `data-import-lot`.
   */
  fenetreIncomplete?: { titre: string };
}) {
  const g = f.geste;
  if (!f.texte && !g) return null;
  const marque = fenetreIncomplete ? { 'data-fenetre-incomplete': lotId } : { 'data-import-lot': lotId };
  return (
    <section className="tile sec" aria-label={fenetreIncomplete ? fenetreIncomplete.titre : 'Importer les mesures du lot'} {...marque}>
      <h2>{fenetreIncomplete ? fenetreIncomplete.titre : 'Mesures à importer'}</h2>
      {f.texte && <p className="muted" data-diagnostic="" style={{ fontSize: '12.5px', marginTop: 4 }}>{f.texte}</p>}
      {g?.etat === 'ouvert' && (
        <div className="foot2" style={{ marginTop: 12 }}>
          <Lien className="btn sm pri" href={g.href} data-geste="importer-lot" style={{ minHeight: 44 }}><Ic n="down" />{g.libelle}</Lien>
        </div>
      )}
      {g?.etat === 'ferme' && (
        <div className="foot2" style={{ marginTop: 12 }}>
          <button className="btn sm" type="button" disabled data-geste-ferme="importer-lot" aria-describedby={`importer-ferme-${lotId}`} style={{ minHeight: 44 }}><Ic n="down" />{g.libelle}</button>
          <small id={`importer-ferme-${lotId}`} data-raison="">{g.raison}</small>
        </div>
      )}
    </section>
  );
}
