# Inventaire V5 ↔ code réel · Résultats, Jarvis, ADMIN+ (lecture seule, origin/main 394ed04)

> **Historique · 29/10/2026.** L'interface V5 a été retirée (#941) · la référence
> vivante est `docs/spatial/`. Cet inventaire est gardé tel quel · ses chemins
> (`app/(app)/…`, `AppShell`, `components/…`) ne désignent plus forcément du code présent.

> **Recalé sur main 18c45d9, 2026-11-08.** Chaque ligne qui n'était pas « raccordé »
> a été revérifiée sur `main` · statut mis à jour, preuve courte ajoutée en fin de note,
> marquée **18c45d9** (« était « … » » quand le statut a changé). Dans ces preuves,
> `W/` = `product/apps/web` et `C/` = `product/packages/core/src`, quelle que soit
> l'abréviation du reste du fichier. Les lignes « raccordé » d'origine n'ont pas été
> revérifiées. Statuts, comptage et méthode : [MATRICE.md](MATRICE.md) ·
> `node docs/ux-v5/compter-statuts.mjs`.

**Conventions.** `web/` = `product/apps/web/`. « proto » = `proto5/` : c'est la couche la plus récente qui s'affiche. Pour chaque vue :
- #results : v5-r4 ;
- #hypotheses, #lots, #learning : v5-r5 ;
- #import : v5-r8 ;
- #protocol : extension.js ;
- Itérer : v5-r6 ;
- #jarvis : v5-r4 ;
- panneau global : v5-r7, r10 et r12 ;
- #sources : extension.js ;
- rail ADMIN+, finances, marges, dépenses, membres, accès, offres : v5-r11 ;
- #adminperms, #adminincidents : v5-r14 ;
- #prompts, #prompt-edit, #releases, #knowledge, #execution, #jobs, #capabilities, #auditlog : admin-plus.js, avec experience.js pour #admin ;
- #adminpayment, #adminintelligence, #console : gabarit générique d'extension.js (« Non chargé · maquette »).

Gardes réutilisées dans les tableaux :
- **G-adsmap** : `web/lib/adsmap-guard.ts:26`. Feature `adsmap` (formule Plus et rôle member), plus `minRole` facultatif, plus une marque active.
- **G-plateforme(p)** : `web/lib/studios/prompts/garde-prompts.ts`, `gardePlateforme`. Session relue, permission plateforme réservée à l'accès total d'équipe (adminplus ou admin). Un owner ou un admin d'espace est refusé.
- **G-fondateur** : `isFounder(email)` (`web/lib/founder.ts`), plus `roleAtLeast(admin)` sur les pages.
- **G-équipe** : `s.equipe` avec `accesTotal`.

## A. Résultats

| id | vue V5 | contrôle (libellé exact) | ce qu'il fait dans le proto | route/composant réel | action réelle (fichier:ligne) et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| R01 | #results | « Importer des résultats » | va à #import | `/adsmap/import` (`adsmap/import/ImportPanel.tsx`) | `previewImportAction` adsmap-import.ts:33, `applyImportAction` :70 · G-adsmap admin | écrit la taxonomie Adsmap · sans IA | partiel | Le CSV réel importe la carte (Status, Ad Concept), pas des mesures · **18c45d9** · dépôt CSV analysé puis importé, refus qui disent quoi corriger (W/spatial/vues/resultats/Importer.tsx, #1018, #1023, #1026) · il reprend le tableau (colonnes de `SHEET_HEADERS`, C/adsmap/import-sheet.ts:175), pas des mesures |
| R02 | #results | onglets « Vue d'ensemble · Hypothèses · Lots de test · Protocole · Importer · Apprentissages » | liens de sous-vues | onglets de section `rbac.ts` (FEATURES adsmap, tri, lots, protocole, import, suites, ttradar) | gardes de chaque page | · | raccordé | Pas d'écran « Hypothèses » · réel : « Tri des propositions », « Suites », « Radar de veille » |
| R03 | #results | « Analyser avec Jarvis » et puces « Pourquoi la V2 fait mieux ? · Quelle variante tester ensuite ? · Résumé pour le client · Ce qui manque pour conclure » | ouvre le panneau Jarvis prérempli | `/jarvis` (JarvisChat), `adsmap/page.tsx` SectionEssais | route chat (voir J01) ; `essaisViewAction` adsmap-attribution.ts:236 | coût IA par le plafond USD | partiel | Aucun préremplissage ni contexte de lot transmis au chat · **18c45d9** · « Suggérer avec Jarvis » mène à `/jarvis` sans contexte de lot (W/spatial/vues/resultats/Hypotheses.tsx:37) |
| R04 | #results | cartes de lot « Analyser · Importer · Préparer · Ouvrir » | lecture fictive | `/adsmap/lots` (Lots.tsx) | `batchDetailAction` adsmap-batch.ts:137 · G-adsmap | adsmap_batches | raccordé | « Analyser » (Jarvis) à créer · **18c45d9** · une action réelle par lot selon son état (W/spatial/vues/resultats/Lots.tsx:90) · « Analyser » par Jarvis absent (était « partiel ») |
| R05 | #results | bande « Hypothèses → Lots → Importer → Apprentissages » | navigation | PR #785 `components/ParcoursBoucle.tsx`, `core/parcours-boucle.ts` | lecture pure de comptes réels | · | raccordé | Natures « observation, hypothèse, organisation, mesure, apprentissage » · **18c45d9** · #785 fusionné · Spatial · « Boucle d'itération » `/adsmap/boucle` (W/spatial/vues/resultats/Boucle.tsx) et la boucle de l'Accueil (était « raccordé PR #785 ») |
| R06 | #hypotheses, #lots, #learning | bouton de boucle « Itérer · 2 itérations conseillées » | ouvre l'assistant d'itération | `/adsmap/suites` (Suites.tsx) | `iterationPlanAction` adsmap-iterate.ts:70 · G-adsmap | lecture | partiel | Le compteur « conseillées » vient du plan d'itération réel · **18c45d9** · suites du plan d'itération réel (W/spatial/vues/resultats/Suites.tsx) · pas de bouton de boucle sur Hypothèses et Lots |
| H01 | #hypotheses | « Nouvelle hypothèse » (Si / alors / parce que, « Enregistrer », « Annuler ») | ajoute en mémoire | aucun écran | `hypothesis` est un texte sur `adsmap_ads` (db schema.ts:985) et `studio_test_links`, saisi par `createIterationAction` adsmap-iterate.ts:221 | · | partiel | Aucune entité Hypothèse indépendante · **18c45d9** · « Nouvelle hypothèse » mène aux suites, où elle s'écrit depuis un test arbitré (`createIterationAction`, W/spatial/vues/resultats/Hypotheses.tsx:13) · aucune création libre (était « à créer ») |
| H02 | #hypotheses | filtres « Tous · Accroche · Format · Visuel · Texte · Offre » | filtre local | · | · | · | raccordé | `testedVariable` existe sur les annonces · **18c45d9** · filtres par catégorie de variable avec compteurs (W/spatial/vues/resultats/Hypotheses.tsx:35) (était « à créer ») |
| H03 | #hypotheses | kanban « À formuler · Prête à tester · En test · Conclue » | colonnes par statut | · | · | · | raccordé | Aucun statut d'hypothèse en base · **18c45d9** · tableau par avancement (`cartesHypotheses`, C/spatial/resultats/ecrans.ts:148) · sans statut d'hypothèse propre en base (était « à créer ») |
| H04 | #hypotheses | « Ajouter une idée » | ouvre H01 | · | · | · | à créer | **18c45d9** · aucune création libre d'hypothèse (pas d'entité Hypothèse) |
| H05 | #hypotheses | fiche : « Ouvrir le lot · Préparer un lot · Compléter la phrase · Challenger avec Jarvis » | navigation et simulation | · | · | · | partiel | **18c45d9** · une action par carte (lot, suite) (W/spatial/vues/resultats/Hypotheses.tsx:53) · pas de « Compléter la phrase » ni « Challenger » (était « à créer ») |
| H06 | #hypotheses | « Suggérer avec Jarvis » | panneau Jarvis | `/adsmap` BuildPanel | `proposePersonasAction`, `proposeDesiresAction`, `proposeAnglesAction`, `proposeConceptsAction` adsmap-propose.ts:112 à 242 · G-adsmap | crédit `map_proposal` = 5, IA par le plafond USD | partiel | Le réel propose des nœuds de carte, pas des hypothèses · **18c45d9** · lien vers `/jarvis`, sans contexte (W/spatial/vues/resultats/Hypotheses.tsx:37) |
| H07 | #hypotheses | jauge « Priorité estimée » (impact, confiance, effort) | affichage | · | · | · | partiel | **18c45d9** · priorité tirée de la bande du plan d'itération (C/spatial/resultats/ecrans.ts:156) · pas d'impact, confiance, effort (était « à créer ») |
| L01 | #lots | « Nouveau lot » (étapes Hypothèse, Variantes, Protocole, puis « Choisir les variantes ») | ouvre l'assistant Studio | Lots.tsx ; PR #791 `PreparerEssai.tsx` | `createBatchAction` adsmap-batch.ts:257 (G-adsmap admin), `setBatchAdAction` :277 ; PR #791 `preparerLotEssai` (`gardeStudio studio.propose` et accès Adsmap) | adsmap_batches · PR #791 : lecture pure, sans coût | raccordé | Un lot réel regroupe des annonces existantes ; PR #791 fait varier une seule variable sur les variantes Studios · **18c45d9** · « Nouveau lot » (`createBatchAction`) puis composition sur la fiche (W/spatial/vues/resultats/Lots.tsx:3, ActionsLot.tsx) · #791 fusionné, « Préparer un lot d'essai » (W/spatial/vues/projet/Rattachement.tsx) (était « partiel / raccordé PR #791 ») |
| L02 | #lots | filtres « Tous · En préparation · En diffusion · À importer · À conclure » | filtre local | Lots.tsx | `listBatchesAction` adsmap.ts:233 | · | raccordé | Les statuts réels du lot sont différents · **18c45d9** · Tous · En préparation · En diffusion · À importer · À conclure (`FILTRES_LOTS`, C/spatial/resultats/lots.ts:251) (était « partiel ») |
| L03 | #lots | « Lancer », puis « Compléter le protocole » ou « Lancer quand même » | contrôle du protocole puis notification | Lots.tsx | `prepareBatchAction` :316, `launchBatchAction` :381 · G-adsmap admin | écrit le statut | partiel | Contournement « quand même » non prévu · **18c45d9** · « Lancer » (`launchBatchAction`, W/spatial/vues/resultats/ActionsLot.tsx) · pas de « Lancer quand même » · **lot 3** · hors préparation, « Marquer le lot lancé » reste fermé avec sa raison écrite à côté (W/spatial/vues/resultats/ActionsLot.tsx) · aucune règle écrite n’autorise « Lancer quand même » (le protocole de `prepareBatchAction` l’interdit · dépenses inégales, verdicts incomparables), il n’est pas codé |
| L04 | #lots | « Suivre » ou titre du lot (tiroir) | détail fictif | Lots.tsx | `batchDetailAction` :137 | lecture | raccordé | |
| L05 | #lots | « Importer » et « Importer les mesures » | va à #import | `/adsmap` SyncButton | `syncAdsMapAction` adsmap.ts:267 (admin, Meta), plus `cron/adsmap` | mesures Meta | partiel | Les mesures viennent de la synchronisation Meta, pas d'un import CSV · **18c45d9** · « Mesurer maintenant » lance la synchro Meta (W/spatial/vues/resultats/Importer.tsx) · pas d'import CSV de mesures |
| L06 | #lots | « Conclure », choix « Hypothèse confirmée · infirmée · Non concluante », « Conclure et créer l'apprentissage » | notification | `adsmap/AdDrawer.tsx` | `validateVerdictAction` adsmap-verdict.ts:228 · G-adsmap | verdict et `adsmap_learnings` obligatoires | raccordé | Le verdict se rend par annonce, pas par lot ; apprentissage de 600 caractères au plus · **18c45d9** · conclusion variante par variante avec apprentissage exigé (`validateVerdictAction`, W/spatial/vues/resultats/ActionsLot.tsx) · pas de conclusion du lot entier · **lot 3** · conclusion du LOT entier au-dessus du verdict du moteur · confirmée, infirmée, non concluante, contre les autres lots de la marque (`conclusionLot`, C/spatial/resultats/conclusion-lot.ts · 4 variantes tranchées, 4 verdicts de référence, Wilson 0,9 disjoints, seuils mesurés) · elle est CALCULÉE, pas choisie à la main · l’arbitrage reste variante par variante avec apprentissage exigé (`validateVerdictAction`) (était « partiel ») |
| L07 | #lots | « Itérer sur B » | assistant d'itération | AdDrawer, Suites | `createIterationAction` adsmap-verdict.ts:347 et adsmap-iterate.ts:221 | arête d'itération | raccordé | **18c45d9** · itérer une gagnante (`createIterationAction`, W/spatial/vues/resultats/ActionsFiche.tsx) (était « partiel ») |
| L08 | #lots | « Analyser avec Jarvis » et « Demander un point d'étape » | panneau Jarvis | · | · | · | à créer | **18c45d9** · aucun |
| L09 | #lots | « Dupliquer » | notification | · | · | · | raccordé | **18c45d9** · aucun · **lot 3** · « Dupliquer le lot » · `duplicateBatchAction` (W/app/actions/adsmap-batch.ts · admin, marque active) · lot neuf en préparation, variantes en brouillon, ni nom régie, ni identifiant Meta, ni verdict (`structureVariante`) (était « à créer ») |
| L10 | #lots | variantes avec barre de mesure et « Volume minimum » | affichage | Lots.tsx et verdicts calculés | `batchDetailAction` | lecture | raccordé | **18c45d9** · verdict du moteur par variante, cible CPA, volume minimum, intervalle (W/spatial/vues/resultats/Lot.tsx) (était « partiel ») |
| L11 | #lots | « Voir les créations » | va au projet | PR #791 PanneauVariantes (suivi Adsmap) | `rattacherVarianteAuTest` tests.ts:25 | studio_test_links | raccordé | **18c45d9** · #791 fusionné · Spatial · variantes et tests dans l'onglet Créations (W/spatial/vues/projet/OngletCreations.tsx) (était « raccordé PR #791 ») |
| P01 | #protocol | champs « Indicateur principal · Période de comparaison · Volume minimum avant décision » et « Enregistrer le brouillon » | `saveForm` local | `/adsmap/protocole` ProtocolForm.tsx | `saveSettingsAction` adsmap-protocol.ts:81 (garde admin), `suggestSettingsAction` :135 | adsmap_test_protocols et verdict_configs | raccordé | Réglage par marque et non par lot, sans état « brouillon » |
| P02 | #lots | « Définir les seuils » | va à #protocol | lien | · | · | raccordé | |
| I01 | #import | Meta Ads « Connecter » et « Gérer » | `adsConnect` simulé | `/connections`, `/api/oauth/meta` et son callback | `syncAdsMapAction` | jetons OAuth | raccordé | |
| I02 | #import | TikTok Ads « Connecter » | simulé | `/api/oauth/tiktok/route.ts` (redirection seule) | aucun callback ni synchronisation | · | décision Kevin | Nouveau connecteur publicitaire · **18c45d9** · reste à Kevin · « Bientôt », sans bouton actif (W/spatial/vues/resultats/Importer.tsx) |
| I03 | #import | Google Ads « Connecter » | simulé | aucun (l'OAuth Google sert à Drive) | · | · | décision Kevin | Nouveau connecteur · **18c45d9** · reste à Kevin · « Bientôt » (W/spatial/vues/resultats/Importer.tsx) |
| I04 | #import | « Déposer un fichier CSV » (Meta, TikTok, Google) | notification | ImportPanel | `previewImportAction` :33, `applyImportAction` :70 (admin, 4 Mo) | taxonomie | partiel | Format différent de celui affiché · **18c45d9** · CSV du tableau historique ou de l'export Résultats, séparateur détecté (#1018), modèle téléchargeable (W/spatial/vues/resultats/Importer.tsx) · pas de CSV Meta, TikTok, Google |
| I05 | #import | « Dernières remontées » | journal fictif | SyncButton (`syncedAt`) | · | · | raccordé | **18c45d9** · dernière mesure Meta et lots repris du tableau (W/spatial/vues/resultats/Importer.tsx) (était « partiel ») |
| I06 | #import | listes « Lot » et « Source », « Prévisualiser les colonnes » | aperçu fictif | ImportPanel (rapport et échantillon) | `previewImportAction` | aucune écriture | partiel | Pas de choix de lot · **18c45d9** · aperçu des colonnes lues et absentes (`previewImportAction`, `guideColonnes`) · pas de choix de lot ni de source |
| A01 | #learning | filtres « Tous · À valider · Validés · À retester » | filtre local | `/adsmap/suites` et la section `#appris` de /adsmap | · | adsmap_learnings (portée) | raccordé | Pas de statut « à valider » ni « à retester » · **18c45d9** · filtres par niveau de preuve et « À valider » = lots prêts à conclure (W/spatial/vues/resultats/Apprentissages.tsx:42) · pas d'« À retester » · **lot 3** · filtres d’état « Tous · À valider · Validés · À retester » en plus des niveaux de preuve (W/spatial/vues/resultats/Apprentissages.tsx) · « À retester » CALCULÉ (`etatApprentissage` · rejeté, ou validé sur un verdict non concluant, sous-diffusé ou relatif) (était « partiel ») |
| A02 | #learning | niveaux « Mesuré · Observé · Non mesuré » | légende | PR #785 `LIBELLE_NATURE` | · | · | raccordé | **18c45d9** · #785 fusionné · Spatial · niveau de preuve (`niveauPreuveApprentissage`, W/spatial/vues/resultats/Apprentissages.tsx:11) (était « raccordé PR #785 ») |
| A03 | #learning | « Valider » et « Rejeter » | notification | AdDrawer, Inbox | `validateVerdictAction` :228 ; `resolveDecisionAction` adsmap-decisions.ts:99 (`review_learning`) | · | raccordé | **18c45d9** · validation par la fiche du lot (`validateVerdictAction`) · pas de « Rejeter » sur l'apprentissage · **lot 3** · « Rejeter » et « Rétablir » sur la carte · `rejeterApprentissageAction` (W/app/actions/adsmap-apprentissage.ts · drapeau `refuted`, rien d’effacé, marque active) (était « partiel ») |
| A04 | #learning | « Nouvelle hypothèse » et « En tirer une hypothèse » | ouvre H01 | · | · | · | à créer | **18c45d9** · aucune hypothèse tirée d'un apprentissage · **lot 3** · non traité · le lot 1 (hypothèse libre) n’a encore exposé aucune action de création d’hypothèse sur `origin` · rien n’est branché ici |
| A05 | #learning | « Itérer » | assistant | Suites | `createIterationAction` adsmap-iterate.ts:221 | · | raccordé | **18c45d9** · « Itérer » sur un apprentissage validé (W/spatial/vues/resultats/Apprentissages.tsx:79) · **lot 3** · « Itérer » ouvre la préparation du projet depuis CETTE variante (`lienIterationStudio`) et seulement depuis une gagnante au protocole (`actionApprentissage`) · sinon « Voir le lot » (était « partiel ») |
| A06 | #learning | « Appliquer » et « Ajouter aux règles de la marque » | notification | JarvisRules.tsx | `saveJarvisRulesAction` actions/jarvis.ts:27 | brands.creative_rules | raccordé | Saisie manuelle, pas d'envoi depuis un apprentissage · **18c45d9** · règles de marque écrites à la main (W/spatial/vues/marque/regles-client.tsx) · pas d'envoi depuis un apprentissage · **lot 3** · « Ajouter aux règles de la marque » · `apprentissageVersReglesAction` écrit par `saveJarvisRulesAction` (mêmes gardes · admin, Jarvis, marque active), une « Préférence », trace `evidence.regle` · la page Règles dit « d’un apprentissage » (était « partiel ») |
| A07 | #learning | « Résumer avec Jarvis » | panneau Jarvis | · | · | · | à créer | **18c45d9** · aucun |
| A08 | #learning | tiroir « D'où ça vient · Limites · Vaut pour » | affichage | adsmap_learnings (`scope`, schema.ts:854) | · | · | raccordé | **18c45d9** · portée et confiance saisies à l'arbitrage (W/spatial/vues/resultats/ActionsFiche.tsx) · pas de tiroir « D'où ça vient » · **lot 3** · tiroir « D’où ça vient · Limites · Vaut pour » sur chaque carte (`tiroirApprentissage` · source, lot, verdicts, date, niveau, confiance, conclusion du lot, portée) (était « partiel ») |
| IT01 | Itérer | « Itérer », « Itérer sur une autre créative » | assistant en 3 étapes | Suites | `iterationPlanAction` :70, `createIterationAction` :221 (member, hypothèse obligatoire) | arête | raccordé | **18c45d9** · `/studio/iterer` et « Préparer l'itération » (W/spatial/vues/studios/Iterer.tsx) (était « partiel ») |
| IT02 | Itérer | « Continuer », « Préparer l'itération », « Retour », radios « Format · Durée · Appel à l'action · Visuel » | choix local | · | `testedVariable` | · | partiel | **18c45d9** · étape 1 réelle, la variable vient du plan (W/spatial/vues/studios/Iterer.tsx:66) · pas de choix libre |
| IT03 | Itérer | « Voir le devis et générer » | assistant Studio, étape budget | Studios (devis serveur dans `actions/studios/execution.ts`) | `gardeStudio` | crédits | partiel | **18c45d9** · le devis serveur vient au projet, après la reprise du brief |
| IT04 | Itérer | « Devis : 24 crédits », « Devis : 4 crédits » | affichage | `CREDIT_COSTS` (core credits.ts:7) | · | · | décision Kevin | Crédits par action · **18c45d9** · reste à Kevin |
| IT05 | prompts conseillés | « Lancer comme itération », « Utiliser », « Copier » | assistant | · | · | · | partiel | **18c45d9** · « Utiliser », « Copier » (W/spatial/vues/studios/Prompts.tsx:78) · pas de « Lancer comme itération » (était « à créer ») |

## B. Jarvis

| id | vue | contrôle | proto | route réelle | action et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| J01 | #jarvis | zone « Demandez-moi n'importe quoi sur Neva… » et « Envoyer » | fil simulé | `/jarvis` JarvisChat.tsx | `POST` api/jarvis/chat/route.ts:59 · `refusJarvis` (feature jarvis : member et formule Core), marque active, `guardedAnthropic` | jarvis_messages ; trace studio_prompt_runs ; plafond USD sur 30 j ; aucun débit de crédit client | raccordé | |
| J02 | #jarvis | « Joindre un fichier » | notification | · | · | · | à créer | **18c45d9** · aucune pièce jointe |
| J03 | #jarvis | sources cochables « Meta · TikTok · Veille · Fiche marque » | cases locales | · | contexte assemblé côté serveur (mémoire Adsmap si droit, règles, connaissances) | · | partiel | Le choix n'est pas laissé au client · **18c45d9** · puce « Fiche marque » qui inclut ou exclut le contexte réel (W/spatial/vues/jarvis/Jarvis.tsx:325) · pas de choix Meta, TikTok, Veille (était « à créer ») |
| J04 | #jarvis | catégories « Stratégie · Angles · Accroches · Concurrents · Résultats · Créatif · Inspiration » et cartes de prompts | préremplit | JarvisChat (3 suggestions au plus) | · | · | raccordé | **18c45d9** · catégories et pistes qui préparent la question (W/spatial/vues/jarvis/Jarvis.tsx:25) (était « partiel ») |
| J05 | #jarvis | « Nouvelle conversation » | vide l'affichage | JarvisChat « Effacer le fil » | `clearChatAction` jarvis-chat.ts:161 | supprime le fil | raccordé | Un seul fil par marque et par utilisateur · **18c45d9** · « Nouvelle conversation » (W/spatial/vues/jarvis/Jarvis.tsx:284, migration 0057) (était « partiel ») |
| J06 | #jarvis | « Mes conversations » et liste « Conversations » | simulé | · | · | · | raccordé | **18c45d9** · liste « Conversations », recherche, renommer (W/spatial/vues/jarvis/Jarvis.tsx:286, #899) (était « à créer ») |
| J07 | #jarvis | « Documents & sources » | va à #sources | `/jarvis/sources` | · | · | raccordé | |
| J08 | #jarvis | « Actions programmées » ; « Itérations de la semaine · Activer », « Rapport Jarvis · Connecter », « Convention de nommage · Configurer » | notifications | `api/cron/digest` (récapitulatif hebdomadaire côté serveur) | aucune action de réglage | · | à créer | **18c45d9** · pilote automatique et rapport affichés désactivés « à venir » (W/spatial/vues/jarvis/Jarvis.tsx:395) |
| J09 | #jarvis | liens « Projets » | navigation | `blocProjetsJarvis` (contexte seul) | · | · | raccordé | **18c45d9** · colonne de contexte « Projets » (W/spatial/vues/jarvis/Jarvis.tsx:468) (était « à créer ») |
| J10 | #jarvis | « Fiche marque 72 % · Compléter » | lien | · | · | · | raccordé | **18c45d9** · « Fiche marque · N % » (W/spatial/vues/jarvis/Jarvis.tsx:484) (était « à créer ») |
| J11 | #jarvis | indicateurs « Dépense · CPA · ROAS · Valeur d'achat » et « Demander pourquoi » | chiffres fictifs | `jarvisStats` (mémoire), sections Jarvis | · | · | raccordé | **18c45d9** · chiffres clés Meta Dépense, CPA, ROAS, Valeur d'achat et « pourquoi » préparé (W/spatial/vues/jarvis/Jarvis.tsx:407, `chiffresClesMeta`, #947) (était « à créer ») |
| J12 | #jarvis | cartes de réponse « Créer un projet » et « Garder » | simulé | boutons d'action analysés par `parseAnswer` et `actionsPromptBlock` | · | · | partiel | **18c45d9** · « Créer un projet » (W/spatial/vues/jarvis/Jarvis.tsx:271) et « Écrire ce concept » · pas de « Garder » |
| J13 | #jarvis, panneau | réponse en cours (étapes de travail) | animation | flux réel (`visibleWhileStreaming`) | route chat | · | raccordé | |
| J14 | #jarvis, panneau | état d'erreur | absent du proto | JarvisChat (403, 503 service inactif, 429 `SpendBlockedError`, coupure réseau) | · | · | raccordé | |
| J15 | #jarvis, panneau | historique | simulé | `chatThreadAction` jarvis-chat.ts:77 (40 derniers messages) | `refusJarvis` | · | raccordé | |
| G01 | partout | orbe flottant « Jarvis » (#jvfab) | ouvre le panneau | · | · | · | raccordé | Masqué dans ADMIN+ par le proto · **18c45d9** · bulle Jarvis de la coquille (W/spatial/coquille/Coquille.tsx:283) (était « à créer ») |
| G02 | partout | touche J | ouvre le panneau | seuls Alt B et Alt F existent | · | · | à créer | **18c45d9** · aucune touche J (W/spatial/coquille/Coquille.tsx:204) |
| G03 | partout | contexte de page (« Sur cette page ») | puces par route | dans un projet seulement : `components/studios/canvas/cibler-jarvis.ts`, PropositionsProjet | `proposerPatch` propositions.ts:36, `proposerBrief` :45 | crédits et release | partiel | **18c45d9** · le tiroir parle avec la marque active, la page n'est pas transmise (C/spatial/coquille/jarvis.ts:8) · le panneau d'un projet porte son contexte |
| G04 | panneau, projet | suggestions rapides « Analyser les variantes · Prochaine itération · 3 accroches · Conformité marque » | réponses écrites d'avance | propositions Studios ; Score Jarvis (crédit `score` = 2) | · | · | partiel | **18c45d9** · suggestions = entrées réelles du fil (`suggestionsTiroirJarvis`) et actions typées du concept dans un projet |
| G05 | projet | panneau ancré « Dans ce projet », « Ouvrir en plein écran », « Joindre », « Envoyer » | simulé | PropositionsProjet ; PR #782 rend Jarvis masquable (cookie) | · | · | partiel | **18c45d9** · #782 retiré avec la V5 · Spatial · panneau Jarvis du projet sur son fil lié (W/spatial/vues/projet/PanneauJarvis.tsx) · ni plein écran ni pièce jointe (était « raccordé PR #782 (partiel) ») |
| G06 | panneau | « Appliquer » (accroche au nœud) | notification | PropositionsProjet | `appliquerProposition` :62, `rejeterProposition` :68 | version du document | raccordé | |
| G07 | panneau | « Créer l'itération », « Conclure le lot », « Pourquoi ? », « Autre variable », « Tester », « Corriger le texte » | navigation et simulation | · | · | · | partiel | Pas de passerelle Jarvis vers Adsmap · **18c45d9** · « Écrire ce concept » crée un brouillon dans Résultats (`draftConceptAction`) · pas de « Conclure le lot » ni « Créer l'itération » (était « à créer ») |
| G08 | panneau | « Fermer », voile, Échap, « Préciser la consigne… » | local | · | · | · | raccordé | **18c45d9** · tiroir fermé par Échap et « Fermer » (W/spatial/coquille/Coquille.tsx:205, TiroirJarvis.tsx) (était « à créer ») |
| S01 | #sources | tableau « Source · Portée · Statut » (Brief, Référence audit, Résultats, Consignes ADMIN) | lignes fictives | `/jarvis/sources` (« Ce qui tourne, en ce moment », MemoryBlock, DescribePanel, « Ce que Jarvis coûte ») | `refusJarvis` | · | raccordé | Le contenu réel est différent |
| S02 | #sources | « Revenir à Jarvis » | navigation | lien vers /jarvis | · | · | raccordé | |
| S03 | #sources | ligne « Consignes ADMIN · Release active » | texte | release visible uniquement dans /admin/ia-studios | · | · | partiel | **18c45d9** · release visible au registre IA seulement (`/admin/prompts/registre`) |

## C. ADMIN+

| id | vue | contrôle | proto | route réelle | action et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| X01 | profil | « Ouvrir ADMIN+ » et « Entrer dans ADMIN+ » | entrée de démonstration | section `Admin` du menu profil (rbac AccountSection) | garde propre à chaque page | · | raccordé | |
| X02 | rail | rail ADMIN+ dédié : badge, groupes (Pilotage, Clients, Offre, IA, Plateforme) ; en V4 : Vue d'ensemble, Prompts & versions, Connaissances, Activité IA, Coûts, Accès | rail | PR #790 `BarreOnglets.tsx` et `core/onglets-reglages.ts` (onglets groupés, chacun affiché seulement si la garde réelle l'ouvre) | · | · | raccordé | Tickets et Données sont hors périmètre ; /support existe · **18c45d9** · #790 fusionné puis remplacé · Spatial · section « Tour de contrôle » à sous-navigation (W/spatial/vues/admin/sous-nav.ts) (était « raccordé PR #790 (onglets, pas de rail) ») |
| X03 | rail | accordéon « Gestion avancée » (Traçabilité IA, Journal d'audit, Capacités Studios, Paiements, Intelligence, État technique) | `<details>` | · | · | · | raccordé | La plupart des destinations existent (voir § 1) · **18c45d9** · registre IA, incidents, connaissances, interrupteurs, console, crédits, stockage dans la sous-navigation (W/spatial/vues/admin/sous-nav.ts) · pas d'accordéon (était « à créer ») |
| X04 | rail | « ← Retour à l'espace créatif » | lien | « ← Retour à l'app » existe sur les écrans de refus | · | · | caduc | Travail léger · **18c45d9** · le rail créatif reste affiché dans le Tour de contrôle Spatial (était « à créer ») |
| X05 | barre de contexte | liste « Espace » ou « Portée » (Agence GLX, Marque Neva) | notification | aucune (registre global) | · | · | à créer | Ne doit élargir aucun droit · **18c45d9** · aucun sélecteur d'espace ou de portée |
| AD01 | #admin | bandeau « MRR · Membres actifs · Marge brute · Tickets ouverts · Dépenses réelles » | fictif | `/admin` « Tableau de bord » | G-fondateur | · | raccordé | **18c45d9** · MRR, ARR, marge brute, tickets ouverts (W/app/(spatial)/sp/admin/page.tsx:54-59) (était « partiel ») |
| AD02 | #admin | raccourcis « Membres · Tickets · Finances · Coûts & marges · Offres & Stripe · Données » | liens | liens d'admin/page.tsx | · | · | raccordé | **18c45d9** · sous-navigation et alertes à lien (C/spatial/admin/pilotage.ts:32-36) (était « partiel ») |
| AD03 | #admin | « Préparer la consigne », « Examiner », « Vérifier », bande « Sources → Consignes → Validation → Résultat », « Voir les coûts », « Consulter le journal » | navigation | ia-studios, `/admin/depenses#a-reconcilier`, `/admin/connaissances` | · | · | partiel | Le journal est à créer · **18c45d9** · registre IA et réconciliation (`/admin/depenses`) · pas de bande « Sources → Consignes → Vérifier » |
| PR01 | #prompts | « Éditer la direction », « Éditer », « Consulter » | navigation | `/admin/ia-studios?onglet=prompts&cle=` (EcranVersions) | page : G-plateforme(`prompt.read`) | · | raccordé | |
| PR02 | #prompts | « Rechercher une consigne… » | filtre local | · | · | · | à créer | **18c45d9** · aucune recherche dans la Bibliothèque IA |
| PR03 | #prompts | filtre « Tous · Image · Vidéo · Jarvis » | filtre local | onglets Prompts et Recettes de style (types template, conversation, socle, rendu) | · | · | raccordé | **18c45d9** · familles de prompts en onglets avec compteurs (W/spatial/vues/admin/prompts-client.tsx:29) (était « partiel ») |
| PR04 | #prompts | « Voir les validations » et « Préparer une release » (gabarit extension.js) | tiroirs | onglets Évaluations et Releases | · | · | raccordé | Le réel a aussi « Importer en brouillon » et « Valider les brouillons importés » (`importerPackAction` :43, `validerImportsAction` :47) |
| PE01 | #prompt-edit | zone « Consigne » | saisie locale | EditeurBrouillon (Commandes.tsx:167) | · | · | raccordé | |
| PE02 | #prompt-edit | pastilles « Variables attendues » | statique | `requiredVariables` ; contrôle `VARIABLE_NON_RESOLUE` (core prompts/release.ts:295) et `controlesStructurels` (depot-prompts.ts:347) | · | · | partiel | Pas de pastilles à l'écran · **18c45d9** · `requiredVariables` contrôlées, pas de pastilles |
| PE03 | #prompt-edit | « Enregistrer le brouillon » | mémoire | EditeurBrouillon | `enregistrerBrouillonAction` prompts.ts:51 · G-plateforme(`prompt.draft`), motif audité, `empreinteAttendue` (conflit d'écriture) | studio_prompt_versions ; la release active n'est jamais touchée | raccordé | |
| PE04 | #prompt-edit | « Comparer » | tiroir avec le brouillon en cours | `?comparer=` et bloc « Différences » (Ecrans.tsx:133 à 146) | · | · | partiel | Compare deux versions enregistrées, pas la saisie non enregistrée · **18c45d9** · comparaison de versions enregistrées au registre (W/spatial/vues/admin/Registre.tsx) |
| PE05 | #prompt-edit | « Contrat d'usage » et « Préparer la release » | navigation | onglet Releases, FormulaireRelease | `creerReleaseAction` :59 (`prompt.draft`) | · | raccordé | Contrat consommateur : `chargerSource().consommateurs` |
| PE06 | #prompt-edit (réel) | « Valider cette version » | absent du proto | EcranVersions | `validerVersionAction` :55 (`prompt.draft`) | la version devient figée | raccordé | |
| RL01 | #releases | liste « 1. Brouillon · 2. Structure · 3. Qualité » | états locaux | EcranReleases (statuts staged, published, retired, revoked) | · | · | partiel | **18c45d9** · statuts de release au registre (W/spatial/vues/admin/Registre.tsx) |
| RL02 | #releases | « Vérifier la structure » | contrôle local | « Évaluer » | `evaluerReleaseAction` :63 (`prompt.evaluate`) | studio_prompt_evaluations · sans IA | raccordé | |
| RL03 | #releases, #execution | « Voir l'aperçu final » et « Voir la consigne compilée » | tiroir | · | · | · | à créer | Les traces ne gardent que des empreintes · **18c45d9** · les traces ne gardent que des empreintes |
| RL04 | #releases | case « Je valide l'exemple pour cette maquette seulement » | case cochée côté client | `BoutonRecetteManuelle` et `BoutonBenchmarkApprouve` | `approuverRecetteManuelleAction` :106 (`prompt.publish`, motif, confirmation) ; `approuverBenchmarkAction` :95 (`prompt.evaluate`) | audit | raccordé | **18c45d9** · validation côté serveur (recette manuelle, benchmark) au registre (était « raccordé (validé côté serveur, pas par case) ») |
| RL05 | #releases | benchmark | mention seulement | EcranBenchmark | `devisBenchmarkAction` lib/studios/benchmark/actions.ts:21, `approuverBudgetBenchmarkAction` :35, `joindreFichesBenchmarkAction` :62 | dépense IA plafonnée par budget | raccordé | |
| RL06 | #releases | « Simuler la publication » | met `releaseLive` à vrai | `BoutonConfirme` (publier) | `publierReleaseAction` :70 (`prompt.publish`, confirmation, pointeur attendu comparé avant écriture, `utilisableEnProduction`) | pointeur studio_prompt_active et audit | raccordé | |
| RL07 | #releases | « Retirer la release de démonstration » | met `releaseLive` à faux | « Retirer », « Révoquer », « Revenir à cette release » | `retirerReleaseAction` :85 (`prompt.publish`, release non pointée) ; `revoquerReleaseAction` :80 (`prompt.rollback`, motif, confirmation) ; `rollbackReleaseAction` :75 (`prompt.rollback`, confirmation) | audit, historique conservé | raccordé | |
| K01 | #knowledge | tableau « Document · Portée · Source · État », « Vérifier », « Consulter » | tiroir | `/admin/connaissances` EcranConnaissances | `chargerConnaissancesAction` connaissances.ts:61 · garde :41 `peutGererConnaissances(s.equipe.role)` | app_settings `connaissance:*` | raccordé | |
| K02 | #knowledge | « Valider en démo » et « Révoquer en démo » | bascule locale | idem | `publierConnaissanceAction` :158, `retirerConnaissanceAction` :170 | prend effet à la réponse suivante (empreinte en base) | raccordé | |
| K03 | #knowledge | « Ajouter une connaissance » (Titre, Source, Portée) et « Enregistrer le brouillon » | `saveForm` | idem | `creerConnaissanceAction` :107, `nouvelleVersionAction` :132 | portée plateforme, espace ou marque, vérifiée (`porteeExiste`) | partiel | « Source » n'est que l'origine (saisie, collage, fichier) ; aucune date d'expiration · **18c45d9** · connaissances avec portée confirmée (W/spatial/vues/admin/connaissances-client.tsx:177) · aucune date d'expiration |
| K04 | #knowledge | « Voir les limites » | va à #learning | · | · | · | à créer | **18c45d9** · aucun |
| E01 | #execution | fiche (Projet, Action, Release, Sources, Modèle, Coût réel, Sortie) | fictive | `/admin/ia-studios?onglet=executions&run=` (EcranExecutions) | `vueExecutions` (donnees.ts:130) · `run.inspect_redacted` | studio_prompt_runs | raccordé | Traces expurgées, sortie jamais en clair |
| E02 | #execution | « Ouvrir le projet » et « Voir le journal » | navigation | identifiants de liens dans la trace | · | · | partiel | **18c45d9** · identifiants de liens dans la trace du registre · pas de « Voir le journal » (était « partiel / à créer ») |
| JB01 | #jobs (Activité IA) | tableau « Tâche · État · Dépense » et « Examiner » | tiroir | `/admin/depenses` (« 25 derniers appels ») | G-fondateur | ai_spend | partiel | Pas de liste admin des studio_jobs · **18c45d9** · derniers appels `ai_spend` (W/spatial/vues/admin/Couts.tsx) · pas de liste admin des `studio_jobs` |
| JB02 | #jobs | « Simuler le rapprochement » | état local | SectionReconciliation | `reconcilierDepenseAction` reconciliation-depense.ts:37 (fondateur, audité, idempotent) | ai_spend_reconciliations | raccordé | |
| JB03 | #jobs | « Préparer un nouveau devis » et « Voir le livrable » | navigation | devis Studios ; `api/studios/export/[versionId]` | gardeStudio | · | partiel | **18c45d9** · nouveau devis côté Studios, export par version |
| C01 | #capabilities | « Examiner » (Image, Vidéo, Voix, Export) | tiroir en lecture | `/admin/studios-interrupteurs` ; onglet « Routage » d'ia-studios en lecture | `enregistrerInterrupteursEspaceAction` interrupteurs.ts:24, `enregistrerBudgetEssaiAction` :47 · G-plateforme(`provider.configure`), motif et confirmation | audit | raccordé | Le réel permet d'écrire, le proto non |
| AU01 | #auditlog | « Journal d'audit » | journal de session | aucun écran | studio_audit_events est écrit (`lib/studios/audit.ts`) | · | partiel | Aucune table d'audit plateforme (reconciliation-depense.ts:28) · **18c45d9** · « Registre d'audit » de la plateforme (`studio_audit_events` de portée plateforme, W/spatial/vues/admin/Droits.tsx:51) (était « à créer ») |
| AC01 | #activity | tableau des événements, « Versions restaurables », « Traçabilité Jarvis » | local | versions de document Studios | · | · | partiel | **18c45d9** · versions de document Studios · pas de tableau d'événements côté client |
| F01 | #adminfinance | « Exporter (CSV) », « Ouvrir Stripe », périodes « 30 jours · Trimestre · 12 mois · Depuis le début » | notifications | `/admin/finance` | G-fondateur | · | à créer | **18c45d9** · aucun export CSV, lien Stripe ni choix de période sur Revenus & MRR |
| F02 | #adminfinance | indicateurs « MRR · ARR · Clients payants · ARPA · Churn · NRR · LTV · Essais », « Stripe synchronisé » | fictif | `/admin/finance` (MRR, ARR, bénéfice net, clients payants, par formule, recommandations de marge) | G-fondateur | `PLAN_PRICE` indicatif (rbac.ts) | partiel | Le MRR n'est pas lu dans Stripe · **18c45d9** · MRR, ARR, rentabilité par forfait, churn, LTV (W/spatial/vues/admin/Revenus.tsx:118) · MRR calculé, NRR et CAC absents |
| U01 | #adminusers (Membres) | « Exporter », « Inviter un membre » (e-mail, espace, rôle, offre) | notifications | `/admin/signups` en lecture seule | G-fondateur | · | à créer | **18c45d9** · Inscriptions & comptes en lecture (W/spatial/vues/admin/Comptes.tsx) · ni export ni invitation |
| U02 | #adminusers | segments « Tous · Payants · Essais · Impayés & litiges · À risque · Propriétaires », recherche | filtre local | · | · | · | à créer | **18c45d9** · aucun segment |
| U03 | #adminusers | sélection multiple : « Envoyer un message · Ajouter des crédits · Exporter » | notifications | · | · | · | décision Kevin | **18c45d9** · reste à Kevin |
| U04 | #adminusers | fiche membre : « Changer d'offre », « Facturation », client Stripe | notifications | `/admin/plans` | `changePlanAction` billing.ts:22 (fondateur, sur l'espace de la session seulement) | · | décision Kevin | **18c45d9** · reste à Kevin |
| U05 | #adminusers | « Ajouter » des crédits (motif obligatoire, expiration) et « Historique » | notification | `/admin/plans`, `/credits` | `grantCreditsAction` credits.ts:27, `rechargeAllocationAction` :40 (fondateur, espace de la session, motif facultatif) | credit_ledger | décision Kevin | **18c45d9** · reste à Kevin · leviers internes (crédits de l'espace du fondateur) sur les actions existantes (W/spatial/vues/admin/Forfaits.tsx) |
| U06 | #adminusers | « Se connecter en tant que » (lecture seule, 30 min, motif), « Réinitialiser le mot de passe », « Export RGPD », « Suspendre » | notifications | aucun équivalent ; `forgotPasswordAction` (pour soi) | · | · | décision Kevin | Aucune colonne de suspension ni de demande RGPD · **18c45d9** · reste à Kevin (statut d'origine « décision Kevin / à créer ») · « se connecter en tant que » absent (W/spatial/vues/admin/Comptes.tsx:9) (était « décision Kevin (connexion « en tant que ») / à créer ») |
| AR01 | #adminroles | « Inviter dans l'équipe » | notification | `/admin/equipe` EcranEquipe | `enregistrerStaffAction` equipe.ts:34 · G-équipe et `peutEcrireEquipe` | platform_staff | raccordé | Aucun e-mail envoyé |
| AR02 | #adminroles | liste de rôles par personne (Admin, Manager, Dev, Support, Finance, Partenaire, Lecture) et « Retirer » | notifications | idem | `enregistrerStaffAction`, `retirerStaffAction` :64 | · | partiel | 8 rôles réels : adminplus, admin, manager, dev, moderateur, membre, freelance, lecture · **18c45d9** · matrice des rôles matriciels et gestion des membres (W/spatial/vues/admin/Droits.tsx) |
| AR03 | #adminroles | colonne « 2FA activée / manquante », alerte « suspendu dans 3 jours » | affichage | aucun | · | · | décision Kevin | Aucune 2FA · **18c45d9** · reste à Kevin |
| AR04 | #adminroles | interrupteurs « 2FA obligatoire pour ADMIN+ · Connexion SSO (Google Workspace) · Restreindre par adresse IP · Expiration des sessions après 8 h » | notifications | aucun ; session de 30 jours (lib/auth.ts:17) | · | · | décision Kevin | **18c45d9** · reste à Kevin |
| AR05 | #adminroles | « Rotation » des clés API et webhooks | notification | /settings affiche seulement la présence des clés d'environnement | · | · | décision Kevin | **18c45d9** · reste à Kevin (statut d'origine « décision Kevin / à créer ») · rotation absente (W/spatial/vues/admin/Modeles.tsx) (était « décision Kevin / à créer ») |
| AR06 | #adminroles | « Dernières actions sensibles » et « Journal → » | liste fictive | · | · | · | partiel | **18c45d9** · registre d'audit de la plateforme (W/spatial/vues/admin/Droits.tsx:51) · pas de filtre « actions sensibles » (était « à créer ») |
| GP01 | #adminperms | onglets « Équipe TikTrends (ADMIN+) · Rôles dans les espaces clients » | local | `/admin/equipe` (« Droits par rôle ») | · | · | partiel | **18c45d9** · Rôles & droits · équipe interne et matrice (W/spatial/vues/admin/Droits.tsx) |
| GP02 | #adminperms | « Nouveau groupe » (nom, partir de, description, portée, « Double authentification obligatoire »), « Renommer », « Dupliquer » | notifications | rôles fixes | · | · | décision Kevin | **18c45d9** · reste à Kevin |
| GP03 | #adminperms | niveaux par module « Aucun · Lecture · Modification · Total », modules sensibles | local | matrice binaire de rubriques visibles | `enregistrerMatriceAction` :79 (rôles matriciels ; adminplus et admin verrouillés) | platform_role_rights | partiel | Aucun niveau Lecture ou Modification ; pas d'audit · **18c45d9** · modèle binaire « Accès / Aucun » (C/spatial/admin/pilotage.ts:133) |
| GP04 | #adminperms | portée « Espaces rattachés » (Partenaire) | affichage | aucun | · | · | décision Kevin | **18c45d9** · reste à Kevin · l'écran `/settings/partenaires` existe (W/spatial/vues/reglages/Partenaires.tsx) |
| GP05 | #adminperms | matrice des rôles clients (Propriétaire, Admin, Créateur, Lecture) avec cases | notification | rôles codés owner, admin, member, client_viewer (rbac.ts) | · | · | décision Kevin | **18c45d9** · reste à Kevin |
| PL01 | #adminplans | « Synchroniser Stripe », « Nouvelle offre », « Ouvrir Stripe », « Stripe », copie des identifiants | notifications | aucun | · | · | décision Kevin | **18c45d9** · reste à Kevin |
| PL02 | #adminplans | cartes Essentiel 49 €, Pro 149 €, Agence 449 € et « Modifier » (prix mensuel et annuel, crédits, marques, membres, fonctions, « Migrer aussi les abonnés existants », « Enregistrer et synchroniser Stripe ») | tiroir | `/console` | `updatePlanConfigAction` platform.ts:17 (fondateur : prix et crédits par plan) | app config | décision Kevin | Plans réels : starter, core, plus, business à 0, 99, 299, 990 € · **18c45d9** · reste à Kevin · offre V2 codée sous `TARIFS_V2` (#956 à #964) |
| PL03 | #adminplans | « Packs de crédits » (« + Pack », « Modifier ») | notifications | recharge `createTopupCheckoutAction` stripe.ts:85 | · | Stripe | décision Kevin | Packs non éditables · **18c45d9** · reste à Kevin |
| PL04 | #adminplans | « Codes promo » (« + Code »), « Essai gratuit » | notifications | `grantTestPackAction` beta.ts:16, `revokeTrialAction` :44 (dans /console) | fondateur | · | décision Kevin | **18c45d9** · reste à Kevin |
| PY01 | #adminpayment | « Voir les détails » (gabarit générique) | tiroir | `/admin/paiement` StripeDiagnostic | `runStripeDiagnosticAction` stripe-diagnostic.ts:45 (fondateur) | lecture | raccordé | Le proto n'en montre rien |
| IN01 | #adminincidents | indicateurs, « État des services » (disponibilité 30 j), filtres « En cours · Ouverts · Résolus · Tous » | fictif | `/admin/incidents` (error_log regroupé, 30 j, en lecture) | G-fondateur | · | partiel | Aucun statut d'incident · **18c45d9** · journal des échecs `error_log`, causes, zones, période (W/spatial/vues/admin/Incidents.tsx:27) · aucun statut d'incident |
| IN02 | #adminincidents | « Déclarer un incident », « Alertes », « Page de statut publique », « Créer un incident », « Ignorer » | notifications | · | · | · | à créer | **18c45d9** · aucun |
| IN03 | #adminincidents | tiroir : « Marquer résolu », « Rouvrir », « Rembourser N générations », « Prévenir les membres », « Analyser avec Jarvis » | notifications | · | · | · | décision Kevin | **18c45d9** · reste à Kevin pour le remboursement (statut d'origine « à créer / décision Kevin ») · résolu, rouvert, prévenir : rien (était « à créer / décision Kevin (remboursement) ») |
| AI01 | #adminintelligence | « Voir les détails » (gabarit générique) | tiroir | `/admin/intelligence` (matrice, seuil éprouvé) | G-fondateur | lecture | raccordé | |
| CO01 | #admincosts (Dépenses réelles) | « Importer une facture », « + Budget », périodes, « Examiner », « Importer » | notifications | `/admin/depenses` (dépense sur 30 j face au plafond, réconciliation) | `reconcilierDepenseAction` :37 | · | partiel | Pas d'import de factures · **18c45d9** · dépense 30 jours face au plafond, réconciliation (W/spatial/vues/admin/Couts.tsx) · pas d'import de facture |
| CO02 | #adminmargins (Coûts & marges) | « Crédits facturés » éditables par action | recalcule les marges | `/credits` « Barème (coût par action) » en lecture | `CREDIT_COSTS` codé (core credits.ts:7) ; l'écran dit « ajuste CREDIT_COSTS dans packages/core » | · | décision Kevin | **18c45d9** · reste à Kevin |
| CO03 | #adminmargins | sélecteur d'offre, « Mettre à jour » le tarif fournisseur, « Exporter » | local | `/credits` (rentabilité par plan) ; FIXED_COSTS codés | fondateur | · | décision Kevin | **18c45d9** · reste à Kevin (statut d'origine « partiel / décision Kevin ») · rentabilité par forfait lue (W/spatial/vues/admin/CreditsMarges.tsx) (était « partiel / décision Kevin ») |
| CN01 | #console | « Voir les détails » (gabarit générique) | tiroir | `/console` (vue plateforme, configuration des prix et crédits, comptes de test) | fondateur | · | raccordé | Le proto n'en montre rien |

**Garanties de sécurité affichées par le proto et absentes du code.** Recherche faite sur `product/packages/db/src/schema.ts`, `web/lib/auth.ts`, `web/lib` et `web/app` :
- **2FA** (TOTP, MFA) : rien dans le code ni dans le schéma.
- **Connexion « en tant que »** : rien.
- **SSO, restriction par IP, sessions de 8 h** : rien. Les sessions durent 30 jours.
- **Groupes à niveaux, portée « Partenaire »** : rien.
- **Rotation des clés** : rien.
- **Suspension, RGPD** : rien.
- **« Chaque modification est journalisée »** : faux pour les droits d'équipe, `platform_role_rights` est écrit sans audit.
- **Ce qui existe réellement** : l'audit des prompts et des Studios (studio_audit_events), le refus serveur de chaque page, et un accès plateforme limité à l'accès total d'équipe (ou au fondateur selon la page).

## 1. Correspondance routes réelles ↔ vues V5

| Vue V5 | Route réelle |
|---|---|
| #results | `/adsmap` |
| #hypotheses | `/adsmap/tri` (tri des propositions, sans équivalent strict) |
| #lots | `/adsmap/lots` (admin) |
| #protocol | `/adsmap/protocole` |
| #import | `/adsmap/import` (admin, taxonomie) et `/connections` |
| #learning | `/adsmap/suites` et `/adsmap#appris` |
| Radar de veille | `/adsmap/radar` |
| #jarvis | `/jarvis` (`/adsmap/jarvis` redirige vers `/jarvis`) |
| #sources | `/jarvis/sources` |
| #admin | `/admin` |
| #prompts, #prompt-edit, #releases | `/admin/ia-studios` (onglets prompts, recettes, releases, évaluations, benchmark) |
| #execution | `/admin/ia-studios?onglet=executions` |
| #knowledge | `/admin/connaissances` |
| #capabilities | `/admin/studios-interrupteurs` et l'onglet routage d'ia-studios |
| #jobs | `/admin/depenses` (partiel) |
| #admincosts | `/admin/depenses` |
| #adminmargins | `/credits` |
| #adminfinance | `/admin/finance` |
| #adminusers | `/admin/signups` |
| #adminroles, #adminperms | `/admin/equipe` |
| #adminplans | `/admin/plans` et `/console` (prix et crédits) |
| #adminpayment | `/admin/paiement` |
| #adminincidents | `/admin/incidents` |
| #adminintelligence | `/admin/intelligence` |
| #console | `/console` |
| #auditlog | aucune |
| Itérer | `/adsmap/suites` |

## 2. Opérations de prompts

Les sept actions demandées existent toutes dans `web/app/actions/studios/prompts.ts`. Chacune passe par `avec()`, qui appelle `gardePlateforme`, puis le dépôt (`lib/studios/prompts/depot-prompts.ts`). Le noyau vérifie la règle, puis écrit en transaction avec l'audit.

| Action | Ligne | Permission | Conditions supplémentaires |
|---|---|---|---|
| `enregistrerBrouillonAction` | :51 | `prompt.draft` | motif, empreinte attendue |
| `validerVersionAction` | :55 | `prompt.draft` | |
| `creerReleaseAction` | :59 | `prompt.draft` | crée une release « staged » |
| `evaluerReleaseAction` | :63 | `prompt.evaluate` | tests structurels sur l'empreinte |
| `publierReleaseAction` | :70 | `prompt.publish` | `confirme` ; pointeur attendu comparé avant écriture ; en production `utilisableEnProduction` exige une évaluation de l'empreinte plus un benchmark approuvé ou une recette manuelle ; aucune variable non résolue |
| `rollbackReleaseAction` | :75 | `prompt.rollback` | `confirme` |
| `revoquerReleaseAction` | :80 | `prompt.rollback` | `confirme`, motif |

Trois actions s'y ajoutent : `retirerReleaseAction` (:85, `prompt.publish`), `approuverBenchmarkAction` (:95, `prompt.evaluate`) et `approuverRecetteManuelleAction` (:106, `prompt.publish`).

Les permissions `prompt.*` ne sont portées que par l'accès total d'équipe (adminplus ou admin). Un owner ou un admin d'espace n'en a aucune.

**Comment une release publiée est consommée** (`web/lib/studios/prompts/resolveur.ts`, résolveur unique) :
- **Jarvis.** `resoudreConversationJarvis` (:301) lit `releaseActive()` et sa politique `jarvis.conversation`.
  - Sans release, Jarvis utilise la 1.0.0 migrée, tracée `repli_1_0_0`.
  - Si la release active est révoquée, il utilise la même 1.0.0, tracée `repli_revocation`.
  - Si la politique manque dans la release, le service est déclaré inactif (503).
  - La route `api/jarvis/chat/route.ts:81` la recompose à chaque tour, puis `consignerRunConversation` (:335) écrit `studio_prompt_runs` (empreintes, sources, coût).
- **Studios.** `executerTache` (:189) est utilisé par les propositions, les produits, la relecture d'apprentissage et le benchmark.
  - Si une release est épinglée au devis ou au job, c'est elle qui est exécutée, même si le pointeur a bougé.
  - Sinon le pointeur global est utilisé. Sans release : `RELEASE_ACTIVE_ABSENTE`, aucun repli. Si elle est révoquée : `RELEASE_REVOQUEE`.
  - La suite de la chaîne : connaissances publiées, compilation, barrière de dépense, trace.

## 3. Les 5 écarts les plus coûteux

1. **La boucle Hypothèse, Lot, Apprentissage du proto ne correspond pas au modèle réel.** Le proto a des hypothèses en kanban, des lots qu'on conclut, et des apprentissages avec les statuts « à valider » et « à retester ». En réel, l'hypothèse est un champ texte par annonce, le verdict se rend par annonce, l'apprentissage est imposé à la validation, et les lots sont réservés aux admins. Combler l'écart demande un nouveau schéma et de nouvelles règles du noyau (H01 à H07, L06, A01).
2. **La sécurité ADMIN+ affichée n'existe pas.** Il s'agit de la 2FA, de la connexion « en tant que », des groupes à niveaux, de la portée Partenaire, du SSO, de la restriction IP, des sessions de 8 h, de la rotation des clés et de l'audit des droits. Ce sont des décisions de Kevin et un chantier lourd. Il ne faut rien en afficher avant que ce soit implémenté.
3. **Le panneau Jarvis global n'existe pas.** Il manque l'orbe, la touche J, le contexte de page, les tâches structurées, les sources cochables, les pièces jointes et le multi-conversations. Le réel offre un seul fil par marque, sans contexte de page. Seuls les Studios ont un Jarvis contextuel (avec PR #782 pour le masquer). Chaque tâche nouvelle a un coût IA et doit passer par une release.
4. **Les offres, Stripe et les crédits sont éditables dans le proto, pas dans le réel.** Le proto affiche les prix 49, 149 et 449 €, des crédits par action éditables, des packs, des codes promo, la synchronisation Stripe, et des crédits ou changements d'offre pour n'importe quel membre. En réel : plans à 0, 99, 299 et 990 €, `CREDIT_COSTS` codé, gestes du fondateur limités à son propre espace, aucune création de prix Stripe. Tout relève de décisions de Kevin.
5. **L'import multi-plateformes et la console d'exploitation sont à construire.** TikTok n'a pas de callback et Google Ads n'existe pas ; ce sont de nouveaux connecteurs. Le CSV réel importe la taxonomie, pas des mesures. Côté exploitation, il manque le cycle de vie des incidents, la page de statut, les remboursements, le CRM des membres (segments, messages, RGPD, suspension) et le journal d'audit (#auditlog, #jobs).
