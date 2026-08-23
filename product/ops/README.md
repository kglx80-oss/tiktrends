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
