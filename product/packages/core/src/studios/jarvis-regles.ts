import { sha256Texte } from '../prompts/empreinte';

/**
 * Règles créatives de marque (Jarvis) · identité du gabarit et instantané de
 * contexte, PURS.
 *
 * Le geste « Proposer » de Jarvis (`proposeJarvisRulesAction`) rédige le
 * règlement créatif maison d'une marque par UN appel au modèle. Contrairement
 * aux autres studios, son texte de prompt vit dans le code (`@tiktrends/ai`,
 * `proposeJarvisRules`), pas dans une release du registre : jusqu'ici l'appel
 * ne laissait donc AUCUNE trace `studio_prompt_runs` (la release réellement en
 * vigueur n'était pas consignée · matrice 9.4).
 *
 * Ce module donne au gabarit une IDENTITÉ versionnée (`jarvis.regles_marque@x`,
 * empreinte du texte système réellement envoyé) et calcule l'INSTANTANÉ
 * déterministe du contexte, de sorte que la consignation serveur
 * (`consignerRunReglesMarque`) puisse tracer la run comme le reste des studios :
 * release en vigueur épinglée à l'appel, empreinte du contexte, modèle, statut,
 * coût. Rien de payant, rien en base, rien en clair ici · uniquement des
 * empreintes (doctrine des traces : « empreintes seulement, jamais le texte »).
 */

/** Clé stable du gabarit code · même espace de noms que les templates du registre. */
export const CLE_REGLES_MARQUE = 'jarvis.regles_marque';
/** Version du gabarit code · monte si le texte système change de façon visible. */
export const VERSION_REGLES_MARQUE = '1.0.0';

/**
 * Empreinte du gabarit code réellement consommé · `clé@version` + texte système
 * envoyé. L'ADMIN qui lit une trace retrouve ainsi EXACTEMENT quel prompt a
 * produit le règlement, même si ce prompt ne vient pas d'une release.
 */
export function empreinteGabaritReglesMarque(systemeTexte: string): string {
  return sha256Texte(`${CLE_REGLES_MARQUE}@${VERSION_REGLES_MARQUE}\n${systemeTexte}`);
}

/** Le contexte de marque passé au modèle, tel que l'action le réunit. */
export interface ContexteReglesMarque {
  brand: string;
  category?: string;
  audience?: string;
  usp?: string;
  tone?: string;
  preferredWords?: string;
  avoidWords?: string;
  competitors?: string[];
  winningCopy?: string[];
}

const emp = (v: string | undefined | null): string | null => {
  const t = (v ?? '').trim();
  return t ? sha256Texte(t) : null;
};

/**
 * Instantané déterministe du contexte · base de `contextSnapshotHash`. Chaque
 * champ textuel entre par son EMPREINTE (jamais en clair), les listes par leur
 * effectif : deux appels au même contexte donnent la même empreinte, un
 * contexte différent une empreinte différente, sans jamais stocker la marque,
 * l'USP ni les copies gagnantes en clair.
 */
export function instantaneReglesMarque(ctx: ContexteReglesMarque): Record<string, unknown> {
  return {
    marque: emp(ctx.brand),
    categorie: emp(ctx.category),
    audience: emp(ctx.audience),
    usp: emp(ctx.usp),
    ton: emp(ctx.tone),
    motsPreferes: emp(ctx.preferredWords),
    motsEvites: emp(ctx.avoidWords),
    concurrents: (ctx.competitors ?? []).filter((c) => c && c.trim()).length,
    copiesGagnantes: (ctx.winningCopy ?? []).filter((c) => c && c.trim()).length,
  };
}

/**
 * Empreinte d'identité de la marque pour la trace de source (`SourceTrace` de
 * type `identite`) · ce que le règlement a réellement lu de la marque.
 */
export function empreinteIdentiteReglesMarque(ctx: ContexteReglesMarque): string {
  return sha256Texte(JSON.stringify(instantaneReglesMarque(ctx))).slice(0, 16);
}
