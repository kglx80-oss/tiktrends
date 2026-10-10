# L4-B · Veille → sources → hypothèse → brief → projet, reprise et export

Lot L4, partie « Veille et projet ». Chemins relatifs à `product/`. Ce document dit ce qui est tranché,
pourquoi, et comment le vérifier. Il ne décrit aucun état de déploiement.

Aucune migration, aucune dépense en test, aucun appel réseau sortant. Le seul appel modèle du parcours
(proposer des hypothèses) passe par `executerTache` (registre L2, barrière de dépense) ; en test,
l'adaptateur SIMULÉ de `test/` seulement.

## 1. Ce que livre le lot

| Livrable | Où |
| --- | --- |
| Brief canonique (types, forme du contrat, relations, complétude, composition, export) | `packages/core/src/studios/brief.ts` |
| Référence de source, tombstone | `packages/core/src/studios/sources/reference.ts` |
| Modalités disponibles, éléments observables ou absents, garde de narration (FLOW-02) | `packages/core/src/studios/sources/modalites.ts` |
| Hypothèses (trois au plus, changement isolé, saisie manuelle, plafond de coût) | `packages/core/src/studios/sources/hypotheses.ts` |
| Produit de la marque cible (faits connus, manques, instantané) | `packages/core/src/studios/sources/produit.ts` |
| Import de structure, exclusions, garde de fuite du concurrent | `packages/core/src/studios/sources/import.ts` |
| Réponse tardive (client) et scellé de proposition (serveur) · FLOW-03 | `packages/core/src/studios/sources/concurrence.ts` |
| Garde du parcours (studio + Veille) | `apps/web/lib/studios/sources/acces.ts` |
| Chargement des sources, état vivant | `apps/web/lib/studios/sources/sources.ts` |
| Préparation (lecture) | `apps/web/lib/studios/sources/preparation.ts` |
| Propositions par le registre (`test.hypothesize`) | `apps/web/lib/studios/sources/hypotheses.ts` |
| Scellé HMAC des propositions | `apps/web/lib/studios/sources/scelle.ts` |
| Création idempotente, lecture, cartes, export | `apps/web/lib/studios/sources/projet.ts` |
| Actions | `apps/web/app/actions/studios/sources.ts` |
| Écrans | `app/(app)/studio/projets/page.tsx`, `loading.tsx`, `[id]/page.tsx`, `components/studios/projet/*`, `components/studios/PreparerCreation.tsx`, montage dans `components/AdCard.tsx` |
| Tests | `packages/core/test/l4b-*.test.ts`, `apps/web/test/l4b-*.test.ts(x)` |

`packages/core/src/index.ts` reçoit une ligne : `export * from './studios/sources';` (qui réexporte aussi `../brief`).

## 2. Le brief canonique

Le contenu `brief` d'une version EST le `result` de `brief_build_output` (treize champs). Vérifié par le
validateur Ajv du vrai `03-CONTRATS.schema.json` (`l4b-brief`), et par une validation de forme locale
sans Ajv (utilisable côté client) qui refuse ce que le contrat refuse.

**L'hypothèse vit dans le brief.** Le contrat ne porte que `hypothesisId` et `testedVariable`. Énoncé,
témoin, traitement, mesure, règle de décision et limites sont rangés en faits de nature `hypothesis`
(`hyp_1`, `hyp_1.temoin`, `hyp_1.traitement`, `hyp_1.mesure`, `hyp_1.decision`, `hyp_1.limite.N`).
Conséquences : aucun champ hors contrat, aucune colonne nouvelle, et l'export du brief suffit à reprendre
le test ailleurs. `hypotheseDuBrief` relit l'hypothèse à l'identique (aller-retour testé).

**Relations** (`validerRelationsBrief`) : chaque fait cite une source du projet ou le produit du projet
(`produit:<id>`) ; l'hypothèse citée existe parmi les faits ; la variable testée figure dans `variables` ;
une observation n'affirme pas de narration sans transcription ; aucun champ écrit pour la marque cible
(objectif, audience, variable, invariants, composition, style, textes, formats) ne reprend le nom, le
domaine ou six mots consécutifs du texte de l'annonceur source.

**Composition sans modèle** (`composerBrief`) : observations des sources, faits produit, hypothèse et
protocole, structure importée, exclusions. Ce qui n'est pas connu reste vide (la complétude le dit).
Un invariant qui nomme l'annonceur est rangé en exclusion.

**Complétude** : bloquant = empêche « Brief prêt », jamais la consultation. Étapes : « Brief à
compléter », « Brief prêt », « En production » (plans, document ou timeline présents).

## 3. Les sources

`studio_projects.source_refs` porte des `SourceReferenceStudio` : identifiant opaque `src_<16 hex>`
(dérivé du type et de `plateforme:id`), droit `observation_publique`, portée, date d'observation, extrait
autorisé (280 caractères au plus), modalités, format créatif déclaré, observations, éléments absents,
empreinte SHA-256 de l'observé, statut, date de révocation, contexte de retour Veille nettoyé.

**Aucune URL de média stockée.** Une URL de média expire et une URL signée n'est pas une identité
(cahier §7). L'aperçu d'une sauvegarde encore accessible est relu dans `saved_ads` à l'affichage.

**Ce qui est cru.** Une sauvegarde est désignée par son identifiant et relue en base (espace de la
session, marque visible ou aucune) ; le snapshot du client est ignoré. Une annonce de Veille n'existe
pas en base : son snapshot vient du client, comme pour `saveAd`, sous la même garde Veille, nettoyé par
liste blanche, format créatif retiré.

**État vivant et tombstone** (`etatSources`, lecture pure) : sauvegarde retirée ou sortie de la portée →
`supprimee` ; source Veille sans accès Veille → `revoquee`. Le tombstone garde identité, empreinte,
extrait et observations, perd l'aperçu et tout lien vers la source. Rien n'est réécrit à la lecture
(testé : la ligne projet est identique avant et après).

**FLOW-02.** Modalités du cahier (image, vidéo, transcription, texte, lien). Sans transcription :
narration absente ; le son n'est jamais affirmé ; démonstration et rythme absents (aucune analyse
visuelle routée, `vision_analysis` bloqué). La durée de diffusion est une mesure (`measured`) « qui ne
prouve pas la rentabilité ». Le texte cité entre guillemets n'est pas une narration.

## 4. Hypothèses

Au plus trois, changement isolé ; une variable combinée (`+`, `;`, `&`, ` / `, « et », « and ») est
marquée exploratoire (non causale), pas refusée. Identifiants alloués `hyp_1..3` (le modèle ne les
invente pas, contrôle du registre `ID_NON_ALLOUE`). Saisie manuelle : `hyp_saisie`, énoncé et variable
exigés, le reste vide si non renseigné.

**Proposer** = tâche `test.hypothesize` par `executerTache` : observations en faits, sources en extraits
`untrusted_data`, métriques disponibles (`METRIQUES_TEST`, plus l'accroche vidéo si vidéo), identifiants
alloués. Sans release publiée : `UNSUPPORTED_CAPABILITY` avec « Les propositions d'hypothèses ne sont pas
encore activées : aucune version des consignes n'est publiée. Rédige ton hypothèse ci-dessous… » ;
sans fournisseur : même chemin. L'écran le dit AVANT le clic (préparation : `ia.disponible`, `ia.raison`).

**Coût.** Un appel texte coûte : plafond annoncé avant le clic (`plafondPropositionUsd` : 24 000 jetons
d'entrée et 4 000 de sortie, bornes du résolveur, au tarif du modèle routé ; 0,14 $ pour
`claude-sonnet-5`), barrière de dépense par l'adaptateur réel, aucun crédit débité (même politique que
Jarvis). Permission `studio.propose`.

**Scellé (FLOW-03 serveur).** La sortie revalidée est scellée (HMAC-SHA256, clé dérivée d'`AUTH_SECRET`)
avec espace, marque, sources triées, empreinte de chaque hypothèse, run et expiration (2 h). À la
création : autre marque, autre espace, autre sélection, hypothèse modifiée, jeton forgé ou expiré →
`INVARIANT_CONFLICT`, rien écrit.

**FLOW-03 client.** Chaque demande (préparation, proposition) porte un numéro et la marque du moment ;
`reponseApplicable` n'applique la réponse que si elle est la dernière, pour la marque courante, et que le
serveur a répondu pour elle. Changer de marque vide propositions, produit et choix proposé ; l'hypothèse
rédigée reste dans le brouillon de SA marque.

## 5. Projet

**Création** (`creerProjetDepuisSources`, `studio.propose`) : marque visible, sources chargées,
hypothèse (proposée et scellée, rédigée, ou aucune), produit de la marque (ou aucun : le projet le dit),
brief composé et validé (forme, relations, contenu de version), puis une transaction : verrou consultatif
`hashtext(studio_projet_clic:<espace>:<clé>)`, recherche de l'audit `project.create_from_sources` portant
cette clé, sinon projet + version 1 + pointeur courant + audit (détails : clé, sources, hypothèse,
origine, run, produit, empreintes). Idempotence sans colonne nouvelle : la clé vit dans l'audit (ajout
seul, même transaction).

**Lecture** (`lireProjetDetail`, `studio.read`) : projet, version courante ou `?version=`, sources
vivantes, brief, hypothèse relue, produit (instantané), complétude, historique. Portée : `workspace_id`
de la session ET `brand_id IN marques visibles` dans chaque requête, puis revérification pure.

**Export** (`exporterBrief`, `studio.export`) : Markdown (objectif, audience, hypothèse et protocole,
invariants, produit, faits par nature, composition, style, textes, formats, exclusions, sources datées
avec droit, statut, empreinte, ressources et éléments non observables) ou JSON
(`tiktrends.studio.brief/1`). Lecture pure : aucune ligne, aucun devis, aucun débit (testé avec un
espace à 0 crédit).

## 6. Écrans

- `/studio/projets` : cartes (marque, type, étape en mots, ce qui manque, date, version, sources),
  filtre par marque active, « voir toutes les marques », premier usage (trois gestes, lien Veille), vide
  pour la marque, accès refusé, erreur avec identifiant support, `loading.tsx`. Aucune écriture.
- `/studio/projets/[id]` : en-tête (projet, marque, version, étape, retour à la recherche de Veille),
  brief, produit, deux emplacements réservés, colonne contextuelle (ce qui manque, sources, historique,
  export). Introuvable neutre hors portée.
- « Préparer une création » : bouton sous le lien historique de la carte de Veille (Veille, Sauvegardes,
  Formats ; absent ailleurs). Fenêtre `Modal` partagée (piège à focus, Échap, retour au déclencheur),
  champs 16 px, cibles 44 px, statut porté par des mots.

## 7. Preuves

**Tests** : `packages/core/test/l4b-sources.test.ts` (23), `l4b-brief.test.ts` (20) ;
`apps/web/test/l4b-parcours-db.test.ts` (19, pglite + actions), `l4b-pages-rendu.test.tsx` (8, HTML rendu
sur pglite), `l4b-panneau-rendu.test.tsx` (7, jsdom), `l4b-concurrence-pg.test.ts` (Postgres 16 réel,
lancé si `L4B_PG_URL` désigne une base locale vide à 55 migrations).

| Exigence | Preuve |
| --- | --- |
| FLOW-01 | `l4b-parcours-db` · projet, version 1, `source_refs` (droit, date, empreinte, portée, sans URL de média), brief (hypothèse et protocole en faits, variable), produit, audit `project.create_from_sources` ; idempotent par clé de clic (rejoué, parallèle) |
| FLOW-02 | `l4b-sources` (image seule : narration et son absents, garde d'observation), `l4b-parcours-db` (préparation), `l4b-panneau-rendu` (« Transcription · absente », « Narration · absente ») |
| FLOW-03 | client : `l4b-panneau-rendu` (proposition A1 arrivée après passage à A2 jamais peinte) ; serveur : `l4b-parcours-db` (scellé A1 appliqué à A2 → `INVARIANT_CONFLICT`, rien écrit ; hypothèse modifiée, jeton forgé refusés) |
| FLOW-05 | `l4b-parcours-db` · seconde session : brief identique à la base, hypothèse, produit, sources et historique restaurés ; autre membre restreint : même brief |
| FLOW-10 | `l4b-parcours-db` · espace à 0 crédit : Markdown et JSON complets, aucune ligne (projets, versions, audit, runs, jobs, devis, dépense, ledger) |
| SEC-01 / SEC-02 | `l4b-parcours-db`, `l4b-pages-rendu` · autre espace, marque restreinte : `NOT_FOUND`, `targetIds: []`, aucun identifiant ni titre dans la réponse, rien écrit |

**Mutations** (chaque garde cassée, échec constaté, code restauré) :

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 · garde narration neutralisée | `l4b-sources` | `expected [] to deeply equal [ { chemin: '/facts/0/claim', …(1) } ]` |
| M02 · narration observable sans transcription | `l4b-sources`, `l4b-panneau-rendu` | `expected [ 'demonstration', 'rythme', 'son' ] to include 'narration'` |
| M03 · fuites du concurrent ignorées | `l4b-brief` | `expected 'Ne jamais montrer le flacon Lumière B…' not to contain 'Lumière'` |
| M04 · plus de trois hypothèses (noyau) | `l4b-sources` | `expected { ok: true, hypotheses: [ …(4) ] } to deeply equal { ok: false, … }` · côté serveur le contrat (`maxItems: 3`) tient aussi : la mutation seule n'y fait rien tomber |
| M05 · scellé sans comparaison de marque | `l4b-parcours-db` | `expected { ok: true, projet: … } to match object { ok: false, …(2) }` |
| M06 · réponse tardive appliquée ET filtre d'affichage par marque retirés | `l4b-panneau-rendu` | `proposition de A1 peinte sous A2: expected 3 to be +0` · chacune des deux gardes seule tient (M06, M06c survivent) |
| M07 · propositions gardées au changement de marque ET filtre retirés | `l4b-panneau-rendu` | `expected 2 to be +0` |
| M08 · sauvegarde : filtre SQL ET revérification retirés | `l4b-parcours-db` | `expected { ok: true, …(6) } to match object { ok: false, code: 'NOT_FOUND', …(1) }` · l'un sans l'autre survit (double garde) |
| M09 · projet : filtre SQL ET revérification retirés | `l4b-pages-rendu` | `expected null not to be null` (page « introuvable » absente) · l'un sans l'autre survit |
| M10 · idempotence retirée | `l4b-parcours-db` | `expected [ …(4) ] to deeply equal [ …(4) ]` |
| Verrou consultatif retiré (Postgres réel) | `l4b-concurrence-pg` | `deux clics simultanés · deux projets: expected [ … ] to have a length of 1 but got 4` |
| M11 · sauvegarde retirée lue active | `l4b-pages-rendu` | `expected 'active' to be 'supprimee'` |
| M12 · refus sans release non dit | `l4b-parcours-db` | `expected { ok: false, …(7) } to match object { ok: false, …(3) }` |
| M13 · composition qui nomme l'annonceur | `l4b-sources`, `l4b-brief` | `expected 'Comme Lumière Botanique : visuel fixe…' to be 'Structure observée à adapter : visuel…'` |
| M14 · produits de toutes les marques | `l4b-parcours-db` | `expected [ 'Baume Nuit', 'Crème Douce', …(2) ] to deeply equal [ 'Produit A2' ]` |
| M15 · emplacement L4-C retiré | `l4b-pages-rendu` | `expected null not to be null` |
| M16 · export sans protocole | `l4b-parcours-db` | `export sans « - Témoin : Accroche bénéfice »` |
| M17 · hypothèse hors du brief | `l4b-brief` | `expected undefined to match object { kind: 'hypothesis', …(1) }` |
| M18 · création avec `studio.read` | `l4b-parcours-db` | `expected { ok: true, projet: … } to match object { ok: false, code: 'FORBIDDEN' }` |
| M19 · bouton sur toutes les cartes | `l4b-panneau-rendu` | `expected true to be false` |
| M20 · URL de média dans la référence | `l4b-sources` | `une URL de média est stockée comme identité ou cache` |
| M21 · export avec `studio.read` | `l4b-parcours-db` | `expected { ok: true, …(3) } to match object { ok: false, code: 'FORBIDDEN' }` |
| M22 · source Veille lisible sans Veille | `l4b-parcours-db` | `expected { cle: 'meta:9001', …(21) } to match object { statut, lienSource }` |
| M23 · lecture qui réécrit le projet | `l4b-pages-rendu` | `la visite a écrit: expected '[{"id":…' to be '[{"id":…'` |

**Captures** (serveur local, base locale semée de données fictives, Chromium en CDP, 1440 · 1280 · 390,
aucun défilement horizontal) : premier usage, Veille avec panneau ouvert, panneau avec hypothèse rédigée
et produit, création depuis Sauvegardes, cartes, page projet, sources, tombstone, accès refusé, projet
introuvable. Les projets des captures ont été créés par le vrai panneau (actions serveur), chaque capture
dans un nouveau processus Chromium : la page projet est relue par une seconde session.

## 8. Besoins hors périmètre (intégrateur)

1. `apps/web/lib/navigation.ts` · ROUTES (la garde `test/navigation.test.ts` « chaque page.tsx a son
   entrée » est rouge sans elles) :
   `{ path: '/studio/projets', label: 'Projets', parent: '/studio', section: 'Atelier' },`
   `{ path: '/studio/projets/[id]', label: 'Projet', parent: '/studio/projets', section: 'Atelier', dynamic: 'segment' },`
   Éventuellement une entrée de rail « Projets » sous Studio IA (`AppShell.tsx`).
2. Montage dans `components/studios/projet/VueProjet.tsx` : `<PanneauPropositions projectId versionId />`
   (L4-A) dans `data-emplacement="propositions"`, `<VariantesEtTests projectId versionId />` (L4-C) dans
   `data-emplacement="variantes-tests"` (c'est là que vit le lien vers le test).
3. Accueil (cahier §4.1 « reprendre un projet ») : réutiliser `listerProjetsCartes` + `CarteProjet`.
4. Le brief canonique est `BriefCanonique` (`@tiktrends/core`) ; L4-A et L4-C l'importent au lieu de
   manipuler `brief` comme donnée opaque. Chemins de patch utiles : `/brief`, `/productRef`.
5. Colonne de clé d'idempotence : aucune n'a été ajoutée ; la clé vit dans l'audit
   (`details->>'cleClic'`, verrou consultatif). Si l'audit grossit, un index d'expression
   `(workspace_id, action, (details->>'cleClic'))` sur `studio_audit_events` serait une migration additive.
6. Le statut « révoquée/supprimée » d'une source est CALCULÉ à la lecture (aucune écriture à la visite) ;
   le persister demanderait une commande explicite (hors lot).
