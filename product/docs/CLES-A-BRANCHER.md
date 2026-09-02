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

**La vidéo (Kling 2) passe aussi par cette clé Fal** — image ET vidéo avec une seule clé.
Options vidéo (Kling 2 par défaut) :
```
FAL_VIDEO_MODEL=fal-ai/kling-video/v2/master/text-to-video
FAL_VIDEO_MODEL_I2V=fal-ai/kling-video/v2/master/image-to-video
FAL_QUEUE_URL=https://queue.fal.run
```

## 3. Vidéo IA — Higgsfield (optionnel)

`FAL_KEY` suffit pour la vidéo (Kling 2). Higgsfield reste **optionnel** : ne le
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

`/api/cron/digest` · une fois par semaine, le lundi matin.

```
0 7 * * 1  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://app.tiktrends.co/api/cron/digest
```

Il ne dépense **rien** : la lettre est calculée à partir de comptes, jamais
rédigée par un modèle. Et il n'envoie pas de lettre aux marques dont la semaine
n'a rien porté · trois « rien de neuf » et personne ne l'ouvre plus.

Sans `CRON_SECRET`, l'endpoint répond 503. Il est fermé par défaut.

## Migrations en attente sur le VPS

Quatre migrations sont écrites et **pas encore appliquées** :

| # | Ce qu'elle fait | Sans elle |
|---|---|---|
| `0042_brand_enriched_at` | date d'enrichissement d'une marque | l'enrichissement repart à chaque chargement |
| `0043_stat_milestones` | quand la mémoire a appris quelque chose | le récapitulatif ne peut rien annoncer |
| `0044_ad_source_ref` | lien génération → ad, **sur l'ad** | l'attribution reste mesurée au mauvais niveau |
| `0045_backfill_ad_source_ref` | rétro-rattache l'historique | l'attribution reste vide sur tout le passé |

Elles s'appliquent dans l'ordre, avec la commande de déploiement habituelle.

**0045 en particulier** ne devine rien : elle ne rattache que les ads dont une
génération porte déjà `adsmapAdId`, une trace écrite par la passerelle au moment
de la création. Elle ne remplace jamais un lien existant, et la rejouer ne change
rien (vérifié : second passage `UPDATE 0`).

Les ads importées, venues de la veille ou saisies à la main restent sans lien ·
c'est correct, elles n'ont jamais eu de génération.
