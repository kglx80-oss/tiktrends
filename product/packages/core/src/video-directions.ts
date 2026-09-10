/**
 * Les directions de MOUVEMENT · ce que le catalogue d'images ne porte pas.
 *
 * Une image se règle par la scène, la lumière, la finition. Une vidéo ajoute le
 * geste · comment la caméra bouge, à quel rythme, avec quelle énergie. Sans le
 * dire, le moteur invente un mouvement générique à chaque fois (le défaut « on
 * obtient toujours la même chose », version animée). On nomme donc les trois
 * fragments qui font un mouvement · caméra, rythme, énergie.
 *
 * Pur : ni base, ni réseau, ni modèle.
 */

export interface VideoDirection {
  key: string;
  label: string;
  /** Ce que ça donne, en une ligne · pour choisir sans générer. */
  hint: string;
  /** Le geste de caméra. */
  camera: string;
  /** Le rythme · coupe, tenue, vitesse. */
  rythme: string;
  /** L'énergie d'ensemble. */
  energie: string;
}

export const VIDEO_DIRECTIONS: VideoDirection[] = [
  {
    key: 'produit_tenu', label: 'Produit tenu, plan serré',
    hint: 'Zoom lent sur le produit, calme et premium.',
    camera: 'Slow push-in on the product held in frame, shallow depth of field, the product always sharp.',
    rythme: 'One continuous unbroken shot, no cuts, deliberate and slow.',
    energie: 'Calm, premium, reassuring · nothing rushed.',
  },
  {
    key: 'demo_geste', label: 'Démo · le geste',
    hint: 'La main utilise le produit, la caméra suit le geste.',
    camera: 'Handheld camera following the hand as it uses the product, staying close to the action.',
    rythme: 'A couple of natural cuts between angles of the same gesture, moderate pace.',
    energie: 'Practical, hands-on, credible · a real person doing a real thing.',
  },
  {
    key: 'ugc_selfie', label: 'UGC selfie',
    hint: 'Bras tendu, caméra à la main, ton spontané.',
    camera: 'Front-facing selfie framing, arm-length, small natural shakes, the subject talking to camera.',
    rythme: 'Fast jump-cuts as in a phone recording, energetic.',
    energie: 'Spontaneous, authentic, unpolished · like a friend’s recommendation.',
  },
  {
    key: 'reveal', label: 'Révélation',
    hint: 'On découvre le produit d’un mouvement, effet whaou.',
    camera: 'The product is revealed by a movement · a hand uncovers it, or the camera arcs around to unveil it.',
    rythme: 'Build then a beat of stillness on the reveal, a single satisfying moment.',
    energie: 'Anticipation resolving into a clean payoff.',
  },
  {
    key: 'ambiance', label: 'Ambiance lente',
    hint: 'Plan large, la scène respire, la vapeur/lumière bouge.',
    camera: 'Wide static-ish frame, only subtle motion · steam rising, light shifting, fabric moving in a breeze.',
    rythme: 'One long held shot, almost still, cinematic patience.',
    energie: 'Atmospheric, sensory, aspirational.',
  },
  {
    key: 'dynamique', label: 'Dynamique sport',
    hint: 'Mouvement rapide, énergie, coupes serrées.',
    camera: 'Fast tracking and whip-pans following motion, the product caught mid-action.',
    rythme: 'Quick tight cuts on the beat, high tempo.',
    energie: 'High-energy, punchy, motivating.',
  },
  {
    key: 'avant_apres', label: 'Avant / après',
    hint: 'Une transition nette sépare deux états.',
    camera: 'The same framing before and after, a clean match-cut or wipe between the two states.',
    rythme: 'Hold on the before, sharp transition, hold on the after.',
    energie: 'Demonstrative, convincing · the change reads instantly.',
  },
  {
    key: 'unboxing', label: 'Déballage',
    hint: 'On ouvre, on sort le produit, tactile.',
    camera: 'Top-down or close over-the-shoulder on hands opening the packaging and lifting the product out.',
    rythme: 'Steady, tactile beats · open, lift, present.',
    energie: 'Tactile, satisfying, first-contact excitement.',
  },
];

const PAR_CLE = new Map(VIDEO_DIRECTIONS.map((d) => [d.key, d]));

export function videoDirectionByKey(key?: string | null): VideoDirection | null {
  return key ? PAR_CLE.get(key) ?? null : null;
}

/** La direction de mouvement, écrite pour le modèle · fragments nommés. */
export function directionMouvementPrompt(d: VideoDirection): string {
  return [`Camera: ${d.camera}`, `Pacing: ${d.rythme}`, `Energy: ${d.energie}`].join('\n');
}

/**
 * Le prompt final d'une vidéo · le mouvement décrit, augmenté de la direction.
 * La direction se compose dans le prompt envoyé, jamais dans la légende affichée.
 */
export function promptVideo(base: string, directionKey: string | null | undefined): string {
  const b = (base || '').trim();
  const d = videoDirectionByKey(directionKey);
  if (!d) return b;
  const bloc = directionMouvementPrompt(d);
  return b ? `${b}\n\n${bloc}` : bloc;
}
