import { EnTete, Ic, Lien, Vue } from '../../communs';
import { AnnonceRetour, SupprimerConfirme } from './interactifs';
import { RendreActive } from './liste-client';

/**
 * « Marques » · la liste des marques de l'espace (écran sans fragment de
 * maquette, vague 3), composée avec les cartes de marque de la maquette
 * (`.brands` · `.bcard` · `.blogo`). Tout est lu · le nombre de comptes pub,
 * scénarios, personas et concurrents vient des tables, la marque active du
 * cookie de portée. Les gestes passent par les actions EXISTANTES · créer
 * (`/brands/new`), rendre active (`setActiveBrand`), ouvrir la fiche, supprimer
 * (`deleteBrandAction`, confirmée, refusée par le serveur quand l'historique
 * Studios l'interdit · le motif est dit au retour).
 */

export interface MarqueListe {
  id: string; nom: string; initiale: string; ligne: string; domaine: string | null; active: boolean;
  comptes: { pub: number; scenarios: number; personas: number; concurrents: number };
}

export interface PropsListeMarques {
  marques: MarqueListe[];
  retours: Record<string, string>;
  choisir: (id: string) => Promise<void>;
  supprimer: ((fd: FormData) => Promise<void>) | null;
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

export function ListeMarques(p: PropsListeMarques) {
  return (
    <Vue>
      <EnTete titre="Marques" sous="Chaque marque a son propre espace · la marque active filtre sauvegardes, suivis et analyses" outils="credits" />
      <AnnonceRetour messages={p.retours} />
      <section className="sec">
        <div className="sech">
          <h2>Tes marques ({p.marques.length})</h2>
          <Lien className="btn pri sm" href="/brands/new" style={{ marginLeft: 'auto' }}><Ic n="plus" />Nouvelle marque</Lien>
        </div>
        {p.marques.length === 0 ? (
          <div className="tile"><div className="dempty">
            <span className="ico"><Ic n="tag" s={false} /></span>
            <h3>Aucune marque pour l’instant</h3>
            <p className="muted">Tout le produit travaille marque par marque · les Résultats, la mémoire de Jarvis, les lots, les projets. C’est le premier objet à créer.</p>
            <Lien className="btn pri sm" href="/brands/new"><Ic n="plus" />Créer la première marque</Lien>
          </div></div>
        ) : (
          <div className="brands">
            {p.marques.map((m) => (
              <div className="bcard" key={m.id} data-marque={m.id} aria-current={m.active ? 'true' : undefined}>
                <span className="blogo">{m.initiale}</span>
                <strong>{m.nom}</strong>
                {m.active && <span className="pill g" style={{ marginLeft: 0 }}>Active</span>}
                <small className="faint">
                  {m.domaine ? <a href={`https://${m.domaine}`} target="_blank" rel="noopener noreferrer nofollow">{m.ligne}</a> : m.ligne}
                </small>
                <small className="muted">
                  {[pluriel(m.comptes.pub, 'compte pub', 'comptes pub'), pluriel(m.comptes.scenarios, 'scénario', 'scénarios'), pluriel(m.comptes.personas, 'persona', 'personas'), pluriel(m.comptes.concurrents, 'concurrent', 'concurrents')].join(' · ')}
                </small>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
                  {!m.active && <RendreActive id={m.id} nom={m.nom} choisir={p.choisir} />}
                  <Lien className="btn sm" href={`/brands/${m.id}`}>Ouvrir la fiche</Lien>
                  <SupprimerConfirme action={p.supprimer} champs={{ id: m.id }} className="btn sm" libelle={`Supprimer la marque ${m.nom}`}
                    confirmation={`Supprimer « ${m.nom} » et TOUT son contenu (personas, produits, créas) ? Cette action est irréversible.`}><Ic n="x" />Supprimer</SupprimerConfirme>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </Vue>
  );
}
