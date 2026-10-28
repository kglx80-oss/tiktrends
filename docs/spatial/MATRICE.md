# Matrice Spatial · écran de la maquette → adresse réelle → rubrique

Table **contraignante**. L'adresse est celle que voit le navigateur (les adresses V5
existantes sont gardées · les liens, favoris et redirections ne cassent pas).
`[id]` = segment dynamique. Les 28 pages de format (`f-…`) partagent une vue
(`/veille/formats/[format]`, rubrique C2).

La colonne « Rubrique » attribue chaque écran à UN chantier (une PR). Le statut
réel d'un écran se lit dans `packages/core/src/spatial/ecrans/` (porté = déclaré
et garde verte), jamais ici.

| Écran maquette | Titre | Section d'accent | Adresse | Rubrique |
| --- | --- | --- | --- | --- |
| `accueil` | Bonjour Kevin | accueil | `/dashboard` | B · Accueil |
| `studios` | Studios | studios | `/studio/projets` | D1 · Studios (liste, création) |
| `prompts` | Prompts conseillés | studios | `/studio/prompts` | D1 · Studios (liste, création) |
| `projet` | Le plaisir du premier plongeon | studios | `/studio/projets/[id]` | D2 · Studios (projet, éditeur, vidéo) |
| `nouveau` | Nouveau projet | studios | `/studio/projets/nouveau` | D1 · Studios (liste, création) |
| `editeur` | Éditeur | studios | `/studio/projets/[id]/image` | D2 · Studios (projet, éditeur, vidéo) |
| `iterer` | Nouvelle itération | studios | `/studio/iterer` | D1 · Studios (liste, création) |
| `veille` | Pubs du moment | veille | `/veille` | C1 · Veille |
| `sauvegardes` | Sauvegardes | veille | `/saved` | C1 · Veille |
| `scale` | Ce qui scale | veille | `/veille/scale` | C1 · Veille |
| `formats` | Tous les formats | veille | `/veille/formats` | C2 · Formats et tendances |
| `tendances` | Tendances | veille | `/veille/tendances` | C2 · Formats et tendances |
| `radar` | Radar | veille | `/radar` | C1 · Veille |
| `resultats` | Résultats | resultats | `/adsmap` | E · Résultats |
| `hypotheses` | Hypothèses | resultats | `/adsmap/hypotheses` | E · Résultats |
| `lots` | Lots de test | resultats | `/adsmap/lots` | E · Résultats |
| `protocole` | Protocole | resultats | `/adsmap/protocole` | E · Résultats |
| `importer` | Importer des résultats | resultats | `/adsmap/import` | E · Résultats |
| `apprentissages` | Apprentissages | resultats | `/adsmap/apprentissages` | E · Résultats |
| `lot1` | Affirmation ou question ? | resultats | `/adsmap/lots/[id]` | E · Résultats |
| `bibliotheque` | Bibliothèque | bibliotheque | `/assets` | F · Bibliothèque, Jarvis, MCP |
| `jarvis` | Jarvis | jarvis | `/jarvis` | F · Bibliothèque, Jarvis, MCP |
| `marque` | Marque | marque | `/brands/[id]` | G · Marque et Réglages |
| `identite` | Identité | marque | `/brands/[id]/identite` | G · Marque et Réglages |
| `offre` | Offre | marque | `/brands/[id]/offre` | G · Marque et Réglages |
| `clients` | Personas | marque | `/brands/[id]/personas` | G · Marque et Réglages |
| `regles` | Règles | marque | `/brands/[id]/regles` | G · Marque et Réglages |
| `reglages` | Espace | reglages | `/settings` | G · Marque et Réglages |
| `equipe` | Équipe | reglages | `/team` | G · Marque et Réglages |
| `connexions` | Connexions | reglages | `/connections` | G · Marque et Réglages |
| `utilisation` | Crédits & factures | reglages | `/usage` | G · Marque et Réglages |
| `admin` | Tour de contrôle | admin | `/admin` | H · Admin |
| `bienvenue` | Bienvenue sur TikTrends | accueil | `/onboarding` | A · Coquille et surcouches |
| `forfaits` | Forfaits & crédits | reglages | `/billing` | G · Marque et Réglages |
| `a-churn` | Churn & rétention | admin | `/admin/churn` | H · Admin |
| `a-revenus` | Revenus & MRR | admin | `/admin/finance` | H · Admin |
| `a-abos` | Forfaits & offres | admin | `/admin/plans` | H · Admin |
| `a-comptes` | Inscriptions & comptes | admin | `/admin/signups` | H · Admin |
| `a-sav` | Tickets SAV | admin | `/admin/sav` | H · Admin |
| `a-couts` | Coûts IA & marges | admin | `/admin/depenses` | H · Admin |
| `a-modeles` | Modèles IA connectés | admin | `/admin/ia-studios` | H · Admin |
| `a-usage` | Usage & tests | admin | `/admin/usage` | H · Admin |
| `a-paiements` | Stripe & Whop | admin | `/admin/paiement` | H · Admin |
| `a-droits` | Rôles & droits | admin | `/admin/equipe` | H · Admin |
| `concurrents` | Concurrents | veille | `/veille/concurrents` | C1 · Veille |
| `mcp` | MCP TikTrends | mcp | `/mcp` | F · Bibliothèque, Jarvis, MCP |
| `boucle` | Boucle d’itération | resultats | `/adsmap/boucle` | E · Résultats |
| `a-prompts` | Bibliothèque IA | admin | `/admin/prompts` | H · Admin |
| `partenaires` | Accès partenaires | reglages | `/settings/partenaires` | G · Marque et Réglages |
| `video` | Collection été · le grand saut | studios | `/studio/projets/[id]/video` | D2 · Studios (projet, éditeur, vidéo) |
| `f-…` (×28) | Pages de format | veille | `/veille/formats/[format]` | C2 · Formats et tendances |

Formats : `avap`, `vs`, `avis`, `callout`, `probsol`, `promo`, `chat`, `mag`, `ugc`, `packshot`, `liste`, `demo`, `benef`, `logo`, `question`, `collage`, `flatlay`, `story`, `notes`, `tweet`, `meme`, `minimal`, `presse`, `chiffre`, `social`, `texte`, `lifestyle`, `trendy`.

## Écrans hors maquette (vague 2)

Gestes de l'ancienne interface sans écran dans la maquette, composés avec les
classes existantes de `spatial.css` (tuiles, `seg subnav`, `.field`, `.chip`…).

| Geste V5 | Adresse | Rubrique |
| --- | --- | --- |
| Produit et références (épinglage, import photo, parcours image, références) | `/studio/projets/[id]/produit` | D2 · Studios |
| Textes liés au brief | `/studio/projets/[id]/textes` | D2 · Studios |
| Identités et voix | `/studio/projets/[id]/identites` | D2 · Studios |
| Exporter l’image | `/studio/projets/[id]/export` | D2 · Studios |
| Nouveau concept créatif | `/studio/projets/nouveau/concept` | D1 · Studios |
| Support de l’espace (ouvrir un ticket, liste, fil, réponse, statut) · vague 4, pages V5 retirées | `/support`, `/support/[id]` | G · Réglages |

## Écrans hors maquette (vague 3 · Admin)

Écrans de l'ancienne interface portés dans la section `admin`, après les douze
entrées de la maquette dans la sous-navigation (`OUTILS_ADMIN`).

| Geste V5 | Adresse | Rubrique |
| --- | --- | --- |
| Registre de prompts (versions, releases, évaluations, routage, traces) · ancien `/admin/ia-studios` | `/admin/prompts/registre` | H · Admin |
| Incidents techniques | `/admin/incidents` | H · Admin |
| Intelligence marché | `/admin/intelligence` | H · Admin |
| Connaissances de l'équipe | `/admin/connaissances` | H · Admin |
| Interrupteurs Studios et budget d'essai | `/admin/studios-interrupteurs` | H · Admin |
| Console (déploiement, tarifs, comptes de test) | `/console` | H · Admin |

## Écrans hors maquette (vague 4 · comptes)

Écrans de l'ancienne interface sans déclaration Spatial, portés puis déclarés
exclusifs (page V5 retirée).

| Geste V5 | Adresse | Rubrique |
| --- | --- | --- |
| Mon profil (photo, nom, confidentialité, mot de passe, espace et accès) | `/profile` | G · Réglages |
| Tagging (échantillon de démonstration non repris · état vide honnête) | `/tags` | G · Réglages (accent Veille) |
