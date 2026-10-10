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
   (Studios ET outils historiques), chaque appel payant est refusé AVANT s'il ferait dépasser.
3. Interrupteurs · passer en « Allumée (pilote) » : Génération d'images, Contrôle visuel, Vidéo · storyboard
   et images clés. Laisser Voix coupée (aucun fournisseur), Résolution à blanc coupée. Motif, confirmer.

Le plafond global de l'application (`AI_SPEND_CAP_USD`) reste au-dessus, inchangé.

## 3. Parcours à tester ensemble (cocher « validé manuellement » seulement après l'avoir vu)

| # | Parcours | Où | Coût | Attendu |
| --- | --- | --- | --- | --- |
| P1 | Rail · entrée Projets | rail Studio IA, palette ⌘K | 0 $ | « Projets » visible, mène à /studio/projets |
| P2 | Nouveau projet | /studio/projets · « Nouveau projet » | 0 $ | projet créé pour la marque active, fiche ouverte |
| P3 | Projet depuis la Veille | carte Veille · « Préparer une création » | 0 $ | sources jointes, dont « Créations précédentes » cochables |
| P4 | Brief et hypothèses | fiche projet | appel texte, réservé à sa borne maximale avant l’appel | brief rempli, DA de marque reprise (règles créatives) |
| P5 | Image · devis puis génération | projet · Image | devis affiché AVANT le clic (borne mesurée au devis E2 : ~0,33 $ par image AVEC contrôle visuel) | une image livrée ; relecture vision si activée |
| P6 | Bibliothèque | /assets | 0 $ | l'image livrée apparaît « Studios · <projet> », lecture seule |
| P7 | Éditeur et export | projet · Image · export | 0 $ | PNG téléchargé, brief MD/JSON |
| P8 | Textes du projet | projet · Textes | appel texte (borne réservée avant) | textes écrits, exportés |
| P9 | Vidéo · storyboard, images clés et clips | projet · Vidéo | images clés payantes ; clip au forfait vidéo (0,60 $ réservé, 5 s) | storyboard, consignes ; « Devis du clip animé » sous une image clé valide, puis « Approuver et animer » ; le clip se lit dans le plan |
| P10 | Jarvis connaît les projets | /jarvis | appel texte (borne réservée avant) | cite le projet et son lien ; lien « Projets » en en-tête |
| P11 | Budget | /admin/studios-interrupteurs | 0 $ | engagé = somme des essais ; refus net au-delà de 15 $ |
| P12 | Ancien outil intact | Pubs IA, Image, Vidéo, Textes, Veille, Sauvegardes, Adsmap | 0 $ | inchangés |

Avant CHAQUE appel payant : lire le restant dans le bloc budget (P11) ; le devis du parcours l'annonce.

## 4. Ce qui n'est pas disponible (et pourquoi)

- **Rendu vidéo final** · `RENDU_VIDEO_FINAL` non branché : chaque plan s'anime (clip de 5 s depuis son
  image clé, fal Kling image → vidéo), l'assemblage final des clips arrive au lot suivant.
- **Voix, lipsync** · aucun fournisseur validé.
- **Benchmark réel** · retiré des préalables par le mandat ; reste activable seulement par l'environnement.
- **Liens cliquables dans les réponses de Jarvis** · Jarvis donne le chemin du projet en texte.
