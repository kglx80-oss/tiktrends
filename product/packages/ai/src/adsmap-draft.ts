import type Anthropic from '@anthropic-ai/sdk';
import { GEN_MODEL } from './generation';
/**
 * La forme que rend l'outil.
 *
 * Déclarée ICI et non importée de `core` · c'est la sortie du schéma défini
 * juste en dessous, et ce paquet n'a pas à dépendre du domaine pour décrire ce
 * que son propre outil renvoie. `DraftShape` côté core lui est structurellement
 * compatible, ce que le typecheck vérifie au point de jonction.
 */
export interface DraftShape {
  headline: string;
  beats: string[];
  hypothesis: string;
}

/**
 * L'appel qui écrit un concept.
 *
 * Un outil, pas du texte libre · on veut trois champs séparés, pas un paragraphe
 * qu'il faudrait redécouper au petit bonheur. Le découpage fait par le modèle
 * est fiable ; celui qu'on ferait après coup à coups d'expressions régulières ne
 * l'est pas.
 */

const DRAFT_TOOL = {
  name: 'return_concept',
  description: 'Renvoie un concept publicitaire prêt à produire.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description: 'L’accroche, telle qu’elle sera dite ou affichée dans les 3 premières secondes. Une phrase, pas un slogan.',
      },
      beats: {
        type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 5,
        description: 'Le déroulé, dans l’ordre · ce qu’on voit et ce qu’on entend à chaque temps.',
      },
      hypothesis: {
        type: 'string',
        description: 'Ce que ce test parie, en une phrase qui peut être infirmée par un résultat.',
      },
    },
    required: ['headline', 'beats', 'hypothesis'],
  },
} as const;

export interface DraftCall {
  system: string;
  /** Correction demandée après relecture · absente au premier passage. */
  rewriteOf?: { previous: DraftShape; instruction: string };
}

/**
 * Demande un concept.
 *
 * En réécriture, on renvoie le brouillon précédent AVEC la consigne de
 * correction · sans lui, le modèle repart de zéro et perd ce qui allait, ce qui
 * transforme une retouche en nouveau tirage.
 */
export async function draftConcept(client: Anthropic, call: DraftCall): Promise<DraftShape | null> {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: 'Écris le concept.' },
  ];

  if (call.rewriteOf) {
    const p = call.rewriteOf.previous;
    messages.push(
      { role: 'assistant', content: `Accroche : ${p.headline}\nDéroulé : ${p.beats.join(' | ')}\nHypothèse : ${p.hypothesis}` },
      { role: 'user', content: call.rewriteOf.instruction },
    );
  }

  const res = await client.messages.create({
    model: GEN_MODEL,
    max_tokens: 1000,
    system: call.system,
    tools: [DRAFT_TOOL as unknown as Anthropic.Tool],
    tool_choice: { type: 'tool', name: 'return_concept' },
    messages,
  });

  const tool = res.content.find((c) => c.type === 'tool_use') as { input?: DraftShape } | undefined;
  return tool?.input ?? null;
}
