import { LEGAL } from '../../../lib/legal';
import { LegalDoc, LSection } from '../../../components/LegalDoc';
import { nomsForfaitsV2, tarifsV2Actifs } from '@tiktrends/core';

export const dynamic = 'force-dynamic';

export default function CGV() {
  // Offre V2 (sous `TARIFS_V2`) · les formules et la règle des prix TTC suivent le noyau ; sans l'interrupteur, le texte d'aujourd'hui.
  const v2 = tarifsV2Actifs(process.env);
  return (
    <LegalDoc title="Conditions générales de vente" subtitle={`Dernière mise à jour : ${LEGAL.updatedAt}`}>
      <LSection h="1. Champ d'application">
        <p style={{ margin: 0 }}>Les présentes CGV encadrent la souscription aux abonnements et l'achat de crédits sur TikTrends, éditée par {LEGAL.legalName}. Elles s'appliquent à toute commande passée sur {LEGAL.siteUrl}.</p>
      </LSection>
      <LSection h="2. Offres et abonnements">
        {v2 ? (
          <p style={{ margin: 0 }}>TikTrends propose des formules d'abonnement ({nomsForfaitsV2()}) donnant droit à une allocation mensuelle de <b>crédits</b>. Les crédits sont consommés par les actions IA (génération d'images/vidéos, analyses, etc.) selon un barème indiqué dans l'application. Les caractéristiques et prix de chaque formule sont présentés avant la commande.</p>
        ) : (
          <p style={{ margin: 0 }}>TikTrends propose des formules d'abonnement (Starter, Core, Plus, Business) donnant droit à une allocation mensuelle de <b>crédits</b>. Les crédits sont consommés par les actions IA (génération d'images/vidéos, analyses, etc.) selon un barème indiqué dans l'application. Les caractéristiques et prix de chaque formule sont présentés avant la commande.</p>
        )}
      </LSection>
      <LSection h="3. Prix">
        {v2 ? (
          <p style={{ margin: 0 }}>Les prix des formules {nomsForfaitsV2()} et de leurs recharges sont indiqués en euros toutes taxes comprises (TTC) ; la TVA applicable est comprise dans le prix affiché. Les autres prix sont indiqués en euros hors taxes (HT) ; la TVA applicable (20 %) est ajoutée le cas échéant. L'Éditeur peut modifier ses tarifs ; les nouveaux tarifs s'appliquent au cycle de facturation suivant.</p>
        ) : (
          <p style={{ margin: 0 }}>Les prix sont indiqués en euros hors taxes (HT) ; la TVA applicable (20 %) est ajoutée le cas échéant. L'Éditeur peut modifier ses tarifs ; les nouveaux tarifs s'appliquent au cycle de facturation suivant.</p>
        )}
      </LSection>
      <LSection h="4. Facturation et paiement">
        {v2 ? (
          <p style={{ margin: 0 }}>Les abonnements sont facturés d'avance, par cycle mensuel ou annuel selon la facturation choisie, par prélèvement via le prestataire de paiement. En facturation annuelle, l'allocation de crédits est versée chaque mois. À défaut de paiement, l'accès aux fonctionnalités payantes peut être suspendu.</p>
        ) : (
          <p style={{ margin: 0 }}>Les abonnements sont facturés d'avance, par cycle mensuel, par prélèvement via le prestataire de paiement. À défaut de paiement, l'accès aux fonctionnalités payantes peut être suspendu.</p>
        )}
      </LSection>
      <LSection h="5. Crédits, report et période d'essai">
        <p style={{ margin: 0 }}>Les crédits sont valables pendant le cycle. Un report partiel des crédits non utilisés peut être appliqué selon les règles indiquées dans l'application. Des crédits de test peuvent être accordés pour une période limitée (offre d'essai / beta) ; ils expirent à l'échéance de la période et ne sont pas remboursables.</p>
      </LSection>
      <LSection h="6. Droit de rétractation">
        <p style={{ margin: 0 }}>Pour les professionnels (usage B2B), le droit de rétractation prévu pour les consommateurs ne s'applique pas. Le cas échéant, le client professionnel reconnaît que le service, à contenu numérique fourni immédiatement, est exécuté dès la souscription.</p>
      </LSection>
      <LSection h="7. Durée et résiliation">
        <p style={{ margin: 0 }}>L'abonnement est sans engagement, reconductible par cycle. Le client peut résilier à tout moment ; la résiliation prend effet à la fin du cycle en cours, sans remboursement du cycle entamé.</p>
      </LSection>
      <LSection h="8. Responsabilité">
        <p style={{ margin: 0 }}>La responsabilité de l'Éditeur est limitée au montant payé par le client au cours des douze derniers mois. L'Éditeur n'est pas responsable de l'usage des contenus générés ni des performances publicitaires obtenues par le client.</p>
      </LSection>
      <LSection h="9. Droit applicable et litiges">
        <p style={{ margin: 0 }}>Les présentes CGV sont régies par le droit français. Tout litige, à défaut d'accord amiable, relève des tribunaux compétents du ressort du siège de l'Éditeur. Contact : {LEGAL.email}.</p>
      </LSection>
    </LegalDoc>
  );
}
