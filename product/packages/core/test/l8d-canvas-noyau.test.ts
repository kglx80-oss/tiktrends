import { describe, it, expect } from 'vitest';
import {
  deriverCanvas, composerCanvas, dispositionVide, deplacerCarte, reinitialiserDisposition, traverseesCanvas, descendantsDeCarte,
  validerDispositionCanvas, etatInitialCanvas, reduireCanvas, vueAjustee, zoomAuPointeur, panoramique, vueFocus, versMonde,
  GESTES_ECRITS_CANVAS, ZOOM_LISIBLE_CANVAS, vueInitiale, ZOOM_MIN_CANVAS, ZOOM_MAX_CANVAS, CARTE_CANVAS, POSITIONS_CANVAS_MAX,
  type GesteCanvas, type ModeleCanvas, type TailleCanvas,
} from '../src/studios/canvas';
import { grapheImpact, CLE_CONSIGNES_PLANS } from '../src/studios/impact';
import { empreinteContenu } from '../src/studios/version';
import { contenuVide, type ContenuVersion } from '../src/studios/document';
import { contenuVideo, copie, documentStudio, plan } from './studios-fixtures';

/**
 * L8-D · canvas métier (cahier 01 §127, UX-04), au RÉSULTAT et sans base.
 *
 *  1. Les liens sont les dépendances RÉELLES · vérifiées par perturbation
 *     contre le graphe d'impact (`grapheImpact`), pas recopiées.
 *  2. La disposition automatique ne fait traverser AUCUNE carte par un lien.
 *  3. Déplacer une carte ne change ni l'ordre, ni les liens, ni l'empreinte
 *     de la structure, ni l'empreinte de la version.
 *  4. Seuls « déplacer » et « réinitialiser » écrivent ; tout le reste est lecture.
 *  5. Vue · ajuster, zoom au pointeur, pan, focus.
 */

function grand(n: number): ContenuVersion {
  const c = contenuVideo();
  c.shots.order = [];
  c.shots.byId = {};
  for (let i = 0; i < n; i++) {
    const id = `s_${i}`;
    c.shots.order.push(id);
    c.shots.byId[id] = plan(id, i % 2 ? ['p_serum', 'c_lea'] : ['c_tom'], i % 4 === 3 ? '' : 'Bonjour', i % 3 ? 'voiceover' : 'lipsync');
  }
  return c;
}

function image(): ContenuVersion {
  return { ...contenuVide(), brief: { objectif: 'x' }, productRef: { productId: 'p_serum' }, document: documentStudio() };
}

const FIXTURES: Array<[string, () => ContenuVersion]> = [
  ['vidéo de référence (3 plans)', contenuVideo],
  ['image statique', image],
  ['vidéo 20 plans (UX-06)', () => grand(20)],
  ['vidéo 50 plans', () => grand(50)],
  ['vidéo sans sous-titres ni musique', () => { const c = contenuVideo(); c.timeline!.subtitles.enabled = false; c.timeline!.music = null; return c; }],
  ['version vide', contenuVide],
];

/* ── 1 · Dépendances réelles ─────────────────────────────────────────────── */

type Perturbation = { carte: string; quoi: string; muter: (c: ContenuVersion) => void };

function perturbations(c: ContenuVersion): Perturbation[] {
  const out: Perturbation[] = [];
  for (const sid of Object.keys(c.shots.byId)) {
    out.push({ carte: `plan:${sid}`, quoi: 'sujet', muter: (x) => { x.shots.byId[sid]!.subject += ' (modifié)'; } });
    out.push({ carte: `plan:${sid}`, quoi: 'action', muter: (x) => { x.shots.byId[sid]!.action += ' lentement'; } });
    out.push({ carte: `plan:${sid}`, quoi: 'narration', muter: (x) => { if (x.shots.byId[sid]!.narration) x.shots.byId[sid]!.narration += ' Vraiment.'; } });
    out.push({ carte: `plan:${sid}`, quoi: 'texte écran', muter: (x) => { x.shots.byId[sid]!.onScreenText = ['NOUVEAU']; } });
    out.push({ carte: `plan:${sid}`, quoi: 'durée réelle', muter: (x) => { x.shots.byId[sid]!.actualDurationMs = 4321; } });
    out.push({ carte: `plan:${sid}`, quoi: 'consigne d’image', muter: (x) => { x.styleRef = { ...(x.styleRef ?? {}), [CLE_CONSIGNES_PLANS]: { [sid]: { prompt: 'plus chaud' } } }; } });
  }
  for (const cid of Object.keys(c.characterRefs)) {
    out.push({ carte: `identite:${cid}`, quoi: 'tenue', muter: (x) => { x.characterRefs[cid] = { ...x.characterRefs[cid], tenue: 'veste verte' }; } });
  }
  if (c.productRef) out.push({ carte: 'entree:produit', quoi: 'fiche produit', muter: (x) => { x.productRef = { ...x.productRef!, nom: 'Sérum v2' }; } });
  if (c.styleRef) out.push({ carte: 'entree:style', quoi: 'lumière', muter: (x) => { x.styleRef = { ...x.styleRef!, lighting: 'dure' }; } });
  if (c.document) out.push({ carte: 'entree:document', quoi: 'titre', muter: (x) => { (x.document!.layers.l_titre as { text: string }).text = 'Autre titre'; } });
  if (c.timeline) {
    out.push({ carte: 'entree:voix', quoi: 'voix', muter: (x) => { x.timeline!.voice = { voiceId: 'v_autre' }; } });
    out.push({ carte: 'montage', quoi: 'ordre', muter: (x) => { x.shots.order = [...x.shots.order].reverse(); } });
    out.push({ carte: 'montage', quoi: 'pistes', muter: (x) => { x.timeline!.fps = { num: 25, den: 1 }; } });
    out.push({ carte: 'mix', quoi: 'musique', muter: (x) => { x.timeline!.music = { assetId: 'a_autre', gainDb: -6 }; } });
  }
  out.push({ carte: 'brief', quoi: 'objectif', muter: (x) => { x.brief = { ...(x.brief ?? {}), objectif: 'autre' }; } });
  return out;
}

function noeudsChanges(avant: ContenuVersion, apres: ContenuVersion): Set<string> {
  const a = grapheImpact(avant);
  const b = grapheImpact(apres);
  const out = new Set<string>();
  for (const [id, n] of b) if (a.get(id)?.empreinte !== n.empreinte) out.add(id);
  for (const id of a.keys()) if (!b.has(id)) out.add(id);
  return out;
}

describe('canvas · les liens sont les dépendances RÉELLES du graphe d’impact', () => {
  for (const [nom, f] of FIXTURES.slice(0, 5)) {
    it(`${nom} · chaque sortie du graphe est une carte, et seulement elles`, () => {
      const c = f();
      const m = deriverCanvas(c);
      const sorties = m.cartes.filter((x) => x.nature !== 'entree').map((x) => x.id).sort();
      expect(sorties, 'le canvas oublie ou invente une sortie du graphe d’impact').toEqual([...grapheImpact(c).keys()].sort());
    });

    it(`${nom} · une perturbation ne touche que l’aval de sa carte, et l’aval entier est atteint`, () => {
      const c = f();
      const m = deriverCanvas(c);
      const sorties = new Set(grapheImpact(c).keys());
      const atteint = new Map<string, Set<string>>();
      for (const p of perturbations(c)) {
        const apres = copie(c);
        p.muter(apres);
        const touches = noeudsChanges(c, apres);
        const aval = descendantsDeCarte(m, p.carte);
        if (sorties.has(p.carte)) aval.add(p.carte);
        for (const t of touches) {
          expect(aval.has(t), `changer « ${p.quoi} » de ${p.carte} rend ${t} obsolète, mais le canvas ne les relie pas`).toBe(true);
        }
        const u = atteint.get(p.carte) ?? new Set<string>();
        for (const t of touches) u.add(t);
        atteint.set(p.carte, u);
      }
      for (const [carte, u] of atteint) {
        const attendu = [...descendantsDeCarte(m, carte)].filter((x) => sorties.has(x));
        if (sorties.has(carte)) attendu.push(carte);
        expect([...u].sort(), `le canvas relie ${carte} à des sorties qu’aucun changement de ${carte} ne touche (lien inventé)`).toEqual(attendu.sort());
      }
    });
  }

  it('le brief n’a aucun lien · le modifier ne rend aucune sortie obsolète', () => {
    const m = deriverCanvas(contenuVideo());
    expect(m.liens.filter((l) => l.de === 'brief' || l.vers === 'brief')).toEqual([]);
  });

  it('tout lien va strictement de gauche à droite (étapes)', () => {
    for (const [, f] of FIXTURES) {
      const m = deriverCanvas(f());
      for (const l of m.liens) expect(m.grille[l.de]!.colonne, `${l.de} → ${l.vers}`).toBeLessThan(m.grille[l.vers]!.colonne);
    }
  });
});

/* ── 2 · Aucun lien ne traverse une carte ────────────────────────────────── */

describe('canvas · disposition automatique · aucun lien ne traverse une carte', () => {
  for (const [nom, f] of FIXTURES) {
    it(nom, () => {
      const k = composerCanvas(deriverCanvas(f()), dispositionVide());
      const t = traverseesCanvas(k);
      expect(t.map((x) => `le lien ${x.lien} traverse la carte ${x.traverse}`)).toEqual([]);
      // Les cartes ne se chevauchent pas entre elles.
      for (let i = 0; i < k.cartes.length; i++) for (let j = i + 1; j < k.cartes.length; j++) {
        const a = k.cartes[i]!; const b = k.cartes[j]!;
        const chevauche = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(chevauche, `${a.id} chevauche ${b.id}`).toBe(false);
      }
    });
  }

  it('la mesure voit bien une traversée (contrôle du contrôle)', () => {
    const m = deriverCanvas(contenuVideo());
    const k = composerCanvas(m, dispositionVide());
    // Une ligne droite de la première à la dernière carte traverse forcément le milieu.
    const a = k.cartes[0]!; const z = k.cartes[k.cartes.length - 1]!;
    const faux = { ...k, routes: [{ de: a.id, vers: z.id, libre: false, points: [{ x: a.x + a.w, y: a.y }, { x: z.x, y: z.y + z.h }] }] };
    expect(traverseesCanvas(faux).length).toBeGreaterThan(0);
  });
});

/* ── 3 · Déplacer ne change ni l'ordre, ni les liens, ni l'empreinte ─────── */

describe('canvas · déplacer une carte ne touche que sa position', () => {
  it('ordre, liens, empreinte de structure et empreinte de version identiques avant/après', () => {
    const c = contenuVideo();
    const empreinteVersion = empreinteContenu(c);
    const m = deriverCanvas(c);
    const avant = composerCanvas(m, dispositionVide());
    // On amène la dernière carte AVANT la première, et une carte du milieu tout en haut à gauche.
    let d = deplacerCarte(m, dispositionVide(), 'export', -5000, -5000);
    d = deplacerCarte(m, d, 'keyframe:s_produit', -3000, -800);
    d = deplacerCarte(m, d, 'plan:s_fin', 9000, 0);
    const apres = composerCanvas(m, d);

    expect(apres.cartes.map((x) => x.id), 'déplacer une carte a changé l’ordre des cartes').toEqual(avant.cartes.map((x) => x.id));
    expect(apres.liens, 'déplacer une carte a changé les dépendances').toEqual(avant.liens);
    expect(apres.empreinte, 'déplacer une carte a changé l’empreinte de structure').toBe(avant.empreinte);
    expect(deriverCanvas(c).empreinte).toBe(m.empreinte);
    expect(empreinteContenu(c), 'déplacer une carte a touché le contenu de la version').toBe(empreinteVersion);
    // Seule la position a changé, et seulement pour les cartes déplacées.
    expect(Object.keys(d.positions).sort()).toEqual(['export', 'keyframe:s_produit', 'plan:s_fin']);
    const pos = new Map(apres.cartes.map((x) => [x.id, x]));
    expect(pos.get('export')!.x).toBe(avant.cartes.find((x) => x.id === 'export')!.x - 5000);
    for (const x of avant.cartes) if (!d.positions[x.id]) expect([pos.get(x.id)!.x, pos.get(x.id)!.y]).toEqual([x.x, x.y]);
  });

  it('réinitialiser rend exactement la disposition automatique', () => {
    const m = deriverCanvas(contenuVideo());
    const d = deplacerCarte(m, dispositionVide(), 'mix', 40, 40);
    expect(composerCanvas(m, reinitialiserDisposition())).toEqual(composerCanvas(m, dispositionVide()));
    expect(composerCanvas(m, d).cartes.find((x) => x.id === 'mix')!.deplacee).toBe(true);
  });

  it('le modèle est déterministe · même contenu, même modèle (ordre des clés indifférent)', () => {
    const a = contenuVideo();
    const b = contenuVideo();
    b.characterRefs = { c_tom: b.characterRefs.c_tom!, c_lea: b.characterRefs.c_lea! };
    expect(deriverCanvas(b)).toEqual(deriverCanvas(a));
  });
});

/* ── 4 · Consulter n'écrit rien ──────────────────────────────────────────── */

describe('canvas · seuls « déplacer » et « réinitialiser » écrivent', () => {
  const m: ModeleCanvas = deriverCanvas(contenuVideo());
  const t: TailleCanvas = { largeur: 860, hauteur: 520 };
  const consultations: GesteCanvas[] = [
    { type: 'basculer', mode: 'canvas', taille: t },
    { type: 'basculer', mode: 'liste', taille: t },
    { type: 'selectionner', id: 'clip:s_produit' },
    { type: 'ajuster', taille: t },
    { type: 'ouvrir', taille: t },
    { type: 'zoomer', facteur: 1.2, pointeur: { x: 100, y: 100 } },
    { type: 'panoramiquer', dx: 30, dy: -10 },
    { type: 'focaliser', id: 'montage', taille: t },
    { type: 'remplacer', disposition: { positions: { mix: { x: 1, y: 2 } } } },
  ];

  for (const g of consultations) {
    it(`${g.type} · rien à enregistrer`, () => {
      const r = reduireCanvas(m, etatInitialCanvas(dispositionVide()), g);
      expect(r.aEnregistrer, `le geste « ${g.type} » demande une écriture`).toBeNull();
    });
  }

  it('déplacer · écrit la nouvelle disposition, une seule carte', () => {
    const r = reduireCanvas(m, etatInitialCanvas(dispositionVide()), { type: 'deplacer', id: 'mix', dx: 16, dy: 0 });
    expect(r.aEnregistrer).toEqual(r.etat.disposition);
    expect(Object.keys(r.aEnregistrer!.positions)).toEqual(['mix']);
  });

  it('déplacer de rien, ou une carte inconnue · aucune écriture', () => {
    expect(reduireCanvas(m, etatInitialCanvas(dispositionVide()), { type: 'deplacer', id: 'mix', dx: 0, dy: 0 }).aEnregistrer).toBeNull();
    expect(reduireCanvas(m, etatInitialCanvas(dispositionVide()), { type: 'deplacer', id: 'inconnue', dx: 5, dy: 0 }).aEnregistrer).toBeNull();
  });

  it('réinitialiser · écrit une disposition vide', () => {
    const e = etatInitialCanvas({ positions: { mix: { x: 0, y: 0 } } });
    expect(reduireCanvas(m, e, { type: 'reinitialiser', taille: t }).aEnregistrer).toEqual({ positions: {} });
  });

  it('la liste des gestes qui écrivent est exactement {déplacer, réinitialiser}', () => {
    expect([...GESTES_ECRITS_CANVAS].sort()).toEqual(['deplacer', 'reinitialiser']);
  });

  it('les positions d’une carte absente de la version ne sont pas effacées par un geste', () => {
    const r = reduireCanvas(m, etatInitialCanvas({ positions: { 'clip:s_disparu': { x: 3, y: 4 } } }), { type: 'deplacer', id: 'mix', dx: 16, dy: 0 });
    expect(r.aEnregistrer!.positions['clip:s_disparu']).toEqual({ x: 3, y: 4 });
  });
});

/* ── 5 · Vue ─────────────────────────────────────────────────────────────── */

describe('canvas · vue', () => {
  const t: TailleCanvas = { largeur: 860, hauteur: 520 };

  it('ajuster · toutes les cartes à l’écran (projet de référence)', () => {
    const k = composerCanvas(deriverCanvas(contenuVideo()), dispositionVide());
    const v = vueAjustee(k.bornes, t);
    for (const c of k.cartes) {
      const x0 = c.x * v.k + v.x; const y0 = c.y * v.k + v.y;
      expect(x0).toBeGreaterThanOrEqual(0); expect(y0).toBeGreaterThanOrEqual(0);
      expect(x0 + c.w * v.k).toBeLessThanOrEqual(t.largeur); expect(y0 + c.h * v.k).toBeLessThanOrEqual(t.hauteur);
    }
  });

  it('bornes de zoom · ajuster 20 plans tient au-dessus de ZOOM_MIN (mesure du tableau de vue.ts)', () => {
    const k = composerCanvas(deriverCanvas(grand(20)), dispositionVide());
    const necessaire = Math.min((t.largeur - 48) / k.bornes.w, (t.hauteur - 48) / k.bornes.h);
    expect(necessaire).toBeGreaterThan(ZOOM_MIN_CANVAS);
    expect(vueAjustee(k.bornes, t).k).toBeCloseTo(necessaire, 6);
    expect(ZOOM_MAX_CANVAS * CARTE_CANVAS.largeur).toBeLessThan(390 * 1.2);
  });

  it('zoom au pointeur · le point du monde sous le pointeur ne bouge pas, et le zoom est borné', () => {
    const v = { x: 40, y: -60, k: 0.5 };
    const p = { x: 300, y: 200 };
    const avant = versMonde(v, p);
    const z = zoomAuPointeur(v, 1.2, p);
    const apres = versMonde(z, p);
    expect(apres.x).toBeCloseTo(avant.x, 9); expect(apres.y).toBeCloseTo(avant.y, 9);
    expect(zoomAuPointeur({ x: 0, y: 0, k: 1 }, 1000, p).k).toBe(ZOOM_MAX_CANVAS);
    expect(zoomAuPointeur({ x: 0, y: 0, k: 1 }, 0.0001, p).k).toBe(ZOOM_MIN_CANVAS);
  });

  it('ouverture · lisible · ajusté si ça tient, sinon le début du canvas à ZOOM_LISIBLE', () => {
    // Constaté sur capture : 3 plans dans 608 × 504 s'ajustaient à 28 %, titres illisibles.
    const k = composerCanvas(deriverCanvas(contenuVideo()), dispositionVide());
    const zone = { largeur: 608, hauteur: 504 };
    const v = vueInitiale(k.bornes, zone);
    expect(v.k, 'le canvas s’ouvre à un zoom illisible').toBeGreaterThanOrEqual(ZOOM_LISIBLE_CANVAS);
    const premiere = k.cartes[0]!;
    expect(premiere.x * v.k + v.x).toBeGreaterThanOrEqual(0);
    expect(premiere.y * v.k + v.y).toBeGreaterThanOrEqual(0);
    expect((premiere.x + premiere.w) * v.k + v.x).toBeLessThanOrEqual(zone.largeur);
    // Un petit canvas qui tient reste ajusté (tout visible).
    const petit = composerCanvas(deriverCanvas(image()), dispositionVide());
    expect(vueInitiale(petit.bornes, { largeur: 1200, hauteur: 600 })).toEqual(vueAjustee(petit.bornes, { largeur: 1200, hauteur: 600 }));
    // La plus petite écriture d'une carte (12 px) reste ≥ 9 px.
    expect(12 * ZOOM_LISIBLE_CANVAS).toBeGreaterThanOrEqual(9);
  });

  it('pan · décale la vue, rien d’autre', () => {
    expect(panoramique({ x: 1, y: 2, k: 0.7 }, 10, -5)).toEqual({ x: 11, y: -3, k: 0.7 });
  });

  it('focus · la carte choisie au centre, lisible', () => {
    const r = { x: 1000, y: 700, w: CARTE_CANVAS.largeur, h: CARTE_CANVAS.hauteur };
    const v = vueFocus({ x: 0, y: 0, k: 0.2 }, r, t);
    expect(v.k).toBe(1);
    expect((r.x + r.w / 2) * v.k + v.x).toBeCloseTo(t.largeur / 2, 6);
    expect((r.y + r.h / 2) * v.k + v.y).toBeCloseTo(t.hauteur / 2, 6);
    // Sur mobile (358 px utiles) la carte entière tient.
    const mobile = vueFocus({ x: 0, y: 0, k: 2 }, r, { largeur: 358, hauteur: 500 });
    expect(r.w * mobile.k).toBeLessThanOrEqual(358 - 48);
  });
});

/* ── Validation et cibles Jarvis ─────────────────────────────────────────── */

describe('canvas · disposition reçue · validée', () => {
  it('refuse ce qui n’est pas {carte: {x, y}} fini et borné', () => {
    expect(validerDispositionCanvas(null).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: [] }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: JSON.parse('{"__proto__": {"x": 1, "y": 1}}') }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: { constructor: { x: 1, y: 1 } } }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: { mix: { x: Infinity, y: 0 } } }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: { mix: { x: 1, y: 2, w: 3 } } }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: { mix: { x: 2e6, y: 0 } } }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: { 'a b': { x: 0, y: 0 } } }).ok).toBe(false);
    const trop = Object.fromEntries(Array.from({ length: POSITIONS_CANVAS_MAX + 1 }, (_, i) => [`c_${i}`, { x: 0, y: 0 }]));
    expect(validerDispositionCanvas({ positions: trop }).ok).toBe(false);
    expect(validerDispositionCanvas({ positions: { 'keyframe:s_1': { x: 1.4, y: -2.6 } } })).toEqual({ ok: true, disposition: { positions: { 'keyframe:s_1': { x: 1, y: -3 } } } });
  });
});

describe('canvas · la carte cible explicitement Jarvis', () => {
  it('plan, image clé, voix, clip → le plan ; identité → l’identité ; brief → brief ; calculs → aucune cible', () => {
    const m = deriverCanvas(contenuVideo());
    const cible = (id: string) => m.cartes.find((x) => x.id === id)!;
    for (const id of ['plan:s_produit', 'keyframe:s_produit', 'voix:s_produit', 'clip:s_produit']) {
      expect([cible(id).cibleJarvis, cible(id).libelleCibleJarvis]).toEqual(['shot:s_produit', 'Plan 2']);
    }
    expect(cible('identite:c_lea').cibleJarvis).toBe('character:c_lea');
    expect(cible('brief').cibleJarvis).toBe('brief');
    for (const id of ['montage', 'mix', 'sous_titres', 'export', 'composition']) expect(cible(id).cibleJarvis).toBeNull();
  });
});
