import { LEGAL } from '../../../lib/legal';
import { LegalDoc, LSection } from '../../../components/LegalDoc';

export const dynamic = 'force-dynamic';

export default function Confidentialite() {
  return (
    <LegalDoc title="Politique de confidentialité" subtitle={`Dernière mise à jour : ${LEGAL.updatedAt} · conforme au RGPD`}>
      <LSection h="1. Responsable du traitement">
        <p style={{ margin: 0 }}>{LEGAL.legalName}, éditeur de TikTrends, est responsable du traitement des données personnelles collectées sur {LEGAL.siteUrl}. Contact : {LEGAL.dpoEmail}.</p>
      </LSection>
      <LSection h="2. Données collectées">
        <p style={{ margin: 0 }}>Nous collectons : les données de compte (nom, e-mail, mot de passe chiffré), les données d'usage (marques, produits, contenus générés, journaux de crédits), les données de facturation gérées par notre prestataire de paiement, et des données techniques (connexion, sécurité).</p>
      </LSection>
      <LSection h="3. Finalités et bases légales">
        <p style={{ margin: 0 }}>Les données sont traitées pour : fournir le service (exécution du contrat), gérer la facturation (obligation légale), assurer la sécurité et améliorer le produit (intérêt légitime), et, avec consentement, les communications marketing. Aucune décision entièrement automatisée produisant des effets juridiques n'est prise sur les personnes.</p>
      </LSection>
      <LSection h="4. Sous-traitants et IA">
        <p style={{ margin: 0 }}>Pour fonctionner, TikTrends recourt à des prestataires : hébergeur ({LEGAL.host.name}), fournisseurs de modèles d'IA (génération d'images/vidéos et de texte) et bibliothèques de veille publicitaire. Les contenus que tu soumets peuvent être transmis à ces fournisseurs pour réaliser la génération demandée. Nous sélectionnons des prestataires offrant des garanties appropriées.</p>
      </LSection>
      <LSection h="5. Durée de conservation">
        <p style={{ margin: 0 }}>Les données de compte sont conservées tant que le compte est actif, puis supprimées ou anonymisées dans un délai raisonnable après clôture, sauf obligations légales (facturation : 10 ans).</p>
      </LSection>
      <LSection h="6. Tes droits">
        <p style={{ margin: 0 }}>Conformément au RGPD, tu disposes des droits d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité. Tu peux les exercer à {LEGAL.dpoEmail}. Tu peux aussi introduire une réclamation auprès de la CNIL (www.cnil.fr).</p>
      </LSection>
      <LSection h="7. Sécurité">
        <p style={{ margin: 0 }}>Nous mettons en œuvre des mesures techniques et organisationnelles (chiffrement des mots de passe, contrôle d'accès, hébergement en Union européenne) pour protéger les données.</p>
      </LSection>
      <LSection h="8. Transferts hors UE">
        <p style={{ margin: 0 }}>Certains prestataires d'IA peuvent être situés hors de l'Union européenne ; les transferts éventuels sont encadrés par des garanties appropriées (clauses contractuelles types).</p>
      </LSection>
    </LegalDoc>
  );
}
