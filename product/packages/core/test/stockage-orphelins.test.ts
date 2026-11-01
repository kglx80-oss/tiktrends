import { describe, expect, it } from 'vitest';
import {
  DELAI_GRACE_ORPHELIN_MS, DEPOT_MAX_OCTETS, PIRE_CAS_DEPOT_MS, PLAFONDS_DEPOT, PLUS_GROS_ORPHELINS, RECENSEMENT_REFERENCES_STOCKAGE,
  VALIDITE_LIEN_DEPOT_S, clesReferencees, espaceDeLaCle, inventaireOrphelins, referencesDansTexte, verdictObjetStocke, vueInventaireStockage,
  type ContexteOrphelins, type ObjetStocke,
} from '../src';

/**
 * Stockage · inventaire des candidats orphelins · la règle pure. On lit le
 * VERDICT rendu pour chaque objet et les comptes agrégés, jamais la présence
 * d'un appel.
 */
const WS = 'a1111111-2222-4333-8444-55555555555b';
const AUTRE = '99999999-2222-4333-8444-555555555555';
const MAINTENANT = new Date('2026-11-01T12:00:00Z');
const VIEUX = new Date(MAINTENANT.getTime() - 3 * 86_400_000);
const BASE = 'https://cdn.exemple.test/bucket';

const obj = (cle: string, taille = 100, modifieLe: Date | null = VIEUX): ObjetStocke => ({ cle, taille, modifieLe });
const ctx = (o: Partial<ContexteOrphelins> = {}): ContexteOrphelins => ({
  maintenant: MAINTENANT, espaces: new Set([WS]), references: new Set(), referencesCompletes: true, ...o,
});

describe('Stockage · le délai de grâce est mesuré, pas posé d’instinct', () => {
  it('le pire cas = lien d’envoi entier + le plus gros dépôt admis à 1 Mbit/s, et la grâce le couvre au moins trois fois', () => {
    expect(DEPOT_MAX_OCTETS).toBe(Math.max(...Object.values(PLAFONDS_DEPOT)));
    expect(DEPOT_MAX_OCTETS).toBe(1_073_741_824);
    expect(VALIDITE_LIEN_DEPOT_S).toBe(900);
    expect(Math.round(PIRE_CAS_DEPOT_MS / 1000)).toBe(9_490);
    expect(DELAI_GRACE_ORPHELIN_MS, 'grâce < 3 × le pire cas mesuré').toBeGreaterThanOrEqual(3 * PIRE_CAS_DEPOT_MS);
    expect(DELAI_GRACE_ORPHELIN_MS).toBeGreaterThan(VALIDITE_LIEN_DEPOT_S * 1000);
  });
});

describe('Stockage · verdict d’un objet · tout doute est un non', () => {
  it('format exact `assets/<uuid>/<fichier>` · tout le reste est hors format, jamais candidat', () => {
    expect(espaceDeLaCle(`assets/${WS}/1700-ab-photo.png`)).toBe(WS);
    for (const cle of [
      `assets/${WS}/sous/dossier.png`, `assets/${WS}/`, `assets/${WS}/..`, `assets/${WS}/a b.png`, `assets/${WS}/x%2F.png`,
      `assets/_healthcheck/x.txt`, `assets/${WS.toUpperCase()}/x.png`, `renders/${WS}/x.png`, `studios/${WS}/j/x.png`, `/assets/${WS}/x.png`, '',
    ]) expect(verdictObjetStocke(obj(cle), ctx()).motif, cle).toBe('hors_format');
    expect(verdictObjetStocke(obj(`assets/${WS}/x.png`, -1), ctx()).motif, 'taille illisible').toBe('hors_format');
  });

  it('espace absent de la base · espace inconnu, jamais candidat', () => {
    expect(verdictObjetStocke(obj(`assets/${AUTRE}/x.png`), ctx())).toEqual({ motif: 'espace_inconnu', espace: AUTRE });
  });

  it('date absente ou illisible · date inconnue, jamais candidat', () => {
    expect(verdictObjetStocke(obj(`assets/${WS}/x.png`, 1, null), ctx()).motif).toBe('date_inconnue');
    expect(verdictObjetStocke(obj(`assets/${WS}/x.png`, 1, new Date('nope')), ctx()).motif).toBe('date_inconnue');
  });

  it('plus jeune que le délai de grâce · récent, même sans référence', () => {
    const juste = new Date(MAINTENANT.getTime() - DELAI_GRACE_ORPHELIN_MS + 1000);
    expect(verdictObjetStocke(obj(`assets/${WS}/x.png`, 1, juste), ctx()).motif).toBe('recent');
    const passe = new Date(MAINTENANT.getTime() - DELAI_GRACE_ORPHELIN_MS - 1000);
    expect(verdictObjetStocke(obj(`assets/${WS}/x.png`, 1, passe), ctx()).motif).toBe('candidat');
  });

  it('pointé par une référence · sous toutes ses formes (adresse, clé brute, JSON, adresse encodée, ponctuation)', () => {
    const cle = `assets/${WS}/1700-ab-logo.png`;
    for (const texte of [
      `${BASE}/${cle}`,
      cle,
      JSON.stringify({ logo: { url: `${BASE}/${cle}` } }),
      `/api/brands/b/media?url=${encodeURIComponent(`${BASE}/${cle}`)}`,
      `Voici le logo (${BASE}/${cle}).`,
      `https://bucket.s3.exemple.test/${cle}?X-Amz-Signature=abc`,
    ]) {
      const refs = clesReferencees(referencesDansTexte(texte));
      expect(verdictObjetStocke(obj(cle), ctx({ references: refs })).motif, texte).toBe('reference');
    }
    // Une autre clé du même espace n'est pas couverte par cette référence.
    const refs = clesReferencees([`${BASE}/${cle}`]);
    expect(verdictObjetStocke(obj(`assets/${WS}/1700-ab-autre.png`), ctx({ references: refs })).motif).toBe('candidat');
  });

  it('lecture des références incomplète · aucun candidat, par prudence', () => {
    expect(verdictObjetStocke(obj(`assets/${WS}/x.png`), ctx({ referencesCompletes: false })).motif).toBe('references_incompletes');
  });

  it('un vrai orphelin · espace connu, vieux, non référencé, lectures complètes ⇒ candidat', () => {
    expect(verdictObjetStocke(obj(`assets/${WS}/1700-ab-orphelin.mp4`), ctx())).toEqual({ motif: 'candidat', espace: WS });
  });
});

describe('Stockage · l’inventaire · des comptes, jamais une action', () => {
  it('compte par verdict, par espace, et garde les 50 plus gros candidats, le plus lourd d’abord', () => {
    const WS2 = '22222222-2222-4333-8444-555555555555';
    const objets: ObjetStocke[] = [
      ...Array.from({ length: 60 }, (_, i) => obj(`assets/${WS}/o-${String(i).padStart(2, '0')}.png`, 1000 + i)),
      obj(`assets/${WS2}/gros.mp4`, 9_000_000),
      obj(`assets/${WS}/ref.png`, 5),
      obj(`assets/${WS}/neuf.png`, 7, new Date(MAINTENANT.getTime() - 60_000)),
      obj(`assets/${AUTRE}/x.png`, 3),
      obj('assets/_healthcheck/x.txt', 2),
    ];
    const inv = inventaireOrphelins(objets, ctx({ espaces: new Set([WS, WS2]), references: clesReferencees([`${BASE}/assets/${WS}/ref.png`]) }));
    expect(inv.objets.nombre).toBe(65);
    expect(inv.candidats).toEqual({ nombre: 61, octets: 9_000_000 + 60 * 1000 + (59 * 60) / 2 });
    expect(inv.motifs.reference).toEqual({ nombre: 1, octets: 5 });
    expect(inv.motifs.recent).toEqual({ nombre: 1, octets: 7 });
    expect(inv.motifs.espace_inconnu.nombre).toBe(1);
    expect(inv.motifs.hors_format.nombre).toBe(1);
    expect(inv.parEspace.map((e) => [e.espace, e.nombre])).toEqual([[WS2, 1], [WS, 60]]);
    expect(inv.plusGros).toHaveLength(PLUS_GROS_ORPHELINS);
    expect(inv.plusGros[0]!.cle).toBe(`assets/${WS2}/gros.mp4`);
    expect(inv.plusGros[1]!.cle).toBe(`assets/${WS}/o-59.png`);
    expect(inv.plusGros.map((o) => o.cle)).not.toContain(`assets/${WS}/ref.png`);
  });

  it('l’écran · avertit d’une liste partielle et d’une lecture incomplète, sans tiret cadratin', () => {
    const inv = inventaireOrphelins([obj(`assets/${WS}/x.png`, 2048)], ctx({ referencesCompletes: false }));
    const v = vueInventaireStockage(inv, { listeComplete: false, erreurListe: 'borne atteinte', colonnesIncompletes: ['generations.input_json'] }, { [WS]: 'Maison' }, MAINTENANT);
    expect(v.avertissements).toEqual([
      'Liste des fichiers partielle (borne atteinte) · les chiffres ne portent que sur les fichiers lus.',
      'Lecture des références incomplète (generations.input_json) · par prudence, aucun fichier n’est compté comme orphelin.',
    ]);
    expect(v.kpis.find((k) => k.lbl === 'Candidats orphelins')?.v).toBe('0');
    expect(JSON.stringify(v)).not.toContain('—');
    const ok = vueInventaireStockage(inventaireOrphelins([obj(`assets/${WS}/x.png`, 2048)], ctx()), { listeComplete: true, erreurListe: null, colonnesIncompletes: [] }, { [WS]: 'Maison' }, MAINTENANT);
    expect(ok.avertissements).toEqual([]);
    expect(ok.plusGros).toEqual([{ cle: `assets/${WS}/x.png`, nom: 'Maison', volume: '2 Ko', age: 'il y a 3 j' }]);
    expect(ok.parEspace.map((e) => e.nom)).toEqual(['Maison']);
  });
});

describe('Stockage · le recensement', () => {
  it('chaque entrée est unique, nommée en SQL, et un écrivain n’est déclaré que pour une colonne `ecrit`', () => {
    const vus = new Set<string>();
    for (const r of RECENSEMENT_REFERENCES_STOCKAGE) {
      const id = `${r.table}.${r.colonne}`;
      expect(vus.has(id), `doublon ${id}`).toBe(false);
      vus.add(id);
      expect(r.table).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(r.colonne).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(r.nature === 'ecrit' ? r.ecrivains.length > 0 : r.ecrivains.length === 0, id).toBe(true);
    }
    // Les deux références que la mission impose de couvrir.
    expect(vus).toContain('assets.url');
    expect(vus).toContain('brands.logo_url');
    expect(vus).toContain('brands.logos');
  });
});
