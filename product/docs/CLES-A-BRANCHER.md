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

## 6. (Plus tard) Paiement — Stripe

```
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

### Rappel sécurité
Ne jamais committer `.env.deploy` ni coller une clé dans le chat / le code.
Le tableau des intégrations ne montre que **présent / absent**, jamais la valeur.
