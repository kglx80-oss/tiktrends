# Mise en ligne Studios · sauvegarde, retour arrière, contrôles OVH

Mandat du 10/10 : déploiement de l'ensemble de la refonte sur l'OVH actuel, sans recette Docker isolée
préalable ; tests manuels après déploiement, sur l'espace pilote. Ce document dit **ce qui protège les
données, comment revenir en arrière, et ce que la session n'a PAS pu voir**. La session n'a ni SSH ni accès
HTTP à l'application (proxy) : tout ce qui suit marqué « propriétaire » reste NON VÉRIFIÉ tant qu'il n'a pas
été lu sur le VPS.

## 1. Sauvegardes

| Quoi | Quand | Où | Qui la vérifie |
| --- | --- | --- | --- |
| Quotidienne (`ops/backup.sh`, timer `tiktrends-backup`) | 03:30, 14 gardées | `~/backups/tiktrends-*.sql.gz` | propriétaire |
| **Avant migration** (D1, `ops/deploy.sh` étape 2a) | à chaque déploiement dont une migration manque en base | `~/backups/avant-migration-<sha>-<horodatage>.sql.gz`, 5 gardées | le script : dump en échec ou < 500 octets ⇒ arrêt, aucune migration |

La seconde est imposée par le code (banc `d1-deploiement`, scénarios `sauvegarde_ko`, `sauvegarde_vide`,
mutants « sauvegarde retirée », « dump vide accepté »). Elle rend la fusion des migrations 0054 à 0056
impossible sans copie préalable de la base.

Contrôle propriétaire, avant et après la fusion Studios :

```bash
systemctl list-timers tiktrends-backup tiktrends-deploy --no-pager
ls -lt ~/backups | head -5                       # une quotidienne récente, puis la « avant-migration-… »
gunzip -t ~/backups/avant-migration-*.sql.gz && echo "dumps lisibles"
```

## 2. Retour arrière

Du plus léger au plus lourd. Ne jamais sauter au 3 si le 1 ou le 2 suffit.

1. **Couper une capacité** · `/admin/studios-interrupteurs` (administrateur de plateforme), ou
   `STUDIOS_CAPACITES_COUPEES=<capacité>` dans `.env.deploy` puis `docker compose up -d` dans
   `~/tiktrends/product`. Aucun code ni donnée touchés.
2. **Revenir au code précédent** · PR `git revert <commit squash>` vers `main`, fusion normale. D1 reconstruit
   l'ancien code ; le migrateur ne défait rien, les tables `studio_*` restent et l'ancien code les ignore
   (épreuve : `bc33cec` sur base à 56 migrations, écrans en 200 · `L9-MIGRATION.md` §5). `/console` dira
   « La base a N migration(s) de plus que ce build » : attendu. Revenir en avant = revert du revert.
3. **Restaurer la base** (dernier recours, données perdues depuis le dump) · uniquement si des données sont
   abîmées. Lire d'abord `ops/README.md`, « Attention · restaurer EN PLACE une sauvegarde plus ancienne que
   les migrations Studios ». Fichier : le `avant-migration-<sha>-…` du déploiement concerné.

## 3. Ce que le propriétaire lit sur le VPS après chaque fusion (lecture seule)

```bash
cd ~/tiktrends
cat .tiktrends-deployed-sha; git rev-parse origin/main          # égaux = déployé
journalctl -u tiktrends-deploy -n 60 --no-pager | grep -E "Sauvegarde|Vérification|Déploiement terminé|ÉCHEC"
cd product
docker compose exec web printenv BUILD_SHA                      # 8 premiers caractères du commit
docker compose exec db sh -c 'psql -At -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "select count(*) from drizzle.__drizzle_migrations"'
docker compose logs web --since 15m | grep -iE "error|42P01|42703" | head
```

Attendus après la fusion Studios : journal « Migration(s) en attente : 0054_studios_fondations
0055_ai_spend_reconciliation 0056_ai_spend_reconciliations · sauvegarde… », « Sauvegarde avant migration
OK », « Vérification · 57 migration(s) du journal toutes en base », « Déploiement terminé (<sha>) » ;
57 migrations en base ; aucune `42P01`.

En cas de `ÉCHEC` : rien n'est remplacé, l'ancienne version reste servie, le tick suivant réessaie. Copier
les 60 lignes du journal dans le fil (aucun secret n'y figure) ; ne pas relancer à la main en boucle.
