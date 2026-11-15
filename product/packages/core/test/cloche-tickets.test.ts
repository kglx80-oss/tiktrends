import { describe, it, expect } from 'vitest';
import {
  TEXTES_CLOCHE_PORTEE, TYPES_NOTIF_RECENSES, TYPES_NOTIF_TICKET, besoinsTickets, estNotifTicket, notifBornee, notifRelueDansPortee,
  notifsDansPortee, peutLireTicket, sansTiretCadratin, texteNotifCloche, ticketDuLien, ticketRelu,
  type AccesTicketCloche, type NotifCloche, type PorteeCloche, type PorteeTickets,
} from '../src';

/**
 * La cloche relit chaque notification de support contre l'accès au ticket ·
 * les RÈGLES, en pur.
 *  · les types · `ticket_new`, `ticket_reply`, `ticket_status` · fermés (relus) ;
 *  · lisible · le ticket relu, de l'espace de la notification, et la règle de
 *    la page du ticket (`peutLireTicket`) sous le rôle ACTUEL dans l'espace DU
 *    ticket · l'auteur toujours ;
 *  · pas bornée à l'espace courant · un ticket d'un autre espace où la personne
 *    administre encore reste lisible ;
 *  · ce qui se voit · tel quel quand c'est lisible, sinon « Ticket · plus
 *    accessible avec ton rôle actuel », la raison, sans lien.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WS = u(100); const AUTRE_WS = u(200);
const MOI = u(1); const ZOE = u(2);
const TK = u(10); const TK_MIEN = u(11); const TK_B = u(12);
const T0 = Date.UTC(2026, 10, 1, 9, 0);
const notif = (o: Partial<NotifCloche> = {}): NotifCloche => ({
  type: 'ticket_new', workspaceId: WS, titre: 'Nouveau bug : SECRET_TITRE', corps: 'De Zoé', href: `/support/${TK}`, creeLe: T0, ...o,
});
const acces = (o: Partial<AccesTicketCloche> = {}): AccesTicketCloche => ({ workspaceId: WS, auteurId: ZOE, admin: true, ...o });
const tickets = (m: Record<string, AccesTicketCloche>, utilisateurId = MOI): PorteeTickets => ({ utilisateurId, tickets: new Map(Object.entries(m)) });
const STUDIOS: PorteeCloche = { workspaceId: WS, genres: new Set(['commentaire', 'note']), projets: new Set(), fils: [] };

describe('les types du support · fermés, recensés comme tels', () => {
  it('les trois types du support, rien d’autre', () => {
    expect([...TYPES_NOTIF_TICKET].sort()).toEqual(['ticket_new', 'ticket_reply', 'ticket_status']);
    for (const t of TYPES_NOTIF_TICKET) {
      expect(estNotifTicket(t), t).toBe(true);
      expect(notifBornee(t), t).toBe(true);
      expect(TYPES_NOTIF_RECENSES[t]?.bornee, `${t} · le recensement dit encore « reste »`).toBe(true);
    }
    for (const t of ['digest', 'radar', 'tracker', 'studio_comment', 'ticket', 'system']) expect(estNotifTicket(t), t).toBe(false);
  });

  it('le libellé et la raison · en français, sans tiret cadratin, sans « hors de ta portée » (ce n’est pas un fil des Studios)', () => {
    expect(TEXTES_CLOCHE_PORTEE.ticket).toBe('Ticket · plus accessible avec ton rôle actuel');
    for (const t of [TEXTES_CLOCHE_PORTEE.ticket, TEXTES_CLOCHE_PORTEE.raisonTicket]) expect(sansTiretCadratin(t)).toBe(t);
    expect(TEXTES_CLOCHE_PORTEE.raisonTicket).not.toBe(TEXTES_CLOCHE_PORTEE.raison);
  });
});

describe('l’adresse · le ticket désigné', () => {
  it('`/support/<id>` (l’adresse des actions du support), avec ou sans suite · en minuscules', () => {
    expect(ticketDuLien(`/support/${TK}`)).toBe(TK);
    expect(ticketDuLien(`/support/${TK.toUpperCase()}?ok=reply`)).toBe(TK);
    expect(ticketDuLien(`/support/${TK}#fil`)).toBe(TK);
  });

  it('rien d’autre · un identifiant informe, une autre page, une adresse vide', () => {
    for (const h of ['/support/1', '/support/pas-un-id', `/support/${TK}/x`, `/admin/sav/${TK}`, `https://x.test/support/${TK}`, '/support', '', null, undefined]) expect(ticketDuLien(h), String(h)).toBeNull();
  });

  it('les tickets à relire · une fois chacun, de TOUS les espaces, seulement depuis une notification de ticket', () => {
    const b = besoinsTickets([
      notif(), notif({ type: 'ticket_reply' }), notif({ type: 'ticket_status', workspaceId: AUTRE_WS, href: `/support/${TK_B}` }),
      notif({ type: 'radar', href: `/support/${u(13)}` }), notif({ href: '/support/1' }), notif({ href: null }),
    ]);
    expect(b.sort()).toEqual([TK, TK_B].sort());
  });
});

describe('lisible · le ticket relu, son espace, la règle de la page (peutLireTicket) sous le rôle actuel', () => {
  it('administratrice ACTUELLE de l’espace du ticket · lit le ticket d’une autre', () => {
    expect(ticketRelu(notif(), tickets({ [TK]: acces() }))).toBe(true);
  });

  it('repassée membre (ou retirée de l’espace · pas administratrice) · le ticket d’une autre n’est plus lisible', () => {
    expect(ticketRelu(notif(), tickets({ [TK]: acces({ admin: false }) }))).toBe(false);
    expect(ticketRelu(notif({ type: 'ticket_reply' }), tickets({ [TK]: acces({ admin: false }) }))).toBe(false);
  });

  it('l’auteur garde TOUJOURS ses tickets · même sans rôle d’administration, même retiré', () => {
    expect(ticketRelu(notif({ type: 'ticket_reply', href: `/support/${TK_MIEN}` }), tickets({ [TK_MIEN]: acces({ auteurId: MOI, admin: false }) }))).toBe(true);
    expect(ticketRelu(notif({ type: 'ticket_status', href: `/support/${TK_MIEN}` }), tickets({ [TK_MIEN]: acces({ auteurId: MOI, admin: false }) }))).toBe(true);
  });

  it('la règle est CELLE de la page du ticket · même verdict que `peutLireTicket` sur toutes les combinaisons', () => {
    for (const admin of [true, false]) for (const auteurId of [MOI, ZOE, null]) {
      expect(ticketRelu(notif(), tickets({ [TK]: acces({ admin, auteurId }) })), `admin ${admin} · auteur ${auteurId}`).toBe(peutLireTicket({ admin, auteurId, utilisateurId: MOI }));
    }
  });

  it('PAS bornée à l’espace courant · le ticket d’un autre espace où elle administre encore reste lisible', () => {
    expect(ticketRelu(notif({ workspaceId: AUTRE_WS, href: `/support/${TK_B}` }), tickets({ [TK_B]: acces({ workspaceId: AUTRE_WS }) }))).toBe(true);
  });

  it('jamais lue sur parole · ticket introuvable, ticket d’un autre espace que sa notification, auteur effacé, lecture en échec, adresse informe', () => {
    expect(ticketRelu(notif(), tickets({})), 'un ticket introuvable est lu sur parole').toBe(false);
    expect(ticketRelu(notif({ workspaceId: AUTRE_WS }), tickets({ [TK]: acces() })), 'une notification d’un autre espace que son ticket est lue sur parole').toBe(false);
    expect(ticketRelu(notif(), tickets({ [TK]: acces({ auteurId: null, admin: false }) })), 'un ticket sans auteur ouvert à un membre').toBe(false);
    expect(ticketRelu(notif(), null), 'une lecture en échec ouvre les tickets').toBe(false);
    expect(ticketRelu(notif({ href: '/support/1' }), tickets({ [TK]: acces() })), 'une adresse informe est lue sur parole').toBe(false);
  });

  it('par la même voie que les fils des Studios · `notifRelueDansPortee` relit le ticket contre `t`, la portée Studios n’y change rien', () => {
    expect(notifRelueDansPortee(notif(), STUDIOS, tickets({ [TK]: acces() }))).toBe(true);
    expect(notifRelueDansPortee(notif(), STUDIOS, tickets({ [TK]: acces({ admin: false }) }))).toBe(false);
    expect(notifRelueDansPortee(notif(), null, tickets({ [TK]: acces() })), 'sans droits Studios, le ticket reste lisible').toBe(true);
    expect(notifRelueDansPortee(notif(), STUDIOS), 'sans tickets relus · rien').toBe(false);
  });
});

describe('ce que la cloche montre', () => {
  it('lisible · titre, texte, lien inchangés', () => {
    const n = notif();
    expect(texteNotifCloche(n, true)).toEqual({ titre: n.titre, corps: n.corps, href: n.href });
  });

  it('plus accessible · le libellé, la raison, AUCUN lien · rien du titre ni du texte d’origine', () => {
    for (const type of TYPES_NOTIF_TICKET) {
      const v = texteNotifCloche(notif({ type, titre: `Réponse à : SECRET_TITRE`, corps: 'SECRET_TEXTE' }), false);
      expect(v, type).toEqual({ titre: TEXTES_CLOCHE_PORTEE.ticket, corps: TEXTES_CLOCHE_PORTEE.raisonTicket, href: null });
      expect(JSON.stringify(v)).not.toMatch(/SECRET/);
    }
  });

  it('la liste mêlée · dans l’ordre, chacune relue par sa règle · l’ordinaire intacte', () => {
    const l = notifsDansPortee([
      notif(), notif({ href: `/support/${TK_MIEN}`, type: 'ticket_reply', titre: 'Réponse à : le mien' }),
      notif({ type: 'tracker', titre: '3 pubs', corps: null, href: '/saved' }),
      notif({ workspaceId: AUTRE_WS, href: `/support/${TK_B}`, titre: 'Nouveau bug : B' }),
    ], STUDIOS, tickets({ [TK]: acces({ admin: false }), [TK_MIEN]: acces({ auteurId: MOI, admin: false }), [TK_B]: acces({ workspaceId: AUTRE_WS }) }));
    expect(l.map((x) => x.titre)).toEqual([TEXTES_CLOCHE_PORTEE.ticket, 'Réponse à : le mien', '3 pubs', 'Nouveau bug : B']);
    expect(l[0]!.href).toBeNull();
  });
});
