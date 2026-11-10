import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ACTIONS_JOURNAL_CONNUES, ETATS_JOB, LIENS_AUDIT_ENTRE_PROJETS, etapeTechniqueJournal } from '@tiktrends/core';

/**
 * Lot 10 · garde de RECENSEMENT du journal d'un projet · chaque action que le
 * code écrit dans `studio_audit_events` (web, worker, noyau) est classée :
 *
 *  · connue · une phrase française au noyau (`ACTIONS_JOURNAL_CONNUES`) ;
 *  · étape interne du moteur · tue dans le journal (`etapeTechniqueJournal`) ;
 *  · hors projet · une action de portée plateforme ou espace qui ne vise
 *    jamais un objet d'un projet (table ci-dessous, raison écrite).
 *
 * Une action NOUVELLE, écrite sans être classée, fait tomber ce test avec son
 * nom et son fichier · sans lui, elle s'afficherait « Action enregistrée sur ce
 * projet » (neutre, jamais brute) sans que personne ne l'ait décidé. Une phrase
 * dont l'action n'est plus écrite nulle part tombe aussi (phrase morte).
 *
 * Les LIENS ENTRE PROJETS écrits dans les détails de l'audit
 * (`LIENS_AUDIT_ENTRE_PROJETS` · `copieDe`, la duplication) · chacun est écrit
 * par un fichier qui écrit l'audit (son écrivain du noyau) ET relu par le
 * journal du projet qu'il désigne (son lecteur du noyau, dans le module de
 * l'activité) · un lien écrit que personne ne relit (le projet source muet),
 * ou un lien recensé que plus rien n'écrit, fait tomber ce test avec son nom.
 */

const PRODUIT = join(__dirname, '..', '..', '..');
const RACINES = ['apps/web/lib', 'apps/web/app', 'apps/workers/src', 'packages/core/src'];

/** Portée plateforme ou espace · jamais un objet d'un projet. */
const HORS_PROJET: Record<string, string> = {
  'prompt.*': 'registre des prompts · portée plateforme (`/admin/prompts`)',
  'studios.budget_essai': 'budget d’essai de l’espace · réglage administrateur',
  'studios.interrupteurs': 'interrupteurs des capacités de l’espace · réglage administrateur',
  'equipe.membre.retire': 'membres de l’équipe plateforme',
  'equipe.membre.role': 'membres de l’équipe plateforme',
};

function fichiers(d: string, out: string[] = []): string[] {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}

/** Les actions écrites · littéraux après `action:`, constantes `ACTION…` (résolues dans le fichier d'abord), gabarits `x.${…}`, et l'action passée à `poser(…)`. */
function actionsEcrites(): Map<string, string> {
  const tous = RACINES.flatMap((r) => fichiers(join(PRODUIT, r)));
  const globales = new Map<string, string>();
  const lire = (src: string) => new Map([...src.matchAll(/const (ACTION[A-Z_]*)\s*=\s*'([^']+)'/g)].map((m) => [m[1]!, m[2]!]));
  for (const f of tous) for (const [k, v] of lire(readFileSync(f, 'utf8'))) if (k !== 'ACTION') globales.set(k, v);
  const out = new Map<string, string>();
  for (const f of tous) {
    const s = readFileSync(f, 'utf8');
    if (!/ajouterAudit\(|studioAuditEvents\)\.values\(/.test(s)) continue;
    const locales = lire(s);
    const ou = relative(PRODUIT, f);
    for (const m of s.matchAll(/\baction\s*:\s*([^,}\n]+)/g)) {
      const e = m[1]!;
      for (const l of e.matchAll(/'([a-z][a-z_]*(?:\.[a-z_]+)+)'/g)) out.set(l[1]!, ou);
      for (const c of e.matchAll(/\b(ACTION[A-Z_]*)\b/g)) out.set(locales.get(c[1]!) ?? globales.get(c[1]!) ?? `?${c[1]}`, ou);
      for (const t of e.matchAll(/`([a-z]+)\.\$\{/g)) out.set(`${t[1]}.*`, ou);
    }
    for (const m of s.matchAll(/poser\([^)]*'(media\.[a-z_.]+)'\)/g)) out.set(m[1]!, ou);
  }
  return out;
}

const classe = (a: string): 'connue' | 'technique' | 'hors projet' | null => {
  if (ACTIONS_JOURNAL_CONNUES.includes(a)) return 'connue';
  if (a === 'job.*') return ETATS_JOB.filter((e) => e !== 'cancel_requested').every((e) => etapeTechniqueJournal(`job.${e}`)) ? 'technique' : null;
  if (a === 'webhook.*' || etapeTechniqueJournal(a)) return etapeTechniqueJournal(a === 'webhook.*' ? 'webhook.x' : a) ? 'technique' : null;
  if (HORS_PROJET[a] || Object.keys(HORS_PROJET).some((k) => k.endsWith('.*') && a.startsWith(k.slice(0, -1)))) return 'hors projet';
  return null;
};

/** L'écrivain et le lecteur du noyau de chaque lien entre projets. */
const LIENS: Record<string, { ecrit: RegExp; lu: RegExp }> = {
  copieDe: { ecrit: /\bdetailsCopieDe\(/, lu: /\bliensDeCopie\(/ },
};

function liensEntreProjets(): Array<{ cle: string; ecritPar: string[]; luPar: string[] }> {
  const tous = RACINES.flatMap((r) => fichiers(join(PRODUIT, r)));
  return LIENS_AUDIT_ENTRE_PROJETS.map(({ cle }) => {
    const l = LIENS[cle];
    if (!l) return { cle, ecritPar: [], luPar: [] };
    const sources = tous.map((f) => ({ f: relative(PRODUIT, f), s: readFileSync(f, 'utf8') }));
    return {
      cle,
      ecritPar: sources.filter((x) => /ajouterAudit\(/.test(x.s) && l.ecrit.test(x.s)).map((x) => x.f),
      luPar: sources.filter((x) => /lireJournalPour/.test(x.s) && l.lu.test(x.s)).map((x) => x.f),
    };
  });
}

describe('lot 10 · le journal classe chaque action écrite dans l’audit des studios', () => {
  const ecrites = actionsEcrites();

  it('le recensement trouve les actions connues (la garde regarde la bonne chose)', () => {
    expect(ecrites.size).toBeGreaterThan(40);
    for (const a of ['project.rename', 'project.export.review', 'image.batch.quote', 'media.reject', 'job.*', 'webhook.*', 'prompt.release.publier']) expect([...ecrites.keys()], a).toContain(a);
    expect([...ecrites.keys()].filter((a) => a.startsWith('?')), 'constante d’action non résolue').toEqual([]);
  });

  it('aucune action écrite n’est sans classe · une nouvelle action dit son nom et son fichier', () => {
    const orphelines = [...ecrites.entries()].filter(([a]) => classe(a) === null).map(([a, f]) => `${a} (${f}) · ajoute sa phrase à PHRASES_AUDIT (C/studios/activite/journal.ts), ou classe-la ici avec sa raison`);
    expect(orphelines).toEqual([]);
  });

  it('aucune phrase morte · chaque action connue est encore écrite quelque part', () => {
    expect(ACTIONS_JOURNAL_CONNUES.filter((a) => !ecrites.has(a))).toEqual([]);
  });

  it('chaque lien entre projets écrit dans l’audit est relu par le journal du projet qu’il désigne', () => {
    const liens = liensEntreProjets();
    expect(liens.map((l) => l.cle), 'les liens recensés (noyau)').toEqual(Object.keys(LIENS));
    expect(liens.filter((l) => l.ecritPar.length === 0).map((l) => `${l.cle} · recensé mais écrit nulle part dans l’audit`)).toEqual([]);
    expect(liens.filter((l) => l.luPar.length === 0).map((l) => `${l.cle} · écrit dans l’audit mais relu par aucun journal · le projet désigné reste muet`)).toEqual([]);
  });

  it('chaque action hors projet de la table est encore écrite (table à jour)', () => {
    expect(Object.keys(HORS_PROJET).filter((k) => ![...ecrites.keys()].some((a) => (k.endsWith('.*') ? a.startsWith(k.slice(0, -1)) : a === k)))).toEqual([]);
  });
});
