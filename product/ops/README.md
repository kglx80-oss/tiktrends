# Ops — Auto-déploiement TikTrends (VPS OVH)

Déploiement continu **sans secret** : un timer systemd interroge `origin/main`
toutes les minutes et, s'il y a du nouveau, déploie automatiquement.

## Installation (une seule fois, sur le VPS)

```bash
cd ~/tiktrends
git pull
chmod +x product/ops/deploy.sh
sudo cp product/ops/tiktrends-deploy.service /etc/systemd/system/
sudo cp product/ops/tiktrends-deploy.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tiktrends-deploy.timer
```

## Vérifier / superviser

```bash
systemctl status tiktrends-deploy.timer     # le timer est-il actif ?
systemctl list-timers tiktrends-deploy       # prochain déclenchement
journalctl -u tiktrends-deploy -n 50 --no-pager   # journal des déploiements
```

## Déployer manuellement (sans attendre la minute)

```bash
sudo systemctl start tiktrends-deploy.service
```

## Suspendre / réactiver l'auto-déploiement

```bash
sudo systemctl disable --now tiktrends-deploy.timer   # stop
sudo systemctl enable  --now tiktrends-deploy.timer   # relance
```

## Ce que fait `deploy.sh`

1. `git fetch` — nouveaux commits sur `main` ? sinon, ne fait rien.
2. Si `product/` a changé : `git pull` → `docker compose up -d --build`.
3. Migrations Drizzle (idempotentes : seules les nouvelles s'appliquent).
4. Si seule la maquette a changé (hors `product/`), pull sans rebuild.

---

## Worker · décodage vidéo (ffmpeg, Studios L7-B)

L'image `workers` installe `ffmpeg` (Alpine, paquet `ffmpeg` : `ffmpeg` et
`ffprobe`). Aucune variable ni aucun secret à poser. La capacité vidéo n'est
**jamais déclarée à la main** : au démarrage puis toutes les 5 min, le worker
studio (s'il tourne) sonde ffmpeg · version, encodeurs `libx264`/`aac`,
échantillon 32×32 de 12 images généré puis décodé en entier · et publie le
résultat dans `app_settings` (clé `studio:capacite-video`). Le site ne propose
une vidéo que sur une sonde de moins de 15 min dont l'échantillon a été décodé ;
sinon il refuse au devis, comme avant.

Vérifier après déploiement (propriétaire, sur le VPS) :

```bash
cd ~/tiktrends/product
docker compose exec workers ffmpeg -hide_banner -version | head -1
docker compose exec workers ffprobe -hide_banner -version | head -1
docker compose exec workers sh -c 'ffmpeg -hide_banner -encoders | grep -E " (libx264|aac) "'
docker compose logs workers --since 15m | grep "sonde vidéo"
docker compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' <<'SQL'
select updated_at, value from app_settings where key = 'studio:capacite-video';
SQL
```

Lecture : `decodage.ok = true` et `updated_at` récent ⇒ décodage prouvé ;
`encodeurs.libx264 = false` ⇒ aucun export MP4 H.264 n'est annoncé. Même
décodage prouvé, l'animation reste refusée au devis tant qu'aucun fournisseur
d'animation n'est branché.

---

## Sauvegardes de la base (quotidiennes)

Dump `pg_dump` compressé chaque nuit à 03h30, gardé 14 jours dans `~/backups`.

### Installation (une seule fois, sur le VPS)

```bash
cd ~/tiktrends
git pull
chmod +x product/ops/backup.sh
sudo cp product/ops/tiktrends-backup.service /etc/systemd/system/
sudo cp product/ops/tiktrends-backup.timer   /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tiktrends-backup.timer
```

### Vérifier

```bash
systemctl list-timers tiktrends-backup      # prochaine exécution
sudo systemctl start tiktrends-backup.service   # sauvegarde immédiate (test)
ls -lh ~/backups                             # les dumps
journalctl -u tiktrends-backup -n 20 --no-pager
```

### Restaurer une sauvegarde

```bash
cd ~/tiktrends/product
# Remplace le fichier par la sauvegarde voulue (~/backups/tiktrends-AAAAMMJJ-HHMMSS.sql.gz)
gunzip -c ~/backups/tiktrends-20260823-033000.sql.gz \
  | docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

> Le dump utilise `--clean --if-exists` : la restauration remet la base dans l'état
> exact de la sauvegarde (tables recréées). À faire avec précaution en production.

### ⚠️ Copie hors-site (recommandée)

Les dumps sont sur le **même VPS** : si le serveur est perdu, ils le sont aussi.
Pour une vraie sécurité, activer la copie vers **OVH Object Storage** (S3) —
créer un bucket, configurer `rclone`, puis décommenter la dernière ligne de
`backup.sh`. (Demander à Claude de le brancher.)
