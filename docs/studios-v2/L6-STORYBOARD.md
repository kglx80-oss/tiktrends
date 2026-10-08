# L6-A · Storyboard, timeline et images clés des plans vidéo

Lot L6-A du chantier Studios v1.0 (vague 6). Base : `claude/studios-base-vague6` (`66c2e8a`). Chemins relatifs à
`product/`. Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de
production. Aucune migration, aucun appel réseau réel, aucune dépense : 0 $.

Exigences couvertes : VIDEO-01, VIDEO-03, VIDEO-05, VIDEO-08, VIDEO-09, VIDEO-10 (04-RECETTE.csv).

## 1. Ce que le lot livre

| Livrable | Où |
| --- | --- |
| Noyau pur · plans aux champs distincts, storyboard validé, durées | `packages/core/src/studios/video/plans.ts` |
| Noyau pur · timeline dérivée des plans (microsecondes, fps rationnel) | `packages/core/src/studios/video/timeline.ts` |
| Noyau pur · opérations de montage (ordre, narration, sans texte, musique, plan, scénario) ⇒ contenu validé + patch | `packages/core/src/studios/video/operations.ts` |
| Noyau pur · impact d'un geste en mots, empreintes des images clés, sorties encore valides | `packages/core/src/studios/video/impact-video.ts` |
| Noyau pur · consigne `shot.image` d'un plan, verdict, paramètres `studio_image/1` | `packages/core/src/studios/video/consigne-plan.ts` |
| Noyau pur · disponibilités de l'écran, entrée de `storyboard.plan` | `packages/core/src/studios/video/ecran.ts` (+ une ligne en fin de `packages/core/src/index.ts`) |
| Graphe L1 · consigne d'un plan dans SA seule image clé | `packages/core/src/studios/impact.ts` (`styleCommun`, `entreesKeyframe`, `consigneRetenueDuPlan`) |
| Raccord L3 des images clés de plans (devis, approbation) | `apps/web/lib/studios/image/plans.ts`, appelé par `apps/web/lib/studios/execution/commandes.ts` |
| Serveur · storyboard, consigne (compiler/attester, retenir), gestes, devis, lecture | `apps/web/lib/studios/video/{storyboard,consigne,commandes,lecture}.ts` |
| Actions | `apps/web/app/actions/studios/video.ts` |
| Écran | `apps/web/app/(app)/studio/projets/[id]/video/{page,loading}.tsx`, `apps/web/components/studios/video/{EcranVideo,VueVideo}.tsx`, entrée `lib/navigation.ts`, lien dans l'atelier (`VueProjet.tsx`) |
| Tests | `packages/core/test/l6a-video.test.ts`, `apps/web/test/l6a-video-db.test.ts`, `apps/web/test/l6a-ecran-rendu.test.tsx`, outils `apps/web/test/l6a-outils.ts`, semis de recette `apps/web/test/l6a-semis-recette.test.ts` (ignoré sauf base locale explicite) |

## 2. Décisions et pourquoi

**Les plans gardent chaque dimension dans son champ** (`$defs.Shot`). Le storyboard du modèle (`storyboard.plan`) et
la saisie manuelle passent par la MÊME validation (`lirePlanSaisi`) : sujet, action et caméra obligatoires (l'image clé
en dépend), narration interdite sur un plan « sans voix » (elle ne serait jamais dite), références limitées aux fiches
d'identité et au produit du projet. Les identifiants des nouveaux plans sont ALLOUÉS par le serveur
(`idsPlansAlloues`, jamais un identifiant déjà porté : aucune confusion avec les médias d'un ancien plan) ; un
identifiant inventé par le modèle est refusé.

**Le storyboard n'écrit rien.** `planifierStoryboardPour` appelle la tâche par `executerTache` (registre, release,
barrière de dépense, trace), revérifie la sortie, et RENVOIE les plans à l'écran. « Pas de génération avant validation
des plans » : ils ne deviennent une version qu'au geste « Retenir », rejoué comme un scénario saisi. Pas d'attestation
ici, contrairement aux consignes : un scénario est un contenu éditable sans argent attaché (l'éditeur peut de toute
façon écrire `/shots`).

**La timeline est dérivée, jamais éditée à la main.** Positions en microsecondes (`TIMEBASE_VIDEO`), fps conservé ;
pistes `t_video`, `t_voix`, `t_texte`, `t_sous_titres` posées par les plans, recalées à chaque geste. La musique ne vit
PAS dans les pistes (`timeline.music`) : le graphe L1 la fait entrer dans le seul mix. Une piste étrangère est conservée.

**Durées.** Tant qu'aucune voix n'existe, la durée d'un plan parlé est une ESTIMATION (`MOTS_PAR_SECONDE_NARRATION =
2,5`, environ 150 mots par minute), dite « estimée » à l'écran ; la durée réelle (`actualDurationMs`) prime dès qu'une
prise est mesurée, et elle est effacée quand la narration change (l'ancienne prise ne correspond plus). Ce débit n'a
pas pu être mesuré (aucune voix produite, 0 $) : c'est un défaut éditorial, remplacé plan par plan par la mesure.
Couper la narration conserve la durée visuelle du plan (dit à l'écran).

**Chaque geste montre son impact AVANT tout enregistrement et tout devis.** L'écran calcule l'opération dans le noyau
sur le contenu affiché et montre : ce qui sera refait (génération ou recalcul), ce qui est conservé, les médias déjà
produits rendus obsolètes, les durées. « Enregistrer ce changement » envoie l'opération ; le serveur la rejoue sur SA
version de base (`enregistrerVersion` : 409 si périmée, `/shots` et `/timeline` seulement) et range le plan d'impact
du geste dans `studio_impact_plans`. Aucun devis, aucun job : un devis est un geste séparé, par image clé.

**L'impact d'un geste se mesure « tout supposé produit ».** `impactVideo` compare les deux versions avec toutes les
sorties de la version de départ supposées existantes : on mesure ce que le GESTE invalide, pas ce qui n'a jamais été
produit. Les médias réellement livrés (jobs `completed`, toutes versions) sont reconnus valides si leur nœud a la même
empreinte dans la version courante (`sortiesValides`) ; ce sont eux que l'écran nomme « obsolètes » ou « valides ».

**Consigne `shot.image` d'un plan, sur le modèle exact de F-B.** Compiler (appel texte payant) ⇒ le serveur ATTESTE
la consigne dans `studio_audit_events` (`video.consigne_plan.compilee`, détails `{runId, shotId, empreinte, consigne}`),
rien n'est écrit dans le projet ; « Retenir » relit l'attestation par `runId` et écrit
`styleRef.consignesPlans.<plan>`. Le serveur ajoute l'interdit « aucun texte dans les pixels » (le texte est un calque
de montage, VIDEO-09) et les composants obligatoires du produit épinglé. Un plan qui montre le produit sans photo
épinglée est bloqué AVANT l'appel (aucune trace, 0 $).

**Où vit la consigne, et pourquoi le graphe L1 a été touché.** `document.ts` est fermé (aucun champ libre sur un plan) :
`styleRef` est la seule place libre, comme F-B. Mais `styleRef` entre dans TOUTES les images clés : retenir la consigne
du plan 1 aurait rendu obsolètes les plans 2 et 3. `impact.ts` exclut donc `consignesPlans` du style commun
(`styleCommun`) et fait entrer la consigne d'un plan dans la seule image clé de ce plan (et l'animation qui en part).
Un style vide vaut « aucun ». Les tests L1 restent verts.

**Une consigne périmée ne part pas.** Elle est compilée sur les ENTRÉES de l'image clé (`entreesKeyframe` : visuel du
plan, style commun, produit cité, fiches citées) ; si elles changent (tenue de Léa, VIDEO-03), le devis et
l'approbation refusent (`VERSION_CONFLICT`) jusqu'à recompilation. La narration, l'ordre, le texte écran et la musique
n'en font pas partie : ils ne périment aucune consigne.

**Raccord L3 (`commandes.ts`), sans toucher `keyframe:s_image`.** Au devis, une image clé de plan exige une consigne
présente, attestée, à jour, des références intactes ; l'empreinte des consignes entre dans `inputHash`
(`empreinteEntreesDevisImage`) et dans l'audit `quote.create` (`consignesPlans`). À l'approbation,
`snapshot.parametres` = `studio_image/1` relu de la version DEVISÉE, jamais `{}`. Le fournisseur rend N images d'UNE
consigne : plusieurs images clés ne partagent un job que si leurs consignes font la MÊME requête (sinon, un devis par
plan, refus dit) ; une image clé ne se mélange pas à une autre génération. Les autres opérations (fiches d'identité,
calculs) gardent leur comportement L3.

**Tests L3/L4-C mis à jour, aucune garde relâchée.** Les projets de semis (`l3-harnais.projetTest`,
`l4c-harnais.projetAvecBrief`) posent pour chaque plan une consigne ET son attestation (`l6a-outils.ts`), la même pour
les N plans d'un lot L4-C (une requête, N images). Sans attestation, le devis refuse : la garde est intacte, le chemin
réel est prouvé par `l6a-video-db`. `fb-parcours-db` : « keyframe:s1 sans consigne ⇒ devis refusé, devis inséré à la
main refusé à l'approbation » et « avec consigne ⇒ paramètres de CETTE consigne ».

**Animation.** `DECODEUR_VIDEO_WORKER = false` : un clip est refusé dès le devis (L3, inchangé). L'écran le dit en tête
et sur chaque plan (« Vidéo indisponible · aucun décodeur vidéo »), sans aucun bouton d'animation.

**Gestes et droits.** Montage, retenir : `studio.propose` (gratuit, version). Storyboard, compiler une consigne :
`studio.generate`, appel texte payant, coût maximal annoncé avant le clic, barrière de dépense ; sans release publiée,
l'écran le dit et propose le chemin manuel. Devis : `studio.generate`, gratuit. Approuver et lancer : `studio.generate`,
seule dépense, refusée si le fournisseur d'images n'est pas branché ; la clé du clic est gardée par devis dans
`sessionStorage`.

## 3. Preuves (résultat lu)

| Exigence | Garde | Ce qui est lu |
| --- | --- | --- |
| VIDEO-01 | `l6a-video` (noyau), `l6a-video-db`, `l6a-ecran-rendu` | sortie `storyboard.plan` ⇒ deux plans, sujet/action/caméra/narration/texte écran/durée chacun dans son champ, total cohérent ; identifiant non alloué, sujet vide, texte en mode sans texte, narration sans voix ⇒ refusés. En base : 1 trace, 0 version tant que non retenu ; retenu ⇒ +1 version, +1 plan d'impact, 0 devis, 0 job, timeline 4 500 000 µs. HTML : `dt/dd` par champ |
| VIDEO-03 | `l6a-video`, `l6a-video-db` | tenue de Léa (plans 1 et 2) ⇒ générations `clip:s1, clip:s2, identite:c_lea, keyframe:s1, keyframe:s2` ; `keyframe:s3`, `voix:s1`, `voix:s2` empreintes identiques ; image livrée du plan 1 lue « obsolète » ; consignes 1-2 périmées (devis `VERSION_CONFLICT`, 0 ligne), plan 3 devisable |
| VIDEO-05 | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | narration du plan 2 ⇒ empreintes des images clés identiques ; durée 3,0 s → 5,6 s, totale 9,0 s → 11,6 s, phrase dite ; `voix:s2` à refaire, aucune image clé ; 0 devis, 0 job ; consigne du plan 2 non périmée |
| VIDEO-08 | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | permuter 2 et 1 ⇒ plan d'impact rangé `[montage, mix, sous_titres, export]`, aucune génération ; empreintes identiques ; segments recalés ; 0 devis, 0 job ; l'image clé livrée du plan 1 reste « valide » et un devis non volontaire de `keyframe:s1` est refusé (réutilisée) |
| VIDEO-09 | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | texte écran vidé, sous-titres coupés, aucune piste de surimpression, aucune génération ; signalement « l'image déjà produite peut contenir du texte incrusté » sur le seul plan livré ; interdit de texte posé par le serveur dans chaque consigne |
| VIDEO-10 | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | piste et gain ⇒ `[mix, export]` ; images clés, clips, voix et montage identiques par empreinte ; 0 devis, 0 job |
| Plus jamais `{}` | `l6a-video-db`, `fb-parcours-db` | compilation : +1 trace, +1 attestation, version inchangée ; retenir : seule `keyframe:s3` change d'empreinte ; devis : `inputHash` recalculé avec l'empreinte des consignes ; approbation : `parametres` = `parametresDepuisConsignePlan`, relus `studio_image/1`, photo épinglée liée ; sans fournisseur d'images : refus, solde intact ; sans consigne / consigne forgée : refus, 0 ligne |
| Écran | `l6a-ecran-rendu` | animation dite, aucun bouton d'animation ; prix « 4 crédits · 0,08 $ au plus de coût fournisseur » avant le clic ; indisponibilités dites ; lecteur : tout inactif ; texte hostile rendu comme texte ; montage : aucune action à l'ouverture ; aperçu AVANT envoi ; une seule action à l'enregistrement, aucun devis ; même clé sur deux clics |

## 4. Mutations (cassées volontairement, échec constaté, code restauré)

Script : chaque mutation remplace un motif unique, lance les gardes nommées, relève la première phrase d'échec, restaure le fichier ; arbre propre vérifié après la campagne.

| Mutation | Garde(s) qui tombe(nt) | Phrase d'échec |
| --- | --- | --- |
| M01 consigne du plan dans le style commun (toutes les images clés) | `l6a-video` | `expected [ 'clip:s1', 'clip:s2', …(4) ] to deeply equal [ 'clip:s1', 'keyframe:s1' ]` |
| M02 consigne hors de l’empreinte de son image clé | `l6a-video`, `l6a-video-db` | `expected [] to deeply equal [ 'clip:s1', 'keyframe:s1' ]` |
| M03 raccord des plans retiré du devis | `l6a-video-db`, `fb-parcours-db` | `expected { ok: true, devis: { …(10) } } to match object { ok: false, …(3) }` |
| M04 parametres: {} pour une image clé de plan | `l6a-video-db`, `fb-parcours-db` | `expected {} to deeply equal { schema: 'studio_image/1', …(4) }` |
| M05 refus des plans ignoré à l’approbation | `fb-parcours-db` | `expected { Object (ok, job, ...) } to match object { Object (ok, code) }` |
| M06 attestation de plan non vérifiée | `l6a-video-db` | `expected { ok: true, devis: { …(10) } } to match object { ok: false, …(2) }` |
| M07 consigne périmée acceptée | `l6a-video`, `l6a-video-db` | `expected { ok: true } to match object { ok: false, cause: 'perimee', …(2) }` |
| M08 inputHash sans les consignes | `l6a-video-db` | `expected '22cce4756e82a9f4d0c48f955c6f205902398…' to be 'b8f5741b4e1ff33a9d0df1e0cb65a05845361…' // Object.is equality` |
| M09 consignes différentes dans un seul job | `l6a-video` | `expected { ok: true, parametres: { …(5) } } to match object { Object (ok, cibles) }` |
| M10 durée non recalculée sur la narration | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | `expected 3000 to be 6800 // Object.is equality` |
| M11 musique posée dans les pistes du montage | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | `expected [ 'montage', 'mix', …(2) ] to deeply equal [ 'mix', 'export' ]` |
| M12 sous-titres laissés actifs en sans texte | `l6a-video`, `l6a-video-db` | `expected { enabled: true } to deeply equal { enabled: false }` |
| M13 texte incrusté non signalé | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | `expected [] to deeply equal [ …(2) ]` |
| M14 l’ordre entre dans l’image clé | `l6a-video`, `studios-impact`, `l6a-video-db`, `l6a-ecran-rendu` | `réordonner a déclenché une génération: expected [ 'keyframe:s1', 'keyframe:s2', …(2) ] to deeply equal []` |
| M15 identifiant de plan non alloué accepté | `l6a-video` | `expected { ok: true, …(3) } to match object { ok: false, cause: 'invalide', …(1) }` |
| M16 interdit de texte absent de la consigne | `l6a-video`, `l6a-video-db` | `expected [] to deeply equal [ Array(1) ]` |
| M17 plan d’impact du geste non rangé | `l6a-video-db` | `expected { devis: +0, jobs: +0, …(2) } to deeply equal { devis: +0, jobs: +0, …(2) }` |
| M18 lancement de l’image clé sans fournisseur | `l6a-video-db` | `expected { Object (ok, job, ...) } to match object { ok: false, …(1) }` |
| M19 geste envoyé sans aperçu | `l6a-ecran-rendu` | `expected "spy" to not be called at all, but actually been called 1 times` |
| M20 nouvelle clé à chaque clic | `l6a-ecran-rendu` | `expected 'vid-b4b6d551-729a-4681-ac88-1988cbf19…' to be 'vid-dd3037cb-b7ab-4b0c-b98a-34698e82b…' // Object.is equality` |
| M21 prix non annoncé avant le clic | `l6a-ecran-rendu` | `expected 'Une image clé · Retiens d’abord une c…' to be 'Une image clé · 4 crédits · 0,08 $ au…' // Object.is equality` |
| M22 animation présentée disponible (premier passage) | `l6a-video`, `l6a-video-db` | **survivait** côté écran (bandeau écrit en dur) : `l6a-video`, `l6a-video-db` tombaient, `l6a-ecran-rendu` restait vert · écran corrigé, voir ligne suivante |
| M23 storyboard dit disponible sans release | `l6a-video`, `l6a-ecran-rendu` | `expected { disponible: true, raison: '' } to deeply equal { disponible: false, …(1) }` |
| M24 raccord étendu à keyframe:s_image | `l6a-video`, `fb-parcours-db` | `expected 's_image' to be null` |
| M25 storyboard écrit dans le projet avant « retenir » | `l6a-video-db` | `expected { devis: +0, jobs: +0, …(3) } to deeply equal { devis: +0, jobs: +0, …(3) }` |
| M22 animation présentée disponible (après correction de l’écran) | `l6a-video`, `l6a-video-db`, `l6a-ecran-rendu` | `expected true to be false · écran : Cannot read properties of null (reading 'textContent')` |
| M26 conservé = toute sortie non touchée, produite ou non | `l6a-video`, `l6a-ecran-rendu` | `expected [ 'clip:s3', 'keyframe:s3', …(2) ] to deeply equal [ 'keyframe:s3', 'voix:s1' ]` |
| M27 point doublé après l’interdit du serveur | `l6a-ecran-rendu` | `expected 'À éviter : Aucun texte dans l’image :…' to be 'À éviter : Aucun texte dans l’image :…'` |

### Parcours réel et captures

Build de production, base locale `tiktrends_l6a` remplie par `l6a-semis-recette` (phase `a` : sans release ; phase `b` :
release de test, consigne du plan 1 retenue, job en file, devis en cours, consigne du plan 3 compilée en attente),
Chromium piloté en CDP, session `demo@tiktrends.co`. Captures `prod-<sha8>-<etat>-{1440,1280,390}.png` : `sans-release`,
`parcours`, `consigne-attente`, `timeline`, `jobs`, `apercu-ordre` (clic « Avancer » sur le plan 2), `apercu-sans-texte`,
`vide`. Aucun débordement horizontal mesuré aux trois largeurs. Base restaurée ensuite (`base-vide-55.dump`).

La capture a fait voir deux défauts corrigés dans le lot : l'aperçu listait comme « conservées » des sorties jamais
produites (animations comprises) et l'interdit de texte finissait par un point doublé.

## 5. Limites

- **Aucune exécution réelle.** Ni `storyboard.plan`, ni `shot.image`, ni l'image clé ne sont partis vers un vrai
  fournisseur (0 $). Le corps envoyé au fournisseur d'images est celui du worker F-A pour `studio_image/1`.
- **Débit de parole non mesuré** (voir §2) : les durées estimées sont un défaut, pas une mesure.
- **Images clés et identités** : une fiche d'identité n'est pas un média transmis ; seule la photo épinglée du produit
  l'est. La cohérence visuelle d'un personnage d'un plan à l'autre repose sur le texte de la fiche (L6-B).
- **Storyboard retenu sans attestation** : le scénario retenu est revalidé côté serveur mais n'est pas lié au `runId`
  qui l'a produit.
- **Écran** : un geste par aperçu ; pas de glisser-déposer des plans (avancer / reculer, cibles de 44 px, clavier).

## 6. Besoins hors périmètre (l'intégrateur tranche)

1. **Fiches d'identité** (`identite:*`) : elles se devisent encore avec `parametres: {}` (comportement L3) ; leur consigne
   vient de `character.spec` (lot L6-B).
2. **Worker** : aucune modification ; une image clé de plan approuvée part désormais avec `studio_image/1` et sera
   exécutée par le fournisseur d'images F-A comme l'image du studio.
3. **`document.ts`** : aucun champ ne permet de ranger la consigne sur le plan lui-même ; `styleRef.consignesPlans` en
   tient lieu. Un champ `PlanStudio.consigneImage` (et son exclusion du style) serait plus direct.
4. **Durée cible** : `storyboard_plan_input.targetDurationMs` n'est pas conservée dans le contenu (aucun champ) ; le
   dépassement de durée cible ne peut donc pas être signalé après coup.
