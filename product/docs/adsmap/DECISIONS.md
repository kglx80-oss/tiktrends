# ADSMAP · Journal des décisions

Tenu en application du §0 du cahier des charges : toute ambiguïté non tranchée en §17 est
résolue par l'option la plus simple respectant les invariants du §2.4, et consignée ici.

Statuts : **PROPOSÉE** (en attente de Kévin) · **PRISE** (appliquée) · **RÉVISÉE**.

---

## D1 — Ne pas dupliquer la couche de données dormante

**Statut :** PROPOSÉE · Phase 0 · bloquante pour la Phase 1

Sept tables du schéma (`creatives`, `ad_instances`, `metrics_daily`, `creative_tags`,
`radar_scores`, `briefs`, `insights`) couvrent déjà `AssetAnalysis`, `MetricSnapshot`, la face
plateforme de `Ad`, la sortie d'A0, le diagnostic de funnel et le brief d'A3. Aucune n'est
utilisée par le code applicatif.

**Décision proposée :** ADSMAP les étend. Créer `Ad`, `MetricSnapshot` et `AssetAnalysis` à côté
produirait deux modèles concurrents de la même réalité, avec deux synchronisations Meta et deux
vérités sur la performance.

**Conséquence si refusée :** compter environ une journée de plus en Phase 1, et prévoir la
suppression explicite des tables dormantes pour éviter l'ambiguïté.

---

## D2 — « Avatar » et « Persona » désignent le même objet

**Statut :** PROPOSÉE · bloquante pour la Phase 1

`personas` (`brand_id`, `name`, `description`, `pains[]`, `desires[]`) est déjà, champ pour champ,
le modèle `Avatar` du §4.

**Décision proposée :** conserver la table `personas`, y ajouter `objections[]`, `sources`,
`status`, et n'employer qu'un seul terme dans l'interface. Je propose **« Avatar »**, qui est le
mot du métier et celui du cahier des charges ; « Persona » disparaît des libellés.

---

## D3 — Transcription : ffmpeg + service dédié, avec repli vision seule

**Statut :** PROPOSÉE · §17.5

Le cahier des charges suppose `video_analysis_create` d'Higgsfield « déjà branché ». Il ne l'est
pas : le connecteur du dépôt n'expose que la génération vidéo (cf. `STACK.md` §2.1).

**Décision proposée :** extraction audio par ffmpeg dans le worker, puis transcription par service
dédié. En cas d'échec, A0 continue sur les frames seules, `transcript` et `hook_spoken` restent
nuls et `confidence` baisse en conséquence. Un asset non transcrit ne bloque jamais un batch.

---

## D4 — Compléter le connecteur Meta avant le moteur de verdict

**Statut :** PRISE (contrainte technique, sans arbitrage)

La synchro actuelle est agrégée sur 30 jours et ignore `adset_id`, `campaign_id`, le budget
quotidien des ad sets, `reach`, les paliers `p25/p50/p100` et `landing_page_views`. Le contrôle de
protocole (§6.2) et les intervalles (§6.4) en dépendent.

**Décision :** ajouter ces champs en tête de Phase 3, avec `time_increment=1`, avant d'écrire la
moindre règle de verdict. `metrics_daily` a déjà les colonnes.

---

## D5 — `LandingPage.cvr_30d` saisi à la main en v1

**Statut :** PRISE (repli prévu par le cahier des charges) · §17.6

L'Admin API Shopify branchée lit les commandes, pas les sessions : elle ne peut pas produire de
taux de conversion. Il faudrait `shopifyqlQuery`, une autre surface d'API.

**Décision :** saisie manuelle en v1, requête ShopifyQL en SHOULD de Phase 5. Le diagnostic
CONVERT (§8.4) fonctionne dès la v1 en comparant le CVR de l'ad à la baseline saisie.

---

## D6 — Le moteur de verdict vit dans `packages/core`

**Statut :** PRISE

Métriques dérivées, intervalles, règles de verdict, kill rules, score A7 v1 et parser de nommage
sont du calcul pur. `packages/core` n'a aucune dépendance serveur et est déjà couvert par des
tests. L'Annexe A se transpose directement en table de cas.

Point non traité par le cahier des charges : l'intervalle de Poisson par quantiles chi² suppose
une fonction quantile absente de JavaScript. Elle sera implémentée (inverse de la gamma
incomplète régularisée) et testée contre des valeurs de référence, plutôt qu'approximée
silencieusement.

---

## D7 — Les agents consomment le système de crédits existant

**Statut :** PRISE

Le produit dispose d'un débit atomique (`reserveCredits` / `settleCredits` / `refundCredits`),
d'un barème dans `packages/core`, d'un grand livre et d'une page `/usage`. `AgentRun.cost_eur` s'y
branche au lieu d'ouvrir un compteur parallèle.

**Point à trancher, absent du cahier des charges :** l'orchestrateur nocturne dépense des crédits
sans personne devant l'écran. Proposition — plafond nocturne par marque, et arrêt propre avec un
`DecisionItem` explicite quand le solde est insuffisant, jamais un échec silencieux.

---

## D8 — Canvas chargé dynamiquement et branché sur le thème du produit

**Statut :** LIVRÉE (PR #167)

`@xyflow/react` et `elkjs` sont les premières dépendances UI du projet. Chargement par
`next/dynamic` avec `ssr: false` pour ne pas alourdir les pages sans canvas, et couleurs prises
sur les variables CSS existantes (`--ink`, `--surface`, `--accent-strong`) plutôt que sur le thème
par défaut de la bibliothèque.

---

## D9 — `brief_competitor` et `find_similar_shops` passent en COULD

**Statut :** PRISE

Le connecteur Trendtrack du dépôt expose `ttSearchAds`, `ttSearchTikTok`, `ttSearchGoogle` et
`ttGetMe`. Les deux fonctions citées au §8.3 A1 n'y sont pas.

**Décision :** A1 travaille sur `ttSearchAds`, déjà suffisant pour nourrir avatars et angles à
partir de la copy concurrente. Les deux autres seront ajoutées au connecteur si l'API Trendtrack
les expose, sans bloquer la Phase 5.

---

## D10 — Notion : abandon en v1

**Statut :** PROPOSÉE

Aucune intégration Notion dans le dépôt. Le brief d'A3 est déjà stocké (`briefs.content_json`),
affichable et exportable.

**Décision proposée :** ne pas ouvrir cette intégration en v1. À reconsidérer si l'équipe de
production travaille réellement dans Notion au quotidien.

---

## D11 — Intervalles unilatéraux à 80 % (addendum v2.1 · C1)

**Statut :** PRISE

Le bilatéral à 90 % de la v2 exigeait environ 25 conversions par ad pour conclure,
hors d'atteinte d'un budget de test à 3 × le CPA cible : la règle WINNER échouait sur son
propre cas de référence. Remplacé par l'intervalle exact de Garwood, unilatéral à 80 %,
et Wilson unilatéral au même niveau pour les taux.

Le quantile chi² est écrit à la main (option B du C1.3, sans dépendance nouvelle) et
vérifié contre la table C1.4 : **écart maximum 0,06 %**, pour une tolérance de 0,5 %.

`ciLevelOneSided` porte un avertissement dans le code : ne pas le remonter pour
« conclure plus vite ». C'est `babyTolerance` qu'il faut ajuster si le seuil WINNER se
révèle trop strict après deux lots, comme le note l'addendum.

---

## D12 — Le seuil relatif des indicateurs avancés relève la barre, il ne l'abaisse pas

**Statut :** PROPOSÉE · à confirmer par Kévin

Le §6.6 règle 5 écrit « ≥ seuil absolu **ou** ≥ `leading_relative` × médiane marque ».

Pris à la lettre, le « ou » abaisse la barre pour une marque médiocre : avec une médiane
de hook à 22 %, le seuil relatif tombe à 26,4 %, et une ad à 27 % passerait alors que le
seuil absolu est à 30 %. C'est l'inverse de l'intention.

C'est aussi la seule lecture qui **contredit l'Annexe A** : le cas « bordure de fenêtre »
(hook 30,0 %, hold 10,0 %, CTR 1,20 %) tombe pile sur les trois seuils absolus et doit
rester INCONCLUSIVE ; avec le « ou » littéral, il ressort BABY_WINNER par le seuil
relatif.

**Décision appliquée :** un indicateur est au vert s'il dépasse **le plus exigeant des
deux** seuils, en comparaison stricte. Les deux cas de référence de l'Annexe A
(« baby via leading » et « bordure de fenêtre ») passent alors tous les deux.

C'est la deuxième incohérence trouvée dans le moteur, après celle du C1 : si tu
préfères la lecture littérale, dis-le et je bascule · mais alors l'Annexe A doit être
corrigée en conséquence.

---

## D13 — Budget IA : la décision est pure, l'exécution ailleurs

**Statut :** PRISE · addendum v2.1 (C2)

`planAiCalls` décide quels appels l'orchestrateur exécute, dans l'ordre de priorité du
C2.2 §3, en respectant les plafonds nocturne et mensuel, la pause manuelle et
l'idempotence par empreinte d'état. Aucune base, aucun réseau : testable directement.

Deux points de conception, au-delà de la lettre de l'addendum :

- un appel sauté parce que **rien n'a changé** (idempotence) ne déclenche pas de
  `DecisionItem` · ce n'est pas un manque de budget, c'est une nuit calme ;
- le résumé affiché rappelle explicitement que **les verdicts et les alertes sont à
  jour** même quand le plafond est atteint. Sans cette phrase, un plafond ressemble à
  une panne.

---

## D14 — Le moteur de mesure vit côté web, le worker ne fait que déclencher

**Contexte.** La mesure quotidienne a besoin de trois choses à la fois : la base
(`@tiktrends/db`), le connecteur Meta (`@tiktrends/integrations`) et le moteur pur
(`@tiktrends/core`). Seules les deux applications réunissent les trois · aucun
package ne dépend de `db`, et introduire cette arête pour un seul fichier aurait
inversé la couche la plus stable du dépôt.

**Décision.** Le moteur vit dans `apps/web/lib/adsmap-sync.ts`. Le worker garde ce
qu'il sait faire, planifier, et appelle `/api/cron/adsmap` (protégé par
`CRON_SECRET`) par le nom de service Docker `web:3000`.

**Pourquoi pas l'inverse.** Mettre le moteur dans le worker aurait obligé à en
faire une seconde copie pour le bouton « Mesurer maintenant », que quelqu'un
attend à l'écran. Deux copies d'une logique qui décide de VERDICTS finissent par
diverger, et personne ne saurait laquelle a produit le chiffre affiché.

**Conséquence.** Un seul chemin de code produit les verdicts, qu'ils viennent du
cron de 7h ou du bouton. `INTERNAL_APP_URL` permet de pointer ailleurs en
développement.

---

## D15 — Un rattachement ambigu n'est jamais tranché

**Contexte.** Relier une annonce Meta à une ad de la carte est le maillon faible
de tout le module. Trois voies existent : l'identifiant déjà posé, le nom généré
(§8.6), et le repli lot + variante.

**Décision.** Une ambiguïté renvoie `null` et l'ad reste non rattachée. Deux
annonces qui collent aussi bien ne sont jamais départagées, même au hasard.

**Pourquoi.** Un mauvais rattachement ne produit pas une erreur, il produit des
chiffres. Ces chiffres s'affichent dans une interface qui les présente comme
mesurés, alimentent la mémoire de Jarvis et orientent le lot suivant · personne
n'a de raison de les contester. Une ad manquante, elle, se voit : le compte rendu
la nomme.

**Conséquence.** L'identifiant est ÉPINGLÉ dès le premier rattachement réussi
(`ads.external_ids_json`). Le flou n'a lieu qu'une fois, même si l'équipe renomme
l'annonce ensuite.

---

## D16 — Le canvas montre les branches mortes plutôt que de les masquer

**Contexte.** Un graphe qui n'affiche que les nœuds « pleins » est plus propre à
regarder. C'est aussi ce qui le rend inutile : la Table sait déjà dire où en est
un test, et elle le dit mieux.

**Décision.** Le canvas remonte la hiérarchie ENTIÈRE, branches vides comprises,
et marque en pointillé les quatre situations de `findGaps` : désir sans angle,
angle sans concept, concept sans ad, gagnante sans itération.

**Pourquoi ces quatre-là et pas plus.** Toutes se vérifient sans jugement. On
pourrait en inventer d'autres (« ce persona a peu d'angles »), mais un canvas qui
signale partout n'est plus lu nulle part.

**Conséquence.** L'entête nomme UNE priorité, dans l'ordre du rendement : itérer
une gagnante coûte moins cher que produire un concept écrit, qui coûte moins cher
que décliner un angle, qui coûte moins cher qu'ouvrir un désir. Quatre compteurs
alignés se lisent comme un tableau de bord ; une phrase qui dit quoi faire se lit
comme un conseil.

---

## D17 — ADSMAP ne crée rien dans Meta : il produit un brief à recopier

**Contexte.** L'écran de préparation d'un lot génère le nom de campagne, les noms
d'ad sets et les noms d'annonces attendus. L'API Marketing permettrait de créer
directement campagne, ad sets et annonces.

**Décision.** On s'arrête au brief. Rien n'est écrit dans le compte publicitaire.

**Pourquoi.** Créer des campagnes par API exige une permission d'ÉCRITURE sur le
compte publicitaire du client. C'est un cran d'engagement qu'aucun client ne
donne à la légère, et une catégorie de panne entière — une campagne créée en
double, un budget mal posé — que le produit n'a aucune raison d'assumer pour
économiser deux minutes de copier-coller.

**Conséquence.** Le rattachement des métriques repose sur le NOM, donc sur la
qualité de `buildName`. C'est pour cela que la génération est l'exact inverse du
parser, testée en aller-retour : un nom que le parser ne relit pas rend l'ad
invisible à la mesure, et la panne ne se voit qu'à la synchro suivante.

---

## D18 — Le budget est confronté au seuil de conclusion AVANT le lancement

**Contexte.** Le moteur de verdict exige `minSpendMultiple × targetCpa` de
dépense avant de conclure sur le CPA. Rien ne vérifiait, au moment de composer un
lot, que le budget prévu permettrait d'y arriver.

**Décision.** L'écran de lot calcule `budget/jour × durée` et le compare au seuil.
S'il est insuffisant, il dit de combien, et propose les deux corrections (monter
le budget, ou allonger la fenêtre).

**Pourquoi.** C'est l'erreur la plus coûteuse du module et la plus silencieuse :
un lot sous-financé dépense son budget en entier, puis rend sept jours plus tard
une colonne de « non concluant ». L'argent est parti, et rien n'a été appris.

---

## D19 — La vue client filtre en SQL, pas à l'affichage

**Contexte.** `/c/[token]` est une page publique : ce qui en sort part chez
quelqu'un qui n'est pas dans l'espace de travail, et un lien se transfère. On ne
sait pas qui le lira.

**Décision.** Les colonnes sensibles ne sont pas masquées au rendu · elles ne
sont **jamais lues**. `clientViewByToken` ne sélectionne ni dépense, ni CPA, ni
budget, ni hypothèse, ni apprentissage, et ne remonte que les verdicts dont le
statut est `validated`.

**Pourquoi.** Masquer à l'affichage laisse les valeurs voyager jusqu'au
navigateur, où elles restent lisibles. La sélection SQL est la seule frontière
qui tienne.

**Les trois exclusions, chacune pour sa raison.** Dépense, CPA et budget : la
marge de l'agence s'y lit. Hypothèses et apprentissages : c'est la méthode,
c'est-à-dire ce que le client paie · la montrer intégralement revient à la
donner. Verdicts non arbitrés : un chiffre provisoire ferait discuter une
conclusion qui n'est pas encore prise.

**Deux détails qui comptent.** Un jeton inconnu et un jeton expiré donnent la
même réponse — distinguer les deux n'aiderait qu'à savoir qu'un lien a existé.
Et une échéance est posée d'office : un lien sans date traîne dans un fil de
messages et finit par montrer à un ancien client ce que fait l'agence
aujourd'hui. L'oubli est le mode de fuite le plus courant, et il ne demande
aucune malveillance.

---

## D20 — La file de décisions est recalculée, jamais accumulée

**Contexte.** Le module produit maintenant des verdicts, des contrôles de
protocole, un graphe avec ses branches mortes. Le risque n'est plus de manquer
d'information mais d'en avoir trop · une table de trois cents lignes lue tous les
matins finit par n'être plus lue du tout.

**Décision.** La file est **recalculée** à chaque mesure. Une décision dont
l'objet a disparu (l'ad a été coupée, le verdict arbitré) est supprimée, pas
marquée close.

**Pourquoi.** Une file qui garde des tâches devenues sans objet cesse d'être lue
plus vite qu'une table · le premier réflexe devient de la parcourir en diagonale
pour trier le mort du vivant, et c'est exactement ce qu'elle devait éviter.

**L'exception.** Ce qu'un humain a explicitement écarté (`dismissed`) n'est
jamais reproposé. « Je l'ai fait » et « ce n'est pas un problème » n'appellent
pas le même comportement demain, d'où deux boutons distincts et non un.

**Trois règles de contenu.** Chaque décision dit ce qu'elle COÛTE, pas ce qu'elle
est — « verdict à arbitrer » n'est pas une raison d'ouvrir l'outil, « 340 €
dépensés dont personne n'a rien appris » en est une. L'ordre suit l'argent, pas
la chronologie. Et chaque type est plafonné : trente décisions du même genre ne
sont pas trente décisions, c'est une seule, et le reste repousse les autres hors
de l'écran.

**Où elle se calcule.** Dans `lib/decisions.ts`, pas dans l'action serveur : la
synchro nocturne doit pouvoir la rafraîchir sans session. Une file recalculée
seulement quand quelqu'un ouvre l'écran arriverait toujours en retard sur la
mesure · or c'est la mesure qui la remplit.

---

## D21 — Les agents proposent nœud par nœud, jamais la carte entière

**Contexte.** A1 à A3 pourraient descendre l'arbre tout seuls : trois avatars,
quatre désirs chacun, quatre angles par désir, trois concepts par angle. Un
bouton « générer la carte » produirait cent cinquante nœuds en un clic.

**Décision.** On ne propose de descendre qu'à partir d'un nœud choisi.

**Pourquoi.** Cent cinquante nœuds ne sont pas relus. Une carte non relue vaut
moins qu'une carte vide : elle donne l'illusion d'un travail de stratégie, et
l'équipe teste ensuite des angles que personne n'a jamais assumés. Le coût du
clic supplémentaire est le prix de la relecture.

**Conséquence.** Tout entre en `proposed`, et le compte rendu dit ce qui a été
ÉCARTÉ autant que ce qui a été créé. Un agent relancé propose les mêmes désirs ·
afficher « 4 propositions » dont 3 sont des jumeaux le ferait passer pour plus
productif qu'il n'est.

---

## D22 — Un angle sans mécanisme reconnu est rejeté, pas complété

**Contexte.** La normalisation des sorties d'agents suit la même discipline que
celle d'A0 : liste fermée, synonymes connus, `null` sur l'inconnu.

**Décision.** Exception pour le mécanisme d'un angle : l'angle est REJETÉ, et son
libellé affiché.

**Pourquoi.** Le mécanisme est ce qui rend un angle comparable à un autre · c'est
la dimension sur laquelle Jarvis apprend. Un angle qui n'en porte pas n'est pas
une proposition incomplète, c'est une phrase sans contenu testable. Lui attribuer
un mécanisme par défaut le ferait entrer dans les statistiques sous une étiquette
que personne n'a choisie.

---

## D23 — Plafond de dépense RÉELLE, appliqué au client, sans exception

**Contexte.** Le dépôt appelle Anthropic depuis une trentaine d'endroits et fal
depuis cinq. Le système de crédits existant est une comptabilité INTERNE : ce
qu'on facture au client. Rien ne bornait les dollars qui partent vraiment et qui
arrivent sur une facture.

**Décision.** Un plafond dur en dollars (`AI_SPEND_CAP_USD`, **10 par défaut**),
sur 30 jours glissants. Au-delà, aucune requête payante ne part.

**Où il s'applique.** Sur le CLIENT Anthropic lui-même (`guardedAnthropic`), pas
à chaque appel. Un garde qu'il faut penser à invoquer finit toujours par être
oublié au trente-sixième point d'appel · et c'est celui-là qui fait la facture.
Un test lit le dossier et échoue si quelqu'un réintroduit un chemin direct.

**Trois règles.**

- **Il s'applique à tout le monde**, comptes fondateur compris. Les crédits sont
  une comptabilité interne, les dollars sont réels · un appel fondateur coûte le
  même prix que les autres.
- **Il refuse, il n'avertit pas.** Un avertissement qu'on peut ignorer n'est pas
  une barrière, c'est ce qui produit les factures qu'on découvre.
- **En cas de doute, il refuse.** Modèle inconnu → tarif le plus cher connu.
  Base injoignable → blocage. Réponse sans `usage` → on compte l'estimation.
  Sous-estimer perce le plafond ; surestimer refuse un appel un peu tôt · le
  déséquilibre entre les deux erreurs commande le choix.

**Réconciliation.** On estime AVANT (prompt + `max_tokens`, au pire), on
enregistre le coût RÉEL après, lu dans `usage`. Sans le second temps le compteur
dérive et le plafond ne veut plus rien dire.

---

## D24 — Sur le marché, la persistance remplace le verdict

**Contexte.** Jarvis apprend des verdicts de la marque · sur les créas des
concurrents, on n'a AUCUN chiffre de performance. Ni CPA, ni conversion, rien.

**Décision.** On prend la **persistance** comme proxy : une créa qui tourne
encore après trois semaines, ou dont la portée progresse, est « éprouvée ».
Jamais « gagnante ».

**Pourquoi ça tient.** Personne ne finance longtemps une créa qui perd. La
reconduction d'une pub au-delà de trois semaines est une DÉCISION de l'annonceur,
pas un lancement · c'est le seul signal que personne ne peut truquer.

**Pourquoi c'est dangereux et comment c'est tenu.** Un pourcentage à côté d'un
autre pourcentage se lit comme une comparaison de performances. Trois
protections : le vocabulaire (« part d'usage », jamais « taux de réussite »), un
avertissement explicite dans le bloc injecté au modèle, et le même dans l'écran.
Sans ces phrases, « 70 % du marché » devient « 70 % de réussite » à la lecture,
et toute la prudence du module disparaît au moment de s'en servir.

**Deux seuils.** Trois créas minimum par valeur, et **deux annonceurs
distincts** · trois créas du même annonceur ne font pas un marché, elles font une
marque.

---

## D25 — La mémoire mesurée passe devant la mémoire marché

**Contexte.** Jarvis reçoit maintenant deux blocs : ce que la marque a mesuré, et
ce que fait le marché.

**Décision.** Le bloc mesuré est injecté EN PREMIER, à l'écran comme dans le
prompt. Et la sortie la plus utile n'est aucun des deux blocs pris seul, mais
leur CONFRONTATION.

**Pourquoi.** Un modèle lit dans l'ordre où on lui donne. Mettre le marché en
tête ferait suivre la mode aux dépens de ce que la marque a payé pour apprendre.

**Ce que la confrontation produit.** Trois cas, et le plus précieux n'est pas
celui qu'on croit :
- *contredit* — le marché fait X, nos chiffres disent que X perd ici. Affiché en
  premier · c'est ce qui évite de dépenser à côté.
- *inexploité* — pratique majoritaire jamais testée chez nous. Le coût d'entrée a
  déjà été payé par d'autres.
- *confirmé* — les deux concordent.

---

## D26 — Jarvis écrit à partir d'exemples, pas de catégories

**Contexte.** L'agent A0 relève les mots EXACTS de chaque accroche (`hookSpoken`)
depuis le premier jour, chez nous comme chez les concurrents. Personne ne les
relisait : Jarvis raisonnait sur des catégories (« accroche chiffrée »).

**Décision.** Une bibliothèque d'accroches, injectée dans chaque génération, avec
les phrases telles quelles et ce qu'elles ont donné.

**Pourquoi.** « 3 erreurs que tu fais avec ta crème » se réécrit ; « accroche
chiffrée » se contemple. Personne n'a jamais écrit une publicité à partir d'une
catégorie. C'est la donnée la plus directement utile du module, et elle dormait.

**Quatre niveaux de preuve, pas trois.** `proven` (a gagné ici), `refuted` (a
perdu ici), `untested`, `market`. Distinguer « jamais testée » de « testée et
perdante » est ce qui empêche de reproposer éternellement ce qui a déjà échoué.
Une accroche relevée deux fois avec deux issues garde la MEILLEURE preuve : c'est
l'existence du succès qui informe, pas sa fréquence.

---

## D27 — Une accroche de concurrent ne se recopie jamais

**Contexte.** La bibliothèque contient des accroches de concurrents. Tendre des
phrases toutes faites à un générateur est le moyen le plus sûr de les voir
ressortir telles quelles.

**Décision.** Le bloc injecté porte une **interdiction explicite** de recopier,
même partiellement, et demande la MÉCANIQUE de la phrase — ce qui accroche,
pourquoi ça retient — pas ses mots.

**Pourquoi.** Reprendre le vocabulaire exact d'un concurrent, c'est diffuser sa
publicité sous notre marque. Le risque n'est pas théorique : c'est le
comportement par défaut d'un modèle à qui on donne des exemples sans consigne.

**Et une seconde protection.** Ces accroches ne sont jamais présentées comme
efficaces · on sait seulement que leur annonceur continue de les payer. Le bloc
le dit avant de les lister, dans les mêmes termes que la mémoire marché (D24).

---

## D28 — On mesure si la mémoire aide, pas quelle accroche a produit quoi

**Contexte.** On pourrait vouloir savoir QUELLE accroche injectée a produit la
gagnante. On ne peut pas : on tend huit exemples au modèle, il sort une créa, et
rien ne dit lequel l'a inspirée.

**Décision.** On compare deux GROUPES : les créas générées avec la mémoire et
celles générées sans. C'est la question honnête, elle se mesure, et elle répond
exactement à « est-ce que notre IA est meilleure ».

**Deux garde-fous.** Un effectif minimal par groupe (6, plus haut que le seuil
par dimension parce qu'on compare deux taux), et des intervalles de Wilson
DISJOINTS. Si les intervalles se chevauchent, l'écart observé ne prouve rien et
l'écran le dit.

**Ce qu'on ne prétend pas.** Ce n'est pas une expérience contrôlée : le groupe
témoin est historiquement plus ancien, et une marque qui progresse progresserait
de toute façon. L'écran porte cette réserve.

**Le cas qu'on n'a pas envie de voir.** Si la mémoire fait PERDRE, le résumé le
dit franchement. Un outil qui ne peut pas se contredire lui-même n'apprend pas,
il accumule.

**Consigné au moment de générer.** `input.memoryUse` porte ce que Jarvis a donné
ce jour-là · le reconstruire après coup est impossible, la mémoire ayant changé
depuis.

---

## D29 — La transcription est un enrichissement, jamais une dépendance

**Contexte.** Sans transcription, A0 DEVINE l'accroche d'une créa concurrente
depuis une vignette et la copy. Avec, il lit les mots prononcés. L'écart de
fiabilité est considérable · mais le contrat exact de l'endpoint Trendtrack n'a
pas pu être vérifié (documentation injoignable depuis l'environnement de
développement).

**Décision.** Implémentation défensive : plusieurs chemins plausibles essayés
dans l'ordre, le premier qui répond est mémorisé, et **`null` en cas d'échec —
jamais d'exception**.

**Pourquoi.** Faire échouer tout un lot d'analyse parce qu'une transcription
manque, ce serait échanger une dégradation contre une panne. Un refus d'accès
(401/403) arrête définitivement les tentatives · insister créerait du bruit et
consommerait du quota pour rien.

**Et on le DIT.** Quand l'endpoint ne répond pas, le compte rendu précise que les
accroches sont déduites du visuel et non des mots prononcés. La différence de
fiabilité est trop grande pour rester implicite.
