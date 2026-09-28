# Inventaire des routes · harmonisation UX (post Pubs IA)

Relevé documentaire pour enchaîner les lots bornés après `/studio/ads` (fait,
#689). Chaque route est classée par sa place dans la boucle d'itération
**observer → hypothèse → tester → créer → mesurer**. On harmonise sur la
grammaire sobre de Pubs IA (fond uni, en-tête court, une action dominante,
création secondaire quand ce n'est pas un studio, preuve/source visible quand
elle existe, responsive 1200/32-16, cibles 44, pas de KPI ni recommandation
inventés). Ce fichier ne décrit pas d'ÉTAT ; il dit où regarder.

Chemins réels sous `apps/web/app/(app)/`.

## Observer (entrée d'analyse)

| Route | Rôle dans la boucle | Donnée réelle | Priorité |
| --- | --- | --- | --- |
| `/dashboard` | Point d'entrée · doit faire ressortir la **prochaine itération** | Parcours (`onboardingState` → `journey`+`relance`), marque, crédits. Les cartes « Aperçu créas » sont un **échantillon** (`buildDashboard` lit des fixtures), signalé par un bandeau. | **Prochain lot** |
| `/veille`, `/veille/scale` | Observer concurrents / ce qui scale | Connecteurs vérifiés, créas observées | haute |
| `/radar`, `/adsmap/radar` | Radar produits / marques suivies | événements typés, fraîcheur | moyenne |

## Hypothèse / mémoire

| Route | Rôle | Donnée réelle | Priorité |
| --- | --- | --- | --- |
| `/jarvis`, `/jarvis/sources` | Ce que la catégorie a appris · alimente le défaut moteur/mode | mémoire Jarvis (règles maison, taux validé vs historique) | moyenne |
| `/adsmap/jarvis` | Vue Jarvis côté Adsmap | idem | basse |

## Tester / arbitrer / mesurer

| Route | Rôle | Donnée réelle | Priorité |
| --- | --- | --- | --- |
| `/adsmap` (+ `/lots`, `/suites`, `/protocole`, `/tri`, `/import`) | Cœur mesure / verdict / arbitrage | verdicts (`computed`/`validated`), protocole en %, lots | haute |
| `/analytics` | Mesurer / attribuer les KPI agrégés | métriques agrégées (réelles si compte branché, échantillon sinon) | haute |

## Créer (fratrie studio)

| Route | Rôle | Note | Priorité |
| --- | --- | --- | --- |
| `/studio` | Hub des studios | grammaire à aligner sur Pubs IA | moyenne |
| `/studio/ads` | Pubs IA | **fait (#689)** — référence | — |
| `/studio/image`, `/studio/video`, `/studio/textes` | Créer image / vidéo / textes | grammaire quasi identique à Pubs IA · risque faible | moyenne |

## Bibliothèque / entités

`/saved`, `/assets`, `/tags`, `/brands` (+ `/[id]`, `/[id]/competitors/[name]`,
`/new`), `/connections` · supports de la boucle (sauvegardes, médias, marques,
branchements de comptes). Priorité basse à moyenne.

## Compte / facturation / support (hors boucle créative)

`/profile`, `/settings`, `/billing`, `/credits`, `/usage`, `/team`,
`/support` (+ `/[id]`), `/console` · cohérence visuelle seulement, aucune
logique métier à toucher.

## Admin (interne, hors périmètre client)

`/admin` + `depenses`, `equipe`, `finance`, `incidents`, `intelligence`,
`paiement`, `plans`, `signups` · priorité basse (écrans internes).

## Règles qui restent valables partout

- Pas de KPI ni de recommandation inventés · ne montrer que ce qui est mesuré,
  et étiqueter honnêtement l'échantillon quand aucun compte n'est branché.
- Ne pas supprimer de fonction ni changer moteur / permissions / prix.
- Accès de création **secondaires** hors studios ; la preuve / source visible
  quand elle existe.
- Aucune génération payante, aucune mutation de production pour la recette.
