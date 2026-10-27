/**
 * Spatial · Réglages · « Services activés » de l'espace (repris de l'écran V5
 * `/settings`, recette #106). On nomme la CAPACITÉ, jamais la variable
 * d'environnement ni le fournisseur (marque blanche). Pur · l'appelant passe
 * l'environnement, la règle ne lit rien elle-même.
 */
import { COPIE_STOCKAGE } from '../../copie-service';
import { ROUTAGE_TICKET, TICKET_INTERNE } from '../../copie-client';

export interface ServiceEspace { cle: string; libelle: string; debloque: string; branche: boolean }

type Env = Readonly<Record<string, string | undefined>>;

const tous = (env: Env, ...cles: string[]) => cles.every((c) => !!env[c]);

export function servicesEspace(env: Env): ServiceEspace[] {
  return [
    { cle: 'ia', libelle: 'IA · rédaction et analyse', debloque: 'Studio, assistant, pré-remplissage marque, analyse concurrent', branche: tous(env, 'ANTHROPIC_API_KEY') },
    { cle: 'bibliotheque', libelle: 'Bibliothèque pub concurrentielle', debloque: 'Veille, suivis, analyse concurrent', branche: tous(env, 'TRENDTRACK_API_KEY') },
    { cle: 'image-video', libelle: 'Image & vidéo IA', debloque: 'Studios · images (Nano Banana, GPT Image) et clips vidéo (Kling)', branche: tous(env, 'FAL_KEY') },
    { cle: 'video-ancien', libelle: 'Vidéo · ancien moteur alternatif', debloque: 'Suivi des vidéos historiques lancées sur ce moteur (fin ou remboursement)', branche: tous(env, 'HIGGSFIELD_API_KEY') },
    { cle: 'stockage', libelle: 'Stockage des fichiers lourds', debloque: 'Upload direct des gros fichiers (rushs vidéo) dans la Bibliothèque', branche: tous(env, 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_ENDPOINT') },
    { cle: 'mail', libelle: 'E-mails transactionnels', debloque: 'Bienvenue, invitation, réinitialisation de mot de passe', branche: tous(env, 'SMTP_URL') },
    { cle: 'marketing', libelle: 'E-mails marketing', debloque: 'Synchro des inscrits en profils + flows marketing (bienvenue, essai, relances)', branche: tous(env, 'KLAVIYO_API_KEY') },
    { cle: 'paiement', libelle: 'Paiement en ligne', debloque: 'Abonnements, portail client et facturation', branche: tous(env, 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET') },
    { cle: 'messagerie', libelle: 'Messagerie d’équipe', debloque: 'Résumés et @TikTrends dans Slack (à venir)', branche: tous(env, 'SLACK_BOT_TOKEN') },
  ];
}

/**
 * Le panneau Stockage de l'Espace · copie client ou consignes de la plateforme
 * (recette #106b · `COPIE_STOCKAGE`), et ce qui s'affiche quand rien n'est
 * actionnable : le client inactif lit qui agit (ticket interne), l'équipe de la
 * plateforme lit ses consignes de déploiement. Mêmes états que l'écran V5.
 */
export function panneauStockage(p: { actif: boolean; operateur: boolean }): {
  titre: string; badge: string; intro: string;
  inactif: { texte: string; lien: { libelle: string; href: string } | null } | null;
} {
  const c = p.operateur ? COPIE_STOCKAGE.operateur : COPIE_STOCKAGE.client;
  const inactif = p.actif ? null
    : p.operateur
      ? { texte: 'Pose d’abord les clés S3 dans .env.deploy sur le VPS (S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY), puis docker compose up -d web workers. Les boutons de configuration apparaîtront ici.', lien: null }
      : { texte: `${COPIE_STOCKAGE.client.inactif} ${ROUTAGE_TICKET}`, lien: { libelle: TICKET_INTERNE.libelle, href: TICKET_INTERNE.href } };
  return { titre: c.titre, badge: c.badge(p.actif), intro: c.intro, inactif };
}
