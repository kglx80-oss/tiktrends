# L5-A · Rendu déterministe, masques, déclinaisons, médias

Lot L5-A du chantier Studios v1.0. Base : `claude/studios-base-vague4` (`2ce211f`). Chemins relatifs à `product/`.
Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit aucun état de production.
Aucune migration, aucun appel IA, aucune dépense, aucune dépendance ajoutée (`sharp` 0.34.5 était déjà là).

## 1. Ce que L5-A livre

| Livrable | Où |
| --- | --- |
| Règles pures : géométrie, masque canonique et composition stricte, polices embarquées et mise en page, Produit fidèle, déclinaisons et profils de canal, capacité de détourage, plan de rendu | `packages/core/src/studios/rendu/` (une ligne en fin de `packages/core/src/index.ts`) |
| Compositeur `sharp` d'un `DocumentStudio` en PNG | `apps/web/lib/studios/rendu/compositeur.ts` (+ `police-ttf.ts`, `polices.ts`) |
| Retouche en conservation stricte sur pixels décodés | `apps/web/lib/studios/rendu/masque-pixels.ts` |
| Lecture sûre des médias studio | `apps/web/lib/studios/rendu/medias.ts`, route `GET /api/studios/media/[id]` |
| Contrôle d'un import détouré | `apps/web/lib/studios/rendu/detourage.ts` |
| Actions | `apps/web/app/actions/studios/rendu.ts` : `rendreApercu` (lecture), `declinerFormat` (nouvelle version) |
| Tests | `packages/core/test/l5a-*.test.ts`, `apps/web/test/l5a-*.test.ts` (+ outils `l5a-outils.ts`), extension de `apps/web/test/lecture-seule.test.ts` |

## 2. Décisions et pourquoi

**Le noyau met en page, le serveur dessine.** Le texte n'est confié à aucun moteur tiers (Pango, navigateur) :
`mettreEnPage` coupe les lignes et place chaque glyphe avec une table d'avances et de boîtes d'encre MESURÉE dans les
deux TTF embarqués (`public/fonts/sans-{400,700}.ttf`, Liberation Sans, OFL), et le compositeur lit les contours de ces
mêmes fichiers (`police-ttf.ts`, contours quadratiques `glyf` → chemin SVG pixellisé par librsvg). Sonde préalable :
le texte natif de `sharp` rogne l'image à l'encre et applique le crénage (« AVAVAV » 362 px avec, 402 px sans), donc
ni la ligne de base ni la largeur n'y sont maîtrisées. Aucun crénage des deux côtés ; l'éditeur doit poser
`font-kerning: none` et le même interligne (boîte de ligne = taille × interligne, ascendant + descendant centrés,
comme CSS) pour coïncider. Familles disponibles : `Sans`, `Sans Bold` ; une police téléversée ou inconnue est refusée
(`UNSUPPORTED_CAPABILITY`), jamais remplacée.

**Géométrie.** Pixels du document source, origine haut gauche, degrés, `z` explicite. Le rendu accroche les BORDS
(`round(x)`, `round(x + width)`), pas la taille : deux calques bord à bord le restent. « Produit à 55 % » :
`placerParFraction` donne une largeur entière `round(0,55 × L)` et une hauteur proportionnelle à la source.

**Masque canonique.** grayscale8, 255 = modifier, 0 = préserver, dimensions de la SOURCE du calque (pas de l'écran) ;
`featherPx` = bande autorisée autour du support, distance euclidienne exacte (Felzenszwalb, éprouvée contre la force
brute). Une sélection (rectangle, lasso, pinceau) est convertie écran → document → source et échantillonnée au centre
des pixels : un bord à 10 ou à 9,9999999 (arrondi d'un zoom) sélectionne les mêmes pixels. Composition entière
`(a·g + (255 − a)·o + 127) / 255` ; `controlerHorsZone` compare le résultat à l'original sans relire la formule ;
`encodageAutorise` exige zéro. Côté serveur, `appliquerMasqueAuxPixels` enchaîne décodage, contrôle, encodage dans une
seule fonction ; en PNG, le fichier encodé est redécodé et recontrôlé. Une génération d'une autre taille est refusée,
sauf redimension EXPLICITE (`redimensionnerGeneration`).

**Produit fidèle.** Le produit est un calque image aux pixels de la photo source, sous aucune autre image, opaque, sans
masque de retouche, non étiré (≤ 1 px). Le compositeur pose un pixel opaque par COPIE (aucun mélange) : les pixels du
produit ne dépendent pas du décor. Une mise en scène générée « en place » passe par `masqueDecorProtegeantProduit`
(empreinte du produit élargie de la marge + fondu), et le contrôle hors zone prouve que le produit n'a pas bougé.

**Déclinaisons.** Recomposition d'abord : fond recadré en « cover » (jamais étiré), objets à l'échelle uniforme
`min(L/L0, H/H0)` recentrés dans la zone sûre, textes recoupés, portés au moins à la taille lisible, écartés du
produit (sinon produit réduit par pas de 10 %, sinon refus). Sources intactes : mêmes calques, médias, textes,
masques, polices ; le document d'origine n'est pas touché, la déclinaison est une NOUVELLE version (`enregistrerVersion`,
409 si la base n'est plus courante). Un fond agrandi au-delà de sa résolution donne une `extension_decor`
PROPOSÉE dans le rapport, jamais lancée (aucun devis, aucun job). `verifierDeclinaison` relit tous les invariants sur
le résultat, indépendamment de la recomposition.

Profils de canal versionnés : `meta-reels@2026-08` (9:16 : 14 % haut, 35 % bas, 6 % côtés) et
`meta-stories@2026-08` (14 %, 20 %, 6 %), 1:1 et 4:5 sans zone d'interface. Valeurs relevées par recherche web le
2026-10-08 (plusieurs relevés concordants du Meta Ads Guide) ; la page officielle n'a pas pu être ouverte depuis la
session : **à reconfirmer par le propriétaire avant un lancement**. Marge éditoriale (44/1080) et taille lisible
minimale (24/1080) MESURÉES sur la maquette existante (`lib/ad-render.tsx`, RENDER_VERSION 9 : marges 44 à 62,
plus petit texte courant 24 ; la pastille chiffre à 20 n'est pas du texte courant).

**Détourage (IMG-09).** Aucun modèle licencié n'est déployé : `capaciteDetourage()` répond `disponible: false` avec sa
raison et deux replis NON bloquants (import d'un PNG détouré, masque manuel). L'import est contrôlé côté serveur
(`analyserDetourage` : `sharp`, pas de WebGPU, pas de thread d'interface) : transparence réelle, sujet opaque, bords
adoucis, sujet coupé au bord, ombre détachée. Rien n'est simulé en production.

**Médias.** Lecture par `lireAsset` (dépôt L1 : espace ET marques visibles en SQL, revérification pure), état
`stored`, octets relus et comparés à `bytes` et `sha256` de la ligne, type MIME RÉEL relu dans l'en-tête
(`inspecterMedia`), liste blanche png/jpeg/webp/mp4 (jamais SVG ni HTML). Tout échec : 404 au corps identique à
« inconnu ». Réponse : octets, `cache-control: private, max-age=300`, `Vary: Cookie`, `nosniff`, CSP fermée
(`default-src 'none'; sandbox`), `ETag` = empreinte (304). Ni clé de stockage ni adresse de bucket dans la réponse ;
aucune URL signée fabriquée ni stockée. Pour un rendu, chaque média doit aussi appartenir à la MARQUE DU PROJET
(pas d'usage inter-marques par défaut, cahier §12) : sinon `MISSING_REFERENCE`, sans dire lequel. Le lecteur de
production lit le stockage S3 côté serveur (`publicUrlFor` + `fetch`, sans redirection, 15 s, 64 Mo) ; les clés
`simule/` du fournisseur simulé n'y sont jamais lues ; un lecteur injecté (tests) est refusé en production.

## 3. Preuves (recette 04)

| Exigence | Garde | Ce qui est compté (pixels décodés, réponses, lignes) |
| --- | --- | --- |
| IMG-05 | `l5a-geometrie`, `l5a-compositeur` | largeur = `round(0,55 × L)` pour L ∈ {1080, 1350, 1000, 777, 1920, 2160} ; dans le PNG décodé, largeur de l'encre du produit à ±1 px pour L ∈ {1080, 1350, 777}, hauteur proportionnelle à ±1 px |
| IMG-02 | `l5a-produit-fidele`, `l5a-compositeur` | deux décors : 0 pixel opaque du produit diffère (sur > 200 000), > 100 000 pixels de décor changent ; produit à sa taille source : 0 pixel différent de la photo (928 256 comparés) ; mise en scène « en place » par un modèle qui repeint tout : 0 pixel du produit modifié, > 500 000 du décor |
| IMG-06 | `l5a-masque`, `l5a-masque-pixels` | zone gauche tracée à 6 zooms/déplacements (cœur) et 4 (serveur) : masque identique octet pour octet, 4 800 pixels ; 0 pixel modifié hors zone + fondu (force brute indépendante), y compris dans le PNG stocké redécodé ; étoile posée ; un pixel qui fuit est compté (1) et interdit l'encodage ; composition fautive ⇒ 0 encodage |
| IMG-10 | `l5a-declinaisons`, `l5a-compositeur`, `l5a-actions-db` | 4:5 et 9:16 : dimensions, étirement ≤ 1 px (document et pixels), textes dans la zone sûre (9:16 Reels : 65, 269, 950 × 979), ≥ 24 px, hors du produit, sans débordement, fond couvrant ; document source identique (JSON) ; en base : versions 2 et 3 chaînées, v1 inchangée (empreinte), +2 audits, 0 job, 0 devis, 0 registre ; base périmée ⇒ 409 avec diff, 0 ligne |
| IMG-09 | `l5a-detourage`, `l5a-masque-pixels` | capacité `disponible: false` + raison + replis non bloquants ; import PNG à bords doux ⇒ `exploitable` ; bords francs, sujet coupé ⇒ `a_verifier` ; JPEG ⇒ refus avec raison |
| SEC-01 (médias) | `l5a-media-db`, `l5a-actions-db` | autre espace, marque restreinte, inconnu, mal formé, non stocké, empreinte altérée, SVG : même statut, même corps (hors `traceId`), aucun identifiant d'autrui ; aperçu d'un projet d'un autre espace ⇒ `NOT_FOUND` sans cible ; média d'une autre marque ⇒ `MISSING_REFERENCE` |
| SEC-07 (médias) | `l5a-media-db`, `l5a-actions-db` | ni clé de stockage ni URL dans en-têtes et corps ; aperçu en `data:` sans chemin de stockage |
| Lecture pure | `lecture-seule`, `l5a-media-db`, `l5a-actions-db` | route et `rendreApercu` hors du graphe des écrivains ; comptes de lignes identiques avant/après |

Mutations : voir §4.

## 4. Mutations

Chaque garde a été cassée volontairement (script de mutation : appliquer, lancer le test visé, noter la phrase, restaurer), a échoué, puis le code a été restauré.

| Mutation | Garde | Phrase d'échec |
| --- | --- | --- |
| Composition : a = 0 rend la génération | `l5a-masque` | `pixels modifiés hors zone + fondu: expected 17432 to be +0` |
| Contrôle aveugle à la zone | `l5a-masque` | `expected { pixelsHorsZone: +0, … } to match object { pixelsHorsZone: 1, … }` |
| Rampe de fondu au-delà de la bande | `l5a-masque` | `pixels modifiés hors zone + fondu: expected 647 to be +0` |
| Sélection échantillonnée au coin du pixel | `l5a-masque` | `expected false to be true` (masque différent selon le zoom) |
| Distance : passe des colonnes oubliée | `l5a-masque` | `essai 0 fondu 1: expected false to be true` |
| Fraction arrondie par défaut | `l5a-geometrie` | `document 1350: expected 742 to be 743` |
| Fond étiré au lieu de recadré | `l5a-declinaisons` | `[{"chemin":"/document/layers/fond","raison":"image étirée de 270.0 px"}]` |
| Zone sûre du canal ignorée | `l5a-declinaisons` | `expected { x: 65, y: 44, … } to deeply equal { x: 65, y: 269, … }` |
| Texte non écarté du produit | `l5a-declinaisons` | `expected false to be true` (recomposition refusée par la vérification) |
| Taille lisible ignorée | `l5a-declinaisons` | `expected false to be 24` |
| Source modifiée en place | `l5a-declinaisons` | `TypeError: Cannot assign to read only property 'width'` |
| Détourage annoncé disponible | `l5a-detourage` | `expected [ { id: 'simule', licence: '?' } ] to deeply equal []` |
| Image au-dessus du produit tolérée | `l5a-produit-fidele` | `expected '…' to match /recouvre le produit/` |
| Masque de décor sans la bande de fondu | `l5a-compositeur` | `expected 6188 to be +0` (pixels du produit touchés) |
| Mise en page sans demi-interligne | `l5a-compositeur, l5a-texte` | `ligne de base absolue (CSS): expected 3.67 to be less than or equal to 1` / `received difference is 4.140625` |
| Table de métriques faussée (avance du H) | `l5a-compositeur` | `expected [ Array(1) ] to deeply equal []` (écart noyau ↔ TTF) |
| Ordre d'empilement inversé (décor dessus) | `l5a-compositeur` | `pixels du produit altérés par le décor: expected 252148 to be +0` |
| Opacité 0,99 imposée au produit | `l5a-compositeur` | `expected 0 to be greater than 200000` (plus aucun pixel opaque) |
| Taille posée ignorée (hauteur = largeur) | `l5a-compositeur` | `expected 297 to be less than or equal to 1` |
| Encodage malgré un contrôle non conforme | `l5a-masque-pixels` | `expected true to be false` |
| MIME déclaré au lieu du réel | `l5a-media-db` | `expected 'image/jpeg' to be 'image/png'` |
| Empreinte non vérifiée | `l5a-media-db` | `Unexpected token '�', "�PNG…"` (octets servis au lieu du 404) |
| SVG servi | `l5a-media-db` | `Unexpected token '<', "<svg xmlns"… is not valid JSON` |
| Cache public | `l5a-media-db` | `expected 'public, max-age=300' to be 'private, max-age=300'` |
| Média d'une autre marque accepté au rendu | `l5a-actions-db` | `expected { ok: true, apercu: … } to match object { ok, code }` |
| L'aperçu écrit un audit | `l5a-actions-db, lecture-seule` | `expected { versions: 2, audit: 4, … } to deeply equal { versions: 2, audit: 2, … }` |
| Déclinaison sur la version courante au lieu de la base | `l5a-actions-db` | `expected { ok: true, version: … } to match object { ok: false, … }` |
| Route GET qui écrit en base | `lecture-seule` | `consultation qui écrit en base : app/api/studios/media/[id]/route.ts · écriture directe en base` |

Premier passage : UNE mutation restait verte (mise en page sans demi-interligne, côté serveur) : la garde comparait l'encre rendue à la ligne de base calculée par le MÊME noyau muté. Ajout d'une valeur absolue (CSS) ; la mutation tombe désormais côté serveur et côté noyau.

## 5. Limites

- Le rendu ignore le crénage (choix assumé, des deux côtés) ; le texte bidirectionnel et les ligatures ne sont pas
  pris en charge (Liberation Sans, latin). Un caractère hors table est dessiné en boîte `.notdef` et signalé.
- Les profils de zone sûre reposent sur des relevés secondaires du guide Meta (voir §2) ; aucun profil TikTok n'est
  livré faute de source vérifiée.
- L'orientation EXIF n'est pas appliquée : un calque se rend dans l'ordre des pixels stockés, cohérent avec les
  dimensions relevées par le worker (`inspecterMedia`).
- Aucun écran : l'éditeur (L5-B) consomme `rendreApercu`, `declinerFormat`, la route média et les règles du noyau.
- Le lecteur de production lit le bucket par son adresse publique (le bucket est en lecture publique, `storage.ts`) ;
  une lecture signée (GET SigV4) serait préférable si le bucket devient privé (fonction absente de `storage.ts`).

## 6. Besoins hors périmètre (l'intégrateur tranche)

1. **Éditeur (L5-B)** · afficher les médias par `/api/studios/media/<id>` et l'aperçu par `rendreApercu` ; poser
   `font-kerning: none`, les familles `Sans`/`Sans Bold` servies depuis `public/fonts`, et l'interligne CSS pour
   coïncider avec `mettreEnPage` ; tracer les masques avec `traceEcranVersSource` + `masqueDepuisPolygone`/`masqueDepuisTrait`.
2. **Stockage** · une lecture S3 signée (`getObject` SigV4) dans `packages/integrations/src/storage.ts` pour ne plus
   dépendre de la lecture publique du bucket.
3. **Masque stocké** · `MasqueStudio.assetId` désigne un média grayscale8 ; aucun format de fichier n'est encore fixé
   pour le stocker (PNG gris 8 bits proposé) ni d'import d'un masque dans `studio_assets`.
4. **Retouche réelle** · brancher `appliquerMasqueAuxPixels` dans la finalisation du worker (L3 `finaliser`) pour les
   opérations `retouche`, avec le masque et le fondu de l'instantané du job.
5. **Profil TikTok** · valeurs de zone sûre à fournir par le propriétaire (source officielle).
