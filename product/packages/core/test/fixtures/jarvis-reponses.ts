import type { TestedVariable } from '../../src';

/**
 * Banc de mesure de l'extraction de variable (lot 5 ter V5 · `mesurerExtractionJarvis`).
 *
 * Des réponses-TYPES de Jarvis sur un lot ou une hypothèse joints, écrites dans
 * le ton du produit (tutoiement, phrases courtes, listes), SANS modèle. Chaque
 * entrée porte ce qu'une personne lit : la variable que la réponse conseille de
 * changer ensuite, ou `null` quand elle n'en conseille aucune ou plusieurs.
 *
 * Genres :
 *  · `une` · un seul conseil de variable, formulé librement (vocabulaire varié,
 *    y compris des mots que le module ne connaissait pas · c'est ce qu'on mesure) ;
 *  · `niee` · une seule variable conseillée, d'autres citées mais niées
 *    (« garde », « plutôt que », « ne touche pas ») ;
 *  · `structurelle` · un changement d'angle ou de désir (fermé ensuite, mais désigné) ;
 *  · `analyse` · une lecture du lot, aucun conseil de variable ;
 *  · `plusieurs` · plusieurs variables conseillées à la fois (une itération n'en change qu'une).
 *
 * Ne pas « corriger » une entrée pour faire passer la mesure · ajouter une
 * entrée, re-mesurer, et récrire le tableau du module (`MESURE_EXTRACTION_JARVIS`).
 */
export type GenreReponse = 'une' | 'niee' | 'structurelle' | 'analyse' | 'plusieurs';
export interface ReponseType { texte: string; attendu: TestedVariable | null; genre: GenreReponse }

export const CORPUS_REPONSES_JARVIS: readonly ReponseType[] = [
  /* ───────── une seule variable conseillée ───────── */
  { genre: 'une', attendu: 'hook', texte: 'La V1 l’emporte avec un coût par achat de 18 €. Pour la prochaine itération, teste une nouvelle accroche, plus directe, qui nomme le problème dès la première seconde.' },
  { genre: 'une', attendu: 'hook', texte: 'Ta V2 retient mieux que les autres. Je te conseille de changer le hook : une question au lieu d’une affirmation.' },
  { genre: 'une', attendu: 'hook', texte: 'Le taux de clic est bon mais le hook rate est faible.\n\nProchain test · retravaille les trois premières secondes, c’est là que tu perds les gens.' },
  { genre: 'une', attendu: 'hook', texte: 'La V1 gagne. Essaie une première phrase qui chiffre le bénéfice, par exemple « 7 jours pour une peau nette ».' },
  { genre: 'une', attendu: 'opening_visual', texte: 'La V3 accroche le regard. Décline-la en changeant le visuel d’ouverture : le produit en main plutôt que le packshot.' },
  { genre: 'une', attendu: 'opening_visual', texte: 'Tu perds 60 % des gens avant la deuxième seconde. Je te recommande de tester une autre première image, avec un visage.' },
  { genre: 'une', attendu: 'opening_visual', texte: 'La V1 tient. Teste une vignette différente, plus contrastée, pour arrêter le défilement.' },
  { genre: 'une', attendu: 'format', texte: 'La V2 est ta gagnante. Pour la suite, décline-la en carrousel : trois bénéfices, trois cartes.' },
  { genre: 'une', attendu: 'format', texte: 'La statique fonctionne bien. Je te propose de tester le même message au format vidéo 9:16.' },
  { genre: 'une', attendu: 'body', texte: 'L’accroche fait son travail, la V1 retient. Teste un autre déroulé : la démonstration en trois gestes avant le bénéfice.' },
  { genre: 'une', attendu: 'body', texte: 'Les gens décrochent au milieu de la vidéo. Change le corps de la vidéo, avec une démonstration plus courte et plus concrète.' },
  { genre: 'une', attendu: 'length', texte: 'La V1 gagne, mais la rétention chute après 12 secondes. Teste une version plus courte, 15 secondes au plus.' },
  { genre: 'une', attendu: 'length', texte: 'Prochaine variante · réduis la durée à 10 secondes, la V2 perd la moitié des gens à mi-parcours.' },
  { genre: 'une', attendu: 'audio', texte: 'Le visuel est bon. Je te conseille de tester une voix off à la place de la musique tendance.' },
  { genre: 'une', attendu: 'audio', texte: 'La V1 gagne. Essaie une autre musique, plus calme, en accord avec la promesse de douceur.' },
  { genre: 'une', attendu: 'avatar_on_screen', texte: 'La V2 marche avec la fondatrice. Teste une cliente à l’écran, elle ressemble davantage à ta cible.' },
  { genre: 'une', attendu: 'avatar_on_screen', texte: 'Ton audience répond aux visages. Je te recommande de tester une créatrice UGC qui parle face caméra.' },
  { genre: 'une', attendu: 'proof', texte: 'La V1 gagne mais le taux de conversion reste moyen. Ajoute une preuve : un avant et après sur 14 jours.' },
  { genre: 'une', attendu: 'proof', texte: 'La V3 manque de crédibilité. Teste un témoignage client filmé, avec le prénom et la ville.' },
  { genre: 'une', attendu: 'proof', texte: 'Pour la prochaine itération, mise sur les avis clients : affiche la note de 4,8 sur 5 dès l’ouverture.' },
  { genre: 'une', attendu: 'cta', texte: 'Le clic est là mais pas l’achat. Change l’appel à l’action : « Essaie-le 30 jours » au lieu de « Acheter ».' },
  { genre: 'une', attendu: 'cta', texte: 'La V1 gagne. Teste un CTA plus concret, qui parle de livraison en 48 h.' },
  { genre: 'une', attendu: 'cta', texte: 'Ta V2 accroche bien. Je te propose de changer le bouton, « Découvrir » plutôt que « Acheter maintenant ».' },
  { genre: 'une', attendu: 'offer', texte: 'Le coût par achat de la V1 est sous la cible. Teste une nouvelle offre : la livraison offerte dès le premier achat.' },
  { genre: 'une', attendu: 'offer', texte: 'La V2 gagne. Essaie une remise de 15 % sur le premier achat pour faire basculer les hésitants.' },
  { genre: 'une', attendu: 'offer', texte: 'Pour la suite, teste un code promo de bienvenue affiché dans la vidéo.' },
  { genre: 'une', attendu: 'offer', texte: 'La V1 convertit. Je te recommande de tester un prix barré, l’ancien prix à côté du nouveau.' },
  { genre: 'une', attendu: 'landing', texte: 'Le clic est bon, la conversion non. Change la page de destination : envoie vers la page produit au lieu de l’accueil.' },
  { genre: 'une', attendu: 'landing', texte: 'La V1 gagne. Teste une landing dédiée, qui reprend l’accroche de la pub.' },
  { genre: 'une', attendu: 'hook', texte: 'Bravo, la V2 coûte deux fois moins par achat.\n\n- Ce qui marche : la promesse chiffrée.\n- Prochain test : une accroche sous forme de question.' },
  { genre: 'une', attendu: 'proof', texte: 'Je te conseille de décliner la V1 avec une preuve sociale plus forte, par exemple le nombre de clientes.' },
  { genre: 'une', attendu: 'format', texte: 'La V1 est solide. Teste-la en format face caméra, la marque gagne quand on voit quelqu’un parler.' },
  { genre: 'une', attendu: 'length', texte: 'Ta gagnante dure 45 secondes. Une version plus longue n’apportera rien · essaie plutôt plus court, 20 secondes.' },
  { genre: 'une', attendu: 'offer', texte: 'La V2 gagne. Teste un pack de deux à prix réduit, c’est ce qui fait monter le panier moyen.' },

  /* ───────── une variable, les autres niées ───────── */
  { genre: 'niee', attendu: 'cta', texte: 'Garde l’accroche, elle fonctionne. Change seulement l’appel à l’action.' },
  { genre: 'niee', attendu: 'offer', texte: 'Ne touche pas au visuel d’ouverture. Teste plutôt une nouvelle offre, la livraison offerte.' },
  { genre: 'niee', attendu: 'proof', texte: 'Je te conseille de tester une preuve plutôt que de changer l’accroche.' },
  { genre: 'niee', attendu: 'length', texte: 'Conserve le format et la musique. Teste une durée plus courte, 15 secondes.' },
  { genre: 'niee', attendu: 'hook', texte: 'Ne change pas l’offre, elle convertit. Teste une nouvelle accroche.' },
  { genre: 'niee', attendu: 'audio', texte: 'Évite de changer le format, c’est ce qui a gagné. Essaie une voix off.' },

  /* ───────── structurelle (désignée, fermée ensuite) ───────── */
  { genre: 'structurelle', attendu: 'angle', texte: 'Le lot montre que la promesse anti-âge ne prend pas. Je te conseille de changer d’angle : parle de confort.' },
  { genre: 'structurelle', attendu: 'angle', texte: 'Teste un autre angle, celui du gain de temps le matin.' },
  { genre: 'structurelle', attendu: 'desire', texte: 'Ta cible ne cherche pas la beauté mais la tranquillité. Teste un autre désir : se sentir en sécurité.' },

  /* ───────── analyse, aucun conseil ───────── */
  { genre: 'analyse', attendu: null, texte: 'La V1 gagne nettement · 18 € par achat contre 31 € pour la V2. L’accroche chiffrée rassure.' },
  { genre: 'analyse', attendu: null, texte: 'Le lot est encore trop jeune pour conclure : 2 300 impressions, 4 achats. Attends quelques jours.' },
  { genre: 'analyse', attendu: null, texte: 'La V2 décroche dès l’ouverture, la V3 tient jusqu’à la fin. Le format vidéo semble mieux convenir à ta cible.' },
  { genre: 'analyse', attendu: null, texte: 'Bravo, c’est ton meilleur lot depuis le début. Le coût par achat baisse de 30 %.' },
  { genre: 'analyse', attendu: null, texte: 'Les trois variantes ont la même offre et la même page de destination, c’est donc bien l’accroche qui fait la différence.' },
  { genre: 'analyse', attendu: null, texte: 'Je n’ai pas assez de données sur ce lot pour te dire quoi faire. Il manque les achats des sept derniers jours.' },
  { genre: 'analyse', attendu: null, texte: 'Résumé pour le client : la V1 gagne grâce à sa preuve clinique, la V2 perd sur le coût par achat.' },
  { genre: 'analyse', attendu: null, texte: 'La musique tendance n’a rien changé : la V1 et la V2 font jeu égal sur la rétention.' },
  { genre: 'analyse', attendu: null, texte: 'Le verdict du moteur attend ton arbitrage. Tu peux conclure le lot quand tu veux.' },
  { genre: 'analyse', attendu: null, texte: 'Ce qui manque pour conclure : la dépense minimale n’est pas atteinte sur la V3.' },
  { genre: 'analyse', attendu: null, texte: 'Ton hypothèse est soutenue : la preuve sociale fait baisser le coût par achat.' },
  { genre: 'analyse', attendu: null, texte: 'La V1 a gagné parce que son visuel d’ouverture montre le produit en main.' },

  /* ───────── plusieurs variables conseillées ───────── */
  { genre: 'plusieurs', attendu: null, texte: 'Teste une nouvelle accroche et une autre offre.' },
  { genre: 'plusieurs', attendu: null, texte: 'Pour la suite :\n1. teste une accroche plus courte ;\n2. teste un appel à l’action plus concret ;\n3. teste une preuve chiffrée.' },
  { genre: 'plusieurs', attendu: null, texte: 'Je te conseille de raccourcir la vidéo et de changer la musique.' },
  { genre: 'plusieurs', attendu: null, texte: 'Change le visuel d’ouverture, puis teste une remise de 10 %.' },
  { genre: 'plusieurs', attendu: null, texte: 'Deux pistes : tester une voix off, ou tester le format carrousel.' },
  { genre: 'plusieurs', attendu: null, texte: 'Essaie une cliente à l’écran avec un témoignage, et une page de destination dédiée.' },
  { genre: 'plusieurs', attendu: null, texte: 'Prochaine itération · une accroche question, une durée de 15 secondes.' },
  { genre: 'plusieurs', attendu: null, texte: 'Teste un nouveau hook. Teste aussi le CTA.' },
  { genre: 'plusieurs', attendu: null, texte: 'Je recommande de changer l’offre et la landing en même temps pour voir si la conversion suit.' },
];

/**
 * Corpus de CONTRÔLE · écrit APRÈS le réglage du vocabulaire sur le corpus
 * ci-dessus, jamais utilisé pour le régler · il mesure ce que le réglage vaut
 * sur des formulations qu'il n'a pas vues (un sur-apprentissage s'y verrait).
 */
export const CORPUS_CONTROLE_JARVIS: readonly ReponseType[] = [
  { genre: 'une', attendu: 'hook', texte: 'Ta V2 gagne de peu. Je te recommande de reformuler l’accroche autour du gain de temps.' },
  { genre: 'une', attendu: 'hook', texte: 'Décline la V1 : remplace l’accroche par un chiffre choc, « 9 femmes sur 10 ».' },
  { genre: 'une', attendu: 'opening_visual', texte: 'La V3 est la meilleure. Teste un plan d’ouverture en gros plan sur la texture.' },
  { genre: 'une', attendu: 'format', texte: 'Pour le prochain test, passe la V1 en format story, plein écran.' },
  { genre: 'une', attendu: 'length', texte: 'La V2 gagne. Essaie de la raccourcir à 12 secondes, la fin traîne.' },
  { genre: 'une', attendu: 'audio', texte: 'Je te conseille de tester la V1 sans musique, juste le son du produit.' },
  { genre: 'une', attendu: 'avatar_on_screen', texte: 'La V1 fonctionne. Teste une influenceuse de ta niche à la place de la fondatrice.' },
  { genre: 'une', attendu: 'proof', texte: 'La V2 gagne. Mise sur des témoignages courts, trois clientes, trois phrases.' },
  { genre: 'une', attendu: 'cta', texte: 'Le clic est bon. Teste un appel à l’action qui parle de l’essai gratuit.' },
  { genre: 'une', attendu: 'offer', texte: 'La V1 gagne. Teste l’offre « 2 achetés, le 3e offert ».' },
  { genre: 'une', attendu: 'offer', texte: 'Je te propose de tester une réduction de bienvenue de 10 %.' },
  { genre: 'une', attendu: 'landing', texte: 'Change la page de destination de la V2 : une page avec les avis en haut.' },
  { genre: 'une', attendu: 'body', texte: 'L’accroche tient. Teste un autre déroulé : problème, solution, preuve, en vingt secondes.' },
  { genre: 'une', attendu: 'opening_visual', texte: 'La V1 gagne. Prochaine variante · une vignette avec le visage de la cliente.' },
  { genre: 'niee', attendu: 'offer', texte: 'Garde le format et l’accroche de la V1. Teste uniquement une autre offre.' },
  { genre: 'niee', attendu: 'audio', texte: 'Ne change pas le visuel d’ouverture. Teste une voix off plus posée.' },
  { genre: 'analyse', attendu: null, texte: 'La V1 a changé d’accroche et a gagné : 14 € par achat contre 22 €.' },
  { genre: 'analyse', attendu: null, texte: 'Le format carrousel a été testé sur le lot précédent sans succès.' },
  { genre: 'analyse', attendu: null, texte: 'Ton coût par achat est stable depuis deux semaines. Rien d’alarmant.' },
  { genre: 'analyse', attendu: null, texte: 'La V2 perd parce que son appel à l’action arrive trop tard.' },
  { genre: 'analyse', attendu: null, texte: 'Les avis clients rassurent visiblement · la V3 convertit mieux que les autres.' },
  { genre: 'plusieurs', attendu: null, texte: 'Teste une accroche plus courte, et en parallèle une nouvelle offre.' },
  { genre: 'plusieurs', attendu: null, texte: 'Je te propose deux itérations : changer la musique, puis changer le format.' },
  { genre: 'plusieurs', attendu: null, texte: 'Remplace la fondatrice par une créatrice UGC et ajoute un code promo.' },
];

/**
 * Corpus « ajoute » (lot 5 quater) · le verbe que #1054 laissait hors des
 * conseils parce qu'il est AUSSI descriptif. Écrit pour éprouver la règle de
 * l'impératif en tête de proposition (`ajouteEnTete`) · la moitié des entrées
 * sont des pièges DESCRIPTIFS (sujet devant le verbe, verbe coordonné après
 * « et » ou une virgule d'énumération, participe, « ajoute à cela ») qui
 * doivent rester sans variable · un seul pré-choix faux fait tomber la règle.
 * Même biais que le corpus de réglage (écrit par qui règle) · d'où l'écran de
 * mesure sur les vraies réponses.
 */
export const CORPUS_AJOUTE_JARVIS: readonly ReponseType[] = [
  /* ── impératif en tête · un conseil ── */
  { genre: 'une', attendu: 'proof', texte: 'La V1 gagne. Ajoute un témoignage client à la fin, filmé face caméra.' },
  { genre: 'une', attendu: 'offer', texte: 'Prochain test : ajoute une remise de 10 % sur le premier achat.' },
  { genre: 'une', attendu: 'cta', texte: 'Pour la V3, ajoute un appel à l’action plus concret.' },
  { genre: 'une', attendu: 'proof', texte: 'Ensuite, ajoute une preuve chiffrée dès l’ouverture.' },
  { genre: 'une', attendu: 'audio', texte: 'Ce qui manque :\n- Ajoute une voix off qui explique le geste.' },
  { genre: 'une', attendu: 'avatar_on_screen', texte: 'Ajoutez une cliente à l’écran, ta cible répond aux visages.' },
  { genre: 'une', attendu: 'offer', texte: 'Si tu veux aller plus loin, ajoute un code promo de bienvenue.' },
  { genre: 'une', attendu: 'proof', texte: 'La V2 décroche tôt. Ajouter une preuve sociale en ouverture, c’est le prochain test.' },
  /* ── descriptif · aucun conseil ── */
  { genre: 'analyse', attendu: null, texte: 'La V2 ajoute un témoignage et gagne nettement.' },
  { genre: 'analyse', attendu: null, texte: 'La V1 garde l’accroche, ajoute une preuve et gagne.' },
  { genre: 'analyse', attendu: null, texte: 'Elle ajoute une remise de 10 %, c’est ce qui la fait gagner.' },
  { genre: 'analyse', attendu: null, texte: 'Ajouté en fin de vidéo, le témoignage ne sert à rien.' },
  { genre: 'analyse', attendu: null, texte: 'Ajoute à cela que la V3 a un meilleur appel à l’action.' },
  { genre: 'analyse', attendu: null, texte: 'La V1, qui ajoute une voix off, retient mieux.' },
  { genre: 'analyse', attendu: null, texte: 'Le format carrousel ajoute deux secondes de rétention.' },
  { genre: 'analyse', attendu: null, texte: 'Ta gagnante garde l’offre et ajoute un avis client.' },
  { genre: 'analyse', attendu: null, texte: 'La V2 a ajouté une musique tendance sans effet sur la rétention.' },
  /* ── plusieurs ── */
  { genre: 'plusieurs', attendu: null, texte: 'Ajoute une preuve et une remise de bienvenue.' },
];
