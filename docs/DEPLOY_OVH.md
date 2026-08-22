# Déploiement sur OVH (EU / RGPD)

Deux niveaux : **A. VPS + Docker Compose** (rapide, pour démarrer/beta) ·
**B. Managed + Kubernetes** (scalable). La maquette de démo reste sur GitHub Pages.

## Pourquoi OVH
Hébergement **France/EU**, **DPA** disponible, données publicitaires clients **hors US** → cohérent avec le positionnement FR/EU-first et les exigences RGPD (CDC §5.7/§5.8). Object Storage **S3-compatible**, Managed PostgreSQL/Redis.

---

## A. Démarrer sur un VPS OVH (recommandé)

1. **Commander** un VPS OVH (ex. *VPS Comfort*, Debian 12) en datacenter EU (GRA/SBG/RBX).
2. **DNS** : un enregistrement A `app.ton-domaine.fr` → IP du VPS.
3. **Installer Docker** :
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
4. **Récupérer le code** (le dossier `product/` de ce dépôt) :
   ```bash
   git clone https://github.com/kglx80-oss/tiktrends.git
   cd tiktrends/product
   cp .env.deploy.example .env.deploy   # renseigner les secrets
   # éditer Caddyfile : mettre ton domaine
   ```
5. **Lancer** :
   ```bash
   docker compose up -d --build
   ```
   Caddy obtient le certificat TLS automatiquement.
6. **Migrer la base** (extension vector + schéma) :
   ```bash
   docker compose exec web sh -lc "cd /app && node -e \"1\""   # placeholder
   # en pratique : lancer `pnpm db:migrate` avec DATABASE_URL pointant sur db,
   # après un `CREATE EXTENSION IF NOT EXISTS vector;`
   ```

Coût indicatif : ~10-20 €/mois (VPS) au départ.

### pgvector
Le service `db` utilise l'image `pgvector/pgvector:pg16` → extension disponible.
Sur **OVH Managed PostgreSQL**, vérifier que `vector` est dans les extensions supportées ; sinon rester sur ce conteneur ou une instance dédiée.

---

## B. Passer à l'échelle (plus tard)
- **OVH Managed Kubernetes** : déployer `web` et `workers` en Deployments, Ingress + cert-manager (TLS).
- **OVH Managed PostgreSQL** (+ pgvector si supporté) et **Managed Redis**.
- **OVH Object Storage (S3)** pour les médias (`S3_ENDPOINT` déjà prévu dans `.env`).
- **CI/CD** : GitHub Actions build les images Docker → push vers un registre → déploie sur le cluster.
- **Sauvegardes** : snapshots Managed DB, versioning Object Storage. RPO 24 h / RTO 4 h (§5.8).

---

## Où va quoi
| Composant | Service |
|---|---|
| `apps/web` (Next.js) | conteneur `web` (VPS) puis Deployment k8s |
| `apps/workers` (BullMQ) | conteneur `workers` |
| Postgres + pgvector | conteneur `db` puis OVH Managed PostgreSQL |
| Redis | conteneur `redis` puis OVH Managed Redis |
| Médias | OVH Object Storage (S3-compatible) |
| TLS / reverse proxy | Caddy (VPS) puis Ingress k8s |

> Rappel : le vrai déblocage produit reste l'**accès aux API TikTok/Meta** (2-6 sem.). L'hébergement peut être prêt en parallèle.
