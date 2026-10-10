/**
 * Source du registre · le pack embarqué, validé une fois, et ses validateurs.
 *
 * Le pack et le schéma viennent de `pack-embarque.ts` (copie octet pour octet
 * de `docs/studios-v2/`, voir le script `importer-pack-prompts.ts`). Le texte
 * est relu par `lirePackTexte` (clés JSON dupliquées refusées AVANT le parse),
 * validé avec les `$defs` du schéma et les identifiants de recette/benchmark,
 * puis le schéma est compilé UNE fois (Ajv) pour toute la vie du processus.
 *
 * Un pack embarqué invalide est une erreur de build, pas une donnée : on lève.
 */

import { PACK_EMBARQUE } from './pack-embarque';
import { POLITIQUES_COMPLEMENT } from './complement-tiktrends';
import { validerPolitiqueConversation, type PolitiqueConversation } from './conversation';
import {
  creerValidateurContrats, lirePackTexte, validerPack, validateurDocumentsParDefinitions,
  type EmpreintesPack, type OptionsValidationPack, type PackPrompts, type ValidateurContrats, type ContratConsommateur,
} from './noyau';

export interface CasBenchmark { id: string; title: string; templates: string[]; status: string }
export interface ExempleContrat {
  templateKey: string;
  inputExample?: unknown;
  readyOutputShapeExample?: unknown;
  blockedOutputExample?: unknown;
  invalidOutputExample?: unknown;
  invalidInputExample?: unknown;
}

export interface SourceRegistre {
  pack: PackPrompts;
  empreintes: EmpreintesPack;
  schema: Record<string, unknown>;
  options: OptionsValidationPack;
  validateur: ValidateurContrats;
  validerDocument: ReturnType<typeof validateurDocumentsParDefinitions>;
  exemples: ExempleContrat[];
  benchmark: CasBenchmark[];
  complement: Array<{ politique: PolitiqueConversation; contentHash: string }>;
  /** Contrats que le CODE consomme · une release qui les rompt ne se publie pas (PROMPT-09). */
  consommateurs: ContratConsommateur[];
  /** Clés de politique de conversation que le code consomme (Jarvis). */
  conversationsRequises: string[];
}

let cache: SourceRegistre | null = null;

export function chargerSource(): SourceRegistre {
  if (cache) return cache;
  const schema = JSON.parse(PACK_EMBARQUE.contrats.texte) as Record<string, unknown>;
  const defs = new Set(Object.keys((schema.$defs ?? {}) as Record<string, unknown>));
  const bench = JSON.parse(PACK_EMBARQUE.benchmark.texte) as { cases: CasBenchmark[] };
  const casBenchmark = new Set(bench.cases.map((c) => c.id));
  const options: OptionsValidationPack = { defsSchema: defs, casConnus: new Set([...PACK_EMBARQUE.recetteIds, ...casBenchmark]), casBenchmark };
  const r = lirePackTexte(PACK_EMBARQUE.prompts.texte, options);
  if (!r.ok) throw new Error(`Pack embarqué invalide · ${r.constats.map((c) => `${c.code} ${c.cible}`).join(' ; ')}`);
  const validateur = creerValidateurContrats(schema, r.pack.templates);
  const complement = POLITIQUES_COMPLEMENT.map((p) => {
    const v = validerPolitiqueConversation(p);
    if (!v.ok) throw new Error(`Complément invalide · ${v.constats.map((c) => `${c.code} ${c.cible}`).join(' ; ')}`);
    return { politique: v.politique, contentHash: v.contentHash };
  });
  const exemples = (JSON.parse(PACK_EMBARQUE.exemples.texte) as { cases: ExempleContrat[] }).cases;
  cache = {
    pack: r.pack, empreintes: r.empreintes, schema, options, validateur,
    validerDocument: validateurDocumentsParDefinitions(validateur),
    exemples, benchmark: bench.cases, complement,
    consommateurs: r.pack.templates.map((t) => ({ key: t.key, inputSchemaRef: t.inputSchemaRef, outputSchemaRef: t.outputSchemaRef })),
    conversationsRequises: complement.map((c) => c.politique.key),
  };
  return cache;
}

/** Valide un pack (objet) avec les options de la source · pour les brouillons édités. */
export function validerPackSynthetique(pack: unknown) {
  return validerPack(pack, chargerSource().options);
}
