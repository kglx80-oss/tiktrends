import { describe, it, expect } from 'vitest';
import {
  retenirJournees, marquesRetenues, cboRetenu, sommeRetenues, importeesDans, journeesReporting,
  type EntreeMesure, type EntreeRetenue, type JourneeMetaLue, type MesuresLigne,
} from '../src';

/**
 * La marque « retenue » ÉCRITE rend exactement ce que rend la règle appliquée
 * entrée par entrée · c'est ce qui autorise une fenêtre à se lire en sommes SQL
 * des entrées marquées (`lireJourneesRetenues`, 0073).
 *
 * Les deux chemins, tels que la lecture d'une fenêtre les compose ·
 *  · entrée par entrée · `retenirJournees(journées Meta du jour, TOUTES les
 *    entrées d'export, jours Meta de chaque ad)` ;
 *  · marqué · `marquesRetenues(entrées, jours Meta)`, puis les entrées
 *    marquées sommées par premier jour (ce que fait le SQL), et les ads sans
 *    marque relues entrée par entrée.
 *
 * Tirages pseudo-aléatoires à graine fixe · les montants sont des multiples de
 * 0,25 (exacts en binaire) · deux sommes dans deux ordres sont alors égales AU
 * BIT, et l'égalité vérifiée est stricte (`toEqual`), jamais « à peu près ».
 */

/** xorshift32 · la graine est brassée et les premiers tirages jetés (une petite graine donne sinon des tirages proches de zéro). */
function alea(graine: number) {
  let x = (Math.imul(graine + 1, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  const suivant = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
  for (let i = 0; i < 16; i++) suivant();
  return suivant;
}
const J = (k: number) => new Date(Date.UTC(2026, 6, 1) + k * 86_400_000).toISOString().slice(0, 10);

interface Jeu {
  csv: Map<string, EntreeMesure[]>;
  joursMeta: Map<string, Set<string>>;
  metaDuJour: JourneeMetaLue[];
}

function mesures(r: () => number): MesuresLigne {
  const q = (n: number) => Math.floor(r() * n * 4) / 4;
  const m: MesuresLigne = { spend: q(200), impressions: Math.floor(r() * 5000), linkClicks: Math.floor(r() * 80), purchases: Math.floor(r() * 6) };
  if (r() < 0.7) m.clicks = Math.floor(r() * 120);
  if (r() < 0.7) m.purchaseValue = q(400);
  if (r() < 0.5) m.video3s = Math.floor(r() * 900);
  return m;
}

function tirer(graine: number): Jeu {
  const r = alea(graine);
  const csv = new Map<string, EntreeMesure[]>();
  const joursMeta = new Map<string, Set<string>>();
  const nAds = 1 + Math.floor(r() * 8);
  for (let a = 0; a < nAds; a++) {
    const adId = `ad${a}`;
    const vues = new Set<string>();
    const es: EntreeMesure[] = [];
    const nE = Math.floor(r() * 14);
    for (let i = 0; i < nE; i++) {
      const d = Math.floor(r() * 40);
      const long = r() < 0.65 ? 1 : 2 + Math.floor(r() * 6);
      const e = { debut: J(d), fin: J(d + long - 1), mesures: mesures(r) };
      const cle = `${e.debut}|${e.fin}`; // la clé primaire (ad, début, fin) · jamais deux fois la même période
      if (vues.has(cle)) continue;
      vues.add(cle);
      es.push(e);
    }
    if (es.length) csv.set(adId, es);
    const jm = new Set<string>();
    const nM = r() < 0.3 ? 0 : Math.floor(r() * 20);
    for (let i = 0; i < nM; i++) jm.add(J(Math.floor(r() * 45)));
    if (jm.size) joursMeta.set(adId, jm);
  }
  // Les journées Meta de la marque, sommées par jour (adId nul) · ce que lit une fenêtre.
  const metaDuJour: JourneeMetaLue[] = [];
  for (let d = 0; d < 45; d++) if (r() < 0.6) metaDuJour.push({ adId: null, debut: J(d), fin: J(d), mesures: mesures(r) });
  return { csv, joursMeta, metaDuJour };
}

const m0 = (): MesuresLigne => ({ spend: 0, impressions: 0, linkClicks: 0, purchases: 0, clicks: 0, purchaseValue: 0, video3s: 0 });
const n = (v: number | undefined) => v ?? 0;

/** Les entrées marquées `true`, sommées par premier jour · la requête SQL de la fenêtre (`sommesCsvRetenuesParJour`). */
function sommesParJour(es: Iterable<EntreeMesure>): EntreeRetenue[] {
  const parJour = new Map<string, EntreeRetenue>();
  for (const e of es) {
    let t = parJour.get(e.debut);
    if (!t) parJour.set(e.debut, (t = { adId: null, debut: e.debut, fin: e.debut, source: 'csv', nombre: 0, mesures: m0() }));
    const m = t.mesures;
    m.spend += e.mesures.spend; m.impressions += e.mesures.impressions; m.linkClicks += e.mesures.linkClicks; m.purchases += e.mesures.purchases;
    m.clicks = n(m.clicks) + n(e.mesures.clicks); m.purchaseValue = n(m.purchaseValue) + n(e.mesures.purchaseValue); m.video3s = n(m.video3s) + n(e.mesures.video3s);
    t.nombre!++;
  }
  return [...parJour.values()];
}

/** La lecture entrée par entrée · le repli, et la référence. */
const entreeParEntree = (j: Jeu) => retenirJournees(j.metaDuJour, j.csv, j.joursMeta).entrees;

/** La lecture marquée · `aRelire` · les ads dont une entrée n'a pas de marque (relues entrée par entrée). */
function marquee(j: Jeu, marques: ReadonlyMap<EntreeMesure, boolean | null>, aRelire: ReadonlySet<string> = new Set()): EntreeRetenue[] {
  const relues = new Map([...j.csv].filter(([a]) => aRelire.has(a)));
  const repli = retenirJournees(j.metaDuJour, relues, j.joursMeta).entrees;
  const marquees = [...j.csv].filter(([a]) => !aRelire.has(a)).flatMap(([, es]) => es.filter((e) => marques.get(e) === true));
  return [...repli, ...sommesParJour(marquees)];
}

/** Ce qu'un écran lit d'une fenêtre · les sommes, le nombre d'entrées d'export, et le Reporting sommé par jour. */
function lu(es: readonly EntreeRetenue[], du: string, au: string) {
  const parJour: Record<string, [number, number, number, number, number, number]> = {};
  for (const l of journeesReporting(es, du, au)) {
    const t = (parJour[l.date] ??= [0, 0, 0, 0, 0, 0]);
    t[0] += l.depense; t[1] += l.impressions; t[2] += l.clics; t[3] += l.achats; t[4] += l.revenu; t[5] += l.vues3s;
  }
  return { somme: sommeRetenues(es, du, au), importees: importeesDans(es, du, au), reporting: parJour };
}

function fenetres(graine: number): Array<[string, string]> {
  const r = alea(graine * 7919 + 17);
  const out: Array<[string, string]> = [[J(0), J(60)]];
  for (let i = 0; i < 4; i++) { const a = Math.floor(r() * 45), b = a + Math.floor(r() * 30); out.push([J(a), J(b)]); }
  return out;
}

const TIRAGES = 240;

describe('la marque « retenue » · exactement la règle entrée par entrée (240 tirages, 5 fenêtres chacun)', () => {
  it('lecture marquée = lecture entrée par entrée · sommes, entrées d’export comptées, Reporting jour par jour', () => {
    let comparees = 0, avecExport = 0, avecEcartee = 0, memeJour = 0;
    for (let g = 1; g <= TIRAGES; g++) {
      const j = tirer(g);
      const ref = entreeParEntree(j);
      const m = marquesRetenues(j.csv, j.joursMeta);
      expect([...j.csv.values()].flat().every((e) => m.has(e)), `tirage ${g} · une entrée sans marque`).toBe(true);
      const mq = marquee(j, m);
      for (const [du, au] of fenetres(g)) {
        expect(lu(mq, du, au), `tirage ${g}, fenêtre ${du} → ${au} · la lecture marquée ne rend pas les sommes de la lecture entrée par entrée`).toEqual(lu(ref, du, au));
        comparees++;
      }
      if ([...m.values()].some(Boolean)) avecExport++;
      if (mq.some((e) => (e.nombre ?? 1) > 1)) memeJour++;
      if ([...m.values()].some((x) => !x)) avecEcartee++;
    }
    expect(comparees).toBe(TIRAGES * 5);
    // Témoins · le jeu exerce les deux issues (compte, écartée) · sinon l'égalité ne prouverait rien.
    expect(avecExport, 'témoin · aucun tirage n’a d’entrée retenue').toBeGreaterThan(TIRAGES * 0.8);
    expect(avecEcartee, 'témoin · aucun tirage n’a d’entrée écartée').toBeGreaterThan(TIRAGES * 0.5);
    expect(memeJour, 'témoin · aucun tirage n’a deux entrées retenues le même jour (une ligne SQL en additionne plusieurs)').toBeGreaterThan(TIRAGES * 0.5);
  });

  it('marques à moitié écrites (lignes d’avant 0073, ou invalidées) · les ads sans marque relues une à une, le total reste exact', () => {
    for (let g = 1; g <= TIRAGES; g++) {
      const j = tirer(g);
      const r = alea(g * 31 + 5);
      const ref = entreeParEntree(j);
      const m = marquesRetenues(j.csv, j.joursMeta) as Map<EntreeMesure, boolean | null>;
      const aRelire = new Set<string>();
      for (const [adId, es] of j.csv) if (r() < 0.4) { aRelire.add(adId); for (const e of es) if (r() < 0.5) m.set(e, null); }
      for (const [du, au] of fenetres(g)) {
        expect(lu(marquee(j, m, aRelire), du, au), `tirage ${g} · ads à relire ${[...aRelire].join(',')} · le repli ne rend pas les sommes exactes`).toEqual(lu(ref, du, au));
      }
    }
  });

  it('une synchro ajoute un jour Meta qui COUVRE une entrée d’export · recalculée, l’entrée n’est plus comptée, et l’égalité tient', () => {
    let couvertes = 0;
    for (let g = 1; g <= TIRAGES; g++) {
      const j = tirer(g);
      const m = marquesRetenues(j.csv, j.joursMeta);
      const cible = [...j.csv].flatMap(([adId, es]) => es.map((e) => ({ adId, e }))).find(({ e }) => m.get(e));
      if (!cible) continue;
      // La synchro écrit une journée Meta dans la période de l'entrée retenue.
      const apres: Jeu = { ...j, joursMeta: new Map(j.joursMeta) };
      apres.joursMeta.set(cible.adId, new Set([...(j.joursMeta.get(cible.adId) ?? []), cible.e.fin]));
      const m2 = marquesRetenues(apres.csv, apres.joursMeta);
      expect(m2.get(cible.e), `tirage ${g} · l’entrée couverte par la connexion est encore marquée retenue`).toBe(false);
      // L'ancienne marque, relue sans recalcul, compterait encore l'entrée · c'est ce que le recalcul doit défaire.
      const [du, au] = [J(0), J(60)];
      expect(lu(marquee(apres, m2), du, au), `tirage ${g} · après la synchro, la lecture marquée diffère`).toEqual(lu(entreeParEntree(apres), du, au));
      expect(lu(marquee(apres, m), du, au), `témoin, tirage ${g} · la marque d’avant la synchro rendrait déjà le bon compte (l’égalité ne prouverait rien)`).not.toEqual(lu(entreeParEntree(apres), du, au));
      couvertes++;
    }
    expect(couvertes, 'témoin · aucun tirage n’avait d’entrée à couvrir').toBeGreaterThan(TIRAGES * 0.8);
  });

  it('la marque d’une entrée se décide sur TOUTES les entrées de l’ad · une entrée plus courte, hors fenêtre, en écarte une plus longue', () => {
    const semaine = { debut: J(0), fin: J(6), mesures: { spend: 300, impressions: 1, linkClicks: 1, purchases: 1 } };
    const jour = { debut: J(6), fin: J(6), mesures: { spend: 10, impressions: 1, linkClicks: 1, purchases: 0 } };
    const m = marquesRetenues(new Map([['a', [semaine, jour]]]), new Map());
    expect([m.get(semaine), m.get(jour)], 'la journée l’emporte sur la période qui la couvre').toEqual([false, true]);
    const meta = marquesRetenues(new Map([['a', [semaine]]]), new Map([['a', new Set([J(3)])]]));
    expect(meta.get(semaine), 'une période qui couvre un jour mesuré par la connexion compte encore').toBe(false);
    expect(marquesRetenues(new Map([['a', [semaine]]]), new Map([['b', new Set([J(3)])]])).get(semaine), 'les jours Meta d’une AUTRE ad écartent l’entrée').toBe(true);
  });
});

describe('cboRetenu · l’instance d’abord, le relais du lot ensuite', () => {
  it('le CBO écrit sur l’instance l’emporte, dans les deux sens · NULL (instance d’avant 0073) → le relais', () => {
    expect([cboRetenu(true, false), cboRetenu(false, true), cboRetenu(null, true), cboRetenu(undefined, true), cboRetenu(null, false)]).toEqual([true, false, true, true, false]);
  });
});
