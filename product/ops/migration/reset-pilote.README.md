# reset-pilote · remise à zéro du contenu métier d'un pilote

> Le propriétaire exécute ce script lui-même sur le VPS. La session Claude n'a
> pas d'accès SSH et ne l'exécute jamais.

## 1 · SAUVEGARDER D'ABORD (obligatoire · c'est ce qui rend l'opération réversible)

Prenez un dump horodaté AVANT toute chose. Sans dump déclaré, le script refuse
de supprimer (barrière `-v sauvegarde=`). Réversible = restaurable depuis ce
dump.

```bash
DUMP=~/backups/reset-pilote-$(date +%Y%m%d-%H%M%S).sql.gz
pg_dump "$DATABASE_URL" | gzip > "$DUMP"
test -s "$DUMP" && echo "Sauvegarde OK · $DUMP"
```

Restauration, si besoin de revenir en arrière :

```bash
gunzip -c "$DUMP" | psql "$DATABASE_URL"
```

## 2 · Choisir la cible (par espace et/ou par noms de marques)

Jamais d'ids du banc en dur · on cible par `workspace_id` et/ou par une liste de
NOMS de marques. Au moins un des deux est exigé, sinon refus (le script ne cible
jamais « toutes les marques »).

| Variable | Rôle |
| --- | --- |
| `workspace_id` | UUID de l'espace à nettoyer |
| `marques` | noms de marques séparés par des virgules, ex. `Neva,Maison Lumière Botanique` |
| `sauvegarde` | chemin du dump déjà pris (obligatoire pour supprimer) |
| `confirmer` | `oui-vider` · exécute les DELETE dans la transaction |
| `valider` | `oui` · COMMIT ; sinon ROLLBACK |

## 3 · Dérouler en trois temps (du plus sûr au définitif)

**a) Essai à blanc · lecture seule.** Liste les marques ciblées et compte, par
table, ce qui serait supprimé. Ne touche à rien.

```bash
psql "$DATABASE_URL" -v workspace_id=<uuid> -v marques='Neva' \
  -f product/ops/migration/reset-pilote.sql
```

**b) Essai transactionnel · supprime puis ANNULE.** Montre les comptes après
suppression (doivent tomber à 0 sur la cible), puis `ROLLBACK` automatique tant
que `valider` n'est pas `oui`. Rien n'est perdu · c'est le moment de vérifier
que les comptes ne surprennent pas.

```bash
psql "$DATABASE_URL" -v workspace_id=<uuid> -v marques='Neva' \
  -v sauvegarde="$DUMP" -v confirmer=oui-vider \
  -f product/ops/migration/reset-pilote.sql
```

**c) Application · supprime et VALIDE.** Ajoutez `-v valider=oui`.

```bash
psql "$DATABASE_URL" -v workspace_id=<uuid> -v marques='Neva' \
  -v sauvegarde="$DUMP" -v confirmer=oui-vider -v valider=oui \
  -f product/ops/migration/reset-pilote.sql
```

Pour garder la main interactivement (décider COMMIT/ROLLBACK vous-même après
avoir lu les comptes), ouvrez une session `psql` et collez le contenu du fichier
sans `-v valider=oui` · la transaction reste ouverte sur un `ROLLBACK;`, vous
tapez `COMMIT;` si les comptes sont bons.

## Garde-fous (résumé)

- **Sauvegarde d'abord** · pas de `-v sauvegarde=<dump>` ⇒ aucune suppression.
- **Essai à blanc d'abord** · des `SELECT` listent et comptent la cible avant
  tout `DELETE`.
- **Transaction** · tout dans `BEGIN; … COMMIT;`. Les comptes par table sont
  affichés AVANT la décision. `valider≠oui` ⇒ `ROLLBACK` · un `ROLLBACK` manuel
  reste possible si les comptes surprennent.
- **Paramétré** · cible par espace et/ou noms de marques, jamais d'ids en dur ;
  refuse si aucun filtre.
- **Ordre & intégrité** · supprime le sous-arbre Studios des feuilles vers la
  racine (FK en `ON DELETE RESTRICT`), détache le pointeur « version courante »
  (boucle de FK projet ↔ version), supprime les médias de la bibliothèque
  (`assets.brand_id` est `SET NULL`, donc suppression explicite), puis les
  marques · la cascade emporte le reste. Une vérification finale compte les
  lignes restantes (0 attendu) et le script contrôle l'absence d'orphelin.

## Ce que le script NE touche PAS (préservé)

Schéma · modèle de droits / RBAC (`workspace_members`, `platform_staff`,
`platform_role_rights`) · comptes utilisateurs · releases de prompt
(`studio_prompt_versions` / `_releases` / `_active` / `_evaluations`) · réglages
(`app_settings`) · registre de dépense (`ai_spend`, `credit_ledger`) · tout ce
qui n'est pas rattaché aux marques ciblées (y compris les médias « communs à
l'espace » dont `brand_id` est nul, et un éventuel autre espace).

## Détail à connaître · déclencheurs « ajout seul »

Six tables Studios sont immuables par déclencheur (`STUDIO_IMMUABLE` · versions,
plans d'impact, devis, approbations, grand livre de budget, journal d'audit). Ce
verrou protège les données VIVES d'une mutation applicative ; il n'est pas fait
pour empêcher une remise à zéro délibérée. Le script neutralise ces déclencheurs
UTILISATEUR le temps de la suppression ciblée (`ALTER TABLE … DISABLE TRIGGER
USER`), puis les rétablit dans la même transaction · les déclencheurs système
d'intégrité (FK) restent actifs, et un `ROLLBACK` rétablit aussi les
déclencheurs. Si une marque ciblée portait une release de prompt propre à la
marque (`brand_id` non nul), sa FK `RESTRICT` bloquerait la suppression et la
transaction s'annulerait proprement · à vous de décider (les releases de prompt
sont préservées par défaut).

## Vérifié comment

Le script a été éprouvé sur une base Postgres jetable (ni banc ni production)
peuplée par les semis de recette du dépôt : essai à blanc, essai transactionnel
(ROLLBACK · 0 ligne supprimée), puis application (COMMIT). Résultat contrôlé :
marques ciblées et tout leur contenu supprimés, autre espace et son contenu
intacts, comptes utilisateurs / droits / dépense / réglages préservés, zéro
orphelin, déclencheurs « ajout seul » rétablis. Les deux barrières (aucun
filtre, aucune sauvegarde) refusent avec le bon message avant tout `DELETE`.
