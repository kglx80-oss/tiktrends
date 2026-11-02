import { describe, expect, it } from 'vitest';
import {
  DUREE_JETON_DEPOT_MAX_S, LOGO_DEPOSE, MESSAGES_REFUS_LOGO, RAISON_LOGO_SANS_STOCKAGE, REFUS_LOGO_NON_ATTESTE, TEXTES_REFUS_JETON_DEPOT, TEXTES_REFUS_JETON_FICHIER, USAGES_DEPOT,
  decisionCharteDeposee, dureeJetonDepotS, formeJetonDepot, jetonDepotPour, lireUsageDepot, refusJetonDepot, resoudreJetonDepot, texteRefusJetonDepot, type JetonDepot, type RefusJetonDepot,
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
const UT = 'u-a';
const jeton = (j: Partial<JetonDepot> = {}): JetonDepot => ({ ...jetonDepotPour({ espace: WS, utilisateur: UT, usage: 'logo', cle: CLE, type: 'image/png', taille: 12_000, maintenant: T0 }), ...j });
const decider = (o: { logoUrl: string; logos: string[]; deja?: string[]; jeton?: JetonDepot | null | 'illisible'; maintenant?: number; utilisateur?: string; dejaCite?: boolean }) =>
  decisionCharteDeposee({ charte: { logoUrl: o.logoUrl, logos: o.logos }, dejaEnregistrees: o.deja ?? [ANCIEN], bucket, jeton: o.jeton === undefined ? jeton() : o.jeton, utilisateur: o.utilisateur ?? UT, maintenant: o.maintenant ?? T0 + 1000, dejaCite: o.dejaCite });

describe('dureeJetonDepotS · dérivée du lien de dépôt (tableau mesuré du module)', () => {
  it('rend les valeurs du tableau, et le plafond', () => {
    expect(dureeJetonDepotS(2 * 1024 * 1024)).toBe(160);
    expect(dureeJetonDepotS(4_000_000)).toBe(196);
    expect(dureeJetonDepotS(64 * 1024 * 1024)).toBe(DUREE_JETON_DEPOT_MAX_S);
    expect(DUREE_JETON_DEPOT_MAX_S).toBe(960);
    expect(dureeJetonDepotS(Number.NaN)).toBe(120);
  });
  it('jetonDepotPour · espace, utilisateur, usage, clé, type et taille, expiration en millisecondes', () => {
    expect(jetonDepotPour({ espace: WS, utilisateur: UT, usage: 'envoi', cle: CLE, type: 'image/png', taille: 4_000_000, maintenant: T0 })).toEqual({ v: 3, espace: WS, utilisateur: UT, usage: 'envoi', cle: CLE, type: 'image/png', taille: 4_000_000, expireLe: T0 + 196_000 });
  });
});

describe('formeJetonDepot · seule la forme exacte passe', () => {
  it('accepte un jeton bien formé, refuse le reste', () => {
    expect(formeJetonDepot(jeton())).toEqual(jeton());
    // Le jeton de la version 1 (#987) · sans type ni taille ; de la version 2 (#991) · sans utilisateur ni usage.
    const v1 = { v: 1, espace: WS, cle: CLE, expireLe: jeton().expireLe };
    const v2 = { v: 2, espace: WS, cle: CLE, type: 'image/png', taille: 12_000, expireLe: jeton().expireLe };
    const sans = (k: keyof JetonDepot) => { const j: Record<string, unknown> = { ...jeton() }; delete j[k]; return j; };
    for (const x of [
      null, 'x', [], {}, { ...jeton(), v: 1 }, { ...jeton(), v: 2 }, v1, v2, { ...v2, v: 3 },
      sans('utilisateur'), sans('usage'), { ...jeton(), utilisateur: '' }, { ...jeton(), utilisateur: 4 }, { ...jeton(), usage: 'autre' }, { ...jeton(), usage: '' }, { ...jeton(), espace: '' }, { ...jeton(), cle: 3 }, { ...jeton(), expireLe: '1' }, { ...jeton(), autre: 1 },
      // Type et taille signés · obligatoires et bien formés.
      { ...v1, v: 2 }, { ...jeton(), type: '' }, { ...jeton(), type: 7 }, { ...jeton(), type: 'x'.repeat(129) },
      { ...jeton(), taille: 0 }, { ...jeton(), taille: 1.5 }, { ...jeton(), taille: '12000' }, { ...jeton(), taille: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      expect(formeJetonDepot(x), JSON.stringify(x)).toBeNull();
    }
  });
});

describe('refusJetonDepot · espace, utilisateur, usage, clé, expiration', () => {
  const cible = { espace: WS, utilisateur: UT, usage: 'logo' as const, cle: CLE, maintenant: T0 + 1000 };
  it('atteste le bon dépôt, refuse chaque écart avec sa raison', () => {
    expect(refusJetonDepot(jeton(), cible)).toBeNull();
    expect(refusJetonDepot(null, cible)).toBe('absent');
    expect(refusJetonDepot('illisible', cible)).toBe('illisible');
    expect(refusJetonDepot(jeton({ espace: 'ws-b' }), cible)).toBe('autre_espace');
    expect(refusJetonDepot(jeton({ cle: `assets/ws-b/1-ab-x.png` }), cible), 'clé hors de l’espace').toBe('autre_espace');
    expect(refusJetonDepot(jeton({ cle: `assets/${WS}/../ws-b/x.png` }), cible), 'remontée').toBe('autre_espace');
    expect(refusJetonDepot(jeton({ utilisateur: 'u-b' }), cible)).toBe('autre_utilisateur');
    expect(refusJetonDepot(jeton({ usage: 'envoi' }), cible)).toBe('autre_usage');
    expect(refusJetonDepot(jeton({ usage: 'logo' }), { ...cible, usage: 'remplacement' })).toBe('autre_usage');
    expect(refusJetonDepot(jeton({ cle: `assets/${WS}/autre.png` }), cible)).toBe('autre_cle');
    expect(refusJetonDepot(jeton(), { ...cible, maintenant: jeton().expireLe })).toBeNull();
    expect(refusJetonDepot(jeton(), { ...cible, maintenant: jeton().expireLe + 1 })).toBe('expire');
  });
});

describe('decisionCharteDeposee · la charte face au jeton', () => {
  it('logo importé avec son jeton · accepté, le dépôt est rattaché à l’écriture, rien à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [ANCIEN, NEUF] })).toEqual({ ok: true, charte: { logoUrl: NEUF, logos: [ANCIEN, NEUF] }, deposes: [NEUF], aRetirer: [] });
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
    expect(decider({ logoUrl: ANCIEN, logos: [ANCIEN] })).toEqual({ ok: true, charte: { logoUrl: ANCIEN, logos: [ANCIEN] }, deposes: [], aRetirer: [NEUF] });
  });

  it('adresse du bucket DÉJÀ enregistrée · acceptée sans jeton, jamais à retirer', () => {
    expect(decider({ logoUrl: NEUF, logos: [NEUF], deja: [NEUF], jeton: null })).toEqual({ ok: true, charte: { logoUrl: NEUF, logos: [NEUF] }, deposes: [], aRetirer: [] });
    expect(decider({ logoUrl: NEUF, logos: [NEUF, 'javascript:x'], deja: [NEUF] })).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO.schema, aRetirer: [] });
  });

  it('adresse externe https · acceptée sans jeton (« Ajouter » par adresse inchangé), refusée hors règle', () => {
    expect(decider({ logoUrl: 'https://cdn.exemple.fr/l.png', logos: [ANCIEN, 'https://cdn.exemple.fr/l.png'], jeton: null })).toEqual({ ok: true, charte: { logoUrl: 'https://cdn.exemple.fr/l.png', logos: [ANCIEN, 'https://cdn.exemple.fr/l.png'] }, deposes: [], aRetirer: [] });
    expect(decider({ logoUrl: 'https://127.0.0.1/l.png', logos: [], jeton: null })).toEqual({ ok: false, erreur: MESSAGES_REFUS_LOGO.hote, aRetirer: [] });
  });

  it('sans stockage configuré · un jeton ne prouve rien, rien à retirer', () => {
    expect(decisionCharteDeposee({ charte: { logoUrl: 'https://cdn.exemple.fr/l.png', logos: [] }, dejaEnregistrees: [], bucket: null, jeton: jeton(), utilisateur: UT, maintenant: T0 })).toEqual({ ok: true, charte: { logoUrl: 'https://cdn.exemple.fr/l.png', logos: [] }, deposes: [], aRetirer: [] });
  });

  it('jeton dont la clé sort de l’espace (remontée) · ne prouve rien', () => {
    expect(decider({ logoUrl: ANCIEN, logos: [ANCIEN], jeton: jeton({ cle: `assets/${WS}/../ws-b/x.png` }) })).toEqual({ ok: true, charte: { logoUrl: ANCIEN, logos: [ANCIEN] }, deposes: [], aRetirer: [] });
  });
});

describe('resoudreJetonDepot · le jeton d’une action de la Bibliothèque, résolu en clé', () => {
  const env = (j: Partial<JetonDepot> = {}): JetonDepot => jeton({ usage: 'envoi', ...j });
  const cible = { espace: WS, utilisateur: UT, usage: 'envoi' as const, maintenant: T0 + 1000 };
  it('rend la clé, le type et la taille du dépôt attesté', () => {
    expect(resoudreJetonDepot(env(), cible)).toEqual({ ok: true, cle: CLE, type: 'image/png', taille: 12_000 });
  });
  it('refuse chaque écart avec la phrase du fichier (jamais celle du logo)', () => {
    const CAS: Array<[JetonDepot | null | 'illisible', RefusJetonDepot]> = [
      [null, 'absent'], ['illisible', 'illisible'], [env({ espace: 'ws-b' }), 'autre_espace'], [env({ cle: 'assets/ws-b/1-ab-x.png' }), 'autre_espace'],
      [env({ utilisateur: 'u-b' }), 'autre_utilisateur'], [env({ usage: 'logo' }), 'autre_usage'], [env({ usage: 'remplacement' }), 'autre_usage'], [env({ expireLe: T0 }), 'expire'],
    ];
    for (const [j, refus] of CAS) expect(resoudreJetonDepot(j, cible), refus).toEqual({ ok: false, refus, erreur: TEXTES_REFUS_JETON_FICHIER[refus] });
  });
  it('chaque phrase est distincte, en français, sans tiret cadratin', () => {
    for (const textes of [TEXTES_REFUS_JETON_FICHIER, TEXTES_REFUS_JETON_DEPOT]) {
      const v = Object.values(textes);
      expect(new Set(v).size).toBe(v.length);
      for (const t of v) expect(t).not.toMatch(/—/);
    }
    expect(texteRefusJetonDepot('expire', 'logo')).toBe(TEXTES_REFUS_JETON_DEPOT.expire);
    expect(texteRefusJetonDepot('expire', 'remplacement')).toBe(TEXTES_REFUS_JETON_FICHIER.expire);
  });
  it('lireUsageDepot · seuls les trois usages', () => {
    expect(USAGES_DEPOT.map(lireUsageDepot)).toEqual(['envoi', 'remplacement', 'logo']);
    for (const x of [undefined, null, '', 'ENVOI', 'autre', 3, {}]) expect(lireUsageDepot(x), String(x)).toBeNull();
  });
});

describe('decisionCharteDeposee · LOGO_DEPOSE, utilisateur, usage, réutilisation', () => {
  it('LOGO_DEPOSE est remplacée par l’adresse que le jeton résout, et attestée', () => {
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [ANCIEN, LOGO_DEPOSE] })).toEqual({ ok: true, charte: { logoUrl: NEUF, logos: [ANCIEN, NEUF] }, deposes: [NEUF], aRetirer: [] });
  });
  it('réimport · LOGO_DEPOSE en variante, le défaut reste', () => {
    expect(decider({ logoUrl: ANCIEN, logos: [ANCIEN, LOGO_DEPOSE] })).toEqual({ ok: true, charte: { logoUrl: ANCIEN, logos: [ANCIEN, NEUF] }, deposes: [NEUF], aRetirer: [] });
  });
  it('LOGO_DEPOSE sans jeton valide · refusée, jamais écrite', () => {
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE], jeton: null })).toEqual({ ok: false, erreur: REFUS_LOGO_NON_ATTESTE, aRetirer: [] });
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE], jeton: 'illisible' })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.illisible, aRetirer: [] });
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE], jeton: jeton({ espace: 'ws-b' }) })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.autre_espace, aRetirer: [] });
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE], maintenant: jeton().expireLe + 1 })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.expire, aRetirer: [NEUF] });
  });
  it('sans stockage · LOGO_DEPOSE refusée avec la raison du stockage', () => {
    expect(decisionCharteDeposee({ charte: { logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE] }, dejaEnregistrees: [], bucket: null, jeton: jeton(), utilisateur: UT, maintenant: T0 })).toEqual({ ok: false, erreur: RAISON_LOGO_SANS_STOCKAGE, aRetirer: [] });
  });
  it('jeton d’un autre utilisateur, ou d’un autre usage · refusé (par la référence comme par l’adresse)', () => {
    for (const logoUrl of [LOGO_DEPOSE, NEUF]) {
      expect(decider({ logoUrl, logos: [logoUrl], utilisateur: 'u-b' })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.autre_utilisateur, aRetirer: [NEUF] });
      expect(decider({ logoUrl, logos: [logoUrl], jeton: jeton({ usage: 'envoi' }) })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.autre_usage, aRetirer: [NEUF] });
    }
  });
  it('un jeton déjà employé (objet cité ailleurs) · refusé, rien à retirer', () => {
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE], dejaCite: true })).toEqual({ ok: false, erreur: TEXTES_REFUS_JETON_DEPOT.deja_employe, aRetirer: [] });
    // Renvoi d'une charte qui contient DÉJÀ ce logo · rien n'entre, admis.
    expect(decider({ logoUrl: LOGO_DEPOSE, logos: [LOGO_DEPOSE], deja: [NEUF], dejaCite: true })).toEqual({ ok: true, charte: { logoUrl: NEUF, logos: [NEUF] }, deposes: [], aRetirer: [] });
  });
});

