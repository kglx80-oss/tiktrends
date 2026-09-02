/**
 * Quel essai poser maintenant.
 *
 * ── Le pas qui manquait ──────────────────────────────────────────────────────
 *
 * L'outil sait tenir une hypothèse et la relire. Mais c'est encore l'humain qui
 * choisit quelle dimension tester, et il la choisit sans rien pour l'aider ·
 * l'outil range les hypothèses, il n'en propose aucune.
 *
 * Or il a de quoi. Il sait quels essais ont déjà tranché, lesquels tournent en
 * rond, ce que ses notes reprochent aux créas, et où le tunnel casse.
 *
 * ── L'ordre des questions ────────────────────────────────────────────────────
 *
 * Ce n'est pas « quelle dimension n'a pas encore été testée ». C'est **quelle
 * question, si elle recevait une réponse, changerait le plus ce qu'on fait
 * demain**. Trois règles, dans cet ordre :
 *
 * 1. **Un raté de fabrication majoritaire** passe avant tout · tant qu'une image
 *    sur deux porte du texte inventé, comparer des accroches mesure du bruit.
 * 2. **Une dimension déjà tranchée** ne se re-teste pas · la question a une
 *    réponse, et la reposer coûte un lot pour la réentendre.
 * 3. **À questions ouvertes égales**, on prend la moins chère. Une mise en page
 *    ou une accroche ne coûtent qu'une image, une ambiance en coûte quatre · à
 *    information comparable, commencer par ce qui se paie une fois.
 *
 * ── Ce qu'on ne fait pas ─────────────────────────────────────────────────────
 *
 * On ne propose jamais « teste au hasard ». Quand aucune règle ne parle, on le
 * dit · une suggestion inventée pour remplir un encadré fait dépenser un lot
 * pour occuper l'écran.
 *
 * Pur : ni base, ni horloge, ni modèle.
 */

import type { CumulEssais, VariableEssai } from './essai-resultat';
import { estCumulable } from './essai-resultat';

export interface EtatPourEssai {
  /** Les cumuls déjà calculés · c'est là que se lit ce qui a tranché. */
  cumuls: readonly CumulEssais[];
  /** Essais TRANCHÉS par variable, y compris ceux qui ne se cumulent pas. */
  trancheParVariable: Partial<Record<VariableEssai, number>>;
  /** Part d'images portant un raté de fabrication · `null` si rien n'a été vu. */
  tauxDefauts: number | null;
  /** D'où viennent les ratés, quand une origine se détache. */
  suspect: { quoi: string; taux: number } | null;
}

export interface Suggestion {
  /** La dimension à tester · `null` quand rien ne justifie un essai. */
  variable: VariableEssai | null;
  /** Ce qu'on cherche à savoir, en une phrase. */
  question: string;
  /** Pourquoi celle-là, et pas une autre. */
  pourquoi: string;
  /** Ce qu'il faut faire d'abord, quand un essai serait prématuré. */
  avantTout: string | null;
}

/** Au-delà, les ratés de fabrication dominent tout le reste. */
export const SEUIL_DEFAUTS = 0.5;

const QUESTION: Record<VariableEssai, string> = {
  accroche: 'Laquelle de tes accroches arrête vraiment le pouce ?',
  mise_en_page: 'Quelle composition tient le mieux chez toi ?',
  univers: 'Quelle ambiance visuelle ressemble le plus à ta marque ?',
};

/** Ce que coûte un essai, en images · sert à départager deux questions ouvertes. */
const IMAGES: Record<VariableEssai, number> = { accroche: 1, mise_en_page: 1, univers: 4 };

/**
 * L'ordre de préférence à questions ouvertes égales.
 *
 * La mise en page d'abord : c'est la seule dont les bras se répètent ET qui ne
 * coûte qu'une image, donc celle qui construit une mesure cumulée le plus vite.
 * L'accroche ensuite · elle ne se cumule pas, mais elle reste la variable qui
 * décide de la plupart des créas. L'ambiance en dernier, parce qu'elle coûte
 * quatre images.
 */
const ORDRE: VariableEssai[] = ['mise_en_page', 'accroche', 'univers'];

export function essaiSuivant(etat: EtatPourEssai): Suggestion {
  // 1 · Les ratés de fabrication passent avant tout.
  //
  // Tant qu'une image sur deux porte du texte inventé ou un produit déformé,
  // comparer des accroches mesure du bruit : le verdict dépend de si la scène
  // était ratée, pas de ce qu'on croyait tester.
  if (etat.tauxDefauts !== null && etat.tauxDefauts > SEUIL_DEFAUTS) {
    const d = etat.suspect;
    return {
      variable: null,
      question: 'Rien à tester tant que les images sortent abîmées.',
      pourquoi: `${Math.round(etat.tauxDefauts * 100)} % de tes images notées portent un raté de fabrication · un essai comparerait des scènes ratées entre elles.`,
      avantTout: d
        ? `${d.quoi} en produit ${Math.round(d.taux * 100)} % · change-le, ou ajoute une photo produit en référence, avant de lancer un essai.`
        : 'Ajoute une photo produit en référence, ou change de moteur d’image, avant de lancer un essai.',
    };
  }

  // 2 · Une dimension tranchée ne se re-teste pas.
  const tranchee = new Set<VariableEssai>();
  for (const c of etat.cumuls) if (c.conclusif) tranchee.add(c.variable);

  const ouvertes = ORDRE.filter((v) => !tranchee.has(v));
  if (!ouvertes.length) {
    return {
      variable: null,
      question: 'Tes trois dimensions ont répondu.',
      pourquoi: 'Chacune a désigné un gagnant au-dessus du hasard · relancer un essai identique paierait pour réentendre une réponse.',
      avantTout: 'Applique ce qui a gagné, puis reviens quand ta marque ou ton offre aura changé.',
    };
  }

  // 3 · À questions ouvertes égales, la moins chère.
  //
  // `ORDRE` porte déjà ce classement · on le relit ici pour que le choix soit
  // lisible plutôt que caché dans l'ordre d'un tableau.
  const choisie = [...ouvertes].sort((a, b) => IMAGES[a] - IMAGES[b] || ORDRE.indexOf(a) - ORDRE.indexOf(b))[0]!;
  const dejaTranches = etat.trancheParVariable[choisie] ?? 0;

  return {
    variable: choisie,
    question: QUESTION[choisie],
    pourquoi: pourquoiCelle(choisie, dejaTranches, tranchee),
    avantTout: null,
  };
}

function pourquoiCelle(v: VariableEssai, dejaTranches: number, tranchee: Set<VariableEssai>): string {
  const bouts: string[] = [];
  if (tranchee.size) {
    bouts.push(`${[...tranchee].map((t) => QUESTION_COURTE[t]).join(' et ')} a déjà répondu`);
  }
  if (dejaTranches === 0) {
    bouts.push('cette dimension n’a encore jamais tranché chez toi');
  } else if (estCumulable(v)) {
    bouts.push(`${dejaTranches} essai(s) tranché(s) sur cette dimension · il en faut plus pour que l’écart cesse d’être du hasard`);
  } else {
    bouts.push(`${dejaTranches} essai(s) tranché(s) · chaque essai d’accroches compare de nouvelles accroches, il n’y a pas de cumul à attendre`);
  }
  if (IMAGES[v] === 1) bouts.push('et il ne coûte qu’une image');
  return `${bouts.join(', ')}.`;
}

const QUESTION_COURTE: Record<VariableEssai, string> = {
  accroche: 'l’accroche',
  mise_en_page: 'la mise en page',
  univers: 'l’ambiance',
};
