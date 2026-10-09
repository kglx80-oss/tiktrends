import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  lireYaml, lireEnvFile, nomsProduction, variablesExternes, violationsComposeRecette, violationsCommandesDocker, YamlNonPrisEnCharge, BUDGET_ESSAI_USD,
} from '../scripts/recette/compose';
import { ENV_INTERRUPTEURS } from '@tiktrends/core';
import { RECETTE } from '../scripts/recette/regles';

/**
 * Recette Studios · lot E · le compose d'essai réel ne partage RIEN avec la
 * production. On lit les deux fichiers RÉELS du dépôt : les noms interdits
 * viennent de `docker-compose.yml`, pas d'une liste recopiée.
 *
 * Les mutations ci-dessous sont appliquées au TEXTE du fichier de recette
 * (pas à un objet fabriqué) : chacune doit faire apparaître la phrase qui
 * nomme le partage ou le manque.
 */

const PRODUIT = join(process.cwd(), '..', '..');
const TEXTE_RECETTE = readFileSync(join(PRODUIT, 'docker-compose.recette.yml'), 'utf8');
const PROD = nomsProduction(lireYaml(readFileSync(join(PRODUIT, 'docker-compose.yml'), 'utf8')));
const TEXTE_NEUTRALISE = readFileSync(join(PRODUIT, 'ops', 'recette', 'neutralise.env'), 'utf8');

/** Toutes les variables d'environnement que le CODE lit (web, worker, paquets) · relues dans les sources. */
function variablesLuesParLeCode(): string[] {
  const noms = new Set<string>();
  const parcourir = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      if (f === 'node_modules' || f === '.next') continue;
      if (statSync(p).isDirectory()) parcourir(p);
      else if (/\.(ts|tsx|mjs)$/.test(f)) {
        for (const m of readFileSync(p, 'utf8').matchAll(/env\.([A-Z][A-Z0-9_]{2,})|env\[['"]([A-Z][A-Z0-9_]+)['"]\]/g)) noms.add(m[1] ?? m[2]!);
      }
    }
  };
  for (const d of ['apps/web/lib', 'apps/web/app', 'apps/web/components', 'apps/workers/src', 'packages/core/src', 'packages/db/src', 'packages/ai/src', 'packages/integrations/src']) parcourir(join(PRODUIT, d));
  return [...noms];
}
const EXTERNES = variablesExternes(variablesLuesParLeCode());
const violations = (texte: string, neutralise = TEXTE_NEUTRALISE, externes: readonly string[] = EXTERNES) =>
  violationsComposeRecette(lireYaml(texte), PROD, { neutralise: lireEnvFile(neutralise), externes, espaceRecette: RECETTE.workspaceId });
const muter = (de: string | RegExp, vers: string) => {
  const t = TEXTE_RECETTE.replace(de, vers);
  if (t === TEXTE_RECETTE) throw new Error(`mutation sans effet · ${String(de)}`);
  return t;
};

describe('Compose de recette · isolé de la production', () => {
  it('lit les noms de la production dans docker-compose.yml', () => {
    expect(PROD.services).toEqual(['db', 'redis', 'web', 'workers', 'caddy']);
    expect(PROD.volumes).toEqual(['pgdata', 'redisdata', 'caddydata']);
    expect(PROD.envFiles).toEqual(['.env.deploy']);
  });

  it('le fichier réel est conforme : aucune violation', () => {
    expect(violations(TEXTE_RECETTE)).toEqual([]);
  });

  it('chaque service applicatif porte le plafond, ≤ 15 $, et TIKTRENDS_ENV=recette', () => {
    const services = (lireYaml(TEXTE_RECETTE) as { services: Record<string, { build?: unknown; environment?: Record<string, string> }> }).services;
    const applicatifs = Object.entries(services).filter(([, s]) => s.build !== undefined);
    expect(applicatifs.map(([n]) => n).sort()).toEqual(['outils_recette', 'web_recette', 'workers_recette']);
    for (const [, s] of applicatifs) {
      expect(Number(s.environment!.AI_SPEND_CAP_USD)).toBeLessThanOrEqual(BUDGET_ESSAI_USD);
      expect(s.environment!.TIKTRENDS_ENV).toBe('recette');
    }
  });

  it('plafond retiré ⇒ refus nommé', () => {
    const t = muter(/^\s*AI_SPEND_CAP_USD: "15"\n/m, '');
    expect(violations(t)).toContain('Service « web_recette » : AI_SPEND_CAP_USD absent · le plafond de l’essai doit être posé dans le compose.');
  });

  it('plafond au-delà de 15 $ ⇒ refus nommé', () => {
    const t = muter('AI_SPEND_CAP_USD: "15"', 'AI_SPEND_CAP_USD: "16"');
    expect(violations(t)).toContain('Service « web_recette » : AI_SPEND_CAP_USD 16 dépasse le budget d’essai de 15 $.');
  });

  it('port publié sur toutes les interfaces ou 0.0.0.0 ⇒ refus', () => {
    expect(violations(muter('"127.0.0.1:3101:3000"', '"3101:3000"'))).toContain('Service « web_recette » : port « 3101:3000 » publié hors de 127.0.0.1 (jamais 0.0.0.0 ni toutes interfaces).');
    expect(violations(muter('"127.0.0.1:3101:3000"', '"0.0.0.0:3101:3000"'))).toContain('Service « web_recette » : port « 0.0.0.0:3101:3000 » publié hors de 127.0.0.1 (jamais 0.0.0.0 ni toutes interfaces).');
  });

  it('env_file de la production ⇒ refus', () => {
    const v = violations(muter('env_file: [ops/recette/.env.recette, ops/recette/neutralise.env]', 'env_file: [.env.deploy, ops/recette/neutralise.env]'));
    expect(v).toContain('Service « web_recette » : env_file « .env.deploy » est celui de la production.');
    expect(v.some((x) => x.startsWith('Référence à .env.deploy'))).toBe(true);
  });

  it('volume de la production réutilisé ⇒ refus', () => {
    const t = TEXTE_RECETTE.replace(/pgdata_recette/g, 'pgdata');
    expect(violations(t)).toContain('Volume « pgdata » : même nom qu’un volume de production.');
  });

  it('volume ou réseau externe ⇒ refus', () => {
    expect(violations(muter('pgdata_recette: { name: tiktrends-recette-pgdata }', 'pgdata_recette: { external: true, name: tiktrends-recette-pgdata }'))).toContain('Volume « pgdata_recette » : externe (external) · il pourrait désigner un volume de production.');
    expect(violations(muter('recette: { name: tiktrends-recette-reseau }', 'recette: { external: true, name: product_default }'))).toEqual(expect.arrayContaining([
      'Réseau « recette » : externe (external) · il pourrait joindre la production.',
      'Réseau « recette » : nom explicite préfixé « tiktrends-recette » exigé (lu « product_default »).',
    ]));
  });

  it('nom de service de la production ⇒ refus', () => {
    const t = TEXTE_RECETTE.replace(/\bredis_recette\b/g, 'redis');
    expect(violations(t)).toContain('Service « redis » : même nom qu’un service de production.');
  });

  it('base ou Redis de la production visés ⇒ refus', () => {
    expect(violations(muter('@db_recette:5432/tiktrends_recette', '@db:5432/tiktrends'))).toEqual(expect.arrayContaining([
      'Service « web_recette » : DATABASE_URL vise l’hôte « db », un service de production.',
      'Service « web_recette » : DATABASE_URL vise la base « tiktrends » · son nom doit contenir « recette ».',
    ]));
    expect(violations(muter('REDIS_URL: redis://redis_recette:6379', 'REDIS_URL: redis://redis:6379'))).toContain('Service « web_recette » : REDIS_URL doit viser un service du projet de recette (lu « redis »).');
  });

  it('la liste des variables externes vient du code et couvre stockage, IA, cron et services', () => {
    expect(EXTERNES).toEqual(expect.arrayContaining([
      'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL',
      'FAL_KEY', 'ANTHROPIC_API_KEY', 'HIGGSFIELD_API_KEY', 'CRON_SECRET', 'TRENDTRACK_API_KEY', 'STRIPE_SECRET_KEY', 'SMTP_URL',
    ]));
    expect(EXTERNES).not.toContain('AUTH_SECRET');
    // Chacune est vidée par le fichier versionné (le compose ne repose que les clés des outils).
    const neutre = lireEnvFile(TEXTE_NEUTRALISE);
    expect(EXTERNES.filter((n) => neutre[n] !== '')).toEqual([]);
  });

  it('stockage hérité (variable absente de neutralise.env) ⇒ refus nommé', () => {
    const t = TEXTE_NEUTRALISE.replace(/^S3_BUCKET=\n/m, '');
    expect(t).not.toBe(TEXTE_NEUTRALISE);
    expect(violations(TEXTE_RECETTE, t)).toContain('Service « web_recette » : S3_BUCKET non neutralisée (absente, donc héritée de .env.recette) · stockage propre à la recette exigé.');
  });

  it('stockage de la production reposé dans le compose ⇒ refus nommé', () => {
    const t = muter('      APP_URL: http://localhost:3101\n', '      APP_URL: http://localhost:3101\n      S3_BUCKET: tiktrends-prod\n');
    expect(violations(t)).toContain('Service « web_recette » : S3_BUCKET non neutralisée (« tiktrends-prod ») · stockage propre à la recette exigé.');
  });

  it('nouvelle clé externe lue par le code et non neutralisée ⇒ refus', () => {
    expect(violations(TEXTE_RECETTE, TEXTE_NEUTRALISE, [...EXTERNES, 'NOUVEAU_FOURNISSEUR_API_KEY'])).toContain(
      'Service « workers_recette » : NOUVEAU_FOURNISSEUR_API_KEY non neutralisée (absente, donc héritée de .env.recette) · aucun service externe ni tâche planifiée en recette.');
  });

  it('neutralise.env chargé avant .env.recette (il ne l’emporterait plus) ⇒ refus', () => {
    const t = TEXTE_RECETTE.replace(/env_file: \[ops\/recette\/\.env\.recette, ops\/recette\/neutralise\.env\]/g, 'env_file: [ops/recette/neutralise.env, ops/recette/.env.recette]');
    expect(violations(t)).toContain('Service « web_recette » : env_file doit être [ops/recette/.env.recette, ops/recette/neutralise.env] dans cet ordre (le second l’emporte).');
  });

  it('clé payante écrite en dur pour les outils ⇒ refus', () => {
    expect(violations(muter('FAL_KEY: ${FAL_KEY:-}', 'FAL_KEY: cle-ecrite'))).toContain('Service « outils_recette » : FAL_KEY doit venir du shell du propriétaire (FAL_KEY: ${FAL_KEY:-}), jamais d’un fichier.');
  });

  it('worker lancé sur src/index.ts (crons, ingestion, démos) ou sans commande ⇒ refus', () => {
    expect(violations(muter('command: ["pnpm", "exec", "tsx", "src/recette/worker-recette.ts"]', 'command: ["pnpm", "start"]'))).toEqual(expect.arrayContaining([
      'Service « workers_recette » : commande « pnpm start » · src/index.ts démarre crons, ingestion et jobs de démonstration.',
    ]));
    expect(violations(muter(/^\s*command: \["pnpm", "exec", "tsx", "src\/recette\/worker-recette\.ts"\]\n/m, ''))).toContain('Service « workers_recette » : commande absente · l’image du worker lancerait src/index.ts et ses crons.');
  });

  it('image qui déclare un volume (redis /data) sans montage nommé ⇒ refus (sinon volume anonyme hors projet)', () => {
    const sans = muter('    volumes:\n      - redisdata_recette:/data', '');
    expect(violations(sans), 'redis sans montage nommé accepté : volume anonyme hors du préfixe').toContain('Service « redis_recette » : l’image « redis:7-alpine » déclare le volume « /data » · montage nommé préfixé « tiktrends-recette » exigé, sinon Docker crée un volume anonyme hors du projet.');
  });

  it('volume sans nom préfixé ⇒ refus', () => {
    expect(violations(muter('pgdata_recette: { name: tiktrends-recette-pgdata }', 'pgdata_recette: {}'))).toContain('Volume « pgdata_recette » : nom explicite préfixé « tiktrends-recette » exigé (lu «  »).');
  });

  it('montage hors de ops/recette, Caddy, réseau de l’hôte ⇒ refus', () => {
    expect(violations(muter('./ops/recette/sorties:/sorties', './Caddyfile:/etc/caddy/Caddyfile:ro'))).toEqual(expect.arrayContaining([
      'Service « outils_recette » : montage « ./Caddyfile » hors de ./ops/recette/.',
      'Référence à Caddy (proxy public de production) : « ./Caddyfile:/etc/caddy/Caddyfile:ro ».',
    ]));
    expect(violations(muter('network_mode: "service:db_recette"', 'network_mode: host'))).toContain('Service « outils_recette » : network_mode « host » · seul « service:<service de recette> » est admis.');
  });

  it('nom de projet changé ⇒ refus', () => {
    expect(violations(muter('name: tiktrends-recette', 'name: product'))).toContain('Le projet compose doit s’appeler « tiktrends-recette » (name:), lu « product ».');
  });

  it('le lecteur refuse ce qu’il ne sait pas lire, au lieu de le lire à moitié', () => {
    expect(() => lireYaml('a: &ancre 1\nb: *ancre\n')).toThrow(YamlNonPrisEnCharge);
    expect(() => lireYaml('a: |\n  bloc\n')).toThrow(YamlNonPrisEnCharge);
    expect(() => lireYaml('a: 1\na: 2\n')).toThrow(/en double/);
    expect(() => lireYaml('a:\n\t- x\n')).toThrow(/tabulation/);
    expect(() => lireYaml('a: 1\n---\nb: 2\n')).toThrow(/documents multiples/);
    expect(lireYaml('s:\n  - "x # pas un commentaire" # commentaire\n  - [a, { b: "c:d" }]\n')).toEqual({ s: ['x # pas un commentaire', ['a', { b: 'c:d' }]] });
  });
});

describe('R6 · interrupteurs Studios de la recette · l’essai autorisé, rien de plus, pour l’espace de recette', () => {
  const OUTILS_PILOTES = '      STUDIOS_CAPACITES_PILOTES: "generation_image,controle_visuel"\n      STUDIOS_CAPACITES_GENERALES: benchmark_reel\n';

  it('les quatre variables d’interrupteur (lues par le noyau) sont vidées par neutralise.env', () => {
    const neutre = lireEnvFile(TEXTE_NEUTRALISE);
    expect(Object.values(ENV_INTERRUPTEURS).filter((n) => neutre[n] !== '')).toEqual([]);
  });

  it('variable d’interrupteur retirée de neutralise.env et non posée ⇒ héritée de .env.recette, refus nommé', () => {
    const t = TEXTE_NEUTRALISE.replace(/^STUDIOS_CAPACITES_GENERALES=\n/m, '');
    expect(t).not.toBe(TEXTE_NEUTRALISE);
    expect(violations(TEXTE_RECETTE, t)).toContain('Service « web_recette » : STUDIOS_CAPACITES_GENERALES absente (ni neutralisée ni posée, donc héritée de .env.recette) · les interrupteurs de la recette ne viennent que du compose.');
  });

  it('outils sans les capacités du pas 1 ou du pas 2 ⇒ l’essai autorisé ne passerait pas la garde', () => {
    expect(violations(muter(OUTILS_PILOTES, '      STUDIOS_CAPACITES_GENERALES: benchmark_reel\n'))).toEqual(expect.arrayContaining([
      'Service « outils_recette » : « generation_image » coupée pour l’espace de recette · l’essai réel autorisé (pas 1 : generation_image, controle_visuel ; pas 2 : benchmark_reel) ne passerait pas la garde.',
      'Service « outils_recette » : « controle_visuel » coupée pour l’espace de recette · l’essai réel autorisé (pas 1 : generation_image, controle_visuel ; pas 2 : benchmark_reel) ne passerait pas la garde.',
    ]));
    expect(violations(muter(OUTILS_PILOTES, '      STUDIOS_CAPACITES_PILOTES: "generation_image,controle_visuel"\n'))).toContain(
      'Service « outils_recette » : « benchmark_reel » coupée pour l’espace de recette · l’essai réel autorisé (pas 1 : generation_image, controle_visuel ; pas 2 : benchmark_reel) ne passerait pas la garde.');
  });

  it('capacité au-delà de l’essai (vidéo), benchmark réel hors des outils ⇒ refus nommés', () => {
    const t = TEXTE_RECETTE.replace(/STUDIOS_CAPACITES_PILOTES: "generation_image,controle_visuel"/g, 'STUDIOS_CAPACITES_PILOTES: "generation_image,controle_visuel,video"');
    expect(violations(t)).toContain('Service « web_recette » : « video » ouverte · seules generation_image, controle_visuel le sont en recette (essai réel autorisé).');
    const w = muter('      APP_URL: http://localhost:3101\n', '      APP_URL: http://localhost:3101\n      STUDIOS_CAPACITES_GENERALES: benchmark_reel\n');
    expect(violations(w)).toContain('Service « web_recette » : « benchmark_reel » ouverte · seules generation_image, controle_visuel le sont en recette (essai réel autorisé).');
  });

  it('ouverture hors de l’espace de recette (généralisation, autre espace pilote) ⇒ refus nommé', () => {
    const g = muter('      APP_URL: http://localhost:3101\n', '      APP_URL: http://localhost:3101\n      STUDIOS_CAPACITES_GENERALES: generation_image\n');
    expect(violations(g)).toContain(`Service « web_recette » : « generation_image » ouverte hors de l’espace de recette · ouverture par espace pilote seulement (STUDIOS_ESPACES_PILOTES=${RECETTE.workspaceId}).`);
    const autre = TEXTE_RECETTE.replace(/STUDIOS_ESPACES_PILOTES: e5ec0000-0000-4000-8000-00000000e001/g, 'STUDIOS_ESPACES_PILOTES: "e5ec0000-0000-4000-8000-00000000e001,7b1d2c3e-0000-4000-8000-000000000042"');
    expect(autre).not.toBe(TEXTE_RECETTE);
    expect(violations(autre)).toContain(`Service « workers_recette » : STUDIOS_ESPACES_PILOTES nomme « 7b1d2c3e-0000-4000-8000-000000000042 » · seul l’espace de recette (${RECETTE.workspaceId}) peut être pilote.`);
  });
});

describe('Commandes Docker de la recette · destruction limitée au projet tiktrends-recette', () => {
  const DOSSIER = join(PRODUIT, 'ops', 'recette');
  const fichiers = [
    ['docker-compose.recette.yml', TEXTE_RECETTE],
    ...readdirSync(DOSSIER).filter((f) => /\.(md|sh)$/.test(f)).map((f) => [`ops/recette/${f}`, readFileSync(join(DOSSIER, f), 'utf8')]),
  ] as Array<[string, string]>;

  it('le runbook existe et porte la commande de destruction du projet', () => {
    const runbook = fichiers.find(([f]) => f === 'ops/recette/README.md')?.[1] ?? '';
    expect(runbook).toContain('docker compose -p tiktrends-recette -f docker-compose.recette.yml --env-file ops/recette/.env.recette --profile outils down -v');
  });

  it('aucune commande du runbook, du compose ou des scripts ne sort du projet', () => {
    expect(fichiers.flatMap(([f, t]) => violationsCommandesDocker(t, f))).toEqual([]);
  });

  it('prune, compose sans projet, suppression hors préfixe ⇒ refus', () => {
    expect(violationsCommandesDocker('docker system prune -af', 'x')).toEqual(['x:1 · « docker system prune -af » : prune interdit, il ne connaît pas les projets.']);
    expect(violationsCommandesDocker('docker volume prune', 'x')).toHaveLength(1);
    expect(violationsCommandesDocker('docker compose down -v', 'x')).toEqual([
      'x:1 · « docker compose down -v » : -p tiktrends-recette manquant.',
      'x:1 · « docker compose down -v » : -f docker-compose.recette.yml manquant.',
    ]);
    expect(violationsCommandesDocker('docker volume rm product_pgdata', 'x')).toEqual(['x:1 · « docker volume rm product_pgdata » : cible hors du projet tiktrends-recette.']);
    expect(violationsCommandesDocker('docker volume rm tiktrends-recette-pgdata', 'x')).toEqual([]);
    // Markdown : un bloc de code est lu, la prose qui nomme l'interdit ne l'est pas.
    expect(violationsCommandesDocker('Interdit : `docker system prune`.\n```bash\ndocker system prune -f\n```', 'r.md')).toEqual(['r.md:3 · « docker system prune -f » : prune interdit, il ne connaît pas les projets.']);
  });
});
