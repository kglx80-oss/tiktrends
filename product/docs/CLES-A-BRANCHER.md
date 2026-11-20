# Clés à brancher — mémo

Où : sur le VPS, dans `/home/debian/tiktrends/product/.env.deploy`
(le fichier chargé par `docker-compose.yml` via `env_file`).

Après avoir ajouté/modifié une clé :

```bash
cd /home/debian/tiktrends/product
docker compose up -d --build web workers
```

Le tableau **Réglages → Intégrations serveur** (dans l'app, espace admin) affiche
en direct ce qui est **BRANCHÉ** / **À BRANCHER**.

---

## 1. IA — Claude (Anthropic) — priorité n°1

```
ANTHROPIC_API_KEY=sk-ant-...
```

Débloque d'un coup :
- Studio IA (angles, hooks, script, textes)
- Assistant conversationnel de la home + bulle d'aide
- Pré-remplissage de marque depuis le site
- Import produits depuis le site
- Analyse concurrent (hooks, angles, USP…)

Modèles (optionnel, valeurs par défaut sinon) :
```
ANTHROPIC_GEN_MODEL=claude-sonnet-5
```

## 2. Image IA — Fal.ai (Flux / Ideogram)

```
FAL_KEY=...
```

Active le **Studio → Image IA** (texte → image, mise en scène produit, texte lisible).
Paiement à l'usage chez Fal (~2 à 8 centimes/image selon le modèle).

Options (valeurs par défaut sinon) :
```
FAL_IMAGE_MODEL=fal-ai/nano-banana-2             # texte -> image (réaliste)
FAL_IMAGE_MODEL_I2I=fal-ai/flux/dev/image-to-image
FAL_IMAGE_MODEL_TEXT=fal-ai/ideogram/v3          # image avec texte lisible
FAL_IMAGE_MODEL_EDIT=fal-ai/nano-banana-2/edit   # mise en scène produit : proportions + réalisme
```

**La vidéo passe aussi par cette clé Fal** · image ET vidéo avec une seule clé.

Ancien « Vidéo IA » uniquement (défaut Kling 2.5 turbo pro) · ces deux variables
ne pilotent PLUS les Studios :
```
FAL_VIDEO_MODEL=fal-ai/kling-video/v2.5-turbo/pro/text-to-video
FAL_VIDEO_MODEL_I2V=fal-ai/kling-video/v2.5-turbo/pro/image-to-video
FAL_QUEUE_URL=https://queue.fal.run
```

Studios (animation des plans) · variable PROPRE, choisie parmi le catalogue
chiffré (`packages/core/src/studios/fournisseurs/catalogue-video.ts`) :
```
FAL_VIDEO_MODEL_STUDIO=                                    # vide = Kling 2.5 turbo pro (5 ou 10 s, muet, 0,07 $/s)
# FAL_VIDEO_MODEL_STUDIO=fal-ai/veo3.1/fast/image-to-video  # 4/6/8 s, 0,10 $/s muet, 0,15 $/s avec voix
# FAL_VIDEO_MODEL_STUDIO=fal-ai/veo3.1/lite/image-to-video  # 4/6/8 s, 720p 0,03 / 0,05 $/s, 1080p 0,05 / 0,08 $/s
```
Un modèle hors de ce catalogue est refusé au devis (« modèle vidéo non chiffré
au catalogue »). Kling 2 master n'est plus recommandé pour les Studios. Si
`FAL_VIDEO_MODEL_I2V` est posée sans `FAL_VIDEO_MODEL_STUDIO`, le worker le dit
au démarrage et les Studios utilisent Kling 2.5 turbo pro. La voix française de
Veo est à valider à l'écoute sur un premier clip.

## 3. Vidéo IA — Higgsfield (optionnel)

`FAL_KEY` suffit pour la vidéo (Kling). Higgsfield reste **optionnel** : ne le
branche que si tu veux ses contrôles caméra/presets spécifiques. Si `FAL_KEY`
est présente, c'est Fal (Kling) qui est utilisé en priorité.

```
HIGGSFIELD_API_KEY=...
```

Active la section **Vidéo IA** du Studio (texte → vidéo verticale).

Options si le contrat d'API l'exige (à confirmer avec la doc Higgsfield) :
```
HIGGSFIELD_API_SECRET=          # si auth « Key id:secret »
HIGGSFIELD_BASE_URL=            # def: https://platform.higgsfield.ai
HIGGSFIELD_T2V_PATH=            # def: /v1/text2video  (texte → vidéo)
HIGGSFIELD_I2V_PATH=            # def: /v1/image2video (image → vidéo)
HIGGSFIELD_JOB_PATH=            # def: /v1/jobs   (statut: {JOB_PATH}/{id})
HIGGSFIELD_MODEL=              # optionnel
```

> Le code lit ces variables : si l'endpoint réel diffère des valeurs par défaut,
> il suffit d'ajuster `HIGGSFIELD_BASE_URL` / `..._T2V_PATH` / `..._JOB_PATH`
> dans `.env.deploy`, **sans toucher au code**.

## 2 bis. ADMIN+ — vue plateforme (fondateur)

```
FOUNDER_EMAILS=kguilbaux@agence-glx.fr
```

Débloque la **vue plateforme** dans ADMIN+ (MRR, churn, tous les espaces).
Sans cette variable, personne ne voit les données globales (sécurité multi-tenant).
Plusieurs fondateurs : séparer par des virgules.

## 3. Bibliothèque pub — Trendtrack (déjà branché)

```
TRENDTRACK_API_KEY=...
```

Alimente l'Inspo, les suivis et l'analyse concurrent.

## 4. (Plus tard) E-mail — notifications

```
SMTP_URL=smtp://user:pass@host:587
```

## 5. (Plus tard) Slack

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

## 5bis. Stockage objet — OVH Object Storage (S3)

Active l'upload direct des gros fichiers (rushs vidéo jusqu'à 1 Go) dans **Assets**.

```
S3_ENDPOINT=s3.gra.io.cloud.ovh.net      # hôte du service (sans https://)
S3_REGION=gra                            # gra, sbg, de, uk…
S3_BUCKET=tiktrends-media
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_PUBLIC_BASE_URL=                       # optionnel (CDN) · défaut https://{endpoint}/{bucket}
```

Prérequis côté bucket / conteneur :
- **Lecture publique** des objets (pour afficher images/vidéos dans l'app).
- **CORS** autorisant la méthode **PUT** depuis `APP_URL` (upload direct navigateur).
  Exemple de règle CORS : origine `https://app.tiktrends.co`, méthodes `PUT, GET`, headers `*`.

Sans ces variables, Assets fonctionne quand même : images optimisées + vidéos/audio par lien.

## 6. (Plus tard) Paiement — Stripe

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

### Rappel sécurité
Ne jamais committer `.env.deploy` ni coller une clé dans le chat / le code.
Le tableau des intégrations ne montre que **présent / absent**, jamais la valeur.

## Récapitulatif hebdomadaire

`/api/cron/digest` · une fois par semaine, le lundi à 07:47 heure de Paris.

**Le worker le planifie lui-même** (tâche `weekly-digest`, motif et fuseau dans
`packages/core/src/adsmap/recap-hebdo-planifie.ts`) · aucune crontab à poser.
S'il en reste une sur la machine qui tape cette route (`crontab -l`,
`/etc/cron.d/`), **la retirer** : elle ne doublerait rien (verrou
`digest:<semaine ISO>` dans `app_settings`, qui note chaque destinataire servi),
mais la lettre partirait à l'heure de celui des deux qui arrive le premier.

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

**Sans `SMTP_URL`** (classée « plus tard » plus haut) · les notifications de
l'application partent, aucun courriel n'est tenté, la route répond 503
`smtp_absent` et le worker écrit UNE ligne `[digest] SMTP non configuré ·
lettres servies dans l'application · courriels non envoyés`, sans retente ni
ALERTE. Une fois `SMTP_URL` posée (et le conteneur web redémarré), un appel à
la main la même semaine envoie les courriels sans redoubler les notifications.

Si la semaine reste non servie, le journal du worker l'écrit en clair :
`[digest] ALERTE · récap hebdomadaire NON SERVI …` (ou `NON CONFIRMÉ` si le
job a été perdu · vérifier alors le verrou `digest:<semaine>` dans
`app_settings`).

Il ne dépense **rien** : la lettre est calculée à partir de comptes, jamais
rédigée par un modèle. Et il n'envoie pas de lettre aux marques dont la semaine
n'a rien porté · trois « rien de neuf » et personne ne l'ouvre plus.

Sans `CRON_SECRET`, l'endpoint répond 503. Il est fermé par défaut.

## Migrations · où en est la base

**Cette page ne dit pas ce qui est appliqué.** Elle l'a fait, et elle a eu tort :
la liste des « migrations en attente » y est restée figée pendant des semaines
après leur application, et elle a envoyé chercher une panne qui n'existait plus.

Un document ne peut pas savoir ce qu'une base a exécuté. Deux endroits le
savent, et un seul suffit :

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

Pour que l'empreinte apparaisse, passer le commit au build :

```
docker build --build-arg BUILD_SHA=$(git rev-parse HEAD) ...
```

et l'exposer à l'application (`ENV BUILD_SHA=$BUILD_SHA` dans le Dockerfile).

**Sans cette variable, le reste fonctionne** · le bandeau dit simplement « build
inconnu ». Ce qui compte le plus est le compte de migrations : il vire à l'orange
dès qu'une migration embarquée n'est pas appliquée, et c'est exactement l'état où
le code attend des colonnes que la base n'a pas.
