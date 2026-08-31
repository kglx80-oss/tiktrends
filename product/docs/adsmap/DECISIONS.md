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

---

## D30 — Une accroche déjà réfutée l'emporte sur tout le reste

**Contexte.** `prelaunchScore` situait un concept sur les statistiques par
dimension : mécanisme, format, type d'accroche. C'est utile, et c'est abstrait.
Il ignorait les deux mémoires les plus concrètes qu'on ait accumulées · la
bibliothèque d'accroches, qui sait qu'une phrase précise a déjà perdu, et le
marché, qui sait ce que font les concurrents qui tiennent.

**Décision.** Le brief de pré-lancement rapproche l'accroche envisagée de la
bibliothèque (indice de Jaccard sur les empreintes, seuil 0,6) et, si elle a
déjà été réfutée, la recommandation passe à `stop` quel que soit le profil
statistique.

**Pourquoi.** Un seul test perdu suffit à le dire · ce n'est pas une
statistique, c'est un souvenir, et un souvenir n'a pas besoin d'effectif. Aucun
profil favorable ne rachète le fait de reproposer ce qui vient d'échouer.

**Ce que ça change concrètement.** « Ce concept a un profil défavorable » ne fait
rien changer à personne. « Son accroche est celle qui a perdu deux fois ici »
fait réécrire la ligne. Le premier est un score, le second est une prise.

**Le seuil est grossier, et volontairement.** On ne cherche pas la similarité
sémantique — un modèle ferait mieux et coûterait un appel — mais à repérer qu'on
repropose une phrase déjà écrite avec deux mots changés. À proximité comparable,
c'est l'accroche réfutée qui gagne le rapprochement : c'est l'information la plus
coûteuse à ignorer.

---

## D31 — Le marché ne déplace jamais la bande, il ajoute une remarque

**Contexte.** Le brief lit maintenant trois mémoires : les chiffres mesurés de la
marque, la bibliothèque d'accroches, et les parts d'usage du marché. Il fallait
trancher laquelle arbitre quand elles se contredisent.

**Décision.** Les parts de marché n'entrent jamais dans le calcul de
`pConclusiveWin` ni dans la bande `low/mid/high`. Elles produisent uniquement des
remarques, y compris celle-ci : « ce concept suit le marché sur X, mais chez toi
cette voie réussit moins que la moyenne ».

**Pourquoi.** Ce qu'on a payé pour apprendre vaut mieux que ce qu'on devine des
autres (D25). Une part d'usage n'est pas un taux de réussite · on voit ce que les
concurrents diffusent, jamais ce que ça leur rapporte. Laisser une part d'usage
corriger un chiffre mesuré, ce serait remplacer une mesure par une rumeur.

**Le cas utile quand même.** Quand une voie pèse lourd sur le marché et qu'on ne
l'a jamais assez testée, c'est signalé comme piste · d'autres en ont déjà payé
l'entrée. C'est une information, pas une instruction.

---

## D32 — Un profil sans historique est un inconnu, pas un mauvais profil

**Contexte.** Une marque qui démarre n'a aucune statistique par dimension. Un
score calculé sur trois ads a l'air d'un score.

**Décision.** Quand l'historique est trop mince, la recommandation est `unknown`
et le résumé dit que c'est une raison de tester, pas d'écarter. Et quand aucune
accroche n'a été fournie, le brief le dit aussi : c'est la principale raison pour
laquelle son avis reste vague.

**Pourquoi.** Un score calculé sur rien est plus dangereux qu'une absence de
score, parce qu'il a l'air d'un score. Bloquer une marque neuve sur son propre
manque de données, ce serait lui reprocher de commencer.

---

## D33 — Ce qu'une étape franchie prouve ne se retouche pas

**Contexte.** La carte savait dire « cette gagnante n'a jamais été itérée ». Elle
ne proposait rien · l'utilisateur devait refaire le raisonnement que la mesure
venait pourtant de faire à sa place. Et le réflexe, quand une créa ne convertit
pas, est de tout refaire : le hook, le montage, la voix, l'offre. On rebrûle un
budget de test pour n'apprendre rien, puisque plus personne ne sait à quoi
attribuer le résultat.

**Décision.** Le tunnel est ordonné, donc le gel est calculable. Une chute au
CONVERT prouve que l'accroche, le montage et l'appel à l'action ont fonctionné ·
ces variables sont gelées, et l'écran affiche « ne touche pas » AVANT d'afficher
quoi changer.

**Pourquoi.** C'est le seul endroit où l'outil apporte ce qu'un humain pressé ne
se donnera pas tout seul. Proposer trois variantes, n'importe qui le fait.
Dire lesquelles des réponses déjà payées on est en train de jeter, non.

**Corollaire mécanique.** Si tout l'amont est gelé, il ne reste qu'une variable
à changer · c'est exactement la définition d'une itération (§2.4). La contrainte
n'a plus à être rappelée, elle découle du gel.

---

## D34 — Un coût trop élevé désigne l'offre, jamais le montage

**Contexte.** Une ad dont le tunnel passe entièrement mais dont le CPA dérape
déclenche `killFlag = 'cost'`. Le réflexe est de refaire la créa.

**Décision.** Dans ce cas précis, la suite proposée vise l'offre, en priorité 0.

**Pourquoi.** Refaire la vidéo ne changera pas le prix de l'acquisition. Le
tunnel a fait son travail · c'est l'économie qui ne suit pas. C'est aussi le
correctif le moins cher à produire : une page ou un prix, pas un tournage.

---

## D35 — On n'hérite pas d'un échec, mais on ne se prive pas du conseil

**Contexte.** `checkIteration` interdit d'itérer sur une perdante · une arête de
filiation exige un parent gagnant, et c'est juste : repartir d'un perdant
reproduit ce qui n'a pas marché. Mais « corriger l'offre d'une créa qui a prouvé
son hook » reste la meilleure action possible du compte.

**Décision.** La proposition est affichée quand même, avec la mention qu'elle
s'enregistrera en NOUVEAU concept et sans arête. L'ad naît en `adType: 'new'`,
et l'offre ou la page n'est pas héritée quand c'est précisément ce qu'on change.

**Pourquoi.** Le conseil est le même, et la comptabilité du graphe reste
honnête. Contourner l'invariant aurait pollué la filiation ; renoncer au conseil
aurait privé l'utilisateur de l'action la plus rentable.

**La lignée a une mémoire.** On remonte la filiation pour savoir ce qui a déjà
été essayé · deux essais sur la même variable est un test, trois est une
habitude. Au-delà, la suite proposée devient « change d'angle » · le problème
n'est probablement plus la créa.

---

## D36 — La naissance d'une pub ne dit rien, sa survie oui

**Contexte.** Le suivi de marques existait : chaque nuit on rescanne les
concurrents et on signale les pubs jamais vues. « 4 nouvelles pubs chez tes
concurrents. »

**Le problème.** La plupart des créas meurent en une semaine. Un annonceur qui
en lance dix n'a rien prouvé · il a dépensé. Signaler des naissances produit une
alerte quotidienne dont le taux d'information est proche de zéro, et une alerte
qu'on n'ouvre plus est pire qu'une absence d'alerte : elle occupe la place.

**Décision.** Le radar signale le **franchissement**, pas la naissance. Trois
seuils, par ordre de force décroissante : 21 jours de diffusion (survie), portée
qui monte encore après 7 jours (croissance), annonceur à plus de 10 annonces
vivantes (phase active, le signal le plus faible).

**Pourquoi.** Une créa encore diffusée après trois semaines est une créa que son
annonceur continue de payer, semaine après semaine, en connaissant ses chiffres.
C'est le seul vote crédible qu'on puisse observer de l'extérieur.

**On le dit une fois.** `reported_at` garantit qu'une créa ne franchit son cap
qu'une seule fois dans le fil. Répéter chaque nuit qu'une pub de trois semaines
est toujours là referait du bruit par un autre chemin.

---

## D37 — Détecter est gratuit, décrire coûte · on sélectionne avant de dépenser

**Contexte.** C'est la première fonction du produit qui dépense en arrière-plan,
sans que personne n'ait cliqué. Une veille nocturne qui décrit tout ce qui bouge
produit une facture proportionnelle au bruit du marché, c'est-à-dire non bornée.

**Décision.** La détection est de l'arithmétique sur des données déjà
récupérées · elle ne coûte rien. Seule la description d'une créa demande un
appel modèle, estimé à **0,02 $** (`claude-sonnet-5`, ~3 800 jetons en entrée,
~450 en sortie), et elle n'est déclenchée que sur la sélection.

**Trois barrières, dans cet ordre.**

1. **Le radar est ÉTEINT par défaut**, et s'arme marque par marque. Une dépense
   qu'on n'a pas déclenchée est une dépense qu'on ne surveille pas.
2. **Un plafond en UNITÉS**, pas en euros. Trois créas par nuit par défaut, soit
   environ 0,06 $. Un plafond en euros se traduit mal en décision (« il reste
   0,03 $, on analyse ou pas ? ») ; un plafond en unités est vérifiable avant de
   dépenser, pas après.
3. **La garde globale des 10 $ sur 30 jours** passe au-dessus de tout · quand
   elle bloque, le passage s'arrête proprement et le dit, au lieu de rater à
   moitié.

**Le coût s'affiche avant l'interrupteur.** Et c'est le PIRE cas qui est montré ·
trente nuits pleines au plafond choisi. Un coût moyen serait plus flatteur et
moins utile : personne ne se fait surprendre par une moyenne.

**L'estimation est arrondie vers le haut.** Une estimation optimiste d'un coût
est fausse dans le seul sens qui fasse mal.

---

## D38 — Largeur avant profondeur · trois créas d'un annonceur suffisent

**Décision.** Au-delà de trois créas décrites pour un même annonceur, il cède la
place à un annonceur qu'on ne connaît pas encore.

**Pourquoi.** Trois créas suffisent à connaître la manière d'une marque. La
quatrième coûte le même prix et n'apprend presque rien · c'est la même règle que
`MIN_ADVERTISERS` côté statistiques de marché (D26) : trois créas d'un seul
annonceur, c'est une marque, pas un marché.

**Et ce qui est écarté est compté.** Le nombre de créas reportées à demain est
affiché · sans lui, on croirait avoir tout vu.

---

## D39 — L'écran qui portait le nom ne savait rien, celui qui savait tout ne le portait pas

**Contexte.** Il y avait deux écrans Jarvis. `/jarvis` était une **brochure** : six
cartes en dur affirmant ce que Jarvis applique, identiques pour tout le monde, y
compris pour une marque sans logo ni produit à qui on annonçait que sa direction
artistique était injectée dans chaque prompt. Et sous `/adsmap/jarvis` vivait
toute la substance — mémoire mesurée, accroches, marché, attribution — rangée
sous la navigation d'un autre module.

**Décision.** Une seule maison, `/jarvis`. L'ancienne route redirige plutôt que
de disparaître · un lien mis en favori qui rend 404 se lit comme une régression,
pas comme un rangement.

**Ce qui remplace la brochure.** Chaque couche dit trois choses : est-ce qu'elle
tourne, sur quel volume, et **le geste exact qui l'allume** quand elle est
éteinte. Sans le troisième, un état « éteint » n'est qu'un reproche.

**Une carte qui décrit une capacité est une promesse. Une carte qui dit qu'elle
est éteinte et pourquoi est un diagnostic.** La différence entre une brochure et
un tableau de bord tient là, et pas ailleurs.

**Ce qu'on ne maquille pas.** Deux couches font partie du prompt de base et ne
dépendent d'aucune donnée · elles sont marquées « toujours actif » plutôt que de
recevoir un compteur flatteur. Un tableau de bord où tout est vert n'est plus lu.

**L'ordre de la page.** L'attribution AVANT la mémoire : un outil qui ne vérifie
pas ses propres règles n'apprend pas, il accumule. Puis ce qu'il sait, puis ce
qu'il coûte, puis les actions · on règle après avoir lu, pas avant.

---

## D40 — Ouvrir un écran ne doit rien ouvrir de plus

**Contexte.** `/jarvis` était réservé au fondateur, et figurait dans la
navigation ADMIN. Deux conséquences, dont une invisible : un membre n'avait aucun
lien vers l'écran, et **y figurer basculait toute la coquille en thème plateforme
interne** dès qu'on l'ouvrait.

**Décision.** Jarvis devient une fonctionnalité cliente du rail (offre `core`),
sort de la navigation ADMIN, et les blocs sensibles restent derrière `isFounder`
à l'intérieur de la page : règles maison, moteurs orchestrés, dépense réelle.

**Le principe.** Rien ne devient visible pour quelqu'un qui ne le voyait pas
déjà. La mémoire mesurée était ouverte aux comptes Plus sous `/adsmap/jarvis` ·
elle l'est ici, au même palier. Un déménagement d'écran qui élargit un accès au
passage est une fuite, pas un rangement.

---

## D41 — Une migration hors journal est un fichier mort

**L'incident.** `0039_radar.sql` a été écrit, relu, commité, déployé · et n'a
jamais tourné. Drizzle applique les migrations listées dans `meta/_journal.json`,
pas les fichiers présents dans le dossier. **Rien n'échoue au déploiement** : la
base reste en arrière, et le défaut n'apparaît que le jour où quelqu'un ouvre
l'écran qui lit la colonne manquante. Cinq écrans sont tombés d'un coup pour
cette seule raison · le radar, Jarvis, et tout ce qui en dépendait.

**Décision.** Un test lit le dossier `drizzle/` et le journal, et échoue dès
qu'un `.sql` n'a pas son entrée. Il vérifie aussi la réciproque (une entrée sans
fichier fait échouer le déploiement) et la croissance des index.

**Pourquoi un test et pas une vigilance.** « Ne pas oublier le journal » n'est pas
une règle applicable · c'est une demande faite à la mémoire de celui qui écrit,
au moment précis où il pense à autre chose. Le seul remède est une vérification
qui ne dépend de personne. Le test a été validé en le faisant échouer sur la
faute réelle avant de la corriger.

---

## D42 — Un voyant de panne ne doit pas faire caler le moteur

**Contexte.** L'écran Jarvis est tombé EN ENTIER parce qu'une colonne manquait.
Une couche sur dix la lisait · les neuf autres n'en avaient pas besoin et
auraient parfaitement pu s'afficher.

**Décision.** `jarvisSnapshot` ne lève plus. Chaque lecture est absorbée
individuellement, journalisée côté serveur, et remplacée par un repli neutre.

**Et on le DIT.** Le résumé passe à « état partiel · une lecture n'a pas abouti,
ce tableau est peut-être en retard sur la réalité ». Absorber en silence serait
pire que planter : on croirait lire un état à jour, et un diagnostic faux est
plus dangereux qu'une absence de diagnostic.

**La règle générale.** Un panneau qui DÉCRIT l'état du système ne doit jamais
être ce qui l'interrompt. C'est vrai de celui-ci, et de tous ceux qui viendront.

---

## D43 — Une carte de cinq cents nœuds ajustée à l'écran n'est pas une carte

**Contexte.** Le canvas dessinait tout le graphe d'un coup. Sur un compte réel —
vingt-neuf lots — cela fait plusieurs centaines de nœuds, que `fitView` écrasait
à huit pour cent de zoom. On voyait qu'il y avait quelque chose, sans pouvoir
rien lire. Retour d'usage textuel : « pas exploitable, pas lisible ».

**Le remède qu'on n'a PAS pris.** Améliorer le zoom. C'est traiter le symptôme ·
zoomer dans une texture donne un fragment de texture, sans savoir où l'on est.

**Décision.** Montrer moins par défaut.

1. **Les ads sont repliées.** L'ossature stratégique — avatar, désir, angle —
   tient en quelques dizaines de nœuds ; ce sont les ads qui font le nombre. Un
   angle replié **porte son décompte** (concepts, ads, gagnantes), donc rien
   n'est caché : on sait ce qu'il y a derrière avant de l'ouvrir. Replier sans
   compter serait cacher.
2. **Un filtre par avatar.** Le graphe est une forêt, un arbre par avatar · les
   lire ensemble n'apporte rien qu'aucun des deux ne dise mieux seul.
3. **Le cadrage suit ce qu'on ouvre.** Déplier sans recadrer laisse le contenu
   hors de l'écran, et l'utilisateur conclut que son clic n'a rien fait.

**Le zoom minimal passe de 0,08 à 0,3.** En dessous, plus rien n'est lisible ·
autoriser plus bas n'offrait que la possibilité de se perdre.

**Les décomptes sont calculés sur le graphe COMPLET**, pas sur ce qui est
affiché · un décompte qui ne compterait que le visible serait faux exactement
au moment où il sert, c'est-à-dire quand la branche est fermée.

---

## D44 — Un bloc qui n'a rien à répondre le dit, il ne s'évapore pas

**Contexte.** Le bloc d'attribution ne s'affichait que si la lecture avait
abouti. En cas d'échec il disparaissait sans un mot · l'utilisateur cherchant
« l'attribution » ne trouvait rien et ne pouvait pas distinguer « absent » de
« vide » de « en panne ».

**Décision.** Le bloc est toujours rendu dès que la mémoire est accessible. Trois
états explicites : l'erreur telle quelle, le manque de données avec **ce qu'il
faudrait pour répondre** (six tests arbitrés par groupe, et combien on en a), ou
le résultat.

**Et il porte son nom.** Une étiquette « Attribution » à côté du titre ·
« Est-ce que Jarvis améliore vraiment les résultats ? » dit ce que ça fait, pas
comment ça s'appelle, et on cherche par le nom.

**La règle, deux fois dans la même semaine.** C'est le pendant de D42 : un
panneau qui décrit l'état du système ne doit ni l'interrompre, ni disparaître
quand il échoue. « Pas assez de données » est une réponse ; le silence n'en est
pas une.

---

## D45 — Un lien mort ne doit pas coûter la moitié de la mémoire

**Le constat.** La mémoire de Jarvis a huit dimensions. Quatre se déduisent du
graphe et se remplissent dès l'import · mécanisme, format, stade de conscience,
avatar. Les quatre autres — type d'accroche, ouverture, talent, durée — **et
toute la bibliothèque d'accroches** viennent de la description de l'asset.

Or sur un historique importé, l'asset est un lien Drive. Le modèle ne peut pas
l'ouvrir · l'appel échouait, l'ad était écartée, et la moitié la plus riche de la
mémoire restait vide pour toujours. Vingt-neuf lots de tests payés, inexploités.

**Décision.** Deux corrections.

1. **On ne donne au modèle qu'une adresse qu'il peut ouvrir.** Une liste courte
   d'hôtes qui servent une page et jamais un fichier. Volontairement courte : on
   refuse ce dont on est sûr, et on tente le reste, parce que beaucoup de CDN
   servent des images sans extension. Un lien qui échoue coûte un aller-retour ;
   un lien rejeté à tort ne se voit jamais.
2. **Un dossier écrit sert de repli.** Hypothèse du test, variable changée,
   titre du concept, accroche de l'angle, apprentissages retenus · de la prose
   qui décrit la pub, déjà en base. Le repli est automatique et par ad, jamais
   global.

**L'en-tête du dossier est la partie qui compte.** Sans lui, le modèle décrit des
plans, des coupes et des sous-titres qu'il n'a jamais vus · il ne ment pas, il
comble. Lui dire en toutes lettres qu'il ne voit pas la créa et lui interdire
nommément les champs visuels transforme une invention en abstention. Une case
vide se complète plus tard, une case inventée fausse une statistique pour
toujours.

**Deux champs minimum.** Un titre de concept nomme une publicité, il ne la décrit
pas · en dessous, refuser est le service rendu.

---

## D46 — Une mémoire doit savoir d'où elle tient ce qu'elle sait

**Contexte.** Une description tirée d'un brief et une description lue sur la
vidéo remplissent les mêmes colonnes. Les confondre serait commode.

**Décision.** La provenance est enregistrée (`analysisModel` suffixé `:texte`),
la confiance est plafonnée à 0,6, et l'écran l'affiche · « déduite du brief »
contre « lue sur la créa ».

**Pourquoi.** Le brief dit ce qu'on VOULAIT faire, le fichier dit ce qui a été
fait, et l'écart entre les deux est précisément ce qui fait rater un test. Une
mémoire qui ne sait plus d'où elle tient ce qu'elle sait finit par se tromper
avec assurance.

---

## D47 — Le prix s'affiche avant le bouton, en dollars

**Contexte.** Décrire un historique complet est la première action du produit
dont le coût se compte en dollars et non en centimes · plusieurs centaines d'ads.

**Décision.** Le panneau annonce le coût de la tranche ET le coût de la
totalité, avant le clic, avec la répartition entre ce qui sera lu sur l'asset
(0,02 $) et ce qui sera déduit du brief (0,013 $, une vignette pesant près de la
moitié des jetons d'entrée).

**Et le décompte ne promet que ce qui aura lieu.** Les ads restantes sont
réparties selon ce qu'on pourra RÉELLEMENT lire · annoncer qu'on va décrire des
liens Drive serait annoncer un travail qui n'arrivera pas.

**La distinction qu'on maintient.** Les crédits sont une comptabilité interne,
les dollars sont réels et s'imputent sur le plafond global. Les deux sont
affichés, jamais confondus.

---

## D48 — Une conversation est la seule interface qui n'exige pas de savoir où chercher

**Contexte.** Mémoire mesurée, bibliothèque d'accroches, parts de marché,
attribution, suites, radar, brief de pré-lancement · sept surfaces, chacune
répondant bien à SA question. À condition de savoir laquelle poser, et où.

**Décision.** Un espace de conversation, en haut de `/jarvis` et en grand, avant
le tableau de bord.

**Pourquoi.** Il ne remplace aucun écran · il ouvre une porte à celui qui ne sait
pas encore ce qu'il cherche. C'est le seul point d'entrée qui ne suppose pas déjà
la connaissance du produit.

---

## D49 — Jarvis cite les chiffres de la marque, ou il admet qu'il n'en a pas

**Le risque.** Un modèle sans mémoire répond des choses vraies et inutiles :
« teste plusieurs accroches », « soigne les trois premières secondes ». C'est du
conseil d'article de blog · aucune décision n'en sort, et ça décrédibilise tout
le reste de l'outil.

**Décision.** Une règle qui prime sur toutes les autres, écrite en toutes lettres
dans la consigne : citer avec l'effectif, ou dire qu'on ne sait pas. **Il n'y a
pas de troisième option**, et surtout pas celle de meubler avec de la culture
générale présentée comme un constat sur la marque.

**Ce qui est interdit nommément.** Le conseil de blog (avec ses exemples), la
liste de dix idées, la flatterie. Un interdit abstrait ne se respecte pas · il
faut nommer ce qu'on ne veut pas voir.

**Et le droit de contredire est explicite.** On ne consulte pas quelqu'un pour
s'entendre dire oui. Quand la mémoire contredit l'intention, la consigne demande
de commencer par la contradiction, chiffre à l'appui, avant toute nuance.

**La prudence est réglée sur l'effectif réel.** Zéro test mesuré, moins de dix,
moins de quarante, au-delà · quatre tons distincts. Trois tests ne font pas une
loi, et l'oublier est la façon la plus rapide de transformer une mémoire en
superstition.

---

## D50 — La consigne se recompose à chaque tour, jamais ne se stocke

**Décision.** Le fil garde les messages, pas la consigne système. Elle est
rebâtie depuis la mémoire vivante à chaque réponse.

**Pourquoi.** La mémoire bouge · un verdict arbitré, une créa décrite, une
accroche réfutée. Une consigne figée ferait répondre Jarvis avec les chiffres
d'avant-hier, sans que rien ne l'indique. Un outil dont on ne peut pas dater le
savoir est pire qu'un outil ignorant.

---

## D51 — Le flux passe par le garde de dépense, il ne le contourne pas

**Contexte.** Six secondes d'écran muet ne se lisent pas comme de la réflexion ·
elles se lisent comme une panne, on reclique, et on double la dépense. Le flux
était donc nécessaire. Mais `guardedAnthropic` ne connaissait que les réponses
complètes.

**Décision.** Le garde a été ÉTENDU plutôt que contourné. En mode flux, les
jetons d'entrée sont relevés sur `message_start`, ceux de sortie sur le
`message_delta` final, et la dépense est écrite dans un `finally` · y compris
quand la connexion se coupe en route.

**Pourquoi pas une exception.** Un plafond avec une porte dérobée n'est pas un
plafond. Et un flux coupé avant le premier événement ne compte pas pour zéro :
l'estimation prend le relais, comme sur le chemin normal.

---

## D52 — Huit univers écrits en dur n'est pas une direction artistique

**Le constat.** Le Studio Pubs composait ses visuels à partir de huit « univers
visuels » écrits en dur, en anglais, dans notre code. On pouvait en CHOISIR un ·
jamais en écrire un. Le champ de texte libre du Studio Image existait, mais
déconnecté de la chaîne pubs : ni marque, ni mémoire, ni concept.

**Pourquoi c'est plus grave qu'un manque de confort.** Une agence qui a mis des
années à trouver sa manière de filmer ne va pas l'abandonner parce que notre menu
ne la contient pas. Et partant de rien, le premier geste devrait être « voici
comment JE veux que ça ressemble » · il était impossible.

**Décision.** Des prompts maison, nommés, réutilisables, disponibles dans le
Studio à côté des huit univers d'origine — qui restent, comme point de départ
copiable. Partir d'une page blanche pour écrire une direction artistique est
décourageant ; partir d'un exemple qui tient ne l'est pas.

---

## D53 — Un prompt nommé devient une hypothèse, pas un goût

**Ce qui distingue ça d'un champ de texte.** Un prompt tapé une fois produit une
image et disparaît. Nommé et rattaché aux créas qu'il produit, il devient
mesurable · on finit par savoir combien de tests il a nourris et combien ont
gagné.

**« Mon univers sombre : 3 gagnantes sur 9 tests tranchés » est une phrase
qu'aucun générateur d'images ne sait dire.** C'est là qu'est la valeur, et c'est
ce qui rattache la fonction au but du produit : trouver plus vite des créas qui
gagnent, par hypothèses et itérations.

**On ne pose pas un second pont.** Le rattachement vit dans `generations.input`,
comme la trace de mémoire, et se relit par le chemin `concepts.source_ref →
generationId` que l'attribution utilise déjà. Deux chemins finiraient par donner
deux chiffres, et personne ne saurait lequel croire.

**Le seuil est le même que partout.** Sous trois tests tranchés, on affiche
l'usage et surtout pas un taux · un preset utilisé trois fois n'a rien prouvé.

---

## D54 — Le concept dit quoi montrer, le prompt dit comment

**Décision.** Dans le prompt final, la scène issue du concept vient AVANT le
prompt maison, et les exclusions ferment la consigne.

**Pourquoi.** Inverser ferait dériver le sujet vers le style · on obtiendrait de
belles images qui ne racontent plus la publicité. Et un moteur qui ignore les
exclusions n'est pas gêné de les trouver en fin de prompt, là où un moteur qui
les lit les retient mieux.

**Un prompt maison l'emporte sur les univers fournis.** C'est la direction
artistique de la marque · elle ne se fait pas alterner avec la nôtre.

**Refus d'un prompt trop court.** Sous vingt caractères, « beau » ou « pro » ne
change pas une image · ça donne l'impression d'avoir réglé quelque chose, ce qui
est pire que de n'avoir rien réglé.

**Archivé, jamais supprimé.** Les créas produites pointent encore dessus, et un
bilan qui perd son intitulé devient illisible six mois plus tard.

---

## D55 — Trois sources pour une seule vérité, c'est trois vérités

**L'état des lieux.** La navigation était écrite à trois endroits qui avaient
déjà divergé : `FEATURES` pour le rail, une barre de sept boutons codée en dur
en haut d'ADSMAP, et **vingt et un liens « ‹ Retour » écrits à la main**, page
par page, chacun à sa façon.

Résultat observable : ADSMAP exposait six sous-écrans dans sa barre et **aucun**
dans le rail ; Studio faisait exactement l'inverse. Personne n'avait décidé ça ·
c'est arrivé.

**Décision.** Une carte unique (`lib/navigation.ts`) déclare chaque écran, son
libellé, son parent et sa section. Le fil d'Ariane en dérive · le rail et les
sous-navigations en dériveront (étape suivante).

**Le garde qui empêche la dérive de revenir.** Un test lit le dossier des pages
et échoue si une route n'est pas déclarée. Même leçon que le journal de
migrations (D41) : « ne pas oublier » n'est pas une règle applicable, seule une
vérification qui ne dépend de personne tient dans la durée.

---

## D56 — Un fil d'Ariane n'est pas un bouton retour

**Ce que les vingt et un liens faisaient.** Ils répondaient à « comment je sors
d'ici ». C'est la question facile, et le navigateur y répondait déjà.

**Ce à quoi personne ne pouvait répondre**, sur un produit à trois niveaux :
« où suis-je, et qu'est-ce qui contient cet écran ? ». Un chemin complet y
répond · une flèche vers le parent, non.

**Rendu une seule fois, dans la coquille.** Une page nouvelle l'obtient sans
rien écrire, et surtout ne peut pas l'écrire autrement. Vingt et une occasions
de diverger deviennent zéro.

**Ce qu'il n'affiche pas.** Rien, sur une racine de section. « Espace › Membres »
au-dessus de l'écran Membres occupe une ligne et n'apprend rien · le rail dit
déjà où l'on est. Le fil sert quand on est DESCENDU quelque part.

**La marque fait partie de l'adresse.** Tout ici est par marque : la carte, la
mémoire, les lots, les prompts. « ADSMAP › Radar de veille » sans nom de marque
décrit un écran qui n'existe pas · le fil affiche donc « Analyse › TrueFords ›
ADSMAP › Radar de veille ». C'est la seule exception à la règle du dessus : sur
une racine par marque, le contexte manquerait vraiment.

**Le dernier maillon n'est jamais un lien.** Un lien vers soi-même est une
promesse de mouvement qui n'aboutit pas.

---

## D57 — À longueur égale, le littéral l'emporte sur le dynamique

**Le piège.** `/brands/new` et `/brands/[id]` ont la même forme. Sans règle,
l'écran de création de marque s'annoncerait comme une marque, portant le nom de
la marque active dans son propre fil.

**Décision.** Les candidats sont triés par nombre de segments dynamiques
croissant · un motif entièrement littéral gagne toujours.

**Et un segment dynamique peut se nommer tout seul.** Sur
`/brands/[id]/competitors/[name]`, le nom du concurrent est dans l'URL · on le
décode plutôt que d'afficher « Concurrent ». C'est le DERNIER segment dynamique
qu'on lit, pas le premier : sur ce chemin, c'est le concurrent qu'on nomme, pas
la marque qui le contient.

---

## D58 — Le rail suit la boucle de travail, pas l'ordre d'arrivée des fonctionnalités

**Le constat.** « Analyse » et « Création » dataient d'avant les modules récents.
Jarvis était rangé dans Création alors qu'il est le cerveau ; Adsmap dans Analyse
alors qu'il pilote des tests. Personne n'avait choisi ce classement · il avait
simplement absorbé chaque nouveauté là où il y avait de la place.

**Décision.** Quatre groupes qui se lisent de haut en bas comme on travaille :

| Groupe | Ce qu'on y fait |
|---|---|
| **Piloter** | où on en est · Dashboard, Analytics |
| **Trouver** | ce que fait le marché · Veille, Ce qui scale, Sauvegardes, Tagging, Radar produits |
| **Créer** | Jarvis d'abord, puis Studio et ses quatre écrans, Assets |
| **Tester** | Adsmap et ses cinq sous-écrans |

**Jarvis ouvre « Créer ».** Ce n'est plus une fonctionnalité parmi d'autres ·
depuis qu'on lui parle, c'est la porte d'entrée de tout le reste.

---

## D59 — Deux entrées du même nom obligent à cliquer pour savoir laquelle

**Le défaut.** `/radar` (produits qui montent) et `/adsmap/radar` (veille
nocturne sur les concurrents) s'appelaient tous les deux « Radar ». Même mot,
deux choses sans rapport, dans deux groupes différents.

**Décision.** « Radar produits » et « Radar de veille ». Et un test refuse
désormais tout libellé de rail apparaissant deux fois · c'est le genre de
collision qui ne se voit pas à l'écriture et coûte un clic à chaque lecture.

---

## D60 — Une barre de sept boutons n'est plus une navigation

**Le constat.** Le haut d'Adsmap alignait sept boutons : Suites, Radar, Jarvis,
Partager, Lots, Importer, Protocole, Mesurer. Ces six écrans n'existaient nulle
part ailleurs · depuis n'importe quelle autre page du produit, ils étaient
inatteignables.

**Décision.** Les cinq sous-écrans descendent dans le rail, exactement comme
ceux du Studio. Il ne reste en haut de la carte que ce qui **agit** dessus :
mesurer, partager.

**Le principe.** Une barre d'outils saturée cesse d'être lue · et un écran qu'on
ne peut atteindre que depuis un seul autre écran n'est pas dans le produit, il
est dans une annexe.

---

## D61 — Deux listes qui décrivent la même chose finissent par ne plus la décrire pareil

**Contexte.** `FEATURES` (le rail, avec ses rôles et ses offres) et `ROUTES` (le
fil, avec sa hiérarchie) sont deux vues d'une seule arborescence. Les fusionner
mêlerait des permissions à un fil d'Ariane, qui n'en a que faire.

**Décision.** On ne les fusionne pas · on vérifie qu'elles s'accordent. Un test
compare les chemins, les libellés, la filiation, et refuse les doublons de nom.

**Il a servi immédiatement.** Écrit après la refonte, il a échoué du premier
coup : « Importer » dans le rail, « Importer le tableau » dans le fil. Deux noms
pour un même écran, introduits dans le commit qui prétendait justement unifier
la navigation.

---

## D62 — Trois situations, et on les affichait pareil

**Le constat.** Dix-huit états vides écrits à la main, de la phrase grise isolée
(« Aucun ticket. ») à la carte pointillée avec emoji et paragraphe. Même
situation, dix-huit rendus.

Mais surtout : **trois situations différentes rendues à l'identique.**

- `todo` · c'est vide parce qu'il y a quelque chose À FAIRE.
- `wait` · c'est vide et ça se remplira tout seul · les verdicts arrivent avec la
  mesure, les trouvailles avec la nuit. Le dire évite de chercher un bouton qui
  n'existe pas.
- `good` · c'est vide et c'est une BONNE nouvelle. « Rien à décider », « aucun
  incident ». L'afficher dans le même gris qu'un manque est un contresens : on
  annonçait une réussite sur le ton d'un échec.

**Un état vide est le premier écran qu'un nouveau client voit** sur chaque
fonctionnalité. C'est là que le produit s'explique ou qu'il perd la personne · la
plupart étaient un point final.

---

## D63 — Un manque sans issue est une impasse, et le type l'interdit

**Décision.** Sur le ton `todo`, la propriété `action` est **obligatoire** dans
le type. Dire à quelqu'un qu'il manque quelque chose puis le laisser chercher
n'est pas une information, c'est un reproche.

**Pourquoi le type et pas la convention.** Ce n'est pas une règle qu'on rappelle
en revue de code · c'est une erreur de compilation. Une union discriminée rend le
défaut inexprimable, ce qu'aucun rappel ne fait.

**Un `wait` n'a pas d'action, et c'est correct.** Proposer un bouton là où il n'y
a rien à faire ferait perdre du temps à celui qui le cherche.

---

## D64 — Dix-huit variantes n'ont jamais été décidées

**Le constat.** Personne n'a choisi d'avoir dix-huit états vides différents. Ils
sont arrivés un par un, chacun raisonnable au moment de l'écrire. C'est
exactement le genre de dérive qu'une convention ne freine pas.

**Décision.** Un test cherche la FORME d'un état vide plein écran — cadre en
pointillé ET contenu centré sur la même déclaration — et refuse qu'elle soit
écrite ailleurs que dans le composant.

**Il a servi immédiatement.** Écrit après la conversion de huit écrans, il en a
trouvé cinq de plus que la relecture avait manqués · dont un cadre imbriqué dans
un autre, deux bordures pointillées l'une dans l'autre.

**Ce qu'il ne vise pas.** Les mentions en ligne dans un panneau déjà cadré ·
elles relèvent de `EmptyLine`, et leur imposer un bloc ferait plus de bruit que
la donnée qu'elles remplacent.

---

## D65 — Le parcours s'était arrêté au produit d'il y a trois mois

**Le constat.** Une liste de quatre cases existait : créer la marque, connecter
une source, ajouter des assets, générer une créa. Elle mène à une première image
et **abandonne exactement là où la valeur du produit commence** · pas un mot sur
la carte, les lots, la mesure, l'arbitrage, la mémoire.

**Décision.** Huit étapes bloquantes, de rien jusqu'à « Jarvis sait quelque
chose sur toi », plus deux facultatives qui améliorent sans conditionner.

**L'ordre vise le premier test MESURÉ**, pas la complétude de la fiche marque.
C'est le premier moment où l'outil rend quelque chose que l'utilisateur n'avait
pas avant.

---

## D66 — Un parcours est un graphe, et Meta vient après le premier lot

**Le défaut.** Les quatre cases s'affichaient à égalité, comme si l'ordre était
libre. Il ne l'est pas · **connecter Meta avant d'avoir un lot en ligne ne sert
à rien**. On branche un compte publicitaire pour mesurer quelque chose ; s'il n'y
a rien à mesurer, l'étape est faite pour rien et l'outil paraît creux.

**Décision.** Chaque étape déclare ce qu'elle exige. Une étape bloquée dit **par
quoi** elle l'est, plutôt que d'être grisée sans explication · griser sans
expliquer produit exactement la question qu'on voulait éviter. Et on ne lie pas
une étape bloquée : y envoyer quelqu'un le ferait arriver devant un écran qu'il
ne peut pas encore remplir.

**Une seule prochaine action.** Huit cases ouvertes sont un mur, et un mur se
contourne en fermant l'encart. On montre le chemin entier — c'est lui qui dit où
l'on va — mais on n'en désigne qu'une comme la suivante. Jamais une facultative :
envoyer quelqu'un régler un détail au lieu d'avancer est le meilleur moyen de le
perdre.

---

## D67 — Une case qu'on coche soi-même ment dès la première distraction

**Décision.** Chaque étape est faite parce que **la donnée existe** en base, pas
parce que quelqu'un l'a cochée.

**Deux conséquences.** On ne peut pas se tromper sur son propre état · et un
nouveau membre de l'équipe voit la vérité, pas l'humeur de celui qui a configuré
avant lui.

**Le seuil de « marque renseignée » est bas, volontairement.** Une identité
utilisable et un produit suffisent · exiger la fiche parfaite ferait stagner
quelqu'un qui a déjà de quoi générer.

**Et « Jarvis sait quelque chose » exige trois créas décrites ET un verdict
arbitré.** En dessous, son tableau reste vide, et annoncer l'étape faite serait
un mensonge visible dès le premier clic.

---

## D68 — Il se replie, il ne disparaît pas

**Le défaut.** L'ancien encart s'effaçait définitivement au premier « Masquer »,
via un drapeau de navigateur. Un nouveau membre de l'équipe n'y avait plus jamais
droit, et celui qui l'avait masqué non plus.

**Décision.** Il se replie en une ligne qui garde la progression et la prochaine
étape. Il reste utile à l'étape six, quand on cherche pourquoi Meta ne remonte
rien · ce n'est pas une bannière de bienvenue, c'est la carte de la boucle.

Il disparaît pour de bon à une seule condition : le circuit complet en place. Là,
il n'a plus rien à guider et il rend la place.

---

## D69 — Le désordre n'était pas où je l'attendais

**Ce que l'audit a démenti.** La traduction des échecs TECHNIQUES
(`user-error.ts`) est solide, testée à 32 cas, et couvre les familles avec des
messages actionnables. Il n'y avait rien à y refaire.

**Où était le désordre.** Dans les refus MÉTIER, écrits action par action :

| Écrit | Fois | Problème |
|---|---|---|
| « Session expirée. » / « Session expirée, reconnecte-toi. » | 35 + 8 | deux formulations, une situation |
| « Aucune marque active. » / « Sélectionne une marque active. » | 13 + 6 | l'une constate, l'autre indique |
| « Accès refusé. » / « Action réservée… » / « Réservé aux… » | 5 + 7 + 2 | trois phrases, dont une muette sur la raison |

**Et trois jetons techniques partaient tels quels à l'écran** : `'session'`,
`'name'`, `'forbidden'`. Rien ne l'empêchait, puisqu'un champ `error` accepte
n'importe quelle chaîne.

---

## D70 — Un refus qui ne dit pas quoi faire est une impasse

**Décision.** La même règle que pour les états vides (D63), appliquée au chemin
malheureux : chaque refus porte sa suite. Même « préviens-nous », qui est une
action.

**Trois messages réécrits sur le fond, pas sur la forme.**

- « Aucune marque active » devient « **Sélectionne** une marque active pour
  continuer · tout ici travaille marque par marque ». Le constat laissait
  chercher où l'on en sélectionne une.
- « Accès refusé » devient « cette action demande un rôle administrateur ·
  demande à un administrateur, ou fais-toi passer admin depuis Membres ». Un
  refus sans motif ne se corrige pas.
- « Introuvable » évoque désormais **le changement de marque active** · c'est la
  cause la plus fréquente, et la taire fait chercher un objet supprimé qui
  existe toujours.

**Ce qui n'est pas la faute de l'utilisateur le dit.** Base injoignable, IA non
configurée : « ce n'est pas lié à ton compte » évite de chercher une erreur de sa
part.

**Un test vérifie chaque branche** · un message trop court, ou sans le séparateur
qui articule le fait et la suite, échoue.

---

## D71 — Un type énuméré rend un jeton technique inexprimable

**Décision.** Les refus passent par une carte fermée (`GuardReason`) plutôt que
par des chaînes libres.

**Et un test balaie les actions** pour refuser toute valeur d'erreur qui
ressemble à un jeton — un seul mot, sans majuscule. C'est exactement la forme des
trois qui fuyaient.

**Vingt et un fichiers unifiés.** Aucun message n'a été perdu : ceux qui portaient
une information particulière l'ont gardée, seuls les quatre cas génériques ont
été ramenés à une source unique.

---

## D72 — Une justification produite par le modèle est une affirmation

**Contexte.** Chaque génération consigne déjà ce que la mémoire lui a donné
(`memoryUse`) · c'est ce qui alimente l'attribution. Mais l'utilisateur, au
moment où il lit une proposition, ne voit rien. Pour comprendre, il doit aller
sur un autre écran, et personne ne fait ça.

**Une proposition muette se subit ou s'ignore. Une proposition qui s'explique se
juge** · et surtout, elle se conteste en connaissance de cause.

**La décision.** On aurait pu demander au modèle de rédiger sa propre
justification dans le même appel · c'était gratuit et immédiat.

On ne l'a pas fait. **Une justification produite par le modèle est une
affirmation ; calculée depuis la mémoire, c'est un fait.** Un modèle à qui l'on
demande de se justifier trouvera toujours une raison, y compris quand il n'en
avait pas, et il écrira « 3 gagnantes sur 8 » sans avoir compté.

Tout le produit repose sur « cite tes chiffres ou admets que tu n'en as pas ». La
justification est donc **recalculée à partir des mêmes lectures que celles qui
ont été injectées** · expliquer avec d'autres chiffres que ceux qui ont servi
serait une fiction. Coût : zéro appel supplémentaire.

---

## D73 — Ce qui a été écarté passe devant ce qui a été repris

**Décision.** La ligne la plus haute est celle de l'accroche **évitée** : « écarte
l'accroche qui avait perdu ici ».

**Pourquoi.** Savoir qu'une accroche a été écartée parce qu'elle avait perdu
apprend quelque chose · savoir qu'un mécanisme moyen a été suivi n'apprend rien.
C'est aussi la ligne qui justifie l'existence même de la mémoire.

**On ne cite qu'au-dessus de la moyenne.** Une dimension sous la moyenne de la
marque n'a rien à revendiquer · la mentionner ferait passer un défaut pour une
intention. Et sous trois tests tranchés, aucun taux n'est cité, comme partout
ailleurs.

**Le marché reste en dernier et cède la place.** Une part d'usage n'est pas un
taux de réussite, elle ne justifie pas un choix · elle l'accompagne.

**Trois lignes au maximum.** Au-delà ce n'est plus une explication mais un
rapport, et on en perd le fil.

---

## D74 — Quand rien ne guide, on le dit

**Décision.** Sans mémoire exploitable, une ligne s'affiche quand même : « rien
de mesuré ne guide encore cette proposition · elle sort des règles de la marque,
pas de tes résultats ».

**Pourquoi.** Une proposition sans justification affichée se lit comme une
proposition justifiée dont on cache la raison. C'est la même règle que pour les
états vides et les refus : le silence n'est pas une réponse.

---

## D75 — Contenir la page courante et être la page courante sont deux états

**Le défaut, visible à l'écran.** Sur `/adsmap/suites`, « Adsmap » ET « Suites »
portaient tous deux le fond accentué. Deux entrées paraissaient sélectionnées, et
on ne savait plus laquelle on lisait.

Le code disait pourtant son intention : *« actif en exact ou sur une sous-route
(met en évidence le fil de navigation) »*. L'intention était juste · c'est le
rendu qui était le même que celui de « tu es ici ».

**Décision.** Deux notions séparées. `active` — exact, **un seul élément à la
fois**, seul à porter le fond plein. `inPath` — contient la page courante, rendu
sobrement : libellé appuyé, aucun fond.

**Le fond plein est réservé à la page courante.** Un parent qui le porte aussi
produit deux « tu es ici » sur le même écran.

---

## D76 — Cliquer le nom d'un module doit montrer ce qu'il contient

**Le défaut.** Déplier exigeait de viser la flèche · vingt-six pixels, à côté
d'un libellé qui, lui, ne faisait que naviguer. Personne ne devine ça : on clique
le nom du module et on s'attend à voir ce qu'il contient.

**Décision.** Le libellé **navigue ET ouvre**. La flèche garde le repli, pour qui
veut fermer la branche sans la quitter.

**Il n'y a pas de bascule sur le libellé, et c'est délibéré.** Un nom qui cache
des choses au deuxième clic est une surprise · on n'en veut pas dans une
navigation. Le libellé ouvre, jamais il ne referme.

---

## D77 — Quatre lieux valent mieux que quatre impératifs

**Le constat.** « Piloter, Trouver, Créer, Tester » disait juste et ne racontait
rien · quatre ordres donnés à quelqu'un qui travaille déjà.

**Décision.** Des lieux · **Pilotage, Observatoire, Atelier, Laboratoire**, plus
« Ta marque ».

**Pourquoi ça marche mieux.** On ne « crée » pas : on va à l'atelier. On ne
« teste » pas : on va au laboratoire, avec une hypothèse et un protocole — ce qui
est exactement ce qu'Adsmap fait. Et « Observatoire » dit ce qu'on y fait
vraiment : regarder le marché sans agir dessus.

Un registre unique, quatre endroits où l'on se rend · le rail se lit comme un
plan plutôt que comme une liste de tâches.
