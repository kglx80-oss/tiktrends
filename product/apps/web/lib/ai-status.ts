import 'server-only';

/** L'IA (Anthropic) est-elle configurée côté serveur ? Sert à activer les boutons IA. */
export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
