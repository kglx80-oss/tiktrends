# F-B · Parcours image de bout en bout : consigne compilée → devis → approbation → job → média

Lot F-B du chantier Studios v1.0 (vague 5). Base : `claude/studios-base-vague5b` (`bf99691`, intégration L0-L5 + F-A).
Chemins relatifs à `product/`. Ce document dit **ce qui est tranché, pourquoi, et comment le vérifier**. Il ne décrit
aucun état de production. Aucune migration, aucun appel réseau réel, aucune dépense : 0 $.

## 1. Ce que le lot livre

| Livrable | Où |
| --- | --- |
| Règles pures · consigne persistable, patch de version, verdict, empreinte d'entrée du devis image, prix du barème, disponibilités, mots de l'écran | `packages/core/src/studios/image/parcours.ts` (+ une ligne en fin de `packages/core/src/index.ts`) |
| Serveur · résolution des références dans le catalogue de la marque | `apps/web/lib/studios/image/references.ts` |
| Serveur · attestation, vérification d'une consigne | `apps/web/lib/studios/image/verification.ts` |
| Serveur · compiler et attester, retenir | `apps/web/lib/studios/image/consigne.ts` |
| Serveur · raccord au devis et à l'approbation L3 | `apps/web/lib/studios/image/raccord.ts`, appelé par `apps/web/lib/studios/execution/commandes.ts` |
| Serveur · lecture du parcours, devis, lancement, contrôle du média | `apps/web/lib/studios/image/parcours.ts` |
| Actions | `apps/web/app/actions/studios/image.ts` |
| Écran | `apps/web/components/studios/image/{ParcoursImage,VueParcours}.tsx`, monté dans `components/studios/produit/EcranProduit.tsx` |
| Tests | `packages/core/test/fb-parcours-image.test.ts`, `apps/web/test/fb-parcours-db.test.ts`, `apps/web/test/fb-ecran-rendu.test.tsx`, semis de recette `apps/web/test/fb-semis-recette.test.ts` (ignoré sauf base locale explicite) |

`compilation.ts` (L5-C) n'a pas été modifié : la compilation est enveloppée, pas réécrite.

## 2. Décisions et pourquoi

**Où vit la consigne compilée.** `studio_prompt_runs` ne garde que l'empreinte du TEXTE rendu par le modèle
(`sha256Texte(reponse.texte)`, par construction de la trace) et la consigne finale porte en plus les interdits du
serveur : on ne peut ni la relire ni la reconstruire depuis la trace. Elle est donc conservée en deux temps :

1. **Attestation** · après une compilation acceptée (contrôle avant, `executerTache('image.compile')`, contrôle après,
   consigne finale L5-C), le serveur écrit dans `studio_audit_events` (ajout seul, déclencheur en base) l'action
   `image.consigne.compilee`, cible le projet, `version_before` = version compilée, détails = `{ runId, empreinte,
   consigne }` (schéma `consigne_image/1` : consigne finale, références LIÉES avec version et empreinte vues à la
   compilation, format, mode, empreinte du brief et du produit compilés).
2. **Version** · « Retenir » ne reçoit du navigateur que le `runId` : le serveur relit l'attestation de CE projet,
   vérifie que le brief et le produit n'ont pas changé depuis la compilation, puis écrit une nouvelle version par
   `enregistrerVersion` (base obligatoire, 409, audit) sur deux chemins seulement : `styleRef.consigneImage` (la
   recette de rendu) et le plan `s_image`, dont l'image clé `keyframe:s_image` est l'opération payante du studio Image
   (`image_generation` au barème). Le reste de `styleRef` est conservé.

Pourquoi l'attestation en plus de la version : l'éditeur (`enregistrerDocument`) peut écrire tout le contenu, donc une
consigne dans le contenu peut venir du navigateur. Le devis et l'approbation n'acceptent qu'une consigne dont
l'empreinte est ATTESTÉE pour ce projet ; une consigne écrite à la main n'est jamais exécutée (garde « non attestée »).

**Devis.** `creerDevis` (raccord `raccordImageDevis`, dans la transaction) exige pour `keyframe:s_image` une consigne
présente, attestée, compilée sur le brief et le produit courants, des références encore là, identiques (version ET
empreinte) et transmissibles. L'empreinte d'entrée devient `empreinteEntreesDevisImage(entrées L3, empreinte de la
consigne)` ; l'audit `quote.create` porte `consigneImage`. La version étant immuable, une consigne changée est une autre
version : l'approbation du devis précédent est refusée (`VERSION_CONFLICT`). L'image se devise seule (le fournisseur
rendrait autant d'images de LA MÊME consigne qu'il y a d'opérations image). Chaque devis de l'écran est une variante
volontaire (`variante: true`) : une image de plus.

**Approbation.** `approuverEtMettreEnFile` construit `snapshot.parametres` par `parametresImageDuDevis` (F-A) à partir
de la consigne de la version DEVISÉE, revérifiée maintenant (attestation, références relues dans la marque du projet).
Le calcul se fait avant la transaction (lecture seule, aucun verrou pglite), le refus éventuel est rendu dans la
transaction APRÈS les contrôles L3 (expiration, version, déjà approuvé). Sans consigne exécutable : refus, rien débité,
jamais `{}`. **Les autres opérations gardent `{}` et leur empreinte L3** (garde « autres opérations »).

**Références revérifiées, sans substitution.** Même résolution que le catalogue L5-C et le worker F-A (`pph_`, `logo_`,
`bib_`, `sta_`), par l'exécuteur de l'appelant. Une source concurrente n'a pas de média transmissible : une consigne qui
la LIE est refusée au devis (`UNSUPPORTED_CAPABILITY`, motif écrit) au lieu de débiter un job que le worker bloquerait
(décision F-A). Le style d'une annonce concurrente passe par le texte de la consigne.

**Lancement.** L'action `approuverEtLancerImage` refuse quand le fournisseur d'images n'est pas branché
(`decisionFournisseurStudio(process.env)`, même règle que le worker) : sans worker, la réserve resterait bloquée.

**Média et qualité.** Le worker range la sortie dans `studio_assets` (`generated`, projet du job) : elle apparaît dans
les médias de l'éditeur L5-B sans autre geste. Le worker laisse la qualité `pending` (fal ne rend pas de constat).
`controlerMediaPour` applique le contrôle L5-C (`controlerComposantsSortie`, contrôle visuel `null` faute de vision
routée) ⇒ `requires_review`, jamais `passed`. Ce contrôle est un POST explicite que l'écran envoie UNE fois quand il voit
un média livré en `pending` ; l'affichage de la page n'écrit jamais rien (BASE-03).

**Écran : sur « Produit et références ».** La compilation dépend de la photo épinglée, des rôles des références et du
contrôle avant compilation, tous sur cette page ; le parcours s'y place juste après ce contrôle. L'éditeur de calques
(L5-B) reste un lieu SANS génération (« Aucune génération d'image ») : y mettre un bouton payant brouillerait ce
contrat. Le média livré y est rangé ; un lien « Ouvrir l'éditeur d'image » y mène. Quatre gestes séparés et nommés :
compiler (appel texte payant, coût maximal annoncé), retenir (version, gratuit), demander un devis (gratuit, prix figé
30 min), approuver et lancer (débit). Prix annoncé AVANT le clic en crédits ET dollars, depuis le barème. Un geste
indisponible est un bouton inactif accompagné de sa raison. La clé du clic « Approuver et lancer » est gardée par
devis dans `sessionStorage` (aucun second débit sur double clic ou reprise). Le nom du prestataire n'apparaît pas dans
une raison d'échec (« le fournisseur »).

## 3. Preuves (résultat lu)

| Exigence | Garde | Ce qui est lu |
| --- | --- | --- |
| Parcours complet | `fb-parcours-db` (pglite, adaptateur texte simulé, moteur du worker avec le fournisseur fal de PRODUCTION contre un `fetch` rejoué) | compilation : `{runs: 1, audit: 1}`, version inchangée ; version retenue : `consigneDuContenu` = consigne attestée, plan `s_image` ; devis : `[keyframe:s_image, image_generation, 4, 80 000]`, `inputHash` recalculé avec l'empreinte de la consigne ; approbation : solde −4, `snapshot.parametres` = `parametresDepuisConsigne(...)`, relu par `lireParametresImage` ; worker : 1 POST, `prompt` = `promptFal(consigne)`, `image_urls` = [la photo n°5], ratio 4:5, audit `job.provider.payload` (édition, photo) ; média `generated/stored/image/png` du projet, seul média de `lireEditeurPour` ; qualité `pending` après le worker, inchangée par la lecture, `requires_review` après contrôle (audit `nonVerifies: [lunettes, bandeau]`), idempotent |
| COST-04 | `fb-parcours-db` | consigne recompilée et retenue après le devis ⇒ `VERSION_CONFLICT`, 0 job, 0 approbation, 0 registre, 0 débit |
| SEC-08, PROMPT-04 | `fb-parcours-db`, `fb-parcours-image` | photo retirée du catalogue entre devis et approbation ⇒ `MISSING_REFERENCE` ciblant la photo, « Rien n'a été débité », solde intact ; nouveau devis refusé ; liaison vers une annonce concurrente ⇒ `UNSUPPORTED_CAPABILITY` |
| Plus jamais `{}` | `fb-parcours-db` | plan `s_image` sans consigne : devis refusé, 0 ligne ; devis inséré à la main refusé à l'approbation, 0 job |
| Consigne forgée | `fb-parcours-db` | consigne réécrite par le chemin de l'éditeur (non attestée) ⇒ devis refusé, 0 ligne |
| FLOW-06 | `fb-parcours-db` | retenir : `runId` d'un autre projet refusé, base périmée ⇒ 409, brief changé depuis la compilation ⇒ refus, 0 ligne |
| SEC-01, SEC-02, SEC-03 | `fb-parcours-db` | lecteur client : FORBIDDEN sur compiler, retenir, devis, lancer, lire, contrôler, 0 appel modèle ; rôle `studio.read` seul : aucun geste disponible ; autre espace : `NOT_FOUND` sans cible, identique à un identifiant inconnu |
| COST-05 | `fb-parcours-db` | devis : `devis +1, audit +1`, aucun job, approbation, crédit, registre |
| IMG-03 (contribution) | `fb-parcours-db`, `fb-ecran-rendu` | `requires_review` en base ; écran « À relire · aucun contrôle visuel automatique… », relecture composant par composant sans présomption |
| BASE-03 (contribution) | `fb-parcours-db`, `fb-ecran-rendu` | la lecture du parcours n'écrit pas la qualité ; rendu serveur « Chargement… », aucune action appelée |
| COST-01 (contribution, écran) | `fb-ecran-rendu` | deux clics « Approuver et lancer » ⇒ même `idempotencyKey` |
| Écran | `fb-ecran-rendu` | HTML : indisponibilités dites (sans release, sans fournisseur d'images, lecteur), coût de compilation « 0,14 $ au plus », prix « 4 crédits · 0,08 $ au plus de coût fournisseur » avant le clic, devis et bouton séparé, jobs en file / en cours / réconciliation / échec avec raison / terminé avec média et statut, texte hostile rendu comme texte |

Parcours réel sur le build de production (base locale, données fictives, Chromium en CDP), en cliquant : « Retenir
cette consigne » ⇒ version 3 « Consigne image retenue · compilation a26cd706 » ; « Demander un devis » ⇒ 1 devis,
« Approuver et lancer » inactif avec sa raison (fournisseur d'images non branché en local), 0 approbation, 0 job,
solde inchangé. Captures 1440 / 1280 / 390 : sans release, parcours, devis et jobs, média livré, échec, consigne en
attente ; aucun débordement horizontal.

## 4. Mutations (cassées volontairement, échec constaté, code restauré)

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 `parametres: {}` à l'approbation | `fb-parcours-db` | `expected {} to deeply equal { schema: 'studio_image/1', …(4) }` |
| M02 refus image ignoré à l'approbation | `fb-parcours-db` | `expected { Object (ok, job, ...) } to match object { ok: false, …(2) }` |
| M03 attestation non vérifiée | `fb-parcours-db` | `expected { ok: true, devis: { …(10) } } to match object { ok: false, code: 'INVALID_SCHEMA' }` |
| M04 `inputHash` sans la consigne | `fb-parcours-db` | `expected '053a1332…' to be '3ee763f0…'` |
| M05 références non comparées | `fb-parcours-image`, `fb-parcours-db` | `expected { ok: true } to match object { ok: false, …(3) }` |
| M06 liaison non transmissible acceptée | `fb-parcours-image`, `fb-parcours-db` | `expected { ok: true, devis: { …(10) } } to match object { ok: false, …(2) }` |
| M07 consigne périmée acceptée | `fb-parcours-image`, `fb-parcours-db` | `expected { ok: true } to match object { ok: false, cause: 'perimee', …(1) }` · `expected { ok: true, devis: … } to match object { ok: false, code: 'VERSION_CONFLICT' }` (ne tombait qu'au noyau au premier passage : garde en base ajoutée) |
| M08 retenir sans contrôle du brief | `fb-parcours-db` | `expected { ok: true, version: { …(13) }, …(2) } to match object { ok: false, code: 'VERSION_CONFLICT' }` |
| M09 `runId` d'un autre projet accepté | `fb-parcours-db` | `expected { ok: true, version: { …(13) }, …(2) } to match object { Object (ok, code) }` |
| M10 lancement sans fournisseur d'images | `fb-parcours-db` | `expected { Object (ok, job, ...) } to match object { ok: false, …(1) }` |
| M11 la lecture contrôle la qualité | `fb-parcours-db` | `expected 'requires_review' to be 'pending'` |
| M12 média livré jamais contrôlé | `fb-parcours-db` | `expected { ok: true, qualite: 'pending' } to deeply equal { Object (ok, qualite) }` |
| M13 image mélangée à une autre génération | `fb-parcours-image`, `fb-parcours-db` | `expected { concerne: true, horsImage: [] } to deeply equal { concerne: true, …(1) }` |
| M14 raccord sur toute image (pas seulement `s_image`) | `fb-parcours-image`, `fb-parcours-db`, `l3-commandes` | `expected { concerne: true, …(1) } to deeply equal { concerne: false }` |
| M15 référence inventée acceptée | `fb-parcours-image` | `expected { ok: true, consigne: { …(9) }, …(1) } to deeply equal { ok: false, …(1) }` |
| M16 prix non annoncé avant le clic | `fb-ecran-rendu` | `expected 'Une image · barème du produit.' to be 'Une image · 4 crédits · 0,08 $ au plu…'` |
| M17 « Approuver et lancer » actif sans fournisseur | `fb-ecran-rendu` | `expected false to be true` |
| M18 nouvelle clé à chaque clic | `fb-ecran-rendu` | `expected 'img-a0ba…' to be 'img-ff1e…'` |
| M19 contrôle redemandé à chaque lecture | `fb-ecran-rendu` | `expected "spy" to be called 1 times, but got 4 times` (**survivait** au premier passage : la lecture simulée rendait le même objet ; garde renforcée) |
| M20 compilation dite disponible sans release | `fb-parcours-image`, `fb-ecran-rendu` | `expected { disponible: true, raison: '' } to deeply equal { disponible: false, …(1) }` |
| M21 compiler sans attester | `fb-parcours-db` | `expected { runs: 1 } to deeply equal { runs: 1, audit: 1 }` |
| M22 nom du prestataire affiché | `fb-parcours-image` | `expected 'sortie keyframe:s_image non décodable…' to be 'sortie keyframe:s_image non décodable…'` |
| M23 identifiant au lieu du nom du fichier | `fb-parcours-db` | `expected { …(10) } to match object { verdict: { ok: true }, …(1) }` |
| M24 premier mode au lieu de celui de la consigne | `fb-ecran-rendu` | `expected 'false' to be 'true'` |

## 5. Limites

- **Aucune exécution réelle.** Le corps envoyé à fal est celui que le worker F-A construit et que la garde lit ; que fal
  l'accepte et rende une image fidèle, seul un appel réel le dit (budget du propriétaire).
- **Aucune release publiée en local** : la compilation est prouvée par les tests (registre réel sur pglite, adaptateur
  simulé) ; les captures montrent l'état honnête « indisponible ».
- **Vidéo et fiches d'identité** : leurs images clés (`keyframe:<plan>` hors `s_image`, `identite:*`) gardent
  `parametres: {}` (comportement L3, gardé par les tests L3/L4-C) et restent bloquées AVANT tout appel par le worker F-A
  (0 $, crédits rendus) ; leur consigne vient d'autres tâches (`shot.image`, `character.spec`).
- **Annonce concurrente liée** : une consigne qui lie l'image d'une annonce concurrente n'est pas lançable (le
  fournisseur ne la reçoit pas). Le modèle peut la lier ; l'écran le dit et demande de retirer l'association.
- **Course approbation/exécution** : une référence retirée APRÈS l'approbation est bloquée par le worker
  (`MISSING_REFERENCE`, 0 appel, crédits rendus), pas par l'approbation.
- **Contrôle qualité** : appliqué par l'écran (POST) à la première vue du média livré, pas par le worker. Un média que
  personne n'ouvre reste `pending` (jamais `passed`).
- **Action L3 générique** : `approuverEtMettreEnFile` (actions `execution.ts`) construit bien les paramètres de l'image,
  mais ne refuse pas l'absence de fournisseur branché ; seule l'action du parcours le fait.

## 6. Besoins hors périmètre (l'intégrateur tranche)

1. **Worker** (`apps/workers/src/studios/moteur.ts`) : appliquer le contrôle des composants (`verdictComposants`, acteur
   `controle`) à la finalisation d'un job `keyframe:s_image`, pour ne plus dépendre de l'écran.
2. **Action L3** (`app/actions/studios/execution.ts`) : refuser `approuverEtMettreEnFile` quand
   `decisionFournisseurStudio` refuse, pour toute opération payante (même règle que l'action du parcours).
3. **Vidéo** : refuser à l'approbation les images clés sans consigne (`shot.image`), une fois les tests L3/L4-C mis à
   jour avec une consigne ; aujourd'hui ils approuvent `keyframe:s1` avec `{}`.
4. **`compilation.ts`** : la compilation brute (`compilerConsigneImage`, actions `produit.ts`) n'atteste pas ; son
   résultat ne peut pas être retenu. Faire passer cette action par `compilerEtAttesterPour` ou la retirer.
5. **Navigation** : aucune page nouvelle (monté dans une page existante), aucune entrée ajoutée.
