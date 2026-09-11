---
name: impeccable
description: >-
  À suivre pour TOUTE modification de code sérieuse de ce dépôt (feature, fix,
  refactor). Impose la discipline maison : explorer avant de coder, mettre la
  règle métier dans un module pur du noyau, écrire une garde qui vérifie un
  RÉSULTAT puis la faire tomber par mutation, passer les quatre portes
  (typecheck · lint · test · build), livrer une modif = une PR mergée squash,
  et ne jamais dépenser d'IA sans accord explicite. Invoquer dès qu'on s'apprête
  à écrire, corriger ou réorganiser du code, ou à ouvrir une PR.
---

# Méthode impeccable

Le but : que chaque changement soit **vérifiable, borné et honnête**. On ne dit
« c'est fait » que quand une garde le prouve et que les quatre portes sont
vertes. Cette méthode vaut pour ce dépôt (voir aussi `CLAUDE.md`).

## Les six règles, dans l'ordre

1. **Explorer d'abord, deviner jamais.** Avant d'écrire une ligne, lire le
   VRAI code concerné (le fichier, ses appelants, le test qui le garde). Une
   hypothèse non vérifiée sur « comment ça marche » est la première cause de PR
   qui casse.

2. **La règle vit dans le noyau, pas dans le JSX.** Toute décision métier
   (un seuil, un calcul, un « quoi afficher », un « quand refuser ») va dans un
   module **pur** de `packages/core` (ni base, ni réseau, ni modèle), donc
   testable. Jamais dans un fichier `'use server'`, jamais dans une condition
   d'affichage qu'on découvre cassée en cliquant.

3. **Vérifier un RÉSULTAT, jamais la présence d'un appel.** Une garde doit
   constater ce qu'on VOIT ou ce qui SORT — le HTML rendu, la valeur retournée —
   pas qu'une fonction est appelée quelque part. Quand c'est possible, rendre le
   composant et lire le HTML ; sinon, tester la règle pure du noyau.

4. **Une garde non éprouvée ne garde rien.** Après avoir écrit la garde, la
   faire **TOMBER** : casser volontairement ce qu'elle défend (une mutation),
   vérifier qu'elle échoue avec la bonne phrase, puis restaurer. Une garde qui
   passe au vert sur sa première mutation regardait la mauvaise chose.

5. **Les quatre portes avant de pousser.** Depuis `product/` :
   `pnpm -w run typecheck && pnpm -w run lint && pnpm -w run test && pnpm -w run build`.
   On ne pousse qu'une fois les quatre vertes. Une PR qui rougit la CI coûte un
   cycle et la confiance des relecteurs.

6. **Une modif = une PR, mergée squash.** Chaque changement est ciblé,
   auto-portant, et part sur sa propre branche off `main`. Pas d'empilement, pas
   de PR fourre-tout. Le message de commit dit le DÉFAUT réparé et comment la
   garde le prouve.

## Mesures et seuils

- **Mesurer les seuils, ne jamais les poser d'instinct.** Un nombre écrit de
  tête (« 70/100 », « au moins 5 ») se révèle faux une fois sur deux. Le mesurer,
  écrire la valeur mesurée dans le module, choisir avec de la marge — ou le
  dériver de la distribution (médiane) plutôt que de le fixer.
- **Comparer à une référence, jamais à zéro.** Un taux seul ne dit rien. On le
  compare au taux général, avec un minimum d'effectif et un intervalle (Wilson)
  qui doit exclure la référence. **Le silence est une conclusion valable**, et
  souvent la plus honnête.

## Dépense

- **Jamais un dollar d'IA sans le dire, et toujours une barrière.** Toute
  génération passe par le garde de dépense (`apps/web/lib/spend-guard.ts`). On
  annonce le prix AVANT le clic, jamais après. En mode autonome : 0 $ tant que
  ce n'est pas explicitement autorisé.

## Ce qu'on ne peut pas voir

- **Une question qui exige de VOIR un rendu se pose au propriétaire**, elle ne se
  tranche pas à sa place. On peut durcir le code (garde, repli), mais on confirme
  le symptôme visuel avant de livrer un correctif qu'on ne peut pas vérifier soi.

## Conventions d'interface (ce dépôt)

- Français. Pas de tiret cadratin : utiliser « · ». Styles en ligne uniquement.
- Marque blanche : « Trendtrack » n'apparaît jamais à l'écran ; « ADSMAP »
  s'écrit **Adsmap** dans l'interface.
- Icônes au trait (jeu partagé `components/Icon`), jamais d'emoji d'interface.

## Le réflexe de fin

Avant de dire « terminé » : la garde tombe-t-elle quand je casse la chose
qu'elle défend ? Les quatre portes sont-elles vertes ? La PR ne fait-elle
qu'UNE chose ? Si oui aux trois, c'est impeccable.
