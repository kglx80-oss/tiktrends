# Benchmark Studios F01-F24 · campagne SIMULÉE

> **SIMULÉ · exécution sur fournisseurs simulés, aucune évaluation réelle de la qualité**

> Ce rapport prouve que la chaîne (registre, release, contrôles, oracles, fiches, coûts) tourne de bout en bout. Les réponses du modèle et les images sont SIMULÉES : il ne dit RIEN de la qualité réelle et ne peut pas valoir évaluation d’une release.

- Horodatage : 2026-10-08T11:45:29.869Z
- Release : `42dbf3b9-4aad-4f2e-a08d-3d2e3c62e520` · empreinte `c67adcae823011a2f473ca9d9a7f090bcf8efb9660ebcafdf20113c4ac8f3fd1`
- Adaptateur texte : simule-benchmark · modèle modele-simule-benchmark
- Devis agrégé : non chiffrable (F01, F02, F07, F12, F13, F15)
- Dépense de la campagne : 0,000 $
- Verdict (SIMULÉ) : **INCOMPLET** · approuvable : non · évaluation réelle : non
- Invariants déterministes : 48/51 passés, 0 en échec, 3 non évaluables
- Motifs : cas incomplets : F01, F02, F07, F12, F13, F15 ; campagne SIMULÉE · ne vaut jamais évaluation réelle
- Empreinte du rapport : `da81d6a7fecdae8f51df42ace93d2951caef0a5f80c62a37badf8a23587329bd`

## Cas (SIMULÉ)

| Cas | Statut | Invariants | Revue humaine | Motif |
| --- | --- | --- | --- | --- |
| F01 | bloque_capacite | 2/2 | fiche à remplir | Étape sur un profil non routé (vision_analysis) : bloquée avant appel. |
| F02 | bloque_capacite | 1/2 | fiche à remplir | Étape sur un profil non routé (vision_analysis) : bloquée avant appel. |
| F03 | execute | 3/3 | sans objet |  |
| F04 | execute | 3/3 | sans objet |  |
| F05 | execute | 2/2 | fiche à remplir |  |
| F06 | execute | 2/2 | sans objet |  |
| F07 | bloque_capacite | 0/1 | sans objet | Étape sur un profil non routé (vision_analysis) : bloquée avant appel. |
| F08 | execute | 1/1 | sans objet |  |
| F09 | execute | 3/3 | sans objet |  |
| F10 | execute | 1/1 | sans objet |  |
| F11 | execute | 2/2 | sans objet |  |
| F12 | bloque_capacite | 3/3 | sans objet | Étape sur un profil non routé (vision_analysis) : bloquée avant appel. |
| F13 | bloque_capacite | 0/1 | sans objet | Étape sur un profil non routé (vision_analysis) : bloquée avant appel. |
| F14 | execute | 2/2 | fiche à remplir |  |
| F15 | bloque_capacite | 1/1 | fiche à remplir | Étape sur un profil non routé (vision_analysis) : bloquée avant appel. |
| F16 | execute | 2/2 | sans objet |  |
| F17 | execute | 1/1 | sans objet |  |
| F18 | execute | 3/3 | fiche à remplir |  |
| F19 | execute | 2/2 | sans objet |  |
| F20 | execute | 2/2 | fiche à remplir |  |
| F21 | execute | 3/3 | sans objet |  |
| F22 | execute | 3/3 | sans objet |  |
| F23 | execute | 2/2 | fiche à remplir |  |
| F24 | execute | 4/4 | sans objet |  |

## Devis par cas (SIMULÉ)

| Cas | Appels texte | Médias | Plafond |
| --- | --- | --- | --- |
| F01 | 4 | 2 | non chiffrable |
| F02 | 4 | 2 | non chiffrable |
| F03 | 2 | 0 | 0,264 $ |
| F04 | 2 | 0 | 0,264 $ |
| F05 | 1 | 2 | 0,292 $ |
| F06 | 1 | 0 | 0,132 $ |
| F07 | 1 | 0 | non chiffrable |
| F08 | 1 | 0 | 0,132 $ |
| F09 | 1 | 0 | 0,132 $ |
| F10 | 1 | 0 | 0,132 $ |
| F11 | 2 | 0 | 0,264 $ |
| F12 | 2 | 0 | non chiffrable |
| F13 | 1 | 0 | non chiffrable |
| F14 | 2 | 2 | 0,424 $ |
| F15 | 3 | 2 | non chiffrable |
| F16 | 1 | 0 | 0,132 $ |
| F17 | 1 | 0 | 0,132 $ |
| F18 | 1 | 0 | 0,132 $ |
| F19 | 3 | 0 | 0,396 $ |
| F20 | 4 | 8 | 3,248 $ |
| F21 | 1 | 0 | 0,132 $ |
| F22 | 1 | 0 | 0,132 $ |
| F23 | 1 | 0 | 0,132 $ |
| F24 | 1 | 0 | 0,132 $ |

Chaque dossier `Fxx/` contient : `entrees.json` (entrées et empreintes du jeu synthétique), `config.json` (release, modèle, adaptateur, traces), `sorties.json`, `oracle.json`, `fiche-revue.json` (si revue humaine), `cout.json`. Tous portent le mode SIMULÉ.

