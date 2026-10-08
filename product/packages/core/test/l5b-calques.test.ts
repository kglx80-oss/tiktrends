import { describe, it, expect } from 'vitest';
import {
  ajouterTexte, ajouterForme, ajouterMedia, renommerCalque, definirVisibilite, definirVerrou, dupliquerCalque,
  supprimerCalque, reordonnerCalque, transformerCalque, redimensionnerSelonDocument, alignerCalque, modifierTexte,
  modifierRemplissage, impactEdition, prochainIdCalque, type ResultatOperation,
} from '../src/studios/calques/operations';
import { patchDocument, calquesParZ } from '../src/studios/calques/patch-document';
import { historiqueInitial, appliquerOperation, annulerEtape, retablirEtape, enregistrerEtape, prochainAnnuler, prochainRetablir, HISTORIQUE_MAX } from '../src/studios/calques/historique';
import { reappliquerModifications, decrireDifference, decrireDifferences, statutEnregistrement } from '../src/studios/calques/conflit';
import { documentInitial, formatDepuisBrief, FORMATS_DOCUMENT, PART_PRODUIT_INITIALE, POLICES_EDITEUR, tailleSelonLargeur } from '../src/studios/calques/formats';
import { validerDocument, validerContenuVersion, type ContenuVersion, type DocumentStudio } from '../src/studios/document';
import { appliquerPatch, lirePointeur, differencesDetaillees, MAX_CHANGEMENTS_PATCH } from '../src/studios/patch';
import { jsonCanonique } from '../src/studios/version';
import { contenuVideo, documentStudio, copie } from './studios-fixtures';

/**
 * L5-B · éditeur de calques, noyau pur. Chaque garde lit une VALEUR : le
 * document produit, le patch produit, le contenu obtenu en rejouant ce patch
 * avec le vrai `appliquerPatch` du serveur, le plan d'impact du graphe L1.
 */

const CHEMINS_EDITEUR = ['/brief', '/productRef', '/styleRef', '/characterRefs', '/shots', '/document', '/timeline'];
const ok = (r: ResultatOperation) => {
  if (!r.ok) throw new Error(`${r.code} · ${r.message} · ${JSON.stringify(r.violations)}`);
  return r;
};
const canon = (x: unknown) => jsonCanonique(x);

/** Contenu d'une version qui porte `doc` · le reste vient de la fixture vidéo. */
const contenuAvec = (doc: DocumentStudio | null): ContenuVersion => ({ ...contenuVideo(), document: doc });

/** Rejoue un patch comme le serveur (`enregistrerVersion`) · contenu entier, chemins de l'éditeur. */
function rejouer(base: DocumentStudio | null, changes: unknown): DocumentStudio {
  const r = appliquerPatch(contenuAvec(base), changes, CHEMINS_EDITEUR);
  if (!r.ok) throw new Error(JSON.stringify(r.violations));
  expect(validerContenuVersion(r.resultat)).toEqual([]);
  return r.resultat.document!;
}

/** Générateur pseudo-aléatoire déterministe (mulberry32) · la suite est rejouable. */
function prng(graine: number) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Une opération tirée au hasard sur un calque existant (ou un ajout). */
function operationAuHasard(doc: DocumentStudio, r: () => number): ResultatOperation {
  const ids = Object.keys(doc.layers).sort();
  const id = ids[Math.floor(r() * ids.length)] ?? 'absent';
  const n = Math.floor(r() * 15);
  switch (n) {
    case 0: return ajouterTexte(doc, { texte: `T${Math.floor(r() * 99)}` });
    case 1: return ajouterForme(doc, r() < 0.5 ? 'rect' : 'ellipse');
    case 2: return ajouterMedia(doc, { kind: r() < 0.5 ? 'image' : 'logo', assetId: 'a_media', sourceWidth: 800, sourceHeight: 600, nom: 'Média' });
    case 3: return renommerCalque(doc, id, `Nom ${Math.floor(r() * 99)}`);
    case 4: return definirVisibilite(doc, id, r() < 0.5);
    case 5: return definirVerrou(doc, id, r() < 0.3);
    case 6: return dupliquerCalque(doc, id);
    case 7: return supprimerCalque(doc, id);
    case 8: return reordonnerCalque(doc, id, (['monter', 'descendre', 'premier-plan', 'arriere-plan'] as const)[Math.floor(r() * 4)]!);
    case 9: return transformerCalque(doc, id, { x: r() * 1200 - 60, y: r() * 1400 - 60, rotationDeg: r() * 90 - 45 });
    case 10: return transformerCalque(doc, id, { width: 1 + r() * 900, height: 1 + r() * 900, opacity: r() });
    case 11: return alignerCalque(doc, id, (['gauche', 'centre-horizontal', 'droite', 'haut', 'centre-vertical', 'bas'] as const)[Math.floor(r() * 6)]!);
    case 12: return modifierTexte(doc, id, { text: `Texte ${Math.floor(r() * 999)}`, fontSizePx: 10 + r() * 90, color: '#a1b2c3' });
    case 13: return modifierTexte(doc, id, { fontId: r() < 0.5 ? 'sans' : 'sans-gras', align: 'right', lineHeight: 1 + r() });
    default: return redimensionnerSelonDocument(doc, id, 0.1 + r());
  }
}

describe('opérations · un document VALIDÉ et un patch sur identifiants stables', () => {
  it('chaque opération rend un document valide, sans muter l’entrée, et son patch rejoué par le serveur redonne ce document', () => {
    const r = prng(20261008);
    let doc = documentStudio();
    let reussies = 0;
    for (let i = 0; i < 400; i++) {
      const avant = canon(doc);
      const res = operationAuHasard(doc, r);
      expect(canon(doc), `l’opération ${i} a muté son entrée`).toBe(avant);
      if (!res.ok) continue;
      reussies++;
      expect(validerDocument(res.document), `opération ${i} · ${res.libelle}`).toEqual([]);
      for (const c of res.changes) {
        const p = lirePointeur(c.path);
        expect(p.ok, `chemin refusé ${c.path}`).toBe(true);
        expect(c.path.startsWith('/document'), `hors document : ${c.path}`).toBe(true);
      }
      expect(canon(rejouer(doc, res.changes.length ? res.changes : [{ op: 'replace', path: '/document/width', newValue: doc.width, reason: 'neutre' }])), `rejeu ${i} · ${res.libelle}`).toBe(canon(res.document));
      doc = res.document;
    }
    expect(reussies).toBeGreaterThan(200);
  });

  it('patch cumulé base → présent, rejoué par le serveur, redonne exactement le document édité (100 suites)', () => {
    for (let g = 1; g <= 100; g++) {
      const r = prng(g);
      const base = documentStudio();
      let doc = base;
      for (let i = 0; i < 25; i++) { const x = operationAuHasard(doc, r); if (x.ok) doc = x.document; }
      const patch = patchDocument(base, doc);
      if (patch.length === 0) continue;
      expect(patch.length).toBeLessThanOrEqual(MAX_CHANGEMENTS_PATCH);
      for (const c of patch) expect(c.path, 'indice positionnel').not.toMatch(/\/\d+(\/|$)|\/-$/);
      expect(canon(rejouer(base, patch)), `suite ${g}`).toBe(canon(doc));
    }
  });

  it('les chemins nomment le calque et le champ · déplacer le CTA = deux replace sur /document/layers/l_titre/{x,y}', () => {
    const r = ok(transformerCalque(documentStudio(), 'l_titre', { x: 300, y: 1100 }));
    expect(r.changes.map(({ op, path, newValue }) => ({ op, path, newValue }))).toEqual([
      { op: 'replace', path: '/document/layers/l_titre/x', newValue: 300 },
      { op: 'replace', path: '/document/layers/l_titre/y', newValue: 1100 },
    ]);
  });

  it('au-delà de 100 changements, le patch se regroupe par calque puis par collection · jamais tronqué', () => {
    const base = documentInitial('4:5');
    let doc = base;
    for (let i = 0; i < 120; i++) doc = ok(ajouterForme(doc, 'rect')).document;
    const p1 = patchDocument(base, doc);
    expect(p1.length).toBeLessThanOrEqual(MAX_CHANGEMENTS_PATCH);
    expect(canon(rejouer(base, p1))).toBe(canon(doc));
    let bouge = doc;
    for (const id of Object.keys(doc.layers)) bouge = ok(transformerCalque(bouge, id, { x: 7, y: 9 })).document;
    const p2 = patchDocument(doc, bouge);
    expect(p2.map((c) => c.path)).toEqual(['/document/layers']);
    expect(canon(rejouer(doc, p2))).toBe(canon(bouge));
  });

  it('sans document de base · un seul replace /document', () => {
    const d = documentInitial('1:1');
    expect(patchDocument(null, d).map((c) => [c.op, c.path])).toEqual([['replace', '/document']]);
    expect(canon(rejouer(null, patchDocument(null, d)))).toBe(canon(d));
  });

  it('identifiants · jamais numériques, jamais réutilisés tant que le calque existe, __proto__ introuvable', () => {
    const d = documentStudio();
    const a = ok(ajouterTexte(d));
    const b = ok(ajouterTexte(a.document));
    expect([a.calqueId, b.calqueId]).toEqual(['texte_1', 'texte_2']);
    expect(prochainIdCalque(b.document, 'texte')).toBe('texte_3');
    const p = renommerCalque(d, '__proto__', 'x');
    expect(p.ok === false && p.code).toBe('CALQUE_INTROUVABLE');
  });
});

describe('règles · verrou, texte, sources', () => {
  it('un calque verrouillé ne bouge pas · transformer, aligner, redimensionner, réordonner, supprimer, retaper sont refusés, document intact', () => {
    const d = ok(definirVerrou(documentStudio(), 'l_titre', true)).document;
    const avant = canon(d);
    for (const r of [
      transformerCalque(d, 'l_titre', { x: 0 }), alignerCalque(d, 'l_titre', 'droite'), redimensionnerSelonDocument(d, 'l_titre', 0.5),
      reordonnerCalque(d, 'l_titre', 'premier-plan'), supprimerCalque(d, 'l_titre'), modifierTexte(d, 'l_titre', { text: 'autre' }),
    ]) {
      expect(r.ok === false && r.code).toBe('CALQUE_VERROUILLE');
      if (!r.ok) expect(r.message).toContain('verrouillé');
    }
    expect(canon(d)).toBe(avant);
    // Permis : renommer, masquer, déverrouiller, dupliquer (la copie est libre).
    expect(ok(renommerCalque(d, 'l_titre', 'Titre fixé')).document.layers.l_titre!.name).toBe('Titre fixé');
    expect(ok(definirVisibilite(d, 'l_titre', false)).document.layers.l_titre!.visible).toBe(false);
    const dup = ok(dupliquerCalque(d, 'l_titre'));
    expect(dup.document.layers[dup.calqueId!]!.locked).toBe(false);
    expect(canon(dup.document.layers.l_titre)).toBe(canon(d.layers.l_titre));
  });

  it('un voisin passe devant un calque verrouillé · la géométrie du verrouillé reste identique', () => {
    const d = documentStudio(); // l_logo verrouillé, z 3 ; l_titre z 2
    const r = ok(reordonnerCalque(d, 'l_titre', 'monter'));
    const { z: _z1, ...geoAvant } = d.layers.l_logo!;
    const { z: _z2, ...geoApres } = r.document.layers.l_logo!;
    expect(geoApres).toEqual(geoAvant);
    expect(calquesParZ(r.document).map((l) => l.id)).toEqual(['l_fond', 'l_logo', 'l_titre']);
  });

  it('IMG-07 · déplacer le CTA et changer sa typo · le calque RESTE un texte éditable, contenu intact', () => {
    let d = documentStudio();
    d = ok(transformerCalque(d, 'l_titre', { x: 120, y: 1120 })).document;
    d = ok(modifierTexte(d, 'l_titre', { fontId: 'sans-gras', fontSizePx: 64, color: '#FF5C8A', align: 'center' })).document;
    const t = d.layers.l_titre!;
    expect(t).toMatchObject({ kind: 'text', text: 'Peau nette en 7 jours', fontId: 'sans-gras', fontSizePx: 64, color: '#ff5c8a', align: 'center', x: 120, y: 1120 });
    expect(d.fonts['sans-gras']).toEqual({ family: 'Liberation Sans Bold', assetId: null });
    // Toujours éditable après coup.
    expect(ok(modifierTexte(d, 'l_titre', { text: 'Profite de -20 %' })).document.layers.l_titre).toMatchObject({ kind: 'text', text: 'Profite de -20 %' });
  });

  it('aucune opération ne change le type d’un calque ni ne touche une source (assetId, dimensions source, masque)', () => {
    const r = prng(77);
    const base = documentStudio();
    base.layers.l_fond = { ...(base.layers.l_fond as Extract<DocumentStudio['layers'][string], { kind: 'image' }>), mask: { format: 'grayscale8', width: 1080, height: 1350, assetId: 'a_masque', featherPx: 4 } };
    let doc = base;
    for (let i = 0; i < 600; i++) {
      const res = operationAuHasard(doc, r);
      if (!res.ok) continue;
      for (const [id, c] of Object.entries(res.document.layers)) {
        const a = doc.layers[id];
        if (!a) continue;
        expect(c.kind, `type changé pour ${id}`).toBe(a.kind);
        if (c.kind === 'image' && a.kind === 'image') {
          expect([c.assetId, c.sourceWidth, c.sourceHeight, canon(c.mask)], `source modifiée pour ${id} · ${res.libelle}`).toEqual([a.assetId, a.sourceWidth, a.sourceHeight, canon(a.mask)]);
        }
        if (c.kind === 'logo' && a.kind === 'logo') expect(c.assetId).toBe(a.assetId);
        if (c.kind === 'text' && a.kind === 'text') expect(typeof c.text).toBe('string');
      }
      for (const ch of res.changes) expect(ch.path, `patch qui vise une source : ${ch.path}`).not.toMatch(/\/(assetId|sourceWidth|sourceHeight|mask|kind)$/);
      doc = res.document;
    }
  });

  it('un changement de texte, de typo, de position ou d’ordre n’appelle AUCUN modèle d’image · composition et export seulement', () => {
    const contenu = contenuVideo();
    let d = contenu.document!;
    const gestes = [
      (x: DocumentStudio) => modifierTexte(x, 'l_titre', { text: 'Corrige seulement le CTA' }),
      (x: DocumentStudio) => modifierTexte(x, 'l_titre', { fontId: 'sans-gras', fontSizePx: 90, color: '#ffffff' }),
      (x: DocumentStudio) => transformerCalque(x, 'l_titre', { x: 10, y: 900, rotationDeg: 5 }),
      (x: DocumentStudio) => reordonnerCalque(x, 'l_titre', 'arriere-plan'),
      (x: DocumentStudio) => ajouterTexte(x, { texte: '-20 %' }),
      (x: DocumentStudio) => redimensionnerSelonDocument(x, 'l_fond', 0.55),
    ];
    for (const g of gestes) {
      d = ok(g(d)).document;
      const i = impactEdition(contenu, d);
      expect(i.generations, 'une édition de calques a déclenché une génération').toEqual([]);
      expect(i.recalculs).toEqual(['composition', 'export']);
    }
  });
});

describe('IMG-05 · transformations exactes', () => {
  it('produit à 55 % de la largeur · dimension déterministe, tolérance 1 px, proportions de la source, centré', () => {
    for (const format of ['1:1', '4:5', '9:16'] as const) {
      for (const [sw, sh] of [[1200, 1600], [1000, 1000], [3000, 2000], [777, 1333]] as const) {
        const d = documentInitial(format, { produit: { assetId: 'a_serum', sourceWidth: sw, sourceHeight: sh } });
        const p = d.layers.produit!;
        const W = FORMATS_DOCUMENT[format].width;
        expect(Math.abs(p.width - W * PART_PRODUIT_INITIALE), `${format} ${sw}×${sh}`).toBeLessThanOrEqual(1);
        expect(Math.abs(p.height - (p.width * sh) / sw)).toBeLessThanOrEqual(1);
        expect(Math.abs(p.x + p.width / 2 - W / 2)).toBeLessThanOrEqual(1);
        expect(validerDocument(d)).toEqual([]);
        // Même entrée, même sortie.
        expect(canon(documentInitial(format, { produit: { assetId: 'a_serum', sourceWidth: sw, sourceHeight: sh } }))).toBe(canon(d));
      }
    }
    const d = documentInitial('4:5', { produit: { assetId: 'a_serum', sourceWidth: 1200, sourceHeight: 1600 } });
    expect(d.layers.produit).toMatchObject({ x: 243, y: 279, width: 594, height: 792 });
  });

  it('redimensionner à 55 % depuis une autre taille · même résultat que la pose initiale, centre conservé', () => {
    const d = documentInitial('4:5', { produit: { assetId: 'a_serum', sourceWidth: 1200, sourceHeight: 1600 } });
    const petit = ok(transformerCalque(d, 'produit', { width: 300, height: 100 })).document;
    const r = ok(redimensionnerSelonDocument(petit, 'produit', 0.55)).document.layers.produit!;
    expect([r.width, r.height]).toEqual([594, 792]);
    expect(tailleSelonLargeur(1080, 0.55, 1200, 1600)).toEqual({ width: 594, height: 792 });
  });

  it('aligner · valeurs exactes sur les six bords et centres', () => {
    const d = documentStudio(); // titre 960×200 dans 1080×1350
    const v = (m: Parameters<typeof alignerCalque>[2]) => { const l = ok(alignerCalque(d, 'l_titre', m)).document.layers.l_titre!; return [l.x, l.y]; };
    expect(v('gauche')).toEqual([0, 80]);
    expect(v('centre-horizontal')).toEqual([60, 80]);
    expect(v('droite')).toEqual([120, 80]);
    expect(v('haut')).toEqual([60, 0]);
    expect(v('centre-vertical')).toEqual([60, 575]);
    expect(v('bas')).toEqual([60, 1150]);
  });

  it('arrondis · pixel entier, dixième de degré, centième d’opacité ; valeur non finie refusée', () => {
    const l = ok(transformerCalque(documentStudio(), 'l_titre', { x: 10.6, y: -3.4, width: 100.5, height: 1.4, rotationDeg: 12.345, opacity: 0.456 })).document.layers.l_titre!;
    expect([l.x, l.y, l.width, l.height, l.rotationDeg, l.opacity]).toEqual([11, -3, 101, 1, 12.3, 0.46]);
    const r = transformerCalque(documentStudio(), 'l_titre', { x: Number.NaN });
    expect(r.ok === false && r.code).toBe('VALEUR_INVALIDE');
  });
});

describe('IMG-08 · annuler, rétablir, historique borné', () => {
  it('suite d’éditions, annuler ×2, rétablir ×1 · le présent est exactement l’étape attendue', () => {
    const d0 = documentStudio();
    let h = historiqueInitial(d0);
    const e1 = ok(transformerCalque(d0, 'l_titre', { x: 200 }));
    h = appliquerOperation(h, e1);
    const e2 = ok(modifierTexte(e1.document, 'l_titre', { text: 'Nouveau CTA' }));
    h = appliquerOperation(h, e2);
    const e3 = ok(ajouterForme(e2.document, 'ellipse'));
    h = appliquerOperation(h, e3);
    expect(prochainAnnuler(h)).toBe('Ajouter « Ellipse 1 »');
    h = annulerEtape(annulerEtape(h));
    expect(canon(h.present)).toBe(canon(e1.document));
    expect(prochainRetablir(h)).toBe('Modifier le texte de « Titre »');
    h = retablirEtape(h);
    expect(canon(h.present)).toBe(canon(e2.document));
    // Une nouvelle édition efface le futur.
    h = appliquerOperation(h, ok(definirVisibilite(h.present, 'l_fond', false)));
    expect(h.futur).toEqual([]);
    // Tout annuler ramène au document source, octet pour octet.
    while (prochainAnnuler(h)) h = annulerEtape(h);
    expect(canon(h.present)).toBe(canon(d0));
  });

  it('un refus et un geste sans effet n’ajoutent rien à l’historique', () => {
    const d = documentStudio();
    let h = historiqueInitial(d);
    h = appliquerOperation(h, transformerCalque(d, 'l_logo', { x: 0 })); // verrouillé · refus
    const auFond = ok(reordonnerCalque(d, 'l_fond', 'arriere-plan')); // déjà au fond
    expect(auFond.changes).toEqual([]);
    h = appliquerOperation(h, auFond);
    h = enregistrerEtape(h, copie(h.present), 'copie identique');
    expect(h.passe).toEqual([]);
    expect(canon(h.present)).toBe(canon(d));
  });

  it(`borne · ${HISTORIQUE_MAX} étapes au plus, la plus ancienne tombe`, () => {
    let d = documentStudio();
    let h = historiqueInitial(d);
    for (let i = 0; i < HISTORIQUE_MAX + 30; i++) { const r = ok(transformerCalque(d, 'l_titre', { x: i + 1 })); h = appliquerOperation(h, r); d = r.document; }
    expect(h.passe.length).toBe(HISTORIQUE_MAX);
    while (prochainAnnuler(h)) h = annulerEtape(h);
    expect(h.present.layers.l_titre!.x).toBe(30);
  });

  it('borne de l’historique · mesure du poids d’un document de 40 calques', () => {
    let d = documentInitial('4:5');
    for (let i = 0; i < 20; i++) d = ok(ajouterTexte(d, { texte: 'Une accroche de longueur ordinaire pour une publicité' })).document;
    for (let i = 0; i < 20; i++) d = ok(ajouterForme(d, 'rect')).document;
    const octets = canon(d).length;
    // Mesuré : 10 416 caractères (≈ 10 Ko) · cent copies complètes ≈ 1 Mo.
    expect(octets).toBeGreaterThan(8_000);
    expect(octets).toBeLessThan(20_000);
  });
});

describe('FLOW-06 · conflit · différences en mots et réapplication sans écrasement', () => {
  it('champs disjoints · mes modifications se rejouent sur la version courante, les siennes restent', () => {
    const base = documentStudio();
    const mien = ok(transformerCalque(base, 'l_titre', { x: 300 })).document;
    const courant = ok(modifierTexte(base, 'l_titre', { text: 'Écrit par l’onglet 1' })).document;
    const r = reappliquerModifications(base, mien, courant);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.document.layers.l_titre).toMatchObject({ x: 300, text: 'Écrit par l’onglet 1' });
    expect(r.changes.map((c) => c.path)).toEqual(['/document/layers/l_titre/x']);
  });

  it('même champ · refus, rien n’est fusionné, le chemin en conflit est nommé', () => {
    const base = documentStudio();
    const mien = ok(transformerCalque(base, 'l_titre', { x: 300 })).document;
    const courant = ok(transformerCalque(base, 'l_titre', { x: 10 })).document;
    expect(reappliquerModifications(base, mien, courant)).toEqual({ ok: false, conflits: ['/document/layers/l_titre/x'], violations: [] });
    // Calque supprimé par l'autre session pendant que je le déplace.
    const supprime = ok(supprimerCalque(base, 'l_titre')).document;
    expect(reappliquerModifications(base, mien, supprime).ok).toBe(false);
    // Deux ajouts au même rang d'empilement · résultat invalide, refusé.
    const a = ok(ajouterForme(base, 'rect')).document;
    const b = ok(ajouterTexte(base)).document;
    const r = reappliquerModifications(base, a, b);
    expect(r.ok).toBe(false);
  });

  it('les différences d’un 409 se lisent en mots', () => {
    const base = contenuAvec(documentStudio());
    const courant = contenuAvec(ok(modifierTexte(ok(transformerCalque(documentStudio(), 'l_titre', { x: 300 })).document, 'l_titre', { color: '#ff0000' })).document);
    courant.brief = { autre: true };
    const diffs = differencesDetaillees(base, courant);
    const mots = decrireDifferences(diffs, [courant.document, base.document]);
    expect(mots).toEqual([
      'Le brief a changé.',
      'Calque « Titre » · couleur du texte : « #111111 » → « #ff0000 »',
      'Calque « Titre » · position horizontale : 60 px → 300 px',
    ]);
    const ajout = differencesDetaillees(contenuAvec(documentStudio()), contenuAvec(ok(ajouterTexte(documentStudio())).document));
    expect(ajout.map((d) => decrireDifference(d, [null]))).toContain('Calque « texte_1 » ajouté.');
  });

  it('statut · enregistré, modifications non enregistrées, conflit, erreur · toujours en mots', () => {
    const d = documentStudio();
    const m = ok(transformerCalque(d, 'l_titre', { x: 1 })).document;
    const s = (o: Partial<Parameters<typeof statutEnregistrement>[0]>) => statutEnregistrement({ base: d, present: d, enCours: false, conflit: false, erreur: false, ...o });
    expect(s({}).libelle).toBe('Enregistré');
    expect(s({ present: copie(d) }).etat).toBe('enregistre');
    expect(s({ present: m }).libelle).toBe('Modifications non enregistrées');
    expect(s({ present: m, conflit: true }).etat).toBe('conflit');
    expect(s({ present: m, erreur: true }).etat).toBe('erreur');
    expect(s({ base: null, present: null }).etat).toBe('vide');
  });
});

describe('formats et polices', () => {
  it('le format vient du brief quand il le dit, sinon un défaut annoncé', () => {
    expect(formatDepuisBrief(['Visuel fixe', 'Story 9:16'])).toEqual({ format: '9:16', depuisBrief: true, texte: 'Story 9:16' });
    expect(formatDepuisBrief(['Carré pour le feed'])).toMatchObject({ format: '1:1', depuisBrief: true });
    expect(formatDepuisBrief(['1x1'])).toMatchObject({ format: '1:1' });
    expect(formatDepuisBrief(['Reels'])).toMatchObject({ format: '9:16' });
    expect(formatDepuisBrief(['Visuel fixe'])).toEqual({ format: '4:5', depuisBrief: false, texte: null });
    expect(formatDepuisBrief(['16:9 paysage'])).toMatchObject({ depuisBrief: false });
    expect(formatDepuisBrief(null)).toMatchObject({ format: '4:5', depuisBrief: false });
  });

  it('document initial · valide, police fournie déclarée, aucun calque sans produit', () => {
    const d = documentInitial('9:16');
    expect(validerDocument(d)).toEqual([]);
    expect([d.width, d.height, Object.keys(d.layers)]).toEqual([1080, 1920, []]);
    expect(d.fonts).toEqual({ sans: { family: 'Liberation Sans', assetId: null } });
  });

  it('police inconnue refusée · seules les polices fournies (ou déjà déclarées) se choisissent', () => {
    const r = modifierTexte(documentStudio(), 'l_titre', { fontId: 'comic' });
    expect(r.ok === false && r.code).toBe('VALEUR_INVALIDE');
    expect(ok(modifierTexte(documentStudio(), 'l_titre', { fontId: 'f_titre' })).document.layers.l_titre).toMatchObject({ fontId: 'f_titre' });
    expect(POLICES_EDITEUR.map((p) => p.fichier)).toEqual(['/fonts/sans-400.ttf', '/fonts/sans-700.ttf']);
  });

  it('média · posé entier sans déformation, refusé sans dimensions connues', () => {
    const d = documentInitial('9:16');
    const l = ok(ajouterMedia(d, { kind: 'image', assetId: 'a_photo', sourceWidth: 2000, sourceHeight: 1000, nom: 'Photo' })).document.layers.image_1!;
    expect([l.width, l.height]).toEqual([1080, 540]);
    const r = ajouterMedia(d, { kind: 'image', assetId: 'a_photo', sourceWidth: 0, sourceHeight: 1000, nom: 'Photo' });
    expect(r.ok === false && r.message).toContain('dimensions');
    expect(ok(modifierRemplissage(ok(ajouterForme(d, 'rect')).document, 'forme_1', '#ABCDEF')).document.layers.forme_1).toMatchObject({ fill: '#abcdef' });
  });
});
