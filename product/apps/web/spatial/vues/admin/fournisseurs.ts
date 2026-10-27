/**
 * L'identité visuelle des fournisseurs d'IA (pastille `.alogo` de la maquette) ·
 * présentation seulement. Un fournisseur inconnu garde une pastille neutre et
 * son nom brut · rien n'est deviné.
 */
export interface IdentiteFournisseur { nom: string; societe: string; lettre: string; fond: string }

const CONNUS: Record<string, IdentiteFournisseur> = {
  anthropic: { nom: 'Claude', societe: 'Anthropic', lettre: 'A', fond: '#d97757' },
  fal: { nom: 'fal', societe: 'Images et vidéos (modèles hébergés)', lettre: 'F', fond: '#111827' },
  openai: { nom: 'GPT', societe: 'OpenAI', lettre: 'O', fond: '#10a37f' },
  google: { nom: 'Gemini', societe: 'Google', lettre: 'G', fond: '#4285f4' },
};

export function identiteFournisseur(cle: string): IdentiteFournisseur {
  return CONNUS[cle] ?? { nom: cle, societe: 'Fournisseur', lettre: (cle[0] ?? '?').toUpperCase(), fond: '#475569' };
}
