import { describe, it, expect } from 'vitest';
import {
  preflightExport, preflightVersion, versionExportable, mediasAVerifier, codeRefusPreflight, messageRefusPreflight,
  type DisponiblesExport,
} from '../src/studios/export/preflight';
import {
  nomFichierExport, cleExport, verifierExport, attenduExport, lireTraceExport, tailleLisible, segmentNom,
  CONTRAT_FORMAT, type MesureExport,
} from '../src/studios/export/fichier';
import { contenuVide, type ContenuVersion, type DocumentStudio } from '../src/studios/document';
import { empreinteContenu } from '../src/studios/version';
import { pub11 } from './l5a-fixtures';

/**
 * L7-A · export image · règles pures (EXPORT-01, 02, 04, 05).
 *
 * Préflight : chaque refus nomme sa CIBLE (calque, type, média ou police) et
 * TOUTES les cibles sont listées. Fichier : le nom est dérivé, l'identité est
 * version + format + empreinte. Vérification : décodable, dimensions du
 * document, type réel, empreinte annoncée, pixels égaux au rendu en PNG.
 */

const TOUT: DisponiblesExport = {
  polices: ['Sans', 'Sans Bold'],
  medias: {
    a_fond: { etat: 'ok', largeur: 1080, hauteur: 1080 },
    a_produit: { etat: 'ok', largeur: 800, hauteur: 1200 },
    a_logo: { etat: 'ok', largeur: 240, hauteur: 120 },
  },
};

const version = (doc: DocumentStudio | null) => {
  const content: ContenuVersion = { ...contenuVide(), document: doc };
  return { content, contentHash: empreinteContenu(content) };
};

const mesureOk = (o: Partial<MesureExport> = {}): MesureExport => ({
  mimeReel: 'image/png', octets: 1234, sha256: 'a'.repeat(64), decodage: { ok: true, largeur: 1080, hauteur: 1080 }, ecartPixelsMax: 0, ...o,
});

describe('préflight · cibles', () => {
  it('document complet · prêt, médias et polices comptés', () => {
    const r = preflightExport(pub11(), TOUT);
    expect(r).toEqual({ ok: true, document: pub11(), medias: 3, polices: 2 });
  });

  it('police non embarquée · refus ciblé sur le calque texte, sa police et sa famille', () => {
    const d = pub11();
    d.fonts.f_titre = { family: 'Inter', assetId: null };
    const r = preflightExport(d, TOUT);
    if (r.ok) throw new Error('préflight accepté malgré une police absente');
    expect(r.violations).toEqual([{
      cible: { type: 'calque', calqueId: 'titre', nom: 'Titre', kind: 'text', fontId: 'f_titre', famille: 'Inter' },
      cause: 'police_absente',
      message: 'Calque texte « Titre » · police « Inter » absente du serveur d’export.',
    }]);
  });

  it('police embarquée mais absente du serveur (fichier non chargeable) · refus ciblé, aucune police de repli', () => {
    const r = preflightExport(pub11(), { ...TOUT, polices: ['Sans'] });
    if (r.ok) throw new Error('préflight accepté sans le fichier Sans Bold');
    expect(r.violations.map((v) => [v.cause, v.cible.calqueId, v.cible.famille])).toEqual([['police_absente', 'titre', 'Sans Bold']]);
  });

  it('police téléversée · refus explicite (non prise en charge), cible et média de la police', () => {
    const d = pub11();
    d.fonts.f_corps = { family: 'Maison', assetId: 'a_police' };
    const r = preflightExport(d, TOUT);
    if (r.ok) throw new Error('police téléversée acceptée');
    expect(r.violations[0]).toMatchObject({ cause: 'police_televersee', cible: { calqueId: 'cta', kind: 'text', assetId: 'a_police', famille: 'Maison' } });
  });

  it('média absent, illisible, aux mauvaises dimensions · TROIS cibles, chacune son calque et son média', () => {
    const r = preflightExport(pub11(), {
      polices: TOUT.polices,
      medias: { a_fond: { etat: 'illisible' }, a_produit: { etat: 'ok', largeur: 799, hauteur: 1200 } },
    });
    if (r.ok) throw new Error('préflight accepté malgré trois médias défaillants');
    expect(r.violations.map((v) => [v.cause, v.cible.calqueId, v.cible.kind, v.cible.assetId])).toEqual([
      ['media_illisible', 'fond', 'image', 'a_fond'],
      ['media_absent', 'logo', 'logo', 'a_logo'],
      ['media_dimensions', 'produit', 'image', 'a_produit'],
    ]);
    expect(r.violations[2]!.message).toBe('Calque image « Produit » · média de 799 × 1200, le calque attend 800 × 1200.');
  });

  it('média sans dimensions · refus ciblé', () => {
    const r = preflightExport(pub11(), { ...TOUT, medias: { ...TOUT.medias, a_logo: { etat: 'ok', largeur: 0, hauteur: 0 } } });
    expect(!r.ok && r.violations.map((v) => [v.cause, v.cible.calqueId])).toEqual([['dimensions_nulles', 'logo']]);
  });

  it('police ET média manquants · les deux sont listés, pas seulement le premier', () => {
    const d = pub11();
    d.fonts.f_titre = { family: 'Inter', assetId: null };
    const r = preflightExport(d, { ...TOUT, medias: { a_fond: TOUT.medias.a_fond!, a_produit: TOUT.medias.a_produit! } });
    expect(!r.ok && r.violations.map((v) => v.cible.calqueId).sort()).toEqual(['logo', 'titre']);
  });

  it('calque masqué ou texte d’opacité nulle · non dessiné, donc non exigé (même règle que le rendu)', () => {
    const d = pub11();
    d.layers.logo!.visible = false;
    d.fonts.f_corps = { family: 'Inter', assetId: null };
    d.layers.cta!.opacity = 0;
    const r = preflightExport(d, { ...TOUT, medias: { a_fond: TOUT.medias.a_fond!, a_produit: TOUT.medias.a_produit! } });
    expect(r.ok).toBe(true);
    expect(mediasAVerifier(d)).toEqual(['a_fond', 'a_produit']);
  });

  it('dimensions nulles du document · refus avant tout calque', () => {
    const r = preflightExport({ ...pub11(), width: 0 }, TOUT);
    expect(!r.ok && r.violations.map((v) => [v.cause, v.cible.type])).toEqual([['dimensions_nulles', 'document']]);
  });

  it('document trop grand pour la mémoire du rendu · refus ciblé document', () => {
    const r = preflightExport({ ...pub11(), width: 16000, height: 16000 }, TOUT);
    expect(!r.ok && r.violations[0]!.cause).toBe('document_trop_grand');
  });
});

describe('préflight · version validée', () => {
  it('version intègre · exportable', () => {
    expect(versionExportable(version(pub11())).ok).toBe(true);
    expect(preflightVersion(version(pub11()), TOUT).ok).toBe(true);
  });

  it('empreinte relue ≠ enregistrée (ligne altérée hors des commandes) · version non validée', () => {
    const v = version(pub11());
    (v.content.document!.layers.titre as { text: string }).text = 'Texte modifié en base';
    const r = preflightVersion(v, TOUT);
    expect(!r.ok && r.violations.map((x) => [x.cause, x.cible.type])).toEqual([['version_non_validee', 'version']]);
  });

  it('contenu invalide · version non validée, chemins cités', () => {
    const v = version(pub11());
    (v.content.document!.layers.titre as { color: string }).color = 'rouge';
    v.contentHash = empreinteContenu(v.content);
    const r = versionExportable(v);
    expect(!r.ok && r.violations[0]!.cause).toBe('version_non_validee');
    expect(!r.ok && r.violations[0]!.message).toContain('/document/layers/titre/color');
  });

  it('pas de document image · refus (rien à exporter)', () => {
    const r = versionExportable(version(null));
    expect(!r.ok && r.violations[0]!.cause).toBe('document_absent');
  });

  it('code et message de refus · la première cible, le nombre des autres, « aucun fichier »', () => {
    const d = pub11();
    d.fonts.f_titre = { family: 'Inter', assetId: null };
    const r = preflightExport(d, { ...TOUT, medias: {} });
    if (r.ok) throw new Error('accepté');
    expect(codeRefusPreflight(r.violations)).toBe('MISSING_REFERENCE');
    expect(messageRefusPreflight(r.violations)).toBe(`Export refusé · ${r.violations[0]!.message} Et 3 autres points à corriger. Aucun fichier n’a été produit.`);
    expect(codeRefusPreflight([{ cible: { type: 'version' }, cause: 'version_non_validee', message: '' }])).toBe('INVARIANT_CONFLICT');
    expect(codeRefusPreflight([{ cible: { type: 'document' }, cause: 'document_absent', message: '' }])).toBe('UNSUPPORTED_CAPABILITY');
  });
});

describe('fichier · nom dérivé, identité réelle', () => {
  it('`<projet>-v<numero>-<format>.<ext>`, accents et ponctuation repliés', () => {
    expect(nomFichierExport('Sérum · accroche au réveil !', 3, 'png')).toBe('serum-accroche-au-reveil-v3-png.png');
    expect(nomFichierExport('Sérum', 12, 'jpeg')).toBe('serum-v12-jpeg.jpg');
    expect(nomFichierExport('···', 1, 'png')).toBe('projet-v1-png.png');
    expect(segmentNom('x'.repeat(80))).toHaveLength(60);
  });

  it('le nom n’est PAS l’identité · deux versions de projets homonymes ont le même nom et deux clés', () => {
    const a = { versionId: '11111111-1111-4111-8111-111111111111', format: 'png' as const, sha256: 'a'.repeat(64) };
    const b = { versionId: '22222222-2222-4222-8222-222222222222', format: 'png' as const, sha256: 'b'.repeat(64) };
    expect(nomFichierExport('Même titre', 1, 'png')).toBe(nomFichierExport('Même titre', 1, 'png'));
    expect(cleExport(a)).not.toBe(cleExport(b));
    expect(nomFichierExport('Même titre', 1, 'png')).not.toContain(a.versionId);
  });

  it('contrat · PNG sans perte, JPEG avec perte', () => {
    expect(CONTRAT_FORMAT.png).toMatchObject({ mime: 'image/png', extension: 'png', sansPerte: true });
    expect(CONTRAT_FORMAT.jpeg).toMatchObject({ mime: 'image/jpeg', extension: 'jpg', sansPerte: false });
    expect(tailleLisible(812 * 1024)).toBe('812 Ko');
    expect(tailleLisible(2.4 * 1024 * 1024)).toBe('2,4 Mo');
  });
});

describe('vérification du fichier produit', () => {
  const doc = pub11();
  it('fichier conforme · accepté', () => {
    expect(verifierExport(attenduExport(doc, 'png'), mesureOk())).toEqual({ ok: true });
    expect(verifierExport(attenduExport(doc, 'jpeg'), mesureOk({ mimeReel: 'image/jpeg', ecartPixelsMax: null }))).toEqual({ ok: true });
  });

  it('non décodable · refusé, la raison du décodeur est citée', () => {
    const v = verifierExport(attenduExport(doc, 'png'), mesureOk({ decodage: { ok: false, raison: 'Input buffer has corrupt header' }, ecartPixelsMax: null }));
    expect(v).toEqual({ ok: false, raisons: ['fichier non décodable · Input buffer has corrupt header', 'pixels non comparés au rendu'] });
  });

  it('dimensions, type réel, empreinte annoncée, pixels · chaque écart est une raison', () => {
    const v = verifierExport(attenduExport(doc, 'png', 'b'.repeat(64)), mesureOk({ mimeReel: 'image/jpeg', decodage: { ok: true, largeur: 1080, hauteur: 1079 }, ecartPixelsMax: 3 }));
    expect(v).toEqual({ ok: false, raisons: [
      'type réel image/jpeg au lieu de image/png',
      'empreinte différente de celle de l’export',
      'dimensions 1080 × 1079 au lieu de 1080 × 1080',
      'pixels différents du rendu (écart 3)',
    ] });
  });

  it('fichier vide ou de type inconnu · refusé', () => {
    const v = verifierExport(attenduExport(doc, 'jpeg'), mesureOk({ mimeReel: null, octets: 0, ecartPixelsMax: null }));
    expect(!v.ok && v.raisons).toEqual(['fichier vide', 'type réel inconnu au lieu de image/jpeg']);
  });
});

describe('trace d’audit · relue défensivement', () => {
  const t = { projectId: 'p', versionId: 'v', versionN: 2, format: 'png', sha256: 'c'.repeat(64), mime: 'image/png', largeur: 10, hauteur: 20, octets: 300, nomFichier: 'p-v2-png.png' };
  it('forme exacte · relue', () => { expect(lireTraceExport(t)).toEqual(t); });
  it('forme altérée · ignorée', () => {
    expect(lireTraceExport({ ...t, format: 'gif' })).toBeNull();
    expect(lireTraceExport({ ...t, sha256: 'court' })).toBeNull();
    expect(lireTraceExport({ ...t, largeur: 0 })).toBeNull();
    expect(lireTraceExport(null)).toBeNull();
  });
});
