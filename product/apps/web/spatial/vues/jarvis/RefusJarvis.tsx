import { EnTete, Ic, Lien, Vue } from '../../communs';

/**
 * Jarvis refusé (offre ou rôle) · la raison RÉELLE (`TEXTE_REFUS_JARVIS`), le
 * lien d'abonnement pour le propriétaire seulement. Ne reçoit aucune donnée de
 * marque ni de connaissance · rien de ce que Jarvis lit ne peut s'y afficher.
 * Motif d'état vide de la maquette (`.dempty`).
 */
export function RefusJarvis({ raison, plan, proprietaire }: { raison: string; plan: boolean; proprietaire: boolean }) {
  return (
    <Vue>
      <EnTete titre="Jarvis" sous="S’appuie uniquement sur ta fiche marque, ta Veille et tes résultats" outils="credits" />
      <section className="tile">
        <div className="dempty">
          <span className="ico"><Ic n="lock" s={false} /></span>
          <h3>{plan ? 'Jarvis est inclus dès l’offre Core' : 'Accès réservé'}</h3>
          <p className="muted">{raison}</p>
          {plan && proprietaire && <Lien className="btn pri sm" href="/billing">Gérer l’abonnement</Lien>}
        </div>
      </section>
    </Vue>
  );
}
