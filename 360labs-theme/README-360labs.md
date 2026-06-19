# Thème Shopify — 360labs

Thème Shopify complet basé sur **Horizon**, qui reproduit le site vitrine **360labs**
(design « Iridescent / Sora ») sous forme de **sections 100 % personnalisables**
depuis l'éditeur de thème. Toutes les fonctionnalités e-commerce d'Horizon
(produit, collection, panier, recherche, checkout) restent disponibles.

## 1. Installer le thème

**Option A — Shopify CLI (recommandé)**
```bash
cd 360labs-theme
shopify theme dev     # prévisualisation locale
shopify theme push    # envoi vers la boutique
```

**Option B — Admin Shopify**
Zippez le contenu du dossier `360labs-theme/` (les dossiers `assets`, `config`,
`layout`, `sections`, `snippets`, `templates`, `blocks`, `locales` doivent être
à la racine du zip), puis *En ligne > Thèmes > Ajouter > Importer*.

## 2. Pages à créer (Admin > Boutique en ligne > Pages)

Le menu et les boutons pointent vers ces pages. Pour chacune, créez une page
avec le **handle** indiqué et assignez le **template** correspondant (menu
« Modèle de thème » à droite de l'éditeur de page).

| Page (titre libre)     | Handle (URL)   | Template à choisir |
|------------------------|----------------|--------------------|
| Le Groupe              | `le-groupe`    | `page.le-groupe`   |
| L'écosystème           | `ecosysteme`   | `page.ecosysteme`  |
| Entreprises            | `entreprises`  | `page.entreprises` |
| Résultats              | `resultats`    | `page.resultats`   |
| La Plateforme          | `plateforme`   | `page.plateforme`  |
| Audit gratuit          | `audit`        | `page.audit`       |
| Contact                | `contact`      | `page.contact`     |
| Tutoriels              | `tutoriels`    | `page.tutoriels`   |
| Ressources             | `ressources`   | `page.ressources`  |

> La page d'accueil utilise automatiquement le template `index` (déjà configuré).

## 3. Blog « Journal »

Créez un blog avec le handle `journal` (Admin > Articles de blog > Blogs).
Le template `blog` est déjà stylé 360labs : il affiche automatiquement vos
articles (image, catégorie via le 1er tag, date). Sans article, des cartes de
démonstration s'affichent (modifiables dans la section « 360labs · Journal / Blog »).

## 4. Menus (Admin > Navigation)

Le **footer** affiche ses colonnes à partir de menus Shopify. Pour chaque colonne
(section « 360labs · Footer », blocs « Colonne de liens »), choisissez un menu :

- **Le Groupe** : Le Groupe, L'écosystème, La Plateforme, Résultats
- **Travailler avec nous** : Audit gratuit, Entreprises, Contact
- **Légal** : Mentions légales, Confidentialité, CGV

Le **header** (section « 360labs · Header ») gère ses liens via des blocs
« Lien de navigation » et « Item méga-menu » directement dans l'éditeur de thème
(pas besoin de menu Shopify).

## 5. Formulaires

- **Audit / Contact / Entreprises** : formulaire de contact Shopify natif
  (`{% form 'contact' %}`). Les soumissions arrivent dans la boîte mail de la
  boutique.
- **Newsletter (Journal) / Liste d'attente (Plateforme)** : inscription client
  Shopify (`{% form 'customer' %}`), taguée `newsletter` / `waitlist`.

## 6. Personnalisation

Tout est éditable dans **Boutique en ligne > Personnaliser** :
chaque section 360labs expose ses textes, liens, couleurs (thème clair/sombre
par section), images et blocs (cartes, agences, marques, statistiques…).

### Sections 360labs disponibles
`Header`, `Footer`, `Hero`, `Split`, `Hub` (écosystème interactif), `Agences`,
`Ownership`, `Étude de cas`, `Actualité`, `Mur de marques`, `Plateforme`,
`Double CTA`, `Hero de page`, `Bannière`, `Preuves`, `Éditorial`, `Convictions`,
`Fondateurs`, `Bloc agence`, `Offres`, `Avis`, `Réassurance`, `Formulaire`,
`Teaser`, `Ressources`, `Journal / Blog`, `Schéma`, `Capsule`.

## 7. Design system

- **Police** : Sora (auto-hébergée, `assets/labs-sora-*.woff2`).
- **CSS** : `assets/labs.css` (scopé sous `.labs` pour ne pas impacter les pages
  e-commerce Horizon). Chargé globalement dans `layout/theme.liquid`.
- **JS** : `assets/labs-nav.js` (méga-menu + hamburger), `assets/labs-hub.js`
  (hub orbital + animations « reveal on scroll »). Compatibles avec
  l'éditeur de thème (réinitialisation sur `shopify:section:load`).
- **Responsive** : points de rupture à 980px et 620px (ordinateur, tablette,
  mobile). Respecte `prefers-reduced-motion`.
- **Logos écosystème** : `assets/labs-logo-{glx,tiktrends,websitz,melie,focuslabs,apollon}.svg`.
