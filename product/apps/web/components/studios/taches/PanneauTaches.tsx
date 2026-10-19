'use client';

import type { TachePresentee } from '../../../lib/studios/execution/commandes';
import { panneau, carte, titre, sousTitre, mini, texte, signal, pastille, rangee } from '../propositions/styles';

/**
 * Liste des tâches d'un projet (matrice V5 Étape 6, lignes 6.1/6.3/6.5) · rendu,
 * PRÉSENTATION seule. Les données viennent du serveur (`listerTachesProjet`,
 * lecture pure, portée de marque). Rien ici ne déclenche d'écriture, de débit
 * ni de rapprochement.
 *
 * Trois choses que l'écran dit honnêtement :
 *  · l'ÉTAT réel de chaque tâche (jamais un pourcentage fabriqué · le % n'est
 *    montré que quand il est réel) ;
 *  · une tâche INTERROMPUE (coût incertain) est signalée, et la RELANCE est
 *    dite BLOQUÉE jusqu'au rapprochement · aucun bouton de relance ;
 *  · un lien vers les créations quand la tâche a livré un fichier.
 */

const COULEUR_TON: Record<string, string> = {
  interrompu: 'var(--warn)', echec: 'var(--err)', termine: 'var(--ok)', attente: 'var(--accent-strong)',
};

const dateHeure = (iso: string) => new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

function CarteTache({ t, projectId }: { t: TachePresentee; projectId: string }) {
  const e = t.etat;
  return (
    <article style={{ ...carte, ...(e.interrompu ? { border: '1px solid var(--warn)' } : {}) }} data-tache={t.id} data-etat-job={e.etat} data-interrompu={e.interrompu ? 'oui' : 'non'}>
      <div style={rangee}>
        <span style={pastille(COULEUR_TON[e.ton] ?? 'var(--accent-strong)')} data-pastille-etat>{e.titre}</span>
        <span style={mini}>{t.libelleOperation} · lancée le {dateHeure(t.creeLe)}{t.finiLe ? ` · terminée le ${dateHeure(t.finiLe)}` : ''}</span>
      </div>

      {t.progression !== null
        ? <p style={mini} data-progression={t.progression}>Avancement · {t.progression} %.</p>
        : null}

      {e.interrompu ? (
        <div role="alert" style={signal('warn')} data-interruption={t.id}>
          <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Interrompue · coût incertain</p>
          <p style={texte}>{e.explication}</p>
          <p style={{ ...texte, fontWeight: 600, color: 'var(--ink)' }} data-relance="bloquee">Relance bloquée · aucun nouvel essai tant que le rapprochement n’a pas eu lieu.</p>
        </div>
      ) : (
        <p style={texte} data-message>{e.explication}</p>
      )}

      {t.aProduit && (
        <a href={`/studio/projets/${projectId}`} data-lien="creations"
          style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-strong)', textDecoration: 'none', minHeight: 44, display: 'inline-flex', alignItems: 'center', width: 'fit-content' }}>
          Voir les créations
        </a>
      )}
    </article>
  );
}

export function PanneauTaches({ taches, projectId }: { taches: TachePresentee[]; projectId: string }) {
  const interrompues = taches.filter((t) => t.etat.interrompu).length;
  return (
    <section style={panneau} data-zone="taches-projet" aria-label="Tâches du projet">
      <div style={{ display: 'grid', gap: 6 }}>
        <h2 style={titre}>Tâches</h2>
        <p style={sousTitre}>Les tâches de génération de ce projet et leur état réel · lecture seule, rien n’est relancé d’ici.</p>
      </div>

      {interrompues > 0 && (
        <div role="alert" style={signal('warn')} data-bandeau="interrompues">
          <span style={{ fontWeight: 600 }}>{interrompues === 1 ? 'Une tâche est interrompue' : `${interrompues} tâches sont interrompues`} · </span>
          le coût est en cours de rapprochement · la relance reste bloquée jusque-là.
        </div>
      )}

      {taches.length === 0
        ? <p style={texte} data-etat="sans-tache">Aucune tâche lancée pour ce projet.</p>
        : <div style={{ display: 'grid', gap: 12 }}>{taches.map((t) => <CarteTache key={t.id} t={t} projectId={projectId} />)}</div>}
    </section>
  );
}

export default PanneauTaches;
