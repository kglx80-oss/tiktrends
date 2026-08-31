/**
 * Ce que Jarvis a le droit de faire, et ce qu'il doit demander.
 *
 * ── La frontière, énoncée une fois ───────────────────────────────────────────
 *
 * **Jarvis peut tout dire, il ne peut rien engager.**
 *
 * Ce n'est pas la frontière « lecture / écriture », qui aurait été plus simple
 * et fausse : lire ne coûte rien mais rédiger non plus, et un brouillon qu'il
 * faudrait autoriser avant de le voir est un brouillon que personne ne demande.
 * La frontière utile sépare ce qui est **gratuit et réversible** de ce qui
 * **coûte ou structure**.
 *
 * - Sans confirmation : lire la mémoire, raisonner, écrire du texte dans le fil.
 * - Sur clic explicite : tout ce qui crée un nœud sur la carte, dépense des
 *   crédits, ou engage de l'argent.
 *
 * ── Pourquoi il ne fait rien tout seul, même de gratuit ──────────────────────
 *
 * Une action que l'outil déclenche à la place de quelqu'un économise trois
 * secondes et coûte la confiance : la fois où elle se trompe, plus personne ne
 * sait ce que l'outil a fait sans le dire. Le clic n'est pas une friction, c'est
 * la trace de qui a décidé.
 *
 * ── Le vocabulaire est FERMÉ ─────────────────────────────────────────────────
 *
 * Jarvis propose une action en écrivant un marqueur. Une clé inconnue, mal
 * formée ou hors liste est **ignorée en silence** · un modèle qui invente une
 * action ne doit jamais pouvoir en fabriquer une nouvelle, et l'échec par
 * défaut est « rien ne s'affiche », pas « on tente quelque chose ».
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

/** Les seules actions proposables · toute autre chaîne est du texte. */
export type JarvisActionKey = 'draft' | 'suites' | 'lots' | 'radar' | 'studio' | 'carte';

export interface JarvisActionDef {
  key: JarvisActionKey;
  label: string;
  /** Ce que le clic fait vraiment · dit avant, pas après. */
  effect: string;
  /** `null` quand le clic ne fait que déplacer. */
  cost: string | null;
  /** Où cela mène · vide quand l'action se joue dans le fil. */
  href: string | null;
}

export const JARVIS_ACTIONS: Record<JarvisActionKey, JarvisActionDef> = {
  draft: {
    key: 'draft', label: 'Écrire ce concept',
    effect: 'Jarvis rédige l’accroche, le déroulé et l’hypothèse, puis se relit avec ta mémoire.',
    cost: 'un appel au modèle', href: null,
  },
  suites: {
    key: 'suites', label: 'Voir les suites',
    effect: 'Ce qu’il faut faire de chaque test arbitré, et ce qu’il ne faut pas retoucher.',
    cost: null, href: '/adsmap/suites',
  },
  lots: {
    key: 'lots', label: 'Ouvrir les lots',
    effect: 'Préparer un lot de test, avec le brief de pré-lancement sur chaque créa.',
    cost: null, href: '/adsmap/lots',
  },
  radar: {
    key: 'radar', label: 'Ouvrir le radar',
    effect: 'Les créas que tes concurrents continuent de payer.',
    cost: null, href: '/adsmap/radar',
  },
  studio: {
    key: 'studio', label: 'Ouvrir le studio',
    effect: 'Fabriquer la créa · pub complète, visuel ou vidéo.',
    cost: null, href: '/studio',
  },
  carte: {
    key: 'carte', label: 'Ouvrir la carte',
    effect: 'Tous les tests de la marque et leurs verdicts.',
    cost: null, href: '/adsmap',
  },
};

const CLES = new Set(Object.keys(JARVIS_ACTIONS));

/** Deux suffisent · au-delà, on a remplacé une réponse par un menu. */
export const MAX_ACTIONS = 2;

/** Une intention plus longue n'est plus une intention, c'est un brief. */
export const MAX_INTENT = 300;

export interface JarvisAction {
  key: JarvisActionKey;
  /** Sujet transmis à l'action · seul `draft` s'en sert. */
  intent: string | null;
}

export interface ParsedAnswer {
  /** Le texte, marqueurs retirés · c'est lui qu'on affiche. */
  text: string;
  actions: JarvisAction[];
}

// `[[ACTION:cle]]` ou `[[ACTION:cle|intention]]`.
//
// La clé accepte plus large que la liste, volontairement : un marqueur BIEN
// FORMÉ dont la clé est inconnue doit être avalé, pas imprimé. Un modèle qui
// invente « supprimer_tout » ne doit rien déclencher · il ne doit pas non plus
// laisser le mot « supprimer_tout » s'afficher comme si l'outil y songeait.
const MARQUEUR = /\[\[ACTION:([a-z_]+)(?:\|([^\]]*))?\]\]/g;

/**
 * Sépare la réponse de ce qu'elle propose.
 *
 * On retire les marqueurs du texte affiché : ils sont une convention entre le
 * modèle et l'écran, pas quelque chose qu'on lit. Une clé hors liste est
 * retirée elle aussi · l'échec par défaut est « rien ne s'affiche ».
 */
export function parseAnswer(raw: string): ParsedAnswer {
  const actions: JarvisAction[] = [];
  const vues = new Set<string>();

  const texte = raw.replace(MARQUEUR, (_tout, cle: string, intent?: string) => {
    if (CLES.has(cle) && !vues.has(cle) && actions.length < MAX_ACTIONS) {
      vues.add(cle);
      const sujet = (intent ?? '').trim().slice(0, MAX_INTENT);
      actions.push({ key: cle as JarvisActionKey, intent: sujet || null });
    }
    return '';
  });

  return { text: texte.replace(/\n{3,}/g, '\n\n').trim(), actions };
}

/**
 * Ce qu'on montre pendant que la réponse arrive.
 *
 * Un marqueur en cours d'écriture ressemble à `[[ACTI` · l'afficher une demi-
 * seconde suffit à donner l'impression que l'outil fuit. On coupe à la première
 * ouverture, quitte à retenir une phrase de plus que nécessaire.
 */
export function visibleWhileStreaming(raw: string): string {
  const i = raw.indexOf('[[');
  return i === -1 ? raw : raw.slice(0, i);
}

/**
 * Le bloc de consigne qui autorise les actions.
 *
 * Il dit trois choses, et la troisième est celle qui compte : **il n'a rien
 * fait**. Un modèle qui écrit « c'est fait » alors qu'un bouton attend encore
 * un clic détruit la confiance plus sûrement qu'une erreur de calcul.
 */
export function actionsPromptBlock(): string {
  const liste = Object.values(JARVIS_ACTIONS)
    .map((a) => `- ${a.key} · ${a.effect}`)
    .join('\n');

  return `CE QUE TU PEUX PROPOSER
Quand ta réponse débouche sur un geste concret, termine par un marqueur sur sa propre ligne :
[[ACTION:cle]] ou, pour « draft » uniquement, [[ACTION:draft|l’intention en une phrase]]

Les seules clés existantes :
${liste}

RÈGLES DU MARQUEUR
- Deux au maximum, et seulement si le geste découle vraiment de ce que tu viens de dire.
  Une réponse qui explique un chiffre n’a aucun geste à proposer · n’en invente pas.
- N’écris JAMAIS le marqueur dans une phrase. Il vit seul, à la fin.
- Tu ne DÉCLENCHES rien. Le marqueur affiche un bouton, et c’est la personne qui clique.
  N’écris jamais « je l’ai fait », « c’est lancé », « je viens de créer » · ce serait faux,
  et une fausse confirmation coûte plus cher qu’une action manquante.`;
}
