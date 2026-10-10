# G-B · Retouche masquée réelle (F05) et contrôle qualité dans le worker

Lot G-B du chantier Studios v1.0 (vague 6). Base : `claude/studios-base-vague6` (`66c2e8a`). Chemins relatifs à `product/`.
Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de production.
Aucune migration, aucun appel réseau réel, aucune dépense : 0 $. Tout est prouvé contre un `fetch` INJECTÉ.

## 1. Ce que le lot livre

| Livrable | Où |
| --- | --- |
| Règles pures · instantané `studio_retouche/1`, format canonique du masque, lecture IHDR, contrôle du fichier masque, requête fal d'une retouche | `packages/core/src/studios/fournisseurs/retouche.ts` |
| Règle pure · qualité posée par le worker à la finalisation | `packages/core/src/studios/fournisseurs/qualite.ts` |
| Règle pure · composition stricte (masque valide, composition, contrôle hors zone, refus) | `packages/core/src/studios/rendu/retouche.ts` |
| Exports | une ligne chacun dans `fournisseurs/index.ts` et `rendu/index.ts` (l'index du noyau les reprend déjà) |
| Worker · relecture du masque avant soumission, recomposition à la finalisation | `apps/workers/src/studios/retouche.ts` |
| Worker · branchement | `apps/workers/src/studios/fournisseurs.ts` (préparation fal), `apps/workers/src/studios/moteur.ts` (finalisation, qualité) |
| Benchmark · F05 exécuté par l'exécuteur fal | `apps/web/lib/studios/benchmark/executeur-fal.ts` |
| Tests | `packages/core/test/gb-retouche.test.ts`, `apps/workers/test/gb-retouche-worker.test.ts`, `apps/web/test/gb-executeur-f05.test.ts` ; mise à jour de `apps/web/test/fb-parcours-db.test.ts` (il affirmait l'ancien état) |

`packages/integrations/src/studios-fal.ts` n'a pas changé : l'adaptateur F-A sert la retouche tel quel (une opération
image, une barrière, un corps préparé par le worker).

## 2. Décisions et pourquoi

**Format du masque stocké : PNG gris 8 bits, à la résolution de la source.** Profondeur 8, type de couleur 0 (ni alpha,
ni palette, ni RVB), 255 = modifier, 0 = préserver (convention `MasqueBrut` de L5-A), mêmes largeur et hauteur que le
média source. PNG parce qu'il est sans perte (un masque JPEG bave sur ses bords) et que le stockage, la route média et
le décodeur du worker le lisent déjà. L'en-tête est relu dans les OCTETS (`lireEntetePng`), jamais pris dans la ligne
ou le devis. Sonde : `sharp` écrit un PNG **RVB** (type 2) depuis un canal gris tant qu'on ne lui demande pas
`toColourspace('b-w')`, et rend 3 canaux au décodage d'un PNG gris sans ce même appel ; le format est donc exigé,
pas supposé, et le décodage du worker le demande explicitement (octet pour octet, vérifié).

**Instantané d'une retouche (`SnapshotJob.parametres`, `studio_retouche/1`).** `consigne` = le `result` validé de
`edit.mask` (instruction, à préserver, changements attendus) ; `source` et `masque` = médias studio `sta_<uuid>` avec
version, empreinte et résolution vues au devis ; `fonduPx` ∈ [0, 512]. Constructeur `parametresRetoucheDuDevis`
(à appeler par la commande d'approbation), lecteur défensif `lireParametresRetouche` (rien complété, rien deviné).
Seuls les médias studio sont retouchables : ce sont les seuls que le worker relit octet pour octet ; une photo
produit ne se retouche pas (Produit fidèle, L5-A).

**Ce qui part chez le fournisseur.** Le modèle d'édition existant (`FAL_IMAGE_MODEL_EDIT`, aucun modèle nouveau) ne
prend pas de masque : il reçoit la SOURCE en image de départ (adresse publique du stockage, comme les autres médias
studio en F-A) et la zone dans la consigne (boîte du support en pourcents et en pixels). Le masque NE PART PAS ; il
sert au worker, après. Corps décidé par `requeteFalRetouche` (même aiguillage `corpsFalImage` que F-A, une image), audit
`job.provider.payload` expurgé (source par identifiant et empreinte, masque noté `nonTransmis`).

**Bloquée avant tout appel, 0 $.** Préparation (avant la barrière de dépense) : source ET masque relus au stockage,
empreintes comparées à la ligne et au devis, en-tête du masque contrôlé (`controlerFichierMasque`), masque décodé
(boîte du support). Masque absent, au mauvais format, d'une autre résolution, altéré ou vide ; source absente,
modifiée, non transmissible ou d'une autre résolution ; plus d'une image ; gabarit non résolu ⇒ `ErreurFournisseurCertaine`
⇒ job `failed` `echec_sans_frais`, 0 requête, 0 ligne `ai_spend`, crédits rendus, audit `job.provider.blocked`.

**La sortie n'est jamais livrée brute.** Finalisation (après le décodage réel L3) : la sortie est ramenée
EXPLICITEMENT à la résolution de la source (`resize` `fill`, Lanczos ; redimension tracée), recomposée sous le masque
par `composerRetoucheStricte`, contrôlée (0 pixel modifié hors support + fondu, contrôle indépendant de la
composition), encodée en PNG, REDÉCODÉE et recontrôlée. Le média déposé est cette recomposition :
`parent_asset_id` = source, `rights.retouche` = source, masque, fondu, redimension, contrôles avant et après
encodage. Source ou masque retirés, altérés au stockage, composition refusée ⇒ `failed` `facture_sans_livrable`
(la génération a eu lieu), aucun média. Stockage ou décodeur indisponible ⇒ reste `persisting`, rien compté.
La règle vit dans le noyau parce que le worker ne peut pas importer `appliquerMasqueAuxPixels` (`server-only`).

**Qualité posée par le worker.** Dans la transaction de `completed`, pour `keyframe:s_image` et toute retouche :
composants obligatoires relus dans la version DU job, `verdictComposants` sans contrôle visuel ⇒ `requires_review`
(jamais `passed`, garde explicite même si la règle L5-C changeait), audit `media.quality.control` (acteur
`systeme:controle`, `nonVerifies`). Les autres jobs gardent la règle L3. Le POST de l'écran (F-B) reste idempotent.

**Benchmark F05.** L'exécuteur suit le même chemin : `requeteFalRetouche` puis `appliquerMasqueAuxPixels` (L5-A,
`redimensionnerGeneration: true`, PNG). Source et masque = ceux de l'entrée `edit.mask` du scénario (garde de
cohérence), identifiants `sta_` synthétiques dérivés de l'identifiant du jeu, masque du jeu (RVBA, antérieur au
format) converti explicitement (`masqueDepuisRvba`, rouge > 127 : la convention de l'oracle F05). Fondu 0 : l'oracle
compte tout pixel changé hors du rectangle. Sans consigne `edit.mask` dans la demande : refus avant la barrière.

## 3. Preuves (résultat lu)

| Exigence | Garde | Ce qui est compté |
| --- | --- | --- |
| IMG-06 (worker) | `gb-retouche-worker` | fal rejoué qui repeint TOUT (magenta 200×100) : média livré 96×64, 0 pixel modifié hors support + fondu 3, compté par force brute (distance euclidienne recalculée dans le test) sur le PNG STOCKÉ redécodé ; 1 440 pixels du support repeints ; pixels de la bande modifiés > 0 ; `rights.retouche` : redimension 200×100 → 96×64, contrôles avant et après encodage à 0 |
| IMG-06 (refus) | `gb-retouche-worker` | source modifiée au stockage entre soumission et finalisation : `failed`, 0 média, 1 requête |
| Blocage 0 $ | `gb-retouche-worker` | masque retiré, 48×32 pour une source 96×64 (fichier ou instantané), RVB, vide : `failed`, 0 POST, 0 ligne `ai_spend`, registre `release 4 / reserve 4 / settle 0`, solde +4, audit `job.provider.blocked` |
| Argent nominal | `gb-retouche-worker` | 1 POST `…/nano-banana-2/edit`, `image_urls` = adresse publique de la source, prompt avec `pixels 10,8 à 40,56 sur 96×64`, identifiant du masque absent du corps ; `ai_spend` 0,08 $ ; registre `reserve` + `settle` 4 / 80 000 |
| IMG-03 (worker) | `gb-retouche-worker`, `fb-parcours-db` | `keyframe:s_image` et retouche : `requires_review` posé par le worker, audit `nonVerifies: [lunettes, bandeau]` ; sans produit épinglé : `requires_review` (« identité du produit non contrôlée ») ; `keyframe:s1` : `pending`, aucun audit ; parcours F-B : `requires_review` après le worker, POST de l'écran idempotent (1 audit) |
| F05 | `gb-executeur-f05` | exécuteur fal du benchmark sous `sousPlafond` : 1 POST au modèle d'édition, étalon en data URI, zone `16,64 à 112,192 sur 256×256`, masque absent du corps ; sortie 512×512 magenta ⇒ rendu 256×256, oracle `comparerSousMasque` = `{ horsMasque: 0, dansMasque: 12 288 }`, 12 288 pixels repeints ; UNE ligne `ai_spend` `fal_image 0,08` (celle de la campagne), port de l'exécuteur : 1 réservation, 0 écriture |
| Règles | `gb-retouche` (noyau) | composition à fondu 0, 3, 7 : 0 pixel hors zone (force brute) ; composition fautive refusée (« 1008 pixel(s) modifié(s) hors de la zone autorisée ») ; refus listés mot pour mot (résolution, format, `sta_`, masque = source, fondu, gabarit, en-tête 8/2, 16/0, 8/4) |

## 4. Mutations (cassées volontairement, échec constaté, code restauré)

Script : `muter.py` (hors dépôt) applique, lance le test visé, relève la phrase, restaure. Aucune n'a survécu.

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 retouche non appliquée (sortie brute livrée) | `gb-retouche-worker` | `expected [ 'image/png', 200, 100, null ] to deeply equal [ 'image/png', 96, 64, …(1) ]` |
| M02 composition sans masque | `gb-retouche`, `gb-retouche-worker` | `expected false to be true` · `… retouche refusée · 4220 pixel(s) modifié(s) hors de la zone autorisée · rien n’est livré"}: expected 'failed' to be 'completed'` |
| M03 contrôle hors zone retiré | `gb-retouche` | `expected { ok: true, resultat: { …(4) }, …(2) } to match object { Object (ok, raison) }` |
| M04 résolution du masque non comparée à la source | `gb-retouche-worker` | `expected 'refus certain du fournisseur · tâche …' to match /résolution de la source/` (la tâche reste bloquée par la seconde vérification, « résolution vue au devis ») |
| M05 gris 8 bits non exigé | `gb-retouche-worker`, `gb-retouche` | `expected 'completed' to be 'failed'` · `expected [] to deeply equal [ Array(1) ]` |
| M06 masque absent ignoré | `gb-retouche-worker` | `expected 'refus certain du fournisseur · prépar…' to match /MISSING_REFERENCE · masque .* absent/` |
| M07 masque vide accepté | `gb-retouche-worker` | `expected 'refus certain du fournisseur · prépar…' to match /masque vide/` |
| M08 sortie non ramenée à la résolution de la source | `gb-retouche-worker` | `… génération 200×100 aux dimensions différentes de la source 96×64"}: expected 'failed' to be 'completed'` |
| M09 source non revérifiée à la finalisation | `gb-retouche-worker` | `expected 'completed' to be 'failed'` |
| M10 qualité non posée par le worker | `gb-retouche-worker`, `fb-parcours-db` | `expected 'pending' to be 'requires_review'` |
| M11 `passed` sans contrôle visuel | `gb-retouche`, `gb-retouche-worker` | `[]: expected 'passed' to be 'requires_review'` · `expected [ 'completed', 'passed' ] to deeply equal [ 'completed', 'requires_review' ]` |
| M12 qualité posée sur toute image clé | `gb-retouche-worker` | `expected [ 'completed', 'requires_review' ] to deeply equal [ 'completed', 'pending' ]` |
| M13 exécuteur F05 rend la sortie brute | `gb-executeur-f05` | `expected [ 512, 512 ] to deeply equal [ 256, 256 ]` |
| M14 consigne `edit.mask` non exigée | `gb-executeur-f05` | `TypeError: Cannot read properties of null (reading 'generationInstruction')` |
| M15 masque transmis comme seconde image | `gb-retouche` | `expected { …(4) } to deeply equal { …(4) }` |
| M16 exécuteur revenu au refus F-D | `gb-executeur-f05` | `expected { ok: false, …(1) } to deeply equal { ok: true }` |

Non éprouvé par mutation : le recontrôle APRÈS encodage. Le PNG est sans perte, aucune mutation du code ne peut faire
différer le fichier relu du résultat contrôlé sans casser aussi le contrôle d'avant ; il reste une double garde.

## 5. Limites

- **Aucune exécution réelle.** Que le modèle d'édition respecte la zone décrite, et la taille de sa sortie, seul un
  appel réel le dit (budget du propriétaire). La conservation hors zone, elle, ne dépend pas du modèle.
- **Ratio.** fal ne sert que 9:16, 4:5, 1:1, 16:9 : une source d'un autre ratio revient étirée DANS la zone après la
  redimension explicite (hors zone, rien ne change). La qualité reste `requires_review`.
- **Zone décrite par sa boîte.** Un masque non rectangulaire est décrit au modèle par sa boîte englobante ; seule la
  recomposition suit la forme exacte.
- **Stockage indisponible à la préparation** : la tâche échoue sans frais (crédits rendus) au lieu d'attendre.
- **Aucun devis ne crée encore de retouche** : les jobs des tests sont semés à la main (comme F-A). Le chemin
  devis → approbation est un besoin (§6).
- **Qualité** : aucun contrôle visuel dans le worker, donc jamais `passed` automatiquement.
- **F05 en campagne complète** : refusé tant que la campagne ne transmet pas la consigne `edit.mask` (§6.1).

## 6. Besoins hors périmètre (l'intégrateur tranche)

1. **`apps/web/lib/studios/benchmark/campagne.ts`** : transmettre le `result` de `edit.mask` comme `consigne` de la
   demande média (aujourd'hui seul un gabarit en `…compile` la remplit : `/compile$/.test(etape.templateKey)`, ligne
   « derniereConsigne »). Ajouter `|| etape.templateKey === 'edit.mask'`. Ensuite, `fd-executeur-fal.test.ts`
   (« F05 … EXECUTEUR_REFUS ×2 ») affirmera l'ancien état et devra être mis à jour (F05 exécuté, une ligne par sortie).
2. **Devis et approbation d'une retouche** (`packages/core/src/studios/execution/tarifs.ts`,
   `apps/web/lib/studios/execution/commandes.ts`) : `profilDuNoeud` ne connaît pas de nœud de retouche ; l'approbation
   doit écrire `parametresRetoucheDuDevis(...)` à partir d'une sortie `edit.mask` ATTESTÉE (même principe que F-B pour
   `image.compile`) et du calque (`CalqueImage.mask` : `assetId`, `featherPx`).
3. **Import d'un masque** (L5-A besoin 3) : écrire le masque tracé dans l'éditeur en PNG gris 8 bits
   (`toColourspace('b-w')`) dans `studio_assets`, à la résolution de la source.
4. **`apps/web/lib/studios/rendu/masque-pixels.ts`** : déléguer à `composerRetoucheStricte` (une seule règle).
5. **Écran F-B** : le POST « contrôler le média » devient redondant pour `keyframe:s_image` (le worker l'a posé) ; il
   reste sans effet (idempotent).
