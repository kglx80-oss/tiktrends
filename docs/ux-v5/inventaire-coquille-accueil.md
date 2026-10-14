## Inventaire V5 : coquille, profil, Accueil, Studios, Réglages (lecture seule)

Ce que j'ai lu :
- **Code réel** : `origin/main` (394ed04) et les branches `origin/claude/ux-v2-*`.
- **Prototype** : la couche finale de chaque contrôle, qui est la dernière qui le touche dans l'ordre de `index.html` (extension → experience → v5 → v5-wizard → r2 … r15). `v5-new.js` n'est pas chargé par `index.html` : « Nouveau projet » ouvre donc `studioWizard('start')` (v5-wizard.js).

Raccourcis de chemin :
- `W` = `product/apps/web` (chemins lus sur origin/main)
- `C` = `product/packages/core/src`
- `P` = `<dossier V5>/proto5`

Les captures de référence sont dans `.../scratchpad/v5-captures/ref/*.png`. Le dossier ne contient plus de captures à la racine.

**Cinq constats qui changent le plan du brief :**
1. **Recharge de crédits** : elle existe déjà sur main, avec paiement Stripe. Ce sont `CreditsMenu`, les packs `CREDIT_PACKS` et `createTopupCheckoutAction`. Seuls les forfaits du proto (500 / 1 500 / 5 000) seraient un changement d'offre.
2. **Google Drive** : il est déjà branché, mais dans /assets et pas dans /connections. On y trouve OAuth Google, `actions/drive.ts` et `DriveConnect`.
3. **Logos officiels** : main a déjà `logos-outils.ts` (Simple Icons 16.33.0) et `BrandTile`. Le lot A1 doit partir de là.
4. **Bascule de thème** : dans la couche finale (V5.1+), elle n'est plus dans l'en-tête mais dans la pop-up profil (Sombre / Clair). L'en-tête final ne porte que la recherche et l'avatar.
5. **Coin bas droit** : l'orbe Jarvis du proto tombe exactement sur la bulle Support de main (56 px, bottom 20, right 20).

### Tableau des contrôles

| id | vue V5 | contrôle | proto | route/composant réel | action/service et garde | persistance / coût | statut | note |
|---|---|---|---|---|---|---|---|---|
| R01 | toutes | « tiktrends. » | lien #home | W/components/AppShell.tsx:425 Link /dashboard | session (layout) | · | raccordé | main : carré 22 px dégradé + « TikTrends » |
| R02 | rail réduit | « t. » | #home | LogoHome collapsed AppShell:444 | · | · | raccordé | |
| R03 | toutes | « Réduire le menu » / « Déployer le menu » | 184↔64 | AppShell:433 et :445, W/lib/chrome-coquille.ts (184 / 64) | client | proto : localStorage tt-maquette-rail ; réel : cookie tt_rail lu au rendu serveur | raccordé | libellé réel « Réduire la barre (Alt B) » |
| R04 | toutes | touche « [ » | bascule le rail (r2) | aucun | · | · | à créer | brancher sur toggleCollapsedRef |
| R05 | toutes | Alt B | bascule le rail | AppShell:331-342 | hors saisie | cookie | raccordé | |
| R06 | toutes | bloc « Agence GLX · Marque · Neva » | texte statique | sélecteur d'espace AppShell:458 (menu) + BrandSwitcher :490 ; #787 met la marque active sous « Votre espace » | setActiveBrand W/app/actions/brands.ts:26 | marque active | partiel | réel interactif, proto inerte |
| R07 | toutes | « Accueil » | #home | /dashboard, W/lib/rbac.ts:81 | railNav (client_viewer, starter) | · | raccordé | |
| R08 | toutes | « Veille » | #veille | /veille rbac:86 | member, core | · | raccordé | |
| R09 | toutes | « Studios » | #studios | /studio/projets rbac:96 | member, core | · | raccordé | |
| R10 | toutes | « Bibliothèque » | #library | /assets rbac:98 ; sur main, placerAssets la déplace dans le groupe Marque | member, core | · | raccordé PR #787 | #787 la garde en module du rail |
| R11 | toutes | « Résultats » | #results | /adsmap rbac:101 | member, offre Plus (cadenas) | · | raccordé | |
| R12 | toutes | « Jarvis » | #jarvis | /jarvis rbac:110 | member, core | · | raccordé | |
| R13 | toutes | « Votre espace » + « Marques » | #brands | /brands rbac:115, AppShell:579-588 | admin d'espace | · | raccordé | |
| R14 | toutes | « Assets de la marque » | #assets | /assets + entreesMarque C/rail-marque.ts:52 (Aperçu, Styles, Brand kits, Audience, Produits, Concurrents) | admin | · | partiel | aucune vue « assets de la marque » isolée |
| R15 | toutes | « Réglages » retiré du rail (rangé dans le profil) | · | Réglages dans « Votre espace » AppShell:329 | admin | · | partiel | choix UX |
| R16 | toutes | « Administration » absente du rail créatif | entrée par le profil | pied du rail AppShell:598 (isStaff) | fondateur et admin | · | partiel | |
| R17 | toutes | « Aide » | #support | AppShell:599 /support | session | · | raccordé | |
| R18 | toutes | pastille « 1 240 crédits » + barre | ouvre la modale Crédits | CreditsMenu W/components/CreditsMenu.tsx:86 (popover) | solde : workspaces.credits_balance (layout.tsx) ; afficherCredits C/credits-affichage.ts:32 | lecture | partiel | pilule ◈ sans barre ; barre possible avec caseCreditsFormule :52 (solde / PLAN_CREDITS) |
| R19 | toutes | « + » de la pastille | même modale | aucun « + » distinct | · | · | partiel | |
| R20 | modale Crédits | « Solde X / Y · Formule Pro (exemple) · renouvellement le 1er nov. » | fictif | en-tête du CreditsMenu, /billing | PLAN_LABEL, PLAN_CREDITS (rbac:17, :54) | renouvellement non stocké | partiel | date : il faudrait stocker current_period_end Stripe (à créer) |
| R21 | modale Crédits | « Ce mois-ci » (Itérations Studios / Analyses Jarvis / Veille) | fictif | /usage « Où partent tes crédits » | repartitionConsommation C/compte-vue.ts:53 sur credit_ledger | lecture | partiel | |
| R22 | modale Crédits | onglet « Recharger » | · | CreditsMenu « Recharge ponctuelle » :63 | · | · | partiel | popover, pas modale |
| R23 | modale Crédits | forfaits 500 / 1 500 « Conseillé » / 5 000 / [PRIX] | radios | CREDIT_PACKS W/lib/credit-packs.ts (1 000 = 19 €, 5 000 = 79 €, 20 000 = 279 €) | · | · | décision Kevin | ne pas reprendre les quantités du proto |
| R24 | modale Crédits | « Recharger » | paiement simulé | bouton « Acheter » CreditsMenu:63-75 | createTopupCheckoutAction W/app/actions/stripe.ts:85, propriétaire seulement | Stripe payment, crédit par webhook | raccordé | un admin non propriétaire est refusé |
| R25 | modale Crédits | « Historique » | → #usage | CreditsMenu:77 /usage | · | · | raccordé | |
| R26 | modale Crédits | onglet « Changer de formule » | · | grille /billing | · | · | partiel | |
| R27 | modale Crédits | formules Essentiel / Pro / Agence | fictives | Starter 0 € / 200 cr, Core 99 € / 2 000, Plus 299 € / 7 000, Business 990 € / 24 000 (rbac:17, :54, :57) | · | · | décision Kevin | offre et prix |
| R28 | modale Crédits | « Changer de formule » | simulé | /billing | createCheckoutAction stripe.ts:37 et createPortalAction :64 (propriétaire) ; changePlanAction billing.ts:22 (fondateur) | Stripe | raccordé | depuis /billing |
| R29 | modale Crédits | « Factures » | → #billing | « Améliorer mon offre » CreditsMenu:51 (si showUpgrade) | · | · | raccordé | |
| R30 | toutes | « Kevin · Profil & réglages » | ouvre la pop-up | puce compte AppShell:657 → menu déroulant :623-655 | · | · | partiel | menu ≠ pop-up centrée |
| R31 | sous-pages | parent surligné | · | railEntreeActive + sectionDuChemin AppShell:318-326, aria-current | · | · | raccordé | |
| R32 | toutes | rail collant qui défile | · | AppShell:406-411 | · | · | raccordé | |
| R33 | #project | Mode focus (Alt F) | extension | #782 : actionToucheFocus + « Quitter le mode focus » | hors saisie et hors dialogue | non mémorisé | raccordé PR #782 | |
| H01 | toutes | fil d'Ariane cliquable dans l'en-tête | PARENT (v5.js) | Breadcrumb AppShell:716 (rangée sous l'en-tête) | · | · | partiel | main masque le fil sur les racines |
| H02 | toutes | « Rechercher un projet, une création ⌘ K » | palette | AppShell:706 « Rechercher » + ⌘K | · | · | raccordé | |
| H03 | toutes | ⌘K / Ctrl K | · | CommandPalette.tsx:52 | · | · | raccordé | |
| H04 | toutes | « / » | ouvre la palette | aucun en global (seul SwipeFile.tsx:53 en local) | · | · | à créer | |
| H05 | toutes | palette « Aller à… » (Actions, Récents, Pages, ↵, Échap) | récents fictifs | CommandPalette (récents localStorage tt_recents, nav, actions, marques, compte, plateforme) | commandesOuvertes AppShell:363 | · | raccordé | |
| H06 | toutes | touches N, V, J, I, M | actions | aucune | · | · | à créer | J doit rester à l'orbe (le proto stoppe la propagation) ; I = admin + Plus |
| H07 | toutes | « ? » liste des raccourcis | modale | aucune | · | · | à créer | |
| H08 | toutes | avatar « KG » | pop-up profil | absent ; la cloche NotificationBell (fixe, top 16 right 20) occupe le coin, AppShell:713 | · | · | à créer | ne pas perdre la cloche (absente du proto) |
| H09 | pop-up profil (V5.0 : en-tête) | bascule soleil / lune | ?theme=light | aucune | · | proto : localStorage tt-theme | à créer | dépend du point 3 |
| H10 | toutes | en-tête collant translucide | · | header AppShell:691 | · | · | partiel | voir valeurs au point 2 |
| C01 | toutes | bandeau « Prototype · données fictives · Guide » | 30 px | W/components/Bandeau.tsx (états démo par page) | · | · | partiel | ne pas porter |
| J01 | toutes sauf #jarvis / ADMIN+ / modale | orbe « Jarvis J » 28 px | jvTask('page') | aucun lanceur ; même coin que SupportWidget.tsx:225 | · | · | à créer | déplacer l'un des deux |
| J02 | toutes | touche J | · | aucune | · | · | à créer | |
| J03 | toutes | suggestions « Sur cette page » (deux par page) | réponses simulées | aucune tâche contextuelle | Jarvis via guardedAnthropic W/lib/spend-guard.ts | crédits | décision Kevin | dépense IA nouvelle : devis + sousPlafond |
| J04 | toutes | composeur du panneau | · | AssistantChat (accueil) + JarvisChat (/jarvis, W/app/api/jarvis/chat/route.ts) | askAssistant W/app/actions/assistant.ts:33, refusAssistant (member) | crédits | partiel | panneau unique à créer |
| M01 | ≤600 | bouton menu mobile | aside.open | burger AppShell:694 (≤768) : dialog, voile, Échap, inert | · | · | raccordé | largeurs différentes |
| M02 | mobile | recherche réduite à une icône 44 px | · | bouton flex, minWidth 44 | · | · | raccordé | |
| M03 | mobile | fil réduit à l'écran courant | · | Breadcrumb | · | · | partiel | |
| M04 | <600 | pop-up en bas d'écran | · | Modal pleinEcranTelephone | · | · | partiel | |
| P01 | pop-up profil | en-tête (avatar, nom, espace · rôle) | · | menu compte AppShell:627-630 (nom, e-mail) | · | · | partiel | |
| P02 | pop-up profil | « Sombre / Clair » | setTheme | aucun | · | localStorage | à créer | |
| P03 | pop-up profil | « Mon profil » | #profile | « Mon profil » ouvre ProfileModal (AppShell:632) ; page /profile | saveProfileAction W/app/actions/admin.ts:27 (session) | users | raccordé | |
| P04 | pop-up profil | « Espace de travail » | #settings | « Réglages » du menu d'espace → QuickSettingsModal ; /settings | saveWorkspaceNameAction admin.ts:73 | workspaces.name | raccordé | |
| P05 | pop-up profil | « Équipe » | #team | /team (menu d'espace) | admin | · | raccordé | |
| P06 | pop-up profil | « Connexions » | #connections | /connections | admin | · | raccordé | |
| P07 | pop-up profil | « Crédits & utilisation » | #usage | /usage | admin | · | raccordé | |
| P08 | pop-up profil | « Abonnement & factures » | #billing | /billing | admin | · | raccordé | |
| P09 | pop-up profil | « Ouvrir ADMIN+ » | #admin | « ADMIN+ · Coulisses » AppShell:639 | isStaff ; W/app/(app)/admin/page.tsx:22-23 (admin + fondateur) | · | raccordé | le proto l'affiche à tous |
| P10 | pop-up profil | « Aide & support » | #support | « Support » (section Compte) AppShell:633 | session | · | raccordé | |
| P11 | pop-up profil | (absent du proto) Déconnexion, Langue | · | AppShell:649-653, logoutAction | · | · | raccordé | à garder |
| P12 | #profile | champ « Prénom » | · | ProfileIdentity (nom, photo, masquer les infos) | saveProfileAction admin.ts:27 | users.name, avatar_url, hide_personal_info | raccordé | |
| P13 | #profile | « Langue » | · | select désactivé W/app/(app)/profile/page.tsx:46-53 | · | users.locale | partiel | |
| P14 | #profile | case « Menu compact sur ordinateur » | toggleRail | aucune | · | · | à créer | même cookie tt_rail |
| P15 | #profile | « Enregistrer » | simulé | ProfileIdentity + changePasswordAction admin.ts:40 | session | · | raccordé | |
| P16 | #profile | « ADMIN+ · Entrer dans ADMIN+ » | · | lien « Coulisses ADMIN+ › » profile/page.tsx:79 | isFounder | · | raccordé | |
| P17 | #settings et sous-pages | onglets Espace / Équipe / Connexions / Utilisation / Factures / Profil | localnav | #790 OngletsReglages (C/onglets-reglages.ts, filtrés par les gardes) | · | · | raccordé PR #790 | |
| A01 | ADMIN+ | « ← Retour à l'espace créatif » | → #studios | « Retour à l'app » AppShell:505 → /dashboard | · | · | raccordé | |
| A02 | ADMIN+ | rail 224 px, badge « ADMIN+ », « Gestion avancée » repliable | · | ADMIN_NAV AppShell:29 (12 entrées, rail 184) ; #790 onglets par groupe | · | · | partiel | |
| A03 | ADMIN+ | sélecteur « Espace » (Agence GLX / Marque Neva) | portée illustrative | aucun : session à espace unique, aucune action de changement d'espace | · | · | à créer | ou ne pas porter |
| A04 | ADMIN+ | recherche et pastille crédits masquées | · | main les garde | · | · | partiel | |
| A05 | ADMIN+ | DA bleu nuit / menthe | · | ADMIN_CONTENT ambre #f5a623 sur #130d07 (AppShell:46) | · | · | partiel | DA à valider |
| G01 | #home | « Lundi 12 octobre · Neva » | fictif | AssistantHome:99-103 « Marque active · X » | getActiveBrand | · | partiel | date serveur |
| G02 | #home | « Bonjour Kevin » | · | AssistantHome:90 (+ solde :93) | · | · | raccordé | |
| G03 | #home | « 2 choses vous attendent : 6 visuels… 5 créatives… » | fictif | aucune synthèse | sources possibles : studio_jobs, notifications, brand_tracker_events | · | à créer | |
| G04 | #home | bloc « Prochaines itérations » | iterStrip | ProchaineEtape (liens sans données) ; plan réel iterationPlanAction W/app/actions/adsmap-iterate.ts:70, affiché dans /adsmap/suites | adsmapGuard (Plus, rôle), verdicts arbitrés seulement | lecture | partiel | lot B3, après #786 |
| G05 | #home | « Voir la boucle → » | #lots | /adsmap + ParcoursBoucle (#785) ou /adsmap/lots (admin) | · | · | raccordé PR #785 | |
| G06 | #home | vignettes « Gagnant → V3 · 9:16 » | · | média de l'ad parente (adsmap_ads) ; pas de « variante à venir » | · | · | partiel | |
| G07 | #home | « Lot #1 conclu » / « Apprentissage validé » | fictif | adsmap_batches.number, adsmap_verdicts.status, learnings (adDetailAction W/app/actions/adsmap-verdict.ts:81) | · | · | partiel | |
| G08 | #home | accroche « … » | fictive | IterationRow.conceptTitle / variantCode | · | · | partiel | |
| G09 | #home | « 27 % taux d'accroche · +6 pts vs contrôle » | fictif | verdicts.metricsAgg (hookRate), comparable | · | · | partiel | écart vs contrôle à calculer |
| G10 | #home | puces « Garde · … » / « Change · … » | · | IterationRow.freezeLabels / variableLabel | · | · | partiel | |
| G11 | #home | raison | · | IterationRow.modeHint | · | · | partiel | |
| G12 | #home | « Itérer » | modale en 3 étapes | createIterationAction adsmap-iterate.ts:221 ; ou /studio/projets/nouveau?iter= | member, hypothèse ≥ 10 caractères, parent gagnant prouvé | ad en brouillon, gratuit | partiel | |
| G13 | #home | « Devis : 24 crédits » | fictif | aucun devis à ce stade | devis serveur seulement à la génération | · | à créer | ne rien afficher sans devis |
| G14 | #home | « Itérer sur une autre créative » | · | /adsmap/suites, AdDrawer.tsx:141 | · | · | partiel | |
| G15 | modale itération | étape 1 « Point de départ » + Continuer / Annuler | · | choix de ligne dans Suites.tsx | · | · | partiel | |
| G16 | modale itération | étape 2 « On garde / On change » (4 choix) | · | iterationPlan propose une seule variable | · | · | partiel | |
| G17 | modale itération | étape 3 + « Voir le devis et générer » | crée hypothèse + lot #5 | crée l'ad ; aucun lot automatique ; génération via Studios | · | · | partiel | |
| G18 | #home | tuile « Nouveau projet » (N) | · | AssistantHome:72 ; tête #786 | · | · | raccordé | |
| G19 | #home | tuile « Explorer la Veille » (V) | · | ANALYSER /veille | · | · | raccordé | |
| G20 | #home | tuile « Demander à Jarvis » (J) | · | /jarvis + AssistantChat | · | · | raccordé | |
| G21 | #home | tuile « Importer des résultats » (I) | · | /adsmap/import (admin, Plus) | · | · | partiel | absent de l'Accueil |
| G22 | #home | « Fiche marque · 5 éléments à compléter » (M) | fictif | HomeMarques ; manques via journey | · | · | partiel | |
| G23 | #home | 4 KPI (Projets actifs, Sauvegardées, Radar, Itérations en test) | fictifs | aucun | sources : studio_projects, saved_ads, brand_tracker_events, adsmap_batches | · | à créer | |
| G24 | #home | « Configurer TikTrends » (8 étapes, Réduire / Afficher) | fictif | JourneyPanel via onboardingState W/lib/onboarding-state.ts | · | · | partiel | l'étape « TikTok Ads » est impossible |
| G25 | #home | « Reprendre » + « Tous les projets » | · | #786 TeteProjets, /studio/projets?toutes=1 | listerProjetsCartes W/app/actions/studios/sources.ts:124 (gardeStudio) | · | raccordé PR #786 | |
| G26 | #home | carte projet (vignette, 5 pastilles d'étape) | · | CarteProjet (3 étapes) + ApercuReprise (#786) | · | · | partiel | |
| G27 | #home | « Quoi de neuf » + « Radar → » | fictif | NotificationBell (table notifications), /radar | · | · | à créer | |
| G28 | #home | Voir / Analyser / Lire / Ouvrir | · | · | · | · | à créer | |
| G29 | #home | « Astuce : ? » | · | · | · | · | à créer | |
| S01 | #studios | titre « Studios » | · | /studio/projets (h1 « Projets ») | · | · | raccordé | |
| S02 | #studios | « + Nouveau projet » | pop-up | NouveauProjet (W/components/studios/projet/NouveauProjet.tsx) | creerProjet W/app/actions/studios/projets.ts:47, gardeStudio('studio.propose','projets') | studio_projects, gratuit | raccordé | |
| S03 | #studios | onglets « Projets / Prompts conseillés » | · | aucun ; registre de prompts côté /admin/ia-studios | · | · | à créer | |
| S04 | #prompts-conseilles | catégories, « Utiliser », « Copier », « Lancer comme itération » | fictif | aucun | · | · | à créer | « Utiliser » ne doit rien générer |
| S05 | #studios | bande « Prochaines itérations » | · | voir G04 | · | · | partiel | |
| S06 | #studios | filtres Tous / En cours / En revue / Brouillons / Archivés + compteurs | · | filtre marque active / ?toutes=1 ; status 'archived' en base, sans interface | · | · | partiel | « En revue » n'existe pas |
| S07 | #studios | « Rechercher un projet… » | · | aucun | · | · | à créer | |
| S08 | #studios | « Activité » → « Tâches & statut » | fictif | aucune vue client des studio_jobs | · | · | à créer | |
| S09 | #studios | carte projet (vignette, type, statut, 5 étapes, badge V3) | · | CarteProjet.tsx (marque, type, étape, manques, date, sources) | · | · | partiel | pas de vignette dans la liste |
| S10 | #studios | menu « … » : Ouvrir / Renommer / Dupliquer / Archiver | · | Ouvrir seulement | · | · | à créer | archiver = mise à jour de status, sans suppression |
| S11 | #studios | carte « Nouveau projet » (N) | · | voir S02 | · | · | raccordé | |
| S12 | #studios | état vide « Archivés » | · | états premier usage / vide marque / refus / erreur | · | · | partiel | |
| N01 | pop-up création | select « Marque » (+ « Ajouter une marque… ») | · | marque active imposée (etatNouveauProjet) | · | · | partiel | |
| N02 | pop-up création | Livrable Publicité / Image / Vidéo / Textes | tuiles | select « Type » (Pub statique, Image, Vidéo, Textes) | · | · | raccordé | main exige un Titre |
| N03 | pop-up création | « Partir de zéro » | · | projet vide | · | · | raccordé | |
| N04 | pop-up création | « Depuis la Veille » | · | ?ref= → creerProjetDepuisContexte sources.ts:91 ; bouton « Créer depuis la Veille » | gardeSources | · | partiel | pas de choix dans la modale |
| N05 | pop-up création | « Itérer sur un test » | · | ?iter= (briefDepuisTest) | Adsmap + marque active | · | partiel | |
| N06 | pop-up création | « Annuler / Commencer le brief » | · | « Créer le projet pour X » | · | · | raccordé | V5 enchaîne sur le brief, main ouvre le projet |
| I01 | #settings | liste de 6 liens (Connexions avec logos) | · | /settings = vraie page (nom, abonnement, services, stockage, marque blanche) | updateWorkspaceAction admin.ts:63 (admin) | · | partiel | |
| I02 | #settings | logos sur « Connexions » | r13 | BrandTile + logos-outils.ts | · | · | partiel | |
| T01 | #team | tableau Membre / Rôle / Action | fictif | W/app/(app)/team/page.tsx:134 | admin | workspace_members | raccordé | |
| T02 | #team | « Consulter les droits » | modale | aucun détail par membre | · | · | partiel | |
| T03 | #team | « Inviter un membre » (e-mail, rôle) | simulé | InviteMemberButton → createInviteAction invites.ts:16 | admin ; rôles admin / member / client_viewer | invites + e-mail | raccordé | |
| T04 | #team | (absent du proto) « Révoquer », copier le lien | · | revokeInviteAction :46, CopierTexte | admin | · | raccordé | à garder |
| K01 | #connections | encart « Pourquoi c'est la première étape » | · | PageInfo | · | · | partiel | |
| K02 | #connections | Meta Ads « Connecter » (4 étapes) | · | /api/oauth/meta (DataConnections:232) ou jeton connectMetaAction connections.ts:85 ; selectMetaAccountAction :99, syncMetaAction :115, disconnectMetaAction :128 | admin (connections.ts:15), marque active | brands.meta_token | raccordé | |
| K03 | #connections | TikTok Ads « Connecté · Gérer » | fictif | « Bientôt » ; /api/oauth/tiktok sans callback | · | · | décision Kevin | nouveau connecteur publicitaire |
| K04 | #connections | Google Ads | · | « Bientôt » | · | · | décision Kevin | |
| K05 | #connections | Snapchat Ads | · | « Bientôt » | · | · | décision Kevin | |
| K06 | #connections | Pinterest Ads | · | « Bientôt » | · | · | décision Kevin | |
| K07 | #connections | Shopify « Connecté · Gérer » | · | OAuth + connectShopifyAction :51, syncShopifyAction :64, disconnectShopifyAction :77 | admin | · | raccordé | |
| K08 | #connections | Google Analytics 4 | · | « Bientôt » | · | · | à créer | fournisseur à valider |
| K09 | #connections | Google Drive Connecter (3 étapes) / Gérer | · | W/app/(app)/assets/DriveConnect.tsx ; drive.ts :30 / :49 / :63 / :70 / :143 ; /api/oauth/google | admin | workspaces.drive_* | partiel | existe mais pas dans /connections ; un seul dossier |
| K10 | #connections | Dropbox | · | « Bientôt » | · | · | décision Kevin | |
| K11 | #connections | Slack | · | SLACK_BOT_TOKEN « à venir » | · | · | à créer | |
| K12 | assistant connexion | étape « Comptes » | · | selectMetaAccountAction (un compte) | · | · | partiel | |
| K13 | assistant connexion | « Rattacher aux lots » (convention, 14 / 3 / 27) | fictif | syncAdsMapAction W/app/actions/adsmap.ts:267 + import CSV | · | · | partiel | |
| K14 | assistant connexion | « Remontée » (fréquence, mesures, alerte de lot) | · | cron /api/cron/adsmap, rien de réglable | · | · | à créer | |
| K15 | assistant Drive | « Analyser les nouveaux médias · 1 crédit » | · | aucun | · | · | décision Kevin | dépense IA nouvelle |
| K16 | #connections | logos officiels | logos.json | logos-outils.ts + BrandTile | · | · | raccordé | |
| U01 | #usage | « solde fictif 2,00 $ » | fictif | cartes Solde / Consommé 30 j / Ajouté 30 j | admin | credits_balance, credit_ledger | raccordé | crédits, pas $ |
| U02 | #usage | tableau Opération / État / Coût | fictif | journal des 120 derniers mouvements + répartition | · | · | raccordé | |
| U03 | #usage | « Voir une demande de génération » | démo | aucun | · | · | partiel | ne pas porter |
| B01 | #billing | « Abonnement de l'espace » | · | billing/page.tsx (formule, prix, crédits, statut, grille) | admin ; actions réservées au propriétaire | · | raccordé | |
| B02 | #billing | « Voir les factures » | modale vide | portail Stripe (createPortalAction) | propriétaire | · | partiel | liste dans l'app à créer |
| X01 | #support | liens « Créer un projet / Travailler avec Jarvis / Comprendre les crédits » | · | aucun guide | · | · | à créer | contenu à écrire |
| X02 | #support | « Contacter le support » (Objet, Description) | simulé | formulaire /support + bulle SupportWidget | createTicketAction W/app/actions/support.ts:34 (session) | tickets | raccordé | |
| X03 | #support | « Raccourcis clavier » | · | aucun | · | · | à créer | |
| X04 | #support | (absent du proto) mes tickets → /support/[id] | · | replyTicketAction :62, setTicketStatusAction :94 | · | · | raccordé | à garder |

L'Accueil de main contient aussi des blocs absents de la V5 :
- HomeBandeau
- HomeMarques
- « Analyser & décider »
- AssistantChat
- ApercuExemple
- les onglets Accueil / Analytics

Il faut décider s'ils sont conservés ou retirés. Retirer une fonction demande un mandat.

### Données fictives et ce qui les remplace

| Donnée du proto | Donnée réelle |
|---|---|
| Solde 1 240 / 2 000 | workspaces.credits_balance / PLAN_CREDITS[plan] |
| « Formule Pro » | PLAN_LABEL |
| « 1er nov. » | aucune donnée (non stockée) |
| Répartition 520 / 160 / 80 | credit_ledger via repartitionConsommation |
| Forfaits du proto | CREDIT_PACKS |
| Formules Essentiel / Pro / Agence | PLAN_* |
| Date et marque de l'en-tête | horloge serveur + getActiveBrand |
| « 6 visuels / 5 créatives » | studio_jobs, notifications, brand_tracker_events (aucun calcul existant) |
| Cartes « Prochaines itérations » (27 %, +6 pts, Lot #1, A4, accroches) | iterationPlanAction, adsmap_verdicts.metricsAgg, adsmap_batches, learnings |
| Devis 24 / 4 crédits | aucun à ce stade |
| KPI 3 / 4 / 5 / 2 | studio_projects, saved_ads, brand_tracker_events, adsmap_batches (rien d'existant) |
| Projets et étapes 1 à 5 | listerProjetsCartes (3 étapes) |
| Flux « Quoi de neuf » | notifications |
| Configuration en 8 étapes | onboardingState / journey |
| « Kevin · exemple » | workspace_members + users |
| TikTok « 2 h, 2 comptes, 18 pubs », neva.ch, dossiers Drive, 14 / 3 / 27 | getConnectionState (connections.ts:30) et getDriveState (TikTok : rien) |
| Récents de la palette | localStorage tt_recents |
| Prompts conseillés | aucune |

### 1. Routes réelles de mon périmètre et leur équivalent V5

| Route réelle | Équivalent V5 |
|---|---|
| /dashboard | #home |
| /dashboard?vue=analytics | aucun |
| /studio/projets (et ?toutes=1) | #studios |
| /studio/projets/nouveau (?ref, ?iter, ?type) | pop-up `studioWizard('start')` puis #new |
| /settings | #settings |
| /team | #team |
| /connections | #connections |
| /usage | #usage |
| /billing | #billing |
| /profile | #profile |
| /support | #support |
| /support/[id] | « #support / détail » (absent) |
| /admin | #admin (ADMIN+) |
| /credits | aucun (ADMIN+ marges, lien pastille fondateur) |
| /brands | entrée rail Marques |
| /assets | #library / #assets |
| /jarvis | #jarvis |
| /onboarding | carte « Configurer TikTrends » (partiel) |
| /api/oauth/meta, /shopify, /google, /tiktok | assistants de connexion |
| aucune | #prompts-conseilles |

PR #788 (307) redirige /studio, /studio/ads, /studio/image, /studio/video, /studio/textes vers les projets et /adsmap/jarvis vers /jarvis.

### 2. Écarts visuels majeurs (main + #787 + #782 face à V5)

| Élément | Main + #787 + #782 | V5 |
|---|---|---|
| Grille | 184 / 64 (chrome-coquille) ; focus #782 = 1 colonne | 184 / 64 ; ADMIN+ 224 |
| Bandeau global | aucun | 30 px |
| Rail | fond --rail #0d070c, bord .12, padding 8 / 12 (réduit 16 / 10) ; rangées 32 px souris / 44 tactile, padding 6 / 11, rayon 10, police 14 (500, 700 actif) ; actif = fond rgba(254,44,85,.10) + liseré intérieur 3 px #ff5c8a | fond #0d070c, bord .12, padding 24 / 12 (en-tête collant 20) ; entrées min 46 px, padding 13 / 12, rayon 8, gap 12 ; actif = fond #2a1320 + barre 3 px à -12 px, graisse 500 |
| Logo | carré dégradé 22 px + « TikTrends » 15 / 700 | mot-symbole « tiktrends. » |
| Haut du rail | sélecteur d'espace 44 px bordé + BrandSwitcher | texte deux lignes |
| Pastille crédits | pilule rayon 999, hauteur 44, bord rgba(254,44,85,.28), glyphe ◈, sans barre | carte rayon 12, padding 10 / 12, icône 28, « + » 24 accent, barre 4 px |
| Profil | avatar 30 rond, nom 13 / 600, « rôle · offre » 11 | avatar + « Profil & réglages » |
| En-tête | min 56 px, padding 10 / 14 (64 à droite pour la cloche), fond --rail plein ; recherche flex 0 1 340, fond --paper, rayon 10, kbd 16 px ; pas d'avatar ; fil d'Ariane sur une rangée à part | 68 px, padding 0 32, fond bg 90 % + flou 10 px ; fil d'Ariane 14 px dans l'en-tête ; recherche min(380px, 40vw), fond surface, rayon 10 ; avatar 44 |
| Contenu | max 1200, gouttière clamp(16px, 4vw, 32px), haut 32, bas 60 | max 1500, padding 36 / 32 ; ADMIN+ 1200 / 40 |
| Typo | Geist (Google Fonts) ; h1 clamp(28–32) / 500 / -0.01em ; h1 Accueil clamp(21–25) / 600 ; h2 19 ; titres de section 18 / 500 | TT (assets/sans.ttf) puis Inter, 14 / 1.5 ; h1 32 / 500 / -.8 px ; Accueil 34 ; sections 20 |
| Rayons | --r-card 20 (surface), 12 (tuiles, champs), boutons en pilule 999 | contrôles 8, panneaux 12, tags 5–6, cartes 14–18 (pvcard 16, tuiles 18) |
| Couleurs (bases communes) | bg #120810, surface #1c121b, rail #0d070c, #2a1826, ink #f6eef4, ink-2 #cbbcc7 | identiques |
| Accent et primaires | --accent #fe2c55, --accent-strong #ff5c8a, primaires en dégradé #fe2c55 → #ff2d8f, padding 10 / 16, 700 / 13 | #ff5c8a plein, survol #ff85a7, texte actif #ff8dad ; primaire 11 / 16 rayon 8 |
| Niveaux et traits | muted #9a8a98 en 3e niveau de texte ; traits .12 / .20 | pas de 3e niveau ; traits .12 / .15 / .20 ; surface surélevée #221621 en plus |
| Statuts | ok #18cc8c, warn #f5a623, err #ff4d6d + littéraux #7ee8bf / #ff9db0 | ok #85e5bb, warn #f4c892 |
| ADMIN+ | ambre #f5a623 sur #130d07 | bleu nuit #0b1922 / menthe #90e0c2 |
| Coins de l'écran | cloche en haut à droite ; bulle Support 56 px en bas à droite | orbe Jarvis en bas à droite, environ 38 px de haut (orbe 28), à 20 / 20 |
| Mobile | tiroir ≤768 de 184 px fixes + voile .5 | tiroir ≤600, inset 32px 50px 0 0 (largeur de l'écran moins 50) |

### 3. Ce qui manque pour un thème clair

1. **Tokens.** `product/packages/ui/tokens.css` ne définit que `:root` en sombre. `body { background-color: #120810 }` y est codé en dur. Il faut :
   - un bloc `.theme-light` ou `[data-theme=light]` qui redéfinit tous les tokens : --bg, --surface, --rail, --paper, --ink, --ink-2, --muted, --line, --line-2, --accent, --accent-strong, --accent-soft, --on-accent, --grad-accent, --ok / --warn / --err / --info, --sh-* ;
   - de nouveaux tokens sémantiques pour ce qui est aujourd'hui littéral : texte succès et erreur (#7ee8bf, #ff9db0), teintes d'accent .10 / .28, voiles rgba(0,0,0,.5 à .6), surface surélevée.
   - Valeurs de départ du proto : #fbf5f6 / #fff / #2b1424 / #6b5063 / accent #c8295f avec texte blanc / ok #1d7a52 / warn #8a5a00.
2. **Styles en ligne.** Tout est stylé en ligne : 236 fichiers ont `style={{`. On compte 440 littéraux hex entre quotes dans components et app, 72 `rgba(255,255,255…)` et 48 `rgba(0,0,0…)`. Une classe de thème ne peut pas atteindre ces valeurs : il faut d'abord les passer en tokens, puis ajouter une garde de test anti-littéral.
3. **Thèmes ADMIN+.** `ADMIN_THEME` (W/lib/theme.ts) et `ADMIN_CONTENT` (AppShell:46, backgroundColor #130d07) injectent des variables en ligne. Il leur faut une variante claire, et la DA est à trancher (ambre ou menthe).
4. **Préférence et rendu.** Il faut un cookie lu au rendu dans W/app/layout.tsx qui pose la classe sur `<html>`, sans flash, comme tt_rail.
   - Il n'existe pas de colonne users.theme (users.locale existe).
   - `viewport.themeColor` est fixé à '#120810' et doit devenir dynamique.
   - Il faut `color-scheme: light`.
   - La scrollbar en rgba blanc de globals.css est à reprendre.
   - Il faut aussi la commande de bascule (P02).
5. **Contraste.**
   - Main pose un texte sombre sur le dégradé #fe2c55 → #ff2d8f ; en clair, il faut un accent plus foncé avec texte blanc.
   - Il faut un test WCAG ≥ 4,5:1 en règle pure dans le noyau.
   - Éléments décoratifs à revoir :
     - stops SVG #fe2c55 / #ff2d8f de HomeBandeau ;
     - COULEURS_ETAPE ;
     - tons de Bandeau ;
     - BarreValeur et graphiques ;
     - ombres (--sh-lift .6) ;
     - logos (TikTok sur noir ; le gris fondLogo #767676 reste valable).
6. **Recette.** Il faut des tests de rendu dans les deux thèmes et des captures 1440 / 390, comme le demande la définition de « fini ».