# Clés à brancher · mémo

**Cette page ne dit pas ce qui est branché.** Elle dit ce que chaque clé ouvre,
ce qui se passe sans elle, et **où vérifier**. L'état réel se lit dans
l'application, jamais ici.

Où poser une clé : sur le VPS, dans `/home/debian/tiktrends/product/.env.deploy`
(chargé par `docker-compose.yml` via `env_file`, le MÊME fichier pour le web et
le worker). Le gabarit à jour est `product/.env.deploy.example` · un test
(`apps/web/test/env-recensement.test.ts`) échoue si le code lit une variable
que le gabarit ne déclare pas.

Après avoir ajouté ou modifié une clé :

```bash
cd /home/debian/tiktrends/product
docker compose up -d --build web workers
```

## Où vérifier

| Écran | Qui le voit | Ce qu'il dit |
| --- | --- | --- |
| Réglages → Espace → **Services activés** | administrateurs de l'espace | « Branché » / « À brancher » par capacité (IA, bibliothèque pub, image et vidéo, stockage, e-mails, paiement…), sans nom de variable |
| Réglages → Espace → **Exploitation de la plateforme** | équipe de la plateforme (pouvoirs fondateur) | `CRON_SECRET` présent ou absent, plafond de dépense effectif et sa source, état de chaque capacité Studios, version des consignes publiée ou non |
| Jarvis (fondateur) | fondateur | dépense sur 30 jours, bandeau « Ce serveur » (build, migrations) |
| `/admin/studios-interrupteurs` | équipe (`provider.configure`) | capacités Studios par espace, réglables sans redémarrage |
| `/admin/prompts/registre` | équipe (`prompt.read`) | versions des consignes, releases, publication |

Aucun de ces écrans ne montre la valeur d'une clé · seulement sa présence.

---

## 1. Passages planifiés · `CRON_SECRET`

```
CRON_SECRET=          # une chaîne aléatoire longue
```

**Ouvre** · le worker appelle les routes `/api/cron/*` du web avec ce secret :
remontée Meta (ADSMAP), radar de veille, suivi des concurrents, récap
hebdomadaire, allocations mensuelles des annuels, bascule des forfaits, suivi
des vidéos historiques.

**Sans elle · SILENCIEUX côté interface.** Le worker ne déclenche rien et écrit
seulement `[<tâche>] CRON_SECRET absent · passage non déclenché.`
(`apps/workers/src/adsmap.ts`). Les routes répondent 503 `cron_disabled`.

**Où vérifier** · Réglages → Espace → Exploitation de la plateforme (ligne
« Passages planifiés »), et l'écran Connexions, qui dit que la remontée
planifiée est fermée.

## 2. Plafond de dépense IA · `AI_SPEND_CAP_USD`

```
AI_SPEND_CAP_USD=     # en dollars, 30 jours glissants, web + worker
```

**Ouvre** · fixe le plafond DUR de toute dépense payante (Anthropic, fal),
partagé par le web (`apps/web/lib/spend-guard.ts`) et le worker. Au-delà,
aucune requête payante ne part.

**Sans elle · SILENCIEUX.** Absente, vide, illisible ou négative : repli sur
la valeur par défaut du code (`DEFAULT_CAP_USD` dans `spend-guard.ts`, la même
que `PLAFOND_DEFAUT_USD` du noyau, comparées par test). `0` bloque toute dépense.

**Où vérifier** · Réglages → Espace → Exploitation de la plateforme (ligne
« Plafond de dépense IA » · valeur effective, et « défini » ou « valeur par
défaut »). La dépense courante est sur Jarvis.

## 3. IA rédactionnelle · `ANTHROPIC_API_KEY`

```
ANTHROPIC_API_KEY=
# ANTHROPIC_GEN_MODEL=   # optionnel · laisser commenté, le défaut du code s'applique
```

**Ouvre** · textes et analyses des Studios, Jarvis (assistant), pré-remplissage
de marque, analyse concurrent.

**Sans elle · visible** · « À brancher » dans Services activés ; les gestes
concernés le disent.

## 4. Images, clips et contrôle de la parole · `FAL_KEY` + stockage

```
FAL_KEY=
```

**Ouvre** · la génération des Studios (images, clips animés depuis l'image
clé, contrôle de la parole des prises), payée à l'usage chez le fournisseur.

**Le worker Studios exige AUSSI le stockage** (section 5) · sans `FAL_KEY` ou
sans les quatre `S3_*`, il ne démarre pas son fournisseur et écrit
`worker studio non démarré, jobs laissés en file, rien facturé.`
(`packages/core/src/studios/fournisseurs/choix.ts`).

Modèles · optionnels, laisser vides (défauts du code) :

```
FAL_IMAGE_MODEL=          # génération sans référence
FAL_IMAGE_MODEL_EDIT=     # mise en scène produit
FAL_VIDEO_MODEL_STUDIO=   # animation des plans · vide = Kling 2.5 turbo pro
```

`FAL_VIDEO_MODEL_STUDIO` est choisi parmi le catalogue chiffré
(`packages/core/src/studios/fournisseurs/catalogue-video.ts`) · un modèle hors
catalogue est refusé au devis (« modèle vidéo non chiffré au catalogue »).
`FAL_VIDEO_MODEL_I2V` ne pilote PAS les Studios · si elle est posée sans
`FAL_VIDEO_MODEL_STUDIO`, le worker le dit au démarrage.

**Une clé ne suffit pas** · les capacités payantes sont coupées par défaut
(section 6) et rien ne tourne sans consignes publiées (section 7).

## 5. Stockage objet · `S3_*` (OVH Object Storage)

```
S3_ENDPOINT=s3.gra.io.cloud.ovh.net      # hôte du service (sans https://)
S3_REGION=gra
S3_BUCKET=tiktrends-media
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=                       # optionnel (CDN)
```

**Ouvre** · upload direct des gros fichiers dans la Bibliothèque, et la
conservation des résultats des Studios (déposés puis relus par le worker).

**Prérequis du bucket · objets PRIVÉS.** L'application lit par liens signés
(`packages/integrations/src/storage.ts`) · **ne jamais rendre le bucket
public**. Seul le CORS est à poser (méthode PUT depuis `APP_URL`) : le bouton
« Configurer le stockage privé (CORS) » de Réglages → Espace → Stockage le fait,
puis « tester » vérifie la lecture signée et le refus des accès anonymes.

**Sans elles · visible** · « À brancher » dans Services activés, le panneau
Stockage dit quoi poser. Le worker Studios ne démarre pas (section 4).

## 6. Capacités Studios · interrupteurs

Coupées par défaut (`packages/core/src/studios/interrupteurs.ts`) :
`generation_image`, `controle_visuel`, `video`, `voix`, `shadow`,
`benchmark_reel`. Le reste (projets, éditeur, textes, export, canvas,
propositions, identités) est ouvert.

Trois façons de les ouvrir :

```
STUDIOS_CAPACITES_GENERALES=      # tous les espaces (ex. generation_image,video)
STUDIOS_ESPACES_PILOTES=          # identifiants d'espace
STUDIOS_CAPACITES_PILOTES=        # capacités ouvertes aux seuls espaces pilotes
STUDIOS_CAPACITES_COUPEES=        # coupure d'urgence, l'emporte sur tout
```

ou l'écran `/admin/studios-interrupteurs` (réglage en base, par espace, sans
redémarrage). `benchmark_reel` ne s'ouvre que par `STUDIOS_CAPACITES_GENERALES`.

**Sans elles · visible au geste** · un geste coupé répond « … · non activé pour
cet espace. Rien n'a été écrit ni débité. » **Où vérifier** · Réglages →
Espace → Exploitation de la plateforme (état et source de chaque capacité pour
l'espace courant), ou l'écran des interrupteurs pour un autre espace.

## 7. Consignes IA des Studios · publier une version

Pas une clé, une **action** · sur `/admin/prompts/registre`, importer le pack,
valider les versions, créer une release, l'évaluer, puis la **publier**
(onglet Releases). En production, une release ne devient active qu'approuvée
sur son empreinte (benchmark, ou recette manuelle nominative) ·
`apps/web/lib/studios/prompts/environnement.ts`.

**Sans version publiée · toute tâche IA des Studios est refusée**
(`RELEASE_ACTIVE_ABSENTE` · « Aucune release globale publiée · aucun prompt de
repli », `apps/web/lib/studios/prompts/resolveur.ts`). Une release révoquée
refuse de même.

**Où vérifier** · Réglages → Espace → Exploitation de la plateforme (ligne
« Consignes IA des Studios »), ou l'onglet Releases du registre.

## 8. Courriels · `SMTP_URL`

```
SMTP_URL=             # smtp://utilisateur:motdepasse@hote:587
# MAIL_FROM=          # optionnel · laisser commenté, le défaut du code s'applique
```

**Ouvre** · bienvenue, invitation, réinitialisation de mot de passe, courriels
du récap hebdomadaire.

**Sans elle · SILENCIEUX pour l'utilisateur.** Chaque envoi est sauté, une ligne
`[mail:skip]` au journal web (`apps/web/lib/mailer.ts`) · le récap répond 503
`smtp_absent` (voir plus bas). **Où vérifier** · « À brancher » dans Services
activés (ligne « E-mails transactionnels »).

## 9. Autres intégrations

| Variable(s) | Ouvre | Sans elle |
| --- | --- | --- |
| `TRENDTRACK_API_KEY` | Veille, suivis, analyse concurrent (bibliothèque pub) | « À brancher » dans Services activés |
| `META_APP_ID`, `META_APP_SECRET` | connexion Meta en un clic, remontée ADSMAP | pas de connexion Meta en un clic · la remontée planifiée exige AUSSI `CRON_SECRET` |
| `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET` | connexion Shopify en un clic | pas de connexion Shopify en un clic |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_API_KEY`, `GOOGLE_APP_ID` | dossier Google Drive (synchro assets) | pas de connexion Google Drive |
| `TOKEN_ENC_KEY` | chiffrement dédié des jetons stockés | repli silencieux sur `AUTH_SECRET` |
| `KLAVIYO_API_KEY` | e-mails marketing (profils, flows) | chaque événement sauté (`[klaviyo:skip]`), « À brancher » dans Services activés |
| `STRIPE_*` | paiement, abonnements (prix détaillés dans le gabarit) | `/billing` dit « paiement pas encore disponible » |
| `HIGGSFIELD_API_KEY` | ancien moteur vidéo · seulement le suivi des vidéos historiques encore en cours | « À brancher » dans Services activés |
| `SLACK_BOT_TOKEN` | messagerie d'équipe (à venir) | « À brancher » dans Services activés |

## Admin+ · `FOUNDER_EMAILS` n'ouvre plus rien

Décision du propriétaire (« Codé seul », suivi de #1115) · les pouvoirs
fondateur sont réservés aux fondateurs **inscrits dans le code**
(`apps/web/lib/founder.ts`, liste `FONDATEURS`, règle `pouvoirFondateur` du
noyau). Raison · aucun e-mail n'est vérifié à la création d'un compte.

La variable est encore lue, **sans pouvoir** · un compte dont l'adresse y
figure lit, sur `/admin/equipe`, pourquoi il n'a rien. Elle peut rester vide.
Pour un membre de l'équipe sans pouvoirs fondateur : `/admin/equipe` une fois
son compte créé.

---

### Rappel sécurité

Ne jamais committer `.env.deploy` ni coller une clé dans le chat ou le code.
Les écrans ne montrent que **présent / absent**, jamais la valeur · un test de
rendu (`apps/web/test/reglages-exploitation-rendu.test.tsx`) échoue si une
valeur secrète apparaît.

## Récapitulatif hebdomadaire

`/api/cron/digest` · une fois par semaine, le lundi à 07:47 heure de Paris.

**Le worker le planifie lui-même** (tâche `weekly-digest`, motif et fuseau dans
`packages/core/src/adsmap/recap-hebdo-planifie.ts`) · aucune crontab à poser.
S'il en reste une sur la machine qui tape cette route (`crontab -l`,
`/etc/cron.d/`), **la retirer** : elle ne doublerait rien (verrou
`digest:<semaine ISO>` dans `app_settings`, qui note chaque destinataire servi),
mais la lettre partirait à l'heure de celui des deux qui arrive le premier.

**Sans `CRON_SECRET`**, le worker ne l'appelle pas et l'endpoint répond 503 ·
il est fermé par défaut.

Un passage en échec répond 500 et le worker le retente (6 tentatives, attente
exponentielle depuis 1 min) · la reprise ne sert que ce qui manque. Un passage
encore en cours (409) est revérifié toutes les 16 min, au plus 10 fois, sans
consommer de tentative. Un passage tué par un redéploiement est repris une fois
son verrou muet depuis 15 min. Un courriel refusé définitivement (5xx au RCPT
avec un code du destinataire 5.1.1/2/3/6/10 · boîte inexistante) est noté
abandonné, une ligne dans le journal web, et le worker écrit une ALERTE
« abandonnés ». Si au moins 3 de ces refus dépassent les envois réussis,
personne n'est abandonné (cause commune probable : relais, quota) · la semaine
reste interrompue et le worker écrit `[digest] ALERTE · disjoncteur des
courriels …` sans retenter.

**Sans `SMTP_URL`** · les notifications de l'application partent, aucun
courriel n'est tenté, la route répond 503 `smtp_absent` et le worker écrit UNE
ligne `[digest] SMTP non configuré · lettres servies dans l'application ·
courriels non envoyés`, sans retente ni ALERTE. Une fois `SMTP_URL` posée (et
le conteneur web redémarré), un appel à la main la même semaine envoie les
courriels sans redoubler les notifications.

Si la semaine reste non servie, le journal du worker l'écrit en clair :
`[digest] ALERTE · récap hebdomadaire NON SERVI …` (ou `NON CONFIRMÉ` si le
job a été perdu · vérifier alors le verrou `digest:<semaine>` dans
`app_settings`).

Il ne dépense **rien** : la lettre est calculée à partir de comptes, jamais
rédigée par un modèle. Et il n'envoie pas de lettre aux marques dont la semaine
n'a rien porté.

## Migrations · où en est la base

**Cette page ne dit pas ce qui est appliqué.** Un document ne peut pas savoir ce
qu'une base a exécuté. Deux endroits le savent, et un seul suffit :

**Dans l'application** · le bloc de déploiement de la page Jarvis (fondateur).
Il affiche la version de maquette, l'empreinte du build et le retard de
migrations, et il le lit à chaque chargement.

**En ligne de commande** :

```bash
cd ~/tiktrends/product
docker compose exec -T db psql -U tiktrends -d tiktrends \
  -c "select count(*) from drizzle.__drizzle_migrations;"
```

Le compte doit égaler `MIGRATIONS_IN_BUILD` (`packages/db/src/journal.ts`), que
le déploiement embarque et qu'un test compare au journal Drizzle. S'il est plus
bas, il en manque.

### Appliquer ce qui manque

C'est fait automatiquement à chaque déploiement (voir `ops/README.md`). À la
main, c'est la même commande :

```bash
docker compose exec -T -w /app workers pnpm --filter @tiktrends/db migrate
```

Drizzle n'applique que les nouvelles, dans l'ordre. La relancer ne fait rien.

### Une seule migration mérite un mot

`0045_backfill_ad_source_ref` rattrape l'historique. Elle ne devine rien : elle
ne relie une ad à sa génération que là où la trace `adsmapAdId` existe déjà,
écrite par la passerelle au moment de la création. Elle ne remplace jamais un
lien, et un second passage affiche `UPDATE 0`.

Les ads importées, venues de la veille ou saisies à la main restent sans lien ·
c'est correct, elles n'ont jamais eu de génération.

## Savoir ce qui tourne

La page Jarvis affiche, pour le fondateur, un bandeau « Ce serveur » : version de
maquette, migrations appliquées sur migrations embarquées, et empreinte du build.

L'empreinte vient de `BUILD_SHA`, passé au build par le déploiement
(`docker-compose.yml`, `args`) puis exposé à l'application
(`ENV BUILD_SHA=$BUILD_SHA` dans le Dockerfile) · ce n'est pas une variable de
`.env.deploy`.

**Sans elle, le reste fonctionne** · le bandeau dit simplement « build
inconnu ». Ce qui compte le plus est le compte de migrations : il vire à
l'orange dès qu'une migration embarquée n'est pas appliquée, et c'est
exactement l'état où le code attend des colonnes que la base n'a pas.
