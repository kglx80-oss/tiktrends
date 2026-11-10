import { describe, it, expect } from 'vitest';
import {
  projeterLignee, ligneeVersCanvas, deriverCanvas, composerCanvas, couloirsDepuisLignee, replierPerdants,
  groupesLignee, grouperCouloirs, elementsCouloir, legendeLignee, phraseLegende, ligneeEnListe, phraseLiens, categorieLienLignee,
  cadresLignee, miniCarteLignee, estIdLignee, dispositionApresReinitialisation, dimensionsLignee, rechercheGraphe, modeGraphe,
  MINI_CARTE, LEGENDE_VIDE,
  type DispositionCanvas, type EntreeLignee, type DonneesVariantes, type VarianteLue, type Lecture, type VerdictLu, type TestLu,
} from '../src/index';
import { contenuVideo } from './studios-fixtures';

/**
 * Lot 11 V5 · le CANVAS DE LIGNÉE · groupes de lot, légende, mini-carte, liste.
 * Noyau pur. On vérifie un RÉSULTAT : ce que le canvas posera (groupes,
 * catégories, liens dits en liste, cadres, mini-carte) depuis la lignée
 * projetée de données existantes · et qu'aucun nœud ni lien n'est inventé.
 */

const verdict = (validated: VerdictLu['validated']): VerdictLu => ({
  computed: validated, validated, comparable: true, failedStage: null, killFlag: null, computedAt: '2026-10-10',
});
const lecture = (eff: Lecture['verdictEffectif']): Lecture => ({
  conclusion: 'soutenue', motif: 'tient_les_reperes', phrase: 'Hypothèse soutenue · gagnante au protocole.',
  verdictEffectif: eff, reference: 'reperes_marque', variableSuivante: 'hook', garderVariable: false,
  prudence: 'Résultat mesuré, pas une preuve de cause.',
});
const test = (o: Partial<TestLu> & Pick<TestLu, 'linkId' | 'adsmapAdId'>): TestLu => ({
  adStatus: 'live', hypothese: 'h', variable: 'hook', valeurVariable: null, objectif: null, protocole: null, periode: null,
  metrique: null, isolation: null, verdict: null, lot: null, ...o,
});
const variante = (o: Partial<VarianteLue> & Pick<VarianteLue, 'id' | 'versionId' | 'jobId' | 'lot' | 'position'>): VarianteLue => ({
  assetId: `a_${o.id}`, parentVariantId: null, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
  hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-05',
  test: null, lecture: null, relecture: null, ...o,
});

/** Brief → hypothèse → lot 1 (2 créations) → lot de test n° 4 (deux résultats, un apprentissage) → itération v2 (lot 2). */
function entree(o: { melanger?: boolean; uneVersion?: boolean } = {}): EntreeLignee {
  const variantes: VarianteLue[] = [
    variante({
      id: 'va1', versionId: 'v1', jobId: 'j1', lot: 1, position: 1, hypothese: 'Accroche question',
      test: test({ linkId: 'tl1', adsmapAdId: 'ad1', verdict: verdict('winner'), lot: { id: 'b4', numero: 4, statut: 'analyzed' } }),
      lecture: lecture('winner'),
      relecture: { conclusion: 'soutenue', apprentissage: 'La question retient mieux.', variableSuivante: 'opening_visual', ecart: null, le: '2026-10-09' },
    }),
    variante({
      id: 'va2', versionId: 'v1', jobId: 'j1', lot: 1, position: 2,
      test: test({ linkId: 'tl2', adsmapAdId: 'ad2', verdict: verdict('loser'), lot: { id: 'b4', numero: 4, statut: 'analyzed' } }),
    }),
    ...(o.uneVersion ? [] : [variante({ id: 'va3', versionId: 'v2', jobId: 'j2', lot: 2, position: 1, parentVariantId: 'va1' })]),
  ];
  const donnees: DonneesVariantes = {
    projet: { id: 'p1', titre: 'Sérum', versionCouranteId: o.uneVersion ? 'v1' : 'v2' },
    versions: [
      { id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' },
      ...(o.uneVersion ? [] : [{ id: 'v2', n: 2, parentId: 'v1', creeLe: '2026-10-06' }]),
    ],
    lots: [
      { jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-02', attendues: 2, sorties: [] },
      ...(o.uneVersion ? [] : [{ jobId: 'j2', lot: 2, versionId: 'v2', etat: 'completed' as const, qualite: 'passed' as const, creeLe: '2026-10-07', attendues: 1, sorties: [] }]),
    ],
    variantes: o.melanger ? [...variantes].reverse() : variantes,
    adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
    droits: { proposer: true },
    relecture: { disponible: false, raison: null, coutMaxUsd: null },
  };
  return {
    projet: { id: 'p1', titre: 'Sérum', marque: 'Neva' },
    sources: [{ sourceId: 'src1', titre: 'Annonce concurrente', presentation: 'Annonce Meta.', lien: '/veille?ad=x' }],
    briefs: {
      v1: { objectif: 'Faire connaître', hypothese: 'Une question retient', hypotheseId: 'h1', variable: 'hook', direction: 'Pastel' },
      ...(o.uneVersion ? {} : { v2: { objectif: 'Itérer le visuel', hypothese: null, hypotheseId: null, variable: null, direction: null } }),
    },
    donnees,
  };
}

const m = projeterLignee(entree());
const ids = new Set(m.noeuds.map((n) => n.id));
const CONCLUSIONS = { b4: { titre: 'Non concluante', phrase: '2 variantes tranchées au protocole · il en faut 4.' } };
const g = groupesLignee(m, { conclusions: CONCLUSIONS, resultatsOuverts: true });

describe('Lot 11 · groupes de lot · calculés depuis la lignée, jamais saisis', () => {
  it('un groupe par lot de production qui porte des créations · le nœud « Lot » et SES créations, dans l’ordre', () => {
    expect(g.filter((x) => x.nature === 'production').map((x) => [x.id, x.membres])).toEqual([
      ['lot:j1', ['groupe:j1', 'creation:va1', 'creation:va2']],
      ['lot:j2', ['groupe:j2', 'creation:va3']],
    ]);
  });

  it('un groupe par lot de TEST Adsmap · ses résultats et l’apprentissage relié à chacun · conclusion et fiche du lot', () => {
    const t = g.find((x) => x.nature === 'test')!;
    expect(t).toMatchObject({
      id: 'lot-test:b4', couloir: 'mesure', titre: 'Lot de test n° 4', membres: ['resultat:va1', 'apprentissage:va1', 'resultat:va2'],
      lien: { href: '/adsmap/lots/b4', libelle: 'Ouvrir le lot de test' },
    });
    expect(t.texte).toBe('Analysé · Non concluante · 2 variantes tranchées au protocole · il en faut 4.');
  });

  it('sans accès aux Résultats · aucun lien vers la fiche du lot ; sans conclusion lue · le statut seul, jamais une conclusion inventée', () => {
    const t = groupesLignee(m, { resultatsOuverts: false }).find((x) => x.nature === 'test')!;
    expect(t.lien).toBeNull();
    expect(t.texte).toBe('Analysé · 2 résultats de ce projet dans ce lot.');
    expect(t.texte).not.toMatch(/concluante|confirmée|infirmée/i);
  });

  it('chaque membre est un nœud PROJETÉ · une variante sans test n’entre dans aucun lot de test', () => {
    for (const x of g) for (const id of x.membres) expect(ids.has(id), `${x.id} · ${id} doit être projeté`).toBe(true);
    expect(g.some((x) => x.nature === 'test' && x.membres.includes('resultat:va3'))).toBe(false);
    expect(ids.has('resultat:va3')).toBe(false);
  });

  it('dans les couloirs · les membres deviennent contigus, chaque cadre ne garde que ses membres DU couloir, le repli garde le cadre', () => {
    const c = grouperCouloirs(couloirsDepuisLignee(m, { versionVue: 'v2' }), g);
    const crea = c.find((x) => x.cle === 'creations')!;
    expect(crea.noeuds.map((n) => n.id)).toEqual(['groupe:j1', 'creation:va1', 'creation:va2', 'groupe:j2', 'creation:va3']);
    expect(elementsCouloir(crea).map((e) => (e.type === 'groupe' ? `${e.groupe.id}[${e.noeuds.map((n) => n.id).join(',')}]` : e.noeud.id)))
      .toEqual(['lot:j1[groupe:j1,creation:va1,creation:va2]', 'lot:j2[groupe:j2,creation:va3]']);
    const mesure = c.find((x) => x.cle === 'mesure')!;
    expect(mesure.noeuds.map((n) => n.id)).toEqual(['resultat:va1', 'apprentissage:va1', 'resultat:va2']);
    expect(mesure.groupes!.map((x) => x.id)).toEqual(['lot-test:b4']);
    expect(c.find((x) => x.cle === 'contexte')!.groupes).toBeUndefined();
    const replie = replierPerdants(c, true).find((x) => x.cle === 'creations')!;
    expect(elementsCouloir(replie).map((e) => (e.type === 'groupe' ? `${e.groupe.id}[${e.noeuds.map((n) => n.id).join(',')}]` : e.noeud.id)))
      .toEqual(['lot:j1[groupe:j1,creation:va1]', 'lot:j2[groupe:j2,creation:va3]']);
  });
});

describe('Lot 11 · légende · seules les catégories qui ont un lien en données', () => {
  it('chaque catégorie présente, avec le nombre EXACT de ses liens, le motif dit en mots', () => {
    const l = legendeLignee(m);
    expect(l.map((e) => e.categorie)).toEqual(['contexte', 'visuel', 'mesure', 'iteration']);
    for (const e of l) expect(e.nombre).toBe(m.liens.filter((x) => x.categorie === e.categorie).length);
    expect(l.map((e) => e.trait)).toEqual(['trait plein', 'tirets', 'pointillés', 'tirets et points']);
    expect(phraseLegende(l[3]!)).toBe('Itération · tirets et points · 2 liens · de la version parente à la version itérée qui en vient');
  });

  it('une lignée sans itération se tait sur l’itération · sans lien, la légende est vide (et l’écran le dit)', () => {
    const une = projeterLignee(entree({ uneVersion: true }));
    expect(legendeLignee(une).map((e) => e.categorie)).not.toContain('iteration');
    expect(legendeLignee({ liens: [] })).toEqual([]);
    expect(LEGENDE_VIDE).toContain('Aucun lien');
  });
});

describe('Lot 11 · aucun lien sans donnée · la liste et le canvas disent les liens de la lignée, rien d’autre', () => {
  const liste = ligneeEnListe(m, g, { marque: '/brands/b1' });

  it('mêmes nœuds, même ordre que le canvas', () => {
    expect(liste.map((x) => x.id)).toEqual(m.noeuds.map((n) => n.id));
    expect(ligneeVersCanvas(m).cartes.map((k) => k.id)).toEqual(m.noeuds.map((n) => n.id));
  });

  it('chaque « Vient de » et « A donné » est un lien en données, catégorie comprise · et il n’y en a pas d’autre', () => {
    const vus = new Set<string>();
    for (const x of liste) {
      for (const v of x.vientDe) {
        const l = m.liens.find((y) => y.de === v.id && y.vers === x.id);
        expect(l, `${v.id} → ${x.id} n’existe pas en données`).toBeTruthy();
        vus.add(`${v.id}>${x.id}`);
      }
      for (const a of x.aDonne) expect(m.liens.some((y) => y.de === x.id && y.vers === a.id)).toBe(true);
    }
    expect(vus.size).toBe(m.liens.length);
    expect(liste.find((x) => x.id === 'resultat:va1')!.vientDe).toEqual([{ id: 'creation:va1', titre: 'Création · Image 1 du lot 1', categorie: 'Mesure' }]);
    expect(phraseLiens('Vient de', [])).toContain('point de départ');
  });

  it('le canvas ne trace que des liens en données · une paire sans lien n’a pas de catégorie', () => {
    const k = ligneeVersCanvas(m);
    expect(k.liens).toEqual(m.liens.map((l) => ({ de: l.de, vers: l.vers })));
    for (const l of k.liens) expect(categorieLienLignee(m, l.de, l.vers)).not.toBeNull();
    expect(categorieLienLignee(m, 'creation:va2', 'apprentissage:va1')).toBeNull();
    expect(categorieLienLignee(m, 'marque', 'creation:va1')).toBeNull();
  });

  it('chaque nœud ouvre l’écran EXISTANT · version, brief, Créations, Adsmap, source · la marque par la fiche fournie', () => {
    const ecran = (id: string) => liste.find((x) => x.id === id)!.lien;
    expect(ecran('brief:v1')).toEqual({ href: '/studio/projets/p1?version=v1#brief', libelle: 'Ouvrir le brief' });
    expect(ecran('hypothese:v1')!.href).toBe('/studio/projets/p1?version=v1#brief');
    expect(ecran('groupe:j1')!.href).toBe('/studio/projets/p1#creations');
    expect(ecran('creation:va1')!.href).toBe('/studio/projets/p1#variantes');
    expect(ecran('apprentissage:va1')!.href).toBe('/studio/projets/p1#variantes');
    expect(ecran('resultat:va1')!.href).toBe('/adsmap?ad=ad1&depuis=studio');
    expect(ecran('iteration:v2')!.href).toBe('/studio/projets/p1?version=v2');
    expect(ecran('reference:src1')!.href).toBe('/veille?ad=x');
    expect(ecran('marque')).toEqual({ href: '/brands/b1', libelle: 'Ouvrir la fiche marque' });
    expect(ligneeEnListe(m, g).find((x) => x.id === 'marque')!.lien).toBeNull();
    for (const x of liste) expect(x.lien, `${x.id} sans écran`).not.toBeNull();
  });

  it('l’intitulé ne répète pas le type · la pastille de la gagnante ajoutée', () => {
    expect(liste.find((x) => x.id === 'brief:v1')!.intitule).toBe('Brief · version 1');
    expect(liste.find((x) => x.id === 'groupe:j1')!.intitule).toBe('Lot 1 · version 1');
    expect(liste.find((x) => x.id === 'resultat:va1')!.intitule).toBe('Résultat · Image 1 du lot 1 · Gagnant');
  });

  it('« Dans » dit le lot de chaque membre', () => {
    expect(liste.find((x) => x.id === 'creation:va1')!.dans).toEqual(['Lot 1 · version 1']);
    expect(liste.find((x) => x.id === 'apprentissage:va1')!.dans).toEqual(['Lot de test n° 4']);
  });
});

describe('Lot 11 · déterminisme · mêmes données, même canvas', () => {
  it('l’ordre de lecture des variantes ne change rien · groupes, légende, liste identiques', () => {
    const b = projeterLignee(entree({ melanger: true }));
    const gb = groupesLignee(b, { conclusions: CONCLUSIONS, resultatsOuverts: true });
    expect(JSON.stringify(gb)).toBe(JSON.stringify(g));
    expect(JSON.stringify(legendeLignee(b))).toBe(JSON.stringify(legendeLignee(m)));
    expect(JSON.stringify(ligneeEnListe(b, gb))).toBe(JSON.stringify(ligneeEnListe(m, g)));
  });
});

describe('Lot 11 · cadres et mini-carte · calculés des cartes POSÉES', () => {
  const modele = dimensionsLignee(ligneeVersCanvas(m), {});
  const compose = composerCanvas(modele, { positions: { 'creation:va2': { x: 3000, y: 900 } } });
  const posees = new Map(compose.cartes.map((k) => [k.id, k]));
  const cadres = cadresLignee(g, posees);

  const dedans = (r: { x: number; y: number; w: number; h: number }, c: { x: number; y: number; w: number; h: number }) => r.x >= c.x && r.y >= c.y && r.x + r.w <= c.x + c.w && r.y + r.h <= c.y + c.h;
  const recouvre = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('chaque membre est dans un cadre de SON groupe, positions enregistrées comprises · un seul en-tête par groupe', () => {
    expect([...new Set(cadres.map((c) => c.id))]).toEqual(g.map((x) => x.id));
    for (const x of g) {
      const siens = cadres.filter((c) => c.id === x.id);
      expect(siens.filter((c) => c.entete)).toHaveLength(1);
      for (const id of x.membres) expect(siens.some((c) => dedans(posees.get(id)!, c.rect)), `${id} hors des cadres de ${x.id}`).toBe(true);
    }
    expect(cadres.some((c) => c.id === 'lot:j1' && dedans(posees.get('creation:va2')!, c.rect) && c.rect.x + c.rect.w >= 3000 + 220)).toBe(true);
  });

  it('un cadre ne recouvre JAMAIS une carte d’un autre groupe ou hors groupe · même à la place automatique', () => {
    for (const d of [{ positions: {} }, { positions: { 'creation:va2': { x: 3000, y: 900 } } }] as DispositionCanvas[]) {
      const pp = new Map(composerCanvas(modele, d).cartes.map((k) => [k.id, k]));
      for (const c of cadresLignee(g, pp)) {
        const membres = new Set(g.find((x) => x.id === c.id)!.membres);
        for (const [id, r] of pp) if (!membres.has(id)) expect(recouvre(c.rect, r), `le cadre ${c.id} recouvre ${id}`).toBe(false);
      }
    }
    // À la place automatique, le nœud « Lot » partage sa colonne avec l'hypothèse · son cadre se découpe par colonne.
    const auto = cadresLignee(g, new Map(composerCanvas(modele, { positions: {} }).cartes.map((k) => [k.id, k])));
    expect(auto.filter((c) => c.id === 'lot:j1').length).toBeGreaterThan(1);
  });

  it('la mini-carte réduit tout dans son rectangle, proportions gardées, et borne la fenêtre visible', () => {
    const mini = miniCarteLignee({ cartes: compose.cartes, cadres, vue: { x: 0, y: 0, k: 1 }, taille: { largeur: 860, hauteur: 520 } })!;
    expect(mini.cartes).toHaveLength(m.noeuds.length);
    for (const r of [...mini.cartes, ...mini.cadres]) {
      expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
      expect(r.x + r.w).toBeLessThanOrEqual(MINI_CARTE.largeur + 0.01); expect(r.y + r.h).toBeLessThanOrEqual(MINI_CARTE.hauteur + 0.01);
    }
    expect(mini.fenetre).not.toBeNull();
    expect(mini.fenetre!.x + mini.fenetre!.w).toBeLessThanOrEqual(MINI_CARTE.largeur);
    // Zoomer deux fois rétrécit la fenêtre.
    const zoom = miniCarteLignee({ cartes: compose.cartes, cadres, vue: { x: 0, y: 0, k: 2 }, taille: { largeur: 860, hauteur: 520 } })!;
    expect(zoom.fenetre!.w).toBeLessThan(mini.fenetre!.w);
    // Vue hors du monde · aucune fenêtre ; aucune carte · aucune mini-carte.
    expect(miniCarteLignee({ cartes: compose.cartes, cadres, vue: { x: 1e6, y: 1e6, k: 1 }, taille: { largeur: 860, hauteur: 520 } })!.fenetre).toBeNull();
    expect(miniCarteLignee({ cartes: [], cadres: [], vue: { x: 0, y: 0, k: 1 }, taille: { largeur: 860, hauteur: 520 } })).toBeNull();
  });
});

describe('Lot 11 · positions · la même disposition personnelle, deux graphes qui ne se recouvrent jamais', () => {
  it('tout identifiant de lignée est reconnu, aucun identifiant de production ne l’est', () => {
    for (const n of m.noeuds) expect(estIdLignee(n.id), n.id).toBe(true);
    for (const k of deriverCanvas(contenuVideo()).cartes) expect(estIdLignee(k.id), k.id).toBe(false);
  });

  it('réinitialiser un graphe garde les positions de l’autre · plus rien à garder, l’effacement complet existant', () => {
    const d = { positions: { 'creation:va1': { x: 1, y: 2 }, export: { x: 3, y: 4 } } };
    expect(dispositionApresReinitialisation(d, 'lignee')).toEqual({ positions: { export: { x: 3, y: 4 } } });
    expect(dispositionApresReinitialisation(d, 'production')).toEqual({ positions: { 'creation:va1': { x: 1, y: 2 } } });
    expect(dispositionApresReinitialisation({ positions: { export: { x: 3, y: 4 } } }, 'production')).toBeNull();
  });

  it('le graphe vit dans l’adresse · `graphe=lignee` posé puis retiré, le reste gardé', () => {
    expect(rechercheGraphe('?disposition=libre&version=v1', 'lignee')).toBe('?disposition=libre&version=v1&graphe=lignee');
    expect(rechercheGraphe('?disposition=libre&graphe=lignee', 'production')).toBe('?disposition=libre');
    expect(modeGraphe('lignee')).toBe('lignee');
    expect(modeGraphe('autre')).toBe('production');
  });
});
