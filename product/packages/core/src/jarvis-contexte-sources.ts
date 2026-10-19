/**
 * UX V5 · les puces de contexte du composeur Jarvis · de VRAIS interrupteurs.
 *
 * ── Le défaut que ce module ferme ────────────────────────────────────────────
 *
 * La maquette V5 pose, dans le composeur, quatre puces (Meta · TikTok · Veille ·
 * Fiche marque) qui ont l'air de régler les sources de Jarvis. Les recopier en
 * décor, c'est promettre un réglage qui ne règle rien · et pour Meta / TikTok,
 * laisser croire qu'un connecteur publicitaire existe (il n'en existe aucun).
 *
 * La règle honnête tient à distinguer ce que Jarvis ASSEMBLE réellement :
 *
 *  · `Fiche marque` est une source RÉELLE · l'identité de la marque (description,
 *    promesse, audience) et sa mémoire mesurée entrent dans la consigne. La
 *    puce l'INCLUT ou l'EXCLUT pour de vrai · décocher retire ce bloc du
 *    contexte serveur, et la réponse s'en ressent. C'est un vrai interrupteur.
 *  · `Veille`, `Meta`, `TikTok` ne correspondent à AUCUNE source assemblée
 *    aujourd'hui (pas de connecteur publicitaire, pas de bloc Veille dédié dans
 *    la consigne). On les montre · la maquette fait autorité sur la présentation
 *    · mais inertes et dites « à venir », jamais un faux interrupteur.
 *
 * Le choix client PILOTE donc un contexte réel (via le serveur), il ne le
 * simule pas · et `contexteSelonPuces` est la seule chose qui décide ce que les
 * puces incluent. Une puce non réelle n'ajoute jamais rien au contexte, quoi que
 * le client envoie.
 *
 * Pur · ni base, ni réseau, ni modèle.
 */

export type PuceContexteJarvis = 'meta' | 'tiktok' | 'veille' | 'fiche';

export interface MetaPuceContexte {
  cle: PuceContexteJarvis;
  libelle: string;
  /** Nom d'icône du jeu partagé `components/Icon`. */
  icone: string;
  /**
   * La puce branche-t-elle une source RÉELLEMENT assemblée ? `false` · elle est
   * montrée mais inerte (« à venir »), jamais un faux interrupteur.
   */
  reel: boolean;
  /** Dit pourquoi la puce est inerte · rendu en infobulle. `null` si réelle. */
  aVenir: string | null;
}

export const AUCUN_CONNECTEUR_PUB = 'À venir · aucun connecteur publicitaire n’est branché.';
export const VEILLE_PAS_ASSEMBLEE = 'À venir · la Veille n’entre pas encore dans le contexte de Jarvis.';

/** Les quatre puces de la maquette · une seule est un interrupteur réel aujourd'hui. */
export const PUCES_CONTEXTE_JARVIS: readonly MetaPuceContexte[] = [
  { cle: 'meta', libelle: 'Meta', icone: 'target', reel: false, aVenir: AUCUN_CONNECTEUR_PUB },
  { cle: 'tiktok', libelle: 'TikTok', icone: 'music', reel: false, aVenir: AUCUN_CONNECTEUR_PUB },
  { cle: 'veille', libelle: 'Veille', icone: 'radar', reel: false, aVenir: VEILLE_PAS_ASSEMBLEE },
  { cle: 'fiche', libelle: 'Fiche marque', icone: 'tag', reel: true, aVenir: null },
];

/** Les clés des puces RÉELLES · le défaut les active toutes (le contexte complet). */
export const PUCES_REELLES: readonly PuceContexteJarvis[] = PUCES_CONTEXTE_JARVIS.filter((p) => p.reel).map((p) => p.cle);

/** Ce que le contexte serveur inclut, décidé par la sélection de puces RÉELLES. */
export interface ContexteAssemble {
  /** Faut-il inclure l'identité de marque et la mémoire mesurée dans la consigne ? */
  ficheMarque: boolean;
}

/**
 * Traduit une sélection de puces (côté client) en inclusions RÉELLES de contexte.
 *
 * Seules les puces réelles comptent · une puce inerte (Meta / TikTok / Veille)
 * n'ajoute jamais rien, même si le client l'envoie cochée. Absence de sélection
 * (`null`/`undefined`) · toutes les sources réelles sont incluses (le contexte
 * complet, comme avant les puces).
 */
export function contexteSelonPuces(selection?: Iterable<string> | null): ContexteAssemble {
  if (selection == null) return { ficheMarque: true };
  const choisies = new Set<string>(selection);
  return { ficheMarque: choisies.has('fiche') };
}
