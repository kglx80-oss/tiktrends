# UX V2 · lot 3b · inventaire des capacités payantes retirées avec les anciens studios

Mandat : restaurer DANS les projets Studios ce que #779 a retiré (`INVENTAIRE.md` § 4). Ce lot
n'appelle AUCUNE des capacités ci-dessous et n'ajoute aucune interface pour elles. Il dit, pour
chacune : le moteur réel qui reste, son coût (mesuré ou estimé, avec la source), le chemin de
devis et de budget à emprunter, et un plan de raccord dans le projet.

Méthode de mesure (0 $) : les requêtes sont construites par les VRAIES fonctions de
`@tiktrends/ai` avec un client qui capture la requête au lieu de l'envoyer, champs à leur
longueur maximale (les `slice` du code), image de 1 Mo, puis passées à `estimationAppel` et
`coutMaximalAppel` (`apps/web/lib/spend-guard.ts`) · même procédé que
`apps/web/test/r3-borne-mesure.test.ts`. Contrôle de la méthode : `controlePubEntiere` redonne
au micro-dollar près la ligne déjà publiée dans `packages/core/src/depense-prudente.ts:206`.

| Appel mesuré (12/10, tête `394ed04`) | Modèle | `max_tokens` | Estimation | Borne réservée |
| --- | --- | --- | --- | --- |
| `scoreCreative`, image 1 Mo, champs au maximum | `claude-sonnet-5` | 700 | 0,030585 $ | 0,056169 $ |
| `scoreCreative`, texte seul | `claude-sonnet-5` | 700 | 0,015126 $ | 0,037569 $ |
| `cloneAdFromReference`, image 1 Mo, consigne 500 car. | `claude-sonnet-5` | 1 200 | 0,036330 $ | 0,056352 $ |
| `controlePubEntiere`, 2 images de 1 Mo | `claude-haiku-4-5-20251001` | 700 | 0,013828 $ | 0,019304 $ |

Tarifs de jetons : `packages/core/src/spend-guard.ts:40-42` (Sonnet 5 · 3 $ / 15 $ par million,
Haiku 4.5 · 1 $ / 5 $). Les montants ci-dessus sont des dollars réels sur le plafond IA
(`AI_SPEND_CAP_USD`), pas des crédits.

Chemins de dépense existants, à emprunter tels quels :

- **Texte et vision Anthropic hors Studios** · `guardedAnthropic` (`apps/web/lib/spend-guard.ts:253`),
  qui réserve la borne `coutMaximalAppel` puis règle au coût réel.
- **Coût fixe fournisseur (image fal)** · `sousPlafond` (`apps/web/lib/spend-guard.ts:413`), qui
  appelle `guardFixedCost` (`:351`) puis rend la réserve si l'appel échoue.
- **Studios** · le devis serveur : `creerDevis` (`apps/web/lib/studios/execution/commandes.ts:184`)
  puis `approuverEtMettreEnFile` (`:305`), grille `GRILLE_STUDIO`
  (`packages/core/src/studios/execution/tarifs.ts:67`), refus plafond `refusPlafondDollars`
  (`:157`), ligne de contrôle visuel `avecControleVision` (`:223`). Pour une tâche texte des
  Studios : coût maximal annoncé avant le clic et revérifié au serveur, comme
  `relireApprentissage` (`apps/web/lib/studios/variantes/apprentissage.ts:141`,
  `coutMaxRelectureUsd` · `packages/core/src/studios/variantes/apprentissage.ts:205`).

---

## 1. Score Jarvis d'une pub

| | |
| --- | --- |
| Moteur restant | `scoreCreative` · `packages/ai/src/critique.ts:104` (modèle `GEN_MODEL`, `packages/ai/src/generation.ts:3`, `max_tokens` 700, outil `return_score`). **Aucun appelant** dans l'application à `394ed04` (seuls des tests l'importent). |
| Ancien chemin | `scoreCreativeAction` · `git show 0b49d45^:product/apps/web/app/actions/ads.ts`, ligne 1803 : `guardedAnthropic({ action: 'ads' })`, crédits `costFor('score')`, résultat mis en cache (`force` pour relancer). |
| Coût | Dollars · borne mesurée 0,056169 $ avec image, 0,037569 $ texte seul (tableau ci-dessus). Crédits · `CREDIT_COSTS.score = 2` (`packages/core/src/credits.ts:11`). |
| Devis et budget | Dans un projet, une tâche texte/vision des Studios ne passe pas par `guardedAnthropic` mais par le résolveur de prompts (release ADMIN publiée, `SPEC-INTERACTIONS` § 5) avec coût maximal annoncé, comme `learning.review`. Le catalogue des tâches (`packages/core/src/prompts/semantique.ts`) n'a pas de tâche « score ». |
| Plan de raccord | 1) Ajouter une tâche de catalogue (ex. `quality.score`) publiée par une release ADMIN · aucune clé de prompt écrite en dur. 2) Commande serveur sur UNE variante (média précis), coût maximal calculé par la même règle que `coutMaxRelectureUsd` sur le budget de la tâche, annoncé sur le bouton, revérifié au serveur. 3) Résultat écrit au journal d'audit (ajout seul) et lu par `listerVariantes`, affiché sur la carte de la variante comme pronostic, jamais comme résultat mesuré (`SPEC` § 7 : hypothèse ≠ observation ≠ résultat). |
| Question | Les tâches texte des Studios sont annoncées « sur le plafond IA, aucun crédit » (`libelleCoutRelecture`). L'ancien score débitait 2 crédits. Garder 0 crédit ou facturer 2 crédits est une décision de prix · à trancher par Kevin. |

## 2. Relecture automatique d'une pub entière

| | |
| --- | --- |
| Moteur restant | `controlePubEntiere` · `packages/ai/src/controle-pub.ts:119` (modèle `CONTROLE_MODEL`, `:37`, Haiku 4.5). **Aucun appelant** à `394ed04`. |
| Successeur déjà branché dans les Studios | Contrôle visuel de chaque sortie, tâche `quality.visual` (`apps/web/lib/studios/produit/qualite.ts`, action de dépense `studio-prompt:quality.visual`, `:208`). C'est une ligne VISIBLE et chiffrée du devis, active par défaut et décochable avant d'accepter (`avecControleVision`, décision du 8 octobre). |
| Coût | Ancien moteur · borne 0,019304 $ par relecture (2 images, `depense-prudente.ts:206`, re-mesurée). Successeur · borne 0,147024 $ par image au tarif Sonnet 5, mesure 0,089604 $ (`packages/core/src/studios/execution/tarifs.ts:166-196`, `apps/web/test/r3-controle-vision-db.test.ts`). |
| Devis et budget | Déjà dans le devis Studios (ligne `controle:vision`, 0 crédit, dollars réels). Aucun débit après coup : sans ligne approuvée, le contrôle est refusé. |
| Plan de raccord | Ne pas rebrancher `controlePubEntiere` · la relecture d'une SORTIE existe déjà dans les projets. Ce qui manque est la relecture d'une pub COMPOSÉE (image + calques texte exportés) : elle relèverait du même `quality.visual`, en ligne de devis de l'export, annoncée avant le clic. Les verdicts déjà produits par `quality.visual` sont visibles dans « Variantes et tests » (statut qualité séparé du statut technique). |
| Question | Relire la pub composée à l'export ajoute une ligne payante à un geste aujourd'hui gratuit (export) · à décider avant tout raccord. |

## 3. Clone d'une pub avec choix du moteur

| | |
| --- | --- |
| Moteur restant | Analyse de la référence · `cloneAdFromReference` (`packages/ai/src/ads.ts:203`, Sonnet 5, `max_tokens` 1 200), **aucun appelant**. Génération · fournisseur image des Studios (`packages/core/src/studios/fournisseurs/fal-image.ts`, familles `familleModele` `:181`). |
| Ancien chemin | `cloneAdAction` · `git show 0b49d45^:product/apps/web/app/actions/ads.ts`, ligne 1468 : moteur choisi par la personne (`imageModelByKey`), crédits `modelSpec.credits × nombre`, image par `sousPlafond('fal_image')`. |
| Coût | Analyse · borne mesurée 0,056352 $. Image · selon le moteur, catalogue `IMAGE_MODELS` (`packages/core/src/economics.ts:145-157`) : Nano Banana 2 · 4 crédits (0,039 € réel), Nano Banana 2 Haute · 8 (0,09 €), GPT Image 2 · 5 (0,049 €), GPT Image 2 Haute · 20 (0,195 €), GPT Image 1 · 8 (0,08 €). Studios aujourd'hui · prix PLAT par image, `CREDIT_COSTS.image = 4` crédits et `FIXED_COSTS.fal_image = 0,08 $` réservés (`tarifs.ts:68`, `packages/core/src/spend-guard.ts:88`). `CREDIT_COSTS.clone_image = 5` existe encore (`credits.ts:9`). |
| Devis et budget | Le moteur des Studios n'est PAS choisi par devis : il vient de l'environnement (`FAL_IMAGE_MODEL`, défaut `fal-ai/nano-banana-2`, `packages/core/src/studios/fournisseurs/choix.ts:26-48`). |
| Plan de raccord | 1) « Créer depuis une référence » existe déjà en esprit dans les Studios : source de veille → brief (`brief.build`) → lot d'images par devis (`SPEC` § 7 : créer depuis une référence préremplit le brief). Le clone se raccorde là, sans moteur d'analyse séparé. 2) Le choix du moteur demande que le devis porte le moteur ET son prix : `GRILLE_STUDIO` deviendrait fonction du moteur (4 à 20 crédits), ce qui change la grille (`PRICING_VERSION`). C'est un changement de prix · hors de ce lot, interdit sans accord. 3) Le défaut conscient du mode (`moteurRecommande`, `economics.ts:230`) serait la valeur préselectionnée. |
| Question | (a) Accepter une grille Studios par moteur ? (b) Point à vérifier côté exploitation : si `FAL_IMAGE_MODEL` désigne un moteur plus cher que 0,08 $ l'image (GPT Image 2 Haute, 0,195 €), la réserve fixe sous-estimerait la dépense réelle. Non vérifiable depuis la session (pas d'accès au VPS). |

## 4. Scènes enregistrées (presets)

| | |
| --- | --- |
| Moteur restant | Table `creative_presets` intacte (`packages/db/src/schema.ts:774`, migration `0041_creative_presets.sql`). Règles pures intactes : `validatePreset`, `normalizePreset`, `presetPerformance`, `MIN_N_PRESET = 3` (`packages/core/src/creative-presets.ts:59-99`). Actions serveur retirées (`git show 0b49d45^:product/apps/web/app/actions/presets.ts`). Aucun appelant à `394ed04`. |
| Coût | Enregistrer, lister, archiver une scène · 0 $ (base seule). L'UTILISER coûte ce que coûte la génération qu'elle nourrit · dans un projet, une image = 4 crédits et 0,08 $ réservés (grille Studios ci-dessus). |
| Devis et budget | Aucun pour l'enregistrement. À l'usage, le devis Studios existant, rien d'autre. |
| Plan de raccord | 1) Lecture : lister les scènes de la marque dans le projet (portée espace + marque, `brandId` nul = toutes les marques de l'espace). 2) Appliquer une scène = écrire sa consigne dans la recette de style du projet (`styleRef` / `brief.styleIntent`) par une NOUVELLE version, sans génération · le lot suivant passe par le devis. 3) Le bilan d'une scène (`presetPerformance`) remonte par le même pont que l'attribution Adsmap ; dans les projets, la variante rattachée à un test porte déjà ce pont (`studio_test_links`). 4) Aucune migration nécessaire. |
| Question | Une scène appliquée à un projet doit-elle être tracée dans la version (identifiant de scène dans le contenu) pour que le bilan par scène reste possible ? Cela touche la forme du contenu de version · à décider. |

---

## Ce qui n'a pas été fait dans ce lot

- Aucun appel à ces moteurs, aucune génération, aucun devis créé.
- Aucune interface pour ces quatre capacités.
- Aucun changement de prix, de grille (`PRICING_VERSION`), de rôle, de protection ou de migration.
