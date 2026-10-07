# TikTrends — Direction artistique de l’application

## Mandat prioritaire Kevin — 5 octobre 2026
Ces décisions complètent et remplacent les consignes incompatibles plus anciennes.
1. Publier effectivement les travaux annoncés : développement, recette, fusion sous CI/protections puis observation de la version servie. Une proposition ou une PR ouverte ne constitue pas une livraison.
2. Uniformiser les bordures et les cadres de chaque page, leurs marges et alignements : composants/tokens communs, toutes routes inventoriées, desktop/mobile et rail ouvert/réduit. Conserver les largeurs de lecture intérieures utiles sans décaler le cadre extérieur.
3. Regrouper Pilotage dans Accueil et y intégrer Analytics. Conserver analyses, filtres, droits, données, support et accès par liens existants ; ne pas se limiter à un raccourci de plus.
4. Prévoir et réaliser un espace ADMIN+ pour déposer instructions, savoirs, données et méthodes d'itération, relié réellement au contexte de Jarvis. Auditer stockage/ingestion/recherche existants ; provenance, versions, portée, autorisations et état de disponibilité explicites. Les documents sont des sources, pas une autorisation de contourner les règles. Cette demande autorise l'évolution ciblée nécessaire à ce parcours, pas une refonte générale du moteur ni des droits. Aucun contenu/méthode inventé ; aucun transfert des fichiers Kevin sans périmètre autorisé.
5. Mobiliser les agents nécessaires en parallèle sur périmètres disjoints ; un intégrateur pour shell/navigation/tokens, branches distinctes, preuves par lot et publication ordonnée.
La priorité reste contrôle puis publication des lots existants ; Formats créatifs et l'analyse CreaFlow restent ouverts. Pas d'action payante, de modification d'offre/prix/protections, de nouveau connecteur, de fixture métier en production ou de Canvas. Les migrations métier restent hors périmètre courant ; documenter concrètement une éventuelle nécessité.


> Priorité du 30 septembre : Home visuelle, navigation compacte Flora, rubrique Marque (Assets/Éléments/Styles/Brand kits/Concurrents), découverte et itération inspirées Atria. Voir `tiktrends-pilotage/DIRECTION-30SEPT.md`. Ces décisions remplacent les choix antérieurs incompatibles, sans supprimer les fonctions ni le mandat de recette globale.

## Décisions prioritaires Kevin — 29 septembre 2026

Ces décisions remplacent toute consigne contraire plus ancienne dans ce document et les previews.
- Réduction du menu : petite icône à côté du logo en tête, cible 44 px, sans collision ni troncature du nom ; plus de ligne « Réduire le menu » en pied. Rail 184/64 persistant, mobile distinct.
- Logo et nom TikTrends renvoient vers l’accueil existant.
- Recherche globale dans l’en-tête commun, hors rail ; raccourci Cmd/Ctrl K conservé. Recherches locales conservées.
- Cadre de travail Jarvis aligné sur Veille : le plafond 760 px ne doit plus contraindre toute la fonctionnalité ni le composeur. Une largeur de lecture intérieure peut rester limitée. Audit transversal de toutes les routes : marges, largeurs, bordures et exceptions justifiées.
- Vrais logos des outils réellement proposés, assets officiels/provenance vérifiés, visuels de marque et médias utiles ; préserver marque blanche et états réels des intégrations.
- Aperçu marque : pastilles seules au repos, HEX au clic/activation clavier, détail/copie accessibles ; aucune modification de couleur au clic.
- Refonte des filtres desktop et raccourcis Veille prioritaire, puis cohérence des autres pages : critères actifs, suppression individuelle, reset, tri distinct, états vide/erreur, conservation au retour, adaptation mobile.
- Parallélisme autorisé : deux agents sur Veille et Marque, propriétaire unique shell/tokens/intégration, fichiers isolés. Recette groupée puis confirmation, pas de dépense de tokens sans valeur. Aucun changement moteur/connecteur/prix/Canvas.


> Un espace de travail calme, visuel et facile à prendre en main. Jarvis est la référence commune.

**Version :** 25 septembre 2026. **Direction approuvée :** expérience Jarvis proposée dans cette conversation, avec les couleurs TikTrends et la simplicité des écrans Krea fournis.

Cette charte remplace les précédentes directions à grand hero marketing. Elle couvre toute l’application. Les previews livrées portent sur Jarvis, l’accueil personnalisé et Pubs IA ; les déclinaisons des autres pages ci-dessous sont des spécifications, pas des changements déjà appliqués au site réel.

## 1. Intention

L’utilisateur doit comprendre où il est, ce qu’il peut faire et la prochaine étape. L’interface reste discrète ; les créations, les échanges et les résultats occupent l’espace principal.

- Un titre clair, une explication utile si nécessaire et une action dominante par zone.
- Une navigation constante, compacte à la demande.
- Des surfaces sobres ; la séparation vient surtout de l’espace et du ton.
- Des réglages avancés accessibles progressivement, sans retirer les fonctions du produit.
- Une expérience ludique par les choix visuels et les interactions, jamais par la multiplication des effets.

Krea inspire la composition et la simplicité. TikTrends conserve ses couleurs, sa marque, ses contenus et ses capacités. Jarvis fournit le niveau de sobriété à suivre dans chaque module.

## 2. Palette commune

Valeurs de base relevées dans TikTrends le 24 septembre 2026. Les rôles ci-dessous sont normalisés pour toute l’application.

| Token | Valeur | Usage |
|---|---|---|
| `--tt-bg` | `#120810` | Fond principal |
| `--tt-sidebar` | `#0d070c` | Navigation |
| `--tt-surface` | `#1c121b` | Champs, compositeur, panneau ouvert |
| `--tt-hover` | `#2a1826` | Survol et élément de navigation sélectionné |
| `--tt-text` | `#f6eef4` | Texte principal |
| `--tt-text-secondary` | `#cbbcc7` | Description et labels |
| `--tt-text-muted` | `#9a8a98` | Métadonnées, placeholders |
| `--tt-accent` | `#ff5c8a` | Action principale et focus |
| `--tt-accent-soft` | `#2a1320` | Sélection discrète |
| `--tt-on-accent` | `#120810` | Libellé sur bouton rose |
| `--tt-border` | `rgba(255,255,255,.12)` | Contour discret unifié |
| `--tt-border-strong` | `rgba(255,255,255,.20)` | Séparation renforcée si utile |
| `--tt-success` | `#18cc8c` | Succès, avec libellé |
| `--tt-warning` | `#f5a623` | Attention, avec libellé |
| `--tt-error` | `#ff4d6d` | Erreur, avec message |
| `--tt-info` | `#3b82f6` | Information sémantique |

Le rose n’habille pas chaque bordure. Les boutons principaux ont un aplat rose clair, pas de halo. Le dégradé historique `#fe2c55 → #ff2d8f` est réservé à des usages de marque ponctuels ; il n’est pas le traitement par défaut de chaque écran.

Le texte sombre sur l’accent offre un contraste plus lisible que les petits libellés blancs sur le dégradé. Contrôler 4,5:1 pour le texte courant et 3:1 pour les repères interactifs. Les contours décoratifs translucides ne constituent pas, seuls, un focus clavier.

## 3. Typographie

Police de référence : Suisse Intl. Substitution utilisée dans les previews : Inter. Une seule famille pour l’interface ; poids 400 et 500, 600 limité au logotype ou à une nécessité de hiérarchie.

| Rôle | Desktop | Mobile | Interligne |
|---|---|---|---|
| Titre de page | 32px | 28px | 1,2 |
| Question d’accueil | 38px | 28px | 1,15 |
| Titre de panneau | 24px | 22px | 1,3 |
| Titre de section | 18–20px | 18px | 1,4 |
| Corps / réponse Jarvis | 14–16px | 14–16px | 1,5–1,7 |
| Navigation / contrôle | 13–14px | 14px | 1,5 |
| Métadonnée | 12px minimum | 12px minimum | 1,5 |

Titres légèrement resserrés : -0,02 à -0,025em. Les titres de 76–96px ne s’appliquent pas aux écrans de travail. Les champs texte passent à 16px sur mobile. Pas de surtitres décoratifs, de phrases entièrement en capitales ni de titres en dégradé.

## 4. Espaces et formes

Base 4px. Échelle : 4, 8, 12, 16, 20, 24, 32, 40, 48, 64px.

- Marges de contenu : 32–40px desktop, 20–24px mobile.
- Séparation de sections : 32–40px ; éléments liés : 8–16px.
- Champs et entrées de navigation : rayon 8px.
- Cartes de choix et panneaux : rayon 12px.
- Compositeur Jarvis : rayon 24px.
- Actions principales et secondaires : pilules ; contrôles de barre d’outils : rayon 8px.
- Cibles tactiles : 44px minimum ; icônes visibles 18–20px.
- Ombres réservées aux éléments superposés et aux aperçus en éventail. Pas de cartes ombrées partout.

## 5. Navigation latérale repliable

Deux états desktop : **184px développé**, **64px réduit**. Le changement libère 120px pour le contenu sans changer la route, la conversation, les filtres ou la marque active.

### Développé

Logo, bouton Réduire le menu, marque active, icône et nom de chaque destination. Les outils sont regroupés selon le travail à accomplir. L’élément actif possède un fond prune élevé et un repère textuel/accessible. La navigation principale reste la même entre les pages ; l’historique est une section locale de Jarvis.

### Réduit

Monogramme, bouton Développer le menu, initiale de marque et icônes. Les noms complets restent accessibles au survol, au focus clavier et aux technologies d’assistance. Les en-têtes de groupe disparaissent. L’icône active reste identifiable par son fond. Un bouton Historique redéploie le menu de Jarvis et donne accès aux discussions.

Le contrôle reste à la même place logique, possède un nom d’action mis à jour et annonce son état. Réduire le menu ne supprime pas une destination et ne ferme pas le contenu en cours.

### Préférence

Mémoriser le choix par utilisateur dans l’application réelle, commun à toutes les routes. Dans les previews, la préférence utilise l’état du lecteur lorsqu’il est disponible ; les fichiers autonomes ont leur propre état de démonstration et ne constituent pas une synchronisation de compte entre fichiers.

### Mobile

Sous 600px, le menu devient un panneau dépliable avec les libellés complets. La préférence desktop reste conservée mais n’impose pas une barre d’icônes au petit écran. Le bouton Menu mobile et le bouton Réduire desktop sont deux contrôles distincts. Éviter qu’un changement de largeur réinitialise le choix desktop.

## 6. Trois compositions, une même interface

**Conversation.** Colonne centrale de 760px maximum, accueil bref, champ généreux, trois suggestions au maximum. Le chat gagne l’espace après le premier échange. Le contexte est accessible par un bouton.

**Création et exploration.** Titre et courte description à gauche, une action principale, aperçu visuel si utile. Collections puis bibliothèque. Pas de grand hero plein écran. Images non recolorées, labels sous les vignettes, filtres secondaires repliables.

**Mesure et configuration.** Information alignée, période et provenance explicites. Tableaux ou listes quand ils facilitent la comparaison. Les indicateurs ne sont présents que s’ils répondent à une question réelle ; pas de métriques décoratives ni de panneaux vides en cascade.

La cohérence vient du menu, des tokens, des contrôles et du niveau de clarté ; elle n’impose pas de transformer tous les écrans en chat.

## 7. Déclinaison par module

| Module | Centre de l’écran | Simplification retenue |
|---|---|---|
| Accueil | Reprendre le travail ; prochaine action utile | Éviter l’inventaire complet des fonctions et diagnostics |
| Jarvis | Conversation | Sources, marque et consignes dans un panneau à la demande |
| Pubs IA | Point de départ visuel puis créations | Choix de format ; brief guidé ; filtres repliés |
| Image IA | Intention, référence produit et résultat | Paramètres avancés après les contrôles essentiels |
| Vidéo IA | Source, intention de mouvement et aperçu | Durée, format et coût au bon moment ; pas de jargon fournisseur par défaut |
| Textes IA | Brief et texte modifiable | Comparaison de variantes ; actions copier, modifier, utiliser |
| Assets | Bibliothèque et sélection de fichiers | Recherche, type et marque ; actions contextuelles |
| Veille | Créations et marques suivies | Signaux expliqués ; aucune rentabilité déduite de la seule durée de diffusion |
| Radar produits | Découverte et critères pertinents | Détails à l’ouverture ; provenance visible |
| Adsmap | Carte ou liste des tests et prochaine décision | Détail d’un test séparé de la vue d’ensemble |
| Analytics | Réponse à une question sur une période | Peu d’indicateurs utiles ; comparaison et limites explicites |
| Marque | Identité, produits, ton et consignes | Sections courtes éditables ; complétion demandée selon le besoin |
| Réglages | Préférences, sources, connexions et consommation | Distinguer paramètres utilisateur et diagnostics administrateur |

Ces règles précisent la direction des pages non maquettées. Avant de modifier leur code, vérifier les parcours, droits et fonctions existants pour préserver leur utilité.

## 8. Composants et comportements

**Bouton principal :** rose clair, libellé sombre, verbe explicite. Une seule priorité par groupe. Le coût, s’il existe, est annoncé avant l’opération.

**Bouton secondaire :** transparent ou prune, contour discret. Une action de navigation n’a pas le même poids que Créer ou Envoyer.

**Formulaire :** label visible, aide courte, valeur conservée en cas d’erreur. Les réglages avancés sont repliés, jamais supprimés. Validation près du champ.

**Carte de choix :** titre, bénéfice court et état sélectionné. Couleur accompagnée d’un repère accessible ; pas de progression automatique imposée au clic.

**Bibliothèque :** le média domine. Titre et état essentiels sous l’image ; historique, qualité détaillée et actions supplémentaires dans le détail.

**Discussion :** intention libre, suggestions contextualisées, réponses sourcées. Les limites de données sont expliquées. Aucune conclusion de performance sans données suffisantes.

**Panneau de contexte :** fermé à l’arrivée, opaque, fermeture visible, retour du focus au déclencheur. Éviter une modalité bloquante pour un simple réglage.

## 9. Accueil personnalisé

Quatre questions : pour qui créer, niveau d’expérience publicitaire, objectif immédiat, marque et site facultatif. Chaque réponse doit avoir un effet utile. Retour et passage direct toujours disponibles ; pas de répétition automatique pour un utilisateur récurrent.

L’objectif adapte les suggestions Jarvis. Le niveau règle la quantité d’accompagnement. Le site déclaré n’est pas présenté comme analysé. La question d’acquisition et la promotion commerciale ne bloquent pas le premier résultat utile.

Voir [experience-jarvis.md](experience-jarvis.md) pour le parcours et la répartition des informations de l’ancienne page Jarvis.

## 10. Mouvement, états et accessibilité

Mouvement bref au service de l’action : survol d’un aperçu, sélection, ouverture d’un panneau. Pas de boucle décorative. Respecter la réduction des animations ; le changement de menu peut rester instantané pour ne pas déplacer continuellement le contenu.

Prévoir vide initial, recherche sans résultat, chargement, erreur, accès refusé, donnée manquante et action désactivée. Le message indique la prochaine étape. Focus rose visible, contraste vérifié, clavier utilisable, séquence logique et noms accessibles.

Ne pas masquer les fonctions essentielles derrière un survol. Sur mobile, garder les libellés. Distinguer informations déclarées, observées, mesurées et déduites. Les journaux techniques et diagnostics serveur ne font pas partie des parcours ordinaires.

## 11. Tokens d’intégration

```css
:root {
  color-scheme: dark;
  --tt-bg: #120810;
  --tt-sidebar: #0d070c;
  --tt-surface: #1c121b;
  --tt-hover: #2a1826;
  --tt-text: #f6eef4;
  --tt-text-secondary: #cbbcc7;
  --tt-text-muted: #9a8a98;
  --tt-accent: #ff5c8a;
  --tt-accent-soft: #2a1320;
  --tt-on-accent: #120810;
  --tt-border: rgba(255,255,255,.12);
  --tt-border-strong: rgba(255,255,255,.20);
  --tt-font: 'Suisse Intl', 'Inter', sans-serif;
  --tt-sidebar-width: 184px;
  --tt-sidebar-compact-width: 64px;
  --tt-chat-width: 760px;
  --tt-radius-control: 8px;
  --tt-radius-panel: 12px;
  --tt-radius-composer: 24px;
  --tt-radius-pill: 9999px;
  --tt-section-gap: 32px;
  --tt-gap: 16px;
}
```

Les préfixes `--j-*` et `--tk-*` isolent les previews. L’intégration réelle doit les faire converger vers ces tokens communs et un seul composant de navigation.

## 12. Livraison et mise en œuvre

**Présent dans les previews :** navigation repliable Jarvis et Pubs IA, noms accessibles, accès compact à l’historique, retour aux libellés sur mobile, discussion simulée, accueil personnalisé et création guidée locale.

**Défini dans la charte :** direction des autres modules, composants communs, règles de contenu et de navigation.

**À intégrer dans l’application réelle :** composants partagés, persistance utilisateur de la préférence, services IA et données, règles d’accès et opérations métier. Aucun déploiement ni changement du site TikTrends n’a été effectué dans cette conversation.
