# Recette manuelle Studios · activation pilote et parcours à tester

Mandat du 10/10 : déploiement sur l'OVH actuel, tests manuels après déploiement (propriétaire et Codex),
15 $ cumulés pour tous les essais payants sur l'espace pilote. « Déployé » n'est PAS « validé » : chaque
parcours ci-dessous reste à cocher par une personne qui l'a vu fonctionner.

## 0. Vérifier que la version est en ligne (VPS, lecture seule)

Voir `L9/MISE-EN-LIGNE.md` §3. Attendus : `.tiktrends-deployed-sha` = `git rev-parse origin/main`,
57 migrations en base, journal « Sauvegarde avant migration OK » puis « Déploiement terminé ».
Sur l'application : `/console` affiche le même SHA (8 caractères).

## 1. Mettre les prompts en service (une fois · /admin/ia-studios)

Sans release publiée, aucune tâche IA des Studios ne tourne (Jarvis garde sa consigne de repli).

1. Onglet **Prompts** · « Importer en brouillon » (crée les brouillons du pack embarqué, n'active rien).
2. Même onglet · « Valider les brouillons importés » (fige les versions importées telles quelles).
3. Onglet **Releases** · « Créer la release (staged) » avec un motif (ex. « Mise en service Studios »).
4. Sur la release · « Évaluer » (tests structurels · aucun appel de modèle, aucune dépense).
5. « Recette manuelle… » · motif (ex. « Mandat du 10/10 · tests manuels avec Codex ») · confirmer.
6. « Publier la release » · confirmer. La ligne Benchmark dit « Recette manuelle (sans benchmark) ».

Retour arrière : « Révoquer » la release (plus aucune tâche ne l'utilise) ou republier une autre.

## 2. Ouvrir les capacités sur ton espace seulement (/admin/studios-interrupteurs)

1. Chercher ton espace · « Voir et régler ».
2. **Budget d'essai de l'espace** : plafond `15`, début du cumul vide (= maintenant), motif, confirmer.
   Le bloc affiche ensuite « X $ engagés sur 15,00 $ · reste Y $ ». Toute dépense IA de l'espace compte
   (Studios, Jarvis, Veille), chaque appel payant est refusé AVANT s'il ferait dépasser.
3. Interrupteurs · passer en « Allumée (pilote) » : Génération d'images, Contrôle visuel, Vidéo · storyboard
   et images clés. Laisser Voix coupée (aucun fournisseur), Résolution à blanc coupée. Motif, confirmer.

Le plafond global de l'application (`AI_SPEND_CAP_USD`) reste au-dessus, inchangé.

## 3. Parcours à tester ensemble (cocher « validé manuellement » seulement après l'avoir vu)

| # | Parcours | Où | Coût | Attendu |
| --- | --- | --- | --- | --- |
| P1 | Rail · une seule entrée « Studios » | rail, menu mobile, palette ⌘K | 0 $ | « Studios » mène à /studio/projets ; plus aucune entrée Pubs IA, Image IA, Vidéo IA, Textes IA ni « Studio IA » ; palette : « Nouveau projet » |
| P2 | Nouveau projet | /studio/projets · « Nouveau projet », ou /studio/projets/nouveau | 0 $ | projet créé pour la marque active, fiche ouverte ; rien n'est créé à l'ouverture de la page |
| P3 | Projet depuis la Veille | carte Veille · « Préparer une création » | 0 $ | sources jointes, dont « Créations précédentes » cochables |
| P4 | Brief et hypothèses | fiche projet | appel texte, réservé à sa borne maximale avant l’appel | brief rempli, DA de marque reprise (règles créatives) |
| P5 | Image · devis puis génération | projet · Image | devis affiché AVANT le clic (borne mesurée au devis E2 : ~0,33 $ par image AVEC contrôle visuel) | une image livrée ; relecture vision si activée |
| P6 | Bibliothèque | /assets | 0 $ | l'image livrée apparaît « Studios · <projet> », lecture seule ; les anciennes créations (pubs, images, vidéos, textes) apparaissent « Création historique · … », ouvrir et télécharger, sans suppression |
| P7 | Éditeur et export | projet · Image · export | 0 $ | PNG téléchargé, brief MD/JSON |
| P8 | Textes du projet | projet · Textes | appel texte (borne réservée avant) | textes écrits, exportés |
| P9 | Vidéo · storyboard, images clés et clips | projet · Vidéo | images clés payantes ; clip au forfait vidéo (0,60 $ réservé, 5 s) | storyboard, consignes ; « Devis du clip animé » sous une image clé valide, puis « Approuver et animer » ; le clip se lit dans le plan |
| P9b | Vidéo finale | projet · Vidéo · bloc « Vidéo finale » | 0 $ (assemblage ffmpeg sur le serveur, aucun fournisseur) | bouton inactif avec le plan nommé tant qu'un clip manque ; « Ce que cette vidéo n'inclut pas » listé avant le clic ; « Assembler la vidéo finale » ⇒ MP4 9:16 lisible (Chrome), « Télécharger le MP4 », musique audible si choisie ; aussi dans la bibliothèque |
| P10 | Jarvis connaît les projets | /jarvis | appel texte (borne réservée avant) | cite le projet et son lien ; lien « Projets » en en-tête |
| P11 | Budget | /admin/studios-interrupteurs | 0 $ | engagé = somme des essais ; refus net au-delà de 15 $ |
| P12 | Anciennes adresses | taper /studio, /studio/ads, /studio/image, /studio/video, /studio/textes ; un ancien favori ; /studio/ads?angle=Test&ref=<id d'une sauvegarde> | 0 $ | jamais de 404 ni de boucle ; sans contexte ⇒ liste des projets ; avec contexte ⇒ « Préparer un projet » (angle en objectif, sauvegarde jointe comme source), ce qui n'est pas repris est dit ; aucun projet créé sans clic |
| P13 | Veille, Adsmap, Radar → projet | carte Veille hors source, panneau d'un test Adsmap (« Préparer l'itération dans un projet », « Reprendre l'angle »), Radar créatif, page concurrent | 0 $ | chaque lien ouvre « Préparer un projet » avec son contexte ; le brief d'un test gagnant arbitré est repris |
| P14 | Reste intact | Veille, Sauvegardes, Adsmap, Jarvis, marques, bibliothèque | 0 $ | inchangés ; droits refusés inchangés (un client lecteur ne voit ni « Studios » ni « Nouveau projet ») |

Avant CHAQUE appel payant : lire le restant dans le bloc budget (P11) ; le devis du parcours l'annonce.

## 4. Ce qui n'est pas disponible (et pourquoi)

- **Anciens studios retirés (mandat du 10/10)** · Pubs IA, Image IA, Vidéo IA, Textes IA et l'ancien
  hub. Absent temporairement dans les projets Studios : le mode « pub générée entièrement » avec sa
  relecture automatique, le clone d'une pub avec moteur au choix, les lots d'essai (accroches, mises en
  page, univers), le Score Jarvis d'une pub, les scènes enregistrées, le téléversement manuel d'une
  photo produit (la synchro Shopify et l'import gardent la récupération automatique), le suivi d'une
  créa générée dans Adsmap. Leurs données (créations, essais, notes, relectures) sont conservées et
  restent lues (bibliothèque, Jarvis, Adsmap).

- **Montage complet** · la « Vidéo finale » met bout à bout les clips animés avec la musique ; la voix
  (aucun fournisseur), le texte écran et les sous-titres ne sont pas incrustés (`RENDU_VIDEO_FINAL`),
  et l'écran le liste avant le clic.
- **Lecture sur Safari / iPhone** · la route des médias ne sert pas les requêtes partielles (`Range`) ;
  Chrome lit les clips et la vidéo finale, Safari peut refuser · télécharger le MP4 reste possible.
- **Voix, lipsync** · aucun fournisseur validé.
- **Benchmark réel** · retiré des préalables par le mandat ; reste activable seulement par l'environnement.
- **Liens cliquables dans les réponses de Jarvis** · Jarvis donne le chemin du projet en texte.
