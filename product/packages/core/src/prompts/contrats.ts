/**
 * Validation des contrats d'entrée et de sortie des 22 templates.
 *
 * ── Ce que ce module tranche ─────────────────────────────────────────────────
 *
 * `03-CONTRATS.schema.json` (JSON Schema draft 2020-12) est la SEULE source des
 * formes : on le compile une fois avec Ajv 2020 (`ajv/dist/2020`, formats par
 * `ajv-formats` pour `date-time`), puis chaque `$defs` se compile à la première
 * demande et reste en cache dans l'instance. `validerEntree(key, data)` et
 * `validerSortie(key, data)` suivent `inputSchemaRef` / `outputSchemaRef` du
 * template : aucun nom de définition n'est écrit à la main ici.
 *
 * ── Réglages Ajv, et pourquoi ────────────────────────────────────────────────
 *
 *  - `strict: true` : un mot-clé inconnu ou mal placé dans le schéma fait
 *    ÉCHOUER la compilation, plutôt que d'être ignoré.
 *  - `strictTypes: false` : seule exception. Le schéma écrit
 *    `if: { properties: { status: { const: 'ready' } } }` et
 *    `then: { properties: { questions: { maxItems: 0 } } }` sans répéter
 *    `type`, ce qui est du JSON Schema valide mais que le mode strict d'Ajv
 *    refuse par style (mesuré : première erreur à `#/allOf/0/then/properties/
 *    questions`). Le refus porterait sur la rédaction, pas sur le sens.
 *  - `allErrors: true` : l'ADMIN voit tous les écarts d'une sortie d'un coup.
 *
 * Les types TypeScript restent écrits à la main (`types.ts`) : générer des
 * types depuis un schéma de 210 Ko demanderait un outil de génération de plus.
 * La garde `prompts-contrats.test.ts` vérifie que les champs de l'enveloppe et
 * du contexte typés ici sont exactement ceux du schéma.
 */

import Ajv2020 from 'ajv/dist/2020';
import type { ErrorObject, ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { MOTIF_REF_SCHEMA } from './pack';

export interface ErreurSchema {
  /** Chemin JSON Pointer de la valeur fautive (`''` pour la racine). */
  chemin: string;
  /** Mot-clé JSON Schema en défaut (`required`, `additionalProperties`, `maxItems`…). */
  motCle: string;
  /** Propriété manquante ou en trop, quand le mot-clé en désigne une. */
  propriete?: string;
  message: string;
}

export type ResultatValidation =
  | { ok: true }
  | { ok: false; code: 'INVALID_SCHEMA'; erreurs: ErreurSchema[] }
  | { ok: false; code: 'TEMPLATE_INCONNU'; erreurs: ErreurSchema[] };

export interface RefsTemplate {
  key: string;
  inputSchemaRef: string;
  outputSchemaRef: string;
}

export interface ValidateurContrats {
  /** `$id` du schéma compilé · entre dans la trace d'exécution. */
  readonly schemaId: string;
  /** Noms des `$defs` disponibles. */
  readonly defs: ReadonlySet<string>;
  validerEntree(key: string, data: unknown): ResultatValidation;
  validerSortie(key: string, data: unknown): ResultatValidation;
  /** Valide une donnée contre une définition nommée (`Shot`, `Style`, `Quote`…). */
  validerDefinition(nom: string, data: unknown): ResultatValidation;
}

function traduire(erreurs: ReadonlyArray<ErrorObject> | null | undefined): ErreurSchema[] {
  return (erreurs ?? []).map((e) => {
    const p = e.params as Record<string, unknown>;
    const propriete = typeof p.missingProperty === 'string' ? p.missingProperty : typeof p.additionalProperty === 'string' ? p.additionalProperty : undefined;
    return { chemin: e.instancePath, motCle: e.keyword, ...(propriete !== undefined ? { propriete } : {}), message: e.message ?? e.keyword };
  });
}

/** Nom de `$defs` d'une référence de template (`03-CONTRATS.schema.json#/$defs/x` → `x`). */
export function nomDefinition(ref: string): string | null {
  return MOTIF_REF_SCHEMA.exec(ref)?.[1] ?? null;
}

/**
 * Compile le schéma de contrats UNE fois et rend les validateurs des templates.
 * Lève si le schéma ne compile pas, si son `$id` manque, ou si un template
 * pointe une définition absente : ces défauts se voient au démarrage, pas à la
 * première génération.
 */
export function creerValidateurContrats(schema: Readonly<Record<string, unknown>>, templates: ReadonlyArray<RefsTemplate>): ValidateurContrats {
  const schemaId = schema.$id;
  if (typeof schemaId !== 'string' || schemaId.length === 0) throw new Error('Schéma de contrats sans $id.');
  const defsBrutes = schema.$defs;
  if (typeof defsBrutes !== 'object' || defsBrutes === null) throw new Error('Schéma de contrats sans $defs.');
  const defs = new Set(Object.keys(defsBrutes));

  const ajv = new Ajv2020({ strict: true, strictTypes: false, allErrors: true });
  addFormats(ajv);
  ajv.addSchema(schema as Record<string, unknown>);

  const refs = new Map<string, { entree: string; sortie: string }>();
  for (const t of templates) {
    const entree = nomDefinition(t.inputSchemaRef);
    const sortie = nomDefinition(t.outputSchemaRef);
    if (!entree || !defs.has(entree)) throw new Error(`Template ${t.key} · inputSchemaRef introuvable : ${t.inputSchemaRef}`);
    if (!sortie || !defs.has(sortie)) throw new Error(`Template ${t.key} · outputSchemaRef introuvable : ${t.outputSchemaRef}`);
    refs.set(t.key, { entree, sortie });
  }

  const cache = new Map<string, ValidateFunction>();
  function compilee(nom: string): ValidateFunction {
    let v = cache.get(nom);
    if (!v) {
      v = ajv.getSchema(`${schemaId}#/$defs/${nom}`);
      if (!v) throw new Error(`Définition ${nom} introuvable dans ${schemaId}.`);
      cache.set(nom, v);
    }
    return v;
  }
  function valider(nom: string, data: unknown): ResultatValidation {
    const v = compilee(nom);
    return v(data) ? { ok: true } : { ok: false, code: 'INVALID_SCHEMA', erreurs: traduire(v.errors) };
  }
  const inconnu = (key: string): ResultatValidation => ({
    ok: false, code: 'TEMPLATE_INCONNU', erreurs: [{ chemin: '', motCle: 'template', message: `Template « ${key} » absent du registre.` }],
  });

  return {
    schemaId,
    defs,
    validerEntree: (key, data) => {
      const r = refs.get(key);
      return r ? valider(r.entree, data) : inconnu(key);
    },
    validerSortie: (key, data) => {
      const r = refs.get(key);
      return r ? valider(r.sortie, data) : inconnu(key);
    },
    validerDefinition: (nom, data) => {
      if (!defs.has(nom)) return { ok: false, code: 'INVALID_SCHEMA', erreurs: [{ chemin: '', motCle: '$ref', message: `Définition « ${nom} » absente du schéma.` }] };
      return valider(nom, data);
    },
  };
}
