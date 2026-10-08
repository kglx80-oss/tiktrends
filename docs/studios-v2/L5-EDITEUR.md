# L5-B · Éditeur de calques du document image

Lot L5-B du chantier Studios v1.0. Base : `claude/studios-base-vague4` (`2ce211f`). Chemins relatifs à `product/`.
Ce document dit ce qui est tranché, pourquoi, et comment le vérifier. Il ne décrit aucun état de déploiement.

Aucune migration, aucun appel modèle, aucune dépense, aucune dépendance ajoutée. L'éditeur ne génère rien :
chaque geste est une opération pure du noyau, l'enregistrement passe par l'action L1 `enregistrerDocument`.

## 1. Ce que livre le lot

| Livrable | Où |
| --- | --- |
| Opérations sur `DocumentStudio` (ajouter, renommer, masquer, verrouiller, dupliquer, supprimer, réordonner, transformer, redimensionner selon le document, aligner, éditer un texte, remplissage), impact d'une édition | `packages/core/src/studios/calques/operations.ts` |
| Patch base → présent (JSON Pointer sur identifiants stables, regroupement au-delà de 100 changements) | `packages/core/src/studios/calques/patch-document.ts` |
| Historique annuler/rétablir borné | `packages/core/src/studios/calques/historique.ts` |
| Formats (1:1, 4:5, 9:16) lus du brief, document initial, polices fournies | `packages/core/src/studios/calques/formats.ts` |
| Statut d'enregistrement, réapplication après 409, différences en mots | `packages/core/src/studios/calques/conflit.ts` |
| Lecture serveur (projet, version, document, format, photo produit, médias du projet, droit d'enregistrer) | `apps/web/lib/studios/editeur/lecture.ts`, `types.ts` |
| Relecture de la version courante après un 409 (action, `studio.read`) | `apps/web/lib/studios/editeur/actions.ts` |
| URL d'aperçu des médias (point de raccord L5-A) | `apps/web/lib/studios/editeur/apercus.ts` |
| Page | `apps/web/app/(app)/studio/projets/[id]/image/{page,loading}.tsx` |
| Écran | `apps/web/components/studios/editeur/*` |
| Navigation | une ligne `/studio/projets/[id]/image` dans `apps/web/lib/navigation.ts` |
| Tests | `packages/core/test/l5b-calques.test.ts` (27), `apps/web/test/l5b-editeur-db.test.tsx` (11, pglite), `apps/web/test/l5b-editeur-rendu.test.tsx` (13, jsdom) |

`packages/core/src/index.ts` reçoit une ligne : `export * from './studios/calques';`.

## 2. Décisions et pourquoi

**Une opération = un document validé + son patch.** Chaque opération rend soit un nouveau `DocumentStudio` qui passe
`validerDocument` (L1, inchangé) et le patch qui y mène, soit un refus qui dit quoi faire. L'entrée n'est jamais
mutée (édition non destructive). Les chemins visent des identifiants (`/document/layers/l_cta/x`), jamais une
position : réordonner change `z`, pas l'adresse d'un calque.

**Le serveur reste juge.** L'écran envoie le patch base → présent à `enregistrerDocument` (`studio.propose`, base
obligatoire, verrou de ligne, 409 avec différences, version immuable `n+1`, audit). Les tests rejouent chaque patch
avec le vrai `appliquerPatch` et vérifient qu'il redonne exactement le document de l'écran.

**Granularité d'un champ.** L'audit et le diff d'un 409 nomment alors le champ touché. Au-delà de
`MAX_CHANGEMENTS_PATCH` (100), le patch se regroupe par calque, puis par collection, jamais tronqué.

**Verrou.** Un calque verrouillé ne bouge pas : ni position, ni taille, ni rotation, ni opacité, ni contenu, ni
ordre propre, ni suppression. Renommer, masquer, déverrouiller et dupliquer restent permis (la copie est libre).
Un voisin qui passe devant ou derrière lui échange son `z` : l'ordre relatif est le geste du voisin, la géométrie
du verrouillé reste.

**Le texte reste du texte.** Aucune opération ne change le type d'un calque. À l'écran, un calque texte est du
texte HTML (taille en fraction de la largeur du cadre, `cqw`), jamais une image.

**Sources intactes.** `assetId`, `sourceWidth`, `sourceHeight` et `mask` d'un calque image ne changent jamais ; un
média posé est référencé par son identifiant, jamais copié. Les lignes `studio_assets` ne sont pas touchées.

**Aucun appel image.** `impactEdition` passe le contenu de la version avec le document édité au graphe L1
(`calculerPlanImpact`) : une édition de calques ne refait que `composition` et `export`. L'écran le dit en mots
(« Aucune génération d'image · ces modifications ne demandent qu'une recomposition du visuel ») sans promettre
une absence de coût d'infrastructure.

**Géométrie déterministe.** Position et taille au pixel entier, rotation au dixième de degré, opacité au centième.
La photo produit posée à la création occupe 55 % de la largeur, proportions de la source, centrée (scénario
IMG-05) : sur 1080 × 1350 avec une source 1200 × 1600, `x 243, y 279, 594 × 792`.

**Formats.** 1:1 (1080 × 1080), 4:5 (1080 × 1350), 9:16 (1080 × 1920). Le format vient du brief quand il le dit
(`Story 9:16`, `Carré`, `Reels`, `1x1`…) ; sinon 4:5, annoncé à l'écran comme un défaut.

**Polices.** Seule la famille embarquée et licenciée (Liberation Sans, fichiers `public/fonts/sans-{400,700}.ttf`,
déjà utilisés par le rendu des publicités) est proposée, en deux graisses : un aperçu dans une police que le rendu
final n'aurait pas mentirait. Une police déjà déclarée dans un document reste lisible ; l'écran dit que son aperçu
est approximatif.

**Annuler/rétablir.** L'historique garde des documents entiers (partage des calques inchangés), borné à 100
étapes : mesuré, un document de 40 calques sérialisé fait 10 416 caractères, cent copies complètes environ 1 Mo.
Raccourcis Ctrl/Cmd+Z, Ctrl/Cmd+Maj+Z, Ctrl+Y, Ctrl/Cmd+S, flèches sur l'aperçu (Maj : 10 px) ; chaque geste a
aussi son bouton. Un raccourci tapé dans un champ reste l'annuler natif du champ.

**Boutons inactifs mais focalisables.** Annuler, Rétablir et Enregistrer portent `aria-disabled`, jamais `disabled` : Chromium retire le focus d’un bouton désactivé, et après un 409 le focus retombait sur la page (vu sur le build, corrigé, gardé).

**Enregistrement explicite, pas d'autosave serveur.** Chaque enregistrement crée une version immuable : un
autosave serveur en créerait une à chaque pause. Le statut est toujours visible, en mots (« Enregistré »,
« Modifications non enregistrées », « Conflit · une autre session a enregistré », « Échec de l'enregistrement ·
modifications conservées »). Une copie de secours (debounce 600 ms) vit dans le navigateur de l'appareil, et
l'écran dit qu'elle ne passe pas d'un appareil à l'autre ; au retour, il propose de la restaurer (réappliquée si la
version a changé, refusée si elle écraserait).

**409.** Rien n'est écrasé. Le dialogue (piège à focus du `Modal` partagé, focus rendu au déclencheur) dit en mots
ce qui a changé de l'autre côté (« Calque « Titre » · couleur du texte : « #111111 » → « #ff0000 » »), relit la
version courante, puis propose « Recharger la version courante » (mes modifications restent dans la copie de
secours) ou « Recharger et réappliquer mes modifications », actif seulement si aucun champ que j'ai touché n'a été
touché de l'autre côté. Pas de fusion d'un même champ, pas de CRDT (cahier §10).

**Écran.** Trois zones à partir de 769 px (calques · aperçu · propriétés). À 390 px : onglets « Calques » (par
défaut) et « Aperçu », propriétés en panneau plein écran (portail, piège à focus, Échap, focus rendu à la ligne).
Cibles de 44 px, champs de 16 px, focus visible (règle globale), statut jamais porté par la seule couleur. États :
chargement (`loading.tsx`), vide (créer le document au format du brief, photo produit en option), rempli, lecture
seule (droit `studio.read` sans `studio.propose`), accès refusé, introuvable neutre hors portée, erreur récupérable
avec identifiant support, conflit, copie de secours.

**Un média sans aperçu** est un cadre aux bonnes proportions qui porte le nom du calque (« Photo produit · Image ·
aperçu indisponible »), jamais une image cassée : la route média est au lot L5-A (point de raccord
`ROUTE_APERCU_MEDIA`).

## 3. Preuves

| Exigence | Preuve |
| --- | --- |
| IMG-07 | `l5b-calques` : déplacer le CTA et changer sa typo, le calque reste `kind: 'text'` avec son texte, toujours éditable ; `impactEdition` = `[]` générations, `['composition', 'export']`. `l5b-editeur-db` : version 3 stockée avec `texte_1` en texte (`fontId sans-gras`, `fontSizePx 72`, `#ff5c8a`, `x 120`, `y 1500`), audit qui nomme six chemins par identifiant, 0 ligne de devis, approbation, job, tentative, registre, outbox, crédit, `ai_spend`, trace de prompt, plan d'impact, proposition. `l5b-editeur-rendu` : texte HTML (`data-texte`), aucune `<img>`, phrase « Aucune génération d'image… » |
| IMG-08 | `l5b-calques` : annuler ×2, rétablir ×1 = l'étape attendue, tout annuler = document source octet pour octet, borne 100. `l5b-editeur-db` : suite d'éditions, annuler, rétablir, enregistrer, relecture (seconde lecture) = document identique ; parent = version de base ; versions 1 à 3 inchangées (empreinte et contenu) ; `studio_assets` inchangé. `l5b-editeur-rendu` : boutons et Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y |
| IMG-05 (contribution) | `l5b-calques` : 55 % sur 1:1, 4:5, 9:16 et quatre sources, écart ≤ 1 px, proportions de la source, centrage, sortie identique pour une même entrée ; alignements exacts sur six bords et centres ; arrondis |
| FLOW-06 (contribution) | `l5b-editeur-db` : deux onglets sur la même version, le second reçoit 409 `[{chemin: '/document/layers/texte_1/x', base: 120, courant: 300}]`, 0 écriture ; champs disjoints réappliqués puis enregistrés ; même champ : réapplication refusée, la valeur de l'autre reste. `l5b-editeur-rendu` : dialogue avec « Calque « Titre » · couleur du texte : « #111111 » → « #ff0000 » », focus piégé puis rendu à « Enregistrer », réappliquer désactivé si les champs se recoupent, recharger, copie de secours conservée |

Parcours réel sur le build de production (port local, base locale restaurée et semée de données fictives,
Chromium piloté en CDP, tout fait EN CLIQUANT) : document créé au format lu dans le brief (« Story 9:16 »),
photo produit posée à 55 %, textes et forme ajoutés, typo changée, enregistré ; deux onglets, le second reçoit le
409, réapplique, enregistre ; copie de secours proposée au retour. En base : 4 versions (création, éditeur ×3),
0 devis, 0 approbation, 0 job, 0 tentative, 0 registre, 0 outbox, 0 crédit, 0 `ai_spend`, 0 trace, 0 plan
d'impact. Captures 1440 / 1280 / 390 : vide, rempli, modifié, conflit, copie de secours, accès refusé,
introuvable, propriétés plein écran (390) ; aucune page ne défile horizontalement.

Trois défauts vus sur capture ou dans Chromium, corrigés : liste des calques qui débordait de sa colonne (piste
`minmax(0, 1fr)`), lignes de calques qui débordaient (même correction sur la liste), focus perdu après un 409
(`aria-disabled`). Un quatrième soupçon (texte non appliqué) venait du pilote headless sans focus de page ; non
reproduit avec l'émulation du focus, donc rien changé.

### Mutations (chaque garde cassée volontairement, échec constaté, code restauré)

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M1 verrou ignoré par `transformerCalque` | `l5b-calques` | `expected false to be 'CALQUE_VERROUILLE'` |
| M2 texte rasterisé à l'édition | `l5b-calques` IMG-07 | `expected { id: 'l_titre', kind: 'image', …(14) } to match object { kind: 'text', …(7) }` |
| M3 source rééchantillonnée au redimensionnement | `l5b-calques` | `source modifiée pour image_1 · r: expected [ 'a_media', 636, 477, 'null' ] to deeply equal [ 'a_media', 800, 600, 'null' ]` |
| M4 indice positionnel dans le patch | `l5b-calques` (5 tests) | `expected [ { op: 'replace', …(2) }, …(1) ] to deeply equal [ … ]` |
| M5 document lu par l'image clé (`impact.ts`) | `l5b-calques` | `une édition de calques a déclenché une génération: expected [ 'keyframe:s_fin', …(5) ] to deeply equal []` |
| M6 annuler décalé | `l5b-calques` IMG-08 | `expected '{"colorSpace":"sRGB",…' to be '{"colorSpace":"sRGB",…'` |
| M7 conflit de champ ignoré | `l5b-calques` FLOW-06 | `expected { ok: true, document: { …(5) }, …(1) } to deeply equal { ok: false, …(2) }` |
| M8 proportions du calque au lieu de la source | `l5b-calques` IMG-05 | `expected [ 594, 198 ] to deeply equal [ 594, 792 ]` |
| M9 borne de l'historique ignorée | `l5b-calques` | `expected 130 to be 100` |
| R1 texte rendu en `<img>` | `l5b-editeur-rendu` (7), `l5b-editeur-db` | `expected undefined to be '-20 % ce soir'` |
| R2 Ctrl+Z débranché | `l5b-editeur-rendu` | `expected 'Nouveau CTA' to be 'Peau nette en 7 jours'` |
| R3 raccourci intercepté dans un champ | `l5b-editeur-rendu` | `expected 'Peau nette en 7 jours' to be 'abc'` |
| R4 base non avancée après enregistrement | `l5b-editeur-rendu` | `expected 'Modifications non enregistrées' to be 'Enregistré'` |
| R5 différences absentes du dialogue | `l5b-editeur-rendu` | `expected '' to be 'Calque « Titre » · couleur du texte :…'` |
| R6 réappliquer toujours actif | `l5b-editeur-rendu` | `expected false to be true` |
| R7 aperçu par défaut sur téléphone | `l5b-editeur-rendu` | `expected 'Aperçu' to be 'Calques'` |
| R8 piège à focus du panneau mobile retiré | `l5b-editeur-rendu` | `expected false to be true` |
| R9 copie de secours non écrite | `l5b-editeur-rendu` | `expected null to match object { v: 1, baseVersionId: 'v1', baseN: 1 }` |
| R10 médias de tous les projets | `l5b-editeur-db` | `expected [ …(3) ] to deeply equal [ Array(1) ]` |
| R11 base périmée acceptée (`depot.ts`) | `l5b-editeur-db` FLOW-06 | `expected true to be false` |
| R12 lecture seule ignorée (écran) | `l5b-editeur-rendu`, `l5b-editeur-db` | `bandeau « Lecture seule » absent sans droit d'enregistrer: expected '' to contain 'Lecture seule'` |
| R13 verrou ignoré par les propriétés | `l5b-editeur-rendu` | `expected false to be true` |
| R14 droit d'enregistrer non lu | `l5b-editeur-db` | `bandeau « Lecture seule » absent pour un rôle sans studio.propose: expected '' to contain 'Lecture seule'` |
| R15 filtre SQL des médias retiré | `l5b-editeur-db` | `expected [ …(3) ] to deeply equal [ Array(1) ]` |
| R18 / R19 `disabled` sur Enregistrer / Annuler | `l5b-editeur-rendu` | `Enregistrer porte disabled pendant le conflit · le focus rendu tomberait sur <body>: expected true to be false` |

Une garde a survécu : « saisie puis départ du focus dans la même tâche », écrite pour le soupçon du texte non
appliqué. jsdom ne reproduit pas d'état périmé, la mutation passait au vert : la garde et le correctif ont été
retirés (le défaut n'était pas reproduit).

## 4. Limites

- Aperçu des médias : pas de route média dans ce lot (L5-A). Tant que `ROUTE_APERCU_MEDIA` vaut `null`, un média
  est un cadre nommé aux bonnes proportions. Rien n'est promis.
- Le rendu de l'export (composition finale) est au lot L5-A ; l'aperçu de l'éditeur est en DOM, avec les mêmes
  fichiers de police. L'égalité au pixel entre aperçu et export n'est pas prouvée ici.
- Pas de groupes, de recadrage d'image ni de déplacement multi-sélection ; pas de poignées de redimensionnement
  à la souris (taille au clavier et par champs, glisser pour déplacer).
- L'historique ne survit pas au rechargement (la copie de secours garde le document, pas les étapes).
- Le cadre d'un calque texte ne s'ajuste pas à son contenu : agrandir la police peut faire déborder le texte de
  sa boîte (visible, non rogné).
- État « lecture seule » prouvé en HTML rendu (rôle d'équipe), pas capturé ; « chargement » est `loading.tsx`,
  non capturé.

## 5. Besoins hors périmètre (intégrateur)

1. **Lien « Éditer l'image »** dans `components/studios/projet/VueProjet.tsx` (L4-B, non modifié ici), par exemple
   dans l'en-tête ou à la place de l'emplacement de production :
   `<Link href={`/studio/projets/${detail.projet.id}/image`}>Éditer l'image</Link>` (cible 44 px). La page existe
   et est déclarée dans `lib/navigation.ts`.
2. **Aperçus** : une fois la route L5-A fusionnée, dans `apps/web/lib/studios/editeur/apercus.ts`,
   `ROUTE_APERCU_MEDIA = (id) => \`/api/studios/media/${id}\``. La page passe déjà tous les identifiants utiles
   (médias du projet, photo produit, calques image et logo).
3. **Rendu L5-A** : les polices du document sont `sans` (« Liberation Sans », 400) et `sans-gras`
   (« Liberation Sans Bold », 700), fichiers `public/fonts/sans-{400,700}.ttf` ; la graisse se lit par
   `policeEditeur(fontId)` (`@tiktrends/core`). Taille du texte = `fontSizePx` en pixels du document ; boîte
   avant rotation, rotation autour du centre.
4. `porteeSql` de `lib/studios/depot.ts` toujours non exporté : la liste des médias recopie le filtre (espace +
   marques visibles + revérification pure).
5. Le fil d'Ariane affiche l'identifiant du projet (comportement existant de `/studio/projets/[id]`, segment
   dynamique) ; un libellé résolu (titre du projet) serait une amélioration de `navigation.ts`.
