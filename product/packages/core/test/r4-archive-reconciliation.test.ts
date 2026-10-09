import { describe, it, expect } from 'vitest';
import {
  cleArchiveExport, droitsArchiveExport, lireProvenanceArchive, archiveConforme, ressourcesRevoquees, decisionTelechargement,
  libelleConservation, lireTraceExport, codeRefusPreflight, ORIGINE_ARCHIVE_EXPORT,
  ecranReconciliation, rappelReconciliation, vueReconciliation, montantDepenseLisible, dateReconciliation,
  type TraceExport, type ArchiveRelue, type DocumentStudio, type LigneAReconcilier,
} from '../src';

/**
 * R4 · règles PURES de l'export conservé et de l'écran « à réconcilier ».
 * Le résultat est lu (décision, raisons, phrases), pas la présence d'un appel.
 */

const SHA = 'a'.repeat(64);
const WS = '11111111-1111-4111-8111-111111111111';
const P = '22222222-2222-4222-8222-222222222222';
const V = '33333333-3333-4333-8333-333333333333';
const ASSET = '44444444-4444-4444-8444-444444444444';

const trace = (o: Partial<TraceExport> = {}): TraceExport => ({
  projectId: P, versionId: V, versionN: 1, format: 'png', sha256: SHA, mime: 'image/png', largeur: 1080, hauteur: 1080,
  octets: 5000, nomFichier: 'serum-v1-png.png', assetId: ASSET, ...o,
});
const archive = (o: Partial<ArchiveRelue> = {}): ArchiveRelue => ({
  origin: 'render', storageState: 'stored', projectId: P, mime: 'image/png', bytes: 5000, sha256: SHA,
  rights: droitsArchiveExport(trace(), ['m1']), empreinteRelue: SHA, ...o,
});

const doc: DocumentStudio = {
  width: 1080, height: 1080, colorSpace: 'sRGB',
  fonts: {},
  layers: {
    fond: { id: 'fond', kind: 'image', name: 'Décor', visible: true, locked: false, x: 0, y: 0, width: 1080, height: 1080, rotationDeg: 0, opacity: 1, z: 0, assetId: 'm_fond', sourceWidth: 1080, sourceHeight: 1080, mask: null },
    logo: { id: 'logo', kind: 'logo', name: 'Logo', visible: true, locked: false, x: 900, y: 960, width: 120, height: 60, rotationDeg: 0, opacity: 1, z: 2, assetId: 'm_logo' },
    cache: { id: 'cache', kind: 'image', name: 'Caché', visible: false, locked: false, x: 0, y: 0, width: 10, height: 10, rotationDeg: 0, opacity: 1, z: 3, assetId: 'm_cache', sourceWidth: 10, sourceHeight: 10, mask: null },
  },
} as DocumentStudio;

describe('R4 · clé et provenance de l’archive', () => {
  it('clé dérivée de l’identité (version, format, empreinte), jamais du nom de fichier', () => {
    expect(cleArchiveExport({ workspaceId: WS, projectId: P, versionId: V, format: 'jpeg', sha256: SHA }))
      .toBe(`exports/${WS}/${P}/${V}/jpeg-${SHA}.jpg`);
    expect(() => cleArchiveExport({ workspaceId: '../x', projectId: P, versionId: V, format: 'png', sha256: SHA })).toThrow('segment');
    expect(() => cleArchiveExport({ workspaceId: WS, projectId: P, versionId: V, format: 'png', sha256: 'court' })).toThrow('identité');
  });

  it('provenance de version relue dans `rights` · une forme étrangère est illisible', () => {
    expect(lireProvenanceArchive(droitsArchiveExport(trace(), ['b', 'a', 'a']))).toEqual({ projectId: P, versionId: V, versionN: 1, format: 'png' });
    expect((droitsArchiveExport(trace(), ['b', 'a', 'a']) as { sources: string[] }).sources).toEqual(['a', 'b']);
    expect(lireProvenanceArchive({ jobId: 'x' })).toBeNull();
    expect(lireProvenanceArchive({ export: { ...trace(), format: 'gif' } })).toBeNull();
  });

  it('la trace d’audit garde l’identifiant d’archive ; une trace L7-A (sans) reste lue telle quelle', () => {
    expect(lireTraceExport(trace())!.assetId).toBe(ASSET);
    const ancienne = trace(); delete ancienne.assetId;
    expect(lireTraceExport(ancienne)).toEqual(ancienne);
    expect(lireTraceExport({ ...trace(), assetId: 'pas-un-uuid' })!.assetId).toBeUndefined();
  });
});

describe('R4 · archive conforme · toutes les raisons', () => {
  it('l’archive de CET export est conforme', () => {
    expect(archiveConforme(trace(), archive())).toEqual({ ok: true });
    expect(ORIGINE_ARCHIVE_EXPORT).toBe('render');
  });

  it('octets relus différents, ligne d’une autre version, autre origine · chaque défaut nommé', () => {
    const r = archiveConforme(trace(), archive({
      empreinteRelue: 'b'.repeat(64), origin: 'generated', rights: droitsArchiveExport(trace({ versionId: P }), []),
    }));
    expect(r).toEqual({ ok: false, raisons: ['origine generated au lieu de render', 'version différente', 'octets relus différents de l’export'] });
    expect(archiveConforme(trace(), archive({ empreinteRelue: null, storageState: 'deleted' }))).toEqual({ ok: false, raisons: ['stockage deleted', 'octets illisibles'] });
    expect(archiveConforme(trace(), archive({ sha256: 'c'.repeat(64), bytes: 4999, mime: 'image/jpeg' }))).toEqual({
      ok: false, raisons: ['type image/jpeg au lieu de image/png', 'taille 4999 au lieu de 5000', 'empreinte de la ligne différente de l’export'],
    });
  });
});

describe('R4 · droits relus au téléchargement', () => {
  it('média révoqué · ciblé par calque, cause propre, code 422 ; un calque masqué ne compte pas', () => {
    const v = ressourcesRevoquees(doc, { m_fond: 'autorise', m_logo: 'revoque' });
    expect(v.map((x) => [x.cause, x.cible.calqueId, x.cible.assetId])).toEqual([['media_revoque', 'logo', 'm_logo']]);
    expect(v[0]!.message).toBe('Calque logo « Logo » · média retiré depuis l’export · le fichier conservé n’est plus servi tant qu’il n’est pas rétabli.');
    expect(codeRefusPreflight(v)).toBe('MISSING_REFERENCE');
    // Absent de la table = révoqué (le doute ne sert pas un fichier).
    expect(ressourcesRevoquees(doc, {}).map((x) => x.cible.calqueId)).toEqual(['fond', 'logo']);
    expect(ressourcesRevoquees(doc, { m_fond: 'autorise', m_logo: 'autorise' })).toEqual([]);
  });
});

describe('R4 · décision de téléchargement', () => {
  const revoque = ressourcesRevoquees(doc, { m_fond: 'autorise' });

  it('droits d’abord · révoqué ⇒ refus, même avec une archive conforme', () => {
    expect(decisionTelechargement({ trace: trace(), revoquees: revoque, archive: archive() })).toMatchObject({ servir: 'refus' });
  });
  it('archive conforme ⇒ servie', () => {
    expect(decisionTelechargement({ trace: trace(), revoquees: [], archive: archive() })).toEqual({ servir: 'archive' });
  });
  it('sans archive (L7-A) ou archive altérée ⇒ re-rendu à empreinte exigée, raison dite', () => {
    expect(decisionTelechargement({ trace: trace(), revoquees: [], archive: undefined })).toEqual({ servir: 'rendu', raison: 'export antérieur à la conservation' });
    expect(decisionTelechargement({ trace: trace(), revoquees: [], archive: null })).toEqual({ servir: 'rendu', raison: 'archive introuvable' });
    expect(decisionTelechargement({ trace: trace(), revoquees: [], archive: archive({ empreinteRelue: 'b'.repeat(64) }) }))
      .toEqual({ servir: 'rendu', raison: 'archive non conforme · octets relus différents de l’export' });
  });
  it('l’écran dit la conservation en toutes lettres', () => {
    expect(libelleConservation(true)).toBe('Conservé · le téléchargement sert ce fichier, même si un média change ensuite.');
    expect(libelleConservation(false)).toContain('Non conservé');
  });
});

describe('R4 · écran « à réconcilier »', () => {
  const ligne = (n: number, usd: number, provider = 'anthropic', cause = 'coupure'): LigneAReconcilier => ({
    id: `l${n}`, createdAt: new Date(Date.UTC(2026, 9, 8, 12, n)), provider, model: 'claude-sonnet-5', action: `copie:${n}`,
    workspaceId: null, estimatedUsd: usd, actualUsd: usd, cause,
  });

  it('rempli · nombre, total, cause en clair, date de Paris, action, geste par ligne', () => {
    const e = ecranReconciliation(vueReconciliation([ligne(1, 0.1), ligne(3, 0.25, 'fal', 'delai'), ligne(2, 0.05, 'anthropic', 'inventee')]));
    expect(e.etat).toBe('rempli');
    expect(e.nombre).toBe(3);
    expect(e.total).toBe('0,4000 $');
    expect(e.parFournisseur).toEqual(['fal · 1 ligne · 0,2500 $', 'Anthropic · 2 lignes · 0,1500 $']);
    expect(e.lignes.map((l) => [l.action, l.fournisseur, l.cause, l.reserve, l.quand])).toEqual([
      ['copie:3', 'fal', 'délai dépassé · le fournisseur a pu terminer et facturer', '0,2500 $', '08/10/2026 14:03'],
      ['copie:2', 'Anthropic', 'inventee', '0,0500 $', '08/10/2026 14:02'],
      ['copie:1', 'Anthropic', 'connexion coupée ou réponse perdue après envoi', '0,1000 $', '08/10/2026 14:01'],
    ]);
    expect(e.lignes[0]!.aFaire).toBe('Chercher cet appel sur la facture fal du 08/10/2026 · comparer à 0,2500 $ comptés au plafond.');
    expect(e.consigne).toContain('Rien sur cet écran ne modifie une ligne.');
    expect(rappelReconciliation(vueReconciliation([ligne(1, 0.1), ligne(2, 2.5)]))).toBe('2 dépenses à réconcilier avec la facture · 2,60 $ comptés au maximum en attendant.');
  });

  it('vide · le silence est dit, aucun rappel', () => {
    const e = ecranReconciliation(vueReconciliation([]));
    expect([e.etat, e.nombre, e.resume, e.lignes, e.parFournisseur]).toEqual(['vide', 0, 'Aucune dépense à réconcilier.', [], []]);
    expect(rappelReconciliation(vueReconciliation([]))).toBeNull();
  });

  it('montants et dates illisibles restent lisibles', () => {
    expect(montantDepenseLisible(Number.NaN)).toBe('0,0000 $');
    expect(montantDepenseLisible(-3)).toBe('0,0000 $');
    expect(dateReconciliation(new Date('x'))).toBe('date inconnue');
  });
});
