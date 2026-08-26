import { LEGAL } from '../../../lib/legal';
import { LegalDoc, LSection } from '../../../components/LegalDoc';

export const dynamic = 'force-dynamic';

export default function Cookies() {
  return (
    <LegalDoc title="Politique cookies" subtitle={`Dernière mise à jour : ${LEGAL.updatedAt}`}>
      <LSection h="1. Qu'est-ce qu'un cookie ?">
        <p style={{ margin: 0 }}>Un cookie est un petit fichier déposé sur ton appareil lors de la visite d'un site. TikTrends utilise le strict nécessaire au fonctionnement du service.</p>
      </LSection>
      <LSection h="2. Cookies utilisés">
        <p style={{ margin: 0 }}>
          <b>Cookies essentiels</b> : gestion de la session et de l'authentification (rester connecté), sécurité (anti-fraude).
          Ces cookies sont nécessaires au fonctionnement et ne requièrent pas de consentement.
          {' '}TikTrends n'utilise pas de cookies publicitaires ni de traceurs tiers à des fins marketing sur l'application.
        </p>
      </LSection>
      <LSection h="3. Stockage local">
        <p style={{ margin: 0 }}>Certaines préférences d'affichage peuvent être enregistrées localement dans ton navigateur (localStorage) pour améliorer l'expérience. Ces données restent sur ton appareil.</p>
      </LSection>
      <LSection h="4. Gestion">
        <p style={{ margin: 0 }}>Tu peux à tout moment configurer ton navigateur pour bloquer ou supprimer les cookies. Le blocage des cookies essentiels peut empêcher la connexion au service.</p>
      </LSection>
      <LSection h="5. Contact">
        <p style={{ margin: 0 }}>Pour toute question : {LEGAL.email}.</p>
      </LSection>
    </LegalDoc>
  );
}
