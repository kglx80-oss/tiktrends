import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { empreinteContenu, sha256Texte } from '../src/prompts/empreinte';
import { entreesDuPack, type EntreeRegistre } from '../src/prompts/pack';
import {
  autorise, controlerNouvelleVersion, controlerPublication, empreinteRelease, epinglerAuDevis, publierRelease, releaseDuJob,
  resoudreReleaseEvaluation, retirerRelease, rollbackRelease, transitionVersion,
  type ContenuRelease, type ContratConsommateur, type Octroi, type Pointeur, type Release,
} from '../src/prompts/release';
import type { PackPrompts, TemplatePrompt } from '../src/prompts/types';

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const TEXTE = readFileSync(join(DOSSIER, '02-PROMPTS.json'), 'utf8');
const neuf = () => JSON.parse(TEXTE) as PackPrompts;

const PLATEFORME = { niveau: 'plateforme' } as const;
const ADMIN_PLATEFORME: Octroi[] = (['prompt.draft', 'prompt.evaluate', 'prompt.publish', 'prompt.rollback'] as const).map((permission) => ({ permission, portee: PLATEFORME }));
const ADMIN_ESPACE: Octroi[] = (['prompt.draft', 'prompt.evaluate', 'prompt.publish', 'prompt.rollback'] as const).map((permission) => ({ permission, portee: { niveau: 'espace', espaceId: 'esp-1' } }));

/** Ce que le code consomme aujourd'hui · les contrats du pack livré. */
const CONSOMMATEURS: ContratConsommateur[] = neuf().templates.map(({ key, inputSchemaRef, outputSchemaRef }) => ({ key, inputSchemaRef, outputSchemaRef }));

function monter(pack: PackPrompts, id: string): { release: Release; contenu: ContenuRelease; registre: EntreeRegistre[] } {
  // Empreintes calculées directement · le registre peut contenir un brouillon que validerPack refuserait.
  const empreintes = {
    templates: Object.fromEntries(pack.templates.map((t) => [t.key, empreinteContenu(t as unknown as Record<string, unknown>)])),
    recettes: Object.fromEntries(pack.styleRecipes.map((r) => [r.id, empreinteContenu(r as unknown as Record<string, unknown>)])),
    commonSystemHash: sha256Texte(pack.commonSystemInstructions),
    rendering: empreinteContenu(pack.rendering as unknown as Record<string, unknown>),
  };
  const registre = entreesDuPack(pack, empreintes).map((e) => ({ ...e, statut: 'validated' as const }));
  const contenu: ContenuRelease = { commonSystemInstructions: pack.commonSystemInstructions, rendering: pack.rendering, templates: pack.templates, styleRecipes: pack.styleRecipes };
  const hash = empreinteRelease(contenu);
  const entree = (type: EntreeRegistre['type'], cle: string) => {
    const e = registre.find((x) => x.type === type && x.cle === cle)!;
    return { cle: e.cle, version: e.version, contentHash: e.contentHash };
  };
  return {
    contenu, registre,
    release: {
      id, portee: PLATEFORME, statut: 'staged', hash,
      templates: pack.templates.map((t) => entree('template', t.key)),
      recettes: pack.styleRecipes.map((r) => entree('recette', r.id)),
      socle: entree('socle', 'commonSystemInstructions'), rendu: entree('rendu', 'rendering'),
      evaluation: { releaseHash: hash, testsStructurels: true, benchmarkApprouve: true, approuvePar: 'kevin' },
    },
  };
}

/** Reconstruit un template avec un champ changé ET une empreinte juste · un brouillon honnête. */
function reecrire(t: TemplatePrompt, sur: Partial<TemplatePrompt>): TemplatePrompt {
  const u = { ...t, ...sur, version: '1.1.0' };
  return { ...u, contentHash: empreinteContenu(u as unknown as Record<string, unknown>) };
}

const pointeurVide: Pointeur = { portee: PLATEFORME, releaseId: null };

describe('release · publication', () => {
  it('publie une release complète, validée, évaluée · staged → active, pointeur déplacé', () => {
    const { release, contenu, registre } = monter(neuf(), 'rel-A');
    const r = publierRelease({ release, contenu, registre, consommateurs: CONSOMMATEURS, environnement: 'production', octrois: ADMIN_PLATEFORME, pointeur: pointeurVide, attendue: null });
    expect(r).toEqual({ ok: true, changement: { pointeur: { portee: PLATEFORME, releaseId: 'rel-A' }, transitions: [{ releaseId: 'rel-A', de: 'staged', vers: 'active' }], audit: { action: 'release.publier', releaseAvant: null, releaseApres: 'rel-A' } } });
  });

  it('PROMPT-09 · release incompatible avec un consommateur : refusée avant exposition', () => {
    const p = neuf();
    const i = p.templates.findIndex((t) => t.key === 'voice.prepare');
    p.templates[i] = reecrire(p.templates[i]!, { outputSchemaRef: '03-CONTRATS.schema.json#/$defs/text_write_output' });
    const { release, contenu, registre } = monter(p, 'rel-B');
    const c = controlerPublication({ release, contenu, registre, consommateurs: CONSOMMATEURS, environnement: 'production', octrois: ADMIN_PLATEFORME, pointeur: pointeurVide, attendue: null });
    expect(c).toEqual([expect.objectContaining({ code: 'SCHEMA_INCOMPATIBLE', cible: 'voice.prepare' })]);
  });

  it('refuse une clé requise absente', () => {
    const p = neuf();
    p.templates = p.templates.filter((t) => t.key !== 'batch.plan');
    const { release, contenu, registre } = monter(p, 'rel-C');
    const c = controlerPublication({ release, contenu, registre, consommateurs: CONSOMMATEURS, environnement: 'test', octrois: ADMIN_PLATEFORME, pointeur: pointeurVide, attendue: null });
    expect(c.map((x) => x.code)).toEqual(['CLE_REQUISE_ABSENTE']);
  });

  it('refuse une version encore en brouillon, une variable non résolue, une empreinte de release fausse', () => {
    const p = neuf();
    const i = p.templates.findIndex((t) => t.key === 'text.write');
    p.templates[i] = reecrire(p.templates[i]!, { userTemplate: `${p.templates[i]!.userTemplate} MARQUE={{brandName}}` });
    const { release, contenu, registre } = monter(p, 'rel-D');
    const brouillon = registre.map((e) => (e.cle === 'brief.build' ? { ...e, statut: 'draft' as const } : e));
    const c = controlerPublication({ release: { ...release, hash: 'f'.repeat(64) }, contenu, registre: brouillon, consommateurs: CONSOMMATEURS, environnement: 'test', octrois: ADMIN_PLATEFORME, pointeur: pointeurVide, attendue: null });
    expect(c.map((x) => x.code)).toEqual(['VERSION_NON_VALIDEE', 'VARIABLE_NON_RESOLUE', 'RELEASE_EMPREINTE_FAUSSE', 'TESTS_STRUCTURELS_ABSENTS']);
  });

  it('une release non évaluée ne devient pas active en production · possible en test', () => {
    const { release, contenu, registre } = monter(neuf(), 'rel-E');
    const nonEvaluee = { ...release, evaluation: { ...release.evaluation!, benchmarkApprouve: false } };
    const args = { release: nonEvaluee, contenu, registre, consommateurs: CONSOMMATEURS, octrois: ADMIN_PLATEFORME, pointeur: pointeurVide, attendue: null };
    expect(controlerPublication({ ...args, environnement: 'production' }).map((x) => x.code)).toEqual(['BENCHMARK_NON_APPROUVE']);
    expect(controlerPublication({ ...args, environnement: 'test' })).toEqual([]);
    const autreHash = { ...release, evaluation: { ...release.evaluation!, releaseHash: 'e'.repeat(64) } };
    expect(controlerPublication({ ...args, release: autreHash, environnement: 'production' }).map((x) => x.code)).toEqual(['TESTS_STRUCTURELS_ABSENTS', 'BENCHMARK_NON_APPROUVE']);
  });

  it('SEC-09 · un admin d’espace ne publie pas une release globale ; compare-and-set sur le pointeur', () => {
    const { release, contenu, registre } = monter(neuf(), 'rel-F');
    const args = { release, contenu, registre, consommateurs: CONSOMMATEURS, environnement: 'production' as const, pointeur: { portee: PLATEFORME, releaseId: 'rel-A' }, attendue: 'rel-A' };
    expect(controlerPublication({ ...args, octrois: ADMIN_ESPACE }).map((x) => x.code)).toEqual(['FORBIDDEN']);
    expect(controlerPublication({ ...args, octrois: ADMIN_PLATEFORME, attendue: null }).map((x) => x.code)).toEqual(['VERSION_CONFLICT']);
  });
});

describe('release · rollback, retrait, évaluation', () => {
  const A = { ...monter(neuf(), 'rel-A').release, statut: 'active' as const };
  const B = { ...monter(neuf(), 'rel-B').release, statut: 'active' as const };
  const pointeB: Pointeur = { portee: PLATEFORME, releaseId: 'rel-B' };

  it('PROMPT-07 · rollback = changement de pointeur seul, aucune transition', () => {
    const r = rollbackRelease({ cible: A, pointeur: pointeB, attendue: 'rel-B', octrois: ADMIN_PLATEFORME, environnement: 'production' });
    expect(r).toEqual({ ok: true, changement: { pointeur: { portee: PLATEFORME, releaseId: 'rel-A' }, transitions: [], audit: { action: 'release.rollback', releaseAvant: 'rel-B', releaseApres: 'rel-A' } } });
  });
  it('refuse le rollback vers une release jamais publiée, retirée, révoquée, ou sans permission', () => {
    expect(rollbackRelease({ cible: { ...A, statut: 'staged' }, pointeur: pointeB, attendue: 'rel-B', octrois: ADMIN_PLATEFORME, environnement: 'test' })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'ROLLBACK_INTERDIT' })] });
    expect(rollbackRelease({ cible: { ...A, statut: 'retired' }, pointeur: pointeB, attendue: 'rel-B', octrois: ADMIN_PLATEFORME, environnement: 'test' })).toMatchObject({ ok: false });
    expect(rollbackRelease({ cible: { ...A, revocation: { motif: 'fuite' } }, pointeur: pointeB, attendue: 'rel-B', octrois: ADMIN_PLATEFORME, environnement: 'test' })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'RELEASE_REVOQUEE' })] });
    expect(rollbackRelease({ cible: A, pointeur: pointeB, attendue: 'rel-B', octrois: ADMIN_ESPACE, environnement: 'test' })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'FORBIDDEN' })] });
  });
  it('ne retire jamais la release qui sert', () => {
    expect(retirerRelease({ release: B, pointeur: pointeB, octrois: ADMIN_PLATEFORME })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'RELEASE_EN_SERVICE' })] });
    expect(retirerRelease({ release: A, pointeur: pointeB, octrois: ADMIN_PLATEFORME })).toEqual({ ok: true, transition: { releaseId: 'rel-A', de: 'active', vers: 'retired' } });
  });
  it('évaluation : staged exacte, prompt.evaluate, données synthétiques, pointeur intact', () => {
    const S = monter(neuf(), 'rel-S').release;
    expect(resoudreReleaseEvaluation({ release: S, octrois: ADMIN_PLATEFORME, donneesSynthetiques: true })).toEqual({ ok: true, releaseId: 'rel-S', releaseHash: S.hash, budget: 'evaluation' });
    expect(resoudreReleaseEvaluation({ release: S, octrois: ADMIN_PLATEFORME, donneesSynthetiques: false })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'DONNEES_REELLES_INTERDITES' })] });
    expect(resoudreReleaseEvaluation({ release: A, octrois: ADMIN_PLATEFORME, donneesSynthetiques: true })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'EVALUATION_HORS_STAGED' })] });
  });
});

describe('release · épinglage au devis (PROMPT-06)', () => {
  const A = { ...monter(neuf(), 'rel-A').release, statut: 'active' as const };
  const B = { ...monter(neuf(), 'rel-B').release, statut: 'active' as const };

  it('le job garde la release du devis quand le pointeur passe à B, même si A est retirée', () => {
    const devis = epinglerAuDevis({ portee: PLATEFORME, releaseId: 'rel-A' }, [A, B]);
    if (!devis.ok) throw new Error('épinglage');
    expect(devis.epinglage).toEqual({ promptReleaseId: 'rel-A', releaseHash: A.hash });
    expect(releaseDuJob(devis.epinglage, [A, B])).toEqual({ ok: true, release: A });
    expect(releaseDuJob(devis.epinglage, [{ ...A, statut: 'retired' }, B])).toMatchObject({ ok: true, release: { id: 'rel-A' } });
    const nouveau = epinglerAuDevis({ portee: PLATEFORME, releaseId: 'rel-B' }, [A, B]);
    expect(nouveau).toMatchObject({ ok: true, epinglage: { promptReleaseId: 'rel-B' } });
  });
  it('une révocation de sécurité bloque le job épinglé, avec son motif', () => {
    const r = releaseDuJob({ promptReleaseId: 'rel-A', releaseHash: A.hash }, [{ ...A, revocation: { motif: 'consigne dangereuse' } }]);
    expect(r).toEqual({ ok: false, constats: [expect.objectContaining({ code: 'RELEASE_REVOQUEE', message: expect.stringContaining('consigne dangereuse') })] });
  });
  it('pas de pointeur actif : aucun devis, aucun repli', () => {
    expect(epinglerAuDevis(pointeurVide, [A])).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'RELEASE_ACTIVE_ABSENTE' })] });
  });
});

describe('versions · draft → validated → retired', () => {
  const v = { type: 'template' as const, cle: 'brief.build', version: '1.0.0' };
  it('valide un brouillon contrôlé ; jamais un validé ne redevient brouillon', () => {
    expect(transitionVersion({ entree: { ...v, statut: 'draft' }, vers: 'validated', octrois: ADMIN_PLATEFORME, controlesStructurels: [] })).toEqual({ ok: true, statut: 'validated' });
    expect(transitionVersion({ entree: { ...v, statut: 'draft' }, vers: 'validated', octrois: ADMIN_PLATEFORME })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'CONTROLES_ABSENTS' })] });
    expect(transitionVersion({ entree: { ...v, statut: 'validated' }, vers: 'draft', octrois: ADMIN_PLATEFORME })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'TRANSITION_INTERDITE' })] });
    expect(transitionVersion({ entree: { ...v, statut: 'validated' }, vers: 'retired', octrois: ADMIN_PLATEFORME, enService: true })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'VERSION_EN_SERVICE' })] });
    expect(transitionVersion({ entree: { ...v, statut: 'draft' }, vers: 'validated', octrois: ADMIN_ESPACE, controlesStructurels: [] })).toMatchObject({ ok: false, constats: [expect.objectContaining({ code: 'FORBIDDEN' })] });
  });
  it('une nouvelle version dépasse toutes les existantes', () => {
    const existantes = [{ cle: 'brief.build', version: '1.0.0' }, { cle: 'brief.build', version: '1.2.0' }];
    expect(controlerNouvelleVersion('brief.build', '1.1.0', existantes).map((c) => c.code)).toEqual(['VERSION_NON_CROISSANTE']);
    expect(controlerNouvelleVersion('brief.build', '1.10.0', existantes)).toEqual([]);
  });
});

describe('permissions · plateforme et espace séparés', () => {
  it('l’octroi d’espace couvre ses marques, pas un autre espace ni la plateforme ; l’octroi plateforme ne couvre pas un espace', () => {
    expect(autorise(ADMIN_ESPACE, 'prompt.publish', { niveau: 'marque', espaceId: 'esp-1', marqueId: 'm-1' })).toBe(true);
    expect(autorise(ADMIN_ESPACE, 'prompt.publish', { niveau: 'marque', espaceId: 'esp-2', marqueId: 'm-1' })).toBe(false);
    expect(autorise(ADMIN_ESPACE, 'prompt.publish', PLATEFORME)).toBe(false);
    expect(autorise(ADMIN_PLATEFORME, 'prompt.publish', { niveau: 'espace', espaceId: 'esp-1' })).toBe(false);
  });
});
