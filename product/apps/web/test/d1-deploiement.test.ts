import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyserMigrationSql, decouperInstructionsSql, type EntreeJournalMigration } from '@tiktrends/core';

/**
 * Studios v1.0 · D1 · le déploiement construit, migre, vérifie, PUIS active.
 *
 * Avant, `ops/deploy.sh` lançait `docker compose up -d --build` AVANT les
 * migrations : le nouveau code tournait sur l'ancien schéma (L9-A : écrans
 * Studios en 42P01), et un échec de migration le laissait servi. Codex :
 * « échec migration ⇒ ancienne version reste active ».
 *
 * Pas de démon Docker ici. On exécute donc le VRAI `deploy.sh` (banc
 * `ops/test-deploiement/banc.sh`) dans un monde git temporaire, avec de faux
 * `docker`, `git` et `sleep` qui JOURNALISENT chaque appel, son étape et son
 * issue. On vérifie le RÉSULTAT sur ce journal et sur le marqueur :
 *   · jamais d'activation (`up` qui recrée) avant une migration réussie suivie
 *     d'une vérification réussie ;
 *   · un échec ⇒ aucune activation, marqueur inchangé, la bonne cause écrite ;
 *   · un succès ⇒ construction → base → migration → vérification → activation,
 *     puis marqueur.
 *
 * Les MUTANTS en bas rejouent les régressions sur une copie du script (l'ancien
 * ordre, un échec de migration ignoré, la vérification retirée…) : chaque
 * mutant DOIT être vu, avec sa phrase. Une garde qui ne les voit pas regarde la
 * mauvaise chose.
 *
 * Ce banc ne prouve pas que Docker se comporte comme simulé (recréation des
 * conteneurs dont l'image a changé, réseau du conteneur éphémère) : procédure
 * réelle sur copie isolée dans `ops/README.md`, « Déploiement ».
 */

const PRODUIT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const BANC = join(PRODUIT, 'ops/test-deploiement/banc.sh');
const DEPLOY = join(PRODUIT, 'ops/deploy.sh');
const SOURCE_DEPLOY = readFileSync(DEPLOY, 'utf8');

interface Ligne { etape: string; commande: string; buildSha?: string; projet?: string; issue?: 'ok' | 'ko' }
interface Passage { journal: Ligne[]; resultat: Record<string, string>; sortie: string }

function lancerBanc(scenario: string, deploy = DEPLOY): Passage {
  const dir = mkdtempSync(join(tmpdir(), `d1-${scenario}-`));
  try {
    const r = spawnSync('bash', [BANC, scenario, '--sortie', dir, '--deploy', deploy], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`banc ${scenario} en échec (${r.status}) : ${r.stderr}${r.stdout}`);
    const journal = readFileSync(join(dir, 'journal'), 'utf8').split('\n').filter(Boolean).map((l): Ligne => {
      const [etape = '', commande = '', ...reste] = l.split('\t');
      const champ = (k: string) => reste.find((x) => x.startsWith(`${k}=`))?.slice(k.length + 1);
      return { etape, commande, buildSha: champ('BUILD_SHA'), projet: champ('PROJET'), issue: champ('issue') as Ligne['issue'] };
    });
    const resultat = Object.fromEntries(
      readFileSync(join(dir, 'resultat'), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    return { journal, resultat, sortie: readFileSync(join(dir, 'sortie'), 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const DOCKER = new Set(['construction', 'base', 'migration', 'verification', 'activation', 'run', 'exec', 'autre']);

/** Le dernier passage de deploy.sh (le scénario « reprise » en fait deux). */
function dernierPassage(j: Ligne[]): Ligne[] {
  const k = j.map((l) => l.etape).lastIndexOf('passage');
  return k === -1 ? j : j.slice(k + 1);
}

/**
 * Invariants valables dans TOUS les scénarios, passage par passage.
 */
function violationsOrdre(j: Ligne[], shaCourt: string): string[] {
  const v: string[] = [];
  let construit = false;
  let migree = false;
  let verifiee = false;
  let bloquePar: string | null = null;
  let migrationsEnEchec = false;
  for (const l of j) {
    if (l.etape === 'passage') {
      construit = migree = verifiee = migrationsEnEchec = false;
      bloquePar = null;
      continue;
    }
    if (!DOCKER.has(l.etape)) continue;
    if (bloquePar) v.push(`étape « ${l.etape} » lancée après l’échec de « ${bloquePar} »`);
    if (migrationsEnEchec && l.etape !== 'migration') v.push(`étape « ${l.etape} » lancée après l’échec de « migration »`);
    switch (l.etape) {
      case 'construction':
        if (l.buildSha !== shaCourt) v.push(`BUILD_SHA de la construction (${l.buildSha}) ≠ commit construit (${shaCourt})`);
        if (l.issue === 'ok') construit = true;
        else bloquePar = 'construction';
        break;
      case 'migration':
        if (!construit) v.push('migration avant la construction des images');
        if (!/compose run (.* )?--rm\b/.test(l.commande) || !/--no-deps\b/.test(l.commande) || !/ workers pnpm --filter @tiktrends\/db migrate$/.test(l.commande)) {
          v.push(`migration hors conteneur éphémère de la nouvelle image (attendu : compose run --rm --no-deps … workers …) : ${l.commande}`);
        }
        if (l.issue === 'ok') { migree = true; migrationsEnEchec = false; verifiee = false; } else migrationsEnEchec = true;
        break;
      case 'verification':
        if (l.issue === 'ok') verifiee = migree;
        else bloquePar = 'verification';
        break;
      case 'activation':
        if (!migree) v.push(`activation avant toute migration réussie : ${l.commande}`);
        else if (!verifiee) v.push(`activation sans vérification réussie après la migration : ${l.commande}`);
        if (l.issue !== 'ok') bloquePar = 'activation';
        break;
      case 'run':
      case 'exec':
      case 'autre':
        if (/migrate/.test(l.commande)) v.push(`migration hors conteneur éphémère de la nouvelle image (attendu : compose run --rm --no-deps … workers …) : ${l.commande}`);
        break;
    }
  }
  return v;
}

type Attendu = 'active' | 'arrete' | 'arrete_a_l_activation' | 'sans_build' | 'rien' | 'garde';

function violationsDeploiement(p: Passage, attendu: Attendu): string[] {
  const { journal, resultat: r } = p;
  const v = violationsOrdre(journal, r.sha_court ?? '');
  const passage = dernierPassage(journal);
  const docker = passage.filter((l) => DOCKER.has(l.etape));
  const activations = docker.filter((l) => l.etape === 'activation');
  switch (attendu) {
    case 'active': {
      const ordre = docker.map((l) => l.etape).join(' → ');
      if (ordre !== 'construction → base → migration → verification → activation') {
        v.push(`ordre attendu construction → base → migration → verification → activation, obtenu : ${ordre || '(rien)'}`);
      }
      if (r.code !== '0') v.push(`code de sortie ${r.code} pour un déploiement réussi`);
      if (r.marqueur_apres !== r.cible) v.push('marqueur non avancé après un déploiement réussi');
      break;
    }
    case 'arrete':
    case 'arrete_a_l_activation':
      if (attendu === 'arrete' && activations.length > 0) v.push(`activation malgré l’échec : ${activations[0]!.commande}`);
      if (attendu === 'arrete_a_l_activation' && activations.some((l) => l.issue === 'ok')) v.push('activation réussie dans un scénario d’échec d’activation');
      if (r.code === '0') v.push('code de sortie 0 malgré l’échec');
      if (r.marqueur_apres !== r.marqueur_avant) v.push('marqueur avancé malgré l’échec');
      break;
    case 'sans_build':
      if (docker.length > 0) v.push(`docker appelé alors que seul ops/ a changé : ${docker.map((l) => l.etape).join(', ')}`);
      if (r.code !== '0') v.push(`code de sortie ${r.code}`);
      if (r.marqueur_apres !== r.cible) v.push('marqueur non avancé alors que le commit est servi');
      break;
    case 'rien':
      if (journal.some((l) => DOCKER.has(l.etape) || /\bpull\b/.test(l.commande))) v.push('pull ou docker alors que rien n’est à déployer');
      if (r.code !== '0') v.push(`code de sortie ${r.code}`);
      if (r.marqueur_apres !== r.marqueur_avant) v.push('marqueur modifié alors que rien n’est à déployer');
      break;
    case 'garde':
      if (journal.length > 0) v.push(`appels lancés malgré l’arrêt de la garde : ${journal.map((l) => l.commande).join(' ; ')}`);
      if (r.code !== '2') v.push(`code de sortie ${r.code} au lieu de 2`);
      if (r.marqueur_apres !== r.marqueur_avant) v.push('marqueur modifié malgré l’arrêt');
      break;
  }
  return v;
}

const SCENARIOS: Array<{ nom: string; attendu: Attendu; phrase?: RegExp }> = [
  { nom: 'succes', attendu: 'active', phrase: /Vérification · 57 migration\(s\) du journal toutes en base \(base : 57\)\.[\s\S]*Déploiement terminé/ },
  { nom: 'premier', attendu: 'active', phrase: /\(déployé : aucun\)[\s\S]*Déploiement terminé/ },
  { nom: 'retour_arriere', attendu: 'active', phrase: /Vérification · 56 migration\(s\) du journal toutes en base \(base : 57\)\./ },
  { nom: 'build_ko', attendu: 'arrete', phrase: /ÉCHEC · construction des images · aucun conteneur remplacé, marqueur inchangé/ },
  { nom: 'migration_ko', attendu: 'arrete', phrase: /ÉCHEC · migrations non appliquées après 6 essais · l'ancienne version reste servie · aucun conteneur remplacé/ },
  { nom: 'migration_ko_base_a_jour', attendu: 'arrete', phrase: /ÉCHEC · migrations non appliquées après 6 essais/ },
  { nom: 'verification_ko', attendu: 'arrete', phrase: /ÉCHEC · vérification · migration\(s\) du journal absente\(s\) de la base : 0056_banc_d1 \(base 56, journal 57\)/ },
  { nom: 'lecture_base_ko', attendu: 'arrete', phrase: /ÉCHEC · vérification · lecture de drizzle\.__drizzle_migrations impossible/ },
  { nom: 'activation_ko', attendu: 'arrete_a_l_activation', phrase: /ÉCHEC · activation \(docker compose up\) · activation peut-être partielle, marqueur inchangé/ },
  { nom: 'ops_seul', attendu: 'sans_build', phrase: /Pas de changement de code applicatif · pull seul, aucun rebuild\./ },
  { nom: 'rien', attendu: 'rien' },
  { nom: 'garde_essai', attendu: 'garde', phrase: /ARRÊT · copie d'essai sans COMPOSE_PROJECT_NAME distinct/ },
];

describe('D1 · deploy.sh réel sur le banc · construire, migrer, vérifier, puis activer', () => {
  for (const s of SCENARIOS) {
    it(`${s.nom} · ${s.attendu}`, () => {
      const p = lancerBanc(s.nom);
      expect(violationsDeploiement(p, s.attendu), p.sortie).toEqual([]);
      if (s.phrase) expect(p.sortie).toMatch(s.phrase);
    });
  }

  it('migration_ko · six essais espacés, sans pause après le dernier', () => {
    const p = lancerBanc('migration_ko');
    const etapes = p.journal.filter((l) => l.etape === 'migration' || l.etape === 'pause').map((l) => l.etape);
    expect(etapes).toEqual(['migration', 'pause', 'migration', 'pause', 'migration', 'pause', 'migration', 'pause', 'migration', 'pause', 'migration']);
  });

  it('reprise · un build raté laisse le marqueur, le tick suivant déploie sans intervention', () => {
    const p = lancerBanc('reprise');
    expect(p.resultat.code_premier).toBe('1');
    expect(violationsDeploiement(p, 'active'), p.sortie).toEqual([]);
    const premier = p.journal.slice(0, p.journal.findIndex((l) => l.etape === 'passage'));
    expect(premier.filter((l) => l.etape === 'activation')).toEqual([]);
  });

  it('chaque appel docker vise le projet compose de la copie, jamais un autre', () => {
    const p = lancerBanc('succes');
    const projets = new Set(p.journal.filter((l) => DOCKER.has(l.etape)).map((l) => l.projet));
    expect([...projets]).toEqual(['banc-d1']);
  });
});

/**
 * Chaque mutant est une régression plausible, appliquée au TEXTE du vrai
 * script. Le banc doit la voir, avec la phrase qui la nomme.
 */
const MUTANTS: Array<{ nom: string; avant: string; apres: string; scenario: string; attendu: Attendu; phrase: string }> = [
  {
    nom: 'l’ancien ordre · `up -d --build` à la place de la construction seule',
    avant: 'if ! docker compose build; then',
    apres: 'if ! docker compose up -d --build; then',
    scenario: 'succes', attendu: 'active',
    phrase: 'activation avant toute migration réussie',
  },
  {
    nom: 'activation avant la migration',
    avant: 'docker compose up -d --no-recreate --no-build db || echec "démarrage de la base"',
    apres: 'docker compose up -d --no-build\ndocker compose up -d --no-recreate --no-build db || echec "démarrage de la base"',
    scenario: 'succes', attendu: 'active',
    phrase: 'activation avant toute migration réussie',
  },
  {
    nom: 'échec de migration ignoré',
    avant: '  echec "migrations non appliquées après $ESSAIS_MIGRATION essais · l\'ancienne version reste servie"',
    apres: '  echo "migrations non appliquées, on continue"',
    scenario: 'migration_ko_base_a_jour', attendu: 'arrete',
    phrase: 'activation avant toute migration réussie',
  },
  {
    nom: 'vérification retirée',
    avant: 'if [ -n "$manquantes" ]; then',
    apres: 'if false; then',
    scenario: 'verification_ko', attendu: 'arrete',
    phrase: 'activation malgré l’échec',
  },
  {
    nom: 'marqueur écrit avant l’activation',
    avant: 'docker compose up -d --no-build || echec',
    apres: 'echo "$REMOTE" > "$MARQUEUR"; docker compose up -d --no-build || echec',
    scenario: 'activation_ko', attendu: 'arrete_a_l_activation',
    phrase: 'marqueur avancé malgré l’échec',
  },
  {
    nom: 'migration dans le conteneur en service (exec) au lieu d’un conteneur éphémère',
    avant: 'docker compose run --rm --no-deps -T -w /app workers',
    apres: 'docker compose exec -T -w /app workers',
    scenario: 'succes', attendu: 'active',
    phrase: 'migration hors conteneur éphémère de la nouvelle image',
  },
];

describe('D1 · mutants · le banc voit chaque régression', () => {
  for (const m of MUTANTS) {
    it(m.nom, () => {
      expect(SOURCE_DEPLOY.includes(m.avant), `mutation sans prise : « ${m.avant} » absent de deploy.sh`).toBe(true);
      const dir = mkdtempSync(join(tmpdir(), 'd1-mutant-'));
      try {
        const mutant = join(dir, 'deploy.sh');
        writeFileSync(mutant, SOURCE_DEPLOY.replace(m.avant, m.apres));
        const p = lancerBanc(m.scenario, mutant);
        const v = violationsDeploiement(p, m.attendu);
        expect(v.some((x) => x.includes(m.phrase)), `mutant non vu · violations : ${JSON.stringify(v)}`).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});

describe('D1 · BUILD_SHA dans l’environnement des conteneurs (constat L9-A n°6)', () => {
  const WEB = readFileSync(join(PRODUIT, 'Dockerfile.web'), 'utf8');
  const WORKERS = readFileSync(join(PRODUIT, 'Dockerfile.workers'), 'utf8');
  const COMPOSE = readFileSync(join(PRODUIT, 'docker-compose.yml'), 'utf8');

  it('l’étape servie de Dockerfile.web le déclare et le promeut en ENV', () => {
    const run = WEB.slice(WEB.indexOf('AS run'));
    expect(run).toContain('ARG BUILD_SHA');
    expect(run).toContain('ENV BUILD_SHA=$BUILD_SHA');
  });

  it('Dockerfile.workers le déclare APRÈS l’installation (aucune couche lourde invalidée à chaque commit)', () => {
    const arg = WORKERS.indexOf('ARG BUILD_SHA');
    expect(arg, 'ARG BUILD_SHA absent de Dockerfile.workers').toBeGreaterThan(-1);
    expect(WORKERS).toContain('ENV BUILD_SHA=$BUILD_SHA');
    expect(arg > WORKERS.indexOf('pnpm install'), 'ARG BUILD_SHA avant `pnpm install` : chaque commit réinstallerait tout').toBe(true);
    expect(arg > WORKERS.indexOf('apk add'), 'ARG BUILD_SHA avant `apk add`').toBe(true);
  });

  it('le compose passe BUILD_SHA aux deux images', () => {
    const ligne = COMPOSE.split('\n').find((l) => l.includes('Dockerfile.workers') && l.includes('args'));
    expect(ligne, 'le service workers doit passer des args de build').toBeTruthy();
    expect(ligne).toContain('BUILD_SHA');
  });
});

/**
 * La fenêtre est désormais INVERSE : la migration s'applique pendant que
 * l'ANCIEN code tourne (il est encore servi pendant la migration et la
 * vérification). Ce n'est sûr que si chaque migration Studios et suivante
 * laisse l'ancien code écrire et lire comme avant. Contrôlé ici, pour TOUTE
 * migration à partir de 0054 (y compris celles qu'une vague ajoutera) :
 *   · additive (règle pure `migration-additive` : ni écriture, ni destruction,
 *     ni instruction inconnue · une colonne NOT NULL sans défaut est destructive) ;
 *   · aucun déclencheur sur une table EXISTANTE (seulement sur les tables que
 *     ces migrations créent) ;
 *   · aucune contrainte ajoutée à une table existante, sauf celles listées avec
 *     la raison pour laquelle l'ancien code ne peut pas les violer.
 * L'épreuve « ancien code sur base migrée » elle-même (bc33cec sur 56
 * migrations, écrans en 200) est dans docs/studios-v2/L9/L9-MIGRATION.md §5.
 */
const DRIZZLE = join(PRODUIT, 'packages/db/drizzle');
const JOURNAL = (JSON.parse(readFileSync(join(DRIZZLE, 'meta/_journal.json'), 'utf8')) as { entries: EntreeJournalMigration[] }).entries;
const PREMIERE_STUDIOS = 54;

const CONTRAINTES_EXISTANT_ADMISES: Record<string, string> = {
  brands_id_workspace_uq: 'UNIQUE (id, workspace_id) · id est la clé primaire : toute ligne écrite par l’ancien code la respecte',
  adsmap_ads_id_workspace_uq: 'UNIQUE (id, workspace_id) · id est la clé primaire : toute ligne écrite par l’ancien code la respecte',
};

function violationsFenetreInverse(migrations: ReadonlyArray<{ tag: string; sql: string }>): string[] {
  const v: string[] = [];
  const nouvelles = new Set<string>();
  for (const { tag, sql } of migrations) {
    const a = analyserMigrationSql(sql);
    for (const x of [...a.ecritures, ...a.destructives, ...a.inconnues]) v.push(`« ${tag} » · non additive (${x.raison}) : ${x.extrait}`);
    for (const instr of decouperInstructionsSql(sql)) {
      const t = /^CREATE TABLE (?:IF NOT EXISTS )?"([a-z0-9_]+)"/i.exec(instr);
      if (t) nouvelles.add(t[1]!);
    }
    for (const instr of decouperInstructionsSql(sql)) {
      const d = /^CREATE (?:OR REPLACE )?(?:CONSTRAINT )?TRIGGER\b[\s\S]*?\bON "([a-z0-9_]+)"/i.exec(instr);
      if (d && !nouvelles.has(d[1]!)) v.push(`« ${tag} » · déclencheur sur la table existante « ${d[1]} » · l’ancien code y écrit encore`);
      for (const c of instr.matchAll(/ALTER TABLE "([a-z0-9_]+)" ADD CONSTRAINT "([a-z0-9_]+)"([^;]*)/gi)) {
        const [, table, nom, suite] = c;
        if (nouvelles.has(table!)) continue;
        const admise = CONTRAINTES_EXISTANT_ADMISES[nom!];
        if (!admise || !/^\s*UNIQUE \("id",/i.test(suite!)) v.push(`« ${tag} » · contrainte « ${nom} » ajoutée à la table existante « ${table} » · l’ancien code peut la violer`);
      }
    }
  }
  return v;
}

const STUDIOS = JOURNAL.filter((e) => e.idx >= PREMIERE_STUDIOS).map((e) => ({ tag: e.tag, sql: readFileSync(join(DRIZZLE, `${e.tag}.sql`), 'utf8') }));

describe('D1 · fenêtre inverse · l’ancien code supporte le schéma étendu', () => {
  it(`les migrations à partir de ${PREMIERE_STUDIOS} sont lues (au moins 0054 et 0055)`, () => {
    expect(STUDIOS.map((m) => m.tag).slice(0, 2)).toEqual(['0054_studios_fondations', '0055_ai_spend_reconciliation']);
  });

  it('aucune ne casse l’ancien code pendant la migration', () => {
    expect(violationsFenetreInverse(STUDIOS)).toEqual([]);
  });

  const mutants: Array<{ nom: string; ajout: string; phrase: string }> = [
    { nom: 'colonne existante rendue obligatoire', ajout: 'ALTER TABLE "ai_spend" ALTER COLUMN "action" SET NOT NULL;', phrase: 'non additive' },
    { nom: 'colonne NOT NULL sans défaut', ajout: 'ALTER TABLE "ai_spend" ADD COLUMN IF NOT EXISTS "x" text NOT NULL;', phrase: 'non additive' },
    { nom: 'déclencheur sur une table existante', ajout: 'CREATE OR REPLACE TRIGGER "t" BEFORE UPDATE ON "brands" FOR EACH ROW EXECUTE FUNCTION "studio_refuser_mutation"();', phrase: 'déclencheur sur la table existante « brands »' },
    { nom: 'contrainte CHECK sur une table existante', ajout: 'DO $$ BEGIN\n ALTER TABLE "brands" ADD CONSTRAINT "brands_nom_ck" CHECK (char_length("name") < 3);\nEXCEPTION\n WHEN duplicate_object THEN null;\nEND $$;', phrase: 'contrainte « brands_nom_ck » ajoutée à la table existante « brands »' },
  ];
  for (const m of mutants) {
    it(`mutant vu · ${m.nom}`, () => {
      const mutees = STUDIOS.map((x, k) => (k === STUDIOS.length - 1 ? { ...x, sql: `${x.sql}\n--> statement-breakpoint\n${m.ajout}\n` } : x));
      const v = violationsFenetreInverse(mutees);
      expect(v.some((x) => x.includes(m.phrase)), JSON.stringify(v)).toBe(true);
    });
  }
});
