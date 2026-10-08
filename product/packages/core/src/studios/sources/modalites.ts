/**
 * Studios · L4 · modalités réellement disponibles et ce qu'elles permettent
 * d'affirmer (cahier 01 §4.2 points 2 et 3, recette FLOW-02).
 *
 * Pur · ni base, ni réseau, ni modèle.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────
 *
 * On ne décrit que ce qui a été FOURNI. Les modalités d'une source sont celles
 * du cahier : image, vidéo, transcription, texte, lien. Chaque élément
 * observable (accroche, structure, démonstration, rythme, texte, appel à
 * l'action, narration, son) est soit observé (avec sa modalité et sa preuve),
 * soit marqué ABSENT avec sa raison. Sans transcription ni audio, aucune
 * narration (voix off, dialogue, musique) ne peut être affirmée · le dire
 * serait l'inventer.
 *
 * Distinguer observation, mesure et hypothèse : la durée de diffusion est une
 * MESURE publique (`measured`), jamais une preuve de rentabilité ; le format
 * classé par l'équipe est DÉCLARÉ (`declared`).
 */

export type ModaliteSource = 'image' | 'video' | 'transcription' | 'texte' | 'lien';
export const MODALITES_SOURCE: readonly ModaliteSource[] = ['image', 'video', 'transcription', 'texte', 'lien'];

export const LIBELLES_MODALITE: Readonly<Record<ModaliteSource, string>> = {
  image: 'Image',
  video: 'Vidéo',
  transcription: 'Transcription',
  texte: 'Texte',
  lien: 'Lien',
};

export type ElementSource = 'accroche' | 'structure' | 'demonstration' | 'rythme' | 'texte' | 'cta' | 'lien' | 'diffusion' | 'narration' | 'son';

export const LIBELLES_ELEMENT: Readonly<Record<ElementSource, string>> = {
  accroche: 'Accroche',
  structure: 'Structure',
  demonstration: 'Démonstration',
  rythme: 'Rythme',
  texte: 'Texte',
  cta: 'Appel à l’action',
  lien: 'Destination',
  diffusion: 'Diffusion',
  narration: 'Narration',
  son: 'Son et musique',
};

export interface ObservationSource {
  /** Identifiant stable · `<sourceId>.obs.<élément>`. */
  id: string;
  element: ElementSource;
  claim: string;
  kind: 'observed' | 'measured' | 'declared';
  confidence: 'low' | 'medium' | 'high';
  sourceIds: string[];
  /** La modalité qui fonde l'observation · `null` pour une mesure publique. */
  modalite: ModaliteSource | null;
}

export interface ElementAbsent {
  element: ElementSource;
  raison: string;
}

/** Ce dont `observerSource` a besoin · sous-ensemble de `AnnonceObservee`. */
export interface MatiereSource {
  aImage: boolean;
  aVideo: boolean;
  body: string;
  callToAction: string;
  landingDomain: string;
  aLien: boolean;
  daysRunning: number | null;
  transcription: string;
  aAudio: boolean;
}

/** La première phrase d'un texte, bornée · l'accroche ÉCRITE observée. */
export function premierePhrase(texte: string, max = 140): string {
  const t = texte.replace(/\s+/g, ' ').trim();
  if (!t) return '';
  const m = t.match(/^(.+?[.!?…])(\s|$)/);
  const phrase = (m ? m[1]! : t).trim();
  return phrase.length <= max ? phrase : `${phrase.slice(0, max - 1).trim()}…`;
}

export function modalitesDisponibles(m: MatiereSource): ModaliteSource[] {
  const out: ModaliteSource[] = [];
  if (m.aImage) out.push('image');
  if (m.aVideo) out.push('video');
  if (m.transcription.trim()) out.push('transcription');
  if (m.body.trim() || m.callToAction.trim()) out.push('texte');
  if (m.aLien) out.push('lien');
  return out;
}

/** La narration est-elle observable ? Seulement avec une transcription. */
export function narrationObservable(modalites: readonly ModaliteSource[]): boolean {
  return modalites.includes('transcription');
}

export function observerSource(
  sourceId: string,
  m: MatiereSource,
  format: { id: string; libelle: string } | null,
): { modalites: ModaliteSource[]; observations: ObservationSource[]; absents: ElementAbsent[] } {
  const modalites = modalitesDisponibles(m);
  const observations: ObservationSource[] = [];
  const absents: ElementAbsent[] = [];
  const obs = (element: ElementSource, claim: string, kind: ObservationSource['kind'], confidence: ObservationSource['confidence'], modalite: ModaliteSource | null) =>
    observations.push({ id: `${sourceId}.obs.${element}`, element, claim, kind, confidence, sourceIds: [sourceId], modalite });

  const body = m.body.trim();
  if (body) {
    obs('accroche', `Accroche écrite (première phrase) : « ${premierePhrase(body)} »`, 'observed', 'high', 'texte');
    obs('texte', `Texte publicitaire de ${body.length} caractères.`, 'observed', 'high', 'texte');
  } else {
    absents.push({ element: 'accroche', raison: 'Aucun texte fourni · l’accroche écrite n’est pas observable.' });
    absents.push({ element: 'texte', raison: 'Aucun texte publicitaire fourni.' });
  }
  if (m.callToAction.trim()) obs('cta', `Appel à l’action affiché : « ${m.callToAction.trim()} ».`, 'observed', 'high', 'texte');
  else absents.push({ element: 'cta', raison: 'Aucun appel à l’action fourni.' });

  if (m.aVideo) obs('structure', 'Format vidéo.', 'observed', 'high', 'video');
  else if (m.aImage) obs('structure', 'Visuel fixe (image).', 'observed', 'high', 'image');
  else absents.push({ element: 'structure', raison: 'Aucun média fourni · la structure visuelle n’est pas observable.' });
  if (format) {
    observations.push({ id: `${sourceId}.obs.format`, element: 'structure', claim: `Classée « ${format.libelle} » par l’équipe.`, kind: 'declared', confidence: 'medium', sourceIds: [sourceId], modalite: null });
  }

  if (m.aLien) obs('lien', m.landingDomain ? `Renvoie vers une page de destination (${m.landingDomain}).` : 'Renvoie vers une page de destination.', 'observed', 'high', 'lien');

  if (m.daysRunning !== null) {
    obs('diffusion', `Diffusée depuis ${m.daysRunning} jour${m.daysRunning > 1 ? 's' : ''} · une durée de diffusion ne prouve pas la rentabilité.`, 'measured', 'medium', null);
  }

  // Aucune analyse visuelle automatique n'existe ici (le profil `vision_analysis`
  // n'est pas routé) · démonstration et rythme ne sont donc jamais affirmés.
  absents.push({ element: 'demonstration', raison: 'Aucune analyse visuelle disponible · la démonstration n’est pas observable ici.' });
  absents.push({
    element: 'rythme',
    raison: m.aVideo ? 'Vidéo non analysée image par image · le rythme n’est pas observable ici.' : 'Visuel fixe · pas de rythme de montage.',
  });

  if (narrationObservable(modalites)) {
    const mots = m.transcription.trim().split(/\s+/).length;
    obs('narration', `Narration transcrite disponible (${mots} mot${mots > 1 ? 's' : ''}).`, 'observed', 'medium', 'transcription');
  } else {
    absents.push({
      element: 'narration',
      raison: m.aAudio
        ? 'Audio présent mais non transcrit · la narration n’est pas observable.'
        : 'Aucune transcription ni piste audio · la narration n’est pas observable.',
    });
  }
  // Une transcription rend la parole, pas la musique · le son n'est jamais affirmé ici.
  absents.push({
    element: 'son',
    raison: m.aAudio ? 'Audio présent mais non analysé · musique et son ne sont pas observables ici.' : 'Aucune piste audio fournie · musique et son ne sont pas observables.',
  });
  return { modalites, observations, absents };
}

/**
 * Le texte affirme-t-il une narration, une voix ou un son ? Vocabulaire mesuré
 * sur les sorties attendues (voix off, narrateur, dialogue, musique…). « son »
 * seul est exclu (possessif français : « son produit »).
 */
const NARRATION = /(voix|voice[\s-]?over|narrat|\bparl(e|ent|ant|é)\b|racont|\baudio\b|musique|\bmusic\b|bande[\s-]son|chanson|dialogu|\bentend|\bjingle\b|\bsound\b)/i;

export function affirmeNarration(texte: string): boolean {
  return NARRATION.test(texte);
}

export interface AffirmationSourcee {
  chemin: string;
  claim: string;
  kind: string;
  sourceIds: readonly string[];
}

/**
 * FLOW-02 · une OBSERVATION qui affirme une narration n'est permise que si au
 * moins une de ses sources porte une transcription. Les hypothèses et les
 * traitements (« ajouter une voix off ») restent libres : ils ne décrivent pas
 * la source.
 */
export function controlerNarrationObservee(
  affirmations: readonly AffirmationSourcee[],
  sources: ReadonlyArray<{ sourceId: string; modalites: readonly ModaliteSource[] }>,
): Array<{ chemin: string; raison: string }> {
  const parId = new Map(sources.map((s) => [s.sourceId, s.modalites]));
  const out: Array<{ chemin: string; raison: string }> = [];
  for (const a of affirmations) {
    // Une citation entre guillemets rapporte le TEXTE de la source, pas une narration.
    if (a.kind !== 'observed' || !affirmeNarration(a.claim.replace(/«[^»]*»/g, ''))) continue;
    const appui = a.sourceIds.some((id) => narrationObservable(parId.get(id) ?? []));
    if (!appui) out.push({ chemin: a.chemin, raison: 'narration affirmée sans transcription ni audio dans la source' });
  }
  return out;
}
