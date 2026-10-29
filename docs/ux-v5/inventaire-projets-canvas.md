# Inventaire V5 → TikTrends réel (lecture seule, origin/main 394ed04 + PR #782, #783, #784, #791)

> **Historique · 29/10/2026.** L'interface V5 a été retirée (#941) · la référence
> vivante est `docs/spatial/`. Cet inventaire est gardé tel quel · ses chemins
> (`app/(app)/…`, `AppShell`, `components/…`) ne désignent plus forcément du code présent.

**En bref.** Dans le code réel, le projet existe : création gratuite, brief, sources Veille, produit, propositions Jarvis, devis serveur, jobs, variantes et tests, export. En revanche, presque rien de l'assistant V5 en 5 étapes n'existe tel quel. Le canvas réel est un graphe de production dérivé. Ce n'est ni un graphe marketing ni un graphe éditable. Les écarts principaux sont :
- la lignée résultat → itération sur le canvas ;
- le brief structuré (persona, désir, angle, plateformes, objectif) ;
- les dépenses nouvelles : Score Jarvis, choix du moteur, voix.

Abréviations de chemins :
- **W** = `product/apps/web`
- **C** = `product/packages/core/src/studios`
- **D** = `product/packages/db/src/schema.ts`
- **P** = `<dossier V5>/proto5`

**Gardes serveur.**
- `gardeStudio(permission, capacité)` est défini dans W/lib/studios/garde.ts:95.
- `gardeSources(permission)` est souvent suivi de `refusCapacite(['projets'])`. Les deux relisent la session et la portée ; rien ne vient du client.

**Point clé sur le prototype.** Le parcours chargé est `v5-wizard.js`, une modale `studioWizard(step)`, plus `v5-r12.js` qui ajoute le persona obligatoire. Les routes `#new-strategie`, `#new-direction`, etc. décrites dans LIRE-MOI-V5 viennent de `v5-new.js`, qui n'est pas chargé ; elles s'affichent vides, comme `#flow`. La route `#new` montre l'écran de base « Commençons par votre idée ».

## A. Nouveau projet (entrée, #new de base, assistant)

| id | vue V5 | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| A1 | #home/#studios | « Nouveau projet » | ouvre studioWizard('start') | W/components/studios/projet/NouveauProjet.tsx ; W/app/(app)/studio/projets/nouveau/page.tsx (PreparationProjet) | creerProjet W/app/actions/studios/projets.ts:47 (studio.propose, capacité projets) ; creerProjetDepuisContexte sources.ts:91 | studio_projects + version 1 · gratuit | partiel | modale à 2 champs, pas d'assistant |
| A2 | #new | 1·Le brief / 2·La direction / 3·La création | onglets d'étapes (écran de base) | aucun | aucune | aucune | à créer | aucune machine d'étapes |
| A3 | start | « Marque » (Neva / Ajouter une marque…) | select | marque active (getActiveBrand, nouveau/page.tsx) | etatNouveauProjet (C/ux/nouveau-projet.ts) | brand_id du projet | partiel | pas de choix dans la modale, seulement la marque active |
| A4 | start | Livrable « Publicité / Image / Vidéo / Textes » | tuiles radio | select « Type » NouveauProjet.tsx | TYPES_NOUVEAU_PROJET → kind | studio_projects.kind (ads, image, video, text, campaign) | raccordé | |
| A5 | start | « Partir de zéro » | tuile | NouveauProjet | creerProjet projets.ts:47 | gratuit | raccordé | |
| A6 | start | « Depuis la Veille » | tuile + aperçu de la référence | `?ref=` sur /studio/projets/nouveau ; carte Veille → W/components/studios/PreparerCreation.tsx (monté par AdCard) | creerProjetDepuisContexte sources.ts:91 ; creerProjetDepuisSources sources.ts:74 | sourceRefs + brief v1 · gratuit | raccordé | point d'entrée dans la Veille, pas dans la modale |
| A7 | start | « Itérer sur un test » | tuile | `?iter=` (test Adsmap) nouveau/page.tsx | briefDepuisTest + adDetailAction | objectif prérempli | raccordé | accès Adsmap et marque active requis |
| A8 | start | « Commencer le brief » / « Annuler » | navigation | « Créer le projet pour X » / « Annuler » | creerProjet | écrit au clic | partiel | crée tout de suite un projet vide |
| A9 | brief | « Nom du projet » | input | champ titre (NouveauProjet, PreparationProjet) | verifierNouveauProjet | studio_projects.title | raccordé | |
| A10 | brief | « Votre intention » + « Jarvis peut reformuler » | textarea | textarea objectif (PreparationProjet) | brief.objective ; reformulation par proposerBrief propositions.ts:45 (brief.build) | version ; appel texte sur le plafond IA ($) | partiel | reformulation seulement après création, sous forme de proposition |
| A11 | brief | « Audience » | input | lecture dans VueProjet | composerBrief avec audience = brands.audience (W/lib/studios/sources/projet.ts:151) | brief.audience (texte) | partiel | non saisissable à la création |
| A12 | brief (r12) | « Pour qui ? obligatoire » + « Gérer les personas » | radio de personas | aucun dans Studios (personas gérés dans brands/[id] et adsmap) | aucune | table personas D:195, non liée au brief | à créer | |
| A13 | brief | Objectif « Notoriété / Considération / Conversion / Fidélisation » | pastilles radio | aucun | aucune | objective = texte libre | à créer | |
| A14 | brief | Plateformes « Meta · Feed / Stories & Reels / TikTok » | cases | aucun | formatDepuisBrief (C/calques/formats.ts:64) déduit seulement le ratio | brief.formats: string[] | à créer | |
| A15 | brief | « Contraintes et mentions obligatoires » | textarea | lecture dans VueProjet (Invariants, Exclusions) | proposerPatch / creerPropositionManuelle propositions.ts:36/53 | brief.invariants / exclusions | partiel | pas de saisie à la création |
| A16 | brief | Carte produit « Changer » | notification | W/app/(app)/studio/projets/[id]/produit → EcranProduit | epinglerProduit produit.ts:43 (gardeSources propose) | productRef instantané · gratuit | raccordé | après création |
| A17 | brief-photo | « Ajouter une photo » : dépôt « Parcourir… », progression, « Utiliser cette photo » | panneau | ImportPhotoProduit (PR #783) | importerPhotoProduit produit.ts:62 sur la branche (studio.propose + projets) | data URI dans products.image_urls ; JPEG/PNG/WebP, 900 000 caractères, 6 photos · gratuit | raccordé PR #783 | |
| A18 | brief-photo | « Rôle de cette image » (Produit / Style / Logo) | select | EcranProduit | associerReference produit.ts:54 (role : product, identity, style, composition, logo, integrate) | brief.references | raccordé | |
| A19 | brief-photo | « Provenance et droits » | select | aucune saisie | aucune | studio_assets.rights (jsonb) existe | partiel | |
| A20 | brief-refs | « Depuis la Veille » : Sauvegardes / Formats / Ce qui scale, cases, « Joindre 1 référence » | panneau | sélection multi-sources seulement à la création (PreparerCreation) | creerProjetDepuisSources sources.ts:74 | sourceRefs | partiel | aucun ajout de source après création |
| A21 | brief | « Importer un fichier » (référence) | lien | aucun envoi de référence de style | associerReference exige un asset existant | aucune | partiel | seule la photo produit s'importe (PR #783) |
| A22 | wizard | « Enregistrer et quitter » / « Brouillon enregistré » | notification | aucun | versions immuables | aucune | partiel | pas de brouillon d'assistant |

## B. Stratégie, direction, formats et devis

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| B1 | strategie | Chaîne « Avatar → Désir → Angle → Concept → Pub → Résultat » | nœuds statiques | W/app/(app)/adsmap/Canvas.tsx (React Flow) | graphAction (adsmap) | personas D:195, adsmap_desires D:875, adsmap_angles D:889, adsmap_concepts D:935, adsmap_ads D:976 | partiel | existe dans Adsmap, non lié à studio_projects (testRefs seulement) |
| B2 | strategie | « Angles proposés · Suggestions Jarvis » (Observation / Hypothèse / sources) | radios | PreparerCreation | proposerHypotheses sources.ts:56 (studio.propose, tâche test.hypothesize) | faits observed / measured / declared / hypothesis avec sourceIds (C/brief.ts:40-48) ; plafond IA | partiel | des hypothèses plutôt que des angles, et seulement depuis la Veille |
| B3 | strategie-angles | « Autres angles » + « Orientation (facultatif) » + « Proposer 3 angles » | panneau | idem | proposerHypotheses (objectif) | plafond IA | partiel | |
| B4 | strategie | « Écrire mon angle » | radio | aucun | aucune | aucune | à créer | |
| B5 | strategie | « Hypothèse à tester » | input | VueProjet bloc Hypothèse | brief.hypothesisId + testedVariable ; modification par proposition | version | partiel | lecture raccordée, saisie indirecte |
| B6 | direction | Aperçu de pub (mock Meta) | image | rendreApercu rendu.ts:61 (studio.read, editeur) | rendu déterministe | gratuit | partiel | pas de cadre de plateforme |
| B7 | direction | « Concept » | input | aucun | aucune | adsmap_concepts.title seulement | à créer | |
| B8 | direction | « Accroche » + 3 variantes radio | input + radios | EcranTextes | ecrireTextes textes.ts:31 (type hook) ; injecterTexte textes.ts:52 | plafond IA | raccordé | dans l'atelier Textes |
| B9 | direction | « Style visuel » | textarea | VueProjet « Intention de style » | proposerBrief / proposerPatch | brief.styleIntent, styleRef | raccordé | par proposition |
| B10 | direction | « Appel à l'action » | input | EcranTextes | ecrireTextes type cta | version | raccordé | |
| B11 | direction | Palette (4 pastilles) | statique | aucun | C/sources/da-marque.ts lit la DA de marque | aucune palette dans le contenu | à créer | |
| B12 | direction | « Provenance · release D1 · Sources » | texte | VueProjet montre les sources | studio_project_versions.promptReleaseId, studio_prompt_runs | stocké | partiel | release non affichée au client |
| B13 | direction | « Autre direction » | notification | PanneauPropositions | proposerBrief propositions.ts:45 | studio_proposals ; l'ancienne est gardée ; plafond IA | raccordé | |
| B14 | direction | « Valider la direction » | étape suivante | PanneauPropositions | appliquerProposition propositions.ts:62 | nouvelle version | raccordé | |
| B15 | format/video/textes | « Publicité / Image · Vidéo · Textes » | segmenté | liens atelier liensAtelierProjet W/lib/navigation.ts:446 | gardes de chaque page | aucune | raccordé | |
| B16 | format | Formats 4:5 / 9:16 / 1:1 (cases) | cases | éditeur, déclinaison | declinerFormat rendu.ts:98 (propose, editeur) ; FORMATS_DOCUMENT C/calques/formats.ts:30 | nouvelle version par format · gratuit | partiel | un format par document, pas de multi-sélection dans un devis |
| B17 | format | « Zones sûres respectées » | indication | contrôle de déclinaison | zoneSurePx C/rendu/declinaisons.ts:97, verifierDeclinaison :288 | gratuit | raccordé | |
| B18 | format | « Variantes par format » | select 1 à 4 | devis | creerDevis execution.ts:52 (`variante: true`) | devis par version | partiel | pas de N variantes × M formats en un devis |
| B19 | format | « Variation » (Accroche / Composition) | select | PanneauVariantes | iterer variantes.ts:42 (VARIABLES_TEST C/variantes/test.ts:29) | version enfant · gratuit | partiel | |
| B20 | format | « Moteur » | select | aucun | FAL_IMAGE_MODEL, C/fournisseurs/choix.ts:26-48 | grille plate de 4 crédits par image | décision Kevin | une grille par moteur change le prix (CAPACITES-PAYANTES §3, PR #791) |
| B21 | format | « Relecture automatique » | case | ParcoursImage (option du devis) | demanderDevisImage image.ts:83 (controleVision) ; avecControleVision C/execution/tarifs.ts:223 | ligne de devis quality.visual (≈0,147 $ de borne par image) | raccordé | |
| B22 | format | « Score Jarvis explicable » | case | aucun | scoreCreative n'a aucun appelant | aucune | décision Kevin | 0 ou 2 crédits (CAPACITES-PAYANTES §1) |
| B23 | format | Devis serveur « 0,60 $ », jauge de budget, « Recalculé à chaque changement » | carte | ParcoursImage / VueVideo | creerDevis W/lib/studios/execution/commandes.ts:184 ; GRILLE_STUDIO tarifs.ts:67 | studio_quotes immuable, inputHash, 30 min ; crédits et $ | partiel | pas de jauge du budget disponible, pas de recalcul automatique |
| B24 | video | Storyboard (scènes), « Ajouter une scène », « Réécrire » | cartes | EcranVideo / VueVideo | planifierStoryboard video.ts:70 (studio.generate) ; appliquerOperationVideo :62 (plan, ordre, narration, scénario) | version ; storyboard.plan en $ | raccordé | |
| B25 | video | « Identité vocale » | select | W/app/(app)/studio/projets/[id]/identites (EcranIdentites) | choisirModeParole identites.ts:52 (voix) | génération de voix : speech sans tarif (tarifs.ts) | décision Kevin | |
| B26 | video | « Musique » | select | VueVideo | opération `musique` (C/video/operations.ts) | version | partiel | music.prepare sans appelant |
| B27 | video | « Sous-titres » | select | VueVideo | timeline.subtitles.enabled (C/video/timeline.ts:61,89) | version | partiel | marche/arrêt seulement, pas de langue |
| B28 | video | « Transitions » | select | aucun | aucune | aucune | à créer | |
| B29 | video | Devis vidéo | carte | VueVideo | demanderDevisKeyframe video.ts:96, demanderDevisClip :118 ; approuver :102 / :124 | animation estimée | raccordé | par plan |
| B30 | textes | Livrables « Accroches / Texte principal / Titre / Description / Script vidéo » | cases | EcranTextes | TYPES_TEXTE hook, ad_copy, cta, script (C/textes/textes.ts:36) | version | partiel | Titre et Description absents |
| B31 | textes | « Ton » | select | aucun | aucune | aucune | à créer | |
| B32 | textes | « Longueur » | select | EcranTextes | ecrireTextes maxCaracteres | | raccordé | |
| B33 | textes | « Variantes » 3/2/5 | select | EcranTextes | nombre (VARIANTES_MAX 6) | | raccordé | |
| B34 | textes | « Langue » (dont Suisse allemand) | select | EcranTextes | langue sur 2 lettres | | partiel | pas de variante régionale |
| B35 | textes | « Rédiger 3 variantes » | bouton | EcranTextes | ecrireTextes textes.ts:31 (studio.propose, textes) | text.write en $ | raccordé | |

## C. Confirmation, budget, génération, interruption, résultats

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| C1 | confirm | Tableau des paramètres + montants | table | DevisPresente.lignes (ParcoursImage) | commandes.ts:170 presenter | | raccordé | |
| C2 | confirm | « J'ai vérifié le devis… » + « Confirmer et générer » | case + bouton | ParcoursImage | approuverEtMettreEnFile execution.ts:60 / approuverEtLancerImage image.ts:92 (studio.generate) : refus sans fournisseur, plafond, idempotencyKey, inputHash, creditsAnnonces | approbation, réserve, débit, job, outbox en une transaction | raccordé | seule écriture payante |
| C3 | confirm | « Modifier » (invalide le devis) | retour | | inputHash, QUOTE_EXPIRED (C/execution/devis.ts) | | raccordé | |
| C4 | budget | « Le coût estimé dépasse le budget » | alerte | message de refus | BUDGET_EXCEEDED (C/erreurs.ts:29), refusPlafondDollars tarifs.ts:157 | rien n'est débité | raccordé | |
| C5 | budget | « Réduire les variantes » / « Garder un seul format » | liens | aucun | aucune | | à créer | suggestions de réduction |
| C6 | budget | « Voir les crédits » | lien | W/app/(app)/usage | | | raccordé | |
| C7 | generation | « En cours · 4 / 6 », progression, tâche T-0412 | jauge | VueParcours / VueVideo | etatJob execution.ts:87 | états de job (C/machines.ts:22) | partiel | pas de pourcentage |
| C8 | generation | « Fermer · la tâche continue » | bouton | | worker hors requête ; reprise par idempotencyKey | | raccordé | |
| C9 | generation | « Voir les tâches » | tasks() | aucune liste de tâches par projet | annulerJob execution.ts:80 | | à créer | |
| C10 | generation | « Voir les créations » | étape | VariantesEtTests | listerVariantes variantes.ts:24 | studio_variants | raccordé | |
| C11 | interrompue | « Interrompue · coût incertain » | badge | états de job dans VueParcours | reconciliation_required, PROVIDER_UNCERTAIN | | partiel | écran dédié absent |
| C12 | interrompue | « Continuer avec les 4 visuels » | lien | sorties livrées → variantes (C/variantes/variante.ts) | | | partiel | |
| C13 | interrompue | « Demander le rapprochement » | lien support | W/app/(app)/admin/depenses (rapprochement ai_spend) ; acteur reconciliateur | | | partiel | côté exploitation seulement |
| C14 | interrompue | « Relancer 2 visuels » (désactivé) | bouton | nouveau devis | aucun blocage explicite lié à reconciliation_required vu | | partiel | à vérifier |
| C15 | creations | Filtres « Toutes / 4:5 / 9:16 » | filtres | PanneauVariantes | | | partiel | |
| C16 | creations | Score /100 + contrôles ok / alerte | carte | statut qualité ; trancherComposants produit.ts:90 | | | partiel | aucun score (voir B22) |
| C17 | creations | « Garder » | case | | accepterMedia / rejeterMedia execution.ts:93/99 (studio.propose) | statut qualité · gratuit | raccordé | |
| C18 | creations | « Créer un lot de test » | lien #lots | PreparerEssai (PR #791) | preparerLotEssai tests.ts:55 sur la branche ; rattacherVarianteAuTest tests.ts:25 | studio_test_links | raccordé PR #791 | |
| C19 | creations | « Ouvrir dans le canvas » | lien #project | CanvasProjet sur la page projet | | | raccordé | |

## D. Vue projet #project, Options et Export

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| D1 | #project | Titre « Neva · exemple · modifications locales » | en-tête | VueProjet.tsx:55-84 (marque, version, étape) | lireProjetDetail sources.ts:114 (studio.read) | | raccordé | |
| D2 | #project | « Brief & références » | onglet | sections Brief, Produit, Sources de VueProjet | | | raccordé | pas d'onglets, tout est empilé |
| D3 | #project | « Canvas » | onglet | CanvasProjet (W/app/(app)/studio/projets/[id]/page.tsx:63) | lireCanvasProjet canvas.ts:22 | | partiel | voir §1 |
| D4 | #project | « Créations » | onglet | VariantesEtTests (page.tsx:61) | listerVariantes | | raccordé | section, pas d'onglet |
| D5 | #project | « Image / Vidéo / Textes » | segmenté | nav atelier VueProjet.tsx:67 ; onglets BarreProjet (PR #782) | | | raccordé | |
| D6 | #project | « Générer… » | modale de devis fictive | pas d'entrée unique : ParcoursImage, VueVideo | | | partiel | |
| D7 | #project | « Masquer Jarvis » | bascule | BarreProjet (PR #782) | cookie tt_jarvis (C/ux/espace-creation.ts sur la branche) | appareil | raccordé PR #782 | |
| D8 | #project | « Options » | tiroir | aucun menu (liens éclatés) | | | partiel | |
| D9 | Options | « Agrandir le canvas » | mode zen | mode focus Alt F (PR #782) | | | raccordé PR #782 | focus de la page, pas plein écran du canvas |
| D10 | Options | « Versions » + « Restaurer » | tiroir | « Historique des versions » VueProjet.tsx:194 (lecture ?version=) ; PanneauVersions (PR #784) | restaurerVersionDocument W/lib/studios/editeur/actions.ts:43 sur la branche (propose, editeur) | nouvelle version | raccordé PR #784 | restauration dans l'éditeur image |
| D11 | Options | « Produit & références » | lien | /studio/projets/[id]/produit | lireProduitProjet produit.ts:35 | | raccordé | |
| D12 | Options | « Vérifier avant export » | lien | « Contrôle avant export » dans PanneauExport ; C/export/preflight.ts | | | partiel | technique seulement |
| D13 | Options | « Activité » | lien | aucune interface | W/lib/studios/audit.ts écrit studio_audit_events (D:1691) | | à créer | |
| D14 | Options | « Tous les projets » | lien | /studio/projets | listerProjetsCartes sources.ts:124 | | raccordé | |
| D15 | Options | « Commentaires » | tiroir | aucun | aucune table | | à créer | |
| D16 | Options | « Raccourcis » | tiroir | Alt B (W/components/AppShell.tsx:330), Alt F (PR #782), raccourcis éditeur | | | partiel | aucun panneau d'aide |
| D17 | Options | « Identité vocale » | tiroir | EcranIdentites | enregistrerIdentite identites.ts:31 | | partiel | voix : voir B25 |
| D18 | #project | « Exporter » | tiroir | /studio/projets/[id]/export (PanneauExport) ; lien dans BarreProjet (PR #782) | lireExportProjet export.ts:19 | | raccordé | |
| D19 | export | Format PNG / JPEG | select | PanneauExport | exporterVersion export.ts:25 (studio.export, capacité export) ; GET W/app/api/studios/export/[versionId]/route.ts:36-37 | fichier rendu | raccordé | |
| D20 | export | MP4 · H.264 | select | VueVideo | assemblerVideoFinale video.ts:145 (studio.export, video) | | raccordé | |
| D21 | export | Texte brut / CSV | select | EcranTextes | exporterTextes textes.ts:46 (markdown, csv, json) | | raccordé | |
| D22 | export | Dimensions 4:5 / 9:16 / 1:1 | select | dimensions du document | declinerFormat avant export | | partiel | |
| D23 | export | « Version actuelle uniquement » | case | « Version à exporter » | | | raccordé | |
| D24 | export | « Simuler l'export » | bouton | « Télécharger » | | | raccordé | |
| D25 | (réel seulement) | « Produire ailleurs » | | ExporterBrief | exporterBrief sources.ts:104 (studio.export) | markdown / json | raccordé | absent de V5 |

## E. Canvas V5 (v5-r9.js) et panneau Jarvis (v5-r10.js)

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| E1 | canvas | Nœud Brief (contexte) | carte | carte `brief` (C/canvas/modele.ts:152) | | | raccordé | |
| E2 | canvas | Fiche marque | carte | aucune | | | à créer | |
| E3 | canvas | Référence Veille | carte | sources dans VueProjet, pas sur le canvas | | sourceRefs | à créer | |
| E4 | canvas | Asset | carte | `entree:produit`, `identite:*` | | | partiel | |
| E5 | canvas | Hypothèse | carte | aucune carte | | brief.hypothesisId | à créer | |
| E6 | canvas | Direction créative | carte | `entree:style` | | styleRef | partiel | |
| E7 | canvas | Image / Vidéo / Texte (création) | cartes avec visuel | `keyframe:*`, `clip:*`, `voix:*`, `composition`, `export` | | | partiel | pas de miniature ; texte sans carte |
| E8 | canvas | Résultat « Lot #1 · 14 jours » (barres A / B / C) | carte | aucune carte | lireApprentissage tests.ts:34 | studio_test_links | à créer | |
| E9 | canvas | Apprentissage | carte | aucune carte | relireApprentissage tests.ts:40 (learning.review) | plafond IA | à créer | |
| E10 | canvas | Itération (V3 « Devis : 24 crédits », V3b) | carte | aucune carte | iterer → version enfant (parentId) | | à créer | |
| E11 | canvas | Note | carte | aucune | | | à créer | donnée nouvelle |
| E12 | canvas | Groupes « Lot #1 », « Lot #5 » + « Replier les perdants » | cadres | aucun | rang de lot (C/variantes/variante.ts) | | à créer | |
| E13 | canvas | Badges « Gagnant » / score en % | pastilles | aucun | verdict Adsmap via test link | | à créer | |
| E14 | canvas | Ports entrée / sortie | décor | aucun | | | partiel | liens dérivés, jamais tracés à la main |
| E15 | canvas | Liens et libellés « Contexte, Accroche, Visuel, Mesure, Itération, base : B, garde l'accroche » | SVG | LienCanvas {de, vers} sans type ni libellé | | | partiel | |
| E16 | canvas | Légende | puces | natures « Entrée / Génération / Calcul » | | | partiel | |
| E17 | canvas | Sélection (V) | outil | sélectionner (C/canvas/vue.ts) | | | raccordé | touche V absente |
| E18 | canvas | Main (H) | outil | panoramiquer | | | raccordé | touche H absente |
| E19 | canvas | Ajouter Texte / Image / Vidéo / Référence Veille / Asset / Hypothèse / Note (barre + double-clic « Ajouter ici ») | outils | aucun | | | à créer | à passer par les commandes métier, pas des nœuds libres |
| E20 | canvas | Zoom − / % / + | barre | CanvasMetier.tsx:252-254 | | | raccordé | |
| E21 | canvas | « Tout afficher » | bouton | « Ajuster » :251 (touche 0) | | | raccordé | |
| E22 | canvas | Mini-carte | bouton | aucune | | | à créer | |
| E23 | canvas | Ctrl + molette | geste | molette :136 | | | raccordé | |
| E24 | canvas | Glisser un nœud | geste | déplacer | enregistrerDispositionCanvas canvas.ts:29 (studio.read) | app_settings, par personne, rev · gratuit | raccordé | |
| E25 | canvas | Suppr supprime un nœud | clavier | aucun | | | à créer | contraire au modèle dérivé |
| E26 | canvas | Double-clic → détail « Vient de / A donné », « Itérer », « Demander à Jarvis » | tiroir | DetailCarte (entreesDeCarte / sortiesDeCarte) | | | raccordé | sauf Itérer |
| E27 | canvas | « + » « Itérer depuis ce nœud » (Format, Accroche, Visuel, Durée, Appel à l'action) | menu | PanneauVariantes | iterer variantes.ts:42 (variables format, hook, opening_visual, length, cta) | version enfant · gratuit | partiel | depuis une variante, pas depuis une carte |
| E28 | canvas | « Générer » sur un nœud d'itération | bouton | aucun | creerDevis(operations = ids de cartes) commandes.ts:184 | | partiel | les ids de cartes sont les ids du plan d'impact |
| E29 | canvas | « Demander à Jarvis · n nœud » | bouton | « Préparer une demande à Jarvis · X » DetailCarte.tsx:89 (ciblerJarvis) | | | partiel | une seule cible, pas de multi-sélection |
| E30 | canvas | « Centrer » (via le détail) | | « Centrer la sélection » :255 | | | raccordé | |
| E31 | (réel seulement) | « Liste » / « Canvas », « Réinitialiser la disposition » | | CanvasMetier.tsx:246-258 | reinitialiserDispositionCanvas canvas.ts:36 | | raccordé | absent de V5 |
| E32 | Jarvis | « Ouvrir en plein écran » | lien #jarvis | W/app/(app)/jarvis | | | partiel | contexte projet non transmis |
| E33 | Jarvis | Carte de contexte « Image · B · Question » | | « Cible » du FormulaireDemande | | | raccordé | |
| E34 | Jarvis | « Suggestion · à valider » | carte | PanneauPropositions | studio_proposals (draft / proposed) | | raccordé | |
| E35 | Jarvis | « Créer l'itération » | bouton | | iterer variantes.ts:42 | gratuit | partiel | non relié à une suggestion |
| E36 | Jarvis | « Pourquoi ? » | bouton | AvantApres, PlanImpactVue | lireApprentissage | | partiel | |
| E37 | Jarvis | « Analyser les variantes » | action rapide | | lireApprentissage (gratuit) / relireApprentissage (coût maximal annoncé) | | raccordé | |
| E38 | Jarvis | « Prochaine itération » | action rapide | | suggestion nextVariable de relireApprentissage | | partiel | |
| E39 | Jarvis | « 3 accroches » | action rapide | | ecrireTextes (hook, nombre 3) | | raccordé | |
| E40 | Jarvis | « Conformité marque » | action rapide | aucun | | | décision Kevin | nouvel appel payant |
| E41 | Jarvis | « Joindre » | trombone | aucun | | | à créer | |
| E42 | Jarvis | « Demander à Jarvis sur ce projet… » + Envoyer | zone de saisie | FormulaireDemande | proposerPatch / proposerBrief propositions.ts:36/45 ; refus BUDGET_EXCEEDED | | raccordé | |
| E43 | Jarvis | « Appliquer » (accroche) | bouton | | appliquerProposition :62 / injecterTexte textes.ts:52 | | raccordé | |

## F. Pages #product, #review, #activity, #execution, #jobs

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| F1 | #product | « Image PNG ou JPEG · 10 Mo maximum » | input de fichier | ImportPhotoProduit (PR #783) | importerPhotoProduit | | raccordé PR #783 | voir A17 |
| F2 | #product | « Rôle de la référence » | select | EcranProduit | associerReference | | raccordé | |
| F3 | #product | « Source ou provenance » | champ | aucun | | studio_assets.rights | partiel | |
| F4 | #product | « Contraintes » | textarea | | ReferenceBrief.allowedChanges, brief.invariants | | partiel | |
| F5 | #product | « Conserver dans la démo » | bouton | EcranProduit | epinglerProduit | | raccordé | |
| F6 | #review | 5 cases de contrôle humain | cases | aucun | | | à créer | |
| F7 | #review | « Ouvrir l'export » (actif quand tout est coché) | bouton | PanneauExport | | | partiel | |
| F8 | #review | « Contrôle technique » | texte | C/export/preflight.ts | | | raccordé | |
| F9 | #activity | Tableau événement / version / origine | table | aucun | | | à créer | |
| F10 | #activity | « Versions restaurables » | bouton | PR #784 | | | raccordé PR #784 | |
| F11 | #activity | « Traçabilité Jarvis » | bouton | /admin/ia-studios (EcranExecutions) | gardePlateforme | | partiel | personnel plateforme seulement |
| F12 | #execution | Fiche projet, action, release, sources, modèle, coût réel, sortie | fiche | vueExecutions /admin/ia-studios | | studio_prompt_runs | partiel | personnel plateforme seulement |
| F13 | #execution | « Voir la consigne compilée » | bouton | VueParcours « Compilée » | compilerConsigneImage image.ts:64 | | partiel | |
| F14 | #execution | « Voir le journal » | bouton | aucun côté client | | | à créer | |
| F15 | #jobs | Tableau tâches / état / dépense / action | table | jobs par atelier (VueParcours, VueVideo) ; /admin/incidents, /admin/depenses | etatJob, annulerJob | | partiel | aucune liste par projet ou espace |
| F16 | #jobs | « Examiner » / « Voir le livrable » | boutons | | | | partiel | |

## 1. Modèle de canvas réel comparé au canvas V5

**Ce que fait le canvas réel aujourd'hui**
- `lireCanvasProjet` (canvas.ts:22) passe par `lireCanvasPour` (W/lib/studios/canvas/disposition.ts:128), puis par `deriverCanvas(contenu)` (C/canvas/modele.ts:126).
- Les cartes sont toutes dérivées de la version :
  - **Entrées** : brief, produit, style, mise en page, voix, plans, identités.
  - **Générations** : `keyframe:*`, `voix:*`, `clip:*`.
  - **Calculs** : composition, montage, mix, sous-titres, export.
- Les colonnes sont fixes : contexte → plans → images → clips → assemblage → finitions → export.
- Un lien `{de, vers}` existe si et seulement si B lit A dans le graphe d'impact. Il n'a ni type, ni libellé, ni port, et n'est jamais saisi. L'en-tête de modele.ts le dit : « Le canvas n'est PAS un éditeur de workflow ».
- `enregistrerDispositionCanvas` (canvas.ts:29) n'enregistre que des positions {x, y}, par personne, dans `app_settings` avec une révision. C'est une disposition, pas un graphe.

**Deux magasins de disposition coexistent.** `enregistrerDisposition` (projets.ts:66) écrit dans `studio_layouts` (D:1374), mais le canvas ne s'en sert pas.

**Le canvas n'est pas exécutable lui-même, mais il peut le devenir.** Les identifiants de cartes sont ceux du plan d'impact, et `creerDevis` accepte `operations: string[]` (commandes.ts:184). Le canvas peut donc servir de sélecteur de devis sans second moteur.

**Le canvas V5 est autre chose.** C'est une lignée marketing libre : brief, marque, référence, hypothèse, direction, créations, résultat, apprentissage, itération, note. Il a des liens typés et libellés, et on y ajoute ou supprime des nœuds.

**Comment le rendre réel sans second moteur.** Garder `deriverCanvas` pour la production et ajouter une projection de lignée en lecture seule, calculée à partir de données qui existent déjà :
- `studio_project_versions.parentId` donne les itérations ;
- `studio_variants` et le rang de lot donnent les créations et les groupes de lots ;
- `studio_test_links` et le verdict Adsmap donnent le résultat et le gagnant ;
- `relireApprentissage` donne l'apprentissage ;
- `sourceRefs` donne les références Veille ;
- `brief.hypothesisId` donne l'hypothèse.

Le type d'un lien se déduit de la relation : contexte, visuel, mesure ou itération. Chaque nœud appelle des commandes existantes : `iterer`, `creerDevis(operations)`, `rattacherVarianteAuTest`, `proposerPatch(cible)`.

Il faut aussi :
- réutiliser le réducteur de C/canvas/vue.ts, pas @xyflow (déjà utilisé par le canvas Adsmap, W/app/(app)/adsmap/Canvas.tsx, qui serait un second moteur) ;
- ajouter la mini-carte et la multi-sélection vers Jarvis.

Les seules vraies données nouvelles sont les notes et la carte marque.

## 2. Champs du brief V5 sans équivalent en base

**Le brief réel.** `BriefCanonique` (C/brief.ts:65-79) contient : objective, audience (texte), hypothesisId, testedVariable, facts (avec sourceIds), invariants, variables, references, composition, styleIntent, texts, formats (string[]), exclusions. Il est stocké en jsonb dans `studio_project_versions.content` (D:1351 ; ContenuVersion dans C/document.ts:144). L'audience est copiée depuis `brands.audience`.

**Les champs V5 absents du brief :**
- objectif sous forme de liste (Notoriété, Conversion…) ;
- plateformes ;
- persona ou avatar obligatoire ;
- désir, angle, concept ;
- appel à l'action et accroche dans le brief (ils n'existent que comme textes) ;
- palette, ton, transitions ;
- nombre de variantes, moteur ;
- provenance et licence saisies.

**Ce qui existe ailleurs dans la base :**
- `personas` (D:195 : pains, desires, objections, status) ;
- `adsmap_desires` (D:875), `adsmap_angles` (D:889), `adsmap_concepts` (D:935 : title, cta, hookOptions) ;
- `studio_assets.rights` ;
- `studio_project_versions.promptReleaseId`.

**Le coût de l'ajout.** Il ne faut pas de migration (jsonb), mais il faut modifier `CLES_BRIEF` / `validerFormeBrief`, le contrat `brief.build` (release de prompt) et ajouter des références de portée vers les lignes Adsmap.

## 3. Pourquoi #flow est vide

**#flow n'est pas une route.** C'est l'id du `<div>` du canvas, produit par `flowHTML()` dans P/v5-r9.js. Ce bloc n'est monté que dans la surcharge de `renderProject` (fin de v5-r9.js), et seulement si les trois conditions suivantes sont vraies :
- `location.hash === '#project'` ;
- `tab === 'canvas'` (valeur par défaut, `let tab='canvas'` dans index.html) ;
- `studioMode === 'image'` (valeur par défaut).

Au premier montage, `flowStart()` cadre la vue (`window.__flowFit`).

**Ce qui se passe à l'ouverture directe de `#flow`.** Aucun renderer ne connaît `flow` : le `render()` de base d'index.html écrit `<main class="main"></main>`, donc une page vide. Le fil d'Ariane passe par `shellV2` d'extension.js, qui écrit « Studios / Neva » parce que `titles['flow']` n'existe pas. Ensuite, `crumb()` de v5.js ne garde que le dernier segment, d'où « Accueil / Neva ».

Les raccourcis V et H du canvas exigent aussi la présence de `#flow` dans la page.

## 4. Les 5 écarts les plus coûteux

1. **Canvas de lignée.** Résultat, apprentissage, itération, hypothèse, références, lots, gagnant et notes ne sont projetés sur aucune carte. Les données existent dans 5 tables séparées : il faut une projection au noyau, l'interface et des actions par nœud.
2. **Assistant en 5 étapes et brief structuré.** Aujourd'hui, on crée un projet vide en 2 champs. Le brief V5 demande d'étendre `BriefCanonique` (persona, désir, angle, concept, plateformes, objectif), de modifier le contrat `brief.build` et de relier Adsmap à Studios.
3. **Dépenses nouvelles (décision Kevin).** Elles concernent :
   - le Score Jarvis (0 ou 2 crédits) ;
   - le choix du moteur (grille par moteur, `PRICING_VERSION`) ;
   - la voix (aucun tarif) ;
   - la conformité de marque ;
   - la relecture de la pub composée à l'export.
4. **Devis « N formats × M variantes » en un clic.** Le devis réel porte sur une version et un document. Les déclinaisons se font une par une (`declinerFormat`), et `batch.plan` n'a aucun appelant.
5. **Collaboration et suivi côté client.** Il manque les commentaires (aucune table), l'activité (`studio_audit_events` sans interface), les exécutions (réservées au personnel plateforme) et une liste des tâches du projet avec le rapprochement des coûts incertains.
