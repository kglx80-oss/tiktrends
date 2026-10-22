'use client';

import { useMemo, useState } from 'react';
import { CIBLE_TACTILE_MIN, compteursFiltreProjets, filtrerProjets, type CleFiltreProjet, type EtatNouveauProjet } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../../../lib/studios/sources/projet';
import { CarteProjet } from './CarteProjet';
import { NouveauProjet } from './NouveauProjet';
import { Icon } from '../../Icon';
import { surface } from '../../ui';
import styles from './StudiosListe.module.css';

/**
 * La zone liste des Studios · recherche + rangée de filtres + grille (alignement
 * V5, image 5.webp). Tout est CLIENT et PUR : on ne filtre que des cartes déjà
 * chargées sous leur droit (`listerCartesPour`), aucune requête n'est relancée,
 * rien n'est écrit. La règle (compteurs, filtrage) vit au noyau
 * (`compteursFiltreProjets`, `filtrerProjets`), ce composant ne fait que montrer.
 *
 * Les filtres portent sur l'ÉTAPE réelle du projet · le prototype montre des
 * statuts (En revue, Brouillons, Archivés) qui n'existent pas dans notre modèle
 * (`studio_projects.status` = active / archived, seuls les actifs sont listés).
 * On copie la STRUCTURE de la rangée, pas ces libellés fictifs.
 */

export function ListeProjets({ cartes, nouveau }: { cartes: Carte[]; nouveau: EtatNouveauProjet }) {
  const [cle, setCle] = useState<CleFiltreProjet>('tous');
  const [recherche, setRecherche] = useState('');

  const options = useMemo(() => compteursFiltreProjets(cartes), [cartes]);
  const filtrees = useMemo(() => filtrerProjets(cartes, { cle, recherche }), [cartes, cle, recherche]);

  return (
    <div>
      <div className={styles.bar}>
        <div role="group" aria-label="Filtrer les projets par étape" className={styles.filters}>
          {options.map((o) => {
            const actif = o.cle === cle;
            return (
              <button key={o.cle} type="button" data-filtre={o.cle} aria-pressed={actif}
                onClick={() => setCle(o.cle)}
                className={styles.filter}>
                {o.libelle}
                <span data-compte className={styles.count}>{o.n}</span>
              </button>
            );
          })}
        </div>
        <label className={styles.search}>
          <span aria-hidden style={{ position: 'absolute', left: 12, display: 'inline-flex', color: 'var(--muted)', pointerEvents: 'none' }}><Icon name="search" size={16} /></span>
          <input type="search" value={recherche} onChange={(e) => setRecherche(e.target.value)}
            aria-label="Rechercher un projet" placeholder="Rechercher un projet…"
            data-recherche-projet className={styles.searchInput} />
        </label>
      </div>

      {filtrees.length === 0 ? (
        <section data-etat="vide-filtre" style={{ ...surface, background: 'var(--surface)', padding: 24, display: 'grid', gap: 8, maxWidth: 720 }}>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--ink)' }}>Aucun projet ne correspond.</p>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--ink-2)' }}>
            <button type="button" onClick={() => { setCle('tous'); setRecherche(''); }} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent-strong)', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: CIBLE_TACTILE_MIN }}>Réinitialiser les filtres</button>
          </p>
        </section>
      ) : (
        <div data-etat="rempli" className={styles.grid}>
          {filtrees.map((c) => <CarteProjet key={c.id} carte={c} />)}
          <NouveauProjet etat={nouveau} variante="carte" />
        </div>
      )}
    </div>
  );
}
