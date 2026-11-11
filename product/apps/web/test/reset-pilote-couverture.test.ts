import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseMigreeNeuve } from './helpers/pg-memoire';

/**
 * `ops/migration/reset-pilote.sql` · la remise à zéro d'un pilote, lancée par
 * le PROPRIÉTAIRE sur le VPS (jamais par la session). Le script vide les
 * tables Studios à la main (clés « restrict »), puis supprime les marques et
 * laisse la cascade emporter le reste.
 *
 * Défaut trouvé à la relecture des migrations 0074 (commentaires) et 0076
 * (notes de la lignée) · ces tables pointent les projets en « restrict » sans
 * que le script les vide · la remise à zéro aurait échoué dès le premier
 * commentaire (toute la transaction annulée). Et la 0076 refuse toute
 * suppression par déclencheur.
 *
 * Cette garde ne tient AUCUNE liste à la main · elle applique TOUTES les
 * migrations sur une base neuve, lit les vraies clés étrangères et les vrais
 * déclencheurs, puis exige du script :
 *  1 · toute table qui pointe en « restrict » une table supprimée (à la main
 *      ou par cascade depuis `brands`) est vidée par le script AVANT sa mère ;
 *     ou bien son pointeur est remis à NULL par le script (boucle projet ⇄
 *     version), ou bien le script REFUSE avant toute suppression quand elle a
 *     des lignes pour une marque ciblée (prompts propres à une marque, que le
 *     script préserve · bloc `prompts_de_marque` placé avant `BEGIN`) ;
 *  2 · toute table supprimée qui porte un déclencheur utilisateur « avant
 *      suppression » est soit désactivée (`DISABLE TRIGGER USER`), soit
 *      ouverte par le réglage de purge que le script pose (`SET LOCAL
 *      tiktrends.purge_pilote = 'oui'`) et que sa fonction honore.
 * Toute migration future qui ajoute une table bloquante fait tomber ce test.
 */
const SCRIPT = readFileSync(join(__dirname, '../../../ops/migration/reset-pilote.sql'), 'utf8');

function lireScript(sql: string) {
  const sans = sql.replace(/--[^\n]*/g, '');
  const ordre = [...sans.matchAll(/DELETE FROM ([a-z_0-9]+)/g)].map((m) => m[1]!);
  const desactivees = new Set([...sans.matchAll(/ALTER TABLE ([a-z_0-9]+)\s+DISABLE TRIGGER USER/g)].map((m) => m[1]!));
  const purge = /SET LOCAL tiktrends\.purge_pilote = 'oui'/.test(sans);
  const posePurgeAvant = (t: string) => purge && sans.indexOf("SET LOCAL tiktrends.purge_pilote = 'oui'") < sans.indexOf(`DELETE FROM ${t} `);
  const debut = sans.indexOf('BEGIN;');
  const misANull = (t: string, col: string) => new RegExp(`UPDATE ${t} SET ${col} = NULL WHERE brand_id IN`).test(sans);
  // Refus préalable · le calcul de `prompts_de_marque` cite la table, il est suivi d'un `\quit` sous `\if :prompts_de_marque`, le tout AVANT `BEGIN`.
  const calcul = /SELECT CASE WHEN([\s\S]*?)AS prompts_de_marque \\gset/.exec(sans);
  const blocRefus = /\\if :prompts_de_marque[\s\S]*?\\quit[\s\S]*?\\endif/.exec(sans);
  const refuseAvant = (t: string) => !!calcul && !!blocRefus && calcul.index < debut && blocRefus.index < debut && blocRefus.index > calcul.index
    && new RegExp(`FROM ${t}\\s+WHERE brand_id IN \\(SELECT id FROM cible_marques\\)`).test(calcul[1]!);
  return { ordre, desactivees, posePurgeAvant, misANull, refuseAvant };
}

describe('reset-pilote · le script vide tout ce qui bloquerait la suppression d’une marque', () => {
  it('clés « restrict » et déclencheurs anti-suppression, lus dans le vrai schéma', async () => {
    const pg = await baseMigreeNeuve();
    const fk = (await pg.query<{ fille: string; mere: string; regle: string; colonnes: string[] }>(`
      SELECT c.conrelid::regclass::text AS fille, c.confrelid::regclass::text AS mere, c.confdeltype AS regle,
             array(SELECT a.attname::text FROM unnest(c.conkey) k JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k) AS colonnes
      FROM pg_constraint c WHERE c.contype = 'f'`)).rows;
    const decl = (await pg.query<{ table_: string; fonction: string; source: string }>(`
      SELECT t.tgrelid::regclass::text AS table_, p.proname AS fonction, p.prosrc AS source
      FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
      WHERE NOT t.tgisinternal AND (t.tgtype & 8) = 8`)).rows; // 8 = DELETE
    await pg.close();

    const { ordre, desactivees, posePurgeAvant, misANull, refuseAvant } = lireScript(SCRIPT);
    const position = (t: string) => ordre.indexOf(t);
    expect(position('brands'), 'le script ne supprime plus les marques · revoir cette garde').toBeGreaterThan(-1);

    // Tables emportées · vidées à la main, plus la cascade depuis elles (fermeture).
    const emportees = new Set(ordre);
    for (let change = true; change;) {
      change = false;
      for (const f of fk) if (f.regle === 'c' && emportees.has(f.mere) && !emportees.has(f.fille)) { emportees.add(f.fille); change = true; }
    }
    // Moment où une table disparaît · sa position si vidée à la main, sinon celle de `brands` (cascade).
    const quand = (t: string) => (position(t) >= 0 ? position(t) : position('brands'));

    const bloquantes: string[] = [];
    for (const f of fk) {
      if (!(f.regle === 'r' || f.regle === 'a') || !emportees.has(f.mere) || f.fille === f.mere) continue;
      if (position(f.fille) >= 0 && position(f.fille) < quand(f.mere)) continue;
      // Boucle projet ⇄ version · une colonne de la clé (le pointeur) est remise à NULL, la clé ne contraint plus rien.
      if (f.colonnes.some((c) => misANull(f.fille, c))) continue;
      if (refuseAvant(f.fille)) continue;
      bloquantes.push(`${f.fille} → ${f.mere}`);
    }
    expect([...new Set(bloquantes)].sort(), 'tables qui pointent en « restrict » une table supprimée sans être vidées avant elle par reset-pilote.sql').toEqual([]);

    const verrouillees: string[] = [];
    for (const d of decl) {
      if (!emportees.has(d.table_) || desactivees.has(d.table_)) continue;
      const honore = /tiktrends\.purge_pilote/.test(d.source);
      if (!(honore && posePurgeAvant(d.table_))) verrouillees.push(`${d.table_} (${d.fonction})`);
    }
    expect(verrouillees.sort(), 'tables à déclencheur anti-suppression ni désactivées ni ouvertes par la purge du pilote').toEqual([]);
  }, 120_000);

  it('le bloc de suppression s’exécute réellement (SQL valide, purge acceptée, déclencheurs rétablis) sur une base migrée neuve', async () => {
    const pg = await baseMigreeNeuve();
    const sans = SCRIPT.replace(/--[^\n]*/g, '');
    const debut = sans.indexOf('BEGIN;');
    const fin = sans.indexOf('\\echo', sans.lastIndexOf('ENABLE TRIGGER USER'));
    expect(debut, 'BEGIN introuvable').toBeGreaterThan(-1);
    const bloc = sans.slice(debut, fin);
    expect(bloc, 'le bloc contient encore une commande psql').not.toMatch(/^\s*\\/m);
    await pg.exec('CREATE TEMP TABLE cible_marques (id uuid, workspace_id uuid, name text)');
    await pg.exec(bloc + '\nCOMMIT;');
    // Déclencheurs rétablis, et le réglage de purge mort avec la transaction.
    const [d] = (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'`)).rows;
    expect(d?.n, 'des déclencheurs restent désactivés après le script').toBe(0);
    const [r] = (await pg.query<{ v: string | null }>(`SELECT current_setting('tiktrends.purge_pilote', true) AS v`)).rows;
    expect(r?.v ?? '', 'le réglage de purge survit à la transaction').not.toBe('oui');
    await pg.close();
  }, 120_000);
});
