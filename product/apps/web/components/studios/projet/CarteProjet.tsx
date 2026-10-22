import { dateCourteUtc, rangEtapeProjet, ORDRE_ETAPES_PROJET, type EtapeProjet } from '@tiktrends/core';
import type { CarteProjet as Carte } from '../../../lib/studios/sources/projet';
import { Icon } from '../../Icon';
import styles from './StudiosListe.module.css';

/**
 * Carte de reprise d'un projet (cahier 01 §4.1) · marque, type, étape, ce qui
 * manque, date. Le statut est porté par un MOT (jamais la couleur seule). Un
 * titre long est coupé à l'écran et complet au survol et au lecteur d'écran.
 *
 * ── Alignement V5 (image 5.webp) ──────────────────────────────────────────────
 *
 * Bandeau de type + pastille de version en tête, barre de progression des
 * étapes sous le titre · toutes des données RÉELLES (`libelleType`, `versionN`,
 * `etape`). Pas de vignette d'image : un projet n'a pas d'aperçu généré à ce
 * stade, on montre le pictogramme NEUTRE de son type, jamais une image inventée.
 */

/** Le rôle de tokens.css qui teinte chaque étape · la pastille en porte le
 *  point plein, la bordure (ancien suffixe `66` · 102/255) et le fond (`1a` · 26/255). */
export const ROLE_ETAPE: Readonly<Record<EtapeProjet, 'warn' | 'ok' | 'info'>> = {
  brief_a_completer: 'warn',
  brief_pret: 'ok',
  production: 'info',
};

/** Le pictogramme NEUTRE du type de projet · jamais une image générée. */
const ICONE_TYPE: Readonly<Record<string, string>> = { image: 'image', video: 'film', ads: 'sparkles', text: 'file', campaign: 'layers' };

export function PastilleEtape({ etape, libelle }: { etape: EtapeProjet; libelle: string }) {
  const r = ROLE_ETAPE[etape];
  return (
    <span data-etape={etape} className={styles.status}>
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: 999, background: `var(--${r})` }} />{libelle}
    </span>
  );
}

/** La barre d'étapes · trois segments, autant remplis que le rang de l'étape (la couleur ne dit jamais seule, le mot l'accompagne via la pastille). */
export function BarreEtapes({ etape }: { etape: EtapeProjet }) {
  const rang = rangEtapeProjet(etape);
  return (
    <span aria-hidden data-barre-etape={etape} style={{ display: 'inline-flex', gap: 4, flexShrink: 0 }}>
      {ORDRE_ETAPES_PROJET.map((e, i) => (
        <span key={e} style={{ height: 4, width: 22, borderRadius: 2, background: i < rang ? 'var(--accent)' : 'var(--line-2)' }} />
      ))}
    </span>
  );
}

export function CarteProjet({ carte, onSupprimer }: { carte: Carte; onSupprimer?: () => void }) {
  const bloquants = carte.manques.filter((m) => m.bloquant);
  const affiches = (bloquants.length ? bloquants : carte.manques).slice(0, 3);
  return (
    <div className={styles.cardWrap}>
    <a href={`/studio/projets/${carte.id}`} data-projet={carte.id} aria-label={`${carte.title} · ${carte.marque} · ${carte.libelleEtape}`}
      className={styles.card}>
      <div className={styles.media}>
        {carte.apercu ? <img src={carte.apercu} alt="Référence produit" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span className={styles.placeholder} aria-label="Aperçu non disponible"><Icon name={ICONE_TYPE[carte.kind] ?? 'folder'} size={32} /><small>Aucun aperçu pour le moment</small></span>}
        <span className={styles.badges}><span>{carte.libelleType}</span>{carte.versionN != null && <span data-version>V{carte.versionN}</span>}</span>
      </div>
      <div className={styles.body}>
        <div className={styles.meta}><PastilleEtape etape={carte.etape} libelle={carte.libelleEtape} /><small>{dateCourteUtc(carte.updatedAt)}</small></div>
        <h2 title={carte.title} className={styles.title}>{carte.title}</h2>
        <BarreEtapes etape={carte.etape} />
        <small className={styles.brand} title={carte.marque}>{carte.marque || 'Marque'} · {carte.sources} source{carte.sources > 1 ? 's' : ''}</small>
        {affiches.length > 0 && <small className={styles.missing}>Ce qui manque · {affiches.map((m) => m.libelle).join(' · ')}{carte.manques.length > affiches.length && ` · et ${carte.manques.length - affiches.length} autre(s)`}</small>}
      </div>
    </a>
    {onSupprimer && <button type="button" className={styles.remove} aria-label={`Supprimer le projet ${carte.title}`} title="Supprimer le projet" onClick={onSupprimer}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" /></svg></button>}
    </div>
  );
}
