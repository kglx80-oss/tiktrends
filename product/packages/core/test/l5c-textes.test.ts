import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { creerValidateurContrats } from '../src/prompts/contrats';
import type { PackPrompts } from '../src/prompts/types';
import { contenuVide, type ContenuVersion, type DocumentStudio } from '../src/studios/document';
import { appliquerPatch } from '../src/studios/patch';
import { formatUsd } from '../src/studios/propositions/presentation';
import {
  entreeEcriture, relireVariantes, ligneTexte, lireLigneTexte, lireTextesBrief, validerSaisieTexte, changementsTextes,
  comparerTextes, exporterTextes, coutMaximalTexte, disponibiliteTextes, injectionDansCalque, calquesTexte,
  LIMITE_CARACTERES, LIMITE_MESUREE, type TexteStudio,
} from '../src/studios/textes';
import { HEADLINE_FLOOR } from '../src/copy-budget';
import { brief, contenuAvecBrief } from './l5c-fixtures';

/**
 * L5-C · Textes IA liés au MÊME brief (cahier §4.7) · entrée conforme au
 * contrat `text_write_input` (Ajv), seconde garde sur la sortie, lignes du
 * brief relues sans perte, comparaison, export sans média (FLOW-10),
 * injection dans un calque texte, coût jamais gratuit.
 */

const DOSSIER = join(__dirname, '../../../../docs/studios-v2');
const lire = (f: string) => JSON.parse(readFileSync(join(DOSSIER, f), 'utf8')) as Record<string, unknown>;
const validateur = creerValidateurContrats(lire('03-CONTRATS.schema.json'), (lire('02-PROMPTS.json') as unknown as PackPrompts).templates);
const VERSION = '44444444-4444-4444-8444-444444444444';

function contexteComplet(e: ReturnType<typeof entreeEcriture>) {
  return {
    tenantId: 'ws_a', brandId: 'b_a1', projectVersionId: VERSION, language: e.language, authorizedSourceIds: [], facts: e.facts, invariants: e.invariants,
    references: [], selectionIds: [], allowedPaths: [], knowledgeVersionIds: [], historySummary: '', sourceExcerpts: [], knowledgeExcerpts: [],
    resolvedDocuments: e.resolvedDocuments, allocatedIds: e.allocatedIds, mediaBindings: [],
  };
}

describe('text.write · le MÊME brief, ses faits, son hypothèse', () => {
  it('entrée conforme au contrat (Ajv) · le brief en document résolu validé, ses faits citables, les identifiants alloués', () => {
    const b = brief();
    const e = entreeEcriture({ brief: b, versionId: VERSION, type: 'hook', maxCaracteres: LIMITE_CARACTERES.hook, nombre: 3, langue: 'fr' });
    expect(validateur.validerEntree('text.write', { context: contexteComplet(e), taskInputs: e.taskInputs })).toEqual({ ok: true });
    expect(validateur.validerDefinition('Fact', e.resolvedDocuments[0]!.content)).toEqual({ ok: true });
    expect(e.taskInputs).toEqual({ briefId: `brief_${VERSION}`, contentType: 'hook', maxCharacters: HEADLINE_FLOOR, variantCount: 3 });
    expect(e.facts.map((f) => f.id)).toEqual(b.facts.map((f) => f.id));
    const resume = (e.resolvedDocuments[0]!.content as { claim: string }).claim;
    expect(resume).toContain('Hypothèse : Une accroche sur la tenue en course augmente le taux de clic.');
    expect(resume).toContain('Variable testée : Accroche');
    expect(e.invariants).toContain('Seule la variable du test change : Accroche');
    expect(e.allocatedIds.map((a) => a.id)).toEqual(['txv_1', 'txv_2', 'txv_3']);
  });

  it('limite du hook = palier MESURÉ (HEADLINE_FLOOR) ; les autres = borne du contrat, dite non mesurée', () => {
    expect(LIMITE_CARACTERES.hook).toBe(HEADLINE_FLOOR);
    expect(LIMITE_MESUREE).toEqual({ hook: true, ad_copy: false, cta: false, script: false });
  });

  it('seconde garde sur la sortie · fait inventé écarté, trop long écarté, autre variable signalée', () => {
    const b = brief();
    const sortie = {
      status: 'ready', questions: [], warnings: [], evidenceIds: [],
      result: { variants: [
        { id: 'txv_1', text: 'Elles tiennent jusqu’au dernier kilomètre.', claimSourceIds: ['produit.promesse'], changedVariable: 'Accroche' },
        { id: 'txv_2', text: 'Recommandées par 9 coureurs sur 10.', claimSourceIds: ['avis_inventes'], changedVariable: 'Accroche' },
        { id: 'txv_3', text: 'Un hook beaucoup trop long pour tenir dans le palier mesuré de la police.', claimSourceIds: [], changedVariable: 'Accroche' },
        { id: 'txv_4', text: '-20 % ce week-end.', claimSourceIds: [], changedVariable: 'Offre' },
      ] },
    };
    expect(validateur.validerSortie('text.write', sortie)).toEqual({ ok: true });
    const r = relireVariantes(sortie.result, { brief: b, type: 'hook', maxCaracteres: HEADLINE_FLOOR, langue: 'fr' });
    expect(r.variantes.map((v) => v.texte)).toEqual(['Elles tiennent jusqu’au dernier kilomètre.', '-20 % ce week-end.']);
    expect(r.variantes[1]).toMatchObject({ horsVariable: true, variable: 'Offre' });
    expect(r.variantes[0]).toMatchObject({ horsVariable: false, sources: ['produit.promesse'] });
    expect(r.ecartees.map((x) => x.id)).toEqual(['txv_2', 'txv_3']);
    expect(r.ecartees[0]!.raison).toContain('avis_inventes');
  });
});

describe('textes retenus · lignes de brief.texts relues sans perte', () => {
  it('aller-retour type, langue, texte (multi-lignes), sources · un texte libre reste intact', () => {
    const t = { type: 'script' as const, langue: 'fr', texte: 'Plan 1 : départ.\nPlan 2 : il court, les lunettes tiennent.', sources: ['produit.promesse', 'hyp_1'] };
    const l = ligneTexte(t);
    expect(l.startsWith('Script (fr) · Plan 1')).toBe(true);
    expect(lireLigneTexte(l)).toMatchObject(t);
    expect(lireLigneTexte('Accroche libre écrite ailleurs')).toMatchObject({ type: 'libre', texte: 'Accroche libre écrite ailleurs' });
  });

  it('saisie manuelle · une allégation ne cite qu’un fait du brief', () => {
    const b = brief();
    expect(validerSaisieTexte({ type: 'cta', texte: 'Je cours avec', sources: ['produit.prix'] }, b).ok).toBe(true);
    expect(validerSaisieTexte({ type: 'cta', texte: 'Je cours avec', sources: ['fait_invente'] }, b)).toMatchObject({ ok: false, violations: [{ chemin: 'texte/sources/0' }] });
    expect(validerSaisieTexte({ type: 'slogan', texte: 'x' }, b).ok).toBe(false);
  });

  it('enregistrer remplace la liste entière (aucun indice positionnel) · la version reste valide', () => {
    const c = contenuAvecBrief();
    const t1 = validerSaisieTexte({ type: 'hook', texte: 'Elles ne bougent pas.', sources: ['produit.promesse'] }, brief());
    if (!t1.ok) throw new Error('t1');
    const p = appliquerPatch(c, changementsTextes([t1.texte], 'Hook retenu'), ['/brief']);
    if (!p.ok) throw new Error(JSON.stringify(p.violations));
    expect(lireTextesBrief(p.resultat.brief as never)).toEqual([t1.texte]);
  });
});

describe('comparer, exporter sans média, coût annoncé', () => {
  it('comparaison mot à mot', () => {
    const c = comparerTextes('Elles tiennent pendant la course.', 'Elles tiennent jusqu’au dernier kilomètre.');
    expect(c.segments[0]).toEqual({ type: 'egal', texte: 'Elles tiennent ' });
    expect(c.segments.filter((s) => s.type === 'retire').map((s) => s.texte).join('')).toContain('pendant');
    expect(c.segments.filter((s) => s.type === 'ajoute').map((s) => s.texte).join('')).toContain('kilomètre');
    expect(c.motsCommuns).toBe(2);
  });

  it('export Markdown, CSV (guillemets échappés), JSON · faits cités relus', () => {
    const b = brief();
    const t: TexteStudio[] = [
      { id: 'a', type: 'hook', langue: 'fr', texte: 'Elles tiennent "vraiment".', sources: ['produit.promesse'] },
      { id: 'b', type: 'cta', langue: 'fr', texte: 'Je cours avec', sources: [] },
    ];
    const meta = { titre: 'Lunettes · rentrée', marque: 'Marque A1', versionN: 3, versionId: VERSION, exporteLe: '2026-10-08T09:00:00.000Z', brief: b };
    const md = exporterTextes(t, meta, 'markdown');
    expect(md.nomFichier).toBe('textes-lunettes-rentree-v3.md');
    expect(md.contenu).toContain('## Hook');
    expect(md.contenu).toContain('Source : produit.promesse · Promesse (bénéfice clé) : Tiennent pendant la course');
    expect(md.contenu).toContain('aucune génération');
    expect(exporterTextes(t, meta, 'csv').contenu).toContain('"Elles tiennent ""vraiment""."');
    const j = JSON.parse(exporterTextes(t, meta, 'json').contenu) as { schema: string; textes: Array<{ sources: Array<{ fait: string | null }> }> };
    expect(j.schema).toBe('tiktrends.studio.textes/1');
    expect(j.textes[0]!.sources[0]!.fait).toContain('Tiennent pendant la course');
  });

  it('coût maximal d’un appel annoncé, jamais nul · indisponibilité dite sans release, saisie manuelle ouverte', () => {
    expect(formatUsd(coutMaximalTexte('claude-sonnet-5'))).toBe('0,14 $');
    const d = disponibiliteTextes({ briefPresent: true, peutProposer: true, releasePubliee: false, fournisseurConfigure: true, plafondAtteint: false, modele: 'claude-sonnet-5' });
    expect(d).toMatchObject({ disponible: false, motif: 'RELEASE_ACTIVE_ABSENTE' });
    expect(d.coutMaxUsd).toBeGreaterThan(0);
    expect(d.raison).toContain('écris tes textes ci-dessous');
    expect(disponibiliteTextes({ briefPresent: true, peutProposer: true, releasePubliee: true, fournisseurConfigure: true, plafondAtteint: false, modele: 'claude-sonnet-5' }).disponible).toBe(true);
  });
});

describe('injection explicite dans UN calque texte', () => {
  const doc: DocumentStudio = {
    width: 1080, height: 1350, colorSpace: 'sRGB', fonts: {},
    layers: {
      l_titre: { id: 'l_titre', kind: 'text', name: 'Titre', visible: true, locked: false, x: 0, y: 0, width: 800, height: 200, rotationDeg: 0, opacity: 1, z: 2, text: 'Ancien titre', fontId: 'f', fontSizePx: 64, color: '#ffffff', align: 'center', lineHeight: 1.1 },
      l_fond: { id: 'l_fond', kind: 'shape', name: 'Fond', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1350, rotationDeg: 0, opacity: 1, z: 1, shape: 'rect', fill: '#000000' },
    },
  };
  const c: ContenuVersion = { ...contenuVide(), document: doc };

  it('calque texte choisi · cible et chemin bornés au texte du calque', () => {
    expect(calquesTexte(c)).toEqual([{ id: 'l_titre', nom: 'Titre', texte: 'Ancien titre' }]);
    const i = injectionDansCalque(c, 'l_titre', 'Elles ne bougent pas.');
    expect(i).toMatchObject({ ok: true, cible: 'layer:l_titre', allowedPaths: ['/document/layers/l_titre/text'] });
    if (!i.ok) return;
    const p = appliquerPatch(c, i.changes, i.allowedPaths);
    expect(p.ok && (p.resultat.document!.layers.l_titre as { text: string }).text).toBe('Elles ne bougent pas.');
  });

  it('calque forme, calque absent, texte identique · refusés', () => {
    expect(injectionDansCalque(c, 'l_fond', 'x').ok).toBe(false);
    expect(injectionDansCalque(c, 'l_absent', 'x').ok).toBe(false);
    expect(injectionDansCalque(c, 'l_titre', 'Ancien titre').ok).toBe(false);
    expect(injectionDansCalque(contenuVide(), 'l_titre', 'x').ok).toBe(false);
  });
});
