import { Icon } from '../../../components/Icon';
import { cadrePage, colonneLecture, h1, surface } from '../../../components/ui';
import { TEXTE_REFUS_JARVIS } from '../../../lib/jarvis-acces';

/**
 * L'écran de refus de Jarvis · le motif EXISTANT des pages verrouillées
 * (Veille, Studio, Radar) · titre de la page, cadre `surface`, cadenas, raison
 * (offre ou rôle), et le lien d'abonnement pour le propriétaire seulement.
 *
 * Il ne reçoit AUCUNE donnée de marque ni de connaissance · seulement la raison
 * et le rôle. Rien de ce que Jarvis lit ne peut donc s'y afficher.
 */
export function RefusJarvis({ titre, why, owner }: { titre: string; why: 'role' | 'plan'; owner: boolean }) {
  return (
    <main style={cadrePage}><div style={colonneLecture('fil')}>
      <h1 style={h1}>{titre}</h1>
      <div style={{ marginTop: 20, padding: 28, ...surface, background: 'var(--surface)', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', color: 'var(--muted)' }}><Icon name="lock" size={30} /></div>
        <h2 style={{ margin: '10px 0 6px', fontSize: 18, color: 'var(--ink)' }}>
          {why === 'plan' ? "Fonctionnalité incluse dès l'abonnement Core" : 'Accès réservé'}
        </h2>
        <p style={{ color: 'var(--ink-2)', fontSize: 14, maxWidth: 460, margin: '0 auto' }}>
          {TEXTE_REFUS_JARVIS[why]}
        </p>
        {why === 'plan' && owner && (
          <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, marginTop: 16, padding: '0 18px', borderRadius: 999, background: 'var(--grad-accent)', color: 'var(--on-accent)', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>Gérer l'abonnement →</a>
        )}
      </div>
    </div></main>
  );
}
