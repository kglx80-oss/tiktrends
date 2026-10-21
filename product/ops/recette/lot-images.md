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
