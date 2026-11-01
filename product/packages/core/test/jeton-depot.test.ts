import { describe, expect, it } from 'vitest';
import {
  DUREE_JETON_DEPOT_MAX_S, MESSAGES_REFUS_LOGO, REFUS_LOGO_NON_ATTESTE, TEXTES_REFUS_JETON_DEPOT,
  decisionCharteDeposee, dureeJetonDepotS, formeJetonDepot, jetonDepotPour, refusJetonDepot, type JetonDepot,
} from '../src';

/**
 * Jeton de dépôt d'un logo importé · on lit la DÉCISION rendue (accepté,
 * message de refus, adresse à retirer), jamais la présence d'un appel.
 */
const BASE = 'https://s3.exemple.test/tt';
const WS = 'ws-a';
const bucket = { base: BASE, espace: WS };
const CLE = `assets/${WS}/1700000000000-abcd1234-logo.png`;
const NEUF = `${BASE}/${CLE}`;
const ANCIEN = 'http://ancien-site.fr/logo.png';
const T0 = 1_800_000_000_000;
const jeton = (j: Partial<JetonDepot> = {}): JetonDepot => ({ ...jetonDepotPour({ espace: WS, cle: CLE, taille: 12_000, maintenant: T0 }), ...j });
const decider = (o: { logoUrl: string; logos: string[]; deja?: string[]; jeton?: JetonDepot | null | 'illisible'; maintenant?: number }) =>
  decisionCharteDeposee({ charte: { logoUrl: o.logoUrl, logos: o.logos }, dejaEnregistrees: o.deja ?? [ANCIEN], bucket, jeton: o.jeton === undefined ? jeton() : o.jeton, maintenant: o.maintenant ?? T0 + 1000 });

describe('dureeJetonDepotS · dérivée du lien de dépôt (tableau mesuré du module)', () => {
  it('rend les valeurs du tableau, et le plafond', () => {
    expect(dureeJetonDepotS(2 * 1024 * 1024)).toBe(160);
    expect(dureeJetonDepotS(4_000_000)).toBe(196);
    expect(dureeJetonDepotS(64 * 1024 * 1024)).toBe(DUREE_JETON_DEPOT_MAX_S);
    expect(DUREE_JETON_DEPOT_MAX_S).toBe(960);
    expect(dureeJetonDepotS(Number.NaN)).toBe(120);
  });
  it('jetonDepotPour · espace, clé, expiration en millisecondes', () => {
    expect(jetonDepotPour({ espace: WS, cle: CLE, taille: 4_000_000, maintenant: T0 })).toEqual({ v: 1, espace: WS, cle: CLE, expireLe: T0 + 196_000 });
  });
});

describe('formeJetonDepot · seule la forme exacte passe', () => {
  it('accepte un jeton bien formé, refuse le reste', () => {
    expect(formeJetonDepot(jeton())).toEqual(jeton());
    for (const x of [null, 'x', [], {}, { ...jeton(), v: 2 }, { ...jeton(), espace: '' }, { ...jeton(), cle: 3 }, { ...jeton(), expireLe: '1' }, { ...jeton(), autre: 1 }]) {
      expect(formeJetonDepot(x), JSON.stringify(x)).toBeNull();
    }
  });
});

describe('refusJetonDepot · espace, clé, expiration', () => {
  const cible = { espace: WS, cle: CLE, maintenant: T0 + 1000 };
  it('atteste le bon dépôt, refuse chaque écart avec sa raison', () => {
    expect(refusJetonDepot(jeton(), cible)).toBeNull();
    expect(refusJetonDepot(null, cible)).toBe('absent');
    expect(refusJetonDepot('illisible', cible)).toBe('illisible');
    expect(refusJetonDepot(jeton({ espace: 'ws-b' }), cible)).toBe('autre_espace');
    expect(refusJetonDepot(jeton({ cle: `assets/${WS}/autre.png` }), cible)).toBe('autre_cle');
    expect(refusJetonDepot(jeton(), { ...cible, maintenant: jeton().expireLe })).toBeNull();
    expect(refusJetonDepot(jeton(), { ...cible, maintenant: jeton().expireLe + 1 })).toBe('expire');
  });
});

describe('decisionCharteDeposee · la charte face au jeton', () => {
  it('logo importé avec son jeton · accepté, le dépôt est rattaché à l’écriture, rien à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [ANCIEN, NEUF] })).toEqual({ ok: true, deposes: [NEUF], aRetirer: [] });
  });

  it('adresse du bucket nouvelle SANS jeton · refusée, rien à retirer (rien n’est prouvé)', () => {
    expect(decider({ logoUrl: NEUF, logos: [ANCIEN, NEUF], jeton: null })).toEqual({ ok: false, erreur: REFUS_LOGO_NON_ATTESTE, aRetirer: [] });
    expect(decider({ logoUrl: NEUF, logos: [ANCIEN, NEUF], jeton: 'illisible' })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.illisible, aRetirer: [] });
  });

  it('jeton d’un autre espace · refusé, rien à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [NEUF], jeton: jeton({ espace: 'ws-b' }) })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.autre_espace, aRetirer: [] });
  });

  it('jeton expiré · refusé, son dépôt (prouvé) est à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [NEUF], maintenant: jeton().expireLe + 1 })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.expire, aRetirer: [NEUF] });
  });

  it('jeton d’une autre clé · refusé, le dépôt du jeton est à retirer, l’adresse présentée jamais', () => {
    const AUTRE = `${BASE}/assets/${WS}/1700000000001-ffff0000-autre.png`;
    expect(decider({ logoUrl: AUTRE, logos: [AUTRE] })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.autre_cle, aRetirer: [NEUF] });
  });

  it('deux adresses du bucket nouvelles · un jeton n’en atteste qu’une', () => {
    const AUTRE = `${BASE}/assets/${WS}/1700000000001-ffff0000-autre.png`;
    expect(decider({ logoUrl: NEUF, logos: [NEUF, AUTRE] })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.autre_cle, aRetirer: [NEUF] });
  });

  it('charte refusée pour une AUTRE adresse (externe invalide) · refusée, le dépôt attesté est à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [NEUF, 'javascript:alert(1)'] })).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO.schema, aRetirer: [NEUF] });
  });

  it('charte valide qui ne retient pas le dépôt attesté · acceptée, le dépôt est à retirer', () => {
    expect(decider({ logoUrl: ANCIEN, logos: [ANCIEN] })).toEqual({ ok: true, deposes: [], aRetirer: [NEUF] });
  });

  it('adresse du bucket DÉJÀ enregistrée · acceptée sans jeton, jamais à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [NEUF], deja: [NEUF], jeton: null })).toEqual({ ok: true, deposes: [], aRetirer: [] });
    expect(decider({ logoUrl: NEUF, logos: [NEUF, 'javascript:x'], deja: [NEUF] })).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO.schema, aRetirer: [] });
  });

  it('adresse externe https · acceptée sans jeton (« Ajouter » par adresse inchangé), refusée hors règle', () => {
    expect(decider({ logoUrl: 'https://cdn.exemple.fr/l.png', logos: [ANCIEN, 'https://cdn.exemple.fr/l.png'], jeton: null })).toEqual({ ok: true, deposes: [], aRetirer: [] });
    expect(decider({ logoUrl: 'https://127.0.0.1/l.png', logos: [], jeton: null })).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO.hote, aRetirer: [] });
  });

  it('sans stockage configuré · un jeton ne prouve rien, rien à retirer', () => {
    expect(decisionCharteDeposee({ charte: { logoUrl: 'https://cdn.exemple.fr/l.png', logos: [] }, dejaEnregistrees: [], bucket: null, jeton: jeton(), maintenant: T0 })).toEqual({ ok: true, deposes: [], aRetirer: [] });
  });

  it('jeton dont la clé sort de l’espace (remontée) · ne prouve rien', () => {
    expect(decider({ logoUrl: ANCIEN, logos: [ANCIEN], jeton: jeton({ cle: `assets/${WS}/../ws-b/x.png` }) })).toEqual({ ok: true, deposes: [], aRetirer: [] });
  });
});
