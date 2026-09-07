# TikTrends · note de reprise

Ce fichier existe pour qu'une session neuve reparte vite, sans redemander ce qui
a déjà été tranché.

**Il ne décrit jamais un ÉTAT.** Pas de « telle migration est en attente », pas
de « le déploiement date de mardi ». Une note d'état se périme en silence, et
une session s'appuie dessus des heures durant en toute confiance · c'est arrivé,
et la correction a coûté cinq messages. Ici, on dit **où regarder** et **comment
vérifier**.

---

## Les règles qui ne se discutent pas

**La dépense.** Jamais un dollar sans le dire explicitement, et toujours une
barrière. Plafond dur à 10 $ sur 30 jours glissants tant que le produit n'est
pas lancé (`AI_SPEND_CAP_USD`). Toute dépense passe par `sousPlafond`
(`apps/web/lib/spend-guard.ts`) · un test échoue si un chemin la contourne.
Annoncer le prix AVANT le clic, jamais après.

**Un seul sujet à la fois.** Consigne du propriétaire : « on ne passe à rien
d'autre tant que ce n'est pas viable ». Le sujet courant est la **qualité et
l'utilisabilité de Pubs IA**. Ne pas ouvrir de chantier à côté sans son accord.

**Une modification = une PR**, créée ET mergée (squash). Branche de
développement : `claude/epic-allen-ioomsn`.

**Après chaque livraison**, proposer les 3 prochaines grosses améliorations.

**Jamais de secret dans le fil.** Le propriétaire édite `.env.deploy` lui-même
sur le VPS. Aucun accès SSH depuis la session.

## L'interface

Français. Pas de tiret cadratin · utiliser « · ». Styles en ligne uniquement.
Produit en marque blanche : « Trendtrack » n'apparaît jamais à l'écran.
« ADSMAP » s'écrit **Adsmap** dans l'interface ; le code et les tables gardent
leur orthographe.

## Le cap produit, dans ses mots

> « Notre outil doit surtout permettre de créer des créatives winneuses
> (statique et vidéo) et que, de par l'analyse, nous puissions faire et gérer
> les hypothèses, les itérations, afin d'affiner les résultats et trouver plus
> rapidement de nouvelles créatives winneuses. »

---

## Les doctrines, et ce qu'elles ont coûté à apprendre

**Remplacer « penser à faire X » par un test qui échoue quand X n'est pas fait.**
Une consigne s'applique cinq fois sur six, et la sixième est celle qui casse.

**Un garde non éprouvé ne garde rien.** Chaque garde écrit doit être validé en
le faisant TOMBER — on casse volontairement ce qu'il défend, on vérifie qu'il
échoue avec la bonne phrase, on restaure. Plusieurs gardes de ce dépôt sont
passés au vert sur leur première mutation : ils regardaient la mauvaise chose.

**Vérifier un RÉSULTAT, jamais la présence d'un appel.** Trois défauts d'affilée
sont passés sous des gardes verts parce qu'ils vérifiaient qu'une fonction était
appelée quelque part, pas qu'on voyait quoi que ce soit à l'écran. Quand c'est
possible, rendre le composant et lire le HTML (`apps/web/test/assistant-rendu.test.tsx`).

**Regarder l'image.** Ouvrir un rendu répond à des questions que la mesure ne
pose pas.

**Mesurer les seuils, ne jamais les poser d'instinct.** Les valeurs écrites de
tête dans ce dépôt se sont révélées fausses de moitié à trois reprises.
Mesurer, écrire le tableau mesuré dans le module, choisir avec de la marge.

**Comparer à la référence, jamais à zéro.** Un taux d'erreur ne veut rien dire
seul. Minimum d'effectif avant qu'un groupe ait le droit de parler, et
intervalle qui doit exclure le taux général. Le silence est une conclusion
valable, et c'est la plus fréquente.

**Les règles vivent dans `packages/core`** — pur, sans base ni réseau ni modèle,
donc testable. Jamais dans un fichier `'use server'` ni dans du JSX.

---

## Où regarder

Monorepo pnpm + Turborepo dans `product/`. Paquets `core`, `db`, `ai`,
`integrations`, `ui` ; applications `web` (Next.js, App Router) et `workers`.

Portes à passer avant toute PR, depuis `product/` :

```
pnpm -w run typecheck && pnpm -w run lint && pnpm -w run test && pnpm -w run build
```

Le cœur de Pubs IA :

| Quoi | Où |
| --- | --- |
| Assistant en 5 étapes | `apps/web/app/(app)/studio/ads/AssistantPub.tsx` |
| Écran du studio | `apps/web/app/(app)/studio/ads/AdsStudio.tsx` |
| Génération, relecture | `apps/web/app/actions/ads.ts` |
| Composition de la maquette | `apps/web/lib/ad-render.tsx` |
| Règles de l'assistant | `packages/core/src/assistant-pub.ts` |
| Modes de fabrication | `packages/core/src/production-mode.ts` |
| Directions artistiques | `packages/core/src/ad-directions.ts` |
| Contrôle de copie | `packages/core/src/copie-conforme.ts` |
| Cumul des relectures | `packages/core/src/adsmap/bilan-copie.ts` |
| Barrière de dépense | `apps/web/lib/spend-guard.ts` |

`ad-render.tsx` porte un `RENDER_VERSION` qui entre dans la clé de cache S3. Un
test refuse toute modification du fichier sans décider si l'apparence change ·
il dit quoi faire, le suivre.

## Comment vérifier l'état réel

Ne jamais l'affirmer de mémoire. Le serveur est un VPS OVH,
`debian@51.255.39.79`, dépôt dans `/home/debian/tiktrends`. Un timer systemd
(`tiktrends-deploy.timer`) tire et redéploie chaque minute. Le propriétaire a
l'accès SSH, pas la session.

- Migrations appliquées : les compter en base et les comparer à
  `drizzle/meta/_journal.json`.
- Version en ligne : comparer le commit du VPS à `origin/main`.
- Dépense : l'écran Jarvis l'affiche au propriétaire.

## Ce que la session ne peut pas faire

Le proxy sortant bloque `app.tiktrends.co`, CloudFront et fal. Impossible de
lancer une génération, d'ouvrir une image produite, ou de consulter
l'application en ligne. Toute question qui exige de VOIR un rendu doit être
posée au propriétaire · ne jamais conclure à sa place.

## La question encore ouverte

Le mode « générée entièrement » — le modèle d'images produit la publicité
complète, typographie comprise — **n'a jamais traversé fal**. La consigne a été
validée sur l'API d'un concurrent, côte à côte, et jugée meilleure. Elle n'a pas
été exercée en production.

Trois choses à vérifier sur un vrai lot, et une seule personne peut les voir :
l'étiquette du produit tient-elle, le français est-il juste, y a-t-il du texte.

Depuis, la boucle se ferme sans intervention : chaque publicité entière est
relue à sa génération, le constat s'affiche sur sa carte, et le cumul dit quel
moteur réécrit le plus. Mais le premier lot reste à lancer.
