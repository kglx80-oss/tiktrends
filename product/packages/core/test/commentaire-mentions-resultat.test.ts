import { describe, it, expect } from 'vitest';
import {
  LIBELLE_ANCIEN_MEMBRE, LIBELLE_MEMBRE_MASQUE, MENTIONS_MAX_COMMENTAIRE, NOM_MAX_MENTION, PHRASE_ITERATION_EN_TEST, RAISON_LOT_AUTRE_MARQUE,
  aPrevenirMentions, analyserMentions, conclusionLot, departEditionCommentaire, etatLotSpatial, filtrerMentionnables, historiqueApresModification,
  historiqueAvecMentions, insererMention, iterationsDuCommentaire, lireDemandeMentions, lireHistoriqueCommentaire, lireMentions, membreVoitProjet, membresMentionnables,
  nomAffichageMention, nomMention, optionMentionSuivante, prevenusApres, proprietairePrevenuSansMention, referenceConclusion, requeteMention, resultatsCommentaire,
  segmentsCommentaire, texteAffiche,
  type FaitsAdSpatial, type FaitsLotSpatial, type IterationDuCommentaire, type MembreBrut,
} from '../src';

/**
 * Fermer la boucle du commentaire, et les mentions · les RÈGLES, en pur.
 *  · le résultat d'une itération née d'un commentaire est CALCULÉ depuis la
 *    conclusion de son lot · « en test » avant · confirmée, infirmée, sans
 *    conclusion, chiffre et lien · rien si Résultats est fermé ;
 *  · qui peut être mentionné (voit le projet · rôle, Studios, marque), jamais
 *    l'auteur ni un membre masqué ;
 *  · la saisie (requête, liste, insertion, flèches) ;
 *  · l'analyse au serveur (identifiants demandés ET mentionnables ET présents
 *    dans le texte, bornes de mot, chevauchements) · le stockage dans
 *    `history` (relu défensivement, anciens textes intacts) · qui prévenir
 *    (une fois, jamais l'auteur) · l'affichage (nom courant, ancien membre,
 *    texte jamais HTML).
 */

const u = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const WS = u(900); const A1 = u(901); const A2 = u(902);
const PROJET = { workspaceId: WS, brandId: A1 };
const MARQUES = [A1, A2];
const membre = (n: number, o: Partial<MembreBrut> = {}): MembreBrut => ({ id: u(n), nom: `Membre ${n}`, email: `m${n}@x.test`, masque: false, roleEspace: 'member', studioOuvert: true, restrictionsMarque: [], ...o });

describe('qui peut être mentionné · un membre qui VOIT le projet, jamais l’auteur ni un membre masqué', () => {
  const membres: MembreBrut[] = [
    membre(1, { nom: 'Zoé Martin' }),
    membre(2, { nom: 'Ali Ben', restrictionsMarque: [A1] }),
    membre(3, { nom: 'Hors marque', restrictionsMarque: [A2] }),
    // Un lecteur client n'a pas la fonction Studios (rôle minimal « member » · `canAccess`, lu par le serveur).
    membre(4, { nom: 'Lecteur client', roleEspace: 'client_viewer', studioOuvert: false }),
    membre(5, { nom: 'Formule fermée', studioOuvert: false }),
    membre(6, { nom: 'Masquée', masque: true }),
    membre(7, { nom: 'Auteur' }),
    membre(8, { nom: null, email: 'sans.nom@x.test' }),
    membre(9, { roleEspace: 'pirate' }),
    { ...membre(10), id: 'pas-un-uuid' },
    membre(1, { nom: 'Zoé en double' }),
  ];
  it('la liste · voit le projet, trié par nom, sans l’auteur, le masqué, ni rôle forgé', () => {
    const l = membresMentionnables(membres, { projet: PROJET, marquesDuWorkspace: MARQUES, auteurId: u(7) });
    expect(l).toEqual([{ id: u(2), nom: 'Ali Ben' }, { id: u(8), nom: 'sans.nom@x.test' }, { id: u(1), nom: 'Zoé Martin' }]);
  });
  it('voit le projet · rôle avec `studio.read` ET marque du projet dans sa portée', () => {
    expect(membreVoitProjet(membre(1), PROJET, MARQUES)).toBe(true);
    expect(membreVoitProjet(membre(3, { restrictionsMarque: [A2] }), PROJET, MARQUES), 'restreint à une autre marque').toBe(false);
    expect(membreVoitProjet(membre(4, { roleEspace: 'client_viewer', studioOuvert: false }), PROJET, MARQUES), 'lecteur client').toBe(false);
    expect(membreVoitProjet(membre(5, { studioOuvert: false }), PROJET, MARQUES), 'Studios fermé').toBe(false);
    expect(membreVoitProjet(membre(1), { workspaceId: WS, brandId: u(999) }, MARQUES), 'marque hors de l’espace').toBe(false);
  });
  it('le nom · espaces resserrés, contrôles et « @ » de tête retirés, adresse à défaut, borné', () => {
    expect(nomMention('  @@Zoé \n  Martin\u0007 ')).toBe('Zoé Martin');
    expect(nomMention('   ', 'a@b.c')).toBe('a@b.c');
    expect(nomMention(null, null)).toBeNull();
    expect([...nomMention('x'.repeat(200))!].length).toBe(NOM_MAX_MENTION);
  });
  it('le nom affiché · courant s’il voit le projet, masqué dit « Un membre de l’espace », sinon rien (ancien membre)', () => {
    expect(nomAffichageMention(membre(1, { nom: 'Zoé Martin' }), PROJET, MARQUES)).toBe('Zoé Martin');
    expect(nomAffichageMention(membre(6, { masque: true }), PROJET, MARQUES)).toBe(LIBELLE_MEMBRE_MASQUE);
    expect(nomAffichageMention(membre(3, { restrictionsMarque: [A2] }), PROJET, MARQUES)).toBeNull();
    expect(nomAffichageMention(undefined, PROJET, MARQUES), 'plus membre de l’espace').toBeNull();
  });
});

describe('la saisie · « @ » ouvre la liste, filtre sans casse ni accents, insère « @Nom »', () => {
  it('la requête · après un début ou un séparateur, sur la ligne, jamais dans une adresse', () => {
    expect(requeteMention('Salut @zo', 9)).toEqual({ debut: 6, requete: 'zo' });
    expect(requeteMention('@', 1)).toEqual({ debut: 0, requete: '' });
    expect(requeteMention('(@Ali', 5)).toEqual({ debut: 1, requete: 'Ali' });
    expect(requeteMention('ecris a@b.fr', 12), 'une adresse').toBeNull();
    expect(requeteMention('@zo\nla suite', 11), 'une autre ligne').toBeNull();
    expect(requeteMention('@ zo', 4), 'une espace après « @ »').toBeNull();
    expect(requeteMention(`@${'a'.repeat(41)}`, 42), 'trop long').toBeNull();
    expect(requeteMention('@Zoé Ma', 7), 'un nom en deux mots').toEqual({ debut: 0, requete: 'Zoé Ma' });
    expect(requeteMention('abc', 0)).toBeNull();
  });
  it('le filtre · début du nom ou d’un de ses mots, sans casse ni accents, borné', () => {
    const l = [{ id: u(1), nom: 'Zoé Martin' }, { id: u(2), nom: 'Ali Ben' }, { id: u(3), nom: 'Émile Zola' }];
    expect(filtrerMentionnables(l, 'zoe').map((m) => m.id)).toEqual([u(1)]);
    expect(filtrerMentionnables(l, 'mar').map((m) => m.id)).toEqual([u(1)]);
    expect(filtrerMentionnables(l, 'emi').map((m) => m.id)).toEqual([u(3)]);
    expect(filtrerMentionnables(l, 'z').map((m) => m.id)).toEqual([u(1), u(3)]);
    expect(filtrerMentionnables(l, '').length).toBe(3);
    expect(filtrerMentionnables(l, '', 2).length).toBe(2);
    expect(filtrerMentionnables(l, 'xyz')).toEqual([]);
  });
  it('insérer · « @requête » devient « @Nom » suivi d’une espace, le curseur après', () => {
    expect(insererMention('Vu par @zo merci', 7, 10, 'Zoé Martin')).toEqual({ texte: 'Vu par @Zoé Martin merci', curseur: 19 });
    expect(insererMention('@a', 0, 2, 'Ali Ben')).toEqual({ texte: '@Ali Ben ', curseur: 9 });
  });
  it('les flèches · en boucle, rien sans proposition', () => {
    expect([optionMentionSuivante(0, 1, 3), optionMentionSuivante(2, 1, 3), optionMentionSuivante(0, -1, 3), optionMentionSuivante(-1, -1, 3), optionMentionSuivante(0, 1, 0)]).toEqual([1, 0, 2, 2, -1]);
  });
});

describe('l’analyse au serveur · identifiants demandés, mentionnables ET écrits dans le texte', () => {
  const M = [{ id: u(1), nom: 'Zoé' }, { id: u(2), nom: 'Jean' }, { id: u(3), nom: 'Jean Dupont' }];
  it('un identifiant forgé (hors liste), absent du texte ou mal formé · ignoré · la mention garde l’identifiant et sa place', () => {
    const t = 'Merci @Zoé et @Jean, voir @Inconnu';
    expect(analyserMentions(t, [u(1), u(2), u(99), 'Zoé', 42], M)).toEqual([{ id: u(1), debut: 6, longueur: 4 }, { id: u(2), debut: 14, longueur: 5 }]);
    expect(analyserMentions('Merci Zoé', [u(1)], M), 'sans « @ »').toEqual([]);
    expect(analyserMentions(t, 'pas une liste', M)).toEqual([]);
    expect(lireDemandeMentions([u(1), u(1).toUpperCase(), ' x '])).toEqual([u(1)]);
  });
  it('bornes de mot · « @Zoéline » n’est pas « @Zoé », une adresse non plus · le nom le plus long gagne le passage', () => {
    expect(analyserMentions('@Zoéline et a@Zoé', [u(1)], M)).toEqual([]);
    expect(analyserMentions('@Jean Dupont et @Jean.', [u(2), u(3)], M)).toEqual([{ id: u(3), debut: 0, longueur: 12 }, { id: u(2), debut: 16, longueur: 5 }]);
    expect(analyserMentions('@Zoé @Zoé', [u(1)], M).map((m) => m.debut), 'chaque occurrence').toEqual([0, 5]);
  });
  it(`au plus ${MENTIONS_MAX_COMMENTAIRE} mentions retenues`, () => {
    expect(analyserMentions(Array(30).fill('@Zoé').join(' '), [u(1)], M)).toHaveLength(MENTIONS_MAX_COMMENTAIRE);
  });
  it('prévenir · une fois par personne, jamais l’auteur, jamais qui l’a déjà été · cumul des prévenus', () => {
    const m = [{ id: u(1), debut: 0, longueur: 4 }, { id: u(1), debut: 5, longueur: 4 }, { id: u(2), debut: 10, longueur: 5 }, { id: u(7), debut: 20, longueur: 3 }];
    expect(aPrevenirMentions(m, [], u(7))).toEqual([u(1), u(2)]);
    expect(aPrevenirMentions(m, [u(1)], u(7))).toEqual([u(2)]);
    expect(prevenusApres([u(1)], [u(2), u(1)])).toEqual([u(1), u(2)]);
  });
  it('le propriétaire · « Nouveau commentaire » sauf s’il l’écrit ou y est mentionné (une notification, pas deux)', () => {
    expect(proprietairePrevenuSansMention(u(5), u(7), [])).toBe(true);
    expect(proprietairePrevenuSansMention(u(5), u(5), [])).toBe(false);
    expect(proprietairePrevenuSansMention(u(5), u(7), [u(5)])).toBe(false);
    expect(proprietairePrevenuSansMention(null, u(7), [])).toBe(false);
  });
});

describe('le stockage · dans `history`, à part des anciens textes · relu défensivement', () => {
  const body = 'Merci @Zoé pour ça';
  it('sans mention ni prévenu · `history` reste tel quel (`[]`) · avec · une entrée à la fin, les anciens textes intacts', () => {
    expect(historiqueAvecMentions([], { mentions: [], prevenus: [] })).toEqual([]);
    const h0 = historiqueApresModification([], 'ancien', '2026-11-10T10:00:00.000Z');
    const h = historiqueAvecMentions(h0, { mentions: [{ id: u(1), debut: 6, longueur: 4 }], prevenus: [u(1)] });
    expect(h).toEqual([{ texte: 'ancien', remplaceLe: '2026-11-10T10:00:00.000Z' }, { mentions: [{ id: u(1), debut: 6, longueur: 4 }], prevenus: [u(1)] }]);
    expect(lireHistoriqueCommentaire(h), 'l’entrée des mentions n’est pas une modification').toHaveLength(1);
    // Remplacée, jamais doublée.
    expect(historiqueAvecMentions(h, { mentions: [], prevenus: [u(1)] })).toEqual([{ texte: 'ancien', remplaceLe: '2026-11-10T10:00:00.000Z' }, { mentions: [], prevenus: [u(1)] }]);
  });
  it('relu · hors du texte, sans « @ », chevauchant, identifiant illisible · ignoré, jamais inventé', () => {
    const h = [{ texte: 'x', remplaceLe: 'y' }, { mentions: [
      { id: u(1), debut: 6, longueur: 4 }, { id: u(2), debut: 7, longueur: 3 }, { id: u(3), debut: 0, longueur: 5 },
      { id: 'pirate', debut: 6, longueur: 4 }, { id: u(4), debut: 15, longueur: 9 }, { id: u(5), debut: 1.5, longueur: 2 },
    ], prevenus: [u(1), 'x'] }];
    expect(lireMentions(h, body)).toEqual({ mentions: [{ id: u(1), debut: 6, longueur: 4 }], prevenus: [u(1)] });
    expect(lireMentions('abîmé', body)).toEqual({ mentions: [], prevenus: [] });
    expect(lireMentions([{ texte: 'x', remplaceLe: 'y', mentions: [{ id: u(1), debut: 6, longueur: 4 }] }], body), 'une entrée d’ancien texte n’est pas une entrée de mentions').toEqual({ mentions: [], prevenus: [] });
  });
});

describe('l’affichage · le nom courant, « un ancien membre » sinon · du texte, jamais du HTML', () => {
  const body = 'Merci @Zoé et @Ali <b>!</b>';
  const mentions = [{ id: u(1), debut: 6, longueur: 4 }, { id: u(2), debut: 14, longueur: 4 }];
  it('les segments · le nom COURANT remplace le nom écrit · un ancien membre est dit', () => {
    const s = segmentsCommentaire(body, mentions, (id) => (id === u(1) ? 'Zoé Martin <script>' : null));
    expect(s).toEqual([
      { type: 'texte', texte: 'Merci ' }, { type: 'mention', id: u(1), nom: '@Zoé Martin <script>', ancien: false },
      { type: 'texte', texte: ' et ' }, { type: 'mention', id: u(2), nom: `@${LIBELLE_ANCIEN_MEMBRE}`, ancien: true }, { type: 'texte', texte: ' <b>!</b>' },
    ]);
    expect(texteAffiche(s)).toBe('Merci @Zoé Martin <script> et @un ancien membre <b>!</b>');
    expect(segmentsCommentaire('', [], () => null)).toEqual([{ type: 'texte', texte: '' }]);
    expect(texteAffiche(segmentsCommentaire(body, [], () => null)), 'sans mention · le texte tel quel').toBe(body);
  });
  it('modifier · le texte affiché, et les mentions des membres qui voient encore le projet seulement', () => {
    const s = segmentsCommentaire(body, mentions, (id) => (id === u(1) ? 'Zoé Martin' : null));
    expect(departEditionCommentaire(s)).toEqual({ texte: 'Merci @Zoé Martin et @un ancien membre <b>!</b>', mentions: [u(1)] });
  });
});

/* ───────────────────────── le résultat sur le commentaire ───────────────────────── */

const ad = (id: string, v: 'winner' | 'loser' | null, o: Partial<FaitsAdSpatial> = {}): FaitsAdSpatial => ({
  id, variante: id, statut: 'done', hypothese: 'Si on teste, alors ça baisse, parce que.', variable: 'hook', plateforme: 'meta', texte: null, image: null, manques: [],
  verdict: v ? { calcule: v, retenu: v, statut: 'validated', comparable: true, raison: null, depense: 1, impressions: 1, achats: 1, cpa: 1 } : null, ...o,
});
const lot = (id: string, numero: number, ads: FaitsAdSpatial[]): FaitsLotSpatial => ({ id, numero, but: null, statut: 'testing', lanceLe: '2026-09-01T00:00:00Z', ads, protocole: null });
const CTX = { maintenant: new Date('2026-11-09T00:00:00Z'), fenetreJours: 14 };
const REF = lot('r', 1, Array.from({ length: 8 }, (_, i) => ad(`r${i}`, i === 0 ? 'winner' : 'loser')));
const REF_HAUTE = lot('r', 1, Array.from({ length: 8 }, (_, i) => ad(`r${i}`, i === 0 ? 'loser' : 'winner')));
function iteration(l: FaitsLotSpatial, autres: FaitsLotSpatial[], adId: string): IterationDuCommentaire {
  const etat = etatLotSpatial(l, CTX);
  return { adId, variante: adId, lot: { id: l.id, numero: l.numero, etat }, conclusion: conclusionLot(l, etat, referenceConclusion([l, ...autres], l.id)) };
}
const OUVERT = { resultats: true, marqueActive: true };

describe('le résultat sur le commentaire d’origine · CALCULÉ depuis la conclusion du lot de l’itération', () => {
  it('avant la conclusion (verdict manquant, hors lot) · « en test », aucun chiffre ni statut', () => {
    const l = lot('c', 3, [ad('V7', null), ad('a2', 'winner'), ad('a3', 'winner'), ad('a4', 'winner')]);
    const r = resultatsCommentaire([iteration(l, [REF], 'V7'), { adId: 'V8', variante: 'V8', lot: null, conclusion: null }], OUVERT);
    expect(r).toEqual([
      { etat: 'en_test', adId: 'V7', variante: 'V7', libelle: 'Itération en test', phrase: PHRASE_ITERATION_EN_TEST },
      { etat: 'en_test', adId: 'V8', variante: 'V8', libelle: 'Itération en test', phrase: PHRASE_ITERATION_EN_TEST },
    ]);
  });
  it('conclu · confirmée (4 sur 4 contre 1 sur 8), le chiffre clé et le lien vers le lot', () => {
    const l = lot('c', 3, ['V7', 'a2', 'a3', 'a4'].map((x) => ad(x, 'winner')));
    const [r] = resultatsCommentaire([iteration(l, [REF], 'V7')], OUVERT);
    expect(r).toMatchObject({ etat: 'conclue', statut: 'confirmee', libelle: 'Itération confirmée', classe: 'g', icone: 'check', lot: { numero: 3, href: '/adsmap/lots/c', raison: null } });
    expect(r!.etat === 'conclue' && r!.chiffre).toMatch(/^4 gagnantes sur 4 variantes tranchées \(\d+ % à 100 %\) · la marque, 1 sur 8 dans ses autres lots/);
  });
  it('conclu · infirmée (0 sur 4 contre 7 sur 8)', () => {
    const l = lot('i', 4, ['V9', 'b2', 'b3', 'b4'].map((x) => ad(x, 'loser')));
    expect(resultatsCommentaire([iteration(l, [REF_HAUTE], 'V9')], OUVERT)[0]).toMatchObject({ statut: 'infirmee', libelle: 'Itération infirmée', classe: 'r', icone: 'x' });
  });
  it('conclu dans le bruit ou sous l’effectif · « sans conclusion », la raison en chiffre', () => {
    const bruit = lot('s', 5, [ad('V5', 'winner'), ad('c2', 'loser'), ad('c3', 'loser'), ad('c4', 'loser')]);
    expect(resultatsCommentaire([iteration(bruit, [REF], 'V5')], OUVERT)[0]).toMatchObject({ statut: 'sans_conclusion', libelle: 'Itération sans conclusion', classe: '', icone: 'q' });
    const petit = lot('p', 6, [ad('V6', 'winner')]);
    const [r] = resultatsCommentaire([iteration(petit, [REF], 'V6')], OUVERT);
    expect(r!.etat === 'conclue' && r!.chiffre).toBe('1 variante tranchée au protocole · il en faut 4 pour qu’un lot ait le droit de conclure');
  });
  it('Résultats fermé · rien · autre marque active · le résultat, le lien vers le lot fermé avec sa raison', () => {
    const l = lot('c', 3, ['V7', 'a2', 'a3', 'a4'].map((x) => ad(x, 'winner')));
    expect(resultatsCommentaire([iteration(l, [REF], 'V7')], { resultats: false, marqueActive: true })).toEqual([]);
    expect(resultatsCommentaire([iteration(l, [REF], 'V7')], { resultats: true, marqueActive: false })[0]).toMatchObject({ statut: 'confirmee', lot: { numero: 3, href: null, raison: RAISON_LOT_AUTRE_MARQUE } });
  });
  it('les itérations du commentaire · sa provenance seulement (même commentaire ET même projet) · ordre des variantes', () => {
    const k = u(50); const p = u(60);
    const ads = [
      { id: 'a', commentaire: { commentaireId: k, projetId: p } }, { id: 'b', commentaire: { commentaireId: k, projetId: u(61) } },
      { id: 'c', commentaire: { commentaireId: u(51), projetId: p } }, { id: 'd', commentaire: null }, { id: 'e', commentaire: { commentaireId: k.toUpperCase(), projetId: p } },
    ];
    expect(iterationsDuCommentaire(ads, { commentaireId: k, projetId: p }).map((x) => x.id)).toEqual(['a', 'e']);
    const r = resultatsCommentaire([{ adId: '2', variante: 'V10', lot: null, conclusion: null }, { adId: '1', variante: 'V9', lot: null, conclusion: null }], OUVERT);
    expect(r.map((x) => x.variante)).toEqual(['V9', 'V10']);
  });
});
