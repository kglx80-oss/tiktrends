/**
 * Studios · L9 · lecture d'une migration SQL : est-elle ADDITIVE et REJOUABLE ?
 *
 * PUR : reçoit le texte d'un fichier `drizzle/NNNN_*.sql` ou le journal, ne lit
 * ni disque ni base. Les scripts `ops/migration/*` et les tests s'en servent
 * pour dire, preuve à l'appui, ce qu'une migration fait aux données existantes.
 *
 * ── Pourquoi une règle et pas une relecture ─────────────────────────────────
 *
 * MIG-01 demande un « backfill reprenable ». Avant de tester la reprise d'un
 * backfill, il faut savoir s'il y en a un. Relire 664 lignes à l'œil se fait
 * une fois ; la sixième migration relue à la hâte est celle qui glisse un
 * `UPDATE`. Ici chaque instruction est classée, et une instruction qu'on ne sait
 * pas classer n'est JAMAIS tenue pour additive (`inconnue`).
 *
 * ── Le piège du migrateur, qui justifie `violationsJournal` ────────────────
 *
 * `drizzle-orm` (0.33, `pg-core/dialect.js`) n'applique une migration que si
 * son horodatage `when` est STRICTEMENT supérieur au `created_at` de la
 * DERNIÈRE ligne de `drizzle.__drizzle_migrations`. Une migration fusionnée
 * avec un `when` plus ancien que la dernière appliquée est ignorée en silence,
 * sans erreur, et le déploiement se dit réussi. D'où : journal strictement
 * croissant, et `migrationsMasquees` pour le dire avant de fusionner.
 */

export type GenreInstruction =
  | 'creation_table' | 'creation_index' | 'fonction' | 'declencheur' | 'extension' | 'schema'
  | 'ajout_colonne' | 'ajout_contrainte' | 'bloc_protege' | 'ajout_valeur_enum' | 'type' | 'commentaire'
  | 'ecriture_donnees' | 'destructive' | 'inconnue';

export interface InstructionMigration {
  /** Rang dans le fichier, à partir de 1. */
  rang: number;
  genre: GenreInstruction;
  /** Deux passages laissent-ils la base dans le même état, sans erreur ? */
  rejouable: boolean;
  /** Première ligne utile, pour un message lisible. */
  extrait: string;
  raison: string;
}

export interface AnalyseMigration {
  instructions: InstructionMigration[];
  /** INSERT / UPDATE / DELETE / TRUNCATE / COPY / MERGE exécutés AU PASSAGE de la migration. */
  ecritures: InstructionMigration[];
  /** DROP, RENAME, changement de type, SET NOT NULL, colonne NOT NULL sans défaut… */
  destructives: InstructionMigration[];
  nonRejouables: InstructionMigration[];
  inconnues: InstructionMigration[];
  /** Ni écriture de données, ni destruction, ni instruction inconnue. */
  additive: boolean;
  /** Toutes les instructions sont rejouables. */
  rejouable: boolean;
  /** Ajoute une valeur d'enum · le migrateur doit valider avant tout usage de la valeur. */
  ajouteValeurEnum: boolean;
}

/* ─────────────────────────── Découpage ───────────────────────────────────── */

/**
 * Découpe un fichier SQL en instructions, commentaires retirés. Respecte les
 * chaînes ('…'), les identifiants ("…") et les corps dollar-quotés ($$…$$,
 * $tag$…$tag$) : un `;` dans un corps de fonction ne coupe rien.
 */
export function decouperInstructionsSql(texte: string): string[] {
  const src = texte.replace(/-->\s*statement-breakpoint/g, '\n');
  const out: string[] = [];
  let cur = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i]!;
    const suiv = src[i + 1];
    if (c === '-' && suiv === '-') {
      const fin = src.indexOf('\n', i);
      i = fin === -1 ? n : fin;
      cur += ' ';
      continue;
    }
    if (c === '/' && suiv === '*') {
      const fin = src.indexOf('*/', i + 2);
      i = fin === -1 ? n : fin + 2;
      cur += ' ';
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === c && src[j + 1] === c) { j += 2; continue; }
        if (src[j] === c) break;
        j++;
      }
      cur += src.slice(i, Math.min(n, j + 1));
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(src.slice(i));
      if (m) {
        const balise = m[0];
        const fin = src.indexOf(balise, i + balise.length);
        const j = fin === -1 ? n : fin + balise.length;
        cur += src.slice(i, j);
        i = j;
        continue;
      }
    }
    if (c === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/* ─────────────────────────── Classement ──────────────────────────────────── */

const DESTRUCTIF_DANS_CORPS = /\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE|SCHEMA|FUNCTION|TRIGGER|VIEW)|DELETE\s+FROM|TRUNCATE|UPDATE\s+"?[a-z_]+"?\s+SET|INSERT\s+INTO|RENAME\s+(TO|COLUMN|CONSTRAINT|VALUE)|ALTER\s+COLUMN)\b/i;

/** Le corps d'un bloc `DO $$ … $$` (le texte entre les balises). */
function corpsDollar(instr: string): string {
  const m = /\$([A-Za-z_][A-Za-z0-9_]*)?\$([\s\S]*)\$\1\$/.exec(instr);
  return m ? m[2]! : '';
}

/** Retire les corps dollar-quotés (corps de fonction : rien ne s'y exécute au passage). */
function sansCorps(instr: string): string {
  return instr.replace(/\$([A-Za-z_][A-Za-z0-9_]*)?\$[\s\S]*?\$\1\$/g, '$$…$$');
}

function extrait(instr: string): string {
  const l = instr.replace(/\s+/g, ' ').trim();
  return l.length > 110 ? `${l.slice(0, 107)}…` : l;
}

export function classerInstructionSql(instr: string, rang = 1): InstructionMigration {
  const tete = sansCorps(instr).replace(/\s+/g, ' ').trim();
  const T = tete.toUpperCase();
  const base = { rang, extrait: extrait(instr) };
  const c = (genre: GenreInstruction, rejouable: boolean, raison: string): InstructionMigration => ({ ...base, genre, rejouable, raison });

  // Écritures de données exécutées au passage de la migration.
  if (/^(INSERT|UPDATE|DELETE|TRUNCATE|COPY|MERGE)\b/.test(T) || /^WITH\b[\s\S]*\b(INSERT|UPDATE|DELETE)\b/.test(T)) {
    return c('ecriture_donnees', false, 'écrit des données existantes au passage de la migration');
  }
  if (/^DROP\b/.test(T)) return c('destructive', false, 'supprime un objet');
  if (/^ALTER TYPE\b/.test(T)) {
    if (/\bADD VALUE IF NOT EXISTS\b/.test(T)) return c('ajout_valeur_enum', true, 'ajoute une valeur d’enum (IF NOT EXISTS)');
    if (/\bADD VALUE\b/.test(T)) return c('ajout_valeur_enum', false, 'ajoute une valeur d’enum sans IF NOT EXISTS');
    return c('destructive', false, 'modifie un type existant');
  }
  if (/^ALTER TABLE\b/.test(T)) {
    if (/\b(DROP|RENAME)\b/.test(T)) return c('destructive', false, 'supprime ou renomme dans une table existante');
    if (/\bALTER (COLUMN )?"?[A-Z0-9_]+"? (SET DATA )?TYPE\b/.test(T)) return c('destructive', false, 'change le type d’une colonne');
    if (/\bSET NOT NULL\b/.test(T)) return c('destructive', false, 'rend obligatoire une colonne existante');
    if (/\bADD COLUMN\b/.test(T)) {
      const nonNulSansDefaut = /\bNOT NULL\b/.test(T) && !/\bDEFAULT\b/.test(T);
      if (nonNulSansDefaut) return c('destructive', false, 'colonne NOT NULL sans défaut · échoue ou exige un remplissage');
      return /\bADD COLUMN IF NOT EXISTS\b/.test(T)
        ? c('ajout_colonne', true, 'ajoute une colonne (IF NOT EXISTS)')
        : c('ajout_colonne', false, 'ajoute une colonne sans IF NOT EXISTS');
    }
    if (/\bADD CONSTRAINT\b/.test(T)) return c('ajout_contrainte', false, 'ajoute une contrainte hors bloc protégé');
    if (/\bENABLE ROW LEVEL SECURITY\b/.test(T)) return c('ajout_contrainte', true, 'active la sécurité par ligne');
    return c('inconnue', false, 'ALTER TABLE non reconnu');
  }
  if (/^CREATE TABLE IF NOT EXISTS\b/.test(T)) return c('creation_table', true, 'crée une table (IF NOT EXISTS)');
  if (/^CREATE TABLE\b/.test(T)) return c('creation_table', false, 'crée une table sans IF NOT EXISTS');
  if (/^CREATE (UNIQUE )?INDEX (CONCURRENTLY )?IF NOT EXISTS\b/.test(T)) return c('creation_index', true, 'crée un index (IF NOT EXISTS)');
  if (/^CREATE (UNIQUE )?INDEX\b/.test(T)) return c('creation_index', false, 'crée un index sans IF NOT EXISTS');
  if (/^CREATE OR REPLACE FUNCTION\b/.test(T)) return c('fonction', true, 'crée ou remplace une fonction');
  if (/^CREATE FUNCTION\b/.test(T)) return c('fonction', false, 'crée une fonction sans OR REPLACE');
  if (/^CREATE OR REPLACE TRIGGER\b/.test(T)) return c('declencheur', true, 'crée ou remplace un déclencheur');
  if (/^CREATE (CONSTRAINT )?TRIGGER\b/.test(T)) return c('declencheur', false, 'crée un déclencheur sans OR REPLACE');
  if (/^CREATE EXTENSION IF NOT EXISTS\b/.test(T)) return c('extension', true, 'active une extension (IF NOT EXISTS)');
  if (/^CREATE EXTENSION\b/.test(T)) return c('extension', false, 'active une extension sans IF NOT EXISTS');
  if (/^CREATE SCHEMA IF NOT EXISTS\b/.test(T)) return c('schema', true, 'crée un schéma (IF NOT EXISTS)');
  if (/^CREATE TYPE\b/.test(T)) return c('type', false, 'crée un type hors bloc protégé');
  if (/^COMMENT ON\b/.test(T)) return c('commentaire', true, 'pose un commentaire');
  if (/^DO\b/.test(T)) {
    const corps = corpsDollar(instr);
    if (DESTRUCTIF_DANS_CORPS.test(corps)) return c('destructive', false, 'bloc DO qui écrit, supprime ou renomme');
    const protege = /\bEXCEPTION\b[\s\S]*\bWHEN\b[\s\S]*\b(duplicate_object|duplicate_table|duplicate_column)\b/i.test(corps);
    return protege
      ? c('bloc_protege', true, 'bloc DO qui ignore l’objet déjà présent')
      : c('inconnue', false, 'bloc DO sans garde d’objet déjà présent');
  }
  return c('inconnue', false, 'instruction non reconnue');
}

export function analyserMigrationSql(texte: string): AnalyseMigration {
  const instructions = decouperInstructionsSql(texte).map((s, k) => classerInstructionSql(s, k + 1));
  const ecritures = instructions.filter((x) => x.genre === 'ecriture_donnees');
  const destructives = instructions.filter((x) => x.genre === 'destructive');
  const inconnues = instructions.filter((x) => x.genre === 'inconnue');
  const nonRejouables = instructions.filter((x) => !x.rejouable);
  return {
    instructions, ecritures, destructives, nonRejouables, inconnues,
    additive: ecritures.length === 0 && destructives.length === 0 && inconnues.length === 0,
    rejouable: nonRejouables.length === 0,
    ajouteValeurEnum: instructions.some((x) => x.genre === 'ajout_valeur_enum'),
  };
}

/* ─────────────────────────── Journal ─────────────────────────────────────── */

export interface EntreeJournalMigration { idx: number; when: number; tag: string }

/**
 * Ce qui rendrait le journal dangereux pour le migrateur drizzle : rang non
 * contigu, étiquette qui ne porte pas son rang, horodatage non STRICTEMENT
 * croissant (la migration plus ancienne que sa précédente serait ignorée sur
 * toute base qui a déjà appliqué la précédente).
 */
export function violationsJournalMigrations(entrees: readonly EntreeJournalMigration[]): string[] {
  const v: string[] = [];
  entrees.forEach((e, k) => {
    if (e.idx !== k) v.push(`rang ${e.idx} à la position ${k} · le journal doit être contigu depuis 0`);
    const prefixe = String(e.idx).padStart(4, '0');
    if (!e.tag.startsWith(`${prefixe}_`)) v.push(`étiquette « ${e.tag} » ne commence pas par ${prefixe}_`);
    const prec = entrees[k - 1];
    if (prec && !(e.when > prec.when)) {
      v.push(`« ${e.tag} » (when ${e.when}) n’est pas postérieure à « ${prec.tag} » (when ${prec.when}) · le migrateur l’ignorerait sur une base qui a déjà « ${prec.tag} »`);
    }
  });
  return v;
}

/**
 * Migrations du journal que le migrateur drizzle appliquerait sur une base dont
 * la dernière ligne appliquée porte `dernierCreatedAt` (null = base vierge).
 */
export function migrationsEnAttente(entrees: readonly EntreeJournalMigration[], dernierCreatedAt: number | null): EntreeJournalMigration[] {
  return entrees.filter((e) => dernierCreatedAt === null || e.when > dernierCreatedAt);
}

/**
 * Migrations du journal JAMAIS appliquées (horodatage absent de la base) que
 * le migrateur ignorera pourtant, parce qu'elles sont plus anciennes que la
 * dernière appliquée. Doit être vide avant toute fusion qui apporte une
 * migration ; sinon la base ne recevra jamais ces objets, sans aucune erreur.
 */
export function migrationsMasquees(entrees: readonly EntreeJournalMigration[], appliquees: readonly number[]): EntreeJournalMigration[] {
  if (appliquees.length === 0) return [];
  const faites = new Set(appliquees);
  const dernier = Math.max(...appliquees);
  return entrees.filter((e) => !faites.has(e.when) && e.when <= dernier);
}
