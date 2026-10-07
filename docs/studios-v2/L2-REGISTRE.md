# L2 · Registre de prompts · noyau pur

Lot L2, partie PURE (sans base, réseau ni modèle) du registre de prompts administrable.
Code : `product/packages/core/src/prompts/`. Tests : `product/packages/core/test/prompts-*.test.ts`.
Aucun appel IA, aucune dépense. Ce document dit ce qui est tranché, pourquoi, et ce que
l'intégration serveur doit encore brancher. Il ne décrit aucun état de déploiement.

## Modules

| Module | Rôle |
| --- | --- |
| `empreinte.ts` | SHA-256 pur (sans `node:crypto`) et JSON canonique compatible Python |
| `types.ts` | Types du pack, du contexte (`$defs/Context`) et de l'enveloppe de sortie, forme commune des `Constat` |
| `pack.ts` | Lecture et validation du pack, recalcul des empreintes, plan d'import en brouillon |
| `contrats.ts` | Compilation unique de `03-CONTRATS.schema.json`, `validerEntree` / `validerSortie` / `validerDefinition` |
| `semantique.ts` | Contrôles sémantiques avant appel (`controlerEntree`) et après appel (`controlerSortie`), chaîne `evaluerSortie` |
| `compilation.ts` | Politique serveur fixe, compilation des trois messages, `compiledHash`, `contextSnapshotHash` |
| `contexte.ts` | Budget de contexte par priorité, troncature signalée, blocage avec simplification |
| `resolution.ts` | Résolution de portée (marque, espace, global), overrides, couches de résolution ordonnées |
| `release.ts` | Cycles de vie, publication, rollback, retrait, évaluation, épinglage, permissions |

`packages/core/src/index.ts` n'est PAS modifié : l'intégrateur choisit l'export (voir plus bas, Ajv).

## Décisions

### Validateur JSON Schema

- `ajv@8.20.0` (MIT, publié le 24/04/2026) et `ajv-formats@3.0.1` (MIT), versions exactes
  épinglées dans `packages/core/package.json`. Dépendances transitives : `fast-deep-equal`,
  `json-schema-traverse`, `require-from-string` (MIT), `fast-uri` (BSD-3-Clause).
- Instance `Ajv2020` (`ajv/dist/2020`), schéma ajouté UNE fois, chaque `$defs` compilée à la
  première demande puis en cache. Les références viennent de `inputSchemaRef` / `outputSchemaRef`
  du pack, jamais écrites à la main.
- `strict: true` sauf `strictTypes: false`. Mesuré : en strict complet, Ajv refuse de compiler à
  `#/allOf/0/then/properties/questions` parce que `if`/`then` n'y répètent pas `type`. C'est du
  JSON Schema valide ; le refus porte sur le style, pas sur le sens.
- `ajv-formats` est indispensable : `Quote.expiresAt` porte `format: date-time` et le mode strict
  refuse un format inconnu (mutation M13).
- Types TypeScript : écrits à la main dans `types.ts`, gardés par un test qui compare leurs champs
  aux `required` du schéma. Générer les types depuis 210 Ko de schéma demanderait un outil de plus ;
  écart assumé, la validation serveur reste la seule autorité.

### Algorithme d'empreinte

- `contentHash` (template et recette) = SHA-256 de `json.dumps(objet sans contentHash,
  sort_keys=True, ensure_ascii=False, separators=(',', ':'))` encodé UTF-8 : exactement
  `tools/verify-pack.py`. Reproduit en TypeScript : clés triées par point de code (pas par unité
  UTF-16), non ASCII écrit tel quel, échappements de Python en minuscules, aucun espace.
- `commonSystemHash` = SHA-256 du texte UTF-8 des consignes communes.
- Mode « python » : un nombre non entier est REFUSÉ (Python écrirait `1.0`, JavaScript `1` après
  `JSON.parse` : l'empreinte divergerait en silence). Surrogate isolée refusée.
- Mode « js » pour les empreintes propres au serveur (snapshot de contexte, message compilé) :
  décimaux finis acceptés, jamais comparés à Python.
- Empreinte de release (`releaseHashAlgorithm` ne fixe ni la forme ni l'ordre) : SHA-256 du JSON
  canonique de `{ commonSystemInstructions, rendering, styleRecipes, templates }`, templates
  complets (contentHash compris) triés par `key`, recettes triées par `id`.
- `verify-pack.py` n'a pas été exécuté : il réécrit `VERIFICATION-DOSSIER.json`. Ses contrôles
  sont reproduits par les tests (les 22 `contentHash` et le `commonSystemHash` retrouvés).

### Import du pack

- Le module reçoit le pack (objet ou texte), il ne lit pas le disque. `lirePackTexte` refuse
  d'abord une clé JSON dupliquée, que `JSON.parse` avalerait en gardant la dernière.
- Refus en plus de `verify-pack.py` : statut autre que `draft`, `allowedTools` non vide, plus d'une
  tentative de réparation, champ inconnu, variable de gabarit non déclarée, variable dans les
  consignes, étape déterministe portée par un template, politique de variable autre que `reject`.
- Plan d'import idempotent par (type, clé, version, empreinte), tout en `draft`, rien d'actif.
  Même (type, clé, version) avec une autre empreinte : conflit, et l'import ENTIER est refusé.
  Entrées : 22 templates, 8 recettes, le socle (`commonSystemInstructions`) et le rendu.

### Contrôles sémantiques

Chaque contrôle rend `{ code, cible, message }`. Avant appel, un constat = `blocked` sans appel
modèle ; après appel, un constat = sortie rejetée même conforme au schéma. Les six contrôles
déclarés par le pack, puis par tâche :

- ready ⇒ résultat non nul et questions vides ; blocked ⇒ result null et au moins une question
  non vide (`QUESTION_VIDE` : le schéma admet `""`).
- Sources et preuves : `sourceIds` / `claimSourceIds` ⊆ sources autorisées, connaissances retenues,
  faits, documents, références et médias fournis ; `evidenceIds` ⊆ identifiants fournis ; fait
  observé ou mesuré sans source refusé ; toute `sha256` recopiée doit venir du contexte.
- Identifiants nouveaux ⊆ `allocatedIds` du bon type, sans doublon.
- Patches : JSON Pointer, racine refusée, segments `__proto__|constructor|prototype` refusés (dans
  le chemin ET dans les clés de la valeur), segments numériques ou `-` refusés (index positionnels),
  chemin = un chemin autorisé ou un descendant, `remove` ⇒ `newValue` null, pas deux fois le même
  chemin, valeur sans HTML, script ni URL, version de base inchangée, chemins autorisés =
  intersection de la tâche et du contexte serveur.
- `voice.prepare` : `spokenText === narrationText`, voix et langue inchangées.
- `batch.plan` : au plus `maxOutputs`, `count` = nombre de lignes, pas de doublon
  (concept, format, variation normalisée), concepts et formats fournis.
- Mode sans texte (`texts: []` du brief résolu, ou imposé) ⇒ `onScreenText` vide,
  `needsDeterministicOverlay` faux.
- Lipsync sans capacité attestée ou sans audio ⇒ bloqué avant appel ET une sortie `ready` rejetée.
- Et : brief qui garde invariants, références (version, empreinte, composants requis) et
  hypothèse ; composants requis protégés dans `image.compile` / `shot.image` ; action Jarvis ∈
  `availableActions` et cibles ⊆ sélection ou sources ; métrique disponible ; portée de style non
  élargie ; vues demandées exactes ; verdict `passed` incohérent avec un défaut bloquant ou une
  dimension invérifiable ; musique licenciée, durée et instrumental inchangés ; textes sous
  `maxCharacters` et `variantCount`.
- Avant appel : extraits de sources autorisées, connaissances dont la version est retenue,
  documents résolus valides pour leur `schemaKey` (un `schemaKey` inconnu BLOQUE), IDs de la tâche
  résolus en documents, médias réellement joints pour les tâches vision.

### Compilation

- Trois messages : `system` politique serveur fixe (`POLITIQUE_SERVEUR`, dans le code, hors ADMIN) ;
  `system` consignes communes puis consignes de tâche ; `user` gabarit où `{{context}}` et
  `{{taskInputs}}` sont remplacés UNE fois par leur JSON. Le remplacement parcourt le gabarit, pas
  les données : un « {{taskInputs}} » ou un « $& » venu d'une source reste du texte.
- Ordre : politique non vide, empreinte du template et du socle recalculées (altéré = erreur
  serveur), variables obligatoires présentes (`MISSING_VARIABLE`, aucun repli), schéma d'entrée,
  contrôles sémantiques d'entrée, puis rendu.
- Liste d'outils toujours vide. Empreintes rendues : `compiledHash`, `contextSnapshotHash`,
  `taskInputsHash`, empreinte de la politique.

### Ordre de résolution et portée

- Couches, du plus fort au plus faible : politique fixe → release autorisée pour l'opération et
  la portée → contraintes projet → connaissances → faits produit → références → demande.
  `couchesResolution` rend cette pile avec identifiants et empreintes pour le PromptRun.
- Portée : override marque approuvé, sinon override espace approuvé, sinon template global de la
  release. Un override vient de l'ADMIN seulement (source, conversation, apprentissage écartés),
  vise la version et l'empreinte courantes (sinon périmé, écarté, la trace le dit), ne touche que
  des champs déclarés extensibles et jamais un champ de contrat. Deux overrides approuvés au même
  niveau : refus.
- Le pack ne déclare AUCUN champ extensible : par défaut, aucun override ne s'applique.

### Cycles de vie et publication

- Version : `draft → validated → retired`. Seul un brouillon se modifie ; une nouvelle version doit
  dépasser toutes celles du registre. Valider exige des contrôles structurels exécutés et vides.
- Release : `staged → active → retired`. « active » = publiée et éligible ; le pointeur de la
  portée désigne celle qui sert. Publier B laisse A active (donc éligible au rollback) ; rollback =
  pointeur seul, aucune transition ; retirer la release pointée est refusé.
  Le cahier §8.2 écrit une seule chaîne `Draft → validated → staged → active → retired` ; elle est
  scindée en deux cycles, comme le demande le mandat L2.
- Publication : permission, release `staged`, non révoquée, compare-and-set sur le pointeur,
  chaque entrée au registre validée et à la bonne empreinte, contenu qui reproduit l'empreinte,
  clés requises par le code présentes ET contrats identiques (PROMPT-09), aucune variable non
  résolue, empreinte de release juste, tests structurels réussis sur CETTE empreinte, benchmark
  approuvé sur cette empreinte en production.
- Évaluation : une release `staged` exacte, sous `prompt.evaluate`, données synthétiques, budget
  d'évaluation, pointeur intact.
- Épinglage : le devis retient la release pointée à cet instant ; le job exécute celle-là, même
  retirée depuis. Seule une révocation de sécurité le bloque, avec son motif.
- Permissions reçues en entrée. Cible plateforme : octroi plateforme. Cible espace : octroi de cet
  espace. Cible marque : octroi de cette marque ou de son espace. Un octroi plateforme ne couvre
  pas un espace (séparation stricte dans les deux sens). Correspondance retenue : brouillon et
  validation `prompt.draft`, retrait d'une version validée et publication `prompt.publish`,
  évaluation `prompt.evaluate`, rollback `prompt.rollback`.

### Budget de contexte

- Obligatoire, jamais tronqué : tout le contexte canonique (invariants, faits, références,
  documents, sélection, chemins, IDs, médias) et `taskInputs`, plus la réserve des messages fixes.
  S'il ne tient pas : `CONTEXT_BUDGET_INSUFFICIENT`, postes chiffrés triés, une proposition de
  simplification par poste. Rien n'est retiré à la place de l'utilisateur.
- Facultatif, dans l'ordre : extraits de sources, extraits de connaissances, historique. Chaque
  élément entier, tronqué (marque visible dans le texte) ou écarté, et chaque décision au rapport.
  Un extrait garde son début, l'historique garde sa fin.
- `CARACTERES_PAR_JETON = 3.5` repris de `spend-guard.ts` ; compteur injectable. Vérification
  finale sur la sérialisation réelle (un compteur non additif ne fait pas dépasser).
- `LONGUEUR_MAX_TEXTE = 12000` = `maxLength` du schéma (test de garde).

## Écarts et contradictions relevés dans le dossier

1. Les recettes n'ont pas de `contentHash` et `verify-pack.py` ne les vérifie pas. Décision :
   empreinte calculée à l'import avec le même algorithme, vérifiée si présente.
2. Le cahier limite les overrides aux « champs extensibles », le pack n'en déclare aucun.
   Décision : fermé par défaut ; la liste est une configuration à décider par le propriétaire.
3. `maximumRepairAttempts: 1` sans aucune consigne de réparation dans le pack. Écrire cette consigne
   dans le code ferait un prompt fonctionnel concurrent (interdit, §8.3). Décision :
   `evaluerSortie` dit si une réparation reste permise, mais aucun message de réparation n'est
   compilé ; ajouter un template de réparation au registre, ou traiter la limite comme 0.
4. Le schéma n'énumère aucun `schemaKey` de document métier (brief, concept, hypothèse, test,
   mesure). Décision : validateur de documents OBLIGATOIRE à l'entrée ; par défaut seuls `Shot`,
   `Style`, `Fact`, `Reference` (des `$defs`) sont connus ; tout autre `schemaKey` bloque.
5. `animation_compile_input` ne porte pas la capacité lipsync, ni `storyboard_plan_input` le mode
   sans texte. Décision : capacité passée par le serveur (registre fournisseurs) ; mode sans texte
   déduit du brief résolu (`texts: []`) ou imposé.
6. Le contexte n'a pas de champ pour signaler une troncature. Décision : marque dans le texte
   tronqué, décision au rapport de budget, à joindre au snapshot.
7. `releaseHashAlgorithm` ne fixe ni la forme ni l'ordre ; aucune empreinte de release de
   référence à comparer. Décision ci-dessus (forme et tris documentés, testés par mutation).
8. Aucun algorithme d'empreinte des `resolvedDocuments`. Décision : non recalculée ici ; une
   empreinte recopiée en sortie doit seulement exister dans le contexte.
9. Les exemples de `08-EXEMPLES-CONTRATS.json` sont des formes : plusieurs ne passeraient pas les
   contrôles sémantiques (par exemple `nextTemplateKey` absent de `availableActions` vide). C'est
   attendu ; ils prouvent le schéma, pas la sémantique.
10. Les index positionnels sont refusés dans les chemins : un identifiant stable purement numérique
    serait refusé aussi. L1 doit garder des identifiants opaques non numériques.

## Gardes et mutations

201 tests dans 8 fichiers. Chaque garde a été éprouvée en cassant ce qu'elle défend (64 mutations,
toutes tuées). Une mutation a d'abord survécu : M02 (échappement `\u` en majuscules) passait sur
`\u0001`, qui n'a pas de lettre ; la valeur de référence porte désormais `\u001f`. M57 ne retirait
pas vraiment l'invariant de la sortie ; M57b le retire et la garde tombe sur la liste des invariants.

## Ce que l'intégration serveur doit brancher

1. Export : ajouter le module à `packages/core` sans l'importer côté client. `contrats.ts` tire Ajv
   (génération de code par `new Function`) : préférer un export réservé au serveur à une
   réexportation depuis `index.ts`, que des composants client importent.
2. Source du pack et du schéma : lire `02-PROMPTS.json` et `03-CONTRATS.schema.json` côté serveur,
   `lirePackTexte` avec `defsSchema` et `casConnus`, puis `planifierImport` et écriture des
   brouillons en une transaction ; conflit = rien d'écrit.
3. Tables L1 : versions (type, clé, version, empreinte, statut, contenu), releases (portée, statut,
   empreinte, entrées, évaluation, révocation), pointeur actif par portée avec compare-and-set,
   overrides, audit append-only à chaque transition.
4. Actions ADMIN : `transitionVersion`, `controlerNouvelleVersion`, `publierRelease`,
   `rollbackRelease`, `retirerRelease`, `resoudreReleaseEvaluation`, `controlerOverride`, avec les
   octrois calculés depuis les rôles réels (mapping ADMIN+ → permissions logiques).
5. Contrats consommateurs : chaque studio et Jarvis déclarent les clés qu'ils consomment
   (`ContratConsommateur`) ; la publication les vérifie.
6. PromptResolver serveur unique : pointeur global → `resoudreTemplate` → ContextResolver (données
   L1, connaissances publiées de la portée via `connaissances.ts`, extraits `untrusted_data`) →
   `allouerContexte` → `compilerRequete` (validateur de documents, capacités fournisseurs,
   mode sans texte) → `sousPlafond` (spend-guard) → appel `packages/ai` sans outil →
   `evaluerSortie`.
7. PromptRun : clé, version, `contentHash`, release et empreinte, override, `compiledHash`,
   `contextSnapshotHash`, `taskInputsHash`, couches, rapport de budget, empreinte de sortie,
   modèle, coût, latence ; texte et traces réservés à ADMIN (`run.inspect_redacted`).
8. Devis et jobs : `epinglerAuDevis` au devis (release et empreinte dans le Quote), `releaseDuJob`
   dans le worker.
9. Validateurs de documents métier pour les `schemaKey` de L1 (brief, concept, hypothèse, test,
   mesure).
10. Décisions du propriétaire : champs extensibles, template de réparation, relecture du texte de
    `POLITIQUE_SERVEUR`, autorisation de dépense pour exécuter le benchmark F01-F24 (aucune
    release ne devient active en production sans benchmark approuvé sur son empreinte).
