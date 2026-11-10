import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyserMigrationSql, classerInstructionSql, decouperInstructionsSql,
  violationsJournalMigrations, migrationsEnAttente, migrationsMasquees,
  type EntreeJournalMigration,
} from '@tiktrends/core';

/**
 * Studios · L9 · MIG-01 · ce que 0054 et 0055 font aux données existantes,
 * PROUVÉ sur deux plans :
 *
 *  · lecture du SQL réel (règle pure `migration-additive`) : aucune écriture
 *    de données, aucune destruction, chaque instruction rejouable. La même
 *    règle voit bien les backfills HISTORIQUES (0045, 0053) : elle regarde la
 *    bonne chose, elle ne dit pas « additif » à tout ;
 *  · base Postgres réelle en mémoire (pglite) : migrations 0000→0053, lignes
 *    existantes, puis 0054/0055 appliquées, rejouées, et appliquées après une
 *    interruption au milieu de 0054 (moitié des instructions passées hors
 *    transaction) · même schéma final, mêmes lignes, aucun doublon.
 *
 * La preuve avec le VRAI migrateur drizzle, coupé puis en échec forcé, sur
 * Postgres 16, est `ops/migration/verifier-migration.sh` (hors CI : il lui
 * faut un serveur Postgres local).
 */

const DIR = join(process.cwd(), '../../packages/db/drizzle');
const journal = JSON.parse(readFileSync(join(DIR, 'meta/_journal.json'), 'utf8')) as { entries: EntreeJournalMigration[] };
const fichier = (tag: string) => readFileSync(join(DIR, `${tag}.sql`), 'utf8');
const NOUVELLES = ['0054_studios_fondations', '0055_ai_spend_reconciliation'];

describe('lecture du SQL · 0054 et 0055 sont additives et rejouables', () => {
  for (const tag of NOUVELLES) {
    it(`${tag} · aucune écriture de données, aucune destruction, tout rejouable`, () => {
      const a = analyserMigrationSql(fichier(tag));
      expect(a.instructions.length).toBeGreaterThan(0);
      expect(a.ecritures.map((x) => `${x.rang} ${x.extrait}`), 'écriture de données au passage de la migration (backfill)').toEqual([]);
      expect(a.destructives.map((x) => `${x.rang} ${x.extrait}`), 'instruction destructive').toEqual([]);
      expect(a.inconnues.map((x) => `${x.rang} ${x.extrait}`), 'instruction non reconnue · non prouvée additive').toEqual([]);
      expect(a.nonRejouables.map((x) => `${x.rang} ${x.extrait}`), 'instruction non rejouable').toEqual([]);
      expect(a.ajouteValeurEnum).toBe(false);
    });
  }

  it('0054 compte 57 instructions : 21 tables, 18 index, 4 fonctions, 11 déclencheurs, 3 blocs protégés', () => {
    const a = analyserMigrationSql(fichier('0054_studios_fondations'));
    const parGenre = a.instructions.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.genre]: (acc[x.genre] ?? 0) + 1 }), {});
    expect(parGenre).toEqual({ bloc_protege: 3, fonction: 4, declencheur: 11, creation_table: 21, creation_index: 18 });
  });

  it('0065_empreinte_objet_assets · une colonne nullable ajoutée, rejouable, rien d’autre', () => {
    const a = analyserMigrationSql(fichier('0065_empreinte_objet_assets'));
    expect(a.instructions.map((x) => x.genre)).toEqual(['ajout_colonne']);
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0066_empreinte_logos_marque · une colonne nullable ajoutée sur brands, rejouable, rien d’autre', () => {
    const a = analyserMigrationSql(fichier('0066_empreinte_logos_marque'));
    expect(a.instructions.map((x) => x.genre)).toEqual(['ajout_colonne']);
    expect(a.instructions[0]!.extrait).toMatch(/ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "logo_empreintes_json" jsonb/);
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0067_index_pagination_assets · un index créé (IF NOT EXISTS) sur assets, rejouable, rien d’autre', () => {
    const a = analyserMigrationSql(fichier('0067_index_pagination_assets'));
    expect(a.instructions.map((x) => x.genre)).toEqual(['creation_index']);
    // L'instruction entière, commentaires retirés (l'extrait de l'analyse est tronqué).
    const [instr] = decouperInstructionsSql(fichier('0067_index_pagination_assets')).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim());
    // La forme exacte exclut CONCURRENTLY · le migrateur drizzle passe les migrations dans une transaction, où Postgres le refuse.
    expect(instr).toMatch(/^CREATE INDEX IF NOT EXISTS "assets_ws_created_id_idx" ON "assets" USING btree \("workspace_id", "created_at" DESC, "id" DESC\);?$/);
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0068_estimation_hypotheses · trois colonnes nullables bornées (1 à 3) sur adsmap_ads, rejouables, rien d’autre', () => {
    const a = analyserMigrationSql(fichier('0068_estimation_hypotheses'));
    expect(a.instructions.map((x) => x.genre)).toEqual(['ajout_colonne', 'ajout_colonne', 'ajout_colonne']);
    const instr = decouperInstructionsSql(fichier('0068_estimation_hypotheses')).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim());
    expect(instr).toEqual(['ice_impact', 'ice_confidence', 'ice_effort'].map((c) => `ALTER TABLE "adsmap_ads" ADD COLUMN IF NOT EXISTS "${c}" smallint CHECK ("${c}" BETWEEN 1 AND 3)`));
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0069_mesures_csv_remontees · deux tables neuves, une colonne nullable sur brands, contraintes protégées, rejouables, rien d’autre', () => {
    const a = analyserMigrationSql(fichier('0069_mesures_csv_remontees'));
    const parGenre = a.instructions.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.genre]: (acc[x.genre] ?? 0) + 1 }), {});
    expect(parGenre).toEqual({ creation_table: 2, ajout_colonne: 1, bloc_protege: 6, creation_index: 2 });
    const instr = decouperInstructionsSql(fichier('0069_mesures_csv_remontees')).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim());
    expect(instr).toContain('ALTER TABLE "brands" ADD COLUMN IF NOT EXISTS "adsmap_remontee_suspendue_le" timestamp with time zone');
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0070_veille_tags_notes · trois tables neuves, leurs index (dont deux uniques partiels), contraintes protégées · aucun DROP, aucun RENAME, aucune table existante modifiée', () => {
    const brut = fichier('0070_veille_tags_notes');
    const a = analyserMigrationSql(brut);
    const parGenre = a.instructions.reduce<Record<string, number>>((acc, x) => ({ ...acc, [x.genre]: (acc[x.genre] ?? 0) + 1 }), {});
    expect(parGenre).toEqual({ creation_table: 3, bloc_protege: 9, creation_index: 5 });
    const sansCommentaires = brut.replace(/^--.*$/gm, '');
    expect(sansCommentaires, '0070 contient un DROP').not.toMatch(/\bDROP\b/i);
    expect(sansCommentaires, '0070 contient un RENAME').not.toMatch(/\bRENAME\b/i);
    // Aucun ALTER sur une table existante · seulement des contraintes sur les trois tables neuves.
    const alter = [...sansCommentaires.matchAll(/ALTER TABLE "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(alter)].sort(), 'une table existante est modifiée par 0070').toEqual(['saved_ad_collections', 'veille_tags', 'veille_tags_sauvegardes']);
    expect(sansCommentaires).toContain('CREATE INDEX IF NOT EXISTS "veille_tags_sauvegardes_tag_idx" ON "veille_tags_sauvegardes" USING btree ("tag_id")');
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0071_personas_rang_segment · deux colonnes nullables sur personas et un index, rejouables · aucun DROP, aucun RENAME, aucun ALTER destructif, aucune autre table touchée', () => {
    const brut = fichier('0071_personas_rang_segment');
    const a = analyserMigrationSql(brut);
    expect(a.instructions.map((x) => x.genre)).toEqual(['ajout_colonne', 'ajout_colonne', 'creation_index']);
    const sansCommentaires = brut.replace(/^--.*$/gm, '');
    expect(sansCommentaires, '0071 contient un DROP').not.toMatch(/\bDROP\b/i);
    expect(sansCommentaires, '0071 contient un RENAME').not.toMatch(/\bRENAME\b/i);
    expect(sansCommentaires, '0071 change le type, le défaut ou la nullité d’une colonne existante').not.toMatch(/ALTER COLUMN|SET NOT NULL|SET DEFAULT|\bTYPE\b/i);
    expect(sansCommentaires, '0071 pose une colonne NOT NULL').not.toMatch(/NOT NULL/i);
    const alter = [...sansCommentaires.matchAll(/(?:ALTER TABLE|ON) "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(alter)], 'une autre table que personas est touchée par 0071').toEqual(['personas']);
    const instr = decouperInstructionsSql(brut).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim());
    expect(instr.map((x) => x.replace(/;$/, ''))).toEqual([
      'ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "rank" integer',
      'ALTER TABLE "personas" ADD COLUMN IF NOT EXISTS "segment" text',
      'CREATE INDEX IF NOT EXISTS "personas_brand_rank_idx" ON "personas" USING btree ("brand_id","rank")',
    ]);
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0072_offres_allegations · une table neuve (et sa contrainte de statut), trois colonnes nullables sur adsmap_offers, deux clés étrangères protégées, un index, rejouables · aucun DROP, aucun RENAME, aucun ALTER destructif', () => {
    const brut = fichier('0072_offres_allegations');
    const a = analyserMigrationSql(brut);
    expect(a.instructions.map((x) => x.genre)).toEqual(['creation_table', 'ajout_colonne', 'ajout_colonne', 'ajout_colonne', 'bloc_protege', 'bloc_protege', 'creation_index']);
    const sansCommentaires = brut.replace(/^--.*$/gm, '');
    expect(sansCommentaires, '0072 contient un DROP').not.toMatch(/\bDROP\b/i);
    expect(sansCommentaires, '0072 contient un RENAME').not.toMatch(/\bRENAME\b/i);
    expect(sansCommentaires, '0072 change le type, le défaut ou la nullité d’une colonne existante').not.toMatch(/ALTER COLUMN|SET NOT NULL|SET DEFAULT|\bTYPE\b/i);
    // Les seuls NOT NULL sont dans la table NEUVE · aucun ajout de colonne sur adsmap_offers ne l'est.
    for (const ajout of sansCommentaires.match(/ALTER TABLE "adsmap_offers" ADD COLUMN[^;]*/g) ?? []) expect(ajout, 'colonne NOT NULL ou avec défaut ajoutée à adsmap_offers').not.toMatch(/NOT NULL|DEFAULT/i);
    const alter = [...sansCommentaires.matchAll(/(?:ALTER TABLE|ON) "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(alter)].sort(), 'une autre table que brand_claims et adsmap_offers est touchée par 0072').toEqual(['adsmap_offers', 'brand_claims']);
    const instr = decouperInstructionsSql(brut).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''));
    expect(instr.slice(1, 4)).toEqual([
      'ALTER TABLE "adsmap_offers" ADD COLUMN IF NOT EXISTS "kind" text',
      'ALTER TABLE "adsmap_offers" ADD COLUMN IF NOT EXISTS "conditions" text',
      'ALTER TABLE "adsmap_offers" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone',
    ]);
    expect(instr[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "brand_claims" \(.*CONSTRAINT "brand_claims_status_ck" CHECK \("status" IN \('a_prouver', 'prouvee'\)\) \)$/);
    expect(instr[6]).toBe('CREATE INDEX IF NOT EXISTS "brand_claims_brand_idx" ON "brand_claims" USING btree ("brand_id")');
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0073_mesures_retenues_cbo · deux colonnes nullables (adsmap_mesures_csv, ad_instances), deux index partiels, rejouables · aucun DROP, aucun RENAME, aucun ALTER destructif, aucune autre table touchée', () => {
    const brut = fichier('0073_mesures_retenues_cbo');
    const a = analyserMigrationSql(brut);
    expect(a.instructions.map((x) => x.genre)).toEqual(['ajout_colonne', 'ajout_colonne', 'creation_index', 'creation_index']);
    const sansCommentaires = brut.replace(/^--.*$/gm, '');
    expect(sansCommentaires, '0073 contient un DROP').not.toMatch(/\bDROP\b/i);
    expect(sansCommentaires, '0073 contient un RENAME').not.toMatch(/\bRENAME\b/i);
    expect(sansCommentaires, '0073 change le type, le défaut ou la nullité d’une colonne existante').not.toMatch(/ALTER COLUMN|SET NOT NULL|SET DEFAULT|\bTYPE\b/i);
    expect(sansCommentaires, '0073 pose une colonne NOT NULL ou avec défaut').not.toMatch(/NOT NULL|DEFAULT/i);
    const alter = [...sansCommentaires.matchAll(/(?:ALTER TABLE|ON) "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(alter)].sort(), 'une autre table que ad_instances et adsmap_mesures_csv est touchée par 0073').toEqual(['ad_instances', 'adsmap_mesures_csv']);
    const instr = decouperInstructionsSql(brut).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''));
    expect(instr).toEqual([
      'ALTER TABLE "ad_instances" ADD COLUMN IF NOT EXISTS "campaign_budget_optimization" boolean',
      'ALTER TABLE "adsmap_mesures_csv" ADD COLUMN IF NOT EXISTS "retenue" boolean',
      'CREATE INDEX IF NOT EXISTS "adsmap_mesures_csv_retenue_idx" ON "adsmap_mesures_csv" USING btree ("brand_id","date_debut") WHERE "adsmap_mesures_csv"."retenue" = true',
      'CREATE INDEX IF NOT EXISTS "adsmap_mesures_csv_a_marquer_idx" ON "adsmap_mesures_csv" USING btree ("brand_id","ad_id") WHERE "adsmap_mesures_csv"."retenue" is null',
    ]);
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0074_commentaires_projet · une table neuve (trois contraintes · cible exclusive, longueur, historique), cinq clés étrangères protégées partant d’elle, un index, rejouables · aucun DROP, aucun RENAME, aucune table existante modifiée', () => {
    const brut = fichier('0074_commentaires_projet');
    const a = analyserMigrationSql(brut);
    expect(a.instructions.map((x) => x.genre)).toEqual(['creation_table', 'bloc_protege', 'bloc_protege', 'bloc_protege', 'bloc_protege', 'bloc_protege', 'creation_index']);
    const sansCommentaires = brut.replace(/^--.*$/gm, '');
    expect(sansCommentaires, '0074 contient un DROP').not.toMatch(/\bDROP\b/i);
    expect(sansCommentaires, '0074 contient un RENAME').not.toMatch(/\bRENAME\b/i);
    expect(sansCommentaires, '0074 change le type, le défaut ou la nullité d’une colonne existante').not.toMatch(/ALTER COLUMN|SET NOT NULL|SET DEFAULT|\bTYPE\b|ADD COLUMN/i);
    // Seule la table NEUVE est modifiée (ses clés étrangères) · les tables citées par REFERENCES ne sont que lues.
    const alter = [...sansCommentaires.matchAll(/(?:ALTER TABLE|ON) "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(alter)], 'une autre table que studio_comments est modifiée par 0074').toEqual(['studio_comments']);
    const instr = decouperInstructionsSql(brut).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''));
    expect(instr[0]).toMatch(/^CREATE TABLE IF NOT EXISTS "studio_comments" \(.*CONSTRAINT "studio_comments_cible_ck" CHECK \(\("target_type" = 'version' AND "version_id" IS NOT NULL AND "asset_id" IS NULL\) OR \("target_type" = 'creation' AND "asset_id" IS NOT NULL AND "version_id" IS NULL\)\), CONSTRAINT "studio_comments_longueur_ck" CHECK \(char_length\("body"\) BETWEEN 1 AND 2000\), CONSTRAINT "studio_comments_historique_ck" CHECK \(jsonb_typeof\("history"\) = 'array'\) \)$/);
    expect(instr[6]).toBe('CREATE INDEX IF NOT EXISTS "studio_comments_projet_idx" ON "studio_comments" USING btree ("workspace_id","brand_id","project_id","created_at")');
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('0075_incidents_plateforme · une table neuve (cinq contraintes · titre, gravité, textes, notes, clôture), deux clés étrangères protégées partant d’elle, un index, une fonction et deux déclencheurs qui refusent la suppression, rejouables · aucun DROP, aucun RENAME, aucune table existante modifiée', () => {
    const brut = fichier('0075_incidents_plateforme');
    const a = analyserMigrationSql(brut);
    expect(a.instructions.map((x) => x.genre)).toEqual(['creation_table', 'bloc_protege', 'bloc_protege', 'creation_index', 'fonction', 'declencheur', 'declencheur']);
    const sansCommentaires = brut.replace(/^--.*$/gm, '');
    expect(sansCommentaires, '0075 contient un DROP').not.toMatch(/\bDROP\b/i);
    expect(sansCommentaires, '0075 contient un RENAME').not.toMatch(/\bRENAME\b/i);
    expect(sansCommentaires, '0075 change une colonne existante').not.toMatch(/ALTER COLUMN|SET NOT NULL|SET DEFAULT|ADD COLUMN/i);
    // Seule la table NEUVE est modifiée (ses clés étrangères, ses déclencheurs) · « users » n'est que lue par REFERENCES.
    const touchees = [...sansCommentaires.matchAll(/(?:ALTER TABLE|\bON) "([a-z_]+)"/g)].map((m) => m[1]);
    expect([...new Set(touchees)], 'une autre table que platform_incidents est modifiée par 0075').toEqual(['platform_incidents']);
    const instr = decouperInstructionsSql(brut).map((x) => x.replace(/^--.*$/gm, '').replace(/\s+/g, ' ').trim().replace(/;$/, ''));
    expect(instr[0]).toMatch(/CONSTRAINT "platform_incidents_cloture_ck" CHECK \(\("status" = 'ouvert' AND "closed_at" IS NULL AND "resolution" IS NULL\) OR \("status" = 'clos' AND "closed_at" IS NOT NULL AND "resolution" IS NOT NULL\)\) \)$/);
    expect(instr[3]).toBe('CREATE INDEX IF NOT EXISTS "platform_incidents_statut_idx" ON "platform_incidents" USING btree ("status","created_at")');
    expect(instr[5]).toBe('CREATE OR REPLACE TRIGGER "platform_incidents_sans_suppression" BEFORE DELETE ON "platform_incidents" FOR EACH ROW EXECUTE FUNCTION "platform_incident_jamais_supprime"()');
    expect(instr[6]).toBe('CREATE OR REPLACE TRIGGER "platform_incidents_sans_vidage" BEFORE TRUNCATE ON "platform_incidents" FOR EACH STATEMENT EXECUTE FUNCTION "platform_incident_jamais_supprime"()');
    expect(a.additive && a.rejouable).toBe(true);
    expect([...a.ecritures, ...a.destructives, ...a.inconnues, ...a.nonRejouables]).toEqual([]);
  });

  it('référence · la même règle VOIT les backfills historiques (0045, 0053) et la destruction de 0035', () => {
    expect(analyserMigrationSql(fichier('0045_backfill_ad_source_ref')).ecritures.length).toBeGreaterThan(0);
    expect(analyserMigrationSql(fichier('0053_modern_quasar')).ecritures.length).toBeGreaterThan(0);
    expect(analyserMigrationSql(fichier('0035_purple_shatterstar')).destructives.length).toBeGreaterThan(0);
  });
});

describe('règle pure · classement des instructions', () => {
  const genre = (s: string) => classerInstructionSql(s).genre;
  it('écritures et destructions reconnues', () => {
    expect(genre('UPDATE "ai_spend" SET reconcile_reason = \'x\'')).toBe('ecriture_donnees');
    expect(genre('INSERT INTO brands (id) VALUES (1)')).toBe('ecriture_donnees');
    expect(genre('DELETE FROM generations')).toBe('ecriture_donnees');
    expect(genre('DROP TABLE "brands"')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" DROP COLUMN "tone"')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" RENAME COLUMN "tone" TO "ton"')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" ALTER COLUMN "tone" SET DATA TYPE integer')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" ALTER COLUMN "tone" SET NOT NULL')).toBe('destructive');
    expect(genre('ALTER TABLE "brands" ADD COLUMN "x" text NOT NULL')).toBe('destructive');
    expect(genre('DO $$ BEGIN DELETE FROM brands; EXCEPTION WHEN duplicate_object THEN null; END $$')).toBe('destructive');
    expect(genre('VACUUM brands')).toBe('inconnue');
  });
  it('ajouts reconnus, rejouables seulement avec leur garde', () => {
    expect(classerInstructionSql('ALTER TABLE "ai_spend" ADD COLUMN IF NOT EXISTS "r" text').rejouable).toBe(true);
    expect(classerInstructionSql('ALTER TABLE "ai_spend" ADD COLUMN "r" text').rejouable).toBe(false);
    expect(classerInstructionSql('CREATE INDEX "i" ON "t" ("a")').rejouable).toBe(false);
    expect(classerInstructionSql('ALTER TABLE "t" ADD CONSTRAINT "c" UNIQUE ("a")').rejouable).toBe(false);
    expect(classerInstructionSql('DO $$ BEGIN ALTER TABLE "t" ADD CONSTRAINT "c" UNIQUE ("a"); EXCEPTION WHEN duplicate_object THEN null; END $$').genre).toBe('bloc_protege');
    // Valider une contrainte posée NOT VALID (0058) · additive et rejouable, ni écriture ni destruction.
    const vc = classerInstructionSql('ALTER TABLE "assets" VALIDATE CONSTRAINT "assets_rights_ck"');
    expect(vc.genre).toBe('ajout_contrainte');
    expect(vc.rejouable).toBe(true);
  });
  it('un corps de fonction n’est pas exécuté au passage : un UPDATE dedans ne compte pas, un « ; » dedans ne coupe pas', () => {
    const sql = `CREATE OR REPLACE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN UPDATE t SET a = 1; RETURN NEW; END $fn$;
--> statement-breakpoint
-- commentaire ; avec point-virgule
CREATE TABLE IF NOT EXISTS "t" ("a" text DEFAULT ';' NOT NULL);`;
    expect(decouperInstructionsSql(sql)).toHaveLength(2);
    const a = analyserMigrationSql(sql);
    expect(a.additive && a.rejouable).toBe(true);
  });
});

describe('journal · le migrateur drizzle n’ignore aucune migration', () => {
  it('le journal du dépôt est contigu et strictement croissant', () => {
    expect(violationsJournalMigrations(journal.entries)).toEqual([]);
  });
  it('une migration fusionnée avec un horodatage plus ancien serait IGNORÉE · la règle le dit', () => {
    const e: EntreeJournalMigration[] = [
      { idx: 0, when: 100, tag: '0000_a' }, { idx: 1, when: 300, tag: '0001_b' }, { idx: 2, when: 200, tag: '0002_c' },
    ];
    expect(violationsJournalMigrations(e).join('\n')).toMatch(/« 0002_c » .* le migrateur l’ignorerait/);
    expect(migrationsEnAttente(e, 300)).toEqual([]);
    expect(migrationsMasquees(e, [100, 300]).map((x) => x.tag)).toEqual(['0002_c']);
  });
  it('sur la production de main (0000→0053 appliquées), exactement 0054, 0055, 0056 (R5), 0057 (conversations Jarvis), 0058 (dossiers), 0059 (lien concept), 0060 (poches de crédits), 0061 (unité de crédit ÷ 10), 0062 (échéance d’abonnement), 0063 (facturation annuelle), 0064 (tags de couleur des dossiers), 0065 (empreinte des objets téléversés), 0066 (empreinte des logos de marque), 0067 (index de la lecture paginée des médias) 0068 (estimation des hypothèses), 0069 (mesures importées et journal des remontées) 0070 (tags et collections de la Veille), 0071 (rang et segment des personas), 0072 (offres et allégations), 0073 (marque « retenue » des mesures, CBO des instances) 0074 (commentaires des projets) puis 0075 (incidents déclarés) sont en attente, rien de masqué', () => {
    const main = journal.entries.filter((x) => x.idx <= 53).map((x) => x.when);
    expect(migrationsEnAttente(journal.entries, Math.max(...main)).map((x) => x.tag)).toEqual([...NOUVELLES, '0056_ai_spend_reconciliations', '0057_jarvis_conversations', '0058_library_folders', '0059_concept_lien_conversation', '0060_poches_credits', '0061_unite_credits', '0062_echeance_abonnement', '0063_facturation_annuelle', '0064_tags_couleur_dossiers', '0065_empreinte_objet_assets', '0066_empreinte_logos_marque', '0067_index_pagination_assets', '0068_estimation_hypotheses', '0069_mesures_csv_remontees', '0070_veille_tags_notes', '0071_personas_rang_segment', '0072_offres_allegations', '0073_mesures_retenues_cbo', '0074_commentaires_projet', '0075_incidents_plateforme']);
    expect(migrationsMasquees(journal.entries, main)).toEqual([]);
  });
});

/* ───────────────────── Base réelle en mémoire (pglite) ────────────────────── */

const preparer = (sql: string) => sql
  .replace(/-->\s*statement-breakpoint/g, '')
  .replace(/CREATE EXTENSION IF NOT EXISTS vector;?/gi, '')
  .replace(/vector\(\d+\)/gi, 'text');

async function baseJusqua0053(): Promise<PGlite> {
  const pg = new PGlite();
  for (const e of journal.entries.filter((x) => x.idx <= 53)) await pg.exec(preparer(fichier(e.tag)));
  // Lignes existantes · celles que 0054/0055 touchent ou référencent. Dates
  // explicites partout : deux bases semées doivent avoir les mêmes lignes.
  await pg.exec(`
    SET TIME ZONE 'UTC';
    -- 0053 insère deux lignes datées de now() · on les fige pour comparer deux bases.
    UPDATE platform_staff SET created_at = '2026-08-01T00:00:00Z', updated_at = '2026-08-01T00:00:00Z';
    INSERT INTO workspaces (id, name, plan, created_at) VALUES ('a9000000-0000-4000-8000-000000000001', 'Espace L9', 'business', '2026-08-01T00:00:00Z');
    INSERT INTO users (id, email, created_at) VALUES ('a9000000-0000-4000-8000-000000000011', 'proprio@l9.exemple.test', '2026-08-01T00:00:00Z');
    INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('a9000000-0000-4000-8000-000000000001', 'a9000000-0000-4000-8000-000000000011', 'owner');
    INSERT INTO brands (id, workspace_id, name, created_at) SELECT md5('b' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'Marque ' || i, '2026-08-01T00:00:00Z' FROM generate_series(1, 5) i;
    INSERT INTO personas (id, brand_id, name) VALUES (md5('p')::uuid, md5('b1')::uuid, 'Persona');
    INSERT INTO adsmap_desires (id, workspace_id, persona_id, label, created_at, updated_at) VALUES (md5('d')::uuid, 'a9000000-0000-4000-8000-000000000001', md5('p')::uuid, 'Désir', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    INSERT INTO adsmap_angles (id, workspace_id, desire_id, label, mechanism, created_at, updated_at) VALUES (md5('a')::uuid, 'a9000000-0000-4000-8000-000000000001', md5('d')::uuid, 'Angle', 'demo', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    INSERT INTO adsmap_concepts (id, workspace_id, angle_id, title, created_at, updated_at) VALUES (md5('c')::uuid, 'a9000000-0000-4000-8000-000000000001', md5('a')::uuid, 'Concept', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z');
    INSERT INTO adsmap_ads (id, workspace_id, concept_id, variant_code, created_at, updated_at) SELECT md5('ad' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('c')::uuid, 'V' || i, '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z' FROM generate_series(1, 30) i;
    INSERT INTO generations (id, brand_id, kind, input_json, status, created_at) SELECT md5('g' || i)::uuid, md5('b1')::uuid, 'ad', jsonb_build_object('headline', 'Pub ' || i), 'done', '2026-08-01T00:00:00Z' FROM generate_series(1, 40) i;
    INSERT INTO assets (id, workspace_id, brand_id, name, url, created_at) SELECT md5('m' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'Média ' || i, 'data:image/png;base64,AAAA' || i, '2026-08-01T00:00:00Z' FROM generate_series(1, 20) i;
    INSERT INTO ai_spend (id, workspace_id, provider, action, estimated_usd, actual_usd, created_at)
      SELECT md5('s' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', 'anthropic', 'ads.generate', i / 1000.0, i / 1100.0, timestamptz '2026-09-01T00:00:00Z' + (i || ' minutes')::interval FROM generate_series(1, 200) i;
  `);
  return pg;
}

async function lignes<T>(pg: PGlite, sql: string): Promise<T[]> {
  return (await pg.query<T>(sql)).rows;
}

/** Empreinte des données des tables EXISTANTES, restreinte à leurs colonnes d'avant. */
async function empreinteDonnees(pg: PGlite, colonnes: Map<string, string>): Promise<string[]> {
  const out: string[] = [];
  for (const [t, cols] of colonnes) {
    const [r] = await lignes<{ n: number; h: string }>(pg, `select count(*)::int as n, md5(coalesce(string_agg(h, ',' order by h), '')) as h from (select md5(row(${cols})::text) as h from public."${t}") s`);
    out.push(`${t}|${r!.n}|${r!.h}`);
  }
  return out;
}

async function colonnesDe(pg: PGlite): Promise<Map<string, string>> {
  const rs = await lignes<{ t: string; c: string }>(pg, `
    select c.relname as t, string_agg(quote_ident(a.attname), ',' order by a.attnum) as c
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r' group by c.relname order by c.relname`);
  return new Map(rs.map((r) => [r.t, r.c]));
}

async function empreinteSchema(pg: PGlite): Promise<string[]> {
  const rs = await lignes<{ l: string }>(pg, `
    select 'col ' || c.relname || '.' || a.attname || ' ' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then ' NN' else '' end as l
    from pg_class c join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
    where n.nspname = 'public' and c.relkind = 'r'
    union all select 'con ' || conrelid::regclass::text || '.' || conname || ' ' || pg_get_constraintdef(oid) from pg_constraint where connamespace = 'public'::regnamespace
    union all select 'idx ' || pg_get_indexdef(i.indexrelid) from pg_index i join pg_class c on c.oid = i.indexrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public'
    union all select 'trg ' || pg_get_triggerdef(t.oid) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where not t.tgisinternal and n.nspname = 'public'
    union all select 'fn ' || p.proname || ' ' || md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
    order by 1`);
  return rs.map((r) => r.l);
}

async function appliquer(pg: PGlite, tags: readonly string[]) {
  for (const tag of tags) await pg.exec(preparer(fichier(tag)));
}

// Une ou deux bases pglite par test, 56 migrations chacune. Mesuré le 9 octobre sur 4 cœurs : 10 et 11 s seul
// (charge 20), 28 et 36 s dans la suite complète (charge ~30), au-delà des 30 s par défaut. Limite explicite, marge x3.
describe('base réelle en mémoire · appliquer, rejouer, reprendre après interruption', () => {
  it('lignes existantes intactes, nouvelles tables vides, colonne ajoutée vide · rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);

    await appliquer(pg, NOUVELLES);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0054/0055').toEqual(avant);
    const nouvelles = [...(await colonnesDe(pg)).keys()].filter((t) => !avantCols.has(t));
    expect(nouvelles).toHaveLength(21);
    for (const t of nouvelles) {
      const [r] = await lignes<{ n: number }>(pg, `select count(*)::int as n from "${t}"`);
      expect(r!.n, `backfill dans ${t}`).toBe(0);
    }
    const [rc] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from ai_spend where reconcile_reason is not null');
    expect(rc!.n).toBe(0);

    const schemaUneFois = await empreinteSchema(pg);
    const toutUneFois = await empreinteDonnees(pg, await colonnesDe(pg));
    await appliquer(pg, NOUVELLES);
    await appliquer(pg, NOUVELLES);
    expect(await empreinteSchema(pg), 'rejeu · objet ajouté ou dupliqué').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, await colonnesDe(pg)), 'rejeu · lignes modifiées').toEqual(toutUneFois);
    await pg.close();
  }, 120_000);

  it('interruption au milieu de 0054 (moitié des instructions passées) puis reprise · même base que d’un seul trait', async () => {
    const propre = await baseJusqua0053();
    await appliquer(propre, NOUVELLES);
    const schemaPropre = await empreinteSchema(propre);
    const donneesPropres = await empreinteDonnees(propre, await colonnesDe(propre));
    await propre.close();

    const pg = await baseJusqua0053();
    const instr = decouperInstructionsSql(fichier('0054_studios_fondations'));
    const moitie = Math.floor(instr.length / 2);
    for (const s of instr.slice(0, moitie)) await pg.exec(preparer(`${s};`));
    // La reprise rejoue TOUT 0054 puis 0055, comme le migrateur qui n'a rien inscrit au journal.
    await appliquer(pg, NOUVELLES);
    expect(await empreinteSchema(pg), 'reprise · schéma différent d’une application d’un seul trait').toEqual(schemaPropre);
    expect(await empreinteDonnees(pg, await colonnesDe(pg)), 'reprise · lignes différentes').toEqual(donneesPropres);
    await pg.close();
  }, 120_000);

  it('0066 sur une base à 0065 avec des marques · lignes intactes, colonne ajoutée NULL partout, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 65).map((x) => x.tag));
    await pg.exec(`INSERT INTO brands (id, workspace_id, name, logo_url, logos) VALUES ('a9000000-0000-4000-8000-0000000000b1', 'a9000000-0000-4000-8000-000000000001', 'Marque L9', 'https://site.exemple.fr/logo.png', ARRAY['https://site.exemple.fr/logo.png'])`);
    const [marques] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from brands');
    expect(marques!.n).toBeGreaterThan(1);
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    await appliquer(pg, ['0066_empreinte_logos_marque']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0066').toEqual(avant);
    expect((await colonnesDe(pg)).get('brands')).toMatch(/,logo_empreintes_json$/);
    const [n] = await lignes<{ n: number; nn: number }>(pg, 'select count(*)::int as n, count(logo_empreintes_json)::int as nn from brands');
    expect(n).toEqual({ n: marques!.n, nn: 0 });
    const schemaUneFois = await empreinteSchema(pg);
    await appliquer(pg, ['0066_empreinte_logos_marque']);
    expect(await empreinteSchema(pg), 'rejeu de 0066').toEqual(schemaUneFois);
    await pg.close();
  }, 120_000);

  it('0068 sur une base à 0067 avec des ads · lignes intactes, trois colonnes NULL partout, bornes posées, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 67).map((x) => x.tag));
    const [ads] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from adsmap_ads');
    expect(ads!.n).toBeGreaterThan(0);
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0068_estimation_hypotheses']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0068').toEqual(avant);
    expect((await colonnesDe(pg)).get('adsmap_ads')).toMatch(/,ice_impact,ice_confidence,ice_effort$/);
    const [n] = await lignes<{ n: number; nn: number }>(pg, 'select count(*)::int as n, count(coalesce(ice_impact, ice_confidence, ice_effort))::int as nn from adsmap_ads');
    expect(n).toEqual({ n: ads!.n, nn: 0 });
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0068').toEqual([]);
    // La borne tient en base · une note hors échelle est refusée par Postgres.
    await expect(pg.exec(`UPDATE adsmap_ads SET ice_effort = 4 WHERE id = md5('ad1')::uuid`)).rejects.toThrow(/check constraint/i);
    await appliquer(pg, ['0068_estimation_hypotheses']);
    expect(await empreinteSchema(pg), 'rejeu de 0068').toEqual(schemaUneFois);
    await pg.close();
  }, 120_000);

  it('0069 sur une base à 0068 avec des marques et des ads · lignes intactes, tables neuves vides, colonne NULL partout, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 68).map((x) => x.tag));
    const [marques] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from brands');
    expect(marques!.n).toBeGreaterThan(0);
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0069_mesures_csv_remontees']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0069').toEqual(avant);
    expect((await colonnesDe(pg)).get('brands')).toMatch(/,adsmap_remontee_suspendue_le$/);
    for (const t of ['adsmap_mesures_csv', 'adsmap_remontees']) {
      const [r] = await lignes<{ n: number }>(pg, `select count(*)::int as n from "${t}"`);
      expect(r!.n, `backfill dans ${t}`).toBe(0);
    }
    const [n] = await lignes<{ n: number; nn: number }>(pg, 'select count(*)::int as n, count(adsmap_remontee_suspendue_le)::int as nn from brands');
    expect(n).toEqual({ n: marques!.n, nn: 0 });
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0069').toEqual([]);
    await appliquer(pg, ['0069_mesures_csv_remontees']);
    expect(await empreinteSchema(pg), 'rejeu de 0069').toEqual(schemaUneFois);
    await pg.close();
  }, 120_000);

  it('0070 sur une base à 0069 avec des sauvegardes notées et rangées · lignes intactes, tables neuves vides, unicité par vocabulaire, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 69).map((x) => x.tag));
    await pg.exec(`INSERT INTO saved_ads (id, workspace_id, brand_id, platform, external_id, snapshot_json, note, folder, created_at)
      SELECT md5('sv' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'meta', 'ext-' || i, '{}'::jsonb, 'note ' || i, 'Hooks', '2026-08-01T00:00:00Z' FROM generate_series(1, 12) i`);
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0070_veille_tags_notes']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0070 (note, dossier…)').toEqual(avant);
    for (const t of ['veille_tags', 'veille_tags_sauvegardes', 'saved_ad_collections']) {
      const [r] = await lignes<{ n: number }>(pg, `select count(*)::int as n from "${t}"`);
      expect(r!.n, `backfill dans ${t}`).toBe(0);
    }
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0070').toEqual([]);
    expect(schemaUneFois.filter((l) => !schemaAvant.includes(l) && l.startsWith('col ') && !/^col (veille_tags|veille_tags_sauvegardes|saved_ad_collections)\./.test(l)), 'colonne ajoutée à une table existante').toEqual([]);
    // L'unicité tient dans un vocabulaire (même marque), pas d'une marque à l'autre, et un NULL de marque a la sienne.
    await pg.exec(`INSERT INTO veille_tags (workspace_id, brand_id, name, name_key) VALUES ('a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'Hook UGC', 'hook ugc')`);
    await expect(pg.exec(`INSERT INTO veille_tags (workspace_id, brand_id, name, name_key) VALUES ('a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'hook ugc', 'hook ugc')`)).rejects.toThrow(/unique/i);
    await pg.exec(`INSERT INTO veille_tags (workspace_id, brand_id, name, name_key) VALUES ('a9000000-0000-4000-8000-000000000001', md5('b2')::uuid, 'Hook UGC', 'hook ugc')`);
    await pg.exec(`INSERT INTO veille_tags (workspace_id, brand_id, name, name_key) VALUES ('a9000000-0000-4000-8000-000000000001', NULL, 'Hook UGC', 'hook ugc')`);
    await expect(pg.exec(`INSERT INTO veille_tags (workspace_id, brand_id, name, name_key) VALUES ('a9000000-0000-4000-8000-000000000001', NULL, 'HOOK UGC', 'hook ugc')`)).rejects.toThrow(/unique/i);
    await pg.exec(`DELETE FROM veille_tags`);
    await appliquer(pg, ['0070_veille_tags_notes']);
    expect(await empreinteSchema(pg), 'rejeu de 0070').toEqual(schemaUneFois);
    await pg.close();
  }, 120_000);

  it('0071 sur une base à 0070 avec des personas existants (et leur graphe) · lignes intactes, deux colonnes NULL partout, un index, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 70).map((x) => x.tag));
    await pg.exec(`INSERT INTO personas (id, brand_id, name, description, pains, desires, objections, status)
      SELECT md5('pl9' || i)::uuid, md5('b' || (1 + i % 3))::uuid, 'Persona ' || i, 'Qui ' || i, ARRAY['frein ' || i], ARRAY['désir ' || i], ARRAY['objection ' || i], CASE WHEN i % 2 = 0 THEN 'proposed' ELSE 'validated' END FROM generate_series(1, 9) i`);
    const [personas] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from personas');
    expect(personas!.n).toBe(10);
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0071_personas_rang_segment']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0071 (nom, désirs, statut…)').toEqual(avant);
    expect((await colonnesDe(pg)).get('personas')).toMatch(/,rank,segment$/);
    const [n] = await lignes<{ n: number; rang: number; seg: number }>(pg, 'select count(*)::int as n, count(rank)::int as rang, count(segment)::int as seg from personas');
    expect(n, 'un persona existant a reçu un rang ou un segment au passage de 0071').toEqual({ n: 10, rang: 0, seg: 0 });
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0071').toEqual([]);
    const ajoutes = schemaUneFois.filter((l) => !schemaAvant.includes(l));
    expect(ajoutes.map((l) => l.replace(/^(idx) .*"?(personas_brand_rank_idx)"? .*$/, '$1 $2')).sort(), 'objet ajouté par 0071 hors des deux colonnes nullables et de l’index').toEqual([
      'col personas.rank integer', 'col personas.segment text', 'idx personas_brand_rank_idx',
    ]);
    await appliquer(pg, ['0071_personas_rang_segment']);
    expect(await empreinteSchema(pg), 'rejeu de 0071').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, avantCols), 'rejeu de 0071 · lignes modifiées').toEqual(avant);
    await pg.close();
  }, 120_000);

  it('0072 sur une base à 0071 avec des offres existantes (et les ads qui les citent) · lignes intactes, trois colonnes NULL partout, table neuve vide, statut borné, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 71).map((x) => x.tag));
    await pg.exec(`INSERT INTO adsmap_offers (id, workspace_id, brand_id, label, price, discount, guarantee, bundle, active, created_at)
      SELECT md5('of' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('b' || (1 + i % 3))::uuid, 'Offre ' || i, 10 + i, '-' || i || ' %', CASE WHEN i % 2 = 0 THEN '30 jours' END, i % 3 = 0, i % 4 <> 0, '2026-08-01T00:00:00Z' FROM generate_series(1, 8) i;
      UPDATE adsmap_ads SET offer_id = md5('of' || (1 + (substr(variant_code, 2)::int % 8)))::uuid WHERE variant_code ~ '^V[0-9]+$';`);
    const [offres] = await lignes<{ n: number; citees: number }>(pg, 'select (select count(*)::int from adsmap_offers) as n, (select count(*)::int from adsmap_ads where offer_id is not null) as citees');
    expect(offres).toEqual({ n: 8, citees: 30 });
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0072_offres_allegations']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0072 (offres, ads qui les citent…)').toEqual(avant);
    expect((await colonnesDe(pg)).get('adsmap_offers')).toMatch(/,kind,conditions,updated_at$/);
    const [n] = await lignes<{ n: number; nn: number }>(pg, 'select count(*)::int as n, count(coalesce(kind, conditions, updated_at::text))::int as nn from adsmap_offers');
    expect(n, 'une offre existante a reçu un type, des conditions ou une date au passage de 0072').toEqual({ n: 8, nn: 0 });
    const [vide] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from brand_claims');
    expect(vide!.n, 'backfill dans brand_claims').toBe(0);
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0072').toEqual([]);
    expect(schemaUneFois.filter((l) => !schemaAvant.includes(l) && l.startsWith('col ') && !/^col brand_claims\./.test(l)).sort(), 'colonne ajoutée à une table existante hors des trois nullables d’adsmap_offers').toEqual([
      'col adsmap_offers.conditions text', 'col adsmap_offers.kind text', 'col adsmap_offers.updated_at timestamp with time zone',
    ]);
    // Le statut est borné en base · une valeur hors des deux est refusée par Postgres.
    await expect(pg.exec(`INSERT INTO brand_claims (workspace_id, brand_id, text, status) VALUES ('a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'x', 'certifiee')`)).rejects.toThrow(/check constraint/i);
    await pg.exec(`INSERT INTO brand_claims (workspace_id, brand_id, text) VALUES ('a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, 'Hydrate 24 h')`);
    const [defaut] = await lignes<{ status: string }>(pg, 'select status from brand_claims');
    expect(defaut!.status).toBe('a_prouver');
    await pg.exec('DELETE FROM brand_claims');
    await appliquer(pg, ['0072_offres_allegations']);
    expect(await empreinteSchema(pg), 'rejeu de 0072').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, avantCols), 'rejeu de 0072 · lignes modifiées').toEqual(avant);
    await pg.close();
  }, 120_000);

  it('0073 sur une base à 0072 avec des mesures importées, des lots contrôlés (relais cboMeta) et des instances Meta · lignes intactes, deux colonnes NULL partout, deux index partiels, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 72).map((x) => x.tag));
    await pg.exec(`
      INSERT INTO adsmap_batches (id, workspace_id, brand_id, number, status, protocol_check_json, created_at)
        SELECT md5('lot' || i)::uuid, 'a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, i, 'testing',
          jsonb_build_object('compliant', i % 2 = 0, 'violations', '[]'::jsonb, 'cboMeta', jsonb_build_array(md5('ad' || i)::uuid::text)), '2026-08-01T00:00:00Z' FROM generate_series(1, 4) i;
      INSERT INTO adsmap_mesures_csv (ad_id, workspace_id, brand_id, date_debut, date_fin, spend, impressions, link_clicks, purchases, cbo, importe_le)
        SELECT md5('ad' || (1 + i % 30))::uuid, 'a9000000-0000-4000-8000-000000000001', md5('b1')::uuid, date '2026-10-01' + i, date '2026-10-01' + i + (i % 3), 10.25 * i, 100 * i, i, i % 4, i % 5 = 0, '2026-10-20T00:00:00Z' FROM generate_series(1, 60) i;
      INSERT INTO creatives (id, brand_id, fingerprint_hash, type) SELECT md5('cr' || i)::uuid, md5('b1')::uuid, 'f' || i, 'image' FROM generate_series(1, 6) i;
      INSERT INTO ad_instances (id, creative_id, external_ad_id, platform, adset_daily_budget, created_at) SELECT md5('in' || i)::uuid, md5('cr' || i)::uuid, '1202' || i, 'meta', 20 + i, '2026-08-01T00:00:00Z' FROM generate_series(1, 6) i;
      INSERT INTO metrics_daily (ad_instance_id, date, spend, impressions) SELECT md5('in' || (1 + i % 6))::uuid, date '2026-10-01' + (i / 6), 3.5 * i, 10 * i FROM generate_series(0, 59) i;`);
    const [n0] = await lignes<{ m: number; l: number; i: number }>(pg, 'select (select count(*)::int from adsmap_mesures_csv) as m, (select count(*)::int from adsmap_batches) as l, (select count(*)::int from ad_instances) as i');
    expect(n0).toEqual({ m: 60, l: 4, i: 6 });
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0073_mesures_retenues_cbo']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0073 (mesures, lots et leur relais, instances, journées)').toEqual(avant);
    expect((await colonnesDe(pg)).get('adsmap_mesures_csv')).toMatch(/,retenue$/);
    expect((await colonnesDe(pg)).get('ad_instances')).toMatch(/,campaign_budget_optimization$/);
    const [n] = await lignes<{ m: number; marquees: number; i: number; cbo: number }>(pg, 'select (select count(*)::int from adsmap_mesures_csv) as m, (select count(retenue)::int from adsmap_mesures_csv) as marquees, (select count(*)::int from ad_instances) as i, (select count(campaign_budget_optimization)::int from ad_instances) as cbo');
    expect(n, 'une mesure existante a reçu une marque, ou une instance un CBO, au passage de 0073 (backfill)').toEqual({ m: 60, marquees: 0, i: 6, cbo: 0 });
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0073').toEqual([]);
    const ajoutes = schemaUneFois.filter((l) => !schemaAvant.includes(l));
    expect(ajoutes.map((l) => l.replace(/^(idx) .*"?(adsmap_mesures_csv_(?:retenue|a_marquer)_idx)"? .* WHERE (.*)$/, '$1 $2 $3')).sort(), 'objet ajouté par 0073 hors des deux colonnes nullables et des deux index partiels').toEqual([
      'col ad_instances.campaign_budget_optimization boolean', 'col adsmap_mesures_csv.retenue boolean',
      'idx adsmap_mesures_csv_a_marquer_idx (retenue IS NULL)', 'idx adsmap_mesures_csv_retenue_idx (retenue = true)',
    ]);
    // Le relais des lots déjà contrôlés est intact · le contrôle du lot le relira tant que l'instance ne porte pas son CBO.
    const relais = await lignes<{ r: string }>(pg, `select protocol_check_json->'cboMeta'->>0 as r from adsmap_batches order by number`);
    expect(relais.map((x) => x.r)).toEqual([1, 2, 3, 4].map(() => expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown as string));
    await appliquer(pg, ['0073_mesures_retenues_cbo']);
    expect(await empreinteSchema(pg), 'rejeu de 0073').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, avantCols), 'rejeu de 0073 · lignes modifiées').toEqual(avant);
    await pg.close();
  }, 120_000);

  it('0074 sur une base à 0073 avec des projets existants (versions, médias, journal d’audit) · lignes intactes, table neuve vide, cible et longueur bornées en base, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 73).map((x) => x.tag));
    const ws = 'a9000000-0000-4000-8000-000000000001';
    const u = 'a9000000-0000-4000-8000-000000000011';
    await pg.exec(`
      INSERT INTO studio_projects (id, workspace_id, brand_id, kind, title, owner_id, created_at, updated_at)
        SELECT md5('pj' || i)::uuid, '${ws}', md5('b1')::uuid, 'image', 'Projet ' || i, '${u}', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z' FROM generate_series(1, 3) i;
      INSERT INTO studio_project_versions (id, project_id, workspace_id, brand_id, n, schema_version, content, content_hash, author_id, reason, created_at)
        SELECT md5('pv' || i || '-' || n)::uuid, md5('pj' || i)::uuid, '${ws}', md5('b1')::uuid, n, 1, '{}'::jsonb, md5('h' || i || n) || md5('x' || i || n), '${u}', 'version ' || n, '2026-08-01T00:00:00Z' FROM generate_series(1, 3) i, generate_series(1, 2) n;
      UPDATE studio_projects SET current_version_id = md5('pv' || substr(title, 8) || '-2')::uuid;
      INSERT INTO studio_assets (id, workspace_id, brand_id, project_id, storage_key, mime, bytes, sha256, origin, storage_state, created_at)
        SELECT md5('sa' || i)::uuid, '${ws}', md5('b1')::uuid, md5('pj' || (1 + i % 3))::uuid, 'k/' || i, 'image/png', 10, encode(sha256(('s' || i)::bytea), 'hex'), 'generated', 'stored', '2026-08-01T00:00:00Z' FROM generate_series(1, 6) i;
      INSERT INTO studio_audit_events (occurred_at, actor_id, effective_role, workspace_id, brand_id, action, target_type, target_id, reason, trace_id)
        SELECT '2026-08-01T00:00:00Z', '${u}', 'espace:owner', '${ws}', md5('b1')::uuid, 'project.rename', 'studio_project', md5('pj' || i)::uuid::text, 'Projet renommé', 'st_' || i FROM generate_series(1, 3) i;`);
    const [n0] = await lignes<{ p: number; v: number; a: number; e: number }>(pg, 'select (select count(*)::int from studio_projects) as p, (select count(*)::int from studio_project_versions) as v, (select count(*)::int from studio_assets) as a, (select count(*)::int from studio_audit_events) as e');
    expect(n0).toEqual({ p: 3, v: 6, a: 6, e: 3 });
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0074_commentaires_projet']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0074 (projets, versions, médias, journal…)').toEqual(avant);
    const [vide] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from studio_comments');
    expect(vide!.n, 'backfill dans studio_comments').toBe(0);
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0074').toEqual([]);
    expect(schemaUneFois.filter((l) => !schemaAvant.includes(l) && l.startsWith('col ') && !/^col studio_comments\./.test(l)), 'colonne ajoutée à une table existante par 0074').toEqual([]);
    // Bornes posées par Postgres · une version d'un AUTRE projet, deux cibles, aucune cible, un texte vide ou trop long sont refusés.
    const ins = (cols: string) => pg.exec(`INSERT INTO studio_comments (workspace_id, brand_id, project_id, target_type, version_id, asset_id, author_id, body) VALUES (${cols})`);
    await expect(ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'version', md5('pv2-1')::uuid, null, '${u}', 'x'`), 'version d’un autre projet').rejects.toThrow(/foreign key/i);
    await expect(ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'version', md5('pv1-1')::uuid, md5('sa3')::uuid, '${u}', 'x'`), 'deux cibles').rejects.toThrow(/check constraint/i);
    await expect(ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'creation', null, null, '${u}', 'x'`), 'aucune cible').rejects.toThrow(/check constraint/i);
    await expect(ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'version', md5('pv1-1')::uuid, null, '${u}', ''`), 'texte vide').rejects.toThrow(/check constraint/i);
    await expect(ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'version', md5('pv1-1')::uuid, null, '${u}', repeat('a', 2001)`), 'texte trop long').rejects.toThrow(/check constraint/i);
    await expect(ins(`'${ws}', md5('b2')::uuid, md5('pj1')::uuid, 'version', md5('pv1-1')::uuid, null, '${u}', 'x'`), 'autre marque que celle du projet').rejects.toThrow(/foreign key/i);
    await ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'version', md5('pv1-1')::uuid, null, '${u}', 'Le titre est trop long'`);
    await ins(`'${ws}', md5('b1')::uuid, md5('pj1')::uuid, 'creation', null, md5('sa3')::uuid, '${u}', 'Produit flou'`);
    const [deux] = await lignes<{ n: number; h: string }>(pg, `select count(*)::int as n, string_agg(distinct history::text, ',') as h from studio_comments`);
    expect(deux).toEqual({ n: 2, h: '[]' });
    await pg.exec('DELETE FROM studio_comments');
    await appliquer(pg, ['0074_commentaires_projet']);
    expect(await empreinteSchema(pg), 'rejeu de 0074').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, avantCols), 'rejeu de 0074 · lignes modifiées').toEqual(avant);
    await pg.close();
  }, 120_000);

  it('0075 sur une base à 0074 avec des espaces, des membres, des échecs journalisés et des commentaires · lignes intactes, table neuve vide, bornes posées, suppression refusée, rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 74).map((x) => x.tag));
    const u = 'a9000000-0000-4000-8000-000000000011';
    await pg.exec(`
      INSERT INTO error_log (id, scope, family, detail, workspace_id, created_at)
        SELECT md5('el' || i)::uuid, 'studio:image', 'quota', 'Quota dépassé ' || i, 'a9000000-0000-4000-8000-000000000001', '2026-08-01T00:00:00Z' FROM generate_series(1, 12) i;
      INSERT INTO users (id, email, created_at) VALUES ('a9000000-0000-4000-8000-000000000012', 'second@l9.exemple.test', '2026-08-01T00:00:00Z');`);
    const [n0] = await lignes<{ e: number; u: number; w: number }>(pg, 'select (select count(*)::int from error_log) as e, (select count(*)::int from users) as u, (select count(*)::int from workspaces) as w');
    expect(n0).toEqual({ e: 12, u: 2, w: 1 });
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0075_incidents_plateforme']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0075 (espaces, membres, journal des échecs…)').toEqual(avant);
    const [vide] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from platform_incidents');
    expect(vide!.n, 'backfill dans platform_incidents').toBe(0);
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0075').toEqual([]);
    expect(schemaUneFois.filter((l) => !schemaAvant.includes(l) && l.startsWith('col ') && !/^col platform_incidents\./.test(l)), 'colonne ajoutée à une table existante par 0075').toEqual([]);
    const ins = (cols: string) => pg.exec(`INSERT INTO platform_incidents (title, severity, description, status, closed_at, resolution, notes, opened_by) VALUES (${cols})`);
    // Le refus attendu, ou le nom de la borne qui a laissé passer · lisible dans l'échec.
    const refuse = async (p: Promise<unknown>, nom: string, motif: RegExp = /check constraint/i) => {
      const e = await p.then(() => null, (x: Error) => x);
      expect(e?.message ?? `${nom} · accepté par la base`, nom).toMatch(motif);
    };
    await refuse(ins(`'', 'majeure', 'x', 'ouvert', null, null, '[]', '${u}'`), 'titre vide');
    await refuse(ins(`repeat('a', 141), 'majeure', 'x', 'ouvert', null, null, '[]', '${u}'`), 'titre trop long');
    await refuse(ins(`'T', 'grave', 'x', 'ouvert', null, null, '[]', '${u}'`), 'gravité inconnue');
    await refuse(ins(`'T', 'majeure', repeat('a', 2001), 'ouvert', null, null, '[]', '${u}'`), 'constat trop long');
    await refuse(ins(`'T', 'majeure', 'x', 'ouvert', null, null, '{}', '${u}'`), 'notes hors tableau');
    await refuse(ins(`'T', 'majeure', 'x', 'clos', now(), null, '[]', '${u}'`), 'clos sans résolution');
    await refuse(ins(`'T', 'majeure', 'x', 'ouvert', now(), 'r', '[]', '${u}'`), 'ouvert avec une clôture');
    await refuse(ins(`'T', 'majeure', 'x', 'en_cours', null, null, '[]', '${u}'`), 'statut inconnu');
    await ins(`'Quota fal épuisé', 'critique', 'Les images échouent', 'ouvert', null, null, '[]', '${u}'`);
    await ins(`'Lenteur Anthropic', 'mineure', 'Réponses lentes', 'clos', now(), 'Transitoire', '[{"texte":"vu","auteur":null,"le":"2026-08-01T00:00:00Z"}]', '${u}'`);
    // Jamais supprimé · ni ligne à ligne, ni par vidage · l'auteur supprimé laisse l'incident (SET NULL).
    await refuse(pg.exec('DELETE FROM platform_incidents'), 'suppression', /INCIDENT_JAMAIS_SUPPRIME · DELETE refusé sur platform_incidents/);
    await refuse(pg.exec('TRUNCATE platform_incidents'), 'vidage', /INCIDENT_JAMAIS_SUPPRIME · TRUNCATE refusé sur platform_incidents/);
    await pg.exec(`UPDATE platform_incidents SET status = 'clos', closed_at = now(), resolution = 'Recharge faite' WHERE title = 'Quota fal épuisé'`);
    const [deux] = await lignes<{ n: number; clos: number }>(pg, `select count(*)::int as n, count(*) filter (where status = 'clos')::int as clos from platform_incidents`);
    expect(deux).toEqual({ n: 2, clos: 2 });
    await appliquer(pg, ['0075_incidents_plateforme']);
    expect(await empreinteSchema(pg), 'rejeu de 0075').toEqual(schemaUneFois);
    expect(await empreinteDonnees(pg, avantCols), 'rejeu de 0075 · lignes modifiées').toEqual(avant);
    const [apres] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from platform_incidents');
    expect(apres!.n, 'rejeu de 0075 · incidents perdus ou doublés').toBe(2);
    await pg.close();
  }, 120_000);

  it('0067 sur une base à 0066 avec des médias · lignes intactes, un seul objet ajouté (l’index), rejeu sans effet', async () => {
    const pg = await baseJusqua0053();
    await appliquer(pg, journal.entries.filter((x) => x.idx > 53 && x.idx <= 66).map((x) => x.tag));
    const [medias] = await lignes<{ n: number }>(pg, 'select count(*)::int as n from assets');
    expect(medias!.n).toBeGreaterThan(0);
    const avantCols = await colonnesDe(pg);
    const avant = await empreinteDonnees(pg, avantCols);
    const schemaAvant = await empreinteSchema(pg);
    await appliquer(pg, ['0067_index_pagination_assets']);
    expect(await empreinteDonnees(pg, avantCols), 'lignes existantes modifiées par 0067').toEqual(avant);
    const schemaUneFois = await empreinteSchema(pg);
    expect(schemaUneFois.filter((l) => !schemaAvant.includes(l))).toEqual(['idx CREATE INDEX assets_ws_created_id_idx ON public.assets USING btree (workspace_id, created_at DESC, id DESC)']);
    expect(schemaAvant.filter((l) => !schemaUneFois.includes(l)), 'objet retiré par 0067').toEqual([]);
    await appliquer(pg, ['0067_index_pagination_assets']);
    expect(await empreinteSchema(pg), 'rejeu de 0067').toEqual(schemaUneFois);
    await pg.close();
  }, 120_000);
});
