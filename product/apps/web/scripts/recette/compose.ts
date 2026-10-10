/**
 * Recette Studios · garde du fichier compose d'essai réel · PUR (aucun
 * fichier lu ici, aucune base, aucun réseau).
 *
 * Le propriétaire lance la recette réelle dans un projet compose SÉPARÉ
 * (`docker-compose.recette.yml`). Le danger n'est pas ce que le fichier fait
 * aujourd'hui, c'est la ligne qu'on y ajoute dans trois semaines : un
 * `env_file: .env.deploy` recopié, un volume `pgdata` qui pointe sur la base
 * de production, un port publié sur 0.0.0.0, un plafond retiré. Cette garde
 * lit le fichier RÉEL et le compare au compose de PRODUCTION lu de la même
 * façon : les noms interdits viennent du fichier de prod, pas d'une liste
 * écrite de tête.
 *
 * Le lecteur YAML est volontairement STRICT : il ne connaît que le sous-
 * ensemble que ces deux fichiers emploient (blocs, listes `- x`, `[a, b]`,
 * `{ a: b }`, chaînes simples ou entre guillemets, commentaires). Ancres,
 * alias, étiquettes, blocs `|` `>`, documents multiples, tabulations : il
 * REFUSE. Un fichier qu'il ne sait pas lire est un fichier refusé, jamais un
 * fichier lu à moitié et déclaré conforme.
 */

import { CAPACITES_STUDIOS, DEFINITIONS_CAPACITES, ENV_INTERRUPTEURS, capaciteActive, lireListeEnv, type CapaciteStudio } from '@tiktrends/core';

export type ValeurYaml = string | ValeurYaml[] | { [cle: string]: ValeurYaml };
type Objet = { [cle: string]: ValeurYaml };

export class YamlNonPrisEnCharge extends Error {
  constructor(ligne: number, motif: string) { super(`YAML non pris en charge (ligne ${ligne}) · ${motif}`); this.name = 'YamlNonPrisEnCharge'; }
}

interface Ligne { n: number; indent: number; texte: string }

/** Retire un commentaire de fin de ligne situé hors guillemets. */
function sansCommentaire(s: string): string {
  let q: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (q) { if (c === q && (q === "'" || s[i - 1] !== '\\')) q = null; continue; }
    if (c === '"' || c === "'") { q = c; continue; }
    if (c === '#' && (i === 0 || /\s/.test(s[i - 1]!))) return s.slice(0, i);
  }
  return s;
}

function lignesUtiles(source: string): Ligne[] {
  const out: Ligne[] = [];
  source.split('\n').forEach((brut, i) => {
    const n = i + 1;
    const l = brut.replace(/\r$/, '');
    if (/^\s*\t/.test(l)) throw new YamlNonPrisEnCharge(n, 'tabulation d’indentation');
    const t = sansCommentaire(l).replace(/\s+$/, '');
    if (!t.trim()) return;
    if (/^(---|\.\.\.)\s*$/.test(t.trim())) throw new YamlNonPrisEnCharge(n, 'documents multiples');
    out.push({ n, indent: t.length - t.trimStart().length, texte: t.trim() });
  });
  return out;
}

function scalaire(brut: string, n: number): string {
  const s = brut.trim();
  if (s.startsWith('"')) {
    if (!s.endsWith('"') || s.length < 2) throw new YamlNonPrisEnCharge(n, 'guillemet double non fermé');
    return s.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c));
  }
  if (s.startsWith("'")) {
    if (!s.endsWith("'") || s.length < 2) throw new YamlNonPrisEnCharge(n, 'guillemet simple non fermé');
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^[&*!|>%@`]/.test(s)) throw new YamlNonPrisEnCharge(n, `syntaxe « ${s[0]} » (ancre, alias, étiquette ou bloc)`);
  return s;
}

/** Valeur en ligne : collection `[ ]` / `{ }` (imbriquées) ou scalaire. */
function enLigne(s: string, n: number): ValeurYaml {
  const t = s.trim();
  if (!t.startsWith('[') && !t.startsWith('{')) return scalaire(t, n);
  let i = 0;
  const blancs = () => { while (i < t.length && /\s/.test(t[i]!)) i++; };
  const jeton = (fin: string): string => {
    blancs();
    const debut = i;
    if (t[i] === '"' || t[i] === "'") {
      const q = t[i]!; i++;
      while (i < t.length && !(t[i] === q && (q === "'" || t[i - 1] !== '\\'))) i++;
      if (i >= t.length) throw new YamlNonPrisEnCharge(n, 'guillemet non fermé');
      i++;
      return t.slice(debut, i);
    }
    while (i < t.length && !fin.includes(t[i]!)) i++;
    return t.slice(debut, i).trim();
  };
  const valeur = (fin: string): ValeurYaml => {
    blancs();
    if (t[i] === '[') return liste();
    if (t[i] === '{') return objet();
    return scalaire(jeton(fin), n);
  };
  const liste = (): ValeurYaml[] => {
    i++; const out: ValeurYaml[] = [];
    blancs();
    if (t[i] === ']') { i++; return out; }
    for (;;) {
      out.push(valeur(',]'));
      blancs();
      if (t[i] === ',') { i++; continue; }
      if (t[i] === ']') { i++; return out; }
      throw new YamlNonPrisEnCharge(n, 'liste en ligne mal formée');
    }
  };
  const objet = (): Objet => {
    i++; const out: Objet = {};
    blancs();
    if (t[i] === '}') { i++; return out; }
    for (;;) {
      const k = scalaire(jeton(':,}'), n);
      if (t[i] !== ':') throw new YamlNonPrisEnCharge(n, 'objet en ligne sans « : »');
      i++;
      if (k in out) throw new YamlNonPrisEnCharge(n, `clé « ${k} » en double`);
      out[k] = valeur(',}');
      blancs();
      if (t[i] === ',') { i++; continue; }
      if (t[i] === '}') { i++; return out; }
      throw new YamlNonPrisEnCharge(n, 'objet en ligne mal formé');
    }
  };
  const v = valeur('');
  blancs();
  if (i !== t.length) throw new YamlNonPrisEnCharge(n, 'texte après une collection en ligne');
  return v;
}

/** Sépare `cle: valeur` · la clé est une chaîne simple ou entre guillemets. */
function cleValeur(texte: string, n: number): [string, string] | null {
  const m = /^("[^"]*"|'[^']*'|[^\s:"'[\]{},#][^:]*?)\s*:(?:\s+(.*)|$)/.exec(texte);
  if (!m) return null;
  return [scalaire(m[1]!, n), (m[2] ?? '').trim()];
}

/** Lit le sous-ensemble YAML des fichiers compose du dépôt · lève `YamlNonPrisEnCharge` sinon. */
export function lireYaml(source: string): ValeurYaml {
  const L = lignesUtiles(source);
  let p = 0;
  const bloc = (indent: number): ValeurYaml => {
    const premiere = L[p]!;
    if (premiere.indent !== indent) throw new YamlNonPrisEnCharge(premiere.n, 'indentation inattendue');
    if (premiere.texte.startsWith('- ') || premiere.texte === '-') {
      const out: ValeurYaml[] = [];
      while (p < L.length && L[p]!.indent === indent && (L[p]!.texte.startsWith('- ') || L[p]!.texte === '-')) {
        const l = L[p]!;
        const reste = l.texte.slice(1).trim();
        if (!reste) throw new YamlNonPrisEnCharge(l.n, 'élément de liste vide ou imbriqué');
        if (cleValeur(reste, l.n) && !/^["'[{]/.test(reste)) throw new YamlNonPrisEnCharge(l.n, 'objet dans une liste en bloc');
        out.push(enLigne(reste, l.n));
        p++;
      }
      if (p < L.length && L[p]!.indent > indent) throw new YamlNonPrisEnCharge(L[p]!.n, 'indentation inattendue');
      return out;
    }
    const out: Objet = {};
    while (p < L.length && L[p]!.indent === indent) {
      const l = L[p]!;
      if (l.texte.startsWith('-')) throw new YamlNonPrisEnCharge(l.n, 'liste mêlée à un objet');
      const kv = cleValeur(l.texte, l.n);
      if (!kv) throw new YamlNonPrisEnCharge(l.n, `ligne illisible « ${l.texte} »`);
      const [k, v] = kv;
      if (k in out) throw new YamlNonPrisEnCharge(l.n, `clé « ${k} » en double`);
      p++;
      if (v) {
        out[k] = enLigne(v, l.n);
        if (p < L.length && L[p]!.indent > indent) throw new YamlNonPrisEnCharge(L[p]!.n, 'indentation inattendue après une valeur');
      } else if (p < L.length && L[p]!.indent > indent) {
        out[k] = bloc(L[p]!.indent);
      } else {
        out[k] = '';
      }
    }
    if (p < L.length && L[p]!.indent > indent) throw new YamlNonPrisEnCharge(L[p]!.n, 'indentation inattendue');
    return out;
  };
  if (!L.length) return {};
  const racine = bloc(0);
  if (p !== L.length) throw new YamlNonPrisEnCharge(L[p]!.n, 'indentation inattendue en fin de fichier');
  return racine;
}

/* ───────────────────────────── la garde ─────────────────────────────────── */

/** Le budget d'essai réel autorisé par le propriétaire (8 octobre) · plafond de l'environnement entier. */
export const BUDGET_ESSAI_USD = 15;
export const NOM_PROJET_RECETTE = 'tiktrends-recette';
/** Le fichier d'environnement du propriétaire, ignoré par git (`ops/recette/.gitignore`). */
export const ENV_FILE_RECETTE = 'ops/recette/.env.recette';
/** Le fichier versionné qui VIDE stockage, clés et déclencheurs · chargé en dernier, il l'emporte. */
export const ENV_FILE_NEUTRALISE = 'ops/recette/neutralise.env';
/** Variables du stockage objet lues par le code (`packages/integrations/src/storage.ts`). */
export const VARIABLES_STOCKAGE = ['S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_BASE_URL'] as const;
/** Secrets INTERNES nécessaires au fonctionnement (session, chiffrement) · jamais des fournisseurs. */
const SECRETS_INTERNES: ReadonlySet<string> = new Set(['AUTH_SECRET', 'TOKEN_ENC_KEY']);
/** Commande du worker de recette · boucle Studios seule (`apps/workers/src/recette/worker-recette.ts`). */
export const COMMANDE_WORKER_RECETTE = ['pnpm', 'exec', 'tsx', 'src/recette/worker-recette.ts'];

/**
 * Parmi les variables que le CODE lit, celles d'un stockage ou d'un service
 * externe (clé, secret, jeton, identifiant d'application, SMTP, déclencheur
 * cron) · la règle de tri, appliquée à la liste relue dans les sources.
 */
export function variablesExternes(lues: readonly string[]): string[] {
  return [...new Set(lues)].filter((n) => !SECRETS_INTERNES.has(n)
    && (/^S3_/.test(n) || /(_KEY|_SECRET|_TOKEN|_APP_ID|_CLIENT_ID)$/.test(n) || n === 'SMTP_URL')).sort();
}

/** Lit un fichier `CLE=valeur` (commentaires `#`, lignes vides) · pur. */
export function lireEnvFile(texte: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const l of texte.split('\n')) {
    const t = l.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i <= 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}
/** Les seuls montages de fichiers admis : les sorties de la recette. */
export const DOSSIER_MONTAGES_RECETTE = './ops/recette/';
/** Le registre cumulatif du budget d'essai (E2) · sur la machine, hors de tout volume, jamais nettoyé. */
export const DOSSIER_REGISTRE_RECETTE = './ops/recette/registre';

/** Les clés payantes · vidées explicitement dans tout service applicatif sauf les outils. */
export const CLES_PAYANTES = ['FAL_KEY', 'ANTHROPIC_API_KEY'] as const;
export const SERVICE_OUTILS = 'outils_recette';

/**
 * R6 · capacités Studios (F1, coupées par défaut) que l'essai réel AUTORISÉ
 * exige, et rien de plus · pas 1 (`recette:pas1`) : image puis contrôle
 * visuel, pour l'espace de recette seulement (espace pilote) ; pas 2
 * (`recette:bench --reel`) : benchmark réel, capacité de plateforme
 * (généralisation, dans le service d'outils seulement).
 */
export const CAPACITES_ESSAI_RECETTE = {
  pas1: ['generation_image', 'controle_visuel'],
  pas2: ['benchmark_reel'],
} as const satisfies Record<string, readonly CapaciteStudio[]>;
/** Un espace qui n'est PAS celui de la recette · pour vérifier qu'aucune ouverture ne déborde. */
const AUTRE_ESPACE = '00000000-0000-4000-8000-0000000000ff';

/**
 * R6 · les interrupteurs Studios d'un service applicatif de recette, sur son
 * environnement EFFECTIF (neutralise.env puis `environment:`) · décidés par la
 * règle du noyau (`capaciteActive`), jamais relus à la main :
 *  · chaque variable d'interrupteur (`ENV_INTERRUPTEURS`) est neutralisée ou
 *    posée : jamais héritée de .env.recette ;
 *  · aucune capacité incomplète ouverte au-delà de l'essai autorisé (pas 1
 *    partout, pas 2 dans le service d'outils seulement) ;
 *  · aucune capacité d'espace ouverte pour un autre espace que la recette ;
 *  · le service d'outils ouvre TOUT ce que l'essai exige (sinon le worker du
 *    pas 1 laisserait le job en file, et `--reel` refuserait).
 */
export function violationsInterrupteursRecette(nom: string, effectif: Readonly<Record<string, string | null | undefined>>, espaceRecette: string): string[] {
  const v: string[] = [];
  for (const variable of Object.values(ENV_INTERRUPTEURS)) {
    if (effectif[variable] === undefined) v.push(`Service « ${nom} » : ${variable} absente (ni neutralisée ni posée, donc héritée de .env.recette) · les interrupteurs de la recette ne viennent que du compose.`);
  }
  const env = Object.fromEntries(Object.entries(effectif).map(([k, x]) => [k, x ?? undefined]));
  for (const e of lireListeEnv(env[ENV_INTERRUPTEURS.espacesPilotes]).filter((x) => x.toLowerCase() !== espaceRecette.toLowerCase())) {
    v.push(`Service « ${nom} » : ${ENV_INTERRUPTEURS.espacesPilotes} nomme « ${e} » · seul l’espace de recette (${espaceRecette}) peut être pilote.`);
  }
  const autorisees: readonly CapaciteStudio[] = nom === SERVICE_OUTILS ? [...CAPACITES_ESSAI_RECETTE.pas1, ...CAPACITES_ESSAI_RECETTE.pas2] : CAPACITES_ESSAI_RECETTE.pas1;
  for (const c of CAPACITES_STUDIOS.filter((x) => DEFINITIONS_CAPACITES[x].maturite === 'incomplete')) {
    if (capaciteActive(c, { env, espace: espaceRecette }) && !autorisees.includes(c)) {
      v.push(`Service « ${nom} » : « ${c} » ouverte · seules ${autorisees.join(', ')} le sont en recette (essai réel autorisé).`);
    }
    if (DEFINITIONS_CAPACITES[c].portee === 'espace' && capaciteActive(c, { env, espace: AUTRE_ESPACE })) {
      v.push(`Service « ${nom} » : « ${c} » ouverte hors de l’espace de recette · ouverture par espace pilote seulement (${ENV_INTERRUPTEURS.espacesPilotes}=${espaceRecette}).`);
    }
  }
  if (nom === SERVICE_OUTILS) {
    for (const c of [...CAPACITES_ESSAI_RECETTE.pas1, ...CAPACITES_ESSAI_RECETTE.pas2]) {
      if (!capaciteActive(c, { env, espace: espaceRecette })) v.push(`Service « ${nom} » : « ${c} » coupée pour l’espace de recette · l’essai réel autorisé (pas 1 : ${CAPACITES_ESSAI_RECETTE.pas1.join(', ')} ; pas 2 : ${CAPACITES_ESSAI_RECETTE.pas2.join(', ')}) ne passerait pas la garde.`);
    }
  }
  return v;
}

const estObjet = (v: ValeurYaml | undefined): v is Objet => typeof v === 'object' && v !== null && !Array.isArray(v);
const objet = (v: ValeurYaml | undefined): Objet => (estObjet(v) ? v : {});
const liste = (v: ValeurYaml | undefined): ValeurYaml[] => (Array.isArray(v) ? v : v === undefined || v === '' ? [] : [v]);

/** `environment` sous forme d'objet ou de liste `- CLE=valeur` (valeur `null` si absente). */
export function environnement(service: Objet): Record<string, string | null> {
  const e = service.environment;
  if (estObjet(e)) return Object.fromEntries(Object.entries(e).map(([k, v]) => [k, typeof v === 'string' ? v : null]));
  const out: Record<string, string | null> = {};
  for (const x of liste(e)) {
    if (typeof x !== 'string') continue;
    const i = x.indexOf('=');
    if (i < 0) out[x] = null; else out[x.slice(0, i)] = x.slice(i + 1);
  }
  return out;
}

function scalaires(v: ValeurYaml, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => scalaires(x, out));
  else for (const [k, x] of Object.entries(v)) { out.push(k); scalaires(x, out); }
  return out;
}

/** Hôte et nom de base d'une URL `postgres://` (après interpolation des `${…}` neutralisée). */
function cibleUrl(url: string): { hote: string; chemin: string } | null {
  try {
    const u = new URL(url.replace(/\$\{[^}]*\}/g, 'x'));
    return { hote: u.hostname.toLowerCase(), chemin: u.pathname.replace(/^\//, '') };
  } catch { return null; }
}

/**
 * Volumes déclarés par les images de base utilisées en recette (instruction
 * VOLUME de leur Dockerfile officiel). Une image absente de cette table n'en
 * déclare pas pour ce projet ; en ajouter une avec VOLUME exige d'étendre la table.
 */
const VOLUMES_IMAGES: ReadonlyArray<readonly [RegExp, readonly string[]]> = [
  [/^redis(:|$)/, ['/data']],
  [/^(postgres|pgvector\/pgvector)(:|$)/, ['/var/lib/postgresql/data']],
];
export function volumesDeclaresParImage(image: string): readonly string[] {
  for (const [motif, chemins] of VOLUMES_IMAGES) if (motif.test(image)) return chemins;
  return [];
}

export interface NomsProduction { services: string[]; volumes: string[]; reseaux: string[]; envFiles: string[] }

/** Ce que la production nomme · lu dans `docker-compose.yml`, jamais recopié à la main. */
export function nomsProduction(prod: ValeurYaml): NomsProduction {
  const p = objet(prod);
  const services = objet(p.services);
  const envFiles = new Set<string>();
  for (const s of Object.values(services)) for (const f of liste(objet(s).env_file)) if (typeof f === 'string') envFiles.add(f);
  return {
    services: Object.keys(services),
    volumes: Object.keys(objet(p.volumes)),
    reseaux: ['default', ...Object.keys(objet(p.networks))],
    envFiles: [...envFiles],
  };
}

/**
 * Les violations du compose de recette, en phrases · liste vide = conforme.
 * Chaque phrase nomme le service et ce qui est partagé ou manquant.
 */
export function violationsComposeRecette(
  recette: ValeurYaml,
  prod: NomsProduction,
  o: { neutralise: Record<string, string>; externes: readonly string[]; /** R6 · l'espace synthétique de recette (`RECETTE.workspaceId`). */ espaceRecette: string },
): string[] {
  const v: string[] = [];
  const r = objet(recette);
  if (r.name !== NOM_PROJET_RECETTE) v.push(`Le projet compose doit s’appeler « ${NOM_PROJET_RECETTE} » (name:), lu « ${String(r.name ?? '')} ».`);

  for (const s of scalaires(recette)) {
    if (/\.env\.deploy/.test(s)) v.push(`Référence à .env.deploy (fichier de production) : « ${s} ».`);
    if (/caddy/i.test(s)) v.push(`Référence à Caddy (proxy public de production) : « ${s} ».`);
  }

  const volumes = objet(r.volumes);
  for (const [nom, def] of Object.entries(volumes)) {
    if (prod.volumes.includes(nom)) v.push(`Volume « ${nom} » : même nom qu’un volume de production.`);
    const d = objet(def);
    if (d.external !== undefined) v.push(`Volume « ${nom} » : externe (external) · il pourrait désigner un volume de production.`);
    if (d.name === undefined || !String(d.name).startsWith(NOM_PROJET_RECETTE)) v.push(`Volume « ${nom} » : nom explicite préfixé « ${NOM_PROJET_RECETTE} » exigé (lu « ${String(d.name ?? '')} »).`);
  }
  const reseaux = objet(r.networks);
  for (const [nom, def] of Object.entries(reseaux)) {
    if (prod.reseaux.includes(nom)) v.push(`Réseau « ${nom} » : même nom qu’un réseau de production.`);
    const d = objet(def);
    if (d.external !== undefined) v.push(`Réseau « ${nom} » : externe (external) · il pourrait joindre la production.`);
    if (d.name === undefined || !String(d.name).startsWith(NOM_PROJET_RECETTE)) v.push(`Réseau « ${nom} » : nom explicite préfixé « ${NOM_PROJET_RECETTE} » exigé (lu « ${String(d.name ?? '')} »).`);
  }

  const services = objet(r.services);
  if (!Object.keys(services).length) v.push('Aucun service déclaré.');
  for (const [nom, def] of Object.entries(services)) {
    const s = objet(def);
    if (prod.services.includes(nom)) v.push(`Service « ${nom} » : même nom qu’un service de production.`);
    if (!nom.endsWith('_recette')) v.push(`Service « ${nom} » : le nom doit finir par « _recette ».`);
    if (s.container_name !== undefined) v.push(`Service « ${nom} » : container_name interdit (sort du projet de recette).`);

    const envFiles = liste(s.env_file).map((f) => (typeof f === 'string' ? f : String(objet(f).path ?? '')));
    for (const chemin of envFiles) {
      if (prod.envFiles.includes(chemin)) v.push(`Service « ${nom} » : env_file « ${chemin} » est celui de la production.`);
      else if (chemin !== ENV_FILE_RECETTE && chemin !== ENV_FILE_NEUTRALISE) v.push(`Service « ${nom} » : env_file « ${chemin} » · seuls ${ENV_FILE_RECETTE} puis ${ENV_FILE_NEUTRALISE} sont admis.`);
    }

    for (const m of liste(s.volumes)) {
      if (typeof m !== 'string') { v.push(`Service « ${nom} » : montage en syntaxe longue non vérifiable.`); continue; }
      const source = m.split(':')[0]!;
      if (source.startsWith('.') || source.startsWith('/') || source.startsWith('~')) {
        if (!source.startsWith(DOSSIER_MONTAGES_RECETTE) || source.includes('..')) v.push(`Service « ${nom} » : montage « ${source} » hors de ${DOSSIER_MONTAGES_RECETTE}.`);
      } else if (!(source in volumes)) v.push(`Service « ${nom} » : volume « ${source} » non déclaré dans le projet de recette.`);
    }

    // Une image qui DÉCLARE un volume (VOLUME du Dockerfile) sans montage NOMMÉ
    // à ce chemin reçoit un volume ANONYME (nom en empreinte, sans le préfixe du
    // projet) : le préflight le refuserait comme partage possible, et `down -v`
    // ne le reconnaîtrait pas comme de la recette (constat E4, redis:7-alpine /data).
    const image = typeof s.image === 'string' ? s.image : '';
    for (const chemin of volumesDeclaresParImage(image)) {
      const monte = liste(s.volumes).some((m) => typeof m === 'string' && m.split(':')[1] === chemin && m.split(':')[0]! in volumes);
      if (!monte) v.push(`Service « ${nom} » : l’image « ${image} » déclare le volume « ${chemin} » · montage nommé préfixé « tiktrends-recette » exigé, sinon Docker crée un volume anonyme hors du projet.`);
    }

    const nets = s.networks;
    for (const n of estObjet(nets) ? Object.keys(nets) : liste(nets).map(String)) {
      if (!(n in reseaux)) v.push(`Service « ${nom} » : réseau « ${n} » non déclaré dans le projet de recette.`);
    }
    if (s.network_mode !== undefined) {
      const mode = String(s.network_mode);
      const cible = /^service:(.+)$/.exec(mode)?.[1];
      if (!cible || !(cible in services)) v.push(`Service « ${nom} » : network_mode « ${mode} » · seul « service:<service de recette> » est admis.`);
    }

    for (const p of liste(s.ports)) {
      if (typeof p !== 'string') { v.push(`Service « ${nom} » : port en syntaxe longue non vérifiable.`); continue; }
      if (!/^127\.0\.0\.1:\d+:\d+(\/(tcp|udp))?$/.test(p)) v.push(`Service « ${nom} » : port « ${p} » publié hors de 127.0.0.1 (jamais 0.0.0.0 ni toutes interfaces).`);
    }

    const env = environnement(s);
    if (s.build !== undefined) {
      if (envFiles.join('|') !== `${ENV_FILE_RECETTE}|${ENV_FILE_NEUTRALISE}`) v.push(`Service « ${nom} » : env_file doit être [${ENV_FILE_RECETTE}, ${ENV_FILE_NEUTRALISE}] dans cet ordre (le second l’emporte).`);
      // L'environnement EFFECTIF : neutralise.env (chargé en dernier) puis `environment:` qui l'emporte.
      const effectif: Record<string, string | null> = envFiles.includes(ENV_FILE_NEUTRALISE) ? { ...o.neutralise, ...env } : { ...env };
      for (const n of [...new Set([...VARIABLES_STOCKAGE, ...o.externes])]) {
        const val = effectif[n];
        if (nom === SERVICE_OUTILS && (CLES_PAYANTES as readonly string[]).includes(n)) {
          if (env[n] !== `\${${n}:-}`) v.push(`Service « ${nom} » : ${n} doit venir du shell du propriétaire (${n}: \${${n}:-}), jamais d’un fichier.`);
          continue;
        }
        if (val !== '') {
          const quoi = (VARIABLES_STOCKAGE as readonly string[]).includes(n) ? 'stockage propre à la recette exigé' : (CLES_PAYANTES as readonly string[]).includes(n) ? `seul ${SERVICE_OUTILS} reçoit une clé payante` : 'aucun service externe ni tâche planifiée en recette';
          v.push(`Service « ${nom} » : ${n} non neutralisée (${val === undefined ? 'absente, donc héritée de .env.recette' : `« ${val} »`}) · ${quoi}.`);
        }
      }
      v.push(...violationsInterrupteursRecette(nom, effectif, o.espaceRecette));
      const cmd = liste(s.command).map(String);
      const dockerfile = String(objet(s.build).dockerfile ?? '');
      if (dockerfile === 'Dockerfile.workers') {
        if (!cmd.length) v.push(`Service « ${nom} » : commande absente · l’image du worker lancerait src/index.ts et ses crons.`);
        else if (cmd.some((x) => /index\.ts|^start$/.test(x))) v.push(`Service « ${nom} » : commande « ${cmd.join(' ')} » · src/index.ts démarre crons, ingestion et jobs de démonstration.`);
        if (nom === 'workers_recette' && cmd.join(' ') !== COMMANDE_WORKER_RECETTE.join(' ')) v.push(`Service « ${nom} » : commande « ${cmd.join(' ')} » · seule « ${COMMANDE_WORKER_RECETTE.join(' ')} » (boucle Studios seule) est admise.`);
      }
      if (nom === SERVICE_OUTILS) {
        const cible = env.RECETTE_SORTIE;
        const monte = liste(s.volumes).some((m) => typeof m === 'string' && m.startsWith(DOSSIER_MONTAGES_RECETTE) && m.split(':')[1] === cible);
        if (!cible || !monte) v.push(`Service « ${nom} » : RECETTE_SORTIE doit être un dossier monté depuis ${DOSSIER_MONTAGES_RECETTE} (lu « ${cible ?? ''} »).`);
        // E2 · le registre cumulatif du budget vit sur la MACHINE, jamais dans un volume que `down -v` détruit.
        const reg = env.RECETTE_REGISTRE;
        const regMonte = liste(s.volumes).some((m) => typeof m === 'string' && m.split(':')[0] === DOSSIER_REGISTRE_RECETTE && m.split(':')[1] === reg);
        if (!reg || !regMonte) v.push(`Service « ${nom} » : RECETTE_REGISTRE doit être le dossier ${DOSSIER_REGISTRE_RECETTE} de la machine, monté (lu « ${reg ?? ''} ») · sans lui, une base neuve rouvrirait un budget déjà dépensé.`);
      }
      const brut = env.AI_SPEND_CAP_USD;
      const cap = brut === undefined || brut === null || brut.trim() === '' ? NaN : Number(brut);
      if (brut === undefined || brut === null) v.push(`Service « ${nom} » : AI_SPEND_CAP_USD absent · le plafond de l’essai doit être posé dans le compose.`);
      else if (!Number.isFinite(cap) || cap <= 0) v.push(`Service « ${nom} » : AI_SPEND_CAP_USD « ${brut} » illisible ou nul.`);
      else if (cap > BUDGET_ESSAI_USD) v.push(`Service « ${nom} » : AI_SPEND_CAP_USD ${brut} dépasse le budget d’essai de ${BUDGET_ESSAI_USD} $.`);
      if (env.TIKTRENDS_ENV !== 'recette') v.push(`Service « ${nom} » : TIKTRENDS_ENV doit valoir « recette ».`);
    }
    for (const [k, val] of Object.entries(env)) {
      if (val === null) continue;
      if (/^(DATABASE_URL|POSTGRES_URL)$/.test(k)) {
        const c = cibleUrl(val);
        if (!c) v.push(`Service « ${nom} » : ${k} illisible.`);
        else {
          if (prod.services.includes(c.hote)) v.push(`Service « ${nom} » : ${k} vise l’hôte « ${c.hote} », un service de production.`);
          if (!/recette/.test(c.chemin)) v.push(`Service « ${nom} » : ${k} vise la base « ${c.chemin} » · son nom doit contenir « recette ».`);
        }
      }
      if (k === 'REDIS_URL') {
        const c = cibleUrl(val);
        if (!c || !(c.hote in services)) v.push(`Service « ${nom} » : REDIS_URL doit viser un service du projet de recette (lu « ${c?.hote ?? val} »).`);
      }
    }
  }
  return v;
}

/* ─────────────────── commandes Docker du runbook et des scripts ─────────── */

/**
 * Les commandes Docker écrites dans le runbook, le compose ou un script de
 * recette ne visent QUE le projet `tiktrends-recette` · pur, lit le texte.
 *
 *  · toute commande `docker compose` porte `-p tiktrends-recette` ET
 *    `-f docker-compose.recette.yml` (sans eux, elle viserait le projet du
 *    dossier, c'est-à-dire la production) ;
 *  · aucun `prune` (système, volumes, réseaux, images, conteneurs) : il ne
 *    connaît pas les projets ;
 *  · `docker volume|network|container rm`, `docker rm`, `docker rmi` : chaque
 *    cible commence par `tiktrends-recette`.
 *
 * Dans un fichier Markdown, seules les lignes des blocs de code sont lues ;
 * le compose et les scripts sont lus en entier (commentaires compris).
 */
export function violationsCommandesDocker(texte: string, source: string): string[] {
  const v: string[] = [];
  // Markdown : seules les lignes des blocs de code sont des commandes (la prose peut NOMMER un interdit).
  let dansBloc = false;
  const md = source.endsWith('.md');
  texte.split('\n').forEach((ligne, i) => {
    if (md && /^\s*```/.test(ligne)) { dansBloc = !dansBloc; return; }
    if (md && !dansBloc) return;
    const ou = `${source}:${i + 1}`;
    for (const m of ligne.matchAll(/docker(?:-compose|\s+compose)?\s[^`|;&]*/g)) {
      const cmd = m[0].trim();
      if (/^docker(\s+(system|volume|network|image|container|builder))?\s+prune\b/.test(cmd)) v.push(`${ou} · « ${cmd} » : prune interdit, il ne connaît pas les projets.`);
      if (/^docker(-compose|\s+compose)\b/.test(cmd)) {
        if (!/(^|\s)(-p|--project-name)[\s=]tiktrends-recette(\s|$)/.test(cmd)) v.push(`${ou} · « ${cmd} » : -p tiktrends-recette manquant.`);
        if (!/(^|\s)(-f|--file)[\s=]docker-compose\.recette\.yml(\s|$)/.test(cmd)) v.push(`${ou} · « ${cmd} » : -f docker-compose.recette.yml manquant.`);
      }
      const rm = /^docker\s+(?:(?:volume|network|container|image)\s+rm|rm|rmi)\s+(.*)$/.exec(cmd);
      if (rm) {
        const cibles = rm[1]!.split(/\s+/).filter((x) => x && !x.startsWith('-'));
        if (!cibles.length || cibles.some((c) => !c.startsWith(NOM_PROJET_RECETTE))) v.push(`${ou} · « ${cmd} » : cible hors du projet tiktrends-recette.`);
      }
    }
  });
  return v;
}

/* ─────────────────── le registre du budget n'est jamais nettoyé (E2) ────── */

/**
 * Aucune commande du runbook ou d'un script de recette ne supprime, ne vide
 * ni ne déplace le registre cumulatif du budget (`ops/recette/registre`) :
 * ni lui, ni un dossier parent (`ops/recette`, `ops`), ni un motif qui
 * l'englobe (`ops/recette/*`). Sans lui, une base neuve rouvrirait un budget
 * déjà dépensé. Dans un fichier Markdown, seules les lignes des blocs de code
 * sont lues.
 */
export function violationsRegistre(texte: string, source: string): string[] {
  const v: string[] = [];
  let dansBloc = false;
  const md = source.endsWith('.md');
  texte.split('\n').forEach((ligne, i) => {
    if (md && /^\s*```/.test(ligne)) { dansBloc = !dansBloc; return; }
    if (md && !dansBloc) return;
    const t = ligne.replace(/#.*$/, '').trim();
    if (!t) return;
    for (const cmd of t.split(/&&|\|\||;/).map((x) => x.trim())) {
      const m = /^(?:sudo\s+)?(rm|mv|truncate|shred|find|rsync)\b(.*)$/.exec(cmd);
      if (!m) continue;
      const cibles = m[2]!.split(/\s+/).filter((x) => x && !x.startsWith('-')).map((x) => x.replace(/^["']|["']$/g, '').replace(/^\.\//, '').replace(/\/+$/, ''));
      const touche = cibles.some((c) => c === 'ops' || c === 'ops/recette' || /^ops\/recette\/\*/.test(c) || c.startsWith('ops/recette/registre') || /(^|\/)registre(\/|$)/.test(c) || /budget-essais/.test(c) || c === '.' || c === '*');
      if (touche) v.push(`${source}:${i + 1} · « ${cmd} » : touche au registre cumulatif du budget (ops/recette/registre) · il ne se supprime jamais.`);
    }
  });
  return v;
}
