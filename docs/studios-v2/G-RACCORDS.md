# G-A · Raccords côté site laissés par F-B et F-D

Lot G-A du chantier Studios v1.0 (vague 6). Base : `claude/studios-base-vague6` (`66c2e8a`). Chemins relatifs à
`product/`. Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de
production. Aucune migration, aucun appel réseau réel, aucune dépense : 0 $.

Il ferme quatre besoins notés hors périmètre par les lots précédents : F-B §6 n° 2 et n° 4 (`F-PARCOURS-IMAGE.md`),
F-D §7 n° 1 et n° 2 (`F-EVALUATION.md`).

## 1. Ce que le lot livre

| Livrable | Où | Garde |
| --- | --- | --- |
| Approbation générique refusée sans fournisseur d'images | `apps/web/app/actions/studios/execution.ts` | `apps/web/test/ga-approbation-fournisseur-db.test.ts` |
| `evaluation` et `mediaBindings` dans les traces montrées à l'ADMIN, chacun par sa liste blanche | `apps/web/lib/studios/prompts/traces.ts` | `apps/web/test/ga-traces-rendu.test.tsx` |
| Leur affichage dans l'onglet Exécutions | `apps/web/app/(app)/admin/ia-studios/{donnees.ts,Ecrans.tsx}` | idem |
| Une image jointe estimée à sa borne de jetons | `apps/web/lib/spend-guard.ts` | `apps/web/test/ga-estimation-vision.test.ts` |
| `compilerConsigneImage` (actions produit) passe par le chemin attesté | `apps/web/app/actions/studios/produit.ts` | `apps/web/test/ga-compilation-produit-db.test.ts` |

`packages/core/src/prompts/vision.ts` n'a pas été modifié : `VISION_JETONS_IMAGE_MAX` y est déjà exporté et atteint
`@tiktrends/core` (par `studios/benchmark/index.ts`).

## 2. Décisions et pourquoi

**Approbation générique (F-B n° 2).** Toutes les opérations d'un job studio sont exécutées par le worker
(`apps/workers/src/studios`), qui ne démarre QUE si `decisionFournisseurStudio` (noyau, F-A) branche fal
(`demarrerWorkerStudio`). Sans lui, un job approuvé reste `queued`, sa réserve débitée, et rien n'est produit. L'action
`approuverEtMettreEnFile` refuse donc, pour TOUTE opération, avec la règle du worker et la phrase de l'écran image
(`approuverImagePour`) : `UNSUPPORTED_CAPABILITY` · « Le fournisseur d’images n’est pas branché sur ce serveur · rien
n’a été approuvé ni débité. » Ordre : la garde (`studio.generate`) d'abord, puis la règle, puis la commande L3. Le
refus est rendu AVANT toute écriture : ni approbation, ni job, ni registre, ni débit, ni outbox. Le devis n'est pas
consommé : il reste approuvable une fois le fournisseur branché.

Le contrôle est écrit dans l'action et non en réutilisant `approuverImagePour` : L6-A étend `lib/studios/image/**` cette
vague, et une règle propre à l'image ajoutée là ne doit pas s'appliquer à toutes les opérations. La règle elle-même
reste `decisionFournisseurStudio`, inchangée.

Un clic rejoué (même clé) sur un serveur dont le fournisseur a été débranché après un premier lancement reçoit aussi le
refus, comme sur l'écran image : le job existant n'est pas touché et reste lisible par `etatJob` (clé ou identifiant).

**Traces (F-D n° 1).** `evaluation` et `mediaBindings` entrent dans `CONFIG_VISIBLE`, mais ne sont PAS recopiés tels
quels : chacun passe par sa propre liste blanche (`expurgerEvaluation`, `expurgerPieces`), parce qu'une ligne peut
contenir autre chose que ce que `ecrireRun` y met.

- `evaluation` : `mode`, `approbationId`, `releaseStatut`, rien d'autre ; `null` hors évaluation.
- `mediaBindings`, par pièce : `bindingId`, `assetId`, `assetVersion`, `sha256`, `nativeAttachmentIndex`, `mime`,
  `octets` (le NOMBRE d'octets), `largeur`, `hauteur`, `jetonsMax` ; 32 pièces au plus (la borne d'un appel est 6).
- Un identifiant n'est montré que s'il fait 1 à 160 caractères sans espace ni barre oblique et ne commence pas par
  `data:` : une URL, une clé de stockage (`studios/<espace>/<job>/…`) ou une `data:` URI deviennent une chaîne vide.
  `sha256` doit être 64 hexadécimaux, `mime` un des trois types relus (png, jpeg, webp), les nombres des entiers
  positifs ; sinon vide ou nul.

L'écran (onglet Exécutions, détail d'une trace) ajoute la ligne « Évaluation » et la section « Pièces natives
envoyées » (index, liaison → média @ version, type, taille, dimensions, borne de jetons, empreinte). Les deux
fichiers de l'ADMIN (`donnees.ts`, `Ecrans.tsx`) sont hors de la liste attribuée au lot : sans eux, l'ajout à la
liste blanche ne change rien à l'écran (la vue choisit ses champs), et la preuve demandée est le HTML de l'onglet.
Le changement y est additif (deux champs de vue, deux blocs).

**Estimation vision (F-D n° 2).** `guardedAnthropic` estimait l'entrée sur la longueur JSON du contenu, base64 des
images compris. Désormais (`entreeAppel`, `coutMaximalAppel`, exportées pour être testées) :

- chaque bloc `image` d'un message compte `VISION_JETONS_IMAGE_MAX` jetons au tarif d'entrée (source unique, F-D),
  quelle que soit sa taille ;
- le texte, le système et les outils sont mesurés comme avant ; un contenu sans image est mesuré par le MÊME
  `JSON.stringify` qu'avant, donc un appel sans image réserve exactement le même montant (gardé sur quatre formes) ;
- la réservation, le règlement, la libération et le verrou commun (F-A §8) sont inchangés.

Tableau MESURÉ (`ga-estimation-vision`, `claude-sonnet-5`, `max_tokens` 4000, un bloc texte et un système) :

| Image jointe | Caractères base64 | Réservé avant | Réservé après |
| --- | --- | --- | --- |
| 1 000 000 octets | 1 333 336 | 1,203039 $ | 0,074466 $ |
| 1 000 octets | 1 336 | (sans objet) | 0,074466 $ |
| deux de 1 000 000 octets | 2 666 672 | (sans objet) | 0,074466 $ + 0,014352 $ |

**`compilerConsigneImage` des actions produit (F-B n° 4).** Aucun écran ne l'appelle (l'écran image appelle celle de
`actions/studios/image.ts`). Le brief laissait le choix (passer par `compilerEtAttesterPour` ou la retirer) : elle est gardée et rendue sûre,
le plus petit geste qui ferme le défaut sans retirer une action serveur publique (une ligne de délégation). Elle délègue désormais à l'action du parcours image
(`compilerEtAttesterPour`) : même garde (`gardeSources('studio.generate')`), même barrière (plafond atteint ⇒
`BUDGET_EXCEEDED` avant l'appel), même attestation. Les paramètres `largeur` et `hauteur` qu'elle recevait du
navigateur disparaissent : le format est relu par le serveur dans le contenu de la version. Son type de retour devient
`ResultatCompilationImage` (avec `empreinte`).

## 3. Preuves (garde → résultat lu)

| Garde | Ce qui est lu |
| --- | --- |
| `ga-approbation-fournisseur-db` (pglite, vraie action) | 4 environnements sans fournisseur (aucune `FAL_KEY`, clé de simulation, hors production sans `STUDIO_FOURNISSEUR_REEL=autorise`, `S3_BUCKET` absent) : `UNSUPPORTED_CAPABILITY` + la phrase, et approbations, jobs, registre, crédits, outbox, solde identiques avant / après ; lecteur : `FORBIDDEN` (garde d'abord) ; même devis, fournisseur branché ensuite (valeurs factices) : 1 approbation, 1 job, débit = crédits du devis |
| `ga-traces-rendu` (pglite, vraie page ADMIN) | HTML du détail : « Exécution d’évaluation · benchmark · release staged · approbation <id> », « Pièces natives envoyées », index 0 et 1, liaison, `sta_<uuid>`, empreintes, « 1293 octets · 8×8 · au plus 4784 jetons » ; absents du HTML : octets base64, URL fal, clé de stockage, clé d'API, champ étranger ; `expurgerRun` rend exactement les champs listés ; une trace sans évaluation ni pièce n'affiche aucun des deux blocs |
| `ga-estimation-vision` (pglite, client espion) | montants du tableau ; sans image = estimation d'avant (4 formes) ; plafond 0,50 $ : l'appel avec 1 Mo d'image PART, ligne `ai_spend` réservée à 0,074466 $ puis réglée au réel ; plafond 0,05 $ : refus AVANT l'appel, aucune ligne |
| `ga-compilation-produit-db` (pglite, adaptateur simulé, vraies actions) | compilée par l'action produit puis retenue par `retenirConsigneImage` : nouvelle version portant la consigne attestée mot pour mot ; une attestation `image.consigne.compilee` au `runId` rendu ; 1 appel, 1 trace, 1 audit, rien d'autre ; lecteur `FORBIDDEN` et plafond atteint `BUDGET_EXCEEDED` : 0 appel, 0 ligne |
| Existants | `l3-commandes` (le test « un membre approuve via l'action serveur » branche le fournisseur, valeurs factices), `fa-reservation-commune`, `spend-guard-coverage`, `l2-admin-rendu`, `fb-parcours-db`, `l5c-produit-db`, toute la suite |

## 4. Mutations

| Mutation | Garde qui tombe | Phrase |
| --- | --- | --- |
| GA-M1 contrôle du fournisseur retiré de l'action | `ga-approbation-fournisseur-db` | `approbation acceptée sans fournisseur d’images branché: expected false to deeply equal [ 'UNSUPPORTED_CAPABILITY', …(1) ]` (5 tests sur 6) |
| GA-M1b refus rendu APRÈS l'approbation (débit écrit) | `ga-approbation-fournisseur-db` | `une approbation refusée a écrit (débit, job, registre ou outbox): expected { approbations: 1, jobs: 1, …(4) } to deeply equal { approbations: +0, jobs: +0, …(4) }` |
| GA-M2 `evaluation`, `mediaBindings` hors de `CONFIG_VISIBLE` | `ga-traces-rendu` | `le marquage évaluation n’est pas à l’écran: expected '<main …' to contain 'Exécution d’évaluation · benchmark · …'` |
| GA-M2b les deux champs recopiés sans liste blanche | `ga-traces-rendu` | `octets visible dans l’onglet Exécutions: expected true to be false` |
| GA-M3 image revenue à la longueur de son base64 | `ga-estimation-vision` | `plafond bloqué à tort · l’image est comptée sur son base64: expected 'refusé · Plafond de dépense atteint ·…' to be 'parti'` · `expected { caracteres: 1333545, images: +0 } to deeply equal { caracteres: 130, images: 1 }` |
| GA-M3b image comptée 0 jeton (borne oubliée) | `ga-estimation-vision` | `l’image n’est pas estimée à sa borne de 4 784 jetons: expected 0.060114 to be 0.074466` · `expected +0 to be 14352` |
| GA-M4 action produit revenue à la compilation brute | `ga-compilation-produit-db` | `la consigne compilée par l’action produit n’a pas pu être retenue: expected 'MISSING_REFERENCE · Aucune consigne c…' to be 'retenue'` |

GA-M4 est aussi la reproduction du défaut : le code d'origine (`66c2e8a`) produit exactement cette phrase.

## 5. Limites

- **Borne par image documentée pour `claude-sonnet-5`.** 4 784 jetons est le plafond par image du modèle routé par
  défaut (F-D). Si `ANTHROPIC_GEN_MODEL` désigne un modèle qui compte plus de jetons par image, l'estimation serait
  sous la facture de cet écart ; le règlement écrit le coût RÉEL (même limite que l'entrée texte estimée, F-A §8.5).
  Un modèle qui en compte moins est surestimé (côté prudent).
- **Images ailleurs que dans un message utilisateur** (dans un `tool_result`, un bloc `document`) : non concernées,
  toujours mesurées sur leur JSON (surestimation prudente). Aucun appel du dépôt n'en envoie.
- **La règle de l'estimation vit dans `apps/web/lib/spend-guard.ts`**, pas dans le noyau : `estimateCallCost`
  (`packages/core/src/spend-guard.ts`) prend des caractères et n'était pas dans la liste du lot. La rapprocher du
  noyau (un paramètre `jetonsImages`) est un besoin noté.
- **Le refus d'approbation lit l'environnement du SITE.** Le worker lit le sien. Si les deux processus n'ont pas les
  mêmes variables (`FAL_KEY`, `S3_*`, `STUDIO_FOURNISSEUR_REEL`), le site peut approuver un job que le worker ne
  prendra pas : même limite que l'écran image (F-B), aucun signal de vie du worker n'existe.
- `l3-commandes.test.ts` (hors liste) a reçu trois lignes : le test de l'action L3 branche le fournisseur avec des
  valeurs factices, sans quoi la nouvelle règle le refuse (comportement voulu).

## 6. Besoins hors périmètre

1. `packages/core/src/spend-guard.ts` : accepter des jetons d'image dans `estimateCallCost` pour que la règle vive au
   noyau (le site appellerait la même fonction que le devis du benchmark).
2. Signal de vie du worker studio (table ou clé existante) pour que le site refuse aussi quand le worker n'a pas
   démarré malgré un environnement complet côté site.
