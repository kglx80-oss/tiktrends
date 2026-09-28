# Dashboard · composition (accueil orienté itération) · contrat de lot

Composition arrêtée par Codex (lot Dashboard, après Pubs IA #689). Complète
`docs/ux/pubs-ia-composition.md` et l'inventaire des routes
`docs/ux/routes-inventaire.md` (consigné en `9f710bd`). Périmètre : `/dashboard`.

## Cap rappelé

TikTrends sert l'analyse pour l'itération. L'accueil menait par la CRÉATION
(grille des studios en vedette) ; il mène désormais par la **prochaine
itération**, la création devient secondaire. On ne montre que des accès RÉELS
et des libellés descriptifs · aucun KPI ni recommandation inventé, aucune
promesse de rentabilité.

## L'ordre des sections (haut → bas)

1. **En-tête sobre** · « Bonjour <prénom> », marque active, phrase
   « Observe, teste, apprends de chaque itération. » ; crédits en puce discrète.
   Pas de héros, halo ni grille de fond ; titres graisse 500, charte existante.
2. **Ta prochaine étape** (DEVANT) · le vrai `JourneyPanel` (une action
   dominante issue du parcours réel, le reste derrière révélation). Le MODE se
   décide au noyau (`modeProchaineEtape`) : `installation` tant que le parcours
   existe et n'est pas complet, sinon `iteration` → **« Prépare ta prochaine
   itération »** avec accès **Adsmap** et **Veille**, sans pseudo-recommandation
   ni KPI inventé. Une étape d'installation n'est jamais travestie en hypothèse.
3. **Analyser & décider** · accès EXISTANTS (Adsmap, Analytics, Veille, Radar,
   mémoire Jarvis) en cartes compactes, libellés descriptifs (aucune promesse de
   rentabilité). Grille **3 colonnes desktop / 2 tablette / 1 mobile**
   (`repeat(auto-fill, minmax(min(340px, 100%), 1fr))`).
4. **Demande à l'assistant** · le chat existant, conservé, APRÈS les accès
   d'analyse · aucune génération automatique.
5. **Créer les variantes de ton test** · les quatre studios en **rangée
   compacte secondaire**, sans studio en vedette ni surtitre de produit clé.
6. **Explorer un exemple** · l'aperçu de démonstration, **replié par défaut**,
   mention « données de démonstration » avant ouverture ET dans le contenu. On
   ne laisse pas croire que brancher un compte rend ces fixtures réelles (le
   code lit un échantillon fixe) ; une porte honnête vers `/connections` reste
   offerte pour suivre ses vraies campagnes.

## Données réelles vs échantillon

- **Réel par espace** : marque, crédits, **parcours** (`onboardingState` →
  `journey` + `relance`). Seule source honnête d'une « prochaine action ».
- **Échantillon** : les cartes de l'aperçu viennent de `buildDashboard()` qui
  lit des fixtures · jamais la donnée de la marque. La mesure réelle vit dans
  Adsmap et Analytics.

## Contrat responsive & états

- Contenu **max 1200**, centré ; marges **32 / 16** ; cibles **44** ; aucun
  débordement horizontal.
- À **390** et **hauteur 720**, la prochaine étape / action est visible **sans
  traverser une grille de studios** (la création est plus bas, après le chat).
- États tenus : noms longs, parcours **incomplet** (installation) / **complet**
  (itération), **absence de marque** (selon les gardes existantes).
- **Support** : réutilise le mode ANCRÉ de #689 sur `/dashboard` (bouton en
  pied, panneau dialogue portalisé) · plus de bulle fixe masquant chat/actions.
  Le rail et les autres routes gardent la bulle flottante inchangée.

## Ce qui n'est PAS touché

Fonctions, droits, données, moteur / permissions / prix. Aucune génération
payante. Le shell (hors ancrage support de cette route) et les autres routes
restent intacts.

## Garde

`test/dashboard-composition.test.tsx` : la règle pure `modeProchaineEtape`
(prouvée par mutation), le HTML rendu de `ProchaineEtape` (installation vs
itération, accès réels) et de `ApercuExemple` (replié, honnête), l'ordre des
sections à la source, l'ancrage support, la borne 1200. Tests d'accueil
existants adaptés à la composition (création secondaire, accès d'analyse).
