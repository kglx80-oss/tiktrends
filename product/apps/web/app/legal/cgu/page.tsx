import { LEGAL } from '../../../lib/legal';
import { LegalDoc, LSection } from '../../../components/LegalDoc';

export const dynamic = 'force-dynamic';

export default function CGU() {
  return (
    <LegalDoc title="Conditions générales d'utilisation" subtitle={`Dernière mise à jour : ${LEGAL.updatedAt}`}>
      <LSection h="1. Objet">
        <p style={{ margin: 0 }}>Les présentes CGU régissent l'accès et l'utilisation de la plateforme TikTrends éditée par {LEGAL.legalName} (« l'Éditeur »), accessible à l'adresse {LEGAL.siteUrl}. En créant un compte, l'utilisateur accepte les présentes conditions.</p>
      </LSection>
      <LSection h="2. Accès au service">
        <p style={{ margin: 0 }}>TikTrends est un outil SaaS d'intelligence créative (veille publicitaire, génération d'images et de vidéos assistée par IA, gestion de marques). L'accès nécessite la création d'un compte et, selon la formule, un abonnement actif. L'Éditeur peut faire évoluer les fonctionnalités.</p>
      </LSection>
      <LSection h="3. Compte et sécurité">
        <p style={{ margin: 0 }}>L'utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée depuis son compte. Toute utilisation frauduleuse doit être signalée sans délai à {LEGAL.email}.</p>
      </LSection>
      <LSection h="4. Usage acceptable">
        <p style={{ margin: 0 }}>L'utilisateur s'engage à ne pas détourner le service, à respecter les droits des tiers (marques, droits d'auteur, droit à l'image) et la réglementation applicable à la publicité. Les contenus générés sont sous la responsabilité de l'utilisateur, qui garantit disposer des droits nécessaires sur les éléments qu'il importe (produits, logos, visuels).</p>
      </LSection>
      <LSection h="5. Contenus générés par IA">
        <p style={{ margin: 0 }}>Les visuels et textes produits par l'IA sont fournis à titre d'aide à la création. L'utilisateur doit les vérifier avant diffusion, notamment les allégations, mentions légales sectorielles et la conformité publicitaire. L'Éditeur ne garantit pas l'exactitude ou l'adéquation d'un contenu généré à un usage particulier.</p>
      </LSection>
      <LSection h="6. Propriété intellectuelle">
        <p style={{ margin: 0 }}>La plateforme, sa marque et son code restent la propriété de l'Éditeur. Sous réserve du paiement des sommes dues, l'utilisateur dispose des droits d'usage sur les créations qu'il génère pour ses besoins professionnels.</p>
      </LSection>
      <LSection h="7. Disponibilité et responsabilité">
        <p style={{ margin: 0 }}>Le service est fourni « en l'état ». L'Éditeur met en œuvre les moyens raisonnables pour assurer sa disponibilité mais ne saurait être tenu responsable des interruptions, des services tiers (fournisseurs d'IA, hébergeur) ou de la perte de données imputable à l'utilisateur.</p>
      </LSection>
      <LSection h="8. Résiliation">
        <p style={{ margin: 0 }}>L'utilisateur peut fermer son compte à tout moment. L'Éditeur peut suspendre un compte en cas de manquement aux présentes CGU.</p>
      </LSection>
      <LSection h="9. Droit applicable">
        <p style={{ margin: 0 }}>Les présentes CGU sont soumises au droit français. À défaut de résolution amiable, tout litige relève des tribunaux compétents du ressort du siège de l'Éditeur.</p>
      </LSection>
    </LegalDoc>
  );
}
