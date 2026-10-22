# Lots d’images · même consigne, même format

De 1 à 6 demandes indépendantes au moteur image existant ; ni accroches différentes ni formats différents. Aucun appel fournisseur pendant préparation/approbation : exécution par le worker existant.

## Contrat

- `preparerLotImages({projectId,nombre,controleVision})` → `{ok:true,lot}`. `VueLotImages` : devis unitaires, total crédits/micro-dollars, qualification, version, échéance, empreinte.
- `approuverLotImages({lotId,empreinte,creditsAnnonces,usdMicrosAnnonces,confirme:true})` → `{ok:true,jobs:JobPresente[],deja}`. Le navigateur confirme les totaux sans fournir les lignes exécutables.
- `lireLotImages({lotId})` → manifeste et jobs existants, sans retry ni remboursement implicite.

Permissions/capacités/fournisseur conservés. Version, release, expiration et débits contrôlés par la commande existante. Modifier le projet exige de nouveaux devis.

## Transaction et persistance

Manifeste immuable dans `studio_audit_events`, action `image.batch.quote`, cible `studio_image_batch`. Le trigger 0054 interdit UPDATE/DELETE. Empreinte canonique indépendante de l’ordre JSONB. Lecture filtrée espace ET marque.

Transaction externe autour des sauvegardes imbriquées des commandes existantes : une erreur annule approbations, jobs, crédits, ledger, audit et outbox. Idempotence par clé serveur lot+devis. Une réponse perdue peut être rejouée sur le même lot sans nouvelle exécution.

Aucune migration. Retour arrière : retirer actions/interface, conserver manifestes/jobs engagés et leur suivi existant.

## Budget et limites

`VERROU_PLAFOND` partagé avec la réservation fournisseur sérialise les lots. Dépenses réelles relues + réserves studio ouvertes (incertaines incluses) + total du lot, sous plafond inchangé. Un appel en vol peut être compté deux fois : refus prudent possible. Le worker conserve sa barrière monétaire avant chaque appel réel, notamment pour les commandes unitaires historiques qui ne prennent pas ce verrou lors de l’enqueue.

Approbation atomique ≠ livraison atomique : succès, échecs et réconciliations affichés par job. Aucune resoumission automatique d’un job incertain.

## Preuves

`test/lot-images-db.test.ts` : PGlite avec migrations réelles, fournisseur texte simulé. Préparation sans job, replay, rollback après premier job, crédits insuffisants en cours, total, concurrence même lot/deux lots sous plafond, droits, version, expiration, lecture partielle/incertaine. PGlite sérialise les connexions ; CI PostgreSQL multi-connexions et génération réelle/observation production restent distinctes de ces preuves sans dépense.

Le préflight relit également `budgetEssaiDe(workspaceId)` : dépenses cumulées depuis la date fixe du budget + réserves ouvertes du même espace + total du lot. Ce budget total n’est jamais remplacé par la fenêtre glissante du plafond global. Une dépense ancienne incertaine reste retenue ; un autre espace ne consomme pas ce budget local.

## Génération multi-format attestée

`preparerLotFormats({projectId,formats,nombreParFormat?,controleVision?})` accepte de 1 à 3 formats uniques parmi `1:1`, `4:5`, `9:16` et 1 à 4 images par format (défaut 1, maximum 12 jobs). Retour : même `VueLotImages`, avec `type: images-formats` et `formats[]` dépliés dans l’ordre des devis. Confirmation et suivi utilisent les mêmes actions que Lot B, avec le total complet.

C’est une génération distincte par image et format, pas une recomposition d’un raster. Le texte de la consigne, les contraintes négatives, composants protégés, liaisons de références et produit ne changent jamais. Seules les dimensions viennent d’une liste serveur fermée. Cela ne promet pas des accroches ou compositions différentes entre variantes.

La consigne compilée originale reste inchangée et doit toujours passer `verifierConsigne`. Le devis contient dans son audit append-only une dérivation `studio_image_format/1` : version source, hash original, format, hash effectif et hash des paramètres. Le hash effectif entre dans le `inputHash` du devis. L’approbation reconstruit la dérivation depuis la consigne source relue, vérifie sa preuve et produit le snapshot worker normal. Tous les devis utilisent la même version source courante ; aucune exemption de la garde de version.

Avant réservation fournisseur, le worker relit la preuve, le devis et la version, contrôle paramètres, source, prix, hash du devis et release non révoquée. Les références et droits média restent relus dans le préparateur fournisseur existant. Aucun changement de prompt release, fournisseur ou migration.

Une consigne qui mentionne explicitement un ratio/dimensions/orientation incompatible est refusée : il faut demander une nouvelle compilation, en connaître le coût, relire puis retenir. Le détecteur est volontairement conservateur (un mot comme « paysage » peut nécessiter reformulation). Une contradiction trouvée au dernier format annule aussi les devis précédents du lot.

Les dimensions cibles sont 1080×1080, 1080×1350 et 1080×1920 ; le fournisseur image existant travaille par ratio, comme le parcours unitaire. La taille réellement livrée demeure celle vérifiée dans les métadonnées du média, sans promettre une résolution exacte non garantie par le fournisseur.
