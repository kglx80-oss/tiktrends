# Matrice Spatial · écran de la maquette → adresse réelle → vue

Table **contraignante**. L'adresse est celle que voit le navigateur (les adresses
historiques sont gardées · les liens, favoris et redirections ne cassent pas).
`[id]` = segment dynamique. Les 28 pages de format (`f-…`) partagent une vue
(`/veille/formats/[format]`, rubrique C2).

Spatial est la seule interface · chaque adresse ci-dessous est un écran **porté**,
servi par `app/(spatial)/sp/<adresse>/page.tsx` qui rend la vue indiquée
(`product/apps/web/spatial/vues/…`). Relevé sur `main` le 29/10/2026 (`2682062`) ·
82 chemins déclarés, 82 pages, aucune adresse « à porter ». Pour revérifier, ne pas
se fier à cette table · la liste qui fait foi est
`packages/core/src/spatial/ecrans/`, et la garde `spatial-fondation` (« écrans
portés ⇔ pages de l'arbre ») refuse un chemin déclaré sans page comme une page
sans déclaration. La colonne « Rubrique » dit quel chantier a porté l'écran.

| Écran maquette | Titre | Section d'accent | Adresse | Rubrique | Vue (`spatial/vues/`) |
| --- | --- | --- | --- | --- | --- |
| `accueil` | Bonjour Kevin | accueil | `/dashboard` | B · Accueil | `accueil/Accueil.tsx` (+ `Analytics.tsx`) |
| `studios` | Studios | studios | `/studio/projets` | D1 · Studios (liste, création) | `studios/Studios.tsx` |
| `prompts` | Prompts conseillés | studios | `/studio/prompts` | D1 · Studios (liste, création) | `studios/Prompts.tsx` |
| `projet` | Le plaisir du premier plongeon | studios | `/studio/projets/[id]` | D2 · Studios (projet, éditeur, vidéo) | `projet/Projet.tsx` |
| `nouveau` | Nouveau projet | studios | `/studio/projets/nouveau` | D1 · Studios (liste, création) | `studios/NouveauProjet.tsx` |
| `editeur` | Éditeur | studios | `/studio/projets/[id]/image` | D2 · Studios (projet, éditeur, vidéo) | `projet/Editeur.tsx` |
| `iterer` | Nouvelle itération | studios | `/studio/iterer` | D1 · Studios (liste, création) | `studios/Iterer.tsx` |
| `veille` | Pubs du moment | veille | `/veille` | C1 · Veille | `veille/PubsDuMoment.tsx` |
| `sauvegardes` | Sauvegardes | veille | `/saved` | C1 · Veille | `veille/Sauvegardes.tsx` |
| `scale` | Ce qui scale | veille | `/veille/scale` | C1 · Veille | `veille/CeQuiScale.tsx` |
| `formats` | Tous les formats | veille | `/veille/formats` | C2 · Formats et tendances | `formats/TousLesFormats.tsx` |
| `tendances` | Tendances | veille | `/veille/tendances` | C2 · Formats et tendances | `formats/Tendances.tsx` |
| `radar` | Radar | veille | `/radar` | C1 · Veille | `veille/Radar.tsx` |
| `resultats` | Résultats | resultats | `/adsmap` | E · Résultats | `resultats/VueEnsemble.tsx` |
| `hypotheses` | Hypothèses | resultats | `/adsmap/hypotheses` | E · Résultats | `resultats/Hypotheses.tsx` |
| `lots` | Lots de test | resultats | `/adsmap/lots` | E · Résultats | `resultats/Lots.tsx` |
| `protocole` | Protocole | resultats | `/adsmap/protocole` | E · Résultats | `resultats/Protocole.tsx` |
| `importer` | Importer des résultats | resultats | `/adsmap/import` | E · Résultats | `resultats/Importer.tsx` |
| `apprentissages` | Apprentissages | resultats | `/adsmap/apprentissages` | E · Résultats | `resultats/Apprentissages.tsx` |
| `lot1` | Affirmation ou question ? | resultats | `/adsmap/lots/[id]` | E · Résultats | `resultats/Lot.tsx` |
| `bibliotheque` | Bibliothèque | bibliotheque | `/assets` | F · Bibliothèque, Jarvis, MCP | `bibliotheque/Bibliotheque.tsx` |
| `jarvis` | Jarvis | jarvis | `/jarvis` | F · Bibliothèque, Jarvis, MCP | `jarvis/Jarvis.tsx` |
| `marque` | Marque | marque | `/brands/[id]` | G · Marque et Réglages | `marque/Marque.tsx` |
| `identite` | Identité | marque | `/brands/[id]/identite` | G · Marque et Réglages | `marque/Identite.tsx` |
| `offre` | Offre | marque | `/brands/[id]/offre` | G · Marque et Réglages | `marque/Offre.tsx` |
| `clients` | Personas | marque | `/brands/[id]/personas` | G · Marque et Réglages | `marque/Personas.tsx` |
| `regles` | Règles | marque | `/brands/[id]/regles` | G · Marque et Réglages | `marque/Regles.tsx` |
| `reglages` | Espace | reglages | `/settings` | G · Marque et Réglages | `reglages/Espace.tsx` |
| `equipe` | Équipe | reglages | `/team` | G · Marque et Réglages | `reglages/Equipe.tsx` |
| `connexions` | Connexions | reglages | `/connections` | G · Marque et Réglages | `reglages/Connexions.tsx` |
| `utilisation` | Crédits & factures | reglages | `/usage` | G · Marque et Réglages | `reglages/Utilisation.tsx` |
| `admin` | Tour de contrôle | admin | `/admin` | H · Admin | `admin/TourDeControle.tsx` |
| `bienvenue` | Bienvenue sur TikTrends | accueil | `/onboarding` | A · Coquille et surcouches | `coquille/Bienvenue.tsx` (+ `ParcoursAccueil.tsx`) |
| `forfaits` | Forfaits & crédits | reglages | `/billing` | G · Marque et Réglages | `reglages/Forfaits.tsx` |
| `a-churn` | Churn & rétention | admin | `/admin/churn` | H · Admin | `admin/Churn.tsx` |
| `a-revenus` | Revenus & MRR | admin | `/admin/finance` | H · Admin | `admin/Revenus.tsx` |
| `a-abos` | Forfaits & offres | admin | `/admin/plans` | H · Admin | `admin/Forfaits.tsx` |
| `a-comptes` | Inscriptions & comptes | admin | `/admin/signups` | H · Admin | `admin/Comptes.tsx` |
| `a-sav` | Tickets SAV | admin | `/admin/sav` | H · Admin | `admin/Sav.tsx` |
| `a-couts` | Coûts IA & marges | admin | `/admin/depenses` | H · Admin | `admin/Couts.tsx` |
| `a-modeles` | Modèles IA connectés | admin | `/admin/ia-studios` | H · Admin | `admin/Modeles.tsx` |
| `a-usage` | Usage & tests | admin | `/admin/usage` | H · Admin | `admin/UsageTests.tsx` |
| `a-paiements` | Stripe & Whop | admin | `/admin/paiement` | H · Admin | `admin/Paiements.tsx` |
| `a-droits` | Rôles & droits | admin | `/admin/equipe` | H · Admin | `admin/Droits.tsx` |
| `concurrents` | Concurrents | veille | `/veille/concurrents` | C1 · Veille | `veille/Concurrents.tsx` |
| `mcp` | MCP TikTrends | mcp | `/mcp` | F · Bibliothèque, Jarvis, MCP | `mcp/Mcp.tsx` |
| `boucle` | Boucle d’itération | resultats | `/adsmap/boucle` | E · Résultats | `resultats/Boucle.tsx` |
| `a-prompts` | Bibliothèque IA | admin | `/admin/prompts` | H · Admin | `admin/Prompts.tsx` |
| `partenaires` | Accès partenaires | reglages | `/settings/partenaires` | G · Marque et Réglages | `reglages/Partenaires.tsx` |
| `video` | Collection été · le grand saut | studios | `/studio/projets/[id]/video` | D2 · Studios (projet, éditeur, vidéo) | `projet/Video.tsx` |
| `f-…` (×28) | Pages de format | veille | `/veille/formats/[format]` | C2 · Formats et tendances | `formats/PageFormat.tsx` |

Formats : `avap`, `vs`, `avis`, `callout`, `probsol`, `promo`, `chat`, `mag`, `ugc`, `packshot`, `liste`, `demo`, `benef`, `logo`, `question`, `collage`, `flatlay`, `story`, `notes`, `tweet`, `meme`, `minimal`, `presse`, `chiffre`, `social`, `texte`, `lifestyle`, `trendy`.

## Écrans hors maquette (vague 2)

Gestes de l'ancienne interface sans écran dans la maquette, composés avec les
classes existantes de `spatial.css` (tuiles, `seg subnav`, `.field`, `.chip`…).

| Geste de l’ancienne interface | Adresse | Rubrique | Vue (`spatial/vues/`) |
| --- | --- | --- | --- |
| Produit et références (épinglage, import photo, parcours image, références) | `/studio/projets/[id]/produit` | D2 · Studios | `projet/Produit.tsx` |
| Textes liés au brief | `/studio/projets/[id]/textes` | D2 · Studios | `projet/Textes.tsx` |
| Identités et voix | `/studio/projets/[id]/identites` | D2 · Studios | `projet/Identites.tsx` |
| Exporter l’image | `/studio/projets/[id]/export` | D2 · Studios | `projet/Export.tsx` |
| Nouveau concept créatif | `/studio/projets/nouveau/concept` | D1 · Studios | `studios/NouveauConcept.tsx` |
| Support de l’espace (ouvrir un ticket, liste, fil, réponse, statut) · vague 4, pages V5 retirées | `/support`, `/support/[id]` | G · Réglages | `reglages/Support.tsx` |

## Écrans hors maquette (vague 3 · Admin)

Écrans de l'ancienne interface portés dans la section `admin`, après les douze
entrées de la maquette dans la sous-navigation (`OUTILS_ADMIN`).

| Geste de l’ancienne interface | Adresse | Rubrique | Vue (`spatial/vues/`) |
| --- | --- | --- | --- |
| Registre de prompts (versions, releases, évaluations, routage, traces) · ancien `/admin/ia-studios` | `/admin/prompts/registre` | H · Admin | `admin/Registre.tsx` |
| Incidents techniques | `/admin/incidents` | H · Admin | `admin/Incidents.tsx` |
| Intelligence marché | `/admin/intelligence` | H · Admin | `admin/Intelligence.tsx` |
| Connaissances de l'équipe | `/admin/connaissances` | H · Admin | `admin/Connaissances.tsx` |
| Interrupteurs Studios et budget d'essai | `/admin/studios-interrupteurs` | H · Admin | `admin/Interrupteurs.tsx` |
| Crédits & marges (barème, coût réel × markup, marge nette après IS, pire cas, historique de l’espace) · vague 4, page V5 retirée | `/credits` | H · Admin | `admin/CreditsMarges.tsx` |
| Console (déploiement, tarifs, comptes de test) | `/console` | H · Admin | `admin/Console.tsx` |

## Écrans hors maquette (vague 4 · comptes)

Écrans de l'ancienne interface sans déclaration Spatial, portés puis leur page
V5 retirée (l'ancienne interface est depuis entièrement retirée).

| Geste de l’ancienne interface | Adresse | Rubrique | Vue (`spatial/vues/`) |
| --- | --- | --- | --- |
| Mon profil (photo, nom, confidentialité, mot de passe, espace et accès) | `/profile` | G · Réglages | `reglages/Profil.tsx` |
| Tagging (échantillon de démonstration non repris · état vide honnête) | `/tags` | G · Réglages (accent Veille) | `reglages/Tagging.tsx` |

## Autres adresses portées hors maquette

Écrans de l'ancienne interface sans fragment de maquette, déclarés dans
`ecrans/` et servis par Spatial (classes existantes de `spatial.css`).

| Écran | Adresse | Section d'accent | Vue (`spatial/vues/`) |
| --- | --- | --- | --- |
| Sources de Jarvis | `/jarvis/sources` | jarvis | `jarvis/Sources.tsx` |
| Jarvis · depuis la Veille | `/jarvis/veille` | jarvis | `jarvis/JarvisVeille.tsx` |
| Marques (liste de l'espace) | `/brands` | marque | `marque/ListeMarques.tsx` |
| Nouvelle marque | `/brands/new` | marque | `marque/NouvelleMarque.tsx` |
| Rapport d'un concurrent | `/brands/[id]/competitors/[name]` | veille | `veille/RapportConcurrent.tsx` |
| Tous les tests | `/adsmap/tests` | resultats | `resultats/Tests.tsx` |
| Fiche d'un test | `/adsmap/tests/[id]` | resultats | `resultats/FicheTest.tsx` |
| À décider | `/adsmap/decisions` | resultats | `resultats/Decisions.tsx` |
| Carte | `/adsmap/carte` | resultats | `resultats/Carte.tsx` |
| Partager au client | `/adsmap/partage` | resultats | `resultats/Partage.tsx` |
| Suites | `/adsmap/suites` | resultats | `resultats/Suites.tsx` |
| Tri des propositions | `/adsmap/tri` | resultats | `resultats/Tri.tsx` |
| Radar des concurrents | `/adsmap/radar` | resultats | `resultats/RadarAdsmap.tsx` |
| Essais et relectures | `/adsmap/essais` | resultats | `resultats/Essais.tsx` |
| Ancien Jarvis d'Adsmap · 307 du middleware vers `/jarvis` (`REDIRECTIONS_SERVEUR`), la page Spatiale n'est qu'un filet `redirect()` | `/adsmap/jarvis` | resultats | aucune |
