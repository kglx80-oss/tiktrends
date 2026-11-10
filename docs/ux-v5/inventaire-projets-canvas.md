# Inventaire V5 → TikTrends réel (lecture seule, origin/main 394ed04 + PR #782, #783, #784, #791)

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
| A1 | #home/#studios | « Nouveau projet » | ouvre studioWizard('start') | W/components/studios/projet/NouveauProjet.tsx ; W/app/(app)/studio/projets/nouveau/page.tsx (PreparationProjet) | creerProjet W/app/actions/studios/projets.ts:47 (studio.propose, capacité projets) ; creerProjetDepuisContexte sources.ts:91 | studio_projects + version 1 · gratuit | raccordé | modale à 2 champs, pas d'assistant · **18c45d9** · assistant Nouveau projet en quatre étapes sur les vraies actions (#900, W/spatial/vues/studios/NouveauProjet.tsx:31-53) (était « partiel ») |
| A2 | #new | 1·Le brief / 2·La direction / 3·La création | onglets d'étapes (écran de base) | aucun | aucune | aucune | raccordé | aucune machine d'étapes · **18c45d9** · Que créer ? · Brief · Stratégie & style · Format & devis (`ETAPES_NOUVEAU_SPATIAL`, C/spatial/studios/nouveau.ts:51) (était « à créer ») |
| A3 | start | « Marque » (Neva / Ajouter une marque…) | select | marque active (getActiveBrand, nouveau/page.tsx) | etatNouveauProjet (C/ux/nouveau-projet.ts) | brand_id du projet | raccordé | pas de choix dans la modale, seulement la marque active · **18c45d9** · choix de la marque et « Ajouter une marque » (W/spatial/vues/studios/NouveauProjet.tsx:294-300) (était « partiel ») |
| A4 | start | Livrable « Publicité / Image / Vidéo / Textes » | tuiles radio | select « Type » NouveauProjet.tsx | TYPES_NOUVEAU_PROJET → kind | studio_projects.kind (ads, image, video, text, campaign) | raccordé | |
| A5 | start | « Partir de zéro » | tuile | NouveauProjet | creerProjet projets.ts:47 | gratuit | raccordé | |
| A6 | start | « Depuis la Veille » | tuile + aperçu de la référence | `?ref=` sur /studio/projets/nouveau ; carte Veille → W/components/studios/PreparerCreation.tsx (monté par AdCard) | creerProjetDepuisContexte sources.ts:91 ; creerProjetDepuisSources sources.ts:74 | sourceRefs + brief v1 · gratuit | raccordé | point d'entrée dans la Veille, pas dans la modale |
| A7 | start | « Itérer sur un test » | tuile | `?iter=` (test Adsmap) nouveau/page.tsx | briefDepuisTest + adDetailAction | objectif prérempli | raccordé | accès Adsmap et marque active requis |
| A8 | start | « Commencer le brief » / « Annuler » | navigation | « Créer le projet pour X » / « Annuler » | creerProjet | écrit au clic | raccordé | crée tout de suite un projet vide · **18c45d9** · le projet naît à « Continuer » du brief, avec le brief, gratuitement (W/spatial/vues/studios/NouveauProjet.tsx:42) (était « partiel ») |
| A9 | brief | « Nom du projet » | input | champ titre (NouveauProjet, PreparationProjet) | verifierNouveauProjet | studio_projects.title | raccordé | |
| A10 | brief | « Votre intention » + « Jarvis peut reformuler » | textarea | textarea objectif (PreparationProjet) | brief.objective ; reformulation par proposerBrief propositions.ts:45 (brief.build) | version ; appel texte sur le plafond IA ($) | partiel | reformulation seulement après création, sous forme de proposition · **18c45d9** · « Ton intention » saisie (W/spatial/vues/studios/NouveauProjet.tsx:436) · la reformulation passe par une proposition après création |
| A11 | brief | « Audience » | input | lecture dans VueProjet | composerBrief avec audience = brands.audience (W/lib/studios/sources/projet.ts:151) | brief.audience (texte) | raccordé | non saisissable à la création · **18c45d9** · « Audience » saisie à la création (W/spatial/vues/studios/NouveauProjet.tsx:441) (était « partiel ») |
| A12 | brief (r12) | « Pour qui ? obligatoire » + « Gérer les personas » | radio de personas | aucun dans Studios (personas gérés dans brands/[id] et adsmap) | aucune | table personas D:195, non liée au brief | partiel | **18c45d9** · persona Adsmap proposé, facultatif (W/spatial/vues/studios/NouveauProjet.tsx:469) · le rendre obligatoire relève de Kevin (P17 de la Veille) (était « à créer ») |
| A13 | brief | Objectif « Notoriété / Considération / Conversion / Fidélisation » | pastilles radio | aucun | aucune | objective = texte libre | raccordé | **18c45d9** · Objectif (`OBJECTIFS_V5`, C/studios/brief.ts:77, W/spatial/vues/studios/NouveauProjet.tsx:445) (était « à créer ») |
| A14 | brief | Plateformes « Meta · Feed / Stories & Reels / TikTok » | cases | aucun | formatDepuisBrief (C/calques/formats.ts:64) déduit seulement le ratio | brief.formats: string[] | raccordé | **18c45d9** · Plateformes (`PLATEFORMES_V5`, C/studios/brief.ts:81, W/spatial/vues/studios/NouveauProjet.tsx:454) (était « à créer ») |
| A15 | brief | « Contraintes et mentions obligatoires » | textarea | lecture dans VueProjet (Invariants, Exclusions) | proposerPatch / creerPropositionManuelle propositions.ts:36/53 | brief.invariants / exclusions | raccordé | pas de saisie à la création · **18c45d9** · « Contraintes et mentions obligatoires » saisies (W/spatial/vues/studios/NouveauProjet.tsx:462) (était « partiel ») |
| A16 | brief | Carte produit « Changer » | notification | W/app/(app)/studio/projets/[id]/produit → EcranProduit | epinglerProduit produit.ts:43 (gardeSources propose) | productRef instantané · gratuit | raccordé | après création |
| A17 | brief-photo | « Ajouter une photo » : dépôt « Parcourir… », progression, « Utiliser cette photo » | panneau | ImportPhotoProduit (PR #783) | importerPhotoProduit produit.ts:62 sur la branche (studio.propose + projets) | data URI dans products.image_urls ; JPEG/PNG/WebP, 900 000 caractères, 6 photos · gratuit | raccordé | **18c45d9** · #783 fusionné · Spatial · « Ajouter une photo produit » dans le brief (W/spatial/vues/studios/NouveauProjet.tsx:522) (était « raccordé PR #783 ») |
| A18 | brief-photo | « Rôle de cette image » (Produit / Style / Logo) | select | EcranProduit | associerReference produit.ts:54 (role : product, identity, style, composition, logo, integrate) | brief.references | raccordé | |
| A19 | brief-photo | « Provenance et droits » | select | aucune saisie | aucune | studio_assets.rights (jsonb) existe | partiel | **18c45d9** · provenance lue dans l'atelier Produit (#823) · aucune saisie de droits au brief |
| A20 | brief-refs | « Depuis la Veille » : Sauvegardes / Formats / Ce qui scale, cases, « Joindre 1 référence » | panneau | sélection multi-sources seulement à la création (PreparerCreation) | creerProjetDepuisSources sources.ts:74 | sourceRefs | raccordé | aucun ajout de source après création · **18c45d9** · « Depuis la Veille » (10 au plus, W/spatial/vues/studios/NouveauProjet.tsx:534) et ajout de source après création (#823) (était « partiel ») |
| A21 | brief | « Importer un fichier » (référence) | lien | aucun envoi de référence de style | associerReference exige un asset existant | aucune | partiel | seule la photo produit s'importe (PR #783) · **18c45d9** · un fichier de la Bibliothèque se verse dans les références d'un projet (#983, W/spatial/vues/bibliotheque/verser-projet.tsx) · pas d'import direct au brief |
| A22 | wizard | « Enregistrer et quitter » / « Brouillon enregistré » | notification | aucun | versions immuables | aucune | partiel | pas de brouillon d'assistant · **18c45d9** · le projet existe dès le brief et se reprend · pas de brouillon d'assistant avant |

## B. Stratégie, direction, formats et devis

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| B1 | strategie | Chaîne « Avatar → Désir → Angle → Concept → Pub → Résultat » | nœuds statiques | W/app/(app)/adsmap/Canvas.tsx (React Flow) | graphAction (adsmap) | personas D:195, adsmap_desires D:875, adsmap_angles D:889, adsmap_concepts D:935, adsmap_ads D:976 | raccordé | existe dans Adsmap, non lié à studio_projects (testRefs seulement) · **18c45d9** · chaîne de stratégie sur les valeurs réelles du brief (W/spatial/vues/studios/assistant/Strategie.tsx) (était « partiel ») |
| B2 | strategie | « Angles proposés · Suggestions Jarvis » (Observation / Hypothèse / sources) | radios | PreparerCreation | proposerHypotheses sources.ts:56 (studio.propose, tâche test.hypothesize) | faits observed / measured / declared / hypothesis avec sourceIds (C/brief.ts:40-48) ; plafond IA | raccordé | des hypothèses plutôt que des angles, et seulement depuis la Veille · **18c45d9** · « Proposer d'autres angles » (Jarvis, prix avant) et hypothèses depuis la Veille (W/spatial/vues/studios/assistant/Strategie.tsx) (était « partiel ») |
| B3 | strategie-angles | « Autres angles » + « Orientation (facultatif) » + « Proposer 3 angles » | panneau | idem | proposerHypotheses (objectif) | plafond IA | raccordé | **18c45d9** · idem B2 (était « partiel ») |
| B4 | strategie | « Écrire mon angle » | radio | aucun | aucune | aucune | raccordé | **18c45d9** · « Enregistrer mon angle » · proposition manuelle gratuite (W/spatial/vues/studios/assistant/Strategie.tsx) (était « à créer ») |
| B5 | strategie | « Hypothèse à tester » | input | VueProjet bloc Hypothèse | brief.hypothesisId + testedVariable ; modification par proposition | version | raccordé | lecture raccordée, saisie indirecte · **18c45d9** · hypothèses « Retenir » par proposition relue (W/spatial/vues/studios/assistant/Strategie.tsx) (était « partiel ») |
| B6 | direction | Aperçu de pub (mock Meta) | image | rendreApercu rendu.ts:61 (studio.read, editeur) | rendu déterministe | gratuit | partiel | pas de cadre de plateforme · **18c45d9** · « Aperçu de la direction » sur la photo produit réelle (W/spatial/vues/studios/assistant/Direction.tsx:186) · pas de cadre de plateforme · **lot 8** · hors du lot 8 · l’aperçu reste la photo produit réelle, sans cadre de plateforme simulé |
| B7 | direction | « Concept » | input | aucun | aucune | adsmap_concepts.title seulement | raccordé | **18c45d9** · concept lu et modifiable dans la direction (W/spatial/vues/studios/assistant/Direction.tsx) et au brief (W/spatial/vues/studios/NouveauProjet.tsx:479) (était « à créer ») |
| B8 | direction | « Accroche » + 3 variantes radio | input + radios | EcranTextes | ecrireTextes textes.ts:31 (type hook) ; injecterTexte textes.ts:52 | plafond IA | raccordé | dans l'atelier Textes · **ateliers sur la brique** · « Écrire », « Retenir », « Ajouter », « Enregistrer la modification », « Proposer dans ce calque », « Retirer » et les exports passent par la brique d’action serveur (bouton pressé focalisable et `aria-busy`, raison écrite à côté du bouton fermé, hors ligne rien ne part, focus replacé) · preuve `W/test/studios-ateliers-brique-design.test.tsx` |
| B9 | direction | « Style visuel » | textarea | VueProjet « Intention de style » | proposerBrief / proposerPatch | brief.styleIntent, styleRef | raccordé | par proposition |
| B10 | direction | « Appel à l'action » | input | EcranTextes | ecrireTextes type cta | version | raccordé | |
| B11 | direction | Palette (4 pastilles) | statique | aucun | C/sources/da-marque.ts lit la DA de marque | aucune palette dans le contenu | raccordé | **18c45d9** · l'intention de style est un texte libre (W/spatial/vues/studios/assistant/Direction.tsx:209) · pas de pastilles de palette · **lot 8** · pastilles de la palette de la fiche de la marque active (au plus quatre, couleurs valides, sans doublon), lue au serveur (`couleursDeLaMarque`, W/lib/studios/palette-marque.ts · `palettePastilles`, C/spatial/studios/palette-direction.ts) · une fiche sans couleur le dit (W/spatial/vues/studios/assistant/Direction.tsx) (était « à créer ») |
| B12 | direction | « Provenance · release D1 · Sources » | texte | VueProjet montre les sources | studio_project_versions.promptReleaseId, studio_prompt_runs | stocké | partiel | release non affichée au client · **18c45d9** · sources montrées · release non affichée au client |
| B13 | direction | « Autre direction » | notification | PanneauPropositions | proposerBrief propositions.ts:45 | studio_proposals ; l'ancienne est gardée ; plafond IA | raccordé | |
| B14 | direction | « Valider la direction » | étape suivante | PanneauPropositions | appliquerProposition propositions.ts:62 | nouvelle version | raccordé | |
| B15 | format/video/textes | « Publicité / Image · Vidéo · Textes » | segmenté | liens atelier liensAtelierProjet W/lib/navigation.ts:446 | gardes de chaque page | aucune | raccordé | |
| B16 | format | Formats 4:5 / 9:16 / 1:1 (cases) | cases | éditeur, déclinaison | declinerFormat rendu.ts:98 (propose, editeur) ; FORMATS_DOCUMENT C/calques/formats.ts:30 | nouvelle version par format · gratuit | raccordé | un format par document, pas de multi-sélection dans un devis · **18c45d9** · 1:1 · 4:5 · 9:16, plusieurs formats font un lot (`preparerLotFormats`, W/spatial/vues/studios/assistant/FormatDevis.tsx) (était « partiel ») |
| B17 | format | « Zones sûres respectées » | indication | contrôle de déclinaison | zoneSurePx C/rendu/declinaisons.ts:97, verifierDeclinaison :288 | gratuit | raccordé | |
| B18 | format | « Variantes par format » | select 1 à 4 | devis | creerDevis execution.ts:52 (`variante: true`) | devis par version | raccordé | pas de N variantes × M formats en un devis · **18c45d9** · variantes et formats en un lot (`preparerLotImages`, W/spatial/vues/studios/assistant/FormatDevis.tsx) (était « partiel ») |
| B19 | format | « Variation » (Accroche / Composition) | select | PanneauVariantes | iterer variantes.ts:42 (VARIABLES_TEST C/variantes/test.ts:29) | version enfant · gratuit | partiel | **18c45d9** · les variantes d'un lot existent · pas de choix « Accroche / Composition » · **lot 8** · hors du lot 8 · la variable d’une itération se choisit à l’écran Itérer (lot 2), pas à l’étape Format |
| B20 | format | « Moteur » | select | aucun | FAL_IMAGE_MODEL, C/fournisseurs/choix.ts:26-48 | grille plate de 4 crédits par image | décision Kevin | une grille par moteur change le prix (CAPACITES-PAYANTES §3, PR #791) · **18c45d9** · reste à Kevin |
| B21 | format | « Relecture automatique » | case | ParcoursImage (option du devis) | demanderDevisImage image.ts:83 (controleVision) ; avecControleVision C/execution/tarifs.ts:223 | ligne de devis quality.visual (≈0,147 $ de borne par image) | raccordé | |
| B22 | format | « Score Jarvis explicable » | case | aucun | scoreCreative n'a aucun appelant | aucune | décision Kevin | 0 ou 2 crédits (CAPACITES-PAYANTES §1) · **18c45d9** · reste à Kevin |
| B23 | format | Devis serveur « 0,60 $ », jauge de budget, « Recalculé à chaque changement » | carte | ParcoursImage / VueVideo | creerDevis W/lib/studios/execution/commandes.ts:184 ; GRILLE_STUDIO tarifs.ts:67 | studio_quotes immuable, inputHash, 30 min ; crédits et $ | raccordé | pas de jauge du budget disponible, pas de recalcul automatique · **18c45d9** · devis serveur immuable avant tout débit (W/spatial/vues/studios/assistant/FormatDevis.tsx) · pas de jauge du budget, recalcul sur demande · **lot 8** · jauge du solde de crédits (anneau et phrase) dans la tuile du devis · elle LIT le solde de la coquille, ne calcule aucun prix, ne débite rien (`jaugeBudgetDevis`, C/spatial/studios/budget-devis.ts) · le devis reste immuable et recalculé sur demande, par choix (inputHash) (était « partiel ») |
| B24 | video | Storyboard (scènes), « Ajouter une scène », « Réécrire » | cartes | EcranVideo / VueVideo | planifierStoryboard video.ts:70 (studio.generate) ; appliquerOperationVideo :62 (plan, ordre, narration, scénario) | version ; storyboard.plan en $ | raccordé | |
| B25 | video | « Identité vocale » | select | W/app/(app)/studio/projets/[id]/identites (EcranIdentites) | choisirModeParole identites.ts:52 (voix) | génération de voix : speech sans tarif (tarifs.ts) | décision Kevin | **18c45d9** · reste à Kevin · les voix existantes se lisent dans l'atelier Identités (W/spatial/vues/projet/Identites.tsx) |
| B26 | video | « Musique » | select | VueVideo | opération `musique` (C/video/operations.ts) | version | partiel | music.prepare sans appelant · **18c45d9** · piste musique du montage (W/spatial/vues/projet/Video.tsx) · pas de choix de musique |
| B27 | video | « Sous-titres » | select | VueVideo | timeline.subtitles.enabled (C/video/timeline.ts:61,89) | version | partiel | marche/arrêt seulement, pas de langue · **18c45d9** · texte écran du montage · pas de langue de sous-titres |
| B28 | video | « Transitions » | select | aucun | aucune | aucune | à créer | **18c45d9** · aucune transition |
| B29 | video | Devis vidéo | carte | VueVideo | demanderDevisKeyframe video.ts:96, demanderDevisClip :118 ; approuver :102 / :124 | animation estimée | raccordé | par plan |
| B30 | textes | Livrables « Accroches / Texte principal / Titre / Description / Script vidéo » | cases | EcranTextes | TYPES_TEXTE hook, ad_copy, cta, script (C/textes/textes.ts:36) | version | partiel | Titre et Description absents · **18c45d9** · Hook, Corps, CTA, Script (`LIBELLES_TYPE_TEXTE`, C/studios/textes/textes.ts:42) · ni Titre ni Description |
| B31 | textes | « Ton » | select | aucun | aucune | aucune | raccordé | **18c45d9** · ton choisi qui part avec la demande (`TONS_ECRITURE`, W/spatial/vues/projet/Textes.tsx:77) (était « à créer ») |
| B32 | textes | « Longueur » | select | EcranTextes | ecrireTextes maxCaracteres | | raccordé | |
| B33 | textes | « Variantes » 3/2/5 | select | EcranTextes | nombre (VARIANTES_MAX 6) | | raccordé | |
| B34 | textes | « Langue » (dont Suisse allemand) | select | EcranTextes | langue sur 2 lettres |  | partiel | pas de variante régionale · **18c45d9** · langue choisie (W/spatial/vues/projet/Textes.tsx:78) · pas de variante régionale |
| B35 | textes | « Rédiger 3 variantes » | bouton | EcranTextes | ecrireTextes textes.ts:31 (studio.propose, textes) | text.write en $ | raccordé | |

## C. Confirmation, budget, génération, interruption, résultats

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| C1 | confirm | Tableau des paramètres + montants | table | DevisPresente.lignes (ParcoursImage) | commandes.ts:170 presenter | | raccordé | |
| C2 | confirm | « J'ai vérifié le devis… » + « Confirmer et générer » | case + bouton | ParcoursImage | approuverEtMettreEnFile execution.ts:60 / approuverEtLancerImage image.ts:92 (studio.generate) : refus sans fournisseur, plafond, idempotencyKey, inputHash, creditsAnnonces | approbation, réserve, débit, job, outbox en une transaction | raccordé | seule écriture payante · **ateliers sur la brique** · « Préparer », « Valider et voir le prix », devis, « Générer », « Annuler la génération », relecture du parcours image sur la brique d’action serveur · le second clic payant rend le focus au bouton pressé, jamais à `<body>` · prix et gardes de dépense inchangés · preuve `W/test/studios-ateliers-brique-design.test.tsx` |
| C3 | confirm | « Modifier » (invalide le devis) | retour | | inputHash, QUOTE_EXPIRED (C/execution/devis.ts) | | raccordé | |
| C4 | budget | « Le coût estimé dépasse le budget » | alerte | message de refus | BUDGET_EXCEEDED (C/erreurs.ts:29), refusPlafondDollars tarifs.ts:157 | rien n'est débité | raccordé | |
| C5 | budget | « Réduire les variantes » / « Garder un seul format » | liens | aucun | aucune |  | raccordé | suggestions de réduction · **18c45d9** · aucune suggestion de réduction · **lot 8** · après un refus de budget du serveur (`BUDGET_EXCEEDED`), « Réduire les variantes » (1 visuel par format) et « Garder un seul format » · le choix à l’écran change, rien n’est envoyé avant « Voir le devis serveur » (`reductionsDevis`, C/spatial/studios/budget-devis.ts · W/spatial/vues/studios/assistant/FormatDevis.tsx) (était « à créer ») |
| C6 | budget | « Voir les crédits » | lien | W/app/(app)/usage | | | raccordé | |
| C7 | generation | « En cours · 4 / 6 », progression, tâche T-0412 | jauge | VueParcours / VueVideo | etatJob execution.ts:87 | états de job (C/machines.ts:22) | partiel | pas de pourcentage · **18c45d9** · état réel des tâches, pourcentage seulement s'il est mesuré (C/spatial/projet/taches.ts) |
| C8 | generation | « Fermer · la tâche continue » | bouton | | worker hors requête ; reprise par idempotencyKey | | raccordé | |
| C9 | generation | « Voir les tâches » | tasks() | aucune liste de tâches par projet | annulerJob execution.ts:80 |  | raccordé | **18c45d9** · tâches de génération dans l'onglet Créations (W/spatial/vues/projet/OngletCreations.tsx:185, #825) (était « à créer ») |
| C10 | generation | « Voir les créations » | étape | VariantesEtTests | listerVariantes variantes.ts:24 | studio_variants | raccordé | |
| C11 | interrompue | « Interrompue · coût incertain » | badge | états de job dans VueParcours | reconciliation_required, PROVIDER_UNCERTAIN |  | raccordé | écran dédié absent · **18c45d9** · bandeau des tâches interrompues, coût en rapprochement (W/spatial/vues/projet/OngletCreations.tsx:179, #825) (était « partiel ») |
| C12 | interrompue | « Continuer avec les 4 visuels » | lien | sorties livrées → variantes (C/variantes/variante.ts) |  |  | partiel | **18c45d9** · « Garder » une sortie livrée crée une variante (W/spatial/vues/studios/assistant/Creations.tsx) · **lot 8** · le filtre « Retenues / Non retenues » isole les sorties livrées d’un lot, chacune se retient · pas de « Continuer avec les N visuels » en un geste (non porté dans ce lot) |
| C13 | interrompue | « Demander le rapprochement » | lien support | W/app/(app)/admin/depenses (rapprochement ai_spend) ; acteur reconciliateur |  |  | partiel | côté exploitation seulement · **18c45d9** · rapprochement côté exploitation (`/admin/depenses`) |
| C14 | interrompue | « Relancer 2 visuels » (désactivé) | bouton | nouveau devis | aucun blocage explicite lié à reconciliation_required vu |  | partiel | à vérifier · **18c45d9** · relance par un nouveau devis |
| C15 | creations | Filtres « Toutes / 4:5 / 9:16 » | filtres | PanneauVariantes |  |  | raccordé | **18c45d9** · aucun filtre par format dans l'onglet Créations (était « partiel ») · **lot 8** · filtres locaux de la grille · format RÉEL du fichier livré (« 4:5 », « 9:16 », « 3:4 »…), état, retenue, version · seuls les axes qui séparent quelque chose, résumé « n créations sur N » et « Réinitialiser les filtres » (W/spatial/vues/projet/OngletCreations.tsx · règle `filtrerCreations`, `axesFiltresCreations`, `formatCreation`, C/spatial/projet/filtres-creations.ts · W/test/lot8-studios-db.test.tsx) (était « à créer ») |
| C16 | creations | Score /100 + contrôles ok / alerte | carte | statut qualité ; trancherComposants produit.ts:90 |  |  | partiel | aucun score (voir B22) · **18c45d9** · contrôle qualité et composants obligatoires · aucun score (B22 à Kevin) |
| C17 | creations | « Garder » | case | | accepterMedia / rejeterMedia execution.ts:93/99 (studio.propose) | statut qualité · gratuit | raccordé | |
| C18 | creations | « Créer un lot de test » | lien #lots | PreparerEssai (PR #791) | preparerLotEssai tests.ts:55 sur la branche ; rattacherVarianteAuTest tests.ts:25 | studio_test_links | raccordé | **18c45d9** · #791 fusionné · Spatial · « Préparer un lot d'essai » (W/spatial/vues/projet/Rattachement.tsx) (était « raccordé PR #791 ») · **ateliers sur la brique** · « Préparer le lot d’essai » et « Rattacher au test » sur la brique d’action serveur · raison écrite, échec réseau en `<Message horsLigne>`, focus rendu à la variante · preuve `W/test/studios-ateliers-brique-design.test.tsx` |
| C19 | creations | « Ouvrir dans le canvas » | lien #project | CanvasProjet sur la page projet | | | raccordé | |

## D. Vue projet #project, Options et Export

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| D1 | #project | Titre « Neva · exemple · modifications locales » | en-tête | VueProjet.tsx:55-84 (marque, version, étape) | lireProjetDetail sources.ts:114 (studio.read) | | raccordé | |
| D2 | #project | « Brief & références » | onglet | sections Brief, Produit, Sources de VueProjet | | | raccordé | pas d'onglets, tout est empilé |
| D3 | #project | « Canvas » | onglet | CanvasProjet (W/app/(app)/studio/projets/[id]/page.tsx:63) | lireCanvasProjet canvas.ts:22 |  | raccordé | voir §1 · **18c45d9** · onglet Canvas · couloirs de lignée et disposition libre (W/spatial/vues/projet/Projet.tsx:13-18, CanvasLibre.tsx, #827, #927) (était « partiel ») |
| D4 | #project | « Créations » | onglet | VariantesEtTests (page.tsx:61) | listerVariantes | | raccordé | section, pas d'onglet |
| D5 | #project | « Image / Vidéo / Textes » | segmenté | nav atelier VueProjet.tsx:67 ; onglets BarreProjet (PR #782) | | | raccordé | |
| D6 | #project | « Générer… » | modale de devis fictive | pas d'entrée unique : ParcoursImage, VueVideo |  |  | raccordé | **18c45d9** · puce « Générer… » qui ouvre la préparation (W/spatial/vues/projet/Projet.tsx:94) (était « partiel ») |
| D7 | #project | « Masquer Jarvis » | bascule | BarreProjet (PR #782) | cookie tt_jarvis (C/ux/espace-creation.ts sur la branche) | appareil | caduc | **18c45d9** · #782 fusionné puis retiré avec la V5 (#941) · la maquette Spatial n'a pas de « Masquer Jarvis » (était « raccordé PR #782 ») |
| D8 | #project | « Options » | tiroir | aucun menu (liens éclatés) |  |  | caduc | **18c45d9** · pas de menu « Options » dans la maquette Spatial · ses entrées sont des puces et des ateliers (était « partiel ») |
| D9 | Options | « Agrandir le canvas » | mode zen | mode focus Alt F (PR #782) |  |  | caduc | focus de la page, pas plein écran du canvas · **18c45d9** · #782 retiré avec la V5 · la maquette Spatial n'a ni mode focus ni plein écran du canvas (était « raccordé PR #782 ») |
| D10 | Options | « Versions » + « Restaurer » | tiroir | « Historique des versions » VueProjet.tsx:194 (lecture ?version=) ; PanneauVersions (PR #784) | restaurerVersionDocument W/lib/studios/editeur/actions.ts:43 sur la branche (propose, editeur) | nouvelle version | raccordé | restauration dans l'éditeur image · **18c45d9** · #784 fusionné · Spatial · historique des versions et restauration en nouvelle version (W/spatial/vues/projet/Editeur.tsx:542, #903) (était « raccordé PR #784 ») |
| D11 | Options | « Produit & références » | lien | /studio/projets/[id]/produit | lireProduitProjet produit.ts:35 | | raccordé | |
| D12 | Options | « Vérifier avant export » | lien | « Contrôle avant export » dans PanneauExport ; C/export/preflight.ts |  |  | raccordé | technique seulement · **18c45d9** · contrôle avant export, technique (W/spatial/vues/projet/Export.tsx) · **lot 8** · le contrôle avant export porte la partie technique (préflight, inchangé) PUIS la relecture humaine de la version, qui ferme l’export tant qu’elle n’est pas validée (W/lib/studios/export/relecture.ts) (était « partiel ») |
| D13 | Options | « Activité » | lien | aucune interface | W/lib/studios/audit.ts écrit studio_audit_events (D:1691) |  | à créer | **18c45d9** · `studio_audit_events` écrit, sans écran |
| D14 | Options | « Tous les projets » | lien | /studio/projets | listerProjetsCartes sources.ts:124 | | raccordé | |
| D15 | Options | « Commentaires » | tiroir | aucun | aucune table |  | à créer | **18c45d9** · aucun commentaire |
| D16 | Options | « Raccourcis » | tiroir | Alt B (W/components/AppShell.tsx:330), Alt F (PR #782), raccourcis éditeur |  |  | à créer | aucun panneau d'aide · **18c45d9** · Alt B et Alt F ont disparu avec la V5 · seul ⌘K reste (W/spatial/coquille/Coquille.tsx:204) (était « partiel ») |
| D17 | Options | « Identité vocale » | tiroir | EcranIdentites | enregistrerIdentite identites.ts:31 |  | partiel | voix : voir B25 · **18c45d9** · atelier Identités et voix (W/spatial/vues/projet/Identites.tsx) · voix nouvelle à Kevin (B25) |
| D18 | #project | « Exporter » | tiroir | /studio/projets/[id]/export (PanneauExport) ; lien dans BarreProjet (PR #782) | lireExportProjet export.ts:19 | | raccordé | |
| D19 | export | Format PNG / JPEG | select | PanneauExport | exporterVersion export.ts:25 (studio.export, capacité export) ; GET W/app/api/studios/export/[versionId]/route.ts:36-37 | fichier rendu | raccordé | |
| D20 | export | MP4 · H.264 | select | VueVideo | assemblerVideoFinale video.ts:145 (studio.export, video) | | raccordé | |
| D21 | export | Texte brut / CSV | select | EcranTextes | exporterTextes textes.ts:46 (markdown, csv, json) | | raccordé | |
| D22 | export | Dimensions 4:5 / 9:16 / 1:1 | select | dimensions du document | declinerFormat avant export |  | partiel | **18c45d9** · dimensions mesurées du fichier livré (W/spatial/vues/projet/Export.tsx) · le format est celui du document |
| D23 | export | « Version actuelle uniquement » | case | « Version à exporter » | | | raccordé | |
| D24 | export | « Simuler l'export » | bouton | « Télécharger » | | | raccordé | |
| D25 | (réel seulement) | « Produire ailleurs » | | ExporterBrief | exporterBrief sources.ts:104 (studio.export) | markdown / json | raccordé | absent de V5 |

## E. Canvas V5 (v5-r9.js) et panneau Jarvis (v5-r10.js)

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| E1 | canvas | Nœud Brief (contexte) | carte | carte `brief` (C/canvas/modele.ts:152) | | | raccordé | |
| E2 | canvas | Fiche marque | carte | aucune |  |  | raccordé | **18c45d9** · nœud marque avec la complétude réelle de la fiche (`fiche`, C/spatial/projet/noeuds.ts:92) (était « à créer ») |
| E3 | canvas | Référence Veille | carte | sources dans VueProjet, pas sur le canvas |  | sourceRefs | raccordé | **18c45d9** · nœud référence de Veille avec vignette (C/spatial/projet/noeuds.ts:116) (était « à créer ») |
| E4 | canvas | Asset | carte | `entree:produit`, `identite:*` |  |  | raccordé | **18c45d9** · nœud produit « ASSET » (C/spatial/projet/noeuds.ts:41) (était « partiel ») |
| E5 | canvas | Hypothèse | carte | aucune carte |  | brief.hypothesisId | raccordé | **18c45d9** · nœud hypothèse, énoncé et mesure (`hypotheseVue`, C/spatial/projet/noeuds.ts:94) (était « à créer ») |
| E6 | canvas | Direction créative | carte | `entree:style` |  | styleRef | raccordé | **18c45d9** · nœud direction de la lignée (C/spatial/projet/noeuds.ts:3) (était « partiel ») |
| E7 | canvas | Image / Vidéo / Texte (création) | cartes avec visuel | `keyframe:*`, `clip:*`, `voix:*`, `composition`, `export` |  |  | raccordé | pas de miniature ; texte sans carte · **18c45d9** · nœud création avec aperçu réel du média livré (`apercusCreations`, C/spatial/projet/noeuds.ts:88) (était « partiel ») |
| E8 | canvas | Résultat « Lot #1 · 14 jours » (barres A / B / C) | carte | aucune carte | lireApprentissage tests.ts:34 | studio_test_links | raccordé | **18c45d9** · nœud résultat avec barres mesurées (C/spatial/projet/noeuds.ts:59, :143) (était « à créer ») |
| E9 | canvas | Apprentissage | carte | aucune carte | relireApprentissage tests.ts:40 (learning.review) | plafond IA | raccordé | **18c45d9** · nœud apprentissage (C/spatial/projet/noeuds.ts:40) (était « à créer ») |
| E10 | canvas | Itération (V3 « Devis : 24 crédits », V3b) | carte | aucune carte | iterer → version enfant (parentId) |  | partiel | **18c45d9** · nœud itération et sa consigne (C/spatial/projet/noeuds.ts:41) · pas de devis sur le nœud (le devis vient à la préparation) (était « à créer ») · **lot 11** · sur le canvas de lignée (`?disposition=libre&graphe=lignee`) et dans sa liste, le nœud itération ouvre la version itérée (écran existant) · toujours pas de devis sur le nœud · le devis serveur vient à la préparation, jamais sur une carte (aucun appel de devis depuis le canvas) |
| E11 | canvas | Note | carte | aucune |  |  | à créer | donnée nouvelle · **18c45d9** · aucune note · donnée nouvelle · **lot 11** · hors du lot · une note libre est une donnée NOUVELLE (table ou colonne, migration) · rangée dans « Reste » · la lignée ne pose aucun nœud qui ne vienne des données (`LIGNEE_A_VENIR`) |
| E12 | canvas | Groupes « Lot #1 », « Lot #5 » + « Replier les perdants » | cadres | aucun | rang de lot (C/variantes/variante.ts) |  | raccordé | **18c45d9** · « Replier les perdants » (W/spatial/vues/projet/Projet.tsx:102) · pas de groupe par lot (était « à créer ») · **lot 11** · groupes de lot CALCULÉS (`groupesLignee`, C/spatial/projet/lignee-canvas.ts) · lot de production (nœud « Lot » et les créations que la lignée lui relie) et lot de TEST Adsmap (résultats dont la fiche est dans ce lot, `adsmap_ads.batch_id`, et leurs apprentissages) · cadres dans les couloirs (`grouperCouloirs`, `elementsCouloir`, W/spatial/vues/projet/Projet.tsx) et sur le canvas de lignée (`cadresLignee` · un cadre ne recouvre jamais une carte hors du groupe) · le lot de test dit son statut, sa conclusion (`conclusionLot`, lue sous la garde des Résultats, marque active = marque du projet) et ouvre sa fiche `/adsmap/lots/<id>` · « Replier les perdants » garde le cadre · preuve `product/packages/core/test/lot11-lignee-canvas.test.ts`, `W/test/lot11-lignee-db.test.tsx` (était « partiel ») |
| E13 | canvas | Badges « Gagnant » / score en % | pastilles | aucun | verdict Adsmap via test link |  | partiel | **18c45d9** · badge « Gagnant » des résultats mesurés (C/spatial/projet/noeuds.ts:105) · pas de score en % (était « à créer ») |
| E14 | canvas | Ports entrée / sortie | décor | aucun |  |  | caduc | liens dérivés, jamais tracés à la main · **18c45d9** · la lignée est dérivée, aucun lien ne se trace à la main · pas de ports (était « partiel ») · **lot 11** · toujours caduc · le canvas de lignée ne pose aucun nœud libre, ne trace aucun lien à la main, ne supprime rien · seules les positions s'enregistrent (`enregistrerDispositionCanvas`, même clé personnelle, identifiants disjoints `estIdLignee`) |
| E15 | canvas | Liens et libellés « Contexte, Accroche, Visuel, Mesure, Itération, base : B, garde l'accroche » | SVG | LienCanvas {de, vers} sans type ni libellé |  |  | raccordé | **18c45d9** · liens catégorisés et libellés (`relie(de, vers, categorie, libelle)`, C/studios/canvas/lignee.ts:166) (était « partiel ») |
| E16 | canvas | Légende | puces | natures « Entrée / Génération / Calcul » |  |  | raccordé | **18c45d9** · cinq couloirs nommés (Contexte, Hypothèse, Créations, Mesure, Itération, C/spatial/projet/noeuds.ts:2) · pas de légende des liens · **lot 11** · légende des catégories de liens (`legendeLignee`, `STYLE_LIEN_LIGNEE`) sur le canvas de lignée · seules les catégories qui ont au moins un lien EN DONNÉES, avec leur nombre et le motif dit en mots (trait plein, tirets, pointillés, tirets et points) · chaque trait porte sa catégorie lue dans la lignée (`categorieLienLignee`), jamais un lien sans donnée · preuve `W/test/lot11-lignee-db.test.tsx` (traits = liens semés, exactement) (était « partiel ») |
| E17 | canvas | Sélection (V) | outil | sélectionner (C/canvas/vue.ts) | | | raccordé | touche V absente |
| E18 | canvas | Main (H) | outil | panoramiquer | | | raccordé | touche H absente |
| E19 | canvas | Ajouter Texte / Image / Vidéo / Référence Veille / Asset / Hypothèse / Note (barre + double-clic « Ajouter ici ») | outils | aucun |  |  | caduc | à passer par les commandes métier, pas des nœuds libres · **18c45d9** · les nœuds viennent des commandes métier, jamais d'ajout libre (C/spatial/projet/noeuds.ts:7) (était « à créer ») · **lot 11** · toujours caduc · le canvas de lignée ne pose aucun nœud libre, ne trace aucun lien à la main, ne supprime rien · seules les positions s'enregistrent (`enregistrerDispositionCanvas`, même clé personnelle, identifiants disjoints `estIdLignee`) |
| E20 | canvas | Zoom − / % / + | barre | CanvasMetier.tsx:252-254 | | | raccordé | |
| E21 | canvas | « Tout afficher » | bouton | « Ajuster » :251 (touche 0) | | | raccordé | |
| E22 | canvas | Mini-carte | bouton | aucune |  |  | raccordé | **18c45d9** · aucune mini-carte · **lot 11** · mini-carte du canvas de lignée (`miniCarteLignee`) · cartes posées, cadres et fenêtre visible réduits dans 168 × 104 · DÉCORATIVE (`aria-hidden`, aucun geste) · se déplacer passe par la vue (molette, glisser, « Ajuster », « Centrer la sélection ») et par la liste (« Montrer sur le canvas ») · preuve `W/test/lot11-lignee-db.test.tsx` (était « à créer ») |
| E23 | canvas | Ctrl + molette | geste | molette :136 | | | raccordé | |
| E24 | canvas | Glisser un nœud | geste | déplacer | enregistrerDispositionCanvas canvas.ts:29 (studio.read) | app_settings, par personne, rev · gratuit | raccordé | |
| E25 | canvas | Suppr supprime un nœud | clavier | aucun |  |  | caduc | contraire au modèle dérivé · **18c45d9** · contraire au modèle dérivé · rien ne se supprime depuis le canvas (était « à créer ») · **lot 11** · toujours caduc · le canvas de lignée ne pose aucun nœud libre, ne trace aucun lien à la main, ne supprime rien · seules les positions s'enregistrent (`enregistrerDispositionCanvas`, même clé personnelle, identifiants disjoints `estIdLignee`) |
| E26 | canvas | Double-clic → détail « Vient de / A donné », « Itérer », « Demander à Jarvis » | tiroir | DetailCarte (entreesDeCarte / sortiesDeCarte) | | | raccordé | sauf Itérer |
| E27 | canvas | « + » « Itérer depuis ce nœud » (Format, Accroche, Visuel, Durée, Appel à l'action) | menu | PanneauVariantes | iterer variantes.ts:42 (variables format, hook, opening_visual, length, cta) | version enfant · gratuit | raccordé | depuis une variante, pas depuis une carte · **18c45d9** · « Itérer » part d'une variante (onglet Créations) · pas depuis un nœud · **lot 2** · le couloir Itération porte un nœud « À décliner » par variante testée gagnante (verdict arbitré, comparable) · « Itérer · choisir la variable » ouvre Itérer, pub présélectionnée, où l’on choisit la variable (`noeudsIterationProjet`, C/spatial/studios/iterer-variable.ts) · un nœud dans le couloir, pas un « + » sur chaque carte · vide, le couloir dit pourquoi (était « partiel ») |
| E28 | canvas | « Générer » sur un nœud d'itération | bouton | aucun | creerDevis(operations = ids de cartes) commandes.ts:184 |  | partiel | les ids de cartes sont les ids du plan d'impact · **18c45d9** · pas de génération depuis un nœud · « Générer… » ouvre la préparation · **lot 2** · le nœud d’itération mène au choix de la variable puis à la préparation, où le devis serveur précède toute génération · pas de génération lancée depuis le nœud |
| E29 | canvas | « Demander à Jarvis · n nœud » | bouton | « Préparer une demande à Jarvis · X » DetailCarte.tsx:89 (ciblerJarvis) |  |  | partiel | une seule cible, pas de multi-sélection · **18c45d9** · « Cibler Jarvis » sur un nœud (W/spatial/vues/projet/Projet.tsx:122, #906) · une seule cible · **lot 5** · « Demander à Jarvis » dans l’en-tête joint le projet ENTIER (bloc concept) · « Cibler Jarvis » reste à une cible, pas de multi-sélection |
| E30 | canvas | « Centrer » (via le détail) | | « Centrer la sélection » :255 | | | raccordé | |
| E31 | (réel seulement) | « Liste » / « Canvas », « Réinitialiser la disposition » | | CanvasMetier.tsx:246-258 | reinitialiserDispositionCanvas canvas.ts:36 | | raccordé | absent de V5 |
| E32 | Jarvis | « Ouvrir en plein écran » | lien #jarvis | W/app/(app)/jarvis |  |  | raccordé | contexte projet non transmis · **18c45d9** · panneau Jarvis du projet sur son fil lié (`projectId`, W/spatial/vues/projet/PanneauJarvis.tsx) · pas d'ouverture plein écran avec ce contexte · **lot 5** · « Demander à Jarvis » dans l’en-tête du projet ouvre `/jarvis?contexte=projet&id=…` · projet relu sous les gardes de l’écran Projets (`conceptPourJarvis`, W/lib/studios/jarvis-projets.ts), fil LIÉ rouvert, bloc concept affiché tel qu’il partira, question préparée, rien d’envoyé · un projet d’une autre marque est refusé (page et route) · garde `W/test/lot5-jarvis-contexte-db.test.tsx`, `W/test/lot5-jarvis-contexte-route-db.test.ts` (était « partiel ») |
| E33 | Jarvis | Carte de contexte « Image · B · Question » | | « Cible » du FormulaireDemande | | | raccordé | |
| E34 | Jarvis | « Suggestion · à valider » | carte | PanneauPropositions | studio_proposals (draft / proposed) | | raccordé | |
| E35 | Jarvis | « Créer l'itération » | bouton |  | iterer variantes.ts:42 | gratuit | raccordé | non relié à une suggestion · **18c45d9** · actions typées du concept (`actionsConceptResolues`, W/spatial/vues/projet/PanneauJarvis.tsx) · « Créer l'itération » non relié à une suggestion · **lot 5** · hors du lot 5 · « Créer l’itération » n’est pas relié à une réponse de Jarvis · **lot 5 bis** · sur le plein écran Jarvis, avec un lot ou une hypothèse joints, « Créer l’itération » sous la réponse ouvre Itérer, pub et variable présélectionnées depuis la réponse (bornées aux listes fermées, relues au serveur · `iterationDepuisReponse`, C/spatial/jarvis/gestes.ts) · le panneau Jarvis d’un PROJET n’a toujours pas ce geste · **lot 5 ter** · le panneau Jarvis d’un PROJET porte « Créer l’itération » sous la dernière réponse, SEULEMENT quand elle désigne sûrement une variante gagnante du projet (nommée seule par son libellé, ou la seule gagnante et un conseil · une perdante nommée ne désigne rien · `gesteIterationProjet`, C/spatial/jarvis/suite.ts) · lien vers l’écran Itérer EXISTANT (`?reponse=<uuid>&contexte=projet&id=<projet>`) · la réponse est relue dans le fil LIÉ à ce projet (espace, marque active, personne · `lireReponseJarvis`), les variantes dans la portée studio ET la marque active (`lireCandidatsProjet`, W/lib/jarvis-gestes.ts), la variable bornée aux admises · puces, patch et devis du panneau inchangés · rien n’est créé sans le clic · preuve `W/test/lot5t-jarvis-suite-db.test.tsx` (était « partiel ») |
| E36 | Jarvis | « Pourquoi ? » | bouton | AvantApres, PlanImpactVue | lireApprentissage |  | partiel | **18c45d9** · avant / après et plan d'impact des propositions (W/spatial/vues/projet/Propositions.tsx) |
| E37 | Jarvis | « Analyser les variantes » | action rapide | | lireApprentissage (gratuit) / relireApprentissage (coût maximal annoncé) | | raccordé | |
| E38 | Jarvis | « Prochaine itération » | action rapide |  | suggestion nextVariable de relireApprentissage |  | partiel | **18c45d9** · plan d'itération réel ailleurs (Accueil, `/studio/iterer`) · pas dans le panneau · **lot 5** · « Quelle variante tester ensuite » se prépare depuis un lot joint sur `/jarvis` · toujours pas dans le panneau du projet · **lot 5 ter** · depuis une réponse du panneau qui désigne une gagnante, « Créer l’itération » ouvre Itérer pré-rempli (pub, variable admise) · pas encore d’action rapide « Prochaine itération » sans réponse (la suggestion `nextVariable` de la relecture reste sur la carte de la variante) |
| E39 | Jarvis | « 3 accroches » | action rapide | | ecrireTextes (hook, nombre 3) | | raccordé | |
| E40 | Jarvis | « Conformité marque » | action rapide | aucun |  |  | décision Kevin | nouvel appel payant · **18c45d9** · reste à Kevin |
| E41 | Jarvis | « Joindre » | trombone | aucun |  |  | à créer | **18c45d9** · aucune pièce jointe au message Jarvis |
| E42 | Jarvis | « Demander à Jarvis sur ce projet… » + Envoyer | zone de saisie | FormulaireDemande | proposerPatch / proposerBrief propositions.ts:36/45 ; refus BUDGET_EXCEEDED | | raccordé | |
| E43 | Jarvis | « Appliquer » (accroche) | bouton | | appliquerProposition :62 / injecterTexte textes.ts:52 | | raccordé | |

## F. Pages #product, #review, #activity, #execution, #jobs

| id | vue | contrôle | proto | route/composant réel | action réelle et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| F1 | #product | « Image PNG ou JPEG · 10 Mo maximum » | input de fichier | ImportPhotoProduit (PR #783) | importerPhotoProduit |  | raccordé | voir A17 · **18c45d9** · #783 fusionné · Spatial · import de la photo (W/spatial/vues/projet/Produit.tsx:7) (était « raccordé PR #783 ») · **ateliers sur la brique** · « Choisir une photo et l’épingler », « Utiliser cette photo », « Associer ce fichier » et « Retirer » sur la brique d’action serveur · preuve `W/test/studios-ateliers-brique-design.test.tsx` |
| F2 | #product | « Rôle de la référence » | select | EcranProduit | associerReference | | raccordé | |
| F3 | #product | « Source ou provenance » | champ | aucun |  | studio_assets.rights | partiel | **18c45d9** · provenance lue (`libelleProvenance`, W/spatial/vues/projet/Produit.tsx:67) · aucune saisie |
| F4 | #product | « Contraintes » | textarea |  | ReferenceBrief.allowedChanges, brief.invariants |  | partiel | **18c45d9** · composants obligatoires du produit épinglé (W/spatial/vues/projet/Produit.tsx:110) |
| F5 | #product | « Conserver dans la démo » | bouton | EcranProduit | epinglerProduit | | raccordé | |
| F6 | #review | 5 cases de contrôle humain | cases | aucun |  |  | raccordé | **18c45d9** · aucune liste de contrôle humain avant export · **lot 8** · tuile « Relecture humaine » de l’atelier Export · cinq points (produit, textes, promesses, marque, diffusion), tous obligatoires (`POINTS_RELECTURE_EXPORT`, `pointsRelectureValides`, C/studios/export/relecture.ts) · validés par `validerRelectureExport` (W/app/actions/studios/export.ts · `studio.export`, la garde de l’export) · qui et quand dans le journal existant (`studio_audit_events`, action `project.export.review`, aucune migration) · liée à LA version (était « à créer ») |
| F7 | #review | « Ouvrir l'export » (actif quand tout est coché) | bouton | PanneauExport |  |  | raccordé | **18c45d9** · atelier Export (W/spatial/vues/projet/Export.tsx) · ouvert sans cases · **lot 8** · PNG et JPEG ne s’ouvrent que préflight passé ET version relue (`etatExportHumain`), raison écrite à côté · le serveur refait les deux contrôles au clic (`exporterVersionPour` · refus `QUALITY_REVIEW_REQUIRED`, aucun fichier, aucune trace) · « Relue par … le … à … · version n » (W/spatial/vues/projet/Export.tsx) (était « partiel ») |
| F8 | #review | « Contrôle technique » | texte | C/export/preflight.ts | | | raccordé | |
| F9 | #activity | Tableau événement / version / origine | table | aucun |  |  | à créer | **18c45d9** · `studio_audit_events` sans écran |
| F10 | #activity | « Versions restaurables » | bouton | PR #784 |  |  | raccordé | **18c45d9** · #784 fusionné · Spatial · historique des versions de la fiche et de l'éditeur (W/spatial/vues/projet/Editeur.tsx:542) (était « raccordé PR #784 ») |
| F11 | #activity | « Traçabilité Jarvis » | bouton | /admin/ia-studios (EcranExecutions) | gardePlateforme |  | partiel | personnel plateforme seulement · **18c45d9** · traces au registre IA (`/admin/prompts/registre`), personnel plateforme seulement |
| F12 | #execution | Fiche projet, action, release, sources, modèle, coût réel, sortie | fiche | vueExecutions /admin/ia-studios |  | studio_prompt_runs | partiel | personnel plateforme seulement · **18c45d9** · registre IA (`/admin/prompts/registre`, W/spatial/vues/admin/Registre.tsx), personnel plateforme seulement |
| F13 | #execution | « Voir la consigne compilée » | bouton | VueParcours « Compilée » | compilerConsigneImage image.ts:64 |  | partiel | **18c45d9** · consigne compilée lue dans le parcours image (W/spatial/vues/projet/ParcoursImage.tsx) |
| F14 | #execution | « Voir le journal » | bouton | aucun côté client |  |  | à créer | **18c45d9** · aucun journal côté client |
| F15 | #jobs | Tableau tâches / état / dépense / action | table | jobs par atelier (VueParcours, VueVideo) ; /admin/incidents, /admin/depenses | etatJob, annulerJob |  | partiel | aucune liste par projet ou espace · **18c45d9** · tâches par projet (onglet Créations) · aucune liste par espace |
| F16 | #jobs | « Examiner » / « Voir le livrable » | boutons |  |  |  | partiel | **18c45d9** · sorties livrées et variantes dans l'onglet Créations |

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
