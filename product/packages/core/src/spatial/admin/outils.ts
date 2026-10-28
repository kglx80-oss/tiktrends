import type { DeploymentState } from '../../deployment';

/**
 * Les règles des outils de la plateforme hors maquette (vague 3 · Console,
 * Interrupteurs, tables du Tour de contrôle au téléphone). Pures, testées.
 */

/** La pastille du diagnostic de déploiement · un MOT et une classe de la maquette, jamais la couleur seule. */
export function etatDeploiementAdmin(etat: DeploymentState): { libelle: string; classe: '' | 'g' | 'w' | 'r' } {
  // Schéma à jour ET commit identifié · le meilleur état que le produit peut
  // CONSTATER seul · il ne prouve pas que ce commit est le dernier (origin/main).
  if (etat.ok) return { libelle: 'Schéma à jour · commit identifié', classe: 'g' };
  if (etat.applied === null) return { libelle: 'État illisible', classe: '' };
  if (etat.behind && etat.behind > 0) return { libelle: 'Migrations en attente', classe: 'r' };
  if (etat.ahead) return { libelle: 'Base en avance', classe: 'w' };
  // Schéma à jour mais commit inconnu · schéma à jour ≠ code à jour (F09).
  if (!etat.codeIdentifie && etat.behind === 0 && !etat.ahead) return { libelle: 'Schéma à jour · code non identifié', classe: 'w' };
  return { libelle: 'À vérifier', classe: '' };
}

/** L'état d'essai d'un compte de test (console) · `daysLeft` de `trialStatus`. */
export function etatEssaiAdmin(t: { expired: boolean; daysLeft: number | null }): { texte: string; classe: '' | 'g' | 'w' | 'r' } {
  if (t.daysLeft == null) return { texte: 'Aucun', classe: '' };
  if (t.expired) return { texte: 'Expiré', classe: 'r' };
  return { texte: `${t.daysLeft} j restant${t.daysLeft > 1 ? 's' : ''}`, classe: t.daysLeft <= 3 ? 'w' : 'g' };
}

/**
 * Les tables larges du Tour de contrôle au téléphone · sous 600 px, sept ou
 * huit colonnes `fr` se partageaient ~294 px et le texte s'empilait lettre par
 * lettre (déjà le cas dans la maquette). La table défile alors horizontalement :
 * sa colonne unique a une largeur MINIMALE, les lignes gardent leurs colonnes.
 *
 * Mesuré le 27/10 (Chromium, 390 × 844, coquille de la maquette, données de
 * parité) · plus petite cellule de texte selon la largeur minimale :
 *
 * | table               | sans | 480 | 560 | 640 | 680 | 720 |
 * | ------------------- | ---- | --- | --- | --- | --- | --- |
 * | Paiements en défaut |   7  |  35 |  47 |  59 |  64 |  70 |
 * | Comptes             |  24  |  46 |  55 |  64 |  69 |  74 |
 * | Forfaits publiés    |  20  |  46 |  57 |  68 |  74 |  79 |
 *
 * Retenu · la plus petite cellule ≥ 64 px (« Business », « 49,00 € », une date
 * courte tiennent sur une ligne), plus une colonne de marge pour les vraies
 * données, plus longues que celles de la parité.
 */
export const LARGEUR_MIN_TABLE_TELEPHONE = {
  defauts: 720, comptes: 680, forfaits: 640,
  // Les tables suivantes · mesurées le 28/10 (banc, Chromium, 390 × 844, données
  // semées) · plus petite largeur où AUCUNE cellule n'est rognée (`.atr>span`,
  // `scrollWidth > clientWidth`) et aucun montant ne passe sur deux lignes :
  //
  // | table                                   | colonnes | seuil mesuré | retenu |
  // | --------------------------------------- | -------- | ------------ | ------ |
  // | Crédits · économie & marges             |    7     |     660      |  760   |
  // | Crédits · marge nette                   |    7     |     440      |  640   |
  // | Crédits · rentabilité & optimisation    |    6     |     440      |  640   |
  // | Crédits · corrections de barème         |    4     |     520      |  640   |
  // | Revenus · rentabilité par abonnement    |    8     |     800      |  800   |
  // | Inscriptions · profil déclaré (9 col.)  |    9     |     860      |  860   |
  //
  // Sans largeur minimale, ces tables se partageaient ~294 px · 51 textes rognés
  // sur Crédits (« 0,… € », « Anthr… »), 17 sur Revenus. Le plancher de 640
  // (plus petite cellule ≥ 64 px) vaut pour toutes. Le profil déclaré était à
  // 900 avec des colonnes trop étroites pour la pastille « Onboardé » (rognée
  // même à 980) · ses colonnes sont rééquilibrées et 860 tient aussi dans la
  // zone utile d'un écran de 1280 (866 px) · plus de défilement de 34 px.
  declarations: 860,
  operationsCredits: 760, netsCredits: 640, risquesCredits: 640, correctionsCredits: 640,
  rentabiliteRevenus: 800,
} as const;

/** Le style en ligne d'une table défilante (`.atable`) · ses lignes gardent leurs propres colonnes. */
export function styleTableDefilante(largeurMin: number): { overflowX: 'auto'; gridTemplateColumns: string } {
  return { overflowX: 'auto', gridTemplateColumns: `minmax(${Math.max(0, Math.round(largeurMin))}px, 1fr)` };
}

/**
 * Le diagnostic du déploiement de la console · ce que le serveur exécute
 * VRAIMENT (commit du build, version de maquette, migrations, date du build).
 * Une valeur absente se dit (« inconnu », `·`) · elle n'est jamais un zéro.
 */
export function diagnosticDeploiementAdmin(etat: DeploymentState, builtAt: string | null, absente = '·'): {
  etat: { libelle: string; c: '' | 'g' | 'w' | 'r' }; resume: string; cases: Array<{ k: string; v: string }>;
} {
  const e = etatDeploiementAdmin(etat);
  const quand = builtAt ? new Date(builtAt) : null;
  return {
    etat: { libelle: e.libelle, c: e.classe }, resume: etat.summary,
    cases: [
      { k: 'Commit du build', v: etat.build || 'inconnu' },
      { k: 'Maquette', v: `v${etat.renderVersion}` },
      { k: 'Migrations', v: `${etat.applied ?? absente} / ${etat.inBuild}` },
      { k: 'Build', v: quand && !Number.isNaN(quand.getTime()) ? quand.toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : absente },
    ],
  };
}
