import type { ErreurProposition } from '../../../lib/studios/propositions/types';
import { Icon } from '../../Icon';
import { boutonSecondaire, mini, signal, texte, rangee } from './styles';
import { vide } from '../../ui';

/**
 * États du panneau qui ne sont pas une liste (cahier §5) : chargement, vide,
 * erreur récupérable (avec identifiant support), accès refusé. Chaque message
 * dit ce qui se passe PUIS quoi faire.
 */

export function Chargement() {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={mini}>Chargement des propositions…</p>
      {[0, 1].map((i) => (
        <div key={i} aria-hidden="true" style={{ height: 96, borderRadius: 12, background: 'var(--paper)', opacity: 0.6 }} />
      ))}
    </div>
  );
}

export function Vide({ peutProposer }: { peutProposer: boolean }) {
  return (
    <div style={{ ...vide, padding: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>Aucune proposition pour ce projet</p>
      <p style={mini}>
        {peutProposer
          ? 'Demande une modification à Jarvis ou propose-la à la main · rien ne sera appliqué sans ton accord.'
          : 'Les propositions de l’équipe apparaîtront ici.'}
      </p>
    </div>
  );
}

export function AccesRefuse({ erreur }: { erreur: ErreurProposition }) {
  const titre = erreur.code === 'FORBIDDEN' ? 'Accès refusé' : erreur.code === 'AUTH_REQUIRED' ? 'Session expirée' : 'Projet introuvable';
  return (
    <div role="alert" style={signal('err')}>
      <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="lock" size={16} /> {titre}</p>
      <p style={{ ...texte, marginTop: 4 }}>{erreur.message}</p>
    </div>
  );
}

/** Erreur dont on peut se relever · le message, l'identifiant support, et le geste. */
export function ErreurRecuperable({ erreur, onReessayer }: { erreur: ErreurProposition; onReessayer?: () => void }) {
  return (
    <div role="alert" style={signal('err')}>
      <p style={{ ...texte, color: 'var(--ink)', fontWeight: 600 }}>{erreur.message}</p>
      {erreur.violations && erreur.violations.length > 0 && (
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)' }}>
          {erreur.violations.slice(0, 6).map((v, i) => <li key={i} style={{ overflowWrap: 'anywhere' }}><code style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{v.chemin}</code> · {v.raison}</li>)}
        </ul>
      )}
      <div style={{ ...rangee, marginTop: 8, justifyContent: 'space-between' }}>
        <p style={mini}>Identifiant support · <code style={{ fontFamily: 'var(--font-mono)' }}>{erreur.traceId}</code></p>
        {onReessayer && erreur.recoverable && <button type="button" style={boutonSecondaire} onClick={onReessayer}>Réessayer</button>}
      </div>
    </div>
  );
}

/** Erreur réseau (hors ligne, serveur injoignable) · rien n'a été modifié, la saisie reste. */
export const ERREUR_RESEAU = 'Connexion perdue · rien n’a été modifié. Vérifie ta connexion puis réessaie, ta saisie est conservée.';
