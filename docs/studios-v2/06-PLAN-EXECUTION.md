# Plan de construction et de livraison

## 1. Lots et dépendances

| Lot | Livrable | Dépendances | Critère de sortie |
|---|---|---|---|
| L0 | Baseline SHA, mapping existant, sauvegarde de travail, #125 lectures pures | Reprise autorisée | BASE et dette lecture résolues, aucun lot D/E écrasé |
| L1 | Modèle canonique, ACL, versions, assets, droits et migrations additives | L0 | SEC, tests inter-tenant et accès directs |
| L2 | ADMIN prompts/connaissances, pack draft, releases et résolveurs | Contrats L1 stabilisés | PROMPT, activation réelle traçable et rollback |
| L3 | Devis/approbation, ledger, outbox/jobs/leases/adaptateurs | L1 + interfaces L2 | COST, crash/réconciliation/doublons |
| L4 | Jarvis commun, Veille→brief→projet→test, reprise/filiation | L1/L2 ; stub L3 disponible | FLOW, invariants métier et granularité variante |
| L5 | Studios Image/Pubs/Textes, édition et lots | L2/L3/L4 | IMG + parcours Textes/Pubs réel, droits/quotas conservés |
| L6 | Vidéo, identités, storyboard, voix, animation, imports et canvas | L2/L3/L4 + assets L5 | VIDEO, dépendances et modifications ciblées |
| L7 | Rendu/export partagé, contrôles techniques et QA | L5/L6 | EXPORT et préflight |
| L8 | Responsive, accessibilité, performance et benchmark créatif | L5/L6/L7 | UX et aucune anomalie critique acceptée |
| L9 | Migration vérifiée, pilote, rollback, CI, publication et observation | Tous lots acceptés | MIG et bilan92 exigences |

Parallélisme conseillé après interfaces stabilisées : agentA ADMIN/prompts, agentB éditeur Image/Pubs/Textes, agentC Vidéo/canvas. L’intégrateur conserve données/jobs/sécurité/navigation/tokens et coordonne les changements transversaux. Avant stabilisation L1/L2/L3, agents peuvent préparer tests/UX/contrats sur fichiers disjoints, pas inventer trois moteurs.

Chaque lot livre d’abord un parcours vertical utilisable avec fournisseurs simulés locaux, puis les autres branches d’erreur et la preuve réelle bornée. Le simulateur doit être explicitement réservé aux environnements de test ; aucun flag de production ne doit afficher ses médias comme générés réellement.

## 2. Carte d’intégration existante à revalider

Chemins rapportés par audit lot20 au SHA `702007774af23c8d23d3fe15ce26e6f208a4d84e`, relatifs à `product/`. Ils ne sont pas vérifiés dans le checkout de cette rédaction.

| Capacité | Fichiers/objets documentés | Travail cible |
|---|---|---|
| Veille | `apps/web/app/actions/inspo.ts`, `saved_ads`, `folder`, `packages/core/src/formats-creatifs.ts` | Sources versionnées et qualification existante conservées |
| Passage studio | `apps/web/lib/veille-link.ts` | Remplacer transport partiel par projet/contexte durable sans casser liens |
| Génération pubs | `apps/web/app/actions/ads.ts`, `generateAdsAction`, `cloneAdAction`, `declineAdAction`, `studio/ads/AdsStudio.tsx`, `AssistantPub.tsx` | Résolution prompts commune, devis/approval, variante par sortie |
| Brief/itération | `packages/core/src/brief-iteration.ts`, `brouillon-iteration.ts`, `PanneauIteration.tsx`, `RepriseIteration.tsx` | Hypothèse/invariants réellement transmis, filiation persistée |
| Adsmap bridge | `actions/adsmap-bridge.ts`, `trackGeneratedAdAction`, `trackSavedAdAction`, `packages/core/src/adsmap/passage-studio.ts` | Média choisi exact, idempotence et liens sources/tests |
| Complétude lots | `actions/adsmap-batch.ts`, `adsmap/Lots.tsx`, D `adsmap-completer.ts` | Réutiliser D/E après réconciliation, pas double formulaire |
| Résultats | `apps/web/lib/adsmap-sync.ts`, `metrics_daily`, `adsmap_verdicts` | Snapshots mesure avec attribution/période/portée |
| Apprentissage | `actions/adsmap-verdict.ts`, `adsmap_learnings`, `lib/jarvis-memory.ts`, `jarvisMemoryWithUse` | Mémoire disponible et versionnée dans contexte commun |
| Itérations | `actions/adsmap-iterate.ts`, `adsmap_iteration_edges` | Préserver règles gagnante/perdante ; diagnostic conservé sans faux lien |
| Connaissances | `packages/core/src/connaissances.ts`, `actions/connaissances.ts`, `api/jarvis/chat/route.ts`, `admin/connaissances/EcranConnaissances.tsx`, `JarvisContexte.tsx` | Extension registre/release, mêmes ACL, inclusion studio prouvée |
| Ancien assistant | `apps/web/app/actions/assistant.ts`, `packages/ai/src/chat.ts`, `askAssistant` | Unifier politique contexte/droits/budget sans casser usage |

Routes à maintenir : `/studio`, `/studio/image`, `/studio/video`, `/studio/ads`, `/studio/textes`, `/jarvis`, `/jarvis/sources`, `/admin/connaissances`, `/veille`, `/saved`, `/veille/formats`, `/adsmap` et ses sous-pages, `/dashboard?vue=analytics`. Proposer nouvelles sous-routes projet et ADMIN seulement après inventaire ; assurer redirects/deep links/historique.

Dettes historiques à qualifier dans L0/L1 : askAssistant session sans garde de rôle, historique client non validé, crédits non atomiques, `ai_spend.workspace_id` manquant, invitations/email E5, UI masquée sans garde serveur. Ne pas prétendre qu’elles sont toujours présentes sans relecture ; si présentes sur un chemin du nouveau studio, les fermer avant activation.

## 3. Commandes logiques et contrat d’erreur

Les noms sont des interfaces logiques ; réutiliser server actions/routes existantes si même contrat. Tous reçoivent contexte serveur authentifié, pas un tenant accepté aveuglément du client.

| Commande | Entrée utile | Effet autorisé |
|---|---|---|
| inspectProject / getJobStatus | id accessible | Lecture pure, pas de préparation cachée |
| resolveContext | taskKey, projectVersionId, selectionIds | Snapshot filtré, sans appel génératif |
| proposeBrief / proposePatch | taskKey, inputs, baseVersion | Appel texte sous politique coût autorisée ; stocke proposition, aucun média |
| applyProposal | proposalId, baseVersion | Nouvelle version document après contrôle des chemins ; pas génération |
| estimateImpact | version avant/après | DAG et sorties touchées, lecture/calcul |
| createQuote | inputHash, impactPlanId, opérations | Devis immuable, aucune dépense |
| approveAndEnqueue | quoteId, inputHash, idempotencyKey | Transaction approbation+réserve+job/outbox |
| cancelJob | jobId | Demande d’annulation bornée et réconciliation |
| acceptMedia / rejectMedia | assetId, version, review | Statut qualité/version accepté, pas coût ni régénération |
| saveDocument | projectId, baseVersion, patch | Version contrôlée, conflit409 sinon |
| requestExport | versionId, format, devis si coût existant | Job rendu depuis snapshot, aucune création créative |
| linkVariantToTest | variantId, testId/protocol | Filiation et droits, unicité selon domaine |
| activatePromptRelease | releaseId, expectedActiveVersion | Publication atomique après droits/évaluations |

Erreurs : `AUTH_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `VERSION_CONFLICT`, `INVALID_SCHEMA`, `UNSUPPORTED_CAPABILITY`, `MISSING_REFERENCE`, `INVARIANT_CONFLICT`, `QUOTE_EXPIRED`, `BUDGET_EXCEEDED`, `RATE_LIMITED`, `PROVIDER_UNCERTAIN`, `PERSISTENCE_FAILED`, `QUALITY_REVIEW_REQUIRED`. Réponse : code stable, message localisé, targetIds autorisés, recoverable, traceId, aucune donnée interne sensible. Distinguer404 neutre de403 selon politique de non-divulgation existante.

**Coûts des propositions texte :** créer un média exige le devis explicite. Les appels conversationnels/concepts peuvent eux-mêmes coûter : ils passent la garde et le plafond existants, sont journalisés et ne sont pas annoncés gratuits. Aucun message modèle ne déclenche un appel supplémentaire illimité. Si la politique actuelle exige devis pour ces appels, la respecter également.

## 4. Transitions et conditions

| Transition Job | Acteur | Précondition et effet atomique |
|---|---|---|
| création→queued | service commande | Approval exact, droits, solde ; outbox et réservation durable dans transaction, aucun appel externe dans transaction |
| queued→claimed | worker | Claim unique lease ; réservation existante confirmée, aucune seconde réserve |
| claimed→running | worker | Snapshot/capacité/droits contrôlés ; tentative durable, clé fournisseur avant soumission si possible |
| running→persisting | worker/webhook validé | Résultat fournisseur disponible, enregistrer requestId/état sans duplication |
| persisting→completed | finaliseur | Fichier décodable stocké, manifest et liens persistés, coût réconcilié ; QA reste séparée |
| état actif→cancel_requested | utilisateur autorisé | Arrêter étapes non soumises ; demander annulation si disponible |
| cancel_requested→cancelled | worker | Fin confirmée/réconciliée ; réserves restantes libérées selon ledger |
| actif→failed | worker | Échec certain ; coût/réserve traités selon résultat connu |
| actif→reconciliation_required | worker | Issue financière/fournisseur ambiguë ; aucun retry génératif aveugle |
| reconciliation_required→persisting/failed/cancelled | réconciliateur | Preuve statut provider et ledger ; action auditée |

Si l’état cancellation arrive après succès fournisseur, le résultat peut être persisté sans l’appliquer au projet courant ; conserver cause et coût. Une lease expirée ne suffit jamais à conclure que l’appel distant n’a pas eu lieu. Nouveau retry volontaire = nouvelle commande, nouveau devis et parentJobId. Idempotence doit conserver l’intention : deux variantes volontaires identiques ne sont pas le même job.

## 5. Contexte et compilation

Les schémas de tâche acceptent des IDs car le serveur charge les objets. Avant appel modèle, ContextResolver résout ces IDs en documents autorisés contenant réellement brief/plan/style/invariants et extraits source ; un ID seul n’est pas un prompt exploitable. Les contenus sont sérialisés comme données, jamais interpolés en code ou rôle system. Les documents doivent passer leur schéma métier existant/canonique avant inclusion.

Le JSON Schema du pack fixe l’enveloppe et les22sorties IA. Il n’est pas le schéma DB complet ni la preuve que les règles sémantiques sont respectées. Claude implémente aussi validations relationnelles, références autorisées, longueur texte, count réel, temps et allowedPaths. Les clés définies seulement par ID ne sont pas à inventer par le modèle : les IDs nouveaux sont fournis par le plan de tâche ou remplacés de façon contrôlée côté serveur.

Le fournisseur image/vidéo/voix ne reçoit pas l’enveloppe ready/blocked : l’adaptateur transforme `result` validé en paramètres natifs, associe les vrais médias autorisés et conserve empreinte du payload expurgé. Aucun placeholder non résolu n’est transmis. Instruction négative seulement si supportée ; sinon intégrer contraintes à la consigne et conserver la limite. Ne pas exposer URL signée au-delà du besoin fournisseur.

## 6. Checkpoint durable

`PROGRESS.json` à créer lors de l’exécution : versionDossier, SHA départ/courant, lot, propriétaire, branches, exigences avec statut/proofPath, migrations, versions prompts, fournisseurs vérifiés, dépenses autorisées/réelles, blocages et prochaine commande sûre. Statuts autorisés : TODO, IN_PROGRESS, IMPLEMENTED, LOCAL_VERIFIED, REAL_VERIFIED, ACCEPTED, DEPLOYED, PROD_OBSERVED, BLOCKED. La recette CSV reste le registre d’acceptation, pas une deuxième liste divergente.

À chaque checkpoint : indiquer exactement ce qui reste ; ne jamais demander « puis-je continuer ? » pour un lot déjà autorisé. Les interruptions de quota/CI/environnement sont reprises depuis cet état. Aucune estimation de temps fictive. Un blocage précise exigence, cause démontrée, solution préparée et ce qui nécessite effectivement Kevin.

## 7. Handoff de livraison

Rapport final : release/SHA/PR, liste des routes, état des92 exigences, parcours réels vérifiés et coût, captures au SHA final, audit sécurité/ACL, migrations/backfill/rollback, preuve ADMIN→PromptRun→fournisseur, provenance des fixtures, limites fournisseurs, déploiement VPS et version observée. Ajouter manuel utilisateur bref et runbooks ADMIN/exploitation. La publication attend la recette indépendante prévue ; l’intégration en continu n’efface pas cette étape.


## 8. Précisions contractuelles après revue indépendante

`claimed` désigne la prise en charge par un worker, jamais une deuxième réservation financière. Lease expirée avant soumission prouvée : retour queued sous garde atomique. Après soumission possible : réconciliation, aucun retry aveugle.

Context inclut `resolvedDocuments`, `sourceExcerpts`, `knowledgeExcerpts`, `allocatedIds` typés et `mediaBindings`. Le serveur associe chaque média à une pièce native fournisseur ; une liste d’IDs ne prouve pas qu’une image a été vue. Pour vidéo/audio dérivés, préciser séquences/temps couverts. Un asset absent ou non autorisé bloque la tâche, pas substitution automatique.

Patches : JSON Pointer sur collections indexées par IDs stables, opérations add/replace/remove. remove exige newValue=null ; une valeur null sous replace est une valeur et non une suppression. Interdire __proto__/constructor/prototype et indices positionnels fragiles, vérifier type et domaine de chaque chemin. La version de base et tous les champs hors allowedPaths doivent rester égaux.

Les22 templates pointent leurs cas F01–F24 dans09 en plus des tests communs. Les20premiers forment le socle créatif, les4derniers complètent orientation/hypothèses/concepts/musique. Exécuter positifs/négatifs et expliquer toute limite de modalité.
