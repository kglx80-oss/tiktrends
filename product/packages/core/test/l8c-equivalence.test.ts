import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { jsonCanonique, empreinteContenu, sha256Hex, avecCanoniqueMemorise, ErreurCanonique } from '../src/studios/version';
import { cheminsDifferents, appliquerPatch } from '../src/studios/patch';
import { calculerPlanImpact } from '../src/studios/impact';
import { impactVideo, sortiesValides, jugeSortiesValides } from '../src/studios/video/impact-video';
import { appliquerOperationVideo } from '../src/studios/video/operations';
import { contenuEchelle, aleatoireDeterministe } from '../src/studios/perf/synthetique';
import { patchTexte, patchLourd, CHEMINS_EDITEUR } from './l8c-chemins';

/**
 * L8-C · les optimisations ne changent AUCUN résultat.
 *
 * 1. Empreintes de référence relevées AVANT toute optimisation (base
 *    `f2b9fc4`) sur les contenus synthétiques : contenu, patchs, plans
 *    d'impact, impact vidéo, différences. Une seule octet de sortie qui change
 *    et ces valeurs tombent.
 * 2. Implémentations D'ORIGINE recopiées ici (forme canonique à chemins
 *    construits d'avance, différences par `Set` puis double sérialisation) et
 *    comparées aux nouvelles sur des arbres aléatoires, clés piégées (`~`,
 *    `/`, clés héritées comme `toString`), valeurs hors JSON comprises : même
 *    sortie, même erreur, même chemin dans le message.
 */

const REFERENCES = {
  petit: {
    contenu: 'b5a3f28c5f0094a2f18343d027133864966091ba4bc8199b718373d4cb066735',
    patchTexte: '820a5b4614195d991864928fcda4bcb6f5d3170b6c320d161601b506504458fd',
    patchLourd: '2793d3a4d3b63984c49e50e2ef5f24cbdb435d03f4eda27fda450beeff35e47f',
    impact: 'e80cec776df7488119bc234ee30f0e63a5236d57d4154c5023af66638aa92e0e',
    impactLourd: '3114f6dcae4fc14f7636089c6c332b5db836df34b191152e857d7112dce51c06',
    impactVideo: '2c80b60bb3c70be416524bac27ff9c9dd01489be5523cce4d7bc994ad946dd7d',
    diff: '77a41159d910cf61d93efd572dd7bee9940fa0c97624a4ed8678932751a65c48',
  },
  grand: {
    contenu: '41b1a7624b3f7ec0b6e86c7f0fda02a7ddd27f0d4a529d0e4ffaf1924a03b8f0',
    patchTexte: 'b25b3c0793b900add5b3c095059cba46dc7d919e5ac6c3a01dffcfbe2b60c5ca',
    patchLourd: 'f4883f9e490b86b441480107a108c20d26ed2e6983cb0e92c6ce48cd075aba65',
    impact: 'aff23a481ca8c559879a517f944fc1985525076b80a8fea7bdb8bd3bf6ef6b0e',
    impactLourd: 'a8000a6511410863481c69eec856ae63f65d3d9417f83e525c9d7a961aa2d01b',
    impactVideo: 'd61e54a0f46fbe7d121492bd517459436a0013ca2659e8e7f6c0328ae0773a83',
    diff: '77a41159d910cf61d93efd572dd7bee9940fa0c97624a4ed8678932751a65c48',
  },
} as const;

describe('empreintes identiques à celles d’avant les optimisations (base f2b9fc4)', () => {
  it.each(['petit', 'grand'] as const)('%s · contenu, patchs, impacts, différences', (e) => {
    const c = contenuEchelle(e);
    const r = appliquerPatch(c, patchTexte(c), CHEMINS_EDITEUR);
    const r2 = appliquerPatch(c, patchLourd(c), CHEMINS_EDITEUR);
    const o = appliquerOperationVideo(c, { type: 'ordre', ordre: [...c.shots.order].reverse() });
    if (!r.ok || !r2.ok || !o.ok) throw new Error('jeu synthétique refusé');
    expect({
      contenu: empreinteContenu(c), patchTexte: empreinteContenu(r.resultat), patchLourd: empreinteContenu(r2.resultat),
      impact: calculerPlanImpact(c, r.resultat).empreinte, impactLourd: calculerPlanImpact(c, r2.resultat).empreinte,
      impactVideo: empreinteContenu(impactVideo(c, o.contenu)), diff: empreinteContenu(cheminsDifferents(c, r2.resultat)),
    }).toEqual(REFERENCES[e]);
  });
});

/* ───────────── Implémentations d'origine (f2b9fc4), recopiées telles quelles ───────────── */

const echapperSegment = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
function canonOrigine(v: unknown, chemin: string, vus: Set<object>): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean': return v ? 'true' : 'false';
    case 'string': return JSON.stringify(v);
    case 'number':
      if (!Number.isFinite(v)) throw new ErreurCanonique(chemin, 'nombre non fini');
      return JSON.stringify(v);
    case 'object': {
      if (vus.has(v)) throw new ErreurCanonique(chemin, 'référence circulaire');
      vus.add(v);
      let s: string;
      if (Array.isArray(v)) s = '[' + v.map((x, i) => canonOrigine(x, `${chemin}/${i}`, vus)).join(',') + ']';
      else {
        const proto = Object.getPrototypeOf(v);
        if (proto !== Object.prototype && proto !== null) throw new ErreurCanonique(chemin, 'objet non JSON');
        const cles = Object.keys(v).sort();
        s = '{' + cles.map((k) => `${JSON.stringify(k)}:${canonOrigine((v as Record<string, unknown>)[k], `${chemin}/${echapperSegment(k)}`, vus)}`).join(',') + '}';
      }
      vus.delete(v);
      return s;
    }
    default: throw new ErreurCanonique(chemin, `valeur ${typeof v} hors JSON`);
  }
}
const jsonCanoniqueOrigine = (v: unknown) => canonOrigine(v, '', new Set());
const estObjet = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const egalOrigine = (a: unknown, b: unknown) => { try { return jsonCanoniqueOrigine(a) === jsonCanoniqueOrigine(b); } catch { return false; } };
function cheminsOrigine(a: unknown, b: unknown, chemin = ''): string[] {
  if (estObjet(a) && estObjet(b)) {
    const out: string[] = [];
    for (const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const ch = `${chemin}/${echapperSegment(k)}`;
      if (!(k in a) || !(k in b)) out.push(ch);
      else out.push(...cheminsOrigine(a[k], b[k], ch));
    }
    return out;
  }
  return egalOrigine(a, b) ? [] : [chemin];
}

/* ───────────────────────────── Arbres aléatoires ───────────────────────────── */

const CLES = ['a', 'b', 'id', 'x', 'é', 'a/b', 'c~d', '~1', 'toString', 'valueOf', '', 'Z', '10', '2'];
const FEUILLES: unknown[] = [0, -0, 1, -1.5, 1e21, 'texte', '', 'é·’', '\u0000', '\ud800', true, false, null];
const PIEGES: unknown[] = [undefined, NaN, Infinity, () => 1, new Date(0)];

function arbre(r: () => number, profondeur: number, pieges: boolean): unknown {
  const t = r();
  if (profondeur <= 0 || t < 0.35) {
    if (pieges && r() < 0.03) return PIEGES[Math.floor(r() * PIEGES.length)];
    return FEUILLES[Math.floor(r() * FEUILLES.length)];
  }
  if (t < 0.5) return Array.from({ length: Math.floor(r() * 4) }, () => arbre(r, profondeur - 1, pieges));
  const o: Record<string, unknown> = {};
  const n = Math.floor(r() * 5);
  for (let i = 0; i < n; i++) o[CLES[Math.floor(r() * CLES.length)]!] = arbre(r, profondeur - 1, pieges);
  return o;
}

/** Variante de `x` · quelques feuilles changées, clés retirées ou ajoutées. */
function variante(r: () => number, x: unknown): unknown {
  if (estObjet(x)) {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) if (r() > 0.1) o[k] = r() < 0.2 ? variante(r, v) : v;
    if (r() < 0.2) o[CLES[Math.floor(r() * CLES.length)]!] = FEUILLES[Math.floor(r() * FEUILLES.length)];
    return o;
  }
  return r() < 0.3 ? FEUILLES[Math.floor(r() * FEUILLES.length)] : x;
}

const resultat = (f: () => unknown) => { try { return { ok: f() }; } catch (e) { return { erreur: e instanceof ErreurCanonique ? `${e.name}:${e.message}:${e.chemin}` : String(e) }; } };

describe('nouvelle forme canonique ≡ forme d’origine', () => {
  it('3000 arbres aléatoires (valeurs hors JSON comprises) · même chaîne ou même erreur au même chemin', () => {
    const r = aleatoireDeterministe(42);
    let erreurs = 0;
    for (let i = 0; i < 3000; i++) {
      const x = arbre(r, 5, true);
      const attendu = resultat(() => jsonCanoniqueOrigine(x));
      if ('erreur' in attendu) erreurs++;
      expect(resultat(() => jsonCanonique(x))).toEqual(attendu);
      expect(resultat(() => avecCanoniqueMemorise(() => jsonCanonique(x)))).toEqual(attendu);
    }
    expect(erreurs).toBeGreaterThan(50); // les chemins d'erreur sont réellement exercés
  });

  it('référence circulaire · même erreur, même chemin, avec ou sans mémoire', () => {
    const o: Record<string, unknown> = { 'a/b': { c: [1] } };
    ((o['a/b'] as Record<string, unknown>).c as unknown[]).push(o);
    const attendu = resultat(() => jsonCanoniqueOrigine(o));
    expect(attendu).toEqual({ erreur: 'ErreurCanonique:référence circulaire en /a~1b/c/1:/a~1b/c/1' });
    expect(resultat(() => jsonCanonique(o))).toEqual(attendu);
    expect(resultat(() => avecCanoniqueMemorise(() => jsonCanonique(o)))).toEqual(attendu);
  });

  it('la mémoire ne survit pas à sa portée · un objet modifié après coup est resérialisé', () => {
    const o = { a: { b: 1 } };
    const avant = avecCanoniqueMemorise(() => empreinteContenu(o));
    o.a.b = 2;
    expect(avecCanoniqueMemorise(() => empreinteContenu(o))).not.toBe(avant);
    expect(empreinteContenu(o)).toBe(createHash('sha256').update(jsonCanoniqueOrigine(o)).digest('hex'));
  });

  it('SHA-256 du texte · identique à node:crypto, unités UTF-16 isolées comprises', () => {
    const r = aleatoireDeterministe(7);
    for (let i = 0; i < 300; i++) {
      const n = Math.floor(r() * 300);
      let s = '';
      for (let j = 0; j < n; j++) s += String.fromCharCode(Math.floor(r() * 0xffff));
      expect(sha256Hex(s)).toBe(createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex'));
    }
  });
});

describe('nouvelles différences ≡ différences d’origine', () => {
  it('3000 paires aléatoires (clés héritées, clés échappées, -0, valeurs hors JSON)', () => {
    const r = aleatoireDeterministe(4242);
    let nonVides = 0;
    for (let i = 0; i < 3000; i++) {
      const a = arbre(r, 5, true);
      const b = r() < 0.5 ? variante(r, a) : arbre(r, 5, true);
      const attendu = cheminsOrigine(a, b);
      if (attendu.length) nonVides++;
      expect(cheminsDifferents(a, b)).toEqual(attendu);
    }
    expect(nonVides).toBeGreaterThan(1000);
  });

  it('une clé PROPRE nommée comme une clé héritée (`toString`) est bien une différence', () => {
    expect(cheminsDifferents({}, { toString: 1 })).toEqual(cheminsOrigine({}, { toString: 1 }));
    expect(cheminsDifferents({}, { toString: 1 })).toEqual(['/toString']);
  });
});

describe('juge de validité partagé ≡ un calcul par sortie', () => {
  it('200 sorties sur deux versions sources · même ensemble que l’appel unitaire d’origine', () => {
    const c = contenuEchelle('petit');
    const o = appliquerOperationVideo(c, { type: 'narration', shotId: c.shots.order.find((s) => c.shots.byId[s]!.speechMode !== 'none')!, narration: 'Une autre phrase.' });
    if (!o.ok) throw new Error(o.message);
    const sources = [c, o.contenu];
    const produites = sources.flatMap((source) => [...c.shots.order.map((s) => `keyframe:${s}`), ...c.shots.order.map((s) => `voix:${s}`), 'montage', 'composition', 'inconnue'].map((operation) => ({ operation, source })));
    const unitaire = new Set(produites.filter((p) => sortiesValides(o.contenu, [p]).has(p.operation)).map((p) => `${p.operation}@${sources.indexOf(p.source)}`));
    const juge = jugeSortiesValides(o.contenu);
    const partage = new Set(produites.filter((p) => juge(p.operation, p.source)).map((p) => `${p.operation}@${sources.indexOf(p.source)}`));
    expect(partage).toEqual(unitaire);
    expect(partage.size).toBeGreaterThan(20);
    expect(unitaire.has('montage@0')).toBe(false); // la narration change le montage
  });
});
