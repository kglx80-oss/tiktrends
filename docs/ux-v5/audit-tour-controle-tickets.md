# Audit · le Tour de contrôle et les tickets

Recalé sur main 51507ba, 2026-11-15. Signalement de l'agent de #1086 · « le
Tour de contrôle (`W/app/(spatial)/sp/admin/donnees.ts` et ses pages) lit tous
les tickets de la plateforme sans relire le rôle d'équipe au chargement des
messages ».

**Conclusion · rien ne se reproduit.** Aucun code produit n'est modifié. Le
comportement correct est FIGÉ par `W/test/tdc-tickets-droits-db.test.tsx`
(base réelle, VRAI `getSession` sur un jeton signé, vraies pages, vraies
actions · 14 tests, 17 mutations tombées, journal `mutations-A.log`).

`W` = `product/apps/web`, `C` = `product/packages/core/src`.

## La porte, et d'où elle lit

`porteAdmin` / `porteAdminGeste` (`W/app/(spatial)/sp/admin/donnees.ts`) ·
connecté, `roleAtLeast(rôle, 'admin')` dans l'espace courant ET `isFounder`.

| Ce que la porte lit | D'où | Relu à chaque requête |
| --- | --- | --- |
| le compte | `users` par l'identifiant du jeton (`getSession`, `W/lib/auth.ts`) | oui |
| l'époque de session (mot de passe changé) | `users.session_epoch` contre celle du jeton | oui |
| l'espace courant et le rôle d'espace | `workspace_members`, puis `workspaces` | oui |
| fondateur | liste codée (`W/lib/founder.ts`) unie à `FOUNDER_EMAILS`, relue dans l'environnement à chaque appel | oui |
| rôle d'équipe plateforme | `platform_staff` et la matrice (`equipeDeSession`) · lus par `getSession`, **la porte du Tour ne les lit pas** | sans objet |

Le rôle d'équipe n'ouvre PAS le Tour · aucune rubrique de la matrice
(`RUBRIQUES_PLATEFORME`, `C/equipe-plateforme.ts`) ne le gouverne, et la
sous-navigation lit la règle de la page (`droitsSousNavAdmin().tour`,
`W/lib/onglets-reglages.ts`). Retirer quelqu'un de l'équipe ne peut donc rien
lui laisser lire au Tour · un Admin d'équipe non fondateur n'y est jamais
entré. Un fondateur retiré de `platform_staff` garde le Tour (liste codée,
inchangée · le filet de `equipeDepuisLignes`).

Aucun cache · les pages sont `force-dynamic`, aucune lecture de tickets n'est
mise en cache (`unstable_cache` absent de `donnees.ts`), `donnees.ts` est
`server-only` (pas une action serveur, pas appelable du navigateur).

## Chemin → garde → relue

| Chemin | Ce qu'il lit des tickets | Garde au moment de la lecture | Relue depuis la base |
| --- | --- | --- | --- |
| `/admin` Vue d'ensemble (`sp/admin/page.tsx`) | `chargerTickets` · indicateur « Tickets ouverts », alerte « sans réponse », « En direct » | `porteAdmin` AVANT toute lecture | oui (`getSession`) |
| `/admin/sav` liste et fils (`sp/admin/sav/page.tsx`) | `chargerTickets` · 300 tickets, tous leurs messages | `porteAdmin` AVANT `chargerTickets` | oui |
| `/admin/sav` · « Envoyer » (`replyTicketAction`, `W/app/actions/support.ts`) | le ticket relu par son identifiant | `getSession` · ticket de l'espace courant, administrateur OU auteur | oui · la prop `bloque` n'est qu'un affichage, l'action relit |
| `/admin/sav` · « Résoudre » (`setTicketStatusAction`) | le ticket relu | `getSession` · `roleAtLeast(admin)`, ticket de l'espace courant | oui |
| `/admin/churn` | signaux « tickets sans réponse » (`chargerEspaces`) | `porteAdmin` | oui |
| `/admin/signups` · recherche `?q=`, segments `?segment=` | santé des comptes (compte des tickets sans réponse) | `porteAdmin` · recherche et segments calculés au serveur APRÈS la porte | oui |
| Exports (`exporterTourAction`, `W/app/actions/tour-controle.ts`) · comptes, rentabilité, incidents, tâches, audit | aucun ticket dans les colonnes (la santé est un libellé de risque) | `porteAdminGeste` à CHAQUE appel, refus sans rien lire | oui |
| `/console` (`sp/console/page.tsx`) | tickets de SON espace, compteurs plateforme (`W/lib/platform-metrics.ts`) | `porteAdmin` | oui |
| Sous-navigation (`navAdmin`) · « Tickets SAV » | rien | `droitsSousNavAdmin().tour` · la règle de la page | oui |
| Bandeau Admin+ (`bandeauSeul`) | rien (`chargerEspaces(…, [])`) | appelé après la porte | oui |
| Hors Tour · `/support`, `/support/[id]`, actions du support | les tickets de l'espace | `getSession` · son espace, un membre les siens (`peutLireTicket`) | oui |
| Hors Tour · cloche, bandeau, « Quoi de neuf » | notifications `ticket_*` | `ticketRelu` contre `peutLireTicket` au rôle actuel (#1086) | oui |

## Ce que le test fige

- qui a le droit · le poste SAV (composant client) reçoit exactement la
  capture prise sur main 51507ba (titres, fils, réponse fermée hors de son
  espace avec sa raison) · aucun secret d'espace (Stripe, Drive) dans les
  pages · les exports ne portent aucun ticket (`SECRET_…` absent) ;
- le MÊME cookie après un changement EN BASE · rôle d'espace retiré, époque
  dépassée, retirée de `FOUNDER_EMAILS`, retirée de l'espace · les cinq pages,
  les cinq exports et la sous-navigation refusés à la requête suivante, sans
  citer aucune donnée ;
- équipe plateforme · Admin d'équipe non fondateur refusé, retiré ou non ·
  fondateur retiré de `platform_staff` admis, réception identique ;
- gestes · ticket d'un autre espace introuvable (réponse et statut) ·
  propriétaire repassé membre après le chargement · ni réponse ni clôture ·
  rien n'est écrit ;
- recensement · tout fichier qui lit `schema.tickets`, `schema.ticketMessages`
  ou `chargerTickets` est dans ce tableau avec sa garde · un lecteur nouveau
  fait échouer.

## Observations, hors de ce correctif

- La matrice des droits d'équipe propose « Coulisses · technique » et
  « Coulisses · finances », qu'aucune page ne lit · cocher l'une ou l'autre
  n'ouvre rien. Ouvrir le Tour à l'équipe par ces cases élargirait un droit ·
  décision Kevin, pas un défaut.
- ~~`getSession` prend la PREMIÈRE appartenance du compte (`limit(1)`, sans
  ordre) comme espace courant · pour un compte de plusieurs espaces, l'espace
  courant n'est pas choisi. Hors du périmètre des tickets.~~ Fermé, ci-dessous.

## Livré · l'espace courant choisi par un ordre déterministe

Reproduit sur main 04d6270b (`W/test/espace-courant-db.test.ts` · 6 tests
rouges) · pour un compte de deux espaces, réécrire une ligne de
`workspace_members` SANS rien changer (`role = role`, ce que fait tout
changement de rôle) la déplaçait en fin de table, et l'espace courant · donc
le rôle, le plan, les marques, les permissions studio · basculait. Une
promotion dans l'autre espace déplaçait l'espace courant.

**Mécanisme de choix existant · aucun.** Ni cookie (seuls `tt_session`,
`tt_brand`, `tt_rail`, `tt_theme`), ni sélecteur d'espace (CA A03, RJ X05,
« à créer », décision Kevin), ni action « changer d'espace », ni colonne
« dernier espace » · `workspace_members` ne porte que l'espace, le compte et
le rôle (aucune date, aucun statut). Dans les parcours de l'application, un
compte n'a qu'UNE appartenance · l'inscription crée un espace et son
propriétaire, l'invitation n'accepte qu'un compte neuf (`acceptInviteAction`
refuse un e-mail existant). Plusieurs appartenances ne naissent que d'une
écriture en base (semis, opération manuelle).

**La règle** · `espaceCourant` (`C/espace-courant.ts`, pure) · l'espace le
plus ANCIEN (`workspaces.created_at`), puis le plus petit identifiant ; une
date illisible passe après les autres. `getSession` relit à chaque requête
TOUTES les appartenances du compte jointes à leur espace, et retient celle-là
· le rôle est celui de l'appartenance retenue, tel quel.

- Un compte à une appartenance retrouve exactement la sienne · la session est
  égale, champ pour champ, à celle que calculait main (la requête de main est
  recopiée dans le test comme référence).
- Attributs immuables de l'espace seulement · ni un changement de rôle, ni un
  retrait suivi d'un retour, ni l'ordre physique ne déplacent l'espace.
- Le rôle n'entre PAS dans l'ordre · « propriétaire d'abord » ferait d'une
  promotion ailleurs un changement d'espace · aucun droit élargi ni restreint.
- « L'appartenance la plus ancienne » demanderait une date sur
  `workspace_members` · une migration, écartée.

Inchangés · l'époque de session, `FOUNDER_EMAILS`, l'équipe plateforme, le
rôle relu en base, la cloche (non bornée à l'espace courant · décision Kevin
en attente). Rien n'est écrit à la lecture. Aucune migration.

Gardes · `product/packages/core/test/espace-courant.test.ts` (règle, toutes
permutations) · `W/test/espace-courant-db.test.ts` (base réelle, VRAI
`getSession` sur un jeton signé · comptes à une appartenance égaux à main ·
deux et trois espaces sous les 36 combinaisons d'ordre physique des
appartenances ET des espaces · rôle, plan, marques et permissions studio de
l'espace retenu · repli quand l'appartenance retenue disparaît · époque ·
rien d'écrit · recensement · `getSession` seul lit les appartenances d'un
compte sans borne d'espace), 17 mutations tombées.

Le recensement lit l'ARBRE syntaxique (`W/test/helpers/lecteurs-appartenances.ts`)
· toute requête sur la table des membres dont les conditions citent le compte
(`userId` / `user_id`) sans borner l'espace à une VALEUR (joindre
`workspaces.id` ne borne rien) · alias (`const M = schema.workspaceMembers`,
déstructuration, import renommé), `and(eq(M.userId, …))`, jointures, SQL brut
(gabarits, chaînes, fichiers `.sql`) · sur `apps/web`, `apps/workers` et
`packages`, hors tests. Lecteurs recensés avec leur raison · `getSession` (le
choix), et dans `W/lib/studios/mes-mentions.ts` le rôle de la personne dans
l'espace DE chaque ticket et de chaque notification de la cloche (bornés par
leurs identifiants, la cloche n'est pas bornée à l'espace courant). Le relevé
doit voir les lecteurs bornés (Équipe, Console, Sauvegardes, membres,
notifications, radar, suivi, récap, activité, mentions) · 12 mutations
tombées (alias, `and(…)`, SQL brut, worker, déstructuration, jointure,
fichier `.sql`, SQL joint à `workspaces.id`, import renommé, et trois sur le
relevé lui-même).

**Reste, documenté** · `ops/migration/semis-zero-propre.sql` (l. 77-80)
retient la première appartenance `owner` par `LIMIT 1` sans ordre pour
décider s'il crée l'espace fondateur · règle différente de `espaceCourant`,
hors du recensement (`ops/` n'est pas lu) · sans effet sur la session.

**Décision Kevin** · quel espace par défaut pour un compte de plusieurs
espaces (le plus ancien aujourd'hui · ou celui où il est propriétaire, ou le
dernier ouvert, qui demanderait une colonne) · et le sélecteur d'espace
lui-même (CA A03, RJ X05).
