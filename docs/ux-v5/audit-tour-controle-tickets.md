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
- `getSession` prend la PREMIÈRE appartenance du compte (`limit(1)`, sans
  ordre) comme espace courant · pour un compte de plusieurs espaces, l'espace
  courant n'est pas choisi. Hors du périmètre des tickets.
