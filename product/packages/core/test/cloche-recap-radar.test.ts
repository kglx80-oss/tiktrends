import { describe, it, expect } from 'vitest';
import {
  TEXTES_CLOCHE_PORTEE, TYPES_NOTIF_ESPACE, TYPES_NOTIF_RECENSES, besoinsEspaces, destinataireRecap, estNotifEspace, estNotifTicket, notifBornee,
  notifEspaceRelue, notifRelueDansPortee, notifsDansPortee, pageRadarOuverte, sansTiretCadratin, texteNotifCloche,
  type AccesEspaceCloche, type NotifCloche, type PorteeEspaces,
} from '../src';

/**
 * La cloche relit le récap hebdomadaire (`digest`) et le compte rendu du radar
 * (`radar`) contre le droit ACTUEL dans l'espace DE la notification · les
 * RÈGLES, en pur.
 *  · le récap · `destinataireRecap` · la règle des destinataires du cron
 *    (propriétaire, administrateur), une seule ;
 *  · le radar · `pageRadarOuverte` · la page Radar de veille (Résultats
 *    ouverts ET administratrice) ;
 *  · un espace absent (retirée, introuvable, lecture en échec) · rien n'est
 *    lu sur parole ;
 *  · pas bornée à l'espace courant · l'espace de la notification décide ;
 *  · ce qui se voit · tel quel quand c'est lisible, sinon le libellé neutre,
 *    la raison, sans lien.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WS = u(100); const AUTRE_WS = u(200);
const T0 = Date.UTC(2026, 10, 1, 9, 0);
const notif = (o: Partial<NotifCloche> = {}): NotifCloche => ({
  type: 'digest', workspaceId: WS, titre: '2 gagnantes chez SECRET_MARQUE', corps: 'SECRET_RECAP', href: '/adsmap/lots', creeLe: T0, ...o,
});
const espaces = (m: Record<string, AccesEspaceCloche>): PorteeEspaces => ({ espaces: new Map(Object.entries(m)) });
const tout: AccesEspaceCloche = { recap: true, radar: true };
const rien: AccesEspaceCloche = { recap: false, radar: false };

describe('les types · le récap et le radar sont FERMÉS, recensés comme tels', () => {
  it('deux types, rien d’autre · relus, bornés, sans être des tickets', () => {
    expect([...TYPES_NOTIF_ESPACE].sort()).toEqual(['digest', 'radar']);
    for (const t of TYPES_NOTIF_ESPACE) {
      expect(estNotifEspace(t), t).toBe(true);
      expect(notifBornee(t), t).toBe(true);
      expect(estNotifTicket(t), t).toBe(false);
      expect(TYPES_NOTIF_RECENSES[t]?.bornee, `${t} · le recensement dit encore « reste »`).toBe(true);
    }
    for (const t of ['tracker', 'ticket_new', 'studio_comment', 'Digest', 'system']) expect(estNotifEspace(t), t).toBe(false);
  });

  it('plus aucun type « reste » · seul le suivi des concurrents est laissé tel quel, parce qu’il ne peut pas fuir', () => {
    const restes = Object.entries(TYPES_NOTIF_RECENSES).filter(([, v]) => !v.bornee);
    expect(restes.map(([t]) => t)).toEqual(['tracker']);
    expect(restes[0]![1].raison).toMatch(/ne peut pas fuir/);
    for (const [t, v] of Object.entries(TYPES_NOTIF_RECENSES)) expect(v.raison, t).not.toMatch(/· reste\.$/);
  });

  it('les libellés et les raisons · en français, sans tiret cadratin, chacun le sien', () => {
    expect(TEXTES_CLOCHE_PORTEE.recap).toBe('Récap · réservé aux administrateurs de l’espace');
    expect(TEXTES_CLOCHE_PORTEE.radar).toBe('Radar de veille · plus accessible avec tes droits actuels');
    const textes = [TEXTES_CLOCHE_PORTEE.recap, TEXTES_CLOCHE_PORTEE.raisonRecap, TEXTES_CLOCHE_PORTEE.radar, TEXTES_CLOCHE_PORTEE.raisonRadar];
    for (const t of textes) expect(sansTiretCadratin(t)).toBe(t);
    expect(new Set([...textes, TEXTES_CLOCHE_PORTEE.raison, TEXTES_CLOCHE_PORTEE.raisonTicket]).size).toBe(6);
  });
});

describe('les règles des sources · réutilisées, ni élargies ni restreintes', () => {
  it('le récap · propriétaire et administrateur, jamais un membre, un lecteur client ou une personne retirée', () => {
    expect(destinataireRecap('owner')).toBe(true);
    expect(destinataireRecap('admin')).toBe(true);
    for (const r of ['member', 'client_viewer', '', null, undefined, 'Admin', 'adminplus']) expect(destinataireRecap(r as string), String(r)).toBe(false);
  });

  it('la page Radar de veille · Résultats ouverts ET administratrice · ni l’un ni l’autre seul', () => {
    expect(pageRadarOuverte({ resultats: true, admin: true })).toBe(true);
    expect(pageRadarOuverte({ resultats: true, admin: false })).toBe(false);
    expect(pageRadarOuverte({ resultats: false, admin: true })).toBe(false);
    expect(pageRadarOuverte({ resultats: false, admin: false })).toBe(false);
  });
});

describe('ce qu’il faut relire · les espaces, une fois chacun, de TOUS les espaces', () => {
  it('seulement depuis un récap ou un radar · en minuscules, sans doublon', () => {
    const b = besoinsEspaces([
      notif(), notif({ type: 'radar' }), notif({ type: 'radar', workspaceId: AUTRE_WS.toUpperCase() }),
      notif({ type: 'tracker', workspaceId: u(300) }), notif({ type: 'ticket_new', workspaceId: u(301) }), notif({ workspaceId: '' }),
    ]);
    expect(b.sort()).toEqual([WS, AUTRE_WS].sort());
    expect(besoinsEspaces([notif({ type: 'tracker' }), notif({ type: 'studio_comment' })])).toEqual([]);
  });
});

describe('lisible · l’espace de la notification relu, la règle de sa source', () => {
  it('chaque type lit SON droit · un récap sans le radar, un radar sans le récap', () => {
    const e = espaces({ [WS]: { recap: true, radar: false } });
    expect(notifEspaceRelue(notif(), e)).toBe(true);
    expect(notifEspaceRelue(notif({ type: 'radar' }), e)).toBe(false);
    const r = espaces({ [WS]: { recap: false, radar: true } });
    expect(notifEspaceRelue(notif(), r)).toBe(false);
    expect(notifEspaceRelue(notif({ type: 'radar' }), r)).toBe(true);
  });

  it('rien n’est lu sur parole · espace absent (retirée), lecture en échec, autre espace que celui relu', () => {
    expect(notifEspaceRelue(notif(), null)).toBe(false);
    expect(notifEspaceRelue(notif(), espaces({}))).toBe(false);
    expect(notifEspaceRelue(notif({ workspaceId: AUTRE_WS }), espaces({ [WS]: tout }))).toBe(false);
    expect(notifEspaceRelue(notif(), espaces({ [WS]: rien }))).toBe(false);
    expect(notifEspaceRelue(notif({ type: 'tracker' }), espaces({ [WS]: tout })), 'un type qui n’est ni récap ni radar n’est pas lu par cette règle').toBe(false);
  });

  it('pas bornée à l’espace courant · c’est l’espace DE la notification qui décide (majuscules comprises)', () => {
    const e = espaces({ [AUTRE_WS]: tout, [WS]: rien });
    expect(notifEspaceRelue(notif({ workspaceId: AUTRE_WS }), e)).toBe(true);
    expect(notifEspaceRelue(notif({ workspaceId: AUTRE_WS.toUpperCase() }), e)).toBe(true);
    expect(notifEspaceRelue(notif(), e)).toBe(false);
  });

  it('dans la relecture de la cloche · le récap et le radar passent par CETTE règle, jamais par la portée Studios ni par les tickets', () => {
    expect(notifRelueDansPortee(notif(), null, null, espaces({ [WS]: tout }))).toBe(true);
    expect(notifRelueDansPortee(notif(), null, null, null)).toBe(false);
    expect(notifRelueDansPortee(notif({ type: 'radar' }), null, null, espaces({ [WS]: { recap: true, radar: false } }))).toBe(false);
    expect(notifRelueDansPortee(notif({ type: 'tracker' }), null, null, null), 'un type laissé tel quel reste montré').toBe(true);
  });
});

describe('ce que la cloche montre', () => {
  it('lisible · titre, texte, lien inchangés', () => {
    for (const n of [notif(), notif({ type: 'radar', titre: 'Radar de veille', corps: 'SECRET_TROUVAILLE', href: '/adsmap/radar' })]) {
      expect(texteNotifCloche(n, true)).toEqual({ titre: n.titre, corps: n.corps, href: n.href });
    }
  });

  it('droit perdu · le libellé neutre de SON type, sa raison, AUCUN lien · rien du titre ni du texte d’origine', () => {
    const r = texteNotifCloche(notif(), false);
    expect(r).toEqual({ titre: TEXTES_CLOCHE_PORTEE.recap, corps: TEXTES_CLOCHE_PORTEE.raisonRecap, href: null });
    const d = texteNotifCloche(notif({ type: 'radar', corps: 'SECRET_TROUVAILLE' }), false);
    expect(d).toEqual({ titre: TEXTES_CLOCHE_PORTEE.radar, corps: TEXTES_CLOCHE_PORTEE.raisonRadar, href: null });
    expect(JSON.stringify([r, d])).not.toMatch(/SECRET/);
  });

  it('la liste · dans l’ordre, chacune relue par sa règle', () => {
    const e = espaces({ [WS]: { recap: true, radar: false }, [AUTRE_WS]: tout });
    const l = notifsDansPortee([
      notif(), notif({ type: 'radar', titre: 'Radar de veille' }), notif({ type: 'radar', titre: 'Radar B', workspaceId: AUTRE_WS }),
      notif({ type: 'tracker', titre: '3 pubs', corps: null, href: '/saved' }),
    ], null, null, e);
    expect(l.map((x) => x.titre)).toEqual(['2 gagnantes chez SECRET_MARQUE', TEXTES_CLOCHE_PORTEE.radar, 'Radar B', '3 pubs']);
  });
});
