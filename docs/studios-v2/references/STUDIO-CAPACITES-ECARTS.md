# Studio TikTrends — capacités, écarts et trajectoire vers un atelier créatif efficace

Analyse documentaire du 6 octobre 2026. Périmètre : PRODUCT.md, outputs/design.md, PILOTAGE.md, SUIVI.md jusqu’à l’entrée 12:30 UTC et AUDIT-CREAFLOW-2026-10-06.md, compléments techniques inclus. Aucune visite navigateur, aucun code TikTrends disponible/exécuté dans cette analyse, aucune génération. Les mentions « rapporté » désignent les audits Claude consignés dans SUIVI ; elles ne constituent pas une nouvelle vérification indépendante. Ce document propose une trajectoire, pas une livraison ni une autorisation de construire un Canvas ou de modifier moteur, données et protections.

## Conclusion

TikTrends possède déjà des pièces importantes : studios Image/Vidéo/Pubs/Textes, contexte de marque, Veille, Adsmap, apprentissages et Jarvis. Le retard documenté est surtout la continuité entre ces pièces : hypothèse non transmise, filiation non écrite, reprise partielle, granularité de suivi insuffisante. Ajouter un graphe visuel avant de résoudre ces contrats rendrait les ruptures plus jolies sans rendre la production plus fiable.

CreaFlow fournit un exemple utile : des objets de projet/plan/élément, des commandes distinctes, un bloc sélectionné qui cible la conversation, une logique cliente qui identifie les sorties à refaire. Ce sont des mécanismes observés ou lus dans ses ressources publiques, pas une preuve de génération parfaite, de reprise serveur fiable ou de qualité supérieure de tous ses modèles.

## Capacités TikTrends à réutiliser, avec niveau de preuve

| Capacité | Évidence disponible et date | Limite à respecter |
|---|---|---|
| Identité marque, palette/charte et Assets | H3/H4, observations production le 30 septembre ; audit `listAssets` lié à la marque active (SUIVI 13:41) | Assets d’une marque simplement consultée non prouvés ; ne pas confondre identité de marque et produit disponible au moteur |
| Veille vers création | Audit I du 30 septembre : passage Veille→Studio rapporté | Conservation intégrale de source/références jusqu’au rendu non établie |
| Studios Image/Vidéo et galerie | Recette locale lots 9–10, captures examinées ; actions accessibles et états loading/erreur synthétiques | Pas de génération réelle exécutée ; qualité fournisseur/export final non validés ; Studio production exclu par #125 |
| Création vers verdict Adsmap | I1/PR712, liaison au rendu depuis état de verdict réel ; limites reprises au lot17 | Une fiche par génération, pas sélection d’une image ; absence de filiation serveur toujours consignée |
| Apprentissages vers brief | I2/PR713 : angle/audience préremplis ; `sessionStorage` par marque/test après correction, captures locales examinées le 30 septembre | Hypothèse/variable seulement lisibles, non transmises au moteur ; offre/produit non préremplis ; autres réglages non conservés par cette reprise |
| Tests/lots/suites/verdicts/learnings | Audit I puis audit sous-pages Adsmap dans SUIVI, septembre–octobre | Leur présence ne prouve pas une boucle intégrale et traçable ; ruptures structurelles ci-dessous |
| Formats créatifs | PR723 publiée, `/veille/formats`→`/saved` observé sur `ae76fa1e` le 6 octobre | Taxonomie manuelle de sauvegardes ; ne pas annoncer l’équivalent du catalogue de 16 formats CreaFlow |
| Connaissances Jarvis | PR724, revue indépendante code/captures/journaux consignée ; production `70200777` observée le 6 octobre à 12:17 UTC | Production vide : zéro savoir ingéré observé. Import txt/md borné (24 000 octets/6 000 caractères), pas ingestion universelle. Inclusion/version/portée ≠ preuve que chaque studio consomme ces données |
| Cadres communs et accueil Analytics | Publications #725/#726 et observations consignées | Uniformité bornée aux preuves ; recette globale encore ouverte, pas garantie de toutes routes/états |

Références précises : SUIVI lignes autour de 897 (audit I), 974–987 (I2), 1249 (ruptures Adsmap), 1342–1355 (Studio), 1656–1688 (lot17), 2107 et 2147 (productions #723/#724). Les dates et SHA sont préférables aux numéros de ligne si le journal évolue.

## Ruptures documentées à traiter avant la promesse « studio cohérent »

1. **Intention créative incomplète.** L’hypothèse et la variable de test existent comme contexte lisible mais ne pilotent pas la génération d’après I2. Ce défaut n’est pas corrigé en affichant davantage de blocs.
2. **Filiation incomplète.** Au lot17, la nouvelle création ne conserve pas une relation serveur au test source. La reprise du brief est utile mais distincte d’un arbre de variantes durable.
3. **Préparation de test incomplète.** Lot17 : absence de saisie hypothèse/variable/offre/destination, affichage des manques seulement ; l’action reste disponible pour les annonces réellement complètes. Ne pas déclarer toutes les annonces générées prêtes à tester.
4. **Granularité.** Une fiche Adsmap par génération ; suivi par image choisie non établi. Une génération multiple peut donc masquer la variante réellement évaluée.
5. **Reprise partielle.** Deux champs bénéficient d’une conservation par marque/test ; un dossier durable couvrant produit, style, scénario, voix, médias et montage n’est pas démontré.
6. **Éléments créatifs.** Audit I : `adsmap_creative_elements` aurait un lecteur Jarvis mais aucun producteur hors fixtures ni UI. À revalider sur le code courant ; ne pas en déduire une extraction automatique disponible.
7. **Mesure et déclenchements.** Audit du 1er octobre rapporte des risques de doublon, import non idempotent, métriques au niveau espace plutôt que marque et absence d’estimateur de coût. L’état actuel doit être réconcilié avant correction ; ces constats ne sont pas tous reproduits ni autorisés à modifier.
8. **Lecture Studio non pure.** #125 signale des écritures cache/lumière par GET `/api/ad`. Tant que non résolu, une visite production n’est pas une recette en lecture seule sûre selon le mandat.

P1/P2/P3 historiques portent notamment sur `askAssistant`, validation d’historique et application de droits ; ce ne sont pas les niveaux de priorité des lots de ce document. Ils restent suspendus et ne doivent pas être réouverts implicitement par un nouveau studio. Le dernier audit A/C du lot20 peut actualiser ces conclusions ; il n’était pas livré dans la dernière entrée documentaire lue.

## Ce que l’exemple CreaFlow prouve et ne prouve pas

L’audit du 6 octobre identifie React 18.3.1, JavaScript client, Vite et l’intégration Supabase des objets vidéo. Le canvas observé est composé de cartes HTML positionnées, de liens SVG et d’un zoom CSS. La sélection Scénario cible le champ conversation. Le code client contient des catégories `redraw`, `revoice`, `retime`, `restyle`, `recompile`, `removed` et des commandes serveur distinctes (`storyboard`, `drawCharacter`, `animate`, `revoice`, `music`, `montage`…).

Ces indices soutiennent une architecture de production en étapes. Ils ne confirment pas le langage serveur, la bibliothèque exacte du graphe, les modèles IA exécutés, la file de tâches, l’idempotence, le calcul de coût final, les mécanismes de verrouillage, le moteur de montage ni la robustesse des changements concurrents. Aucun modèle ne doit être choisi pour TikTrends sur une attribution non prouvée à CreaFlow.

## Contrat minimal d’un studio efficace — proposition à auditer

Un projet devrait conserver : marque/espace, produit et références autorisées, objectif, hypothèse, variable testée, format, contraintes et connaissances/version utilisées. Chaque plan devrait conserver : description, narration, texte écran, durée et références produit/personnage/style. Chaque média devrait identifier le plan et les versions d’entrées qui l’ont produit, son état et son origine. Une variante devrait retrouver son parent et son résultat mesuré.

Le graphe et la vue guidée doivent être **deux vues des mêmes objets**, sans mémoire métier cachée dans les positions des cartes. Un bloc réussi doit rester réutilisable. Une modification doit expliquer les sorties devenues obsolètes, conserver les anciennes, permettre une reprise ciblée et annoncer le coût avant action. Un statut « terminé » désigne un rendu, jamais une réussite commerciale.

Ce contrat est une cible, pas une demande de nouvelles tables. L’audit doit d’abord mapper chaque champ aux objets, actions et fournisseurs existants et montrer les vrais manques.

## Lots proposés et critères de passage

| Lot | Résultat utile | Preuves et critère de sortie | Frontière |
|---|---|---|---|
| S0 — cartographie du contrat actuel | Pour une création, suivre source→brief→génération→média→test et documenter pertes/champs/actions | Matrice code courant/SHA avec producteur, consommateur, persistance, portée, droits, coût et état ; distinguer réel/mock ; 3 scénarios locaux sans fournisseur payant | Audit seulement, peut reprendre l’agent C lot20 ; ne pas dupliquer sa mission |
| S1 — continuité des capacités existantes | Afficher références, connaissances applicables, champs réellement transmis et prochaine action ; garder le contexte au retour | Source et marque inchangées à chaque transition ; noms longs, erreur, retour/clavier ; absence de promesse de champ ignoré | UI/contexte réutilisable ; toute nouvelle persistance/filiation à isoler pour décision |
| S2 — spécification des dépendances | Matrice « changement → sorties à revoir » et UX de reprise ciblée | Produit/style/narration/durée testés sur fixtures ; ancien résultat visible ; aucune relance payante implicite ; comparaison avant/après compréhensible | Si moteur de tâches ou stockage absent, présenter un delta concret hors mandat avant implémentation |
| S3 — prototype atelier visuel | Produit, Style, Scénario et Plans reliés, détail éditable, Jarvis contextualisé ; vue guidée mobile équivalente | Prototype données synthétiques, tâches évaluées : retrouver un plan, expliquer ses sources, modifier narration, identifier impacts ; clavier et 390×720 | Conception/prototype à décider ; ni Canvas production ni remplacement du studio autorisés par la recherche seule |
| S4 — preuve de production maîtrisée | Un scénario traverse la chaîne avec coûts et restauration/reprise maîtrisés | D’abord moteurs simulés ; succès/échec/retry/doublon/version concurrente ; si validation réelle payante nécessaire, budget/périmètre explicites | Pas d’activation fournisseur ni dépense implicite |
| S5 — apprentissage | Variante reliée à sa mesure et à la prochaine décision | Échantillon insuffisant→inconclusif ; période/source/variable visibles ; correction humaine traçable | Réutiliser Adsmap/Analytics ; nouveau modèle métier à identifier séparément |

Pour la comparaison avec CreaFlow, mesurer le nombre de ressaisies, les pertes de contexte, le temps pour comprendre l’état d’un projet, la capacité à reprendre après erreur et le nombre de sorties inutilement refaites. Ne pas optimiser uniquement l’apparence du graphe ou le nombre de modèles disponibles.

## Décision immédiate utile

Attendre et exploiter le rapport de capacités de l’agent C du lot20, le rapprocher de ce registre et de la nouvelle analyse publique CreaFlow. Demander ensuite une proposition bornée pour la continuité du dossier créatif et un prototype de dépendances, avec ce qui est réutilisable et ce qui exige une décision structurelle. La demande de recherche approfondie autorise cette analyse ; elle ne justifie pas de lancer silencieusement une migration, un Canvas de production ou des générations payantes.
