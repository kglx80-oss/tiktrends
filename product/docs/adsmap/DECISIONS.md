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

---

## D78 — Le rail replié n'allumait plus rien

**La régression, introduite par D75.** Séparer « je suis ici » de « la branche
qui me contient » était juste en mode déplié. En mode REPLIÉ, il n'y a plus
d'enfant à afficher · seule l'icône du parent subsiste, et depuis que l'état
actif est exact, être sur `/adsmap/suites` n'allumait plus **rien du tout**.

**Décision.** En replié, l'icône du parent porte les deux états : fond plein
quand on y est exactement, liseré latéral quand on est dans sa branche. La même
distinction qu'en déplié, dans le seul espace disponible.

**Et l'infobulle nomme l'écran exact.** Le repli masque les libellés · dire
« Adsmap » quand on est sur Suites laisse chercher.

---

## D79 — Un brouillon qui ne se relit pas fait porter la vérification au lecteur

**Où Jarvis s'arrêtait.** Suites disait « change l'offre, garde l'accroche ». Le
radar disait « ce concurrent tient depuis 24 jours ». Dans les deux cas, la
marche suivante était manuelle · l'outil conseillait puis regardait quelqu'un
d'autre travailler.

**Décision.** Jarvis rédige le concept — accroche, déroulé en 3 à 5 temps,
hypothèse — puis **passe son propre texte au brief de pré-lancement**. S'il vient
de reproposer une accroche qui a déjà perdu chez cette marque, il le voit avant
l'utilisateur et réécrit.

**Un générateur d'idées, tout le monde en a un.** Ce qui manque partout ailleurs,
c'est le brouillon qui se relit lui-même avant d'être montré · un outil qui ne le
fait pas fait porter la vérification à celui qui lit, c'est-à-dire exactement le
travail qu'on prétendait lui enlever.

**Une seule réécriture.** Deux signifieraient qu'il tourne en rond · au second
échec, on le dit plutôt que de payer un troisième appel pour la même réponse.

**Un profil statistiquement faible ne déclenche PAS de réécriture.** La mémoire
éclaire, elle n'interdit pas · et un concept neuf a par construction un profil
qu'on ne connaît pas. Seule une accroche réfutée impose la reprise : c'est un
fait, pas une préférence.

---

## D80 — En réécriture, on renvoie le brouillon précédent

**Décision.** La correction est demandée avec le texte d'origine dans le fil, pas
seule.

**Pourquoi.** Sans lui, le modèle repart de zéro et perd ce qui allait · on
transforme une retouche en nouveau tirage, et le déroulé qu'on voulait garder
disparaît avec l'accroche qu'on voulait corriger.

**Le gel ferme la consigne**, juste avant les règles maison. C'est la contrainte
qu'un modèle oublie le plus volontiers, parce qu'elle lui interdit d'être
créatif là où il aimerait l'être.

**Coût annoncé.** Un brouillon = un appel (~0,03 $). Le pire cas est 0,06 $, et
il n'a lieu que dans le cas où il évite un test perdu d'avance.

---

## D81 — La barre de composition remplace « Tes prompts »

**Décision.** L'écran `/studio/prompts` est supprimé. Les studios Image et Vidéo
reçoivent une barre unique où la description prend toute la largeur, les réglages
deviennent des pastilles, et le prix est sur le bouton.

**Pourquoi.** Chaque studio avait son formulaire : un petit champ de texte, puis
des cases à cocher, des sélecteurs et des boutons de ratio éparpillés autour. Le
prompt — la seule chose qui décide vraiment de l'image — se retrouvait à égalité
avec un menu déroulant de quantité.

**On écrit d'abord, on règle ensuite** · c'est l'ordre dans lequel on pense une
créa, et l'inverse de l'ordre dans lequel un formulaire est habituellement
construit.

**Le prix est SUR le bouton.** Il vivait dans une phrase grise à côté. Sur le
bouton, il est lu au moment où l'on décide · à côté, il est lu après, ou jamais.

---

## D82 — Ce qu'on supprime est la rubrique, pas la mesure

**Décision.** Les presets survivent sous le nom de « scènes enregistrées »,
accessibles depuis la barre, avec leur bilan affiché AVANT leur nom.

**Pourquoi.** La rubrique obligeait à quitter le studio pour écrire sa direction
artistique puis à revenir · trois gestes pour une chose qu'on veut faire pendant
qu'on compose. Mais « 3 gagnantes sur 9 tests tranchés » reste la seule chose
qu'un générateur d'images ne saura jamais dire d'un prompt, et ce n'était pas une
raison de lui garder un écran entier.

**La scène reprise est consignée** dans `generations.input.presetId`, en Image
comme en Vidéo · sans ça le bilan n'aurait jamais existé que pour le studio Pubs,
et une scène reprise cent fois afficherait encore « jamais utilisée ».

**Toute frappe libère la scène.** Un texte retouché n'est plus la scène
enregistrée · lui attribuer le résultat fausserait le seul chiffre qui compte.

---

## D83 — Le studio Pubs ne décrit pas une scène, et ne reçoit pas la barre

**Décision.** Pubs garde son formulaire structuré (gabarits, persona, référence
à cloner). Il reçoit seulement le prix sur le bouton.

**Pourquoi.** Il ne compose pas à partir d'une description : il compose une série
à partir de gabarits, ou décline une pub de référence. Lui coller une barre de
description ajouterait un champ que le générateur ignore · un réglage qui ne
règle rien est pire qu'un réglage absent, parce qu'on croit avoir dirigé quelque
chose.

**Ce qui se transporte, c'est la doctrine, pas le composant.**

---

## D84 — Le garde de navigation manquait dans l'autre sens

**Décision.** Un test vérifie que chaque chemin déclaré dans `ROUTES` a
réellement sa page.

**Pourquoi.** Le garde existant empêchait d'ajouter un écran sans le déclarer.
Rien n'empêchait le contraire : supprimer un écran en laissant sa ligne · le rail
aurait continué de proposer un lien vers un 404, ce que personne ne remarque
avant de cliquer.

**Il a trouvé quelque chose à sa première exécution** (`/onboarding`, déclaré
hors du groupe applicatif · légitime, mais invisible du garde tel qu'il était
écrit).

---

## D85 — Une page de garde oriente, elle ne travaille pas

**Décision.** `/studio` cesse d'être un formulaire. Elle dit ce que chaque
studio produit, quand s'en servir, et où l'on en est.

**Pourquoi.** Elle ouvrait sur « Produit / marque / offre * ». Devant ce champ,
la question n'est pas « lequel choisir » mais « pourquoi on me demande ça alors
que je voulais voir ce que l'outil sait faire ». Les quatre studios étaient
relégués sous le formulaire, en liens · la racine de la section cachait la
section.

**Le « Quand ? » est la seule information qui manquait.** Devant quatre portes
qui se ressemblent, ce qui manque n'est pas la description de chaque outil,
c'est la question à laquelle il répond.

---

## D86 — Le formulaire n'était pas en trop, il était assis à l'accueil

**Décision.** Le générateur de textes devient `/studio/textes` · un studio à
part entière, déclaré dans le rail comme les trois autres.

**Pourquoi.** Il est le seul à rendre du texte, et le texte est ce qu'on écrit
avant de composer une image. Le supprimer aurait retiré une fonction pour
régler un problème de placement.

**Son résultat est désormais consigné** (`generations`, kind `script`) · il
était le seul studio à ne rien enregistrer, son résultat vivait le temps de
l'onglet.

---

## D87 — La page de garde sait dire de ne pas générer

**Décision.** Le geste conseillé se calcule sur l'état réel : rien de produit →
Pubs IA ; des créas et aucun verdict → les lots ; des verdicts → les suites.

**Pourquoi.** Quand une marque a quarante créas et zéro verdict, conseiller d'en
faire une quarante-et-unième serait vendre du volume à quelqu'un qui manque de
mesure. C'est le seul endroit de l'outil où cette phrase arrive avant le clic.

**Chaque compteur est lu isolément.** Une page de garde qui tombe entière parce
qu'une colonne manque est pire qu'une page sans compteur · c'est la leçon de la
lecture unique qui avait fait tomber Jarvis en entier.

---

## D88 — Le radar ne s'arrête plus sur le constat

**Décision.** Chaque trouvaille porte « Demander le concept à Jarvis », puis
« Poser sur la carte ».

**Pourquoi.** Le radar disait « ce concurrent tient depuis 24 jours sur une
ouverture que tu n'as jamais testée », et regardait quelqu'un d'autre
travailler. Entre le lire et l'essayer, il y avait un écran de rédaction, un
rattachement à faire à la main, et une nuit de sommeil · c'est-à-dire, en
pratique, rien.

**L'angle porte la mécanique, pas le concurrent.** Un angle « Nike » ne se
réutilise pas ; un angle « démonstration en une prise » si.

**Le concept arrive `proposed`, l'ad arrive `draft`.** Une trouvaille de veille
ne décide pas de la taxonomie de la marque, et une ad née d'une observation
extérieure n'est pas prête à tourner · elle est prête à être relue.

**La provenance est écrite** (`sourceRef.radarExternalId`) · six mois plus tard,
« d'où sortait cette idée » est une question qu'on se pose vraiment.

---

## D89 — Le chemin persona → désir → angle sort des actions

**Décision.** `ensureGraphPath` vit dans `lib/adsmap-path.ts`, un module
ordinaire.

**Pourquoi.** Il était privé à la passerelle Studio. L'exporter depuis un
fichier `'use server'` en aurait fait un point d'entrée public prenant `brandId`
et `workspaceId` en paramètres · c'est-à-dire un moyen d'écrire dans la carte
d'un autre espace. Un module appelé par des actions qui ont déjà vérifié qui
parle ne pose pas ce problème.

---

## D90 — Le brouillon s'affiche au même endroit partout

**Décision.** `DraftCard` est un composant unique, utilisé par les suites et
par le radar.

**Pourquoi.** Deux copies d'un même affichage divergent toujours, et celle qui
aurait divergé ici est **la mention de la réécriture** · c'est la seule chose
qui distingue Jarvis d'un générateur, et elle serait tombée en premier.

**L'ordre de lecture est délibéré** : la correction, puis l'accroche, le
déroulé, l'hypothèse, les réserves. On lit ce qui met en doute avant ce qui
rassure · l'inverse fait valider avant d'avoir douté.

---

## D91 — Les scènes se classent par bilan, pas par nom

**Décision.** Trois rangs : ce qui a gagné (du meilleur au moins bon), ce qu'on
ne sait pas encore, ce qui a perdu avec assez de tests pour le savoir.

**Pourquoi.** On avait mesuré ce que vaut chaque scène, puis on les présentait
par ordre alphabétique · la mesure existait et personne ne la regardait. Un
classement par nom demande de lire douze bilans pour trouver le bon.

**On ne cache rien, on ordonne.** Retirer une scène perdante priverait de la
seule chose qu'elle apprend encore : qu'elle a été essayée.

**À taux égal, celle qui a le plus de tests derrière elle passe devant** · elle
est plus sûre, et c'est la même prudence que partout ailleurs.

---

## D92 — La phrase ne sort que si on a mieux à proposer

**Décision.** Une ligne s'affiche sous la barre dans deux cas seulement : la
scène choisie a perdu avec assez de tests, ou une autre a gagné et celle-ci n'a
rien prouvé. Sur la meilleure, silence.

**Pourquoi.** Une phrase affichée à chaque choix devient un bruit qu'on cesse de
lire au bout de trois jours. Féliciter n'apprend rien et use le crédit de la
phrase suivante.

**Elle informe, elle n'interdit pas** · un concept neuf a par construction un
profil qu'on ne connaît pas, et c'est souvent lui qui ouvre quelque chose. Le
texte le dit explicitement : « ce n'est pas une raison de renoncer, c'en est une
de le savoir ».

---

## D93 — Jarvis peut tout dire, il ne peut rien engager

**Décision.** La frontière n'est pas « lecture / écriture ». Elle sépare ce qui
est **gratuit et réversible** de ce qui **coûte ou structure**.

- Sans confirmation : lire la mémoire, raisonner, écrire du texte dans le fil.
- Sur clic explicite : tout ce qui crée un nœud sur la carte, dépense des
  crédits, ou engage de l'argent.

**Pourquoi pas lecture / écriture.** Lire ne coûte rien, mais rédiger non plus ·
un brouillon qu'il faudrait autoriser avant de le voir est un brouillon que
personne ne demande.

**Pourquoi rien n'est déclenché tout seul, même de gratuit.** Une action que
l'outil lance à la place de quelqu'un économise trois secondes et coûte la
confiance : la fois où elle se trompe, plus personne ne sait ce que l'outil a
fait sans le dire. Le clic n'est pas une friction, c'est la trace de qui a
décidé.

---

## D94 — Le vocabulaire des gestes est fermé, et l'échec par défaut est le silence

**Décision.** Six clés, pas une de plus. Une clé inconnue, mal formée ou hors
liste est ignorée · et si elle est bien formée, elle est aussi retirée du texte.

**Pourquoi les deux.** Un modèle qui invente `supprimer_tout` ne doit rien
déclencher · il ne doit pas non plus laisser le mot s'afficher comme si l'outil
y songeait.

**Deux gestes au maximum.** Au-delà, on a remplacé une réponse par un menu.

**Une seule action coûte** (`draft`), et elle l'annonce sur le bouton · les cinq
autres ne font que déplacer. Un test vérifie que toute action gratuite mène
quelque part : un bouton qui ne coûte rien et ne fait rien est pire qu'absent.

---

## D95 — La consigne lui interdit de dire qu'il a agi

**Décision.** Le bloc de consigne dit trois choses, et la troisième est celle
qui compte : « Tu ne DÉCLENCHES rien. Le marqueur affiche un bouton, et c'est la
personne qui clique. »

**Pourquoi.** Un modèle qui écrit « c'est lancé » alors qu'un bouton attend
encore un clic détruit la confiance plus sûrement qu'une erreur de calcul · on
peut vérifier un chiffre, on ne vérifie pas une action qu'on croit faite.

**Les boutons vivent dans le message**, pas à côté · rouvrir la conversation
trois jours plus tard réaffiche les mêmes propositions. Un bouton qui
disparaîtrait au rechargement laisserait croire qu'on l'a déjà cliqué.

---

## D96 — Aucun contenu d'image ne part dans la page

**Décision.** Les images téléversées sont servies par `/api/asset/[id]`. La
liste des assets ne remonte plus jamais le contenu de la colonne `url`.

**Pourquoi.** Une image téléversée est stockée en base sous forme de `data:`
URI · jusqu'à six mégaoctets de base64. `listAssets` faisait `select()` sans
colonnes, sur quatre cents lignes, pour en garder vingt-quatre — et renvoyait
le base64 dans la page. Vingt-quatre vignettes pesaient plus lourd que tout le
reste de l'application.

**Une page qui transporte ses images à l'intérieur d'elle-même ne peut pas être
rapide, et aucun cache ne peut l'aider** · le navigateur ne sait pas mettre en
cache un morceau de HTML.

**Le test se fait en SQL** (`like 'data:%'`), donc le contenu n'est jamais lu.
La page ne transporte plus qu'un lien de quarante caractères, et le navigateur
télécharge les vignettes en parallèle, après l'affichage, une seule fois.

**La règle vit dans `lib/asset-url.ts`**, pas dans l'action · dans un fichier
`'use server'` elle ne pouvait pas être testée, tout export y devenant un point
d'entrée réseau.

---

## D97 — La grille demande des vignettes

**Décision.** `/api/ad/[id]?t=1` compose à 40 % de la taille d'impression. La
grille et la bande de navigation l'utilisent ; l'aperçu et le téléchargement
gardent le plein format.

**Pourquoi.** La grille affichait des cartes de 240 pixels et recevait des
images de 1080, composées à la demande par satori pour être réduites par le
navigateur juste après. Le coût d'une composition suit la **surface** :
432 × 540 fait six fois moins de pixels que 1080 × 1350.

**Le cache devient immuable.** L'adresse porte déjà l'empreinte de la recette ·
retoucher le texte d'une pub change son adresse, donc le navigateur peut garder
l'image sans jamais revenir demander si elle a bougé. `max-age` seul ne le
disait pas.

---

## D98 — « Idempotent » ne veut pas dire « gratuit »

**Décision.** L'enrichissement de marque ne repasse pas avant six heures, et
cherche au plus douze photos par passage. La date est posée **même quand il ne
trouve rien**.

**Pourquoi.** Il ne faisait du réseau que si quelque chose manquait, ce qui
semble prudent jusqu'à ce qu'on remarque que **ce qui manque continue de
manquer**. Une photo produit introuvable reste introuvable : elle était cherchée
sur le site de la boutique à chaque chargement de page, pour rien, pendant que
la page attendait.

**C'est le cas « on n'a rien trouvé » qu'il fallait cesser de rejouer** · poser
la date seulement en cas de succès aurait laissé le défaut entier.

Migration 0042.

---

## D99 — Une table lourde se lit colonne par colonne

**Décision.** Un test refuse `db.select()` sans liste de colonnes sur les tables
qui portent du contenu : `assets`, `generations`, `marketCreatives`, `savedAds`,
`jarvisMessages`.

**Pourquoi.** C'est le défaut exact qui a rendu Pubs IA lente, et rien
n'empêchait qu'il revienne · un `select()` nu ne ressemble pas à une faute, il
ressemble à du code court.

**Le garde ne juge pas la taille réelle — il ne peut pas — il juge l'intention.**
Écrire les colonnes qu'on veut oblige à se demander si on veut vraiment celle
qui pèse.

**Il a trouvé cinq autres cas à sa première exécution**, dont deux qui lisaient
six cents descriptions IA complètes pour alimenter neuf champs, et un qui
remontait deux cents images en base64 pour en taguer vingt.

---

## D100 — La projection marché est partagée

**Décision.** `lib/market-rows.ts` porte les colonnes et le mapper, utilisés par
la mémoire de Jarvis et par l'écran marché.

**Pourquoi.** Le mapper était copié aux deux endroits, à l'identique. Deux
copies finissent par diverger · et la divergence, ici, se serait vue comme deux
chiffres de marché différents selon l'écran ouvert.

---

## D101 — Un rendu payé une fois n'est jamais repayé

**Décision.** Le PNG composé est rangé dans le bucket et son adresse notée dans
`generations.output.renders[clé]`. Une requête suivante redirige, elle ne
recompose pas.

**Pourquoi.** Les rendus vivaient dans une `Map` du processus · ça marche
jusqu'au prochain déploiement. Après chaque mise en ligne, la première personne
à ouvrir le studio repayait la composition de toutes ses pubs, une par une,
devant un écran vide. La recette n'avait pas changé : l'image aurait été
identique au pixel près.

**`output`, pas `input`.** `input` porte la recette — ce qu'il faut dessiner.
`output` porte ce qui a été produit — où l'image se trouve. Ranger l'adresse
dans la recette aurait mélangé la consigne et son résultat.

**On répond d'abord, on range ensuite** · faire attendre un aller-retour S3
rendrait le premier affichage plus lent pour accélérer les suivants. Et tout
échoue en silence : un cache qui tombe doit se contenter de ne pas accélérer.

**La fusion se fait à l'intérieur de `renders`** · l'opérateur `||` de jsonb ne
fusionne qu'au premier niveau, donc deux ratios rendus le même jour se seraient
écrasés l'un l'autre sans qu'on s'en aperçoive.

---

## D102 — Sortir les images de la base, par lots et à la main

**Décision.** Un bouton dans les réglages déplace 25 images embarquées vers le
bucket, avec le compte de ce qui reste.

**Pourquoi.** Le proxy `/api/asset/[id]` avait réglé le symptôme · la page ne
transporte plus les octets. Il n'avait rien réglé de la cause : ils sont
toujours dans Postgres, donc dans chaque sauvegarde et dans chaque requête qui
touche la table, même quand elle ne demande pas la colonne.

**Par lots et déclenché à la main.** Une bibliothèque entière peut peser
plusieurs gigaoctets · le faire en tâche de fond au premier chargement
transformerait une visite anodine en transfert de plusieurs minutes que
personne n'a demandé.

**Le fichier est écrit AVANT que la ligne change.** Une coupure au milieu laisse
un objet orphelin de quelques kilo-octets, jamais une image perdue. L'ordre
inverse aurait donné exactement le contraire.

---

## D103 — Pubs IA reçoit la barre, contre mon avis précédent

**Décision.** Le studio Pubs adopte la barre de composition : la description
prend toute la largeur, produit, persona, objectif, quantité et moteur
deviennent des pastilles, le prix est sur le bouton. Ce qui reste dessous —
gabarits, photo produit, références — devient « Réglages de la série ».

**Pourquoi je m'étais trompé.** J'avais écrit (D83) que Pubs ne décrit pas une
scène et que lui coller une barre ajouterait un champ que le générateur ignore.
Le premier point est vrai, le second était une paresse : il suffisait de rendre
le champ utile. En mode marque, la description EST l'angle · elle existait déjà.
En mode clone, elle est désormais une consigne libre **réellement transmise** au
modèle, où elle prime sur sa lecture de la référence.

**Un champ que le générateur ignore est pire qu'un champ absent** · c'était mon
argument, et il tenait uniquement tant que je ne branchais pas le champ.

**Les scènes enregistrées arrivent dans Pubs.** L'action acceptait `presetId`
depuis le début, l'écran ne l'a jamais envoyé · une scène pouvait donc servir
cent fois sans jamais quitter « jamais utilisée ».

---

## D104 — La durée d'une vidéo existait sans pouvoir être réglée

**Décision.** 5 s ou 10 s, en pastille. Le débit crédits ET la barrière de
dépense comptent en tranches de cinq secondes.

**Pourquoi.** `durationS` traversait déjà Fal et Higgsfield, figé à cinq
secondes et jamais exposé · un réglage réel qu'on ne pouvait pas régler.

**L'exposer sans doubler le prix aurait été vendre à perte sans s'en
apercevoir.** Une vidéo de dix secondes coûte au fournisseur à peu près le
double, et `guardFixedCost` doit voir passer deux unités, pas une.

**Un test a trouvé une faute dans le repli** : `safeVideoDuration(undefined)`
testait `d ?? 5` puis rendait `d`, donc laissait passer `undefined`. Tester et
rendre la même valeur.

---

## D105 — GPT Image 2, en deux qualités annoncées

**Décision.** Deux entrées au catalogue : `gpt2` (qualité moyenne, 5 crédits) et
`gpt2_high` (qualité haute, 20 crédits). Endpoints `openai/gpt-image-2` et
`openai/gpt-image-2/edit`.

**Pourquoi deux entrées et pas un réglage caché.** Chez le fournisseur, la
qualité fait varier le prix d'un facteur quatre (~0,05 $ contre ~0,21 $ par
image). Un réglage qu'on découvre sur la facture n'est pas un réglage · deux
lignes qui annoncent chacune son tarif en est un.

**La qualité est un paramètre, pas une adresse.** Le garde anti-« variante
fantôme » l'exige déjà : deux entrées qui produisent le même appel doivent
coûter le même prix. Ici l'adresse est commune, `quality` diffère, le prix suit.

---

## D106 — Un modèle a deux adresses, selon qu'on lui donne une image

**Décision.** `falModelNoRef` porte l'endpoint sans référence, et `falModelFor`
choisit.

**Pourquoi.** Appeler `.../edit` sans image renvoie une erreur du fournisseur ·
le modèle a l'air cassé alors qu'on s'est trompé de porte. Nano Banana était
dans ce cas depuis le début, sans qu'on le voie : le studio Image passe presque
toujours une photo produit.

---

## D107 — Le studio Image choisit son moteur, et le paie

**Décision.** La pastille « Moteur d'image » arrive dans le studio Image, et le
débit crédits suit le modèle choisi.

**Pourquoi.** Il subissait celui de l'environnement pendant que Pubs IA le
choisissait depuis toujours. Et facturer `costFor('image')` quel que soit le
moteur revenait à vendre GPT Image 2 · Haute au prix de Nano Banana, soit un
quart de son coût réel.

---

## D108 — La vignette est retirée · la maquette n'était pas redimensionnable

**Décision.** On revient au plein format pour la grille. `?t=1` disparaît.

**Pourquoi.** L'idée était bonne, la mise en œuvre était fausse : **toute la
maquette est en pixels absolus calés sur une largeur de 1080** (`fontSize: 74`,
`padding: '150px 56px 56px'`, `top: 46`…). Réduire le canevas sans
redimensionner l'arbre donne une accroche de 74 px sur une image large de 432 ·
un titre qui mange la moitié de la pub.

**Le gain visé est devenu accessoire.** Depuis que le PNG est rangé au premier
rendu (D101), une pub n'est composée qu'une fois dans sa vie · ce qui restait
était de la bande passante, et la bande passante ne vaut pas une maquette
cassée.

La faire revenir proprement demande de rendre la maquette proportionnelle à sa
largeur, sur les dix gabarits. C'est un chantier, pas un paramètre.

---

## D109 — Un réessai silencieux transforme une panne en mystère

**Décision.** L'échec d'une scène est journalisé (`logFailure`) et le dernier
échec remonte dans le message rendu à l'écran.

**Pourquoi.** Le réessai vivait dans un `catch {}` strictement vide. Quand le
fournisseur refusait un appel, l'erreur mourait là · on voyait une attente de
plusieurs minutes puis « les scènes n'ont pas pu être générées », c'est-à-dire
la seule chose qu'on savait déjà en regardant l'écran vide. Et le conseil
« Réessaie » proposait de repayer exactement la même attente.

Il faut réessayer. Il ne faut pas se taire en le faisant.

---

## D110 — Un `4xx` ne se rejoue pas

**Décision.** Un refus du fournisseur interrompt la boucle de réessai. Les
délais et les `5xx` gardent leur seconde chance.

**Pourquoi.** Un `4xx` porte sur la DEMANDE — modèle inconnu, paramètre refusé,
référence illisible. La seconde tentative envoie la même demande, donc reçoit la
même réponse, quatre-vingt-dix secondes plus tard. Douze pubs dans ce cas
faisaient attendre plus de dix minutes pour rien.

La règle vit dans `lib/fal-retry.ts` · dans le `catch` d'un fichier
`'use server'` elle ne se testait pas.

---

## D111 — Les deux générations de GPT Image ne parlent pas la même langue

**Décision.** GPT Image 1 reçoit `image_size` en pixels (`"1024x1536"`), GPT
Image 2 le reçoit en libellé Fal (`portrait_4_3`, `square_hd`).

**Pourquoi.** `isGptImage` regroupait les deux · GPT Image 2 recevait donc la
convention de son prédécesseur, et refusait la demande. L'utilisateur lisait
« la demande a été refusée par le service » — exact, et inutilisable.

**L'erreur porte maintenant le modèle et la réponse du fournisseur.** « 422 »
tout seul ne permet ni de corriger le catalogue, ni de savoir quel réglage
retirer.

---

## D112 — Un réglage optionnel refusé ne doit pas coûter la génération

**Décision.** Repli progressif sur un `400`/`422` : on retire les paramètres de
variante, puis la taille, avant d'abandonner.

**Pourquoi.** Ce qui reste — la description et les références — est le strict
nécessaire, et tous les modèles l'acceptent. Perdre une génération parce qu'un
modèle n'aime pas un réglage accessoire fait payer à l'utilisateur une
incompatibilité de catalogue.

**Une adresse se corrige sans redéployer** (`FAL_IMAGE_MODEL_<CLÉ>`) · un
fournisseur renomme ses endpoints sans prévenir.

---

## D113 — Le mode de service d'un asset est un type, pas une condition

**Décision.** `assetServing()` rend `embedded | drive | direct`, et la route
l'épuise avec un `never` final.

**Pourquoi.** `servedAssetUrl` envoyait les images Drive privées vers
`/api/asset/[id]`, une route qui ne savait pas les lire · elle redirigeait vers
Google, qui répondait une page de connexion, et la bibliothèque affichait des
cadres vides.

**Le test existait pourtant · il vérifiait l'ADRESSE, pas que la porte
s'ouvre.** C'est la leçon : j'avais écrit le test pour décrire ce que je venais
de coder, pas ce qui devait être vrai.

Un quatrième mode casse désormais la compilation tant que la route ne le traite
pas · c'est la seule forme de rappel qui ne s'oublie pas.

---

## D114 — On regarde enfin ce qui part chez le fournisseur

**Décision.** Un test intercepte `fetch` et vérifie, pour chaque modèle du
catalogue, l'adresse appelée et le corps envoyé.

**Pourquoi.** Deux pannes de suite sont venues du CORPS de la requête — une
taille envoyée dans la convention du modèle précédent, une adresse d'édition
appelée sans image. Les deux ont traversé la compilation, le lint et huit cents
tests sans que rien ne bronche · parce que **rien ne regardait la requête**.

**Ce qu'il ne teste pas** : que le fournisseur accepte. Seul un appel réel le
dit, et il coûte de l'argent. Il teste que ce qu'on envoie correspond à ce qu'on
a décidé d'envoyer · la moitié du problème, mais la moitié qui était aveugle.

**Validé en le faisant échouer** sur la vraie panne (GPT Image 2 recevant la
convention de GPT Image 1) avant de la corriger : trois tests tombent.

---

## D115 — La maquette est proportionnelle, et c'est mesuré

**Décision.** Toute longueur de la maquette passe par `u()`, qui convertit une
valeur calée sur 1080 en pixels réels. Les vignettes reviennent.

**Pourquoi.** La maquette était en pixels durs · réduire le canevas gardait
`fontSize: 74` sur une image large de 432. C'est la régression livrée, et rien
ne l'avait vue : compilation, lint et huit cents tests au vert.

**La réécriture est prouvée neutre.** Les vingt-et-un rendus (sept gabarits,
trois variantes) sont identiques à l'octet près à 1080 · à cette taille `u()`
est l'identité, et la comparaison d'empreintes le vérifie.

**L'échelle vit dans une variable de module.** C'est sûr parce que la
construction de l'arbre ne contient aucun `await` · elle est atomique pour la
boucle d'événements. Un test lance deux rendus de tailles différentes en
parallèle : le jour où quelqu'un rend ce chemin asynchrone, il tombe.

---

## D116 — Un rendu ne se vérifie pas en lisant le code qui l'a produit

**Décision.** Les tests décodent le PNG et mesurent **la quantité d'encre** et
**son centre de gravité**.

**Pourquoi pas une comparaison d'images.** Une différence d'un pixel ferait
échouer pour rien. Et pas non plus un profil bande à bande : un texte ne se
recompose pas proportionnellement — une accroche peut tenir sur deux lignes là
où elle en prenait trois, et le bloc remonte. C'est correct, et le profil fin le
signalait comme une faute.

**Ce que ces deux mesures distinguent.** Une maquette qui se recompose garde son
encre et son centre. Une maquette qui ne se redimensionne pas voit son texte
exploser : elle couvre bien plus de surface et son centre remonte vers le titre
devenu géant.

**Validé en simulant la régression** (échelle forcée à 1) : quatre tests
tombent, dont celui sur chaque gabarit.

---

## D117 — Le récapitulatif est calculé, jamais rédigé

**Décision.** La lettre hebdomadaire vient de comptes. Aucun appel modèle.

**Pourquoi.** Un modèle écrirait un résumé plus joli et parfois faux. C'est la
même règle que pour les justifications de Jarvis (D72) : calculée depuis les
chiffres, une phrase est un fait ; écrite par un modèle, c'est une affirmation.

**Conséquence heureuse : elle ne coûte rien.** Une lettre hebdomadaire qui
dépense à chaque envoi finirait coupée pour la mauvaise raison.

---

## D118 — On n'envoie pas une lettre pour dire qu'il n'y a rien

**Décision.** Une marque dont la semaine n'a rien porté ne reçoit pas de lettre.

**Pourquoi.** Trois semaines de « rien de neuf » et plus personne ne l'ouvre ·
le jour où elle porte quelque chose, elle est déjà morte.

**Mais « rien appris » et « rien à faire » sont deux choses différentes.** Une
marque avec quarante créas et zéro verdict n'a rien appris ET a tout à faire ·
ce cas-là part, et c'est même la lettre la plus utile.

**Un seul geste conseillé, jamais une liste.** Et l'ordre n'est pas un goût,
c'est la boucle du produit : trancher, puis itérer, puis explorer, puis
fabriquer. On ne fabrique pas avant d'avoir tranché, et on ne tranche pas ce qui
n'existe pas.

---

## D119 — Ce que le récapitulatif ne dit pas

**Décision.** Pas de ligne « ta mémoire vient de trancher sur l'UGC ».

**Pourquoi.** Ce serait la plus belle ligne de la lettre. Elle demande de
comparer l'état d'aujourd'hui à celui d'il y a une semaine, et nous ne gardons
aucun historique des seuils franchis.

**Un champ toujours vide est pire qu'un champ absent** · il laisse deux branches
mortes dans le code et la tentation de les remplir approximativement. Une lettre
qui annonce un apprentissage qui n'a pas eu lieu vaut moins que pas de lettre.

Le champ a donc été retiré du type, pas laissé à `[]`.

**En revanche, `unexplored` est RECALCULÉ** plutôt qu'abandonné : le radar ne le
persiste pas, mais il se recompose exactement (une voie est testée au-delà de
trois tests conclus). Lire un champ inexistant aurait compté zéro pour toujours.

---

## D120 — `adsmap_brand_stats` n'était écrite nulle part

**Constat.** La table était lue par le radar pour savoir ce que la marque avait
déjà testé, et **personne ne l'écrivait**. L'ensemble revenait donc toujours
vide, et TOUTE trouvaille était annoncée comme « une voie que tu n'as jamais
testée ».

**Une phrase toujours vraie ne dit rien.** C'était le cœur du radar, et il
tournait à vide depuis le premier jour.

**Réparé par les jalons**, qui sont écrits et disent exactement la même chose :
une dimension a un jalon si et seulement si elle a franchi le seuil.

---

## D121 — Un état sans historique répond à « où en est-on », et à rien d'autre

**Décision.** Une table date le premier franchissement du seuil, par marque et
par dimension. Migration 0043.

**Pourquoi.** On savait à tout moment ce qu'une marque avait mesuré · jamais
QUAND elle l'avait su. Ça manquait à trois endroits : le récapitulatif ne
pouvait pas dire « vient de trancher », on ne pouvait pas répondre à « est-ce
que Jarvis s'améliore », et le radar ne distinguait pas une voie jamais testée
d'une voie tout juste tranchée.

**L'écriture se fait au moment de lire.** Il n'existe aucun instant « les stats
sont recalculées » : elles sont dérivées à la volée. Attendre un travail de fond
qui n'existe pas aurait donné une seconde table vide.

**Le jalon ne bouge plus** (`on conflict do nothing`) · ce qu'on veut savoir est
quand la dimension a commencé à compter, pas quand elle a grossi.

---

## D122 — Le premier passage est du rattrapage, et ne s'annonce jamais

**Décision.** Les jalons posés lors de la première lecture d'une marque sont
marqués `backfilled` et n'apparaissent jamais dans le récapitulatif.

**Pourquoi.** Six mois de tests franchissent le seuil le même jour · la première
lettre hebdomadaire annoncerait un déluge d'apprentissages qui datent de l'an
dernier.

**On perd la date exacte de ce qui s'est produit avant qu'on regarde.** C'est le
prix honnête de ne pas l'avoir enregistré à l'époque, et il vaut mieux que de
dater au hasard.

**La ligne retirée en D119 revient**, maintenant qu'elle porte quelque chose de
vrai.

---

## D123 — Le provisoire avait une entrée et pas de sortie

**Décision.** Un écran `/adsmap/tri` accepte, refuse et renomme les nœuds
proposés, par type et en lot.

**Pourquoi.** Le radar, les studios et l'import poussent tous des nœuds
« proposés » · c'était la bonne décision à chaque fois, une créa venue d'ailleurs
ne décide pas de la taxonomie d'une marque. Mais **rien, nulle part, ne
permettait de valider quoi que ce soit.**

Une carte qu'on ne croit plus ne sert plus à attribuer, ce qui est exactement ce
qu'on lui demande.

---

## D124 — Valider un nœud valide ce qui le porte

**Décision.** Valider un concept remonte ses ancêtres encore proposés, et on le
dit avant le clic.

**Pourquoi.** Un concept validé sous un angle proposé serait accroché à rien.

**Bloquer aurait été l'autre option, et c'est une impasse** · « valide d'abord le
parent » sur un écran qui ne montre pas le parent oblige à chercher. Chaque
branche porte une sortie.

**L'ordre de l'écran suit la chaîne** : personas, désirs, angles, concepts.
Trier par le haut évite de valider vingt fois le même persona sans s'en rendre
compte.

---

## D125 — Refuser n'efface jamais un test payé

**Décision.** Aucune cascade au refus. Ce qui pend en dessous reste à trier, et
on prévient quand des tests y sont accrochés.

**Pourquoi.** Un angle refusé dont un concept a déjà tourné effacerait un test
qu'on a payé. On avertit, on laisse décider.

---

## D126 — Un nom provisoire ne devient pas définitif par distraction

**Décision.** « À qualifier », « (auto) » et les noms de moins de trois
caractères bloquent la validation, et sont **écartés** du geste de masse — avec
la liste de ce qui a été écarté.

**Pourquoi.** Le geste de masse est celui qui répond à la dette · trier trente
concepts un par un, personne ne le fait deux fois. Mais valider « À qualifier »
en lot ferait entrer le provisoire dans la carte définitive, c'est-à-dire
exactement le problème qu'on règle.

**Ce qu'on ne fait pas ici : fusionner.** Re-raccrocher les enfants de deux
personas est un travail à part, et une fusion ratée perd des tests.

---

## D127 — Le brief de pré-lancement arrivait après la génération

**Décision.** La barre de composition interroge la mémoire pendant qu'on écrit,
dans les trois studios.

**Pourquoi.** Jarvis relit ses propres brouillons, et une créa rencontrait son
brief une fois posée dans un lot · c'est-à-dire **après** avoir été fabriquée.
Dire « cette accroche a déjà perdu » à ce moment-là économise le test, pas la
génération. Dans la barre, la même phrase économise les deux.

**Coût nul.** Le brief est calculé depuis les verdicts arbitrés · aucun appel
modèle. Une vérification qui dépenserait à chaque frappe serait coupée dans la
semaine, et à raison.

---

## D128 — Interrompre quelqu'un qui écrit se mérite

**Décision.** Deux cas seulement : une accroche déjà réfutée, ou une réserve
explicite de la mémoire. Une seule phrase, jamais deux.

**Pourquoi.** Une ligne qui apparaît à chaque frappe devient un bruit qu'on
cesse de lire · et la fois où elle compte vraiment, elle est déjà invisible.
Empiler trois réserves dans une barre, c'est demander une revue de code à
quelqu'un qui écrit.

**Un profil simplement moyen ne dit rien. Un concept neuf non plus** · il a par
construction un profil qu'on ne connaît pas, et c'est souvent lui qui ouvre
quelque chose.

**Le préflight passe devant le conseil de scène** quand les deux existent :
« cette accroche a déjà perdu ici » est un fait, « une autre scène fait mieux »
est une comparaison.

---

## D129 — Elle éclaire, elle n'interdit jamais

**Décision.** Le bouton reste actif quoi que dise la mémoire.

**Pourquoi.** Le jour où l'outil empêche de lancer une créa parce qu'un chiffre
lui déplaît, il a cessé d'être un outil.

**Trois silences par construction** : texte trop court (le seuil vient du noyau,
l'écran n'invente pas le sien), marque sans tests mesurés (la mémoire n'aurait
rien à confronter), et vérification en échec — elle n'a jamais empêché de
lancer, elle ne va pas commencer par un message d'erreur.

**La réponse tardive ne s'affiche jamais** · deux vérifications qui se croisent
afficheraient une réserve portant sur une phrase déjà effacée.

---

## D130 — Un cache persistant a besoin d'une version du producteur

**Constat.** Les vignettes restaient cassées après leur correction · les images
composées par la version fautive étaient rangées dans le bucket sous une clé qui
ne portait que l'identifiant, le ratio et l'empreinte du TEXTE.

**Rien n'y disait avec quelle version de la maquette l'image avait été
composée.** La route les retrouvait avant de composer quoi que ce soit : la
correction proportionnelle n'a jamais pu les remplacer. Les pubs récentes
s'affichaient bien, les anciennes gardaient leur titre géant · d'où l'impression
que rien n'avait bougé.

**Corriger un rendu ne corrige rien de ce qui a déjà été rendu.** `RENDER_VERSION`
entre donc dans la clé.

C'est le prix de la persistance introduite en D101, et il n'avait pas été payé.

---

## D131 — Le rappel devient un test

**Décision.** Un test empreint `ad-render.tsx` et `ad-fonts.ts`, et échoue quand
la maquette change sans que la version ait été revue.

**Pourquoi.** « Penser à incrémenter la version » est exactement le genre de
consigne qu'on écrit en commentaire et qu'on n'applique pas · surtout six
semaines plus tard, sur un changement qui paraît cosmétique.

Le test ne peut pas deviner si l'apparence a changé · il oblige à **décider**, et
dit quoi écrire dans les deux cas.

---

## D132 — Le tri ne suffisait pas · il fallait pouvoir rapprocher

**Constat.** Les passerelles créent un persona « À qualifier » chaque fois
qu'aucun n'est fourni. Le tri permettait de l'accepter, de le refuser ou de le
renommer · jamais de le rapprocher d'un autre.

Le résultat est pire que le vide : deux « À qualifier » validés à trois semaines
d'écart deviennent deux personas légitimes, et **plus rien ne signale le
doublon**. La carte prétend alors distinguer ce qu'elle confond, et la mémoire de
Jarvis compte deux fois la même audience.

Renommer les deux ne les rapproche pas · ça donne deux personas au même nom.

**Décision.** Une fusion, avec deux cas et pas un seul :

- **déplacement** · le désir n'existe pas chez la cible, il change de parent ;
- **repli** · un homonyme existe déjà, ses angles rejoignent celui de la cible et
  le doublon est archivé.

Sans le repli, fusionner deux « À qualifier » donnerait deux désirs « À
qualifier » sous un seul persona · on aurait déplacé le problème d'un cran.

La comparaison ignore accents et casse. « Économiser » et « economiser » sont le
même désir, et les laisser cohabiter recréerait le doublon qu'on vient d'effacer.

---

## D133 — L'ordre des écritures d'une fusion n'est pas indifférent

**Les désirs bougent AVANT que la source soit archivée.** Les désirs pendent au
persona, les angles aux désirs, les concepts aux angles, les tests aux concepts ·
une suppression physique du persona emporterait la branche entière, donc des
tests payés.

Rien n'est supprimé : on archive. Un persona effacé emporterait l'historique de
ce qui avait été choisi le jour où les créas ont été générées.

**Le plan est recalculé côté serveur avant d'écrire.** Celui affiché a pu vieillir
· un désir créé entre-temps se replierait mal, et on ne réécrit jamais la carte
sur la foi d'identifiants venus du navigateur.

**Le plan est montré avant le bouton.** La fusion est réversible en droit et pas
en pratique : personne ne se souvient de quel désir venait d'où trois semaines
plus tard. On dit ce qui bouge, chiffres compris, puis on demande.

**Le panneau est rendu même quand il n'y a rien à trier** · c'est justement quand
la file est vide que le doublon validé est le plus invisible. Le cacher derrière
l'état vide reviendrait à retirer l'outil le jour où il sert.

---

## D134 — L'attribution mesurait au mauvais niveau

**Constat.** Le lien génération → créa vivait sur le CONCEPT
(`adsmap_concepts.source_ref`). Ça se voit dès qu'on lit la contrainte
d'unicité des ads : `(concept_id, batch_id, variant_code)`. **Plusieurs ads
pendent au même concept** · les variantes v1, v2, v3 sont exactement ça.

Pire : la passerelle Studio réutilise un concept existant quand le titre
coïncide, sans toucher à son `source_ref`. Deux créas générées à six semaines
d'écart, l'une sans mémoire et l'autre avec, étaient attribuées à la **même**
génération · celle de la première.

**L'erreur n'était pas neutre.** Les concepts anciens sont ceux d'avant la
mémoire. Toute variante récente ajoutée sous l'un d'eux tombait dans le groupe
témoin — la mesure censée dire « est-ce que la mémoire aide » était biaisée
**contre la réponse qu'elle cherchait**. C'est le pire biais possible : il ne
crie pas, il rassure sur la prudence du chiffre.

Le classement « quel prompt gagne » (`presets.ts`) lisait le même pont · un
preset héritait des verdicts de variantes qu'il n'avait pas produites.

**Décision.** `adsmap_ads.source_ref_json` (0044). Le lien est posé sur l'ad,
là où la génération a eu lieu. Le concept ne sert plus que de repli, et
seulement quand **une seule** ad y pend.

## D135 — Une inconnue n'est pas un témoin

Rien n'est rétro-rempli : on ne SAIT pas quelle génération a produit quelle
variante historique.

Devant une ad qu'on ne sait pas rattacher, la tentation est de la compter comme
« sans mémoire ». C'est faux — on ignore ce qu'elle a reçu. Elle est donc
écartée **des deux groupes**.

Une inconnue rangée dans le témoin gonfle le témoin d'exactement ce qu'on essaie
de mesurer. Le calcul distingue quatre origines (`ad`, `concept`, `ambiguous`,
`none`), et seule `none` — aucune génération, donc une ad importée ou saisie à
la main — est un témoin légitime.

**Le nombre d'écartées s'affiche.** Une comparaison qui laisse tomber des tests
en silence a l'air de porter sur tout.

Un test bloque le retour en arrière : rétablir le repli inconditionnel sur le
concept fait échouer « REFUSE le lien du concept quand plusieurs ads y pendent ».

---

## D136 — Un gabarit entier était rangé sous la mauvaise étiquette

**Constat.** La table gabarit → mécanisme vivait dans `adsmap-bridge.ts`, un
fichier `'use server'` · donc intestable. Elle était écrite
`Record<string, string>`, avec des clés inventées au fil de l'eau :
`benefit_stack`, `listicle`, `comparison`, `story`, `demo`, `social_proof`.

**Aucune de ces six clés n'existe dans la liste réelle des gabarits.** Et
`benefits`, qui existe, n'y figurait pas.

Toute créa « Bénéfices annotés » retombait donc sur le défaut, `demo`. Ses tests
s'accumulaient sous une étiquette qui n'était pas la sienne, et la mémoire en
tirait des conclusions sur un mécanisme qu'elle n'avait jamais mesuré.

**Décision.** La table part dans le noyau, typée `Record<StudioTemplate, string>`
· un gabarit ajouté sans mécanisme ne compile plus.

`mechanismForTemplate` rend `null` plutôt qu'un défaut. Celui qui DOIT écrire
quelque chose choisit son repli et l'assume dans son propre fichier · un défaut
caché dans la table reproduirait exactement cette panne.

La liste existe en double (`AD_TEMPLATES` dans `ai`, `STUDIO_TEMPLATES` dans
`core`, deux paquets qui ne se dépendent pas). Un test dans l'application, seul
endroit qui voit les deux, échoue quand elles divergent.

---

## D137 — La vérification arrivait sans le concept

**Constat.** La barre n'envoyait que la description. `prelaunchScore` sait
pourtant situer un mécanisme et un format · les gabarits cochés dix pixels plus
haut étaient ignorés, et la seule réserve possible portait sur l'accroche.

« Ce gabarit-là n'a jamais rien donné ici » ne pouvait pas être dit — alors que
c'est exactement le genre de fait qui fait changer d'avis avant de payer.

**Décision.** Un brief par gabarit envisagé. Le coût reste nul : la mémoire
d'une marque est lue une fois et mise en cache, les briefs suivants ne sont que
du calcul.

**On ne nomme un gabarit que quand ça sert.** Une réserve qui vaut pour tous
n'est pas réparable en changeant de gabarit · la nommer enverrait sur une fausse
piste. Une réserve qui n'en touche qu'un est actionnable : on dit lequel, et
combien passent. C'est la différence entre une information et une consigne.

Le format n'est transmis que depuis le studio Pub (`static`), parce que la
passerelle n'écrit que des ads statiques · envoyer `video_ugc` comparerait à une
case vide en ayant l'air de comparer à quelque chose.

---

## D138 — `pnpm test` pouvait être vert sur du code rouge

**Constat trouvé en vérifiant D136.** Le test inter-paquets échouait quand on le
lançait seul, et **passait** dans `pnpm -w run test`.

`turbo.json` déclarait `"test": {}` · sans `dependsOn`, l'empreinte de
`@tiktrends/web:test` ne couvre que les fichiers de `apps/web`. Les paquets sont
consommés en source (`main: src/index.ts`, pas de `dist`), donc **modifier le
noyau n'invalidait pas le cache des tests de l'application**.

C'est plus grave que n'importe quelle fonctionnalité : ça rend douteux tous les
garde-fous écrits jusqu'ici, y compris ceux qui ont trouvé quelque chose.

**Décision.** `"test": { "dependsOn": ["^test"] }`. L'empreinte d'une tâche
inclut celle de ses dépendances · un changement dans le noyau relance les tests
de l'application, et un noyau rouge empêche le dépendant de se déclarer vert.

Vérifié dans les deux sens : en cassant le noyau (le dépendant ne tourne plus)
et en cassant `@tiktrends/ai` (le test de l'application échoue, alors qu'il
répondait « cache hit » avant le correctif).

---

## D139 — Le démarrage rapide ne montrait rien de ce qu'il faisait

**Rapporté.** « J'ai testé de générer des images en passant par Démarrage
rapide, aucune image générée, est-ce que cette partie fonctionne ? »

Elle fonctionnait. Elle ne le disait pas. Trois causes qui s'additionnent :

**1 · La fenêtre se fermait avant que le travail commence.**
`setQuickOpen(false)` précédait l'appel. Toute la suite — avancement, erreur,
résultat — atterrissait derrière une fenêtre qui n'était plus là. Le clic
n'avait aucune conséquence visible, ce qui se lit comme une panne.

**2 · Le mode était lu avant d'avoir changé.** `setMode('brand')` puis
`await run()` dans le même tour · `run` lisait `mode` dans la fermeture, donc
l'ancienne valeur. Depuis l'onglet « Cloner une pub gagnante », le démarrage
rapide partait dans la branche clone et échouait sur une référence qu'on ne lui
avait jamais demandée. Le mode est maintenant un **argument**.

**3 · Un lot vide sans erreur était un succès silencieux.** La troisième branche
de `applyResult` s'écrivait `setNotice('')` : elle effaçait le dernier message
et n'affichait rien.

**Décision.** `generationOutcome` dans le noyau. **Zéro image produite est
toujours quelque chose à dire** · un retour sans erreur et sans créa n'est pas
un succès muet, c'est un échec dont on a perdu la cause. Le type le garantit :
`done` est le seul cas sans message et exige `got > 0`.

La fenêtre ne se referme que si `producedSomething` · sinon elle reste, avec
l'avancement et l'erreur dedans.

**Et la grille remonte sous les yeux.** Elle est en bas de page : un lot qui
arrive pendant qu'on regarde le formulaire ne se voit pas, et « rien ne s'est
passé » est la conclusion raisonnable quand rien ne bouge dans le champ de
vision.

---

## D140 — On ne choisit pas une ambiance en lisant son nom

**Constat.** L'univers visuel était une rangée de libellés avec une pastille de
couleur. « Éditorial premium » et « Sombre cinématique » ne se départagent pas en
lisant deux lignes · on les reconnaît, ou on ne les choisit pas.

Le seul moyen de savoir ce qu'un univers donnait était **de payer une
génération pour voir**.

**Décision.** Des vignettes, et un filtre par famille.

**L'aperçu est une vraie créa de la marque, pas une image de démonstration.** Une
image de démo montrerait ce que l'univers donne sur un produit qui n'est pas le
sien — c'est-à-dire à peu près ce qu'on devine déjà en lisant son nom. La marque
a déjà payé des générations : la meilleure démonstration est la sienne, et elle
ne coûte rien.

**L'univers n'était pas consigné.** Il entre dans la recette (métadonnée, jamais
rendue · le garde d'empreinte a demandé la décision, l'apparence ne change pas
donc la version reste à 2). Les pubs antérieures n'en portent pas : leur univers
reste sans aperçu jusqu'à la prochaine série. **On ne devine pas** · une vignette
attribuée au mauvais univers vendrait une ambiance pour une autre.

**Les familles répondent à la question qui vient avant le style** : produit seul,
quelqu'un qui s'en sert, ou une ambiance ? Huit vignettes se parcourent, pas se
comparent.

« Varié (auto) » traverse tous les filtres · ce n'est pas un univers, c'est le
refus d'en choisir un, et le cacher obligerait à revenir sur « Tous » pour
renoncer.

**L'univers manquait dans le démarrage rapide.** Il gardait donc silencieusement
celui du formulaire du dessous · un réglage silencieux est un réglage qu'on subit.

Mêmes gardes que pour les gabarits : le catalogue vit dans `ai`, son classement
dans `core`, et un test dans l'application — seul endroit qui voit les deux —
échoue si un univers arrive sans famille, sans phrase ou sans dégradé. Il vérifie
aussi qu'aucun filtre ne ramène rien, ni ne ramasse tout : un filtre qui ne
filtre pas est un bouton qui ment.

---

## D141 — Deux formulaires pour un seul état

**Constat (rapporté).** « Pourquoi gardons-nous le bloc en dessous, c'est
redondant par rapport au démarrage rapide non ? »

Oui. Le composeur ouvrait la page en doublant le démarrage rapide : les mêmes
gabarits, le même produit, le même persona, le même objectif, le même nombre de
variantes, le même modèle, à dix centimètres d'écart.

Et ce ne sont pas deux configurations : **c'est le même état, affiché deux fois.**
Ça ne donne pas deux choix, ça donne deux endroits où chercher celui qu'on a
fait.

**Décision.** Un seul chemin par défaut, deux profondeurs.

Le composeur se replie. Il garde ce que le démarrage rapide ne sait pas faire ·
cloner une pub, charger une photo produit, rappeler une scène enregistrée,
proposer des angles.

**Ce qui manquait au démarrage rapide y entre** :

- **l'angle**, avec sa vérification de pré-lancement. C'est le seul réglage qui
  DIRIGE la série et le seul endroit où la mémoire répond · sans lui, le chemin
  rapide ne produisait que du générique et il fallait redescendre pour dire quoi
  que ce soit ;
- **l'univers visuel** (D140), qui était hérité en silence.

**Le clonage remonte dans l'en-tête**, à côté de « Créer des pubs ». C'est la
seule capacité vraiment absente du chemin rapide · elle justifie que le
composeur existe encore, pas qu'il soit ouvert en permanence.

**Deux détails qui décident si le repli est tenable :**

- les messages (avancement, réserve, erreur) sortent du repli · un message rangé
  dans un panneau fermé est un message absent, et c'est exactement ce qui
  donnait « il ne se passe rien » ;
- le mode clone s'annonce dans l'en-tête replié · sinon sa référence chargée et
  son bouton de lancement disparaissent sans laisser de trace.

---

## D142 — Les aperçus d'univers, fabriqués une fois, jamais deux

**Constat.** Les vignettes d'univers (D140) montrent une créa de la marque quand
il y en a une. Une marque neuve n'en a aucune : elle voit huit dégradés, et la
promesse « choisis à l'œil » ne tient qu'après plusieurs séries payées à
l'aveugle.

**Décision.** Un bouton qui fabrique les huit, sur le produit de la marque.

**Le prix est écrit sur le bouton.** Un prix qu'on découvre après n'est pas un
prix, c'est une facture.

**Rien ne part au chargement d'une page.** Aucune fabrication n'est déclenchée
par une lecture · seul un clic dépense.

**Ce qui existe n'est jamais refait.** Un bouton peut être cliqué deux fois, une
page rechargée, un second onglet ouvert. La règle vit donc dans le noyau, pure
et testée — pas dans l'écran, dont la discipline dépend de l'attention de celui
qui clique. Le plan est **recalculé côté serveur** : un plan reçu du navigateur
referait ce qui existe déjà.

Le plafond ne se négocie pas, et le forçage ne l'ouvre pas · sinon « tout
refaire » deviendrait une dépense qui grandit avec le catalogue sans que
personne ne l'ait décidé.

**Le brief est le MÊME pour les huit.** C'est ce qui rend les vignettes
comparables : si la scène changeait en même temps que l'univers, on ne saurait
pas ce qui a produit la différence, et « choisir à l'œil » reviendrait à choisir
au hasard avec une illustration. Seul le paragraphe de direction artistique
change.

**La créa réelle prime sur l'aperçu fabriqué** · elle porte le vrai travail de la
marque, pas une démonstration. La pastille dit lequel des deux on regarde.

Le moteur est le moins cher du catalogue : un aperçu n'est pas la créa finale.
Un échec sur un univers ne condamne pas les sept autres, et les crédits non
utilisés sont remboursés.

---

## D143 — Sept gabarits, une seule composition

**Constat (rapporté).** « Là nous faisons et obtenons toujours le même résultat,
avec aucun copy sur le visuel. »

Les deux moitiés de la phrase avaient la même cause, et elle était dans le code.

**Les sept gabarits rendaient la MÊME composition** : photo plein cadre, dégradé
noir en bas, texte blanc, pastille d'accent. Ils ne changeaient que les *champs
affichés* — une note en étoiles, une liste à puces, un gros chiffre. Changer le
contenu d'un bandeau ne change pas une publicité : vues dans une grille, sept
gabarits donnaient sept fois la même image.

**Et le copy n'était jamais DANS le visuel.** Il était posé PAR-DESSUS, dans une
bande sombre qui recouvrait une photo qu'on venait de payer. Le texte ne
participait pas à l'image, il la masquait. Le constat était exact au mot près.

**Décision.** Séparer la coquille du contenu.

- **la coquille** décide où va l'image, ce qu'il y a derrière, et sur quel fond
  se lit le texte ;
- **le contenu** décide ce que le gabarit a à dire.

Quatre coquilles · **immersif** (l'existant, il reste légitime), **champ de
couleur** (aplat de marque, photo en carte), **moitié / moitié** (frontière
nette, pas un fondu — un dégradé les rendrait à nouveau jumelles), **affiche
claire** (fond papier, encre sombre, accroche en capitales très grande, la photo
devient un élément).

Vingt-huit rendus à partir de onze morceaux de code.

**Le catalogue n'est plus uniformément sombre.** C'était à soi seul une raison
pour laquelle tout se ressemblait.

## D144 — La variété est une règle, pas une intention

**Aucune mise en page ne se répète tant que toutes n'ont pas servi.** Un tirage
au hasard donnerait deux fois la même sur un lot de quatre une fois sur deux, et
l'impression de « toujours le même résultat » survivrait au travail fait pour la
dissiper.

La distribution se fait par tours complets, décalés d'un lot à l'autre.

**Deux restrictions, et pas une de plus** · une restriction inventée réduirait la
variété qu'on essaie de créer :

- `before_after` garde l'image entière — réduite à une carte, la comparaison
  n'est plus montrée mais suggérée ;
- `ugc` ne devient pas une affiche typographique — ça ne ressemble à rien de ce
  qu'un créateur publie, et ça trahirait ce que le gabarit emprunte.

**Des noms de mises en page différents ne prouvent rien · seul le pixel le
prouve.** Un test rend les quatre coquilles et exige que leurs compositions
diffèrent ; un autre vérifie que chacun des vingt-six couples gabarit × coquille
sort une image ni vide ni uniforme. Vérifié en les faisant retomber toutes sur
l'immersive : le test nomme le couple fautif.

`RENDER_VERSION` passe à 3 · l'apparence change, les rendus déjà rangés doivent
être refaits (D130).

**Les pubs composées avant gardent l'immersive.** Elles n'ont pas de mise en page
consignée, et un ancien rendu ne doit pas changer d'allure parce qu'on a ajouté
des coquilles.

---

## D145 — Le même succès silencieux, trois fois

**Constat.** Le défaut trouvé sur Pub IA (D139) était identique sur Image et
Vidéo. Les trois studios écrivaient :

```
if (res.error) { setError(res.error); return; }
if (res.images) { … }
```

Un retour **sans erreur ET sans rien produit** tombe entre les deux : aucune
branche ne s'exécute, aucun message n'apparaît.

C'est le genre de défaut qui se recopie parce qu'il ressemble à du code prudent.

**Décision.** Les trois passent par `generationOutcome`, et un test vérifie qu'ils
l'importent · un quatrième studio écrit par quelqu'un qui n'a pas lu cette
histoire réécrirait les deux `if` de bonne foi. Vérifié en retirant l'appel du
studio Vidéo : le test échoue en nommant le fichier.

**Trouvé au passage** : « 3 variantes ajoutées » était écrit en dur. Le message
mentait dès qu'une des trois échouait. Le compte vient maintenant de ce qui est
revenu.

## D146 — Un test qui passe pour la mauvaise raison est pire que pas de test

Le message écrit en dur n'a **pas** de garde, et c'est délibéré.

Les deux formes essayées échouaient à leur tâche : la première ne voyait pas un
compte caché dans un ternaire — vérifié, elle restait verte sur le défaut
réintroduit ; la seconde, plus large, sonnait sur des libellés parfaitement
légitimes des trois studios.

Garder l'une ou l'autre aurait laissé une ligne verte à la place d'une
vérification, et rassuré exactement là où il n'y a rien. Le défaut est corrigé,
il n'est pas gardé, et le fichier de test le dit à voix haute.

C'est la même exigence que partout ailleurs ici : un garde se valide en le
faisant échouer, sinon on ne sait pas ce qu'il regarde.

---

## D147 — On cadrait l'image pour une page qu'elle n'occupait pas

**Constat.** Une seule consigne de cadrage partait pour toutes les créas :

> « garde le sujet dans les deux tiers hauts ; garde le tiers bas plus calme pour
> qu'un panneau de texte puisse s'y poser. »

Elle décrit exactement **une** mise en page · l'immersive. Depuis D143 il y en a
quatre, et elle est fausse pour trois d'entre elles :

- le **champ de couleur** recadre l'image dans une carte à mi-hauteur · le tiers
  bas réservé est purement et simplement jeté ;
- la **moitié / moitié** ne garde que le haut · on demandait de calmer une zone
  qui ne serait pas visible ;
- l'**affiche** met l'image en bas, sous un titre géant · réserver de la place
  pour un texte qui est ailleurs gâche la moitié du cadre.

**On payait une image composée pour une page qu'elle n'allait pas occuper.**

**Décision.** La consigne dit maintenant où sera l'image, ce qui la recadrera, et
où le texte ne sera PAS. C'est tout ce que le modèle a besoin de savoir pour
cadrer utile.

Sans coquille connue — passerelle, clonage, créa d'avant — on rend celle de
l'immersive : c'est la mise en page que ces créas reçoivent, et leur rendu reste
identique.

## D148 — La scène et la recette parlent de la même coquille

C'est l'invariant que D147 crée, et il se casse en silence : si le cadrage et la
composition ne désignent pas la même coquille, le sujet se retrouve dans la
moitié coupée et **la créa est perdue sans que rien ne le signale**.

**Une seule expression calcule la coquille**, quatre endroits la lisent. Deux
calculs séparés finiraient par diverger.

`composeBatch` n'est pas exportée et l'exercer demanderait une base et le
fournisseur d'images. Ce qui est vérifiable sans les deux, c'est la propriété de
structure : un test compte les appels à `layoutFor` dans le fichier et exige
qu'il y en ait **un**, et vérifie que la scène ET la recette passent toutes deux
par lui.

Il échoue pour qu'on réfléchisse, pas pour interdire · son message dit quoi
faire. Vérifié en réintroduisant un second calcul : les deux moitiés sonnent.

**Au passage** : la première écriture de ce test passait pour la mauvaise raison.
Sa expression régulière s'arrêtait à la première parenthèse fermante, celle de
`universeFor(i)`, et ne voyait donc jamais le `coquille(` qui suivait. Elle a été
corrigée avant d'être gardée — c'est exactement pourquoi un garde se valide en le
faisant échouer.

---

## D149 — La coquille se mesure comme le reste

**Pourquoi elle n'était pas une dimension.** Parce qu'elle n'existait pas : les
sept gabarits rendaient la même composition (D143). Il n'y avait rien à comparer.

Maintenant qu'il y en a quatre, **« l'affiche claire gagne deux fois sur trois
chez toi » est un fait mesurable** — et c'est le genre de fait qui fait changer
une décision, contrairement à une préférence de goût.

**Décision.** `layout` devient une dimension de la mémoire, au même titre que le
mécanisme ou le format.

La coquille vit dans la génération, pas sur l'ad. On emprunte donc **le pont de
l'attribution** (D134/D135) : lien porté par l'ad, repli sur le concept
uniquement quand une seule ad y pend. Une créa qu'on ne sait pas rattacher n'a
pas de coquille connue et **ne compte dans aucune** · la ranger dans la mauvaise
apprendrait quelque chose de faux, ce qui est pire que de ne rien apprendre.

Elle pèse comme le format dans le score de pré-lancement · c'est une décision de
forme, mesurée sur les mêmes verdicts, et elle ne prétend pas peser autant que le
mécanisme.

**Le préflight la reçoit** : « cette coquille n'a jamais rien donné ici » se dit
AVANT la dépense, pas après le test.

## D150 — On peut imposer une coquille, mais ce n'est pas le défaut

Le composeur propose « Variées (auto) » en premier, et c'est ce qui reste coché.

Imposer la même coquille à tout un lot est un choix légitime — on veut parfois
quatre affiches. Mais en faire le défaut annulerait D144 : la rotation existe
précisément pour qu'un lot ne rende pas quatre fois la même image.

`auto` n'est donc pas une valeur de coquille, ni côté écran, ni côté mesure. La
mesurer reviendrait à inventer une mise en page qui n'existe pas.

Ce que le navigateur envoie est vérifié contre le catalogue · une valeur inconnue
rend la main à la rotation plutôt que d'échouer.

---

## D151 — Rétro-rattacher ce qui est certain, et rien d'autre

**Le trou laissé par D135.** Aucune ad historique n'a été rétro-remplie : on ne
SAIT pas quelle génération a produit quelle variante, et deviner aurait faussé
l'attribution dans le sens qui l'arrange. C'était le bon choix, mais il vide la
mesure sur tout le passé.

**Ce qu'on avait sans le voir.** Un lien certain existait déjà, dans l'autre
sens : la passerelle écrit `generations.input.adsmapAdId` au moment où elle crée
l'ad. Une génération qui porte cet identifiant a produit CETTE ad · c'est une
trace posée par le code, pas une reconstruction.

**Décision.** 0045 rattache exactement ces ads-là, et aucune autre. Les imports,
la veille, les itérations et les ads saisies à la main restent sans lien — elles
n'ont jamais eu de génération, et c'est la bonne réponse.

**Trois précautions, dont deux vérifiées portantes :**

- on ne remplace **jamais** un lien existant · celui posé à l'insertion est plus
  fiable, et rejouer la migration ne doit rien changer ;
- un `CASE` entoure le cast en `uuid` · `adsmapAdId` peut contenir n'importe
  quoi, et PostgreSQL ne garantit pas d'évaluer le filtre avant le cast ;
- `DISTINCT ON` garde la génération la plus ancienne si deux revendiquent la même
  ad. Le cas ne devrait pas se produire — **une migration qui « ne devrait pas »
  rencontrer un cas doit quand même décider ce qu'elle en fait.**

## D152 — Une migration se vérifie en la faisant tourner

Une erreur de SQL n'apparaît que sur le serveur, au pire moment, sur une base
qui compte. Celle-ci a donc été exécutée pour de vrai : PostgreSQL 16 monté à
part, un jeu couvrant les quatre cas plus six valeurs mal formées.

Résultat conforme : l'ad du Studio rattachée, celle qui portait déjà un lien
intacte, l'ad importée sans lien, et sur deux revendications c'est la plus
ancienne qui gagne.

**Deux vérifications valent plus que le résultat lui-même** :

- second passage → `UPDATE 0` · l'idempotence est constatée, pas espérée ;
- migration privée de son `CASE` → `ERROR: invalid input syntax for type uuid:
  "pas-un-uuid"`. **La précaution est portante** : une seule valeur mal formée en
  base aurait fait échouer tout le déploiement.

Sans cet essai, la troisième ligne du fichier aurait été un commentaire optimiste.
