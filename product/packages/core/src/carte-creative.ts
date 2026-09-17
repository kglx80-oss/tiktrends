/**
 * La carte créative · ce qu'elle DIT de la qualité d'une création, décidé ici.
 *
 * ── Pourquoi au noyau ────────────────────────────────────────────────────────
 *
 * La carte d'une création mêlait trois choses de natures différentes · la
 * pertinence pour la marque (un vote humain qui entraîne Jarvis), la qualité de
 * fabrication (ce qu'une relecture AUTOMATIQUE a constaté) et la performance
 * mesurée (le verdict du marché). Les confondre laisse lire un pouce levé comme
 * une preuve de performance, ou un défaut suspecté comme un fait. La règle de
 * synthèse — « combien de points à vérifier », « est-ce bloquant », « peut-on
 * dire prête à diffuser » — est une DÉCISION · elle vit donc dans un module pur,
 * éprouvable sans rendu.
 *
 * ── Trois natures de contrôle, jamais confondues (CDC v7 · N04) ───────────────
 *
 * Le badge disait « Prête à diffuser » dès qu'une relecture AUTOMATIQUE ne
 * relevait rien · y compris sur un témoignage (« Ma piscine n'a jamais été
 * aussi nette ») dont personne n'avait vérifié la source. L'absence d'un défaut
 * DÉTECTÉ n'est pas la vérification d'une preuve ABSENTE · le silence de la
 * relecture sur un fait n'est pas une validation de ce fait.
 *
 * On sépare donc trois natures, et on les rend consultables :
 *
 * 1. Le contrôle TECHNIQUE · la relecture automatique (produit fidèle, texte
 *    lisible, copie conforme). Elle produit des SUSPICIONS, pas des verdicts.
 * 2. La validation FACTUELLE · un fait porté par la pub (citation/témoignage,
 *    offre/prix, référence produit) est-il vérifié CONTRE une source. Par
 *    défaut, un fait présent est « à vérifier » · pas « conforme parce que rien
 *    n'a sonné ». Changer le prix, la citation ou la composition rend caduque la
 *    validation concernée (`invalidee`).
 * 3. L'approbation HUMAINE · une personne a-t-elle approuvé, et laquelle.
 *
 * « Prête à diffuser » exige les contrôles BLOQUANTS : la relecture technique
 * passe ET aucun fait n'est à vérifier ou caduc. « Performance inconnue » reste
 * indépendant · une pub prête techniquement n'a pas pour autant fait ses preuves
 * sur le marché.
 */

/** L'état d'un fait porté par la pub · face à une SOURCE, jamais « rien détecté ». */
export type EtatFait = 'verifiee' | 'a_verifier' | 'invalidee';

/** Un fait à valider · une citation, une offre, une référence, un prix. */
export interface FaitControle {
  cle: string;
  /** Ce que le fait affirme, nommé · « Témoignage », « Offre · -20 % ». */
  label: string;
  etat: EtatFait;
  /** Sur quoi s'appuie la validation · vide quand rien ne l'atteste. */
  source?: string | null;
  /** Qui a validé · nom lisible. Rempli sur un fait vérifié ou caduc. */
  validateur?: string | null;
  /** Quand · date lisible. */
  date?: string | null;
  /** La version du contenu qui a été validée · change dès que le contenu change. */
  version?: string | null;
}

/** La provenance d'une création · qui, quand, quelle version. */
export interface ProvenanceCarte {
  auteur?: string | null;
  date?: string | null;
  version?: string | null;
}

/** Ce qu'une relecture a consigné sur une création · forme déjà résumée. */
export interface ControleCarte {
  /** Une phrase sur la copie retouchée · vide quand la copie est conforme. */
  copieResume?: string | null;
  /** La retouche de copie est-elle grave (accroche réécrite) ? */
  copieGrave?: boolean | null;
  /** Le produit est-il fidèle · `false` = modifié, `null` = pas jugé. */
  produitFidele?: boolean | null;
  /** Les écarts produit constatés · le premier sert de détail. */
  ecarts?: string[] | null;
  /** Le texte est-il lisible · `false` = non, `null` = pas de texte ou pas jugé. */
  texteLisible?: boolean | null;
  /** Ce qui gêne la lecture · le premier sert de détail. */
  problemesLisibilite?: string[] | null;
  /** Les faits à valider contre une source · citation, offre, prix, référence. */
  faits?: FaitControle[] | null;
  /** L'approbation humaine explicite · `null` quand personne n'a tranché. */
  approbation?: { par: string; le?: string | null } | null;
  /** Qui a fabriqué la création, quand, quelle version. */
  provenance?: ProvenanceCarte | null;
}

export type NiveauQualite = 'ok' | 'suspicion' | 'bloquant';
export type TonQualite = 'bon' | 'attention' | 'bloquant' | 'inconnu';

/** Le contrôle technique · la relecture automatique et son constat. */
export interface NatureTechnique {
  /** La relecture a-t-elle eu lieu · sans elle, on ne conclut rien. */
  fait: boolean;
  niveau: NiveauQualite;
  /** Les suspicions relevées, nommées · détectées automatiquement. */
  points: string[];
}

/** La validation factuelle · l'état des faits portés par la pub. */
export interface NatureFactuelle {
  faits: FaitControle[];
  verifies: number;
  aVerifier: number;
  invalides: number;
}

/** L'approbation humaine · présente ou absente, et par qui. */
export interface NatureHumaine {
  approuve: boolean;
  par?: string | null;
  le?: string | null;
}

export interface QualiteCarte {
  /** La création a-t-elle été jugée · sans aucun contrôle, on ne conclut pas. */
  verifie: boolean;
  niveau: NiveauQualite;
  /** Les suspicions techniques, nommées · pour le détail (compat). Vide si rien. */
  points: string[];
  /** La synthèse affichée sur la carte · « 2 points à vérifier », etc. */
  libelle: string;
  ton: TonQualite;
  /** Contrôles bloquants passés · relecture technique OK et aucun fait ouvert. */
  pretADiffuser: boolean;
  /** Les suspicions techniques viennent d'une relecture automatique. */
  automatique: boolean;
  /** Les trois natures, distinctes et consultables. */
  technique: NatureTechnique;
  factuel: NatureFactuelle;
  humain: NatureHumaine;
  provenance: ProvenanceCarte | null;
  /** Ce qui est approuvé · pour le détail dépliable. */
  pointsApprouves: string[];
  /** Ce qui reste en réserve · suspicions techniques et faits ouverts. */
  reserves: string[];
}

function txt(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
function premier(v: unknown): string {
  return Array.isArray(v) ? txt(v[0]) : '';
}

/** La relecture technique a-t-elle porté un jugement ? */
function relueTechnique(c: ControleCarte): boolean {
  return c.produitFidele != null || c.texteLisible != null || !!txt(c.copieResume);
}

/**
 * La synthèse qualité d'une création, à partir de ce qu'une relecture a
 * constaté ET des faits qu'elle porte.
 *
 * Ordre des réserves · le produit d'abord (une pub au packaging inventé est
 * inutilisable), puis la lisibilité, puis la copie, puis les faits à vérifier ·
 * du plus éliminatoire au plus « à confirmer », pour qu'une lecture rapide et le
 * détail racontent la même chose.
 */
export function qualiteCarte(controle?: ControleCarte | null): QualiteCarte {
  const c = controle ?? {};

  // ── Nature 1 · le contrôle technique (relecture automatique). ──────────────
  const techniqueFait = relueTechnique(c);
  const produitKo = c.produitFidele === false;
  const texteKo = c.texteLisible === false;
  const copie = txt(c.copieResume);
  const copieGrave = !!c.copieGrave && !!copie;

  const pointsTech: string[] = [];
  if (produitKo) { const e = premier(c.ecarts); pointsTech.push(e ? `Produit modifié · ${e}` : 'Produit modifié'); }
  if (texteKo) { const p = premier(c.problemesLisibilite); pointsTech.push(p ? `Texte peu lisible · ${p}` : 'Texte peu lisible'); }
  if (copie) pointsTech.push(copieGrave ? `Accroche réécrite · ${copie}` : `Copie retouchée · ${copie}`);

  const techBloquant = produitKo || texteKo || copieGrave;
  const niveauTech: NiveauQualite = techBloquant ? 'bloquant' : pointsTech.length ? 'suspicion' : 'ok';
  const technique: NatureTechnique = { fait: techniqueFait, niveau: niveauTech, points: pointsTech };

  // ── Nature 2 · la validation factuelle. ────────────────────────────────────
  const faits = (c.faits ?? []).filter((f): f is FaitControle => !!f && !!txt(f.label));
  const aVerifier = faits.filter((f) => f.etat === 'a_verifier').length;
  const invalides = faits.filter((f) => f.etat === 'invalidee').length;
  const verifies = faits.filter((f) => f.etat === 'verifiee').length;
  const factuel: NatureFactuelle = { faits, verifies, aVerifier, invalides };

  // ── Nature 3 · l'approbation humaine. ──────────────────────────────────────
  const par = txt(c.approbation?.par);
  const humain: NatureHumaine = { approuve: !!par, par: par || null, le: txt(c.approbation?.le) || null };

  // ── Provenance. ────────────────────────────────────────────────────────────
  const prov = c.provenance ?? null;
  const provenance: ProvenanceCarte | null =
    prov && (txt(prov.auteur) || txt(prov.date) || txt(prov.version))
      ? { auteur: txt(prov.auteur) || null, date: txt(prov.date) || null, version: txt(prov.version) || null }
      : null;

  // ── Réserves et points approuvés · pour la consultation. ───────────────────
  const reserves = [
    ...pointsTech,
    ...faits.filter((f) => f.etat === 'invalidee').map((f) => `${f.label} · validation caduque`),
    ...faits.filter((f) => f.etat === 'a_verifier').map((f) => `${f.label} · à vérifier`),
  ];
  const pointsApprouves = [
    ...(c.produitFidele === true ? ['Produit fidèle'] : []),
    ...(c.texteLisible === true ? ['Texte lisible'] : []),
    ...faits.filter((f) => f.etat === 'verifiee').map((f) => `${f.label} · vérifié${txt(f.source) ? ` · ${txt(f.source)}` : ''}`),
    ...(humain.approuve ? [`Approuvée par ${humain.par}${humain.le ? ` · ${humain.le}` : ''}`] : []),
  ];

  // ── Synthèse. ──────────────────────────────────────────────────────────────
  // « Vérifiée » = un contrôle, quel qu'il soit, a porté sur elle · relecture
  // technique, fait déclaré, ou approbation. Sans aucun, on ne conclut pas.
  const verifie = techniqueFait || faits.length > 0 || humain.approuve;
  // Un fait caduc est aussi éliminatoire qu'un défaut technique · la validation
  // ne tient plus. Un fait à vérifier est une réserve, pas un défaut.
  const bloquant = techBloquant || invalides > 0;
  const niveau: NiveauQualite = bloquant ? 'bloquant' : reserves.length ? 'suspicion' : 'ok';

  // Prête = la relecture technique a eu lieu et ne relève rien, ET aucun fait
  // n'est ouvert (à vérifier ou caduc). Un fait non vérifié suffit à retenir.
  const pretADiffuser = techniqueFait && niveauTech === 'ok' && aVerifier === 0 && invalides === 0;

  const n = reserves.length;
  const pluriel = n > 1 ? 's' : '';
  // Le VERT « Prête à diffuser » suit EXACTEMENT `pretADiffuser`, jamais le seul
  // fait « rien en réserve ». Sans cette égalité, un fait vérifié seul (ou une
  // approbation humaine) sans relecture technique affichait un vert mensonger,
  // contredit par le studio qui, lui, lit `pretADiffuser` · c'est la régression
  // N04 ressortie. Quand rien n'est en réserve mais que la relecture technique
  // n'a pas eu lieu, on le DIT au lieu de conclure.
  const libelle = !verifie
    ? 'Qualité non vérifiée'
    : bloquant
      ? `À revoir · ${n} point${pluriel}`
      : n
        ? `${n} point${pluriel} à vérifier`
        : pretADiffuser
          ? 'Prête à diffuser'
          : 'Contrôle technique à faire';

  const ton: TonQualite = !verifie ? 'inconnu' : bloquant ? 'bloquant' : n ? 'attention' : pretADiffuser ? 'bon' : 'attention';

  return {
    verifie,
    niveau,
    points: pointsTech,
    libelle,
    ton,
    pretADiffuser,
    // Les suspicions techniques sortent d'une relecture automatique.
    automatique: pointsTech.length > 0,
    technique,
    factuel,
    humain,
    provenance,
    pointsApprouves,
    reserves,
  };
}
