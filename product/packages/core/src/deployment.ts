/**
 * Ce qui tourne vraiment, par opposition à ce qui est écrit.
 *
 * ── Le tour qu'on a perdu ────────────────────────────────────────────────────
 *
 * Une grille de créas a été rapportée comme cassée. Il a fallu sonder le rendu
 * bande par bande pour établir qu'elle ne pouvait PAS avoir été produite par le
 * code du dépôt · le serveur tournait une version antérieure.
 *
 * Entre-temps j'avais « corrigé » trois défauts, dont deux n'existaient pas.
 *
 * Personne ne pouvait le savoir : rien dans le produit ne dit quelle version est
 * déployée, avec quelle maquette, ni jusqu'où la base est migrée. Un écran qui
 * ne sait pas ce qu'il exécute transforme chaque rapport de bug en enquête.
 *
 * ── Trois chiffres, et un seul compte vraiment ───────────────────────────────
 *
 * La version de la maquette dit si les rendus sont ceux qu'on croit. Le nombre
 * de migrations en retard dit si la base sait faire ce que le code lui demande.
 * L'empreinte du build dit sur quel commit on parle.
 *
 * **Le retard de migrations est le plus grave** · un code qui lit une colonne
 * absente échoue à l'exécution, pas à la compilation.
 *
 * ── Le cas qu'on n'oublie pas ────────────────────────────────────────────────
 *
 * La base peut être EN AVANCE sur le build · c'est ce qui arrive quand un
 * déploiement est annulé après ses migrations. Le silence sur ce cas laisserait
 * croire à un système sain alors qu'il est dans l'état le plus difficile à
 * défaire.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface DeploymentState {
  /** Version de la maquette embarquée dans ce build. */
  renderVersion: number;
  /** Empreinte du commit · `null` quand le build ne l'a pas reçue. */
  build: string | null;
  /** Migrations présentes dans ce build. */
  inBuild: number;
  /** Migrations appliquées en base · `null` quand la lecture a échoué. */
  applied: number | null;
  /** Combien manquent · 0 quand tout est appliqué, `null` si illisible. */
  behind: number | null;
  /** Vrai quand la base est EN AVANCE · déploiement annulé après ses migrations. */
  ahead: boolean;
  /** Rien à signaler. */
  ok: boolean;
  summary: string;
}

export function deploymentState(input: {
  renderVersion: number;
  build?: string | null;
  inBuild: number;
  applied: number | null;
}): DeploymentState {
  const build = input.build?.trim() || null;
  const applied = input.applied;

  const base = {
    renderVersion: input.renderVersion,
    build,
    inBuild: input.inBuild,
    applied,
  };

  if (applied === null) {
    return {
      ...base, behind: null, ahead: false, ok: false,
      summary: 'Impossible de lire l’état des migrations · on ne sait pas si la base suit ce build.',
    };
  }

  const ecart = input.inBuild - applied;

  if (ecart > 0) {
    return {
      ...base, behind: ecart, ahead: false, ok: false,
      summary: `${ecart} migration(s) en attente · le code attend des colonnes que la base n’a pas encore.`,
    };
  }

  if (ecart < 0) {
    // Une base en avance ne « manque » de rien · elle porte des changements que
    // ce build ne connaît pas, ce qui est l'état le plus difficile à défaire.
    return {
      ...base, behind: 0, ahead: true, ok: false,
      summary: `La base a ${-ecart} migration(s) de plus que ce build · un déploiement a probablement été annulé après les avoir appliquées.`,
    };
  }

  return {
    ...base, behind: 0, ahead: false, ok: true,
    summary: `À jour · ${applied} migration(s), maquette v${input.renderVersion}${build ? `, build ${build}` : ''}.`,
  };
}
