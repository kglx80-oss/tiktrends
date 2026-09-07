/**
 * La publicité entière a-t-elle écrit NOS mots ?
 *
 * ── Le risque, et pourquoi il n'était pas mesuré ─────────────────────────────
 *
 * En mode « générée entièrement », c'est le modèle d'images qui écrit la
 * typographie. On lui donne les chaînes exactes — l'accroche porte l'angle,
 * l'offre et ce que Jarvis a appris de la marque — et il en écrit parfois
 * d'autres : une accroche inventée, une traduction en anglais, un accent perdu,
 * une lettre en trop.
 *
 * On demandait déjà au modèle qui note la créa de « vérifier que les mots sont
 * écrits juste ». C'était lui demander un AVIS. Un avis ne se compte pas, ne se
 * compare pas d'un mois à l'autre, et ne dit pas quel moteur se trompe le plus.
 *
 * ── Le partage qu'on installe ────────────────────────────────────────────────
 *
 * Au modèle la PERCEPTION · « quelles lettres sont dans cette image ». C'est ce
 * qu'un modèle de vision fait bien, et il n'a besoin d'aucun jugement pour le
 * faire.
 *
 * À ce fichier le JUGEMENT · comparer ce qui a été lu à ce qu'on avait imposé.
 * C'est du code, donc c'est déterministe, testable, et identique d'une créa à
 * l'autre.
 *
 * Demander « est-ce bien écrit ? » rend une opinion. Demander « qu'est-ce qui
 * est écrit ? » rend une preuve.
 *
 * ── Ce qu'on ne vérifie pas ──────────────────────────────────────────────────
 *
 * Qu'il n'y ait RIEN d'autre. L'étiquette du produit porte légitimement du
 * texte, et c'est même ce qu'on exige d'elle. Une ligne lue qui ne correspond à
 * aucune consigne n'est donc pas un raté · seule l'absence d'une consigne en
 * est un.
 *
 * Pur : ni image, ni réseau, ni modèle.
 */

/** Ce qu'une chaîne imposée est devenue dans l'image. */
export const ETATS_COPIE = ['exacte', 'accents', 'deformee', 'absente'] as const;
export type EtatCopie = typeof ETATS_COPIE[number];

export const ETAT_COPIE_LABEL: Record<EtatCopie, string> = {
  exacte: 'Reproduite à l’identique',
  accents: 'Accents perdus',
  deformee: 'Réécrite',
  absente: 'Absente de l’image',
};

export interface ChaineImposee {
  /** À quoi elle sert · « accroche », « bouton »… Sert à parler du défaut. */
  role: string;
  texte: string;
}

export interface LigneVerifiee {
  role: string;
  attendu: string;
  /** La ligne lue qui s'en rapproche le plus · null quand rien ne s'en approche. */
  lu: string | null;
  etat: EtatCopie;
}

export interface VerdictCopie {
  lignes: LigneVerifiee[];
  /** Part des chaînes reproduites à l'identique · null quand il n'y a rien à vérifier. */
  fidelite: number | null;
  /** L'accroche a été réécrite ou n'y est pas · la publicité ne dit plus ce qu'on voulait. */
  grave: boolean;
  /** Ce qu'on affiche · vide quand tout est exact, parce qu'alors il n'y a rien à dire. */
  resume: string;
}

/* -------------------------------------------------------------------------- */
/*  Comparaison                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Ce qu'on ignore volontairement en comparant.
 *
 * La casse · un modèle rend une accroche en capitales, c'est une décision de
 * mise en page, pas une faute de copie.
 *
 * Les espaces multiples et les apostrophes typographiques · `'` et `’` sont le
 * même caractère à l'œil, et la transcription en choisit une au hasard.
 *
 * Les accents, eux, ne sont PAS ignorés ici · c'est la faute la plus fréquente
 * et la plus visible en français, et l'effacer de la comparaison reviendrait à
 * décider qu'elle n'existe pas.
 */
function normalise(s: string): string {
  return (s || '')
    .replace(/[’‘‛]/g, '\'')
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** La même chose, accents retirés · sert uniquement à NOMMER la perte d'accents. */
function sansAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Distance d'édition · deux lignes, combien de corrections les séparent. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prec = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) {
      cour[j] = Math.min(
        prec[j]! + 1,
        cour[j - 1]! + 1,
        prec[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prec = cour;
  }
  return prec[b.length]!;
}

/** 1 = identique, 0 = rien en commun. */
export function ressemblance(a: string, b: string): number {
  const x = normalise(a); const y = normalise(b);
  const max = Math.max(x.length, y.length);
  if (!max) return 1;
  return 1 - distance(x, y) / max;
}

/**
 * En dessous de quoi une ligne lue ne parle plus de la même chose.
 *
 * ── Comment le seuil a été choisi ────────────────────────────────────────────
 *
 * Mesuré, pas décidé · et les valeurs que j'avais d'abord écrites de tête
 * étaient fausses de moitié. Sur « Réveillez l'éclat de votre peau » :
 *
 *   une lettre en moins ......... 0,968  ┐
 *   accents perdus .............. 0,935  │ c'est encore notre accroche
 *   un mot remplacé ............. 0,818  │
 *   deux mots changés ........... 0,742  │
 *   moitié de phrase ............ 0,548  ┘
 *                                 ─────  ← le fossé
 *   accroche inventée ........... 0,194  ┐ c'est une autre phrase
 *   traduite en anglais ......... 0,097  ┘
 *
 * On se pose à **0,40**, entre 0,548 et 0,194. Une accroche tronquée reste
 * donc « réécrite » — on sait de quelle consigne elle vient, et c'est une
 * information — tandis qu'une phrase inventée devient « absente ».
 *
 * Le seuil que j'avais posé d'instinct (0,60) classait la troncature en
 * « absente », c'est-à-dire perdait le lien avec la consigne qu'elle trahit.
 *
 * ── Ce qui reste imparfait ───────────────────────────────────────────────────
 *
 * Deux phrases françaises sans rapport peuvent monter vers 0,35 sur des mots
 * outils communs. La marge sous 0,40 est donc plus mince que celle au-dessus.
 * Le cas se voit à l'écran — l'état montre la ligne LUE à côté de l'attendue —
 * plutôt que de se deviner.
 */
export const SEUIL_DEFORMEE = 0.4;

/**
 * Compare ce qu'on a imposé à ce qui a été lu dans l'image.
 *
 * Chaque ligne lue n'est consommée qu'une fois · sans ça, une seule ligne
 * pourrait satisfaire deux consignes à la fois et une publicité amputée
 * passerait pour complète.
 */
export function verifieCopie(
  imposees: readonly ChaineImposee[],
  lues: readonly string[],
): VerdictCopie {
  const attendus = imposees.filter((c) => (c.texte ?? '').trim().length > 0);
  const disponibles = (lues ?? []).filter((l) => typeof l === 'string' && l.trim().length > 0);
  const prises = new Set<number>();

  const lignes: LigneVerifiee[] = attendus.map((c) => {
    let meilleur = -1; let note = -1;
    for (let i = 0; i < disponibles.length; i++) {
      if (prises.has(i)) continue;
      const r = ressemblance(c.texte, disponibles[i]!);
      if (r > note) { note = r; meilleur = i; }
    }
    if (meilleur < 0 || note < SEUIL_DEFORMEE) {
      return { role: c.role, attendu: c.texte, lu: null, etat: 'absente' };
    }
    prises.add(meilleur);
    const lu = disponibles[meilleur]!;
    const a = normalise(c.texte); const b = normalise(lu);
    const etat: EtatCopie = a === b ? 'exacte'
      : sansAccents(a) === sansAccents(b) ? 'accents'
        : 'deformee';
    return { role: c.role, attendu: c.texte, lu, etat };
  });

  const exactes = lignes.filter((l) => l.etat === 'exacte').length;
  const fidelite = lignes.length ? exactes / lignes.length : null;

  // L'accroche est le seul texte éliminatoire · c'est elle qui porte l'angle.
  // Un bouton réécrit se corrige, une accroche inventée fait de la publicité
  // une autre publicité.
  const accroche = lignes.find((l) => l.role === 'accroche');
  const grave = !!accroche && (accroche.etat === 'absente' || accroche.etat === 'deformee');

  return { lignes, fidelite, grave, resume: resumeDe(lignes) };
}

/**
 * Ce qu'on dit, et quand on se tait.
 *
 * Une publicité dont toute la copie est exacte n'a pas besoin d'un encadré vert
 * pour le dire · elle a besoin qu'on la laisse tranquille. Le silence est une
 * réponse.
 */
function resumeDe(lignes: readonly LigneVerifiee[]): string {
  const fautives = lignes.filter((l) => l.etat !== 'exacte');
  if (!fautives.length) return '';
  const par = (e: EtatCopie) => fautives.filter((l) => l.etat === e).map((l) => l.role);
  const morceaux = [
    par('absente').length ? `${par('absente').join(', ')} : absente(s) de l’image` : '',
    par('deformee').length ? `${par('deformee').join(', ')} : réécrite(s) par le modèle` : '',
    par('accents').length ? `${par('accents').join(', ')} : accents perdus` : '',
  ].filter(Boolean);
  return morceaux.join(' · ');
}

/**
 * Les chaînes qu'on impose, dans l'ordre où elles comptent.
 *
 * Le rôle sert à nommer le défaut à l'écran · « le bouton a été réécrit » se
 * comprend, « la chaîne 4 ne correspond pas » non.
 */
export function chainesImposees(c: {
  kicker?: string | null; headline?: string | null; subhead?: string | null;
  benefits?: readonly string[] | null; cta?: string | null; badge?: string | null;
}): ChaineImposee[] {
  return [
    { role: 'surtitre', texte: c.kicker ?? '' },
    { role: 'accroche', texte: c.headline ?? '' },
    { role: 'sous-titre', texte: c.subhead ?? '' },
    ...(c.benefits ?? []).slice(0, 3).map((b, i) => ({ role: `bénéfice ${i + 1}`, texte: b })),
    { role: 'bouton', texte: c.cta ?? '' },
    { role: 'pastille', texte: c.badge ?? '' },
  ].filter((c2) => c2.texte.trim().length > 0);
}
