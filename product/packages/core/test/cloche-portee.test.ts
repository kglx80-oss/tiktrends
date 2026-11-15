import { describe, it, expect } from 'vitest';
import {
  TEXTES_CLOCHE_PORTEE, TEXTES_MES_MENTIONS, TYPES_NOTIF_BORNES, TYPES_NOTIF_MENTION, TYPES_NOTIF_RECENSES,
  besoinsCloche, bornageDeNotif, extraitCommentaire, lienLigneeProjet, notifBornee, notifRelueDansPortee, notifsDansPortee, sansTiretCadratin, texteNotifCloche,
  type FilMentionnant, type GenreMention, type NotifCloche, type PorteeCloche,
} from '../src';

/**
 * La cloche relit dans la portée ce qu'elle montre · les RÈGLES, en pur.
 *  · les types bornés · les deux mentions et le nouveau commentaire du
 *    propriétaire · tout autre type est montré tel quel, sans lecture ;
 *  · relue · espace courant, genre lisible, projet relu, et pour une mention
 *    un fil relu qui REDONNE l'extrait · sinon rien ;
 *  · ce qui se voit · tel quel quand c'est relu, sinon le libellé neutre, la
 *    raison, sans lien · jamais le titre ni le texte d'origine.
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WS = u(100); const AUTRE_WS = u(200);
const P1 = u(1); const P2 = u(2);
const T0 = Date.UTC(2026, 10, 1, 9, 0);
const TOUS = new Set<GenreMention>(['commentaire', 'note']);
const fil = (o: Partial<FilMentionnant> & Pick<FilMentionnant, 'id'>): FilMentionnant => ({ genre: 'commentaire', projetId: P1, textes: ['@Zoé le visuel est flou'], instants: [T0], ...o });
const notif = (o: Partial<NotifCloche> = {}): NotifCloche => ({
  type: TYPES_NOTIF_MENTION.commentaire, workspaceId: WS, titre: 'On te mentionne dans un commentaire · Sérum', corps: '@Zoé le visuel est flou',
  href: `/studio/projets/${P1}#activite`, creeLe: T0, ...o,
});
const portee = (o: Partial<PorteeCloche> = {}): PorteeCloche => ({ workspaceId: WS, genres: TOUS, projets: new Set([P1]), fils: [fil({ id: u(10) })], ...o });

describe('les types bornés · et le recensement de tous les types écrits', () => {
  it('les deux mentions et le nouveau commentaire du propriétaire · rien d’autre', () => {
    expect(Object.keys(TYPES_NOTIF_BORNES).sort()).toEqual(['studio_comment', 'studio_comment_mention', 'studio_note_mention']);
    expect(bornageDeNotif('studio_comment_mention')).toMatchObject({ genre: 'commentaire', relecture: 'fil', neutre: 'Mention · fil hors de ta portée' });
    expect(bornageDeNotif('studio_note_mention')).toMatchObject({ genre: 'note', relecture: 'fil', neutre: 'Mention · fil hors de ta portée' });
    expect(bornageDeNotif('studio_comment')).toMatchObject({ genre: 'commentaire', relecture: 'projet', neutre: 'Commentaire · fil hors de ta portée' });
    for (const t of ['ticket_reply', 'digest', 'radar', 'tracker', 'nimporte']) expect(bornageDeNotif(t), t).toBeNull();
  });

  it('chaque type recensé dit s’il est borné, et pourquoi · le bornage suit le recensement', () => {
    for (const [t, r] of Object.entries(TYPES_NOTIF_RECENSES)) {
      expect(r.bornee, `${t} · recensé ${r.bornee ? 'borné' : 'non borné'} mais classé autrement`).toBe(notifBornee(t));
      expect(r.raison.length, `${t} sans raison`).toBeGreaterThan(20);
    }
    for (const t of Object.keys(TYPES_NOTIF_BORNES)) expect(TYPES_NOTIF_RECENSES[t]?.bornee, `${t} borné mais absent du recensement`).toBe(true);
  });

  it('les phrases · en français, sans tiret cadratin · la raison n’est pas celle de « Mes mentions » (le titre dit déjà « hors de ta portée »)', () => {
    for (const t of Object.values(TEXTES_CLOCHE_PORTEE)) expect(sansTiretCadratin(t)).toBe(t);
    expect(TEXTES_CLOCHE_PORTEE.raison).not.toBe(TEXTES_MES_MENTIONS.raisonHorsPortee);
    expect(TEXTES_CLOCHE_PORTEE.raison).not.toMatch(/hors de ta portée/);
  });
});

describe('relue · espace courant, genre lisible, projet relu, fil qui redonne l’extrait', () => {
  it('une mention relue · le fil de son projet la redonne (texte courant)', () => {
    expect(notifRelueDansPortee(notif(), portee())).toBe(true);
  });

  it('ou un ANCIEN texte du fil (la mention posée avant une modification)', () => {
    expect(notifRelueDansPortee(notif({ corps: '@Zoé premier jet' }), portee({ fils: [fil({ id: u(10), textes: ['Texte repris', '@Zoé premier jet'] })] }))).toBe(true);
  });

  it('l’extrait borné de la notification · comparé à l’extrait du texte, pas au texte entier', () => {
    const long = `@Zoé ${'mot '.repeat(60)}fin`;
    expect(notifRelueDansPortee(notif({ corps: extraitCommentaire(long) }), portee({ fils: [fil({ id: u(10), textes: [long] })] }))).toBe(true);
  });

  it('aucune portée relue (pas de droits Studios, lecture en échec) · rien n’est relu', () => {
    expect(notifRelueDansPortee(notif(), null)).toBe(false);
  });

  it('un AUTRE espace · jamais, même si un fil du même projet la redonnerait', () => {
    expect(notifRelueDansPortee(notif({ workspaceId: AUTRE_WS }), portee())).toBe(false);
  });

  it('un genre que la session ne lit pas (« canvas » coupé) · la note n’est pas relue, le commentaire si', () => {
    const p = portee({ genres: new Set<GenreMention>(['commentaire']), fils: [fil({ id: u(10) }), fil({ id: u(11), genre: 'note' })] });
    expect(notifRelueDansPortee(notif({ type: TYPES_NOTIF_MENTION.note, href: lienLigneeProjet(P1) }), p)).toBe(false);
    expect(notifRelueDansPortee(notif(), p)).toBe(true);
  });

  it('le projet hors de la portée (marque retirée) · rien, même si un fil était passé', () => {
    expect(notifRelueDansPortee(notif(), portee({ projets: new Set([P2]) }))).toBe(false);
  });

  it('un lien qui ne désigne pas de projet · rien', () => {
    expect(notifRelueDansPortee(notif({ href: '/dashboard' }), portee())).toBe(false);
    expect(notifRelueDansPortee(notif({ href: null }), portee())).toBe(false);
  });

  it('aucun fil relu ne redonne l’extrait (notification forgée, historique perdu) · rien · jamais lue sur parole', () => {
    expect(notifRelueDansPortee(notif({ corps: 'SECRET un texte qu’aucun fil ne porte' }), portee())).toBe(false);
    expect(notifRelueDansPortee(notif({ corps: null }), portee())).toBe(false);
    expect(notifRelueDansPortee(notif({ corps: '   ' }), portee())).toBe(false);
  });

  it('un fil d’un autre genre ou d’un autre projet ne la redonne pas', () => {
    expect(notifRelueDansPortee(notif(), portee({ fils: [fil({ id: u(10), genre: 'note' })] }))).toBe(false);
    expect(notifRelueDansPortee(notif(), portee({ projets: new Set([P1, P2]), fils: [fil({ id: u(10), projetId: P2 })] }))).toBe(false);
  });

  it('le nouveau commentaire du propriétaire · relu par son PROJET (aucun « prévenus » à lire)', () => {
    const n = notif({ type: 'studio_comment', titre: 'Nouveau commentaire · Sérum', corps: 'Un avis' });
    expect(notifRelueDansPortee(n, portee({ fils: [] }))).toBe(true);
    expect(notifRelueDansPortee(n, portee({ projets: new Set() }))).toBe(false);
    expect(notifRelueDansPortee(n, portee({ genres: new Set<GenreMention>(['note']) }))).toBe(false);
  });

  it('un type non borné · toujours montré, sans portée (le récap et le radar sont relus contre leur source · `cloche-recap-radar.test.ts`)', () => {
    expect(notifRelueDansPortee(notif({ type: 'tracker', href: '/saved', workspaceId: AUTRE_WS }), null)).toBe(true);
    expect(notifRelueDansPortee(notif({ type: 'system', href: '/dashboard' }), null)).toBe(true);
  });
});

describe('ce que la cloche montre', () => {
  it('relue · titre, texte, lien inchangés', () => {
    const n = notif();
    expect(texteNotifCloche(n, true)).toEqual({ titre: n.titre, corps: n.corps, href: n.href });
  });

  it('hors portée · le libellé neutre, la raison, AUCUN lien · rien du titre ni du texte d’origine', () => {
    const n = notif({ titre: 'On te mentionne · SECRET_PROJET', corps: 'SECRET_TEXTE' });
    const v = texteNotifCloche(n, false);
    expect(v).toEqual({ titre: TEXTES_CLOCHE_PORTEE.mention, corps: TEXTES_CLOCHE_PORTEE.raison, href: null });
    expect(JSON.stringify(v)).not.toMatch(/SECRET/);
    expect(texteNotifCloche(notif({ type: 'studio_comment' }), false).titre).toBe(TEXTES_CLOCHE_PORTEE.commentaire);
  });

  it('un type non borné · tel quel, même « non relu »', () => {
    const n = notif({ type: 'tracker', titre: '3 pubs', corps: 'Texte', href: '/saved' });
    expect(texteNotifCloche(n, false)).toEqual({ titre: '3 pubs', corps: 'Texte', href: '/saved' });
  });

  it('la liste · dans l’ordre, chacune relue', () => {
    const l = notifsDansPortee([notif(), notif({ workspaceId: AUTRE_WS }), notif({ type: 'tracker', titre: '3 pubs', corps: null, href: '/saved' })], portee());
    expect(l.map((x) => x.titre)).toEqual(['On te mentionne dans un commentaire · Sérum', TEXTES_CLOCHE_PORTEE.mention, '3 pubs']);
  });
});

describe('ce qu’il faut relire · borné, d’un coup', () => {
  it('les projets de l’espace courant, d’un genre lisible, désignés par une notification bornée · les fils seulement pour les mentions', () => {
    const b = besoinsCloche([
      notif(), notif({ creeLe: T0 + 1 }),
      notif({ type: TYPES_NOTIF_MENTION.note, href: lienLigneeProjet(P2) }),
      notif({ type: 'studio_comment', href: `/studio/projets/${u(3)}#activite` }),
      notif({ workspaceId: AUTRE_WS, href: `/studio/projets/${u(4)}` }),
      notif({ type: 'ticket_reply', href: `/studio/projets/${u(5)}` }),
      notif({ href: '/dashboard' }),
    ], WS, TOUS);
    expect(b.projets.sort()).toEqual([P1, P2, u(3)].sort());
    expect(b.fils).toEqual({ commentaire: [P1], note: [P2] });
  });

  it('un genre non lisible · ses projets ne sont pas lus', () => {
    const b = besoinsCloche([notif({ type: TYPES_NOTIF_MENTION.note, href: lienLigneeProjet(P2) })], WS, new Set<GenreMention>(['commentaire']));
    expect(b).toEqual({ projets: [], fils: { commentaire: [], note: [] } });
  });
});
