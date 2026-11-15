# Creaflow AI · comment ils produisent leurs pubs

Relevé du 15 novembre 2026, fait uniquement sur les pages publiques de `creaflowai.fr` : aucun compte créé, aucune connexion, aucun formulaire rempli, aucune dépense.

Conventions :
- **VU** : texte cité mot pour mot depuis la page (entre guillemets « »), ou ce que montre directement une image téléchargée ;
- **DÉDUIT** : mon interprétation, avec son niveau de confiance.

Pages lues : 74 au total. Ce sont les 63 pages françaises du sitemap (accueil, tarifs, aide ×30, fonctionnalités ×3, blog ×20, pages légales), la page d'accueil en anglais, `/app` et 10 pages « Ressources » liées dans le pied de page mais absentes du sitemap. Toutes ont répondu HTTP 200. Les captures pleine page (1 000 px de large, JPEG) sont dans `captures/`. Les visuels d'exemple récupérables sont dans `exemples/`.

---

## 0. L'essentiel en dix lignes

1. **Le moteur d'image est Nano Banana 2.1 (Google), annoncé noir sur blanc** : « CreaFlow AI est passé à Nano Banana 2.1, pour tes créas statiques comme pour tes vidéos. » (blog, 7 oct. 2026).
2. **Claude écrit les textes et pose la stratégie** : « La différence vient du moteur : Claude. » (`/systeme-prod-claude-creaflow`). La page `/lp-ads-claude02` décrit le procédé d'origine : « Prompting sur Claude et la génération Gemini ».
3. **La typographie des statiques est dessinée par le modèle d'image, dans l'image.** Leur éditeur a un bouton « Rendre éditables » qui *relit* les textes imprimés pour en faire des calques. Leur aide reconnaît le risque : « Avec Nano Banana 2.1, garde tes accroches courtes et relis-les. »
4. **Le logo est redessiné par le générateur, pas incrusté** : « Il est redessiné par le générateur : pour un logo exact au pixel près, pose-le dans l'éditeur. »
5. **Le point de départ est toujours une pub existante** : « on ne génère jamais depuis une page blanche ». L'utilisateur clone une ad de la niche (19 crédits) ou passe par l'assistant « Flow » qui produit des cartes (12 crédits).
6. **Le texte de la carte est imposé mot pour mot** : « Tout texte d'une carte est écrit mot pour mot sur la créa ; une carte peut aussi n'avoir aucun texte. »
7. **Jusqu'à 3 photos de référence du produit par créa**, plus une fiche produit analysée (« ce que ses photos ne montrent pas », « sa taille réelle »).
8. **Le contrôle qualité est assuré par le client** : bouton « Signaler », vérification « sous 48 h », crédit rendu si le signalement est validé. Aucune relecture automatique de l'image n'est annoncée.
9. **En vidéo, aucun texte n'est jamais dessiné dans l'image** : « aucun texte n'est écrit dans l'image ». Textes, logo et sous-titres sont posés au montage. Le modèle d'animation n'est pas nommé.
10. **Prix public** : une créa statique coûte 12 crédits, soit 0,11 € à 0,23 € selon l'offre. Une vidéo de 15 s coûte 400 à 910 crédits, soit 3,63 € à 17,70 €.

---

## 1. `/app` : la connexion est-elle obligatoire ?

**VU.** `https://creaflowai.fr/app` redirige vers `https://creaflowai.fr/login` (capture `captures/app-redirige-vers-login.jpg`). Textes de la page :
« Bon retour ! » · « Connecte-toi pour accéder à tes outils. » · « Continuer avec Google » · « Email » · « Mot de passe » · « Se connecter » · « Pas encore de compte ? S'inscrire ».
Panneau de droite : « Génère tes publicités winneuses en 1 clic. » · « Gagne du temps : jusqu'à 50 publicités en un clic avec CreaFlow AI. »
Le fond est une mosaïque de créas et de vidéos servies par `assets.creaflowai.fr`, bloqué ici, donc rendue en cadres vides.

Le fichier `robots.txt` contient : `Disallow: /app`.

**Conclusion.** Rien de l'application n'est visible sans compte. Ce qui suit vient de l'aide publique, très détaillée (30 articles mis à jour entre le 24 septembre et le 14 novembre 2026), qui décrit l'interface écran par écran.

---

## 2. Les types de créations

### Statiques

**VU** (aide « Formats et déclinaisons ») :
- « 1:1 : carré. 4:5 : portrait. 9:16 : story et reels. 16:9 : paysage. »
- « Une déclinaison coûte 5 crédits. » Une créa existante se décline dans un autre format depuis le Studio.
- « La page Formats range les ads de CreaSpy par format : lifestyle, promo, advertorial, avant / après, avis client, comparatif, mème, ugly ad… »

**VU** (blog « Publicités statiques : 15 formats ») : la grille complète, présentée comme « la grille avec laquelle CreaFlow AI classe automatiquement les publicités qu'il relève » :
Packshot · Lifestyle · Ingrédients · Callout · Avis client · Avant / après · Infographie · Us vs Them · Checklist · Promo / offre · Ugly · Fake chat · Meme · Texte seul · Advertorial.

**VU** : le texte fait partie de l'image générée.
- « Après une modification de toute l'image par FlowAI, les textes de la créa font partie de la nouvelle image : « Rendre éditables » les relit dans cette nouvelle image. »
- « Clique sur « Rendre éditables » : les textes de ta créa deviennent des calques que tu peux changer. »
- « En plan gratuit, libérer des textes imprimés sur une photo prend un de tes essais de modification d'image. »

**DÉDUIT (confiance forte).** La statique sort du modèle d'image avec titre, sous-titre, badge et bouton déjà dessinés. Il n'y a pas de couche typographique composée en code. L'éditeur fait ensuite l'inverse de notre approche : il lit le texte dans les pixels (lecture de type OCR), l'efface et le recrée en calques. La phrase « libérer des textes imprimés sur une photo » coûte un essai de modification d'image : l'opération passe donc elle-même par le modèle d'image.

### Langues

**VU** : « choisis-la sur la carte du clone, à côté du format : français, anglais, espagnol, italien ou arabe. »

### Vidéo

**VU** (aide « Créer une vidéo pub », mise à jour le 14 novembre 2026) :
- « Les vidéos sont verticales (9:16) et durent jusqu'à 60 secondes, selon ton offre. »
- Trois rendus : « Ultra : la peau, la lumière, les gestes et la voix d'une vraie vidéo, filmés ensemble » · « Standard, le choix par défaut : plus rapide et moins cher, avec une image plus lisse » · « Une vidéo animée, dans le style de ton choix ».
- Styles animés : « pâte à modeler, 3D long-métrage, briques, crochet, dessin animé 2D ».
- Premier écran du parcours d'accueil : « UGC face caméra, démo, dessin animé, 3D, pâte à modeler… ».
- Blog : « réalistes (UGC, unboxing, avant/après, pub studio) ».
- « Un carrousel : 2 à 12 photos avec leur texte, pour un carrousel ou en diaporama vidéo. »
- « Le texte et le logo dans l'image : une vidéo filmée en prises (toute nouvelle vidéo) n'écrit aucun texte dans l'image, où il se déformerait : tes textes et ton logo se posent au montage. »

### UGC, packshot, avant / après

Tous les trois sont cités : UGC en vidéo, packshot et avant / après en statique (grille des 15 formats) comme en vidéo.

---

## 3. La méthode annoncée

### 3.1 Les modèles d'IA cités

| Modèle | Rôle annoncé | Citation et source |
| --- | --- | --- |
| **Nano Banana 2.1** (Google DeepMind) | Génère les images des statiques et des vidéos | « CreaFlow AI est passé à Nano Banana 2.1, pour tes créas statiques comme pour tes vidéos. » (`/fr/blog/nano-banana-2-1-vs-gpt-image-2-5`) |
| Nano Banana 2 / « NanoBanana2 » | Version précédente | « le process complet avec Claude et le modèle NanoBanana2 » (`/lp-ads-claude02`) |
| **Claude** | Stratégie, angles, textes | « La différence vient du moteur : Claude. » · « Claude structure chaque créa comme un Creative Strategist » (`/systeme-prod-claude-creaflow`) |
| Gemini | Génération d'image (procédé manuel d'origine) | « générés avec Prompting sur Claude et la génération Gemini » (`/lp-ads-claude02`) |
| GPT Image 2.5 | Comparé, puis écarté | « Une affiche couverte de petit texte : GPT Image 2.5 reste le plus sûr. » |

**Aucun modèle vidéo n'est nommé** (ni Veo, ni Kling, ni Seedance, ni Sora). Ces noms n'apparaissent que dans l'article qui décrit la « stack de 6 outils » concurrente. La page « À propos » dit : « Les modèles utilisés sont ceux du marché, choisis et changés selon ce qu'ils rendent réellement sur des créas publicitaires ».

**DÉDUIT (confiance faible).** Plusieurs vidéos de démonstration bloquées s'appellent `omni-*` (`omni-rome`, `omni-couch`, `omni-car`, `omni-takes`…). Le préfixe peut désigner un modèle d'avatar parlant de type « OmniHuman ». C'est une simple piste, que rien ne confirme.

**VU** : arguments de leur choix de modèle (article du 7 oct. 2026). Voici le tableau tel que publié :

| Critère | Nano Banana 2.1 | GPT Image 2.5 |
| --- | --- | --- |
| Vitesse | « ≈ 15 s par image » | « ≈ 21 s par image (Flare) » |
| Prix | « 0,0336 $ l'image en 1K, 0,113 $ en 4K » | « d'environ 0,006 $ à 0,053 $ l'image carrée » |
| Images de référence | « Jusqu'à 14 » | « Jusqu'à 16 » |
| Petit texte | « À relire » | « Plus sûr » |

Autres phrases de l'article :
- « Sur nos générations, Nano Banana 2.1 met 12 à 22 secondes par image, 15 en moyenne. »
- « Avec Nano Banana 2.1, garde tes accroches courtes et relis-les. Dans CreaFlow AI, tu corriges n'importe quel texte en un clic dans l'éditeur ».
- « la retouche ciblée se fait en mots : « remplace uniquement le fond », et le reste ne bouge pas. »

### 3.2 Les étapes du flux

**1. Import du produit.**
**VU** : « Pour une marque de produits physiques, aucune créa ne peut être générée sans produit : les photos de tes produits servent de modèle à l'IA pour dessiner ton produit dans tes pubs. »
« Avec un site, ils s'importent seuls depuis une boutique Shopify ou WooCommerce. »
« Au moment de générer, tu choisis jusqu'à 3 photos de référence par créa. »

**2. Analyse du produit**, gratuite, avec une fiche corrigeable.
**VU** : « Ce que Flow sait de ce produit » couvre « ce qu'est le produit, ce qu'un achat contient (…), comment il s'utilise, sa taille réelle (au besoin comparée à une main ou à une personne), ce que ses photos ne montrent pas, les faits de sa page, ce que sa page promet (dans ses mots, sans rien renforcer) et ce qui est à te confirmer. Chaque photo affiche aussi ce qu'elle montre. »
« Ton produit sort trop grand ou trop petit dans une créa ? Dis-le à Flow : il écrit sa taille réelle dans la fiche ».
« L'emballage, la boîte ou l'étui de ton produit ne comptent pas comme un autre produit. »

**3. Analyse de la marque.**
**VU** : « « Ma marque » (…) : résumé, identité, ton, public, rempli par l'analyse (environ une minute). »
`/creaflow-tool-demo` détaille ce qu'elle extrait : « Ton identité, ton ton de marque et ta promesse · Tes arguments de vente et tes preuves (chiffres, certifications, avant/après) · Ton audience et ses frustrations ».
« Tes couleurs de marque ne sont utilisées que si tu les demandes, sur le graphisme, jamais sur la photo. »

**4. Veille des concurrents** (CreaSpy, extension Chrome, AdsScroll).
**VU** : « Tri par durée de diffusion et par volume de variantes » · « Angle, promesse et format extraits automatiquement ».
Plan gratuit : trois pubs vidéo proposées, « classées par une note sur 100 : depuis combien de temps elle tourne, combien de versions l'annonceur en a lancé, son audience ».

**5. Brief et angles.**
**VU** : « Flow te propose des cartes de créas (autant que tu en demandes, jusqu'à 6 par réponse). »
Chaque carte se règle : « le titre, le sous-titre, les autres textes (paragraphe, badge, prix…), l'appel à l'action, le produit (ou aucun), le format, la mise en scène, ses couleurs ou ton logo ».
L'utilisateur peut aussi écrire « ce que tu ne veux pas dans le prompt négatif ».
Méthode « 4 layers » (`/systeme-4-layer`), à refaire soi-même avec Claude Code : « Layer 1 » extrait l'ADN dans « un JSON prêt pour le Layer 2 » ; « Layer 2 » produit « 4 angles × 3 variantes de hook + score + format recommandé ».
Page angles : « Trois déclinaisons par angle suffisent à savoir si l'idée porte. »

**6. Templates.**
**VU** : il n'y a pas de gabarits graphiques à proprement parler. Le gabarit, c'est la pub clonée.
« Cloner, c'est reprendre une pub qui marche (son idée, sa mise en page) et la refaire avec ton produit et ta marque. »
« Écris tout ce que tu veux dans ton message (textes, couleurs, polices, cadrage, ce qui change) : tout est transmis au clone, sans résumé. »
« Pour refaire un clone qui ne te va pas, dis ce qui ne va pas : Flow repart de l'ad d'origine, pas de la créa ratée. »
L'éditeur propose des « Modèles », sans plus de détail.

**DÉDUIT (confiance forte).** La pub source est envoyée au modèle d'image comme image de référence, à côté des photos du produit. La mise en page est ainsi copiée par le modèle, sans aucun gabarit codé.

**7. Direction artistique.**
**VU** : « Une carte n'impose aucune couleur, sauf si tu en donnes à Flow ».
Une image jointe peut servir de « une DA à reprendre (tes propres pubs, par exemple) ».
En vidéo : « clique d'abord sur une carte de style sur l'accueil de Flow, ou demande-le-lui ; sinon, Flow le choisit. »

**8. Détourage.**
**VU** : « « Retirer le fond » et la gomme magique tournent sur ton ordinateur, gratuitement. La première fois, l'outil télécharge un fichier (environ 100 Mo pour retirer le fond) ». Le détourage se fait donc dans le navigateur, uniquement dans l'éditeur, et pas dans la génération.

**9. Retouche.**
**VU** : retouche manuelle « gratuites et illimitées ». « FlowAI Édition » coûte « 9 crédits par demande validée, quel que soit le nombre de zones » et prend « environ 30 secondes » par image.
Fonctionnement : « FlowAI te montre d'abord son plan (« Voici ce que je vais faire »). Clique sur « Valider » ». On peut aussi montrer la zone : « entourer la partie de l'image à changer, avec un rectangle ou un pinceau ».
« Un texte ou un logo exact s'y pose en calque, sans être redessiné. »
« Nomme-le simplement (« remplace le flacon par mon parfum Rose Absolue ») : FlowAI retrouve sa photo parmi tes produits et le reproduit fidèlement, étiquette comprise. »

**10. Upscale.**
**VU** : rien n'est annoncé. Aucune résolution de sortie n'est donnée pour les statiques. Le plan gratuit génère « en qualité réduite » et avec « un filigrane CreaFlow ».
**DÉDUIT (confiance moyenne).** Les sorties payantes sont en 1K. Leur seul exemple récupéré mesure 1024 × 1024, et le prix de 0,0336 $ qu'ils citent correspond au 1K.

**11. Contrôle qualité.**
**VU** : « La créa est ratée : Produit déformé, texte illisible, mauvais produit : signale-la. (…) On vérifie sous 48 h. Si le signalement est validé, le crédit t'est rendu automatiquement. »
« Le générateur d'images refuse parfois un sujet qu'il juge sensible. La créa passe alors en échec et tes crédits te sont rendus. »
« Flow relit tes retouches. » Cette relecture porte sur les cartes, avant la génération.
FAQ : « Flow peut-il inventer des avis ou des chiffres ? Pas de lui-même. »
**DÉDUIT (confiance moyenne).** Aucune relecture automatique de l'image générée n'est annoncée : ni comparaison du texte rendu au texte demandé, ni vérification de l'étiquette. Le contrôle qualité repose sur le client et sur un remboursement manuel.

### 3.3 Le nombre de variantes

**VU** :
- « Jusqu'à 10 créas par lancement, en 1:1, 4:5, 9:16 ou 16:9 » (`/creaflow-tool-demo`) ;
- « jusqu'à 6 par réponse » (cartes Flow) ;
- « jusqu'à 10 ads image à la fois » (clone) ;
- « jusqu'à 50 publicités en un clic » (page de connexion) ;
- « près d'une cinquantaine de créas en un seul clic » (`/lp-ads-claude02`).

Les chiffres marketing (« 50+ créas par semaine », « CPA divisé par 2 », « Taux de détection : 0% ») ne sont accompagnés d'aucune méthode vérifiable.

### 3.4 La vidéo, pas à pas

**VU** : script → personnages → découpage en prises → génération → montage.
- « Le nombre de plans suit l'histoire, jusqu'à 24. Chaque plan se passe en un seul lieu, filmé d'une traite ».
- Personnages : « une fiche chacun (une planche qui montre sa tête de près sous plusieurs angles, puis son corps entier) ».
- Il existe « la banque d'acteurs » (« des visages prêts, adultes et enfants »).
- « les plans qui se suivent sont filmés ensemble, en prises de 10 secondes au plus. Chaque prise naît d'un bloc : l'image, le mouvement, les voix, les lèvres et le son du lieu. »
- En français et en Ultra : « chaque réplique est d'abord dite à part avec cette voix, puis la vidéo la rejoue ».
- Montage automatique : « les blancs sont coupés là où quelqu'un parle face caméra (…), un petit zoom vient de temps en temps, les sous-titres se posent sur les mots vraiment dits, puis la musique. »
- Fidélité du produit : « Pour qu'il reste fidèle, la caméra ne zoome pas dessus, et la vidéo ne montre rien de lui qu'on ne connaît pas (son contenu, sa composition). »
- Voix : « 136 voix en français et en anglais, jusqu'à quatre personnes qui parlent dans la même vidéo » (blog).
- Ce qui n'est pas possible : « un autre format que vertical, une voix off dans une autre langue que le français ou l'anglais (…), ta propre voix ».

**DÉDUIT (confiance moyenne).** Avant le 13 novembre 2026, ils passaient par une image fixe par plan, animée ensuite. Les mentions de « l'ancien moteur, qui a des images de plans » et d'un « acompte » en témoignent. Ils sont passés à un modèle qui génère l'image, le mouvement, la voix et les lèvres dans une même prise de 10 secondes au plus. Ce modèle n'est pas nommé.

---

## 4. Les visuels d'exemple

Seuls deux vrais exemples de créas ont pu être récupérés : tous les autres sont sur `assets.creaflowai.fr`, bloqué (voir §6).

### 4.1 `exemples/statique-naali-ingredients-1x1.webp` (1024 × 1024)

Source : `https://creaflowai.fr/lp-creas/naali-fruits-rouges.webp`, publiée dans l'article « Publicités statiques : 15 formats ».
Texte alternatif : « Publicité statique au format ingrédients : une boîte de gommes entourée de fraises et de framboises ».
L'article précise : « Les visuels d'exemple sont des créas produites avec CreaFlow AI. »

**VU**
- **Composition** : boîte orange à couvercle blanc à droite, en tiers vertical. Une gomme orange au premier plan centre. Fraises, framboises et groseilles éparpillées sur un plan de marbre clair. Un linge blanc à gauche. Titre en haut à gauche.
- **Typographie** : titre à empattements, brun foncé, sur 4 lignes : « Un goût / fruits rouges / qui fait du bien, / vraiment. » Sous-titre sans empattements : « Parce que soulager ton cycle ne devrait jamais être désagréable. » Aucun bouton d'appel à l'action. Les accents et apostrophes sont corrects, le français est juste et les deux polices sont nettes.
- **Étiquette** : « naali » · « ANTI-STRESS » · « SÉRÉNITÉ & HUMEUR POSITIVE » · « sans sucre » · « + safran » · « Safran / Vitamines / B3, B6, B9, B12 » · « Goût mangue » · « 60 gommes ». Même le petit texte est lisible et sans déformation.
- **Éclairage** : lumière naturelle chaude venant de la gauche, ombres de feuillage portées sur le mur, ombres douces sous les fruits. Le rendu est très photographique.
- **Réalisme** : fruits crédibles (texture des fraises, reflets). La gomme a l'aspect sucré d'une vraie gomme.
- **Défaut visible, de fond** : **le titre promet « Un goût fruits rouges », et l'étiquette indique « Goût mangue »**. La gomme est orange et non rouge. L'image se contredit elle-même. **DÉDUIT** : le décor a suivi le brief « fruits rouges » pendant que l'étiquette a été recopiée fidèlement depuis la photo produit. Aucun contrôle de cohérence entre l'accroche et le produit n'a eu lieu, ou alors il n'a pas bloqué la publication.
- Le sous-titre parle de « cycle » alors que l'étiquette dit « anti-stress ». Ce n'est peut-être pas une erreur (allégation de la marque), mais c'est flou.

### 4.2 `exemples/grille-batch-angles-produit-capillaire.jpg` (1024 × 707)

Source : `https://creaflowai.fr/lp-systeme-prod/grille-creas-angles.jpg`, présentée comme « Exemple de batch : une grille de créas à angles variés prêtes pour Meta ». Le même fichier est aussi servi sous `/lp-lead-magnet-4-layers/photo-crea-grille.png`.

Planche de 16 créas portrait (4:5 apparent) pour un seul produit capillaire : flacon brun foncé, bouchon bois, étiquette « 100% MASKRITI ». La résolution ne permet pas de lire l'étiquette de près.

**VU**
- **Variété des angles** : héritage (« Un savoir haïtien transmis de mère en fille », « 2 ans de formulation. Un héritage d'Haïti. »), problème (« Tes cheveux boivent, mais restent secs. Pourquoi ? »), peur (« Dans dix ans, combien de cheveux te restera-t-il ? », sur une bonde de douche pleine de cheveux), ennemi commun (« L'industrie n'a jamais formulé pour ton cheveu »), identité (« Tes cheveux parlent avant que tu ouvres la bouche »), preuve (« En 30 jours, une longueur mesurable. Vraiment. », avec un mètre ruban).
- **Composition** : 16 scènes réellement différentes, et non 16 recadrages. Rayon de supermarché, salle de réunion, douche, salle de bain, macro du cuir chevelu, portrait en contre-jour, flatlay de flacons concurrents.
- **Fidélité du produit** : la forme du flacon, la couleur et le bouchon bois restent constants d'une créa à l'autre.
- **Typographie** : deux familles (une sans empattements grasse, une à empattements fine). L'accent de couleur est appliqué à un seul mot (« Pourquoi ? », « ouvres la bouche »). Bouton d'appel à l'action en pastille blanche ou noire en bas (« Découvre l'héritage », « Nourris en profondeur », « Stopper la casse », « Protège ta fibre »). La hiérarchie est cohérente sur toute la planche : titre, sous-titre, bouton.
- **Éclairage** : chaud et naturel dans la plupart des scènes ; flash froid sur la douche.
- **Réalisme** : personnes crédibles à cette résolution (mains, cheveux crépus, peau).

**Défauts visibles**
- Une créa répète son titre deux fois : « La nuit dernière, tu ne t'es pas grattée une seule fois. » apparaît en haut puis de nouveau en bas, au-dessus de « 1 751 femmes apaisées ».
- Notation à l'anglaise : « Notée 4.8/5 par 1 751 femmes » et « Note : 4.8/5 », avec un point au lieu d'une virgule.
- Plusieurs chiffres de preuve sociale (« 1 751 femmes », « 1 342 clientes ») dont on ignore s'ils sont réels.
- Dans « Tes cheveux crépus, enfin le regard qu'ils méritent », le flacon est minuscule, collé au niveau de la taille du personnage, et ne s'intègre pas à la scène.
- Dans « Tes cheveux parlent avant que tu ouvres la bouche », le produit est presque invisible.
- Sur la planche, plusieurs boutons sont coupés par le bord bas. **DÉDUIT** : c'est sans doute dû au montage de la planche plutôt qu'aux créas elles-mêmes.

### 4.3 Captures d'interface (images fixes de vidéos de démonstration, 1280 × 720)

Ce sont des images d'interface, pas des créas :
- `video-demo-presentation-image-fixe.webp` : « De ta boutique à tes ads winneuses. »
- `video-demo-bibliotheque-image-fixe.webp` : « Toutes les ads de tes concurrents. »
- `video-demo-mcp-claude-image-fixe.webp` : ajout du connecteur MCP dans Claude, URL `https://api.creaflowai.fr/functions/v1/mcp`.
- `video-demo-creaspy-image-fixe.webp` : la vue CreaSpy, avec « naali.fr » comme marque active et deux ads d'un concurrent (« Mium Lab ») étiquetées « Top 10% ». C'est le seul aperçu réel de l'interface.

### 4.4 Visuels d'exemple non téléchargés

Ces visuels sont décrits uniquement par leur texte alternatif (**VU**, texte de la page). Ils sont dans l'article des 15 formats :
- `a11.webp` : « au format avant/après : une peau irritée puis apaisée, à côté d'un déodorant » ;
- `a16.webp` : « au format callout : une boisson chocolatée entourée de flèches vers ses bénéfices » ;
- `a17.webp` : « au format avis client : un témoignage cinq étoiles à côté d'un sachet de boisson » ;
- `a2.webp` : « au format promo : l'annonce d'un retour en stock avec un code de réduction, au-dessus d'un sachet de chocolat » ;
- `a5.webp` : « au format ugly : un post-it griffonné listant cinq raisons, à côté d'un pot de complément sportif » ;
- `a6.webp` : « au format us vs them : un sirop de chicorée chocolaté comparé à une pâte à tartiner sans marque, coches contre croix ».

Sur la page d'accueil, la rangée « Des créas générées avec CreaFlow AI » compte 13 vignettes (`ads-v3/thumbs/1..13.webp`) et 25 vidéos ou images fixes (`reels-v1..v3/*`), toutes sans texte alternatif. Leurs noms suggèrent les styles : `bonjourclay`, `claydog` (pâte à modeler), `fincut-lego` (briques), `fincut-real`, `cream-selfie` (UGC selfie), `exodeunbox` (déballage), `polo-founder` (fondateur face caméra).

### 4.5 Images exclues du dossier

Ces images sont servies par `creaflowai.fr` mais ne sont pas des créas Creaflow :
- `/lp-anatomie-winneuse04/brick-apology.png`, `brick-car-dashboard.png`, `froya-pricey.png` : pubs réelles de marques tierces (Brick, Frøya), commentées dans leur guide ;
- `ugly-ads-paint.png` : illustration d'article ;
- `/lp-lead-magnet-4-layers/ibra-portrait.png` : portrait du fondateur ;
- `/lp-team/*` : photos d'équipe.

---

## 5. Prix et crédits

**VU** (`/fr/pricing` et aide « Comment marchent les crédits », 29 sept. 2026).

| Offre | Mensuel | Annuel (par mois) | Crédits par mois | Équivalent annoncé |
| --- | --- | --- | --- | --- |
| Starter | 34,99 € | 24,49 € | 1 800 | « = 4 vidéos (15 s chacune) ou 150 images » |
| Growth | 54,99 € | 38,49 € | 3 500 | « = 8 vidéos (15 s chacune) ou 291 images » |
| Creascale | 139,99 € | 97,99 € | 10 800 | « = 25 vidéos (15 s chacune) ou 900 images » |

| Action | Coût |
| --- | --- |
| « Générer une créa (aussi un « Réessayer ») » | 12 crédits |
| « Cloner une pub image » | 19 crédits |
| « Décliner une créa dans un autre format » | 5 crédits |
| « Faire modifier l'image par FlowAI Édition » | « 9 crédits par demande validée » |
| Vidéo | « 10 crédits, puis 26 / 28 / 60 crédits par seconde » (animée / réaliste Standard / réaliste Ultra) |
| « Créer un carrousel » | « 10 crédits, plus 12 par photo » |
| Recharge de 1 200 crédits | « 18,99 € en Starter, 13,99 € en Growth et 9,99 € en Creascale » |

Page d'accueil : « Créa statique · 0,11€ · 1 génération » et « Vidéo 15 s · 3,63€ ». Ces deux prix sont présentés comme « Prix CreaFlow « dès », à l'année ».

**DÉDUIT (calcul).** Le crédit vaut entre 0,0091 € (Creascale annuel) et 0,0194 € (Starter mensuel). Une créa statique revient donc à **0,11 € à 0,23 €** ; un clone, à **0,17 € à 0,37 €**. Leur coût brut d'image annoncé est de 0,0336 $ par image en 1K, plus les images d'entrée et le modèle de langage : la marge brute est donc d'environ 3 à 6 fois. Une vidéo de 15 s coûte 400 crédits en animée et 910 crédits en Ultra, soit **3,63 € à 17,70 €**.

Plan gratuit (aide mise à jour le 14 nov. 2026) : « Un compte ouvert depuis le 9 novembre 2026 démarre sans crédits ». « Générer : tes créas, tes clones, tes vidéos et tes carrousels » demande une offre payante. Seul l'aperçu des « 3 à 4 premières secondes » d'une première vidéo est offert.
**VU, contradiction** : la page tarifs dit encore « Tu peux analyser ta marque et générer tes premières créas avant de décider ». Elle mentionne aussi un « acompte » à la validation du scénario, que l'aide dit supprimé depuis le 13 novembre.

---

## 6. Ce qui n'a pas pu être vu

| Élément | URL | Erreur |
| --- | --- | --- |
| Toutes les créas et vidéos de démonstration de la page d'accueil, de la page de connexion et des articles | `https://assets.creaflowai.fr/public/lp/...` (56 URL, liste dans `medias-bloques.txt`) | `CONNECT tunnel failed, response 403` · proxy sortant de la session, `connect_rejected` |
| API de l'application (contrôle de session, MCP) | `https://api.creaflowai.fr/functions/v1/auth-check` | même refus du proxy |
| Mesure d'audience | `https://e.creaflowai.fr/...` | même refus du proxy |
| Tiers (chat, Meta, Cloudflare Turnstile, Sentry, GTM) | `client.crisp.chat`, `connect.facebook.net`, `challenges.cloudflare.com`, `*.ingest.de.sentry.io`, `www.googletagmanager.com` | même refus du proxy |
| L'application elle-même | `https://creaflowai.fr/app` → `/login` | connexion exigée, non tentée par consigne |
| Réponses des FAQ en accordéon | aide, articles | réponses repliées, non dépliées. Seules les questions apparaissent |
| Vidéo YouTube de `/lp-ads-claude02` | id `9mzXoUEnrH4` (relevé dans le code JS) | non ouverte |

Les versions anglaise, espagnole et italienne des pages ne sont pas lues : la version française suffit. Les articles « alternative à … » sont capturés mais pas analysés : ils ne parlent pas de la méthode.

---

## 7. Lecture comparative avec nos studios

Ces points sont tous **DÉDUITS** ; je n'ai pas vu nos rendus dans cette session.

1. **Leur rendu bluffe parce qu'il passe entièrement par le modèle d'image.** Typographie, logo, décor et produit sortent d'un seul jet de Nano Banana 2.1. C'est notre mode « générée entièrement ». Ils l'ont choisi comme mode unique. Ils compensent ses défauts par l'éditeur (« Rendre éditables », calques exacts) et par le remboursement sur signalement.
2. **Leur faille est exactement celle que notre relecture vise.** L'exemple naali, publié en vitrine, mélange « fruits rouges » et « Goût mangue ». La grille capillaire répète un titre et écrit « 4.8/5 ». Une relecture automatique du texte rendu, comparé au texte demandé et à l'étiquette, aurait arrêté ces deux cas. Ils n'en annoncent aucune.
3. **Leur avance tient dans la préparation.** Trois photos de référence par créa ; une fiche produit qui dit « ce que ses photos ne montrent pas » et la « taille réelle » ; une pub source comme gabarit de mise en page ; un texte de carte imposé « mot pour mot ».
4. **En vidéo, ils ont tranché à l'inverse.** Aucun texte n'est jamais dessiné dans l'image, tout est posé au montage. Ils jugent donc que le texte rendu par le modèle n'est pas fiable dans le mouvement.

### Actions proposées

Ces actions n'ont pas été lancées, faute de feu vert du propriétaire.

1. **Comparer côte à côte.** Faire générer par le propriétaire un lot « générée entièrement » chez nous avec la même consigne que l'exemple naali (format ingrédients, accroche en deux niveaux), puis comparer à `exemples/statique-naali-ingredients-1x1.webp` sur les trois critères ouverts : l'étiquette tient-elle, le français est-il juste, y a-t-il du texte parasite. Ce test répond à la question ouverte de `CLAUDE.md`.
2. **Ajouter la cohérence à la relecture.** Vérifier dans `packages/core/src/copie-conforme.ts` que la relecture compare aussi l'accroche aux faits du produit, et pas seulement le texte rendu au texte demandé. Le cas « fruits rouges » contre « Goût mangue » sert de test qui doit échouer. La réussite se mesure ainsi : un test rouge avec ce couple, vert une fois la règle écrite.
3. **Mesurer avant d'adopter.** Mesurer l'effet de 3 photos de référence au lieu d'une sur la fidélité de l'étiquette, sur un petit lot et sous `sousPlafond`, prix annoncé avant le clic.
