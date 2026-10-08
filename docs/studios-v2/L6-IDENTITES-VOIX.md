# L6-B · Identités de personnages, contradictions, substitution produit, voix honnête

Lot L6-B du chantier Studios v1.0 (vague 6). Base : `claude/studios-base-vague6` (`66c2e8a`). Chemins relatifs à
`product/`. Ce document dit ce qui est tranché, pourquoi, et comment le vérifier. Il ne décrit aucun état : pour savoir
si une release est publiée, lire `studio_prompt_active` en base. Aucune migration, aucun appel réseau, aucune dépense.

Recettes visées : **VIDEO-02** (contradiction), **VIDEO-04** (substitution produit), **VIDEO-06** (voix exacte, durée
réelle), **VIDEO-07** (voix off contre lipsync).

## 1. Ce que le lot livre

| Livrable | Où |
| --- | --- |
| Règles pures · fiche d'identité, lexique fermé des couleurs, contradictions et résolutions, contrôle avant devis | `packages/core/src/studios/identites/{identite,lexique,contradictions,index}.ts` |
| Règles pures · capacités voix, modes de parole, seconde garde de `voice.prepare`, durée WAV/MP3 lue dans les octets, temps recalculés | `packages/core/src/studios/voix/{voix,duree-audio,index}.ts` |
| Export du noyau | une ligne en fin de `packages/core/src/index.ts` : `export * from './studios/identites';` (qui réexporte `../voix`) |
| Serveur · identités | `apps/web/lib/studios/identites/{commandes,devis}.ts` |
| Serveur · voix | `apps/web/lib/studios/voix/voix.ts` |
| Contrôle avant devis | UN appel dans `creerDevis` (`apps/web/lib/studios/execution/commandes.ts`) : `refusIdentitesDevis` |
| Contrôle visuel routé | `controlerSortieParVision` ajouté à `apps/web/lib/studios/produit/qualite.ts` |
| Actions | `apps/web/app/actions/studios/identites.ts` |
| Écran | `app/(app)/studio/projets/[id]/identites/page.tsx`, `components/studios/identites/EcranIdentites.tsx` |
| Navigation | une ligne dans `lib/navigation.ts` (`/studio/projets/[id]/identites`) |
| Tests | `packages/core/test/l6b-{identites,voix}.test.ts` (+ `l6b-fixtures.ts`, `fixtures/l6b-*`), `apps/web/test/l6b-{identites-db,qualite-vision-db,pages-rendu}.test.ts(x)` |

## 2. Où vit chaque objet (aucune table, aucune colonne nouvelle)

| Objet | Stockage | Pourquoi |
| --- | --- | --- |
| Fiche d'identité | `studio_project_versions.content.characterRefs[<identityId>]`, schéma `identite_studio/1` : `nom`, `version`, `attributs[] {id, categorie, element, couleur, detail}`, `vues`, `description` | Clé L1 existante. Le graphe d'impact (L1) hache déjà chaque entrée et la relie aux plans qui la citent : changer une fiche rend obsolètes exactement ces plans. |
| Liaison fiche ↔ plan | `shots.byId.<plan>.referenceIds` contient l'identifiant de la fiche | C'est ce que lit `impact.ts` ; aucune seconde liaison. |
| Version de la fiche | `version` dans la fiche, +1 seulement si le contenu change | « fiche identité versionnée » (cahier §4.5). La version du PROJET change aussi (commande L1). |
| Fiche ancienne (`{ tenue: 'pull bleu' }`) | relue en lecture seule (élément + couleur reconnus par le lexique) | Les fixtures L1 et d'éventuelles données existantes ont cette forme ; le contrôle ne doit pas être aveugle dessus, et rien n'est réécrit sans geste. |
| Prise de voix | `shots.byId.<plan>.voiceAssetId` → `studio_assets` (existant) | Durée lue dans les octets de la prise, jamais stockée à la main. |
| Mode de parole | `shots.byId.<plan>.speechMode` (`none` / `voiceover` / `lipsync`, L1) | Contrat `Shot`. |

## 3. Décisions et pourquoi

**Contradiction = règle déterministe, pas un modèle.** Le prompt `quality.consistency` le dit lui-même (« complète les
règles déterministes ; il ne les remplace pas et n'autorise pas l'exécution »). La règle bloquante est donc pure :
une couleur du lexique FERMÉ (vert, jaune, rouge… avec leurs accords) qui suit un élément de la fiche (« veste », ou le
nom générique de la catégorie : « tenue », « cheveux ») dans la même proposition, à 3 mots au plus, sans mot de
liaison entre les deux (et, avec, devant, sous, à…). La première couleur tranche. Une absence (« sans ses lunettes »)
contredit un accessoire ou une pièce de tenue. Champs lus : fonction, sujet, action, cadrage, caméra, décor,
narration ; PAS la lumière (« une lumière jaune sur la veste ») ni le texte écran (calque de composition). Une couleur
hors lexique est refusée à l'enregistrement de la fiche : le contrôle serait aveugle sur elle.

**Fenêtre mesurée, pas posée.** Corpus de 20 phrases écrites à la main (10 contradictoires, 10 cohérentes) dans
`l6b-identites.test.ts`, table recalculée par le test :

| fenêtre | contradictions vues / 10 | faux blocages / 10 |
| --- | --- | --- |
| 1 | 5 | 0 |
| 2 | 8 | 0 |
| 3 | 10 | 0 |
| 4 | 10 | 1 |
| 5 | 10 | 2 |

3 est le plus petit rang sans manque ni faux blocage ; le test échoue si la constante ne correspond plus à la table.

**Deux personnages dans un plan : le silence plutôt qu'un faux blocage.** Une couleur qui est celle du même élément
d'une AUTRE identité citée par le plan n'est pas une contradiction (« Tom en veste rouge, Léa en veste verte »).

**Deux résolutions explicites, recalculées par le serveur.** Chaque contradiction propose « Corriger le plan » (le mot
fautif remplacé par la couleur de la fiche, accordée en genre et en nombre) et « Changer la fiche » (nouvelle version
de la fiche ; les plans qui la citent sont nommés, et les contradictions qui resteraient sont comptées). Le client
n'envoie que l'identifiant de la contradiction et le choix ; le serveur relit la version de base, recalcule, refuse une
contradiction disparue, et écrit par `enregistrerVersion` (409, audit) avec le SEUL chemin touché comme chemin permis.
Une fiche ancienne n'offre que « Corriger le plan ».

**Blocage AVANT devis, en un point.** `creerDevis` appelle `refusIdentitesDevis` après le calcul des lignes et avant
tout insert : contradiction sur un plan dont une opération du devis dépend (`keyframe:`, `clip:`, `voix:` du plan, ou
`identite:` de la fiche) ⇒ `INVARIANT_CONFLICT` (409), message qui nomme le plan, la fiche et la marche à suivre, cibles
plan + identité ; aucun plan d'impact, aucun devis, aucun audit, donc rien à approuver ni à débiter. Un devis qui ne lit
pas le plan contradictoire (autre plan, montage, export) part.

**VIDEO-04 : la vision décide, la réussite technique jamais.** `controlerSortieParVision` relit les médias livrés par un
job `completed` (`result.assets`, médias `sta_` de la marque du job), les envoie en pièces natives à `quality.visual`
(vision routée F-D, octets lus par le serveur, barrière de l'adaptateur réel) avec la référence Produit épinglée et un
critère par composant obligatoire, puis passe la sortie VALIDÉE à `verdictComposants` (L5-C) : composant nommé absent
par un défaut bloquant ou majeur ⇒ `rejected` (même si le verdict global dit `passed`), douteux ⇒ `requires_review`,
`passed` seulement si tout est confirmé. Sans release, sans fournisseur, plafond atteint, média illisible ou altéré,
sortie bloquée ou invalide : AUCUN contrôle ⇒ `requires_review`, motif rendu et audité. La photo épinglée (`pph_`) part
comme référence textuelle, pas comme image : le résolveur vision F-D ne lit que les médias studio.

**Voix : disponible seulement avec un tarif ET un fournisseur.** `capacitesVoix` dérive la disponibilité de
`GRILLE_STUDIO.speech` (aucun tarif voix dans l'offre) et de `FOURNISSEURS_VOIX` (aucun adaptateur de synthèse ni de
lipsync). Les deux manquent : synthèse et lipsync INDISPONIBLES, dits tels à l'écran. La voix off reste proposée (elle
n'exige aucune synchronisation ; la prise vient d'un fichier existant). Le lipsync n'est jamais simulé : option
`disabled` à l'écran, refus `UNSUPPORTED_CAPABILITY` par le serveur si le client force le mode, alerte et bouton
« Passer en voix off » pour un plan déjà en lipsync.

**Texte prononcé = narration validée.** `preparerTexteVoixPour` lit la narration du plan dans la version COURANTE (une
base périmée est refusée avant l'appel), l'envoie à `voice.prepare` par `executerTache`, puis applique la seconde garde
`garderTexteVoix` : préambule, ajout final, réécriture, direction vocale mêlée au texte, prononciation hors texte, voix
ou langue changées ⇒ refus nommé. Le registre refuse déjà une sortie différente (`NARRATION_REECRITE`) ; la seconde
garde attrape ce qu'il ne regarde pas (prononciations, direction). Aucun bouton ne déclenche cet appel tant qu'aucune
synthèse n'existe : payer un appel texte pour une voix impossible n'a pas de sens.

**Durée réelle lue dans les octets.** `mesurerDureeAudio` : WAV (`fmt ` puis `data`, trames entières / fréquence ;
`data` annoncé plus long que le fichier ⇒ mesuré sur ce qui est présent et dit tronqué) ; MP3 (ID3v2 sauté, deux
en-têtes enchaînés exigés, Xing/Info ou VBRI si présent, sinon chaque trame parcourue jusqu'à `TAG`/`APETAGEX` ; débit
libre, fréquence variable, moins de deux trames ⇒ refus, jamais d'estimation). Les prises sont relues dans la portée ET
la marque du projet, empreinte vérifiée. `recalculerTemps` : une prise plus longue que son plan l'allonge (on ne coupe
pas une phrase), cible = somme des durées estimées, dépassement écrit.

## 4. Preuves

| Exigence | Garde | Ce qui est lu |
| --- | --- | --- |
| VIDEO-02 | `l6b-identites` (noyau), `l6b-identites-db`, `l6b-pages-rendu` | Contradiction du plan 2 seule, message exact, deux résolutions (texte corrigé « Léa court en veste verte, cheveux au vent ») ; en base : `creerDevis` ⇒ `INVARIANT_CONFLICT` 409, cibles `[s2, perso_lea]`, delta de TOUTES les tables (propositions, plans d'impact, versions, devis, approbations, jobs, registre, outbox, crédits, dépenses, audit, traces) = `{}`, solde inchangé ; résolution « plan » ⇒ version 2, audit « Contradiction résolue sur le plan s2… », plan 1 identique ; devis accepté sur la version 2 (2 images), solde inchangé, débit de 2 images à l'approbation seulement ; résolution « fiche » ⇒ fiche version 2, plan 1 bloqué à son tour ; périmée ⇒ refus, 409 au second onglet ; lecteur `FORBIDDEN`, autre espace `NOT_FOUND`. HTML : « Devis bloqué », deux boutons de résolution, impact de la résolution « fiche ». |
| VIDEO-04 | `l6b-qualite-vision-db` | Job `completed` à média stocké ; sans release : 0 appel, `requires_review` en base, audit avec motif ; avec release : la vision reçoit la sortie en pièce native (sha256 des octets), le critère « Composant obligatoire visible et intact : lunettes » ; « boîte à la place des lunettes » ⇒ `rejected` en base, état `completed` inchangé ; `passed` + défaut majeur sur les lunettes ⇒ `rejected` ; invérifiable ⇒ `requires_review` ; sortie invalide ou média altéré ⇒ `requires_review` ; tout confirmé ⇒ `passed`. |
| VIDEO-06 | `l6b-voix` (noyau), `l6b-identites-db`, `l6b-pages-rendu` | Fixtures RÉELLES générées localement (`fixtures/l6b-generer-audio.py`) : WAV 1 700 ms et 250 ms (= module `wave` de Python), MP3 CBR 2 612 ms et Xing 1 306 ms (= décodeur de Chromium, `decodeAudioData` : 2,6122448979591835 s et 1,3061224489795917 s) ; WAV tronqué, MP3 corrompu, format inconnu ; seconde garde (préambule nommé, ajout, réécriture, direction, prononciation, voix, langue) ; en base : prises WAV et MP3 mesurées, prise altérée et prise d'une autre marque refusées, temps recalculés ; `voice.prepare` : sans release refus sans appel ni trace, avec release la narration du plan est dans le message envoyé, préambule refusé (registre), prononciation hors texte refusée (seconde garde), sortie exacte acceptée ; plan sans voix ⇒ aucun appel. HTML : « Synthèse vocale indisponible… », « durée mesurée 1,70 s (lue dans l'en-tête WAV) », dépassement écrit. |
| VIDEO-07 | `l6b-voix` (noyau), `l6b-identites-db`, `l6b-pages-rendu` | Disponibilité exigeant tarif ET fournisseur (quatre combinaisons) ; lipsync refusé par le serveur (`UNSUPPORTED_CAPABILITY`, « Elle n'est jamais simulée »), 0 ligne ; voix off posée (version 2) ; HTML : chaque `option[value=lipsync]` est `disabled` (« · indisponible »), carte lipsync « Indisponible » avec sa raison, voix off « Proposé », alerte « Parole synchronisée demandée sans fournisseur · plan 1 » et bouton « Passer en voix off ». |

## 5. Mutations

Chaque garde a été cassée volontairement (script hors dépôt : mutation appliquée, tests ciblés lancés, fichier
restauré, arbre propre vérifié par `git status`). Aucune n'a survécu au premier passage.

| Mutation | Garde qui tombe | Phrase d'échec |
| --- | --- | --- |
| M01 contrôle des identités retiré de `creerDevis` | `l6b-identites-db` | `expected { ok: true, devis: { …(10) }, …(1) } to match object { ok: false, …(4) }` |
| M02 fenêtre posée à 1 | `l6b-identites` | `expected 1 to be 3` (table mesurée) |
| M03 couleur attendue non comparée | `l6b-identites` | `expected [ { …(12) }, { …(12) } ] to have a length of 1 but got 2` |
| M04 ambiguïté entre deux personnages ignorée | `l6b-identites` | `expected [ { …(12) }, { …(12) } ] to deeply equal []` · `expected [ [ 1, 5, 1 ], [ 2, 8, 1 ], …(3) ] to deeply equal [ [ 1, 5, +0 ], …` |
| M05 devis bloqué quelles que soient les opérations | `l6b-identites` | `expected [ { …(12) } ] to deeply equal []` |
| M06 résolution « plan » sans correction | `l6b-identites` | `expected [ { type: 'plan', …(4) }, …(1) ] to deeply equal [ { type: 'plan', …(4) }, …(1) ]` |
| M07 lipsync dit disponible | `l6b-voix` | `expected true to be false` |
| M08 serveur accepte le lipsync | `l6b-identites-db` | `expected { ok: true, version: { …(13) }, …(1) } to match object { ok: false, …(2) }` |
| M09 option lipsync activable à l'écran | `l6b-pages-rendu` | `expected false to be true` |
| M10 absence de vision lue comme succès | `l6b-qualite-vision-db` | `expected { ok: true, qualite: 'passed', …(4) } to match object { ok: true, …(4) }` |
| M11 sortie de la vision non lue | `l6b-qualite-vision-db` | `expected { ok: true, qualite: 'passed', …(4) } to match object { ok: true, qualite: 'rejected', …(3) }` |
| M12 seconde garde de la voix non appliquée | `l6b-identites-db` | `expected { ok: true, statut: 'pret', …(6) } to match object { ok: false, statut: 'refuse', …(1) }` |
| M13 préambule non nommé | `l6b-voix` | `expected [ 'REECRITURE' ] to deeply equal [ 'PREAMBULE' ]` |
| M14 WAV tronqué mesuré sur la taille annoncée | `l6b-voix` | `expected { ok: true, format: 'wav', …(7) } to match object { ok: true, dureeMs: 1000, …(1) }` |
| M15 en-tête Xing ignoré | `l6b-voix` | `expected { ok: true, format: 'mp3', …(7) } to deeply equal { ok: true, format: 'mp3', …(7) }` |
| M16 prise lue sans vérifier l'empreinte | `l6b-identites-db` | `expected { etat: 'mesuree', …(5) } to match object { etat: 'illisible', …(1) }` |
| M17 prise d'une autre marque acceptée | `l6b-identites-db` | `expected { etat: 'mesuree', …(5) } to match object { etat: 'illisible', …(1) }` |
| M18 absence (« sans ses lunettes ») non vue | `l6b-identites` | `expected undefined to match object { shotId: 's1', champ: 'action', …(2) }` |
| M19 couleur hors lexique acceptée dans une fiche | `l6b-identites-db` | `expected { ok: true, version: { …(13) }, …(1) } to match object { ok: false, …(2) }` |
| Libellé « Cheveux · cheveux bruns » (vu sur capture, corrigé) | `l6b-pages-rendu` | `expected [ 'Tenue · veste verte', …(2) ] to deeply equal [ 'Tenue · veste verte', …(2) ]` |

## 6. Besoins hors périmètre (intégrateur)

1. **Lien depuis la page projet** · `components/studios/projet/VueProjet.tsx` (non modifié, L6-A y ajoute des liens) :
   « Identités et voix » → `/studio/projets/<id>/identites`.
2. **Appel du contrôle visuel** · `controlerSortieParVision(ctx, { jobId }, dependancesTextesProduction())` n'est
   déclenché par aucun écran : il coûte une tâche vision (≤ 0,218 $ avec le modèle routé, F-D) et doit être proposé
   avec son prix annoncé (carte d'un média livré) ou appelé par la finalisation d'un job avec une politique de budget.
3. **Raccord L6-A** · si L6-A exige une consigne compilée pour `keyframe:<plan>` dans `creerDevis`, le test « devis
   accepté après résolution » (`l6b-identites-db`) devra semer cette consigne : l'ordre des contrôles est
   lignes → vidéo non vérifiable → identités → épinglage → raccord image.
4. **Vision sur la photo produit** · le résolveur F-D ne lit pas les photos `pph_` : la référence Produit part en texte.
   Lire la photo épinglée en pièce native renforcerait VIDEO-04.
5. **Prises de voix** · aucun import de prise audio n'existe dans `studio_assets` ; la mesure lit `voiceAssetId` quand
   il existe. Un import (dépôt, empreinte, `duration_ms` rempli par `mesurerDureeAudio`) donnerait la préécoute.

## 7. Limites

- Aucune release n'est publiée en local : `quality.visual` et `voice.prepare` sont prouvés par les tests (registre
  réel sur pglite, fournisseur simulé) ; les captures montrent l'état honnête.
- Le contrôle des contradictions ne lit que le lexique fermé et des tournures simples ; une tournure hors corpus
  (« la veste, jaune elle aussi ») n'est pas vue : le silence est préféré au faux blocage.
- La fiche n'est pas rédigée par `character.spec` (saisie manuelle) ; la planche de vues n'est pas générée.
- Les durées MP3 sont celles des trames ; le retard d'encodeur (en-tête LAME) n'est pas retranché.
