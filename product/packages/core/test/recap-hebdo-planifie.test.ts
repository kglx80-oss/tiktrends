import { describe, it, expect } from 'vitest';
import {
  semaineIso, cleVerrouRecap, MOTIF_RECAP_HEBDO, FUSEAU_RECAP_HEBDO,
  SEUIL_ABANDON_RECAP_MS, DELAI_DECLENCHEUR_RECAP_MS, TENTATIVES_RECAP, ATTENTE_RECAP_MS,
  etatInitialRecap, lireEtatRecap, decisionVerrouRecap, repriseRecap, avecMarquesRecap,
  avecNotificationRecap, avecCourrielRecap, dejaNotifieRecap, dejaEcritRecap, finRecap,
  avecAbandonRecap, refusDefinitifSmtp, suiteRecap, REPORT_EN_COURS_MS, REPORTS_EN_COURS_MAX, DELAI_SMTP_MS,
  disjoncteurAbandons, courrielsNotesRecap, abandonsNotesRecap, DUREE_PASSAGE_MAX_MS, EFFECTIF_DISJONCTEUR,
  type SuiteRecap,
} from '../src/adsmap/recap-hebdo-planifie';

/**
 * Le récap hebdomadaire · une semaine ISO, un verrou, un passage. Les semaines
 * de référence sont celles du calendrier ISO 8601 (années à 53 semaines,
 * semaine 1 qui commence en décembre), lues à Paris.
 */

describe('la semaine ISO, lue à Paris', () => {
  const CAS: Array<[string, string, string]> = [
    ['2026-11-20T12:00:00Z', '2026-W47', 'un vendredi ordinaire'],
    ['2026-11-16T06:47:00Z', '2026-W47', 'le lundi du passage'],
    ['2026-11-22T22:30:00Z', '2026-W47', 'dimanche 23:30 à Paris · encore la même semaine'],
    ['2026-11-22T23:30:00Z', '2026-W48', 'dimanche 23:30 UTC · déjà lundi 00:30 à Paris'],
    ['2021-01-01T12:00:00Z', '2020-W53', 'un 1er janvier dans la 53e semaine de l’année d’avant'],
    ['2024-12-30T12:00:00Z', '2025-W01', 'un 30 décembre dans la semaine 1 de l’année d’après'],
    ['2026-01-01T12:00:00Z', '2026-W01', 'un jeudi 1er janvier · semaine 1'],
    ['2026-12-31T12:00:00Z', '2026-W53', 'fin 2026 · année à 53 semaines'],
    ['2026-03-29T00:30:00Z', '2026-W13', 'nuit du passage à l’heure d’été'],
  ];
  for (const [instant, attendu, pourquoi] of CAS) {
    it(`${instant} → ${attendu} · ${pourquoi}`, () => {
      expect(semaineIso(new Date(instant))).toBe(attendu);
    });
  }

  it('la clé de verrou porte la semaine · deux instants de la même semaine, une seule clé', () => {
    expect(cleVerrouRecap(new Date('2026-11-16T06:47:00Z'))).toBe('digest:2026-W47');
    expect(cleVerrouRecap(new Date('2026-11-16T06:47:00Z'))).toBe(cleVerrouRecap(new Date('2026-11-21T18:00:00Z')));
    expect(cleVerrouRecap(new Date('2026-11-23T06:47:00Z'))).toBe('digest:2026-W48');
  });

  it('toutes les dates de 2020 à 2030 · semaines contiguës, 52 ou 53 par an, lundi = changement de semaine', () => {
    let precedente = semaineIso(new Date('2020-01-01T11:00:00Z'));
    const parAn = new Map<number, number>();
    for (let t = Date.parse('2020-01-02T11:00:00Z'); t < Date.parse('2031-01-01T00:00:00Z'); t += 86_400_000) {
      const d = new Date(t);
      const s = semaineIso(d);
      const lundi = d.getUTCDay() === 1;
      expect(s !== precedente, `${d.toISOString()} · changement de semaine hors lundi`).toBe(lundi);
      if (lundi) parAn.set(Number(s.slice(0, 4)), Number(s.slice(6)));
      precedente = s;
    }
    for (const [an, n] of parAn) if (an >= 2020 && an <= 2030) expect([52, 53], `${an} · ${n} semaines`).toContain(n);
  });
});

describe('le moment du passage', () => {
  it('le lundi, le matin, heure de Paris, hors de l’heure pile', () => {
    const [minute, heure, jourMois, mois, jourSemaine] = MOTIF_RECAP_HEBDO.split(' ');
    expect(FUSEAU_RECAP_HEBDO).toBe('Europe/Paris');
    expect(jourSemaine, 'le récap part le lundi').toBe('1');
    expect([jourMois, mois]).toEqual(['*', '*']);
    expect(Number(heure), 'le matin').toBeGreaterThanOrEqual(6);
    expect(Number(heure), 'avant la journée').toBeLessThan(9);
    expect(['0', '30'], 'hors de l’heure pile').not.toContain(minute);
  });

  it('après le radar (05:00 UTC, 10 min au plus), été comme hiver', () => {
    const [minute = NaN, heure = NaN] = MOTIF_RECAP_HEBDO.split(' ').map(Number);
    // Paris = UTC+2 l'été, UTC+1 l'hiver · le passage en UTC.
    for (const decalage of [2, 1]) {
      const utc = (heure - decalage) * 60 + minute;
      expect(utc, `UTC+${decalage} · le récap passerait avant la fin du radar`).toBeGreaterThan(5 * 60 + 10);
    }
  });
});

describe('le verrou de la semaine · reprendre ce qui manque, ne jamais doubler', () => {
  const T0 = new Date('2026-11-16T06:47:00Z');
  const apres = (ms: number) => new Date(T0.getTime() + ms);
  const enCours = () => etatInitialRecap('j1', T0);

  it('semaine faite · déjà passé', () => {
    expect(decisionVerrouRecap(finRecap(enCours(), 0, T0), apres(60_000))).toEqual({ action: 'deja_passe' });
  });

  it('un passage qui bat encore · en cours, on ne le double pas', () => {
    expect(decisionVerrouRecap(enCours(), apres(SEUIL_ABANDON_RECAP_MS))).toEqual({ action: 'en_cours' });
  });

  it('un passage muet au-delà du seuil (tué par un redéploiement) · repris, pas « déjà passé »', () => {
    const d = decisionVerrouRecap(enCours(), apres(SEUIL_ABANDON_RECAP_MS + 1));
    expect(d.action).toBe('reprendre');
  });

  it('le seuil se compte depuis le dernier BATTEMENT, pas depuis le début', () => {
    const vivant = avecNotificationRecap(enCours(), 'm1', 'u1', apres(SEUIL_ABANDON_RECAP_MS));
    expect(decisionVerrouRecap(vivant, apres(SEUIL_ABANDON_RECAP_MS + 60_000)).action).toBe('en_cours');
  });

  it('un passage interrompu (erreur) · repris tout de suite', () => {
    expect(decisionVerrouRecap(finRecap(enCours(), 1, T0), apres(1_000)).action).toBe('reprendre');
  });

  it('une valeur illisible · reprise sans progression, sauf si elle dit « fait »', () => {
    expect(decisionVerrouRecap({ etat: 'en_cours', debut: 'x' }, T0)).toEqual({ action: 'reprendre', precedent: null });
    expect(decisionVerrouRecap({ etat: 'fait' }, T0)).toEqual({ action: 'deja_passe' });
    expect(decisionVerrouRecap(null, T0)).toEqual({ action: 'reprendre', precedent: null });
  });

  it('la reprise garde la progression et la fenêtre, change de jeton', () => {
    let e = avecMarquesRecap(enCours(), ['m1', 'm2'], T0);
    e = avecNotificationRecap(e, 'm1', 'u1', T0);
    e = avecCourrielRecap(e, 'm1', 'u1', T0);
    const r = repriseRecap(lireEtatRecap(JSON.parse(JSON.stringify(e))), 'j2', apres(SEUIL_ABANDON_RECAP_MS + 1));
    expect(r).toMatchObject({ etat: 'en_cours', jeton: 'j2', debut: T0.toISOString(), reprises: 1, marques: ['m1', 'm2'] });
    expect(dejaNotifieRecap(r, 'm1', 'u1')).toBe(true);
    expect(dejaEcritRecap(r, 'm1', 'u1')).toBe(true);
    expect(dejaNotifieRecap(r, 'm2', 'u1'), 'la marque 2 n’était pas servie').toBe(false);
    expect(dejaEcritRecap(r, 'm1', 'u2')).toBe(false);
  });

  it('noter deux fois le même destinataire ne change rien', () => {
    const e = avecNotificationRecap(enCours(), 'm1', 'u1', T0);
    expect(avecNotificationRecap(e, 'm1', 'u1', apres(1))).toBe(e);
  });

  it('la fin · « fait » seulement sans échec', () => {
    expect(finRecap(enCours(), 0, T0).etat).toBe('fait');
    expect(finRecap(enCours(), 2, T0).etat).toBe('interrompu');
  });

  it('le seuil d’abandon dépasse le délai du déclencheur · un passage vivant n’est pas repris', () => {
    expect(SEUIL_ABANDON_RECAP_MS).toBeGreaterThan(DELAI_DECLENCHEUR_RECAP_MS);
  });

  it('les tentatives BullMQ couvrent le seuil d’abandon · un passage tué est repris le même lundi', () => {
    // BullMQ · attente exponentielle `delay × 2^(n-1)` avant la n-ième relance.
    let cumul = 0;
    for (let n = 1; n < TENTATIVES_RECAP; n++) cumul += ATTENTE_RECAP_MS * 2 ** (n - 1);
    expect(cumul, 'les relances s’arrêtent avant que le verrou d’un passage tué devienne reprenable').toBeGreaterThan(SEUIL_ABANDON_RECAP_MS + DELAI_DECLENCHEUR_RECAP_MS);
    expect(cumul, 'les relances débordent sur la journée').toBeLessThan(2 * 3_600_000);
  });
});

describe('un courriel refusé définitivement · noté abandonné, plus retenté', () => {
  it('définitif · SEULEMENT un 5xx au RCPT avec un code étendu 5.1.x (l’adresse elle-même)', () => {
    expect(refusDefinitifSmtp({ responseCode: 550, command: 'RCPT TO', response: '550 5.1.1 <x@y>: Recipient address rejected: User unknown' })).toBe(true);
    expect(refusDefinitifSmtp({ responseCode: 550, command: 'RCPT TO', response: '550-5.1.1 The email account that you tried to reach does not exist.' })).toBe(true);
    expect(refusDefinitifSmtp({ responseCode: 556, command: 'RCPT TO', response: '556 5.1.10 Recipient address has null MX' })).toBe(true);
    expect(refusDefinitifSmtp({ responseCode: 550, command: 'RCPT TO', response: '550 5.1.2 Host unknown' })).toBe(true);
    expect(refusDefinitifSmtp({ responseCode: 553, command: 'RCPT TO', response: '553 5.1.3 Bad destination mailbox address syntax' })).toBe(true);
    expect(refusDefinitifSmtp({ responseCode: 551, command: 'RCPT TO', response: '551 5.1.6 User has moved' })).toBe(true);
  });
  it('passager · tout 5xx qui ne parle pas de l’adresse (il frappe en général tout le monde)', () => {
    const CAS: Array<[unknown, string]> = [
      [{ responseCode: 554, command: 'RCPT TO', response: '554 5.7.1 <x@y>: Relay access denied' }, 'relais non authentifié'],
      [{ responseCode: 550, command: 'RCPT TO', response: '550 5.2.2 Mailbox full / quota exceeded' }, 'quota'],
      [{ responseCode: 550, command: 'RCPT TO', response: '550 Requested action not taken' }, 'sans code étendu'],
      [{ responseCode: 554, command: 'DATA', response: '554 Message rejected: Email address is not verified.' }, 'relais après DATA (SES)'],
      [{ responseCode: 552, command: 'DATA', response: '552 5.3.4 Message size exceeds fixed limit' }, 'contenu refusé'],
      [{ responseCode: 550, command: 'DATA', response: '550 5.1.1 User unknown' }, 'même un 5.1.1 hors RCPT'],
      [{ responseCode: 550, command: 'RCPT TO', response: '550 5.1.0 <s@x>: Sender address rejected: User unknown in local recipient table' }, 'Postfix · l’expéditeur refusé au RCPT (5.1.0)'],
      [{ responseCode: 553, command: 'RCPT TO', response: '553 5.1.7 The sender address is invalid' }, 'expéditeur mal formé (5.1.7)'],
      [{ responseCode: 553, command: 'RCPT TO', response: '553 5.1.8 <s@x>: Sender address rejected: Domain not found' }, 'domaine de l’expéditeur introuvable (5.1.8)'],
      [{ responseCode: 550, command: 'RCPT TO', response: '550 5.1.12 Unknown status' }, 'un 5.1.x hors liste'],
      [{ responseCode: 535, command: 'AUTH PLAIN', response: '535 5.7.8 Authentication failed' }, 'authentification'],
      [{ responseCode: 451, command: 'RCPT TO', response: '451 4.1.1 Try again later' }, '4xx'],
      [{}, 'vide'], [null, 'nul'],
    ];
    for (const [e, pourquoi] of CAS) expect(refusDefinitifSmtp(e as never), pourquoi).toBe(false);
  });
  it('le disjoncteur · au moins EFFECTIF_DISJONCTEUR refus, et aucun envoi ou plus de refus que d’envois ⇒ personne n’est abandonné', () => {
    const N = EFFECTIF_DISJONCTEUR;
    expect(N, 'un effectif minimum').toBeGreaterThanOrEqual(2);
    expect(disjoncteurAbandons({ envoyes: 0, abandons: 1 }), 'une seule adresse fausse, rien d’autre · elle ne fait pas parler le groupe').toBe(false);
    expect(disjoncteurAbandons({ envoyes: 0, abandons: N - 1 }), 'sous l’effectif minimum').toBe(false);
    expect(disjoncteurAbandons({ envoyes: 0, abandons: N }), 'l’effectif atteint, aucun envoi').toBe(true);
    expect(disjoncteurAbandons({ envoyes: N, abandons: N + 1 }), 'la majorité des décisions').toBe(true);
    expect(disjoncteurAbandons({ envoyes: N, abandons: N }), 'à égalité').toBe(false);
    expect(disjoncteurAbandons({ envoyes: 1, abandons: 1 }), 'un espace de deux personnes, une boîte morte').toBe(false);
    expect(disjoncteurAbandons({ envoyes: 2, abandons: 5 }), 'tout le monde ou presque').toBe(true);
    expect(disjoncteurAbandons({ envoyes: 10, abandons: N }), 'quelques boîtes mortes parmi des envois qui passent').toBe(false);
    expect(disjoncteurAbandons({ envoyes: 0, abandons: 0 })).toBe(false);
  });
  it('les comptes notés se cumulent sur toutes les marques', () => {
    let e = etatInitialRecap('j', new Date(0));
    e = avecCourrielRecap(avecCourrielRecap(e, 'm1', 'u1', new Date(0)), 'm2', 'u2', new Date(0));
    e = avecAbandonRecap(e, 'm2', 'u3', new Date(0));
    expect(courrielsNotesRecap(e)).toBe(2);
    expect(abandonsNotesRecap(e)).toBe(1);
  });
  it('un abandon compte comme écrit · la reprise ne le renvoie pas', () => {
    const e = avecAbandonRecap(etatInitialRecap('j', new Date(0)), 'm', 'u', new Date(0));
    expect(dejaEcritRecap(e, 'm', 'u')).toBe(true);
    expect(lireEtatRecap(JSON.parse(JSON.stringify(e)))?.servis.m?.abandons).toEqual(['u']);
  });
});

describe('le délai SMTP · un passage vivant ne passe jamais pour mort', () => {
  it('un serveur muet coupe l’envoi (connexion + accueil + un silence) très en deçà du seuil d’abandon', () => {
    expect(3 * DELAI_SMTP_MS * 5, 'une attente muette, avec un facteur 5, dépasse le seuil d’abandon').toBeLessThan(SEUIL_ABANDON_RECAP_MS);
  });
});

/**
 * Le CALENDRIER d'un lundi · on simule le worker (réponse de la route,
 * `suiteRecap`, attente BullMQ) et le verrou (`decisionVerrouRecap`) minute
 * par minute, pour un passage long qui finit, qui meurt, ou qui finit
 * interrompu. La semaine doit finir `fait` · jamais perdue en silence.
 */
type Fin = { type: 'fait' | 'interrompu' | 'mort'; a: number; duree?: number }; // minutes après T0
/** `fait` · servie ; `alerte` · abandonnée en le criant ; `silence` · perdue sans un mot (interdit). */
function calendrier(fin: Fin, suite: typeof suiteRecap = suiteRecap): 'fait' | 'alerte' | 'silence' {
  const MIN = 60_000;
  const T0 = Date.parse('2026-11-16T06:47:00Z');
  const fetchMs = DELAI_DECLENCHEUR_RECAP_MS;
  // Une reprise RELIT toutes les marques · elle dure la lecture du premier passage (sa durée totale, au pire).
  const REPRISE_MS = (fin.duree ?? fin.a) * MIN;
  // Passes successives · la première a la fin donnée, les reprises finissent « fait ».
  let passe = { debut: 0, fin: fin.a * MIN, type: fin.type as Fin['type'] };
  let verrou = false;
  const etatA = (t: number) => {
    if (!verrou) return null;
    const e = etatInitialRecap('p', new Date(T0 + passe.debut));
    if (t < passe.fin) return { ...e, battement: new Date(T0 + t).toISOString() };
    if (passe.type === 'mort') return { ...e, battement: new Date(T0 + passe.fin).toISOString() };
    return finRecap(e, passe.type === 'interrompu' ? 1 : 0, new Date(T0 + passe.fin));
  };
  let t = 0; let tentative = 1; let reports = 0;
  for (let garde = 0; garde < 100; garde++) {
    let issue: { ok: boolean; status?: number; detail?: string };
    let te: number;
    const valeur = etatA(t);
    const decision = valeur ? decisionVerrouRecap(valeur, new Date(T0 + t)) : { action: 'prendre' as const };
    if (decision.action === 'deja_passe') { issue = { ok: true }; te = t; }
    else if (decision.action === 'en_cours') { issue = { ok: false, status: 409, detail: 'en_cours' }; te = t; }
    else {
      if (decision.action !== 'prendre') passe = { debut: t, fin: t + REPRISE_MS, type: 'fait' };
      verrou = true;
      const finPasse = passe.fin;
      if (finPasse - t <= fetchMs) {
        te = finPasse;
        issue = passe.type === 'fait' ? { ok: true } : passe.type === 'interrompu' ? { ok: false, status: 500, detail: 'digest_incomplet' } : { ok: false, detail: 'socket hang up' };
      } else { te = t + fetchMs; issue = { ok: false, detail: 'The operation was aborted due to timeout' }; }
    }
    const s: SuiteRecap = suite(issue, { reports, tentative, tentativesMax: TENTATIVES_RECAP });
    if (s.action === 'fini') return etatA(te)?.etat === 'fait' ? 'fait' : 'silence';
    if (s.action === 'abandon') return 'alerte';
    if (s.action === 'reporter') { reports = s.reports; t = te + s.delaiMs; }
    else { t = te + ATTENTE_RECAP_MS * 2 ** (tentative - 1); tentative++; }
  }
  return 'silence';
}

describe('le calendrier d’un passage long · la semaine finit servie', () => {
  it('un 409 « en cours » ne consomme pas de tentative · il reporte au-delà du seuil d’abandon', () => {
    expect(suiteRecap({ ok: false, status: 409, detail: 'en_cours' }, { reports: 0, tentative: 6, tentativesMax: 6 })).toEqual({ action: 'reporter', delaiMs: REPORT_EN_COURS_MS, reports: 1 });
    expect(REPORT_EN_COURS_MS).toBeGreaterThan(SEUIL_ABANDON_RECAP_MS);
    expect(suiteRecap({ ok: false, status: 409, detail: 'en_cours' }, { reports: REPORTS_EN_COURS_MAX, tentative: 1, tentativesMax: 6 }).action).toBe('abandon');
    expect(suiteRecap({ ok: false, status: 500 }, { reports: 0, tentative: 6, tentativesMax: 6 }).action).toBe('abandon');
    expect(suiteRecap({ ok: false, status: 500 }, { reports: 0, tentative: 5, tentativesMax: 6 }).action).toBe('retenter');
  });

  it('SMTP absent · ni retente ni abandon crié · une configuration, pas une panne', () => {
    expect(suiteRecap({ ok: false, status: 503, detail: 'smtp_absent' }, { reports: 0, tentative: 1, tentativesMax: 6 })).toEqual({ action: 'sans_smtp' });
    expect(suiteRecap({ ok: false, status: 503, detail: 'cron_disabled' }, { reports: 0, tentative: 1, tentativesMax: 6 }).action, 'un autre 503 se retente').toBe('retenter');
  });

  it('disjoncteur déclenché · abandon IMMÉDIAT, raison précise (pas « non servi »)', () => {
    const s = suiteRecap({ ok: false, status: 500, detail: 'digest_incomplet', corps: { disjoncteur: true, refused: 4, sent: 0 } }, { reports: 0, tentative: 1, tentativesMax: 6 });
    expect(s).toMatchObject({ action: 'abandon', disjoncteur: true });
    expect(s.action === 'abandon' && s.raison).toMatch(/disjoncteur des courriels · 4 refus/);
  });

  const MAX = DUREE_PASSAGE_MAX_MS / 60_000;
  const DUREES = [3, 10, 17, 30, 50, MAX];
  for (const L of DUREES) {
    it(`passage de ${L} min (reprise aussi longue) · fini, interrompu, ou mort à n’importe quelle minute · la semaine finit « fait »`, () => {
      expect(calendrier({ type: 'fait', a: L }), `fini à ${L} min`).toBe('fait');
      expect(calendrier({ type: 'interrompu', a: L }), `interrompu à ${L} min`).toBe('fait');
      for (let d = 1; d <= L; d++) expect(calendrier({ type: 'mort', a: d, duree: L }), `passage de ${L} min mort à ${d} min (reprise de ${L} min) · semaine non servie`).toBe('fait');
    });
  }

  it('au-delà de la durée servie · jamais de silence · la semaine est servie ou le worker ALERTE', () => {
    for (const L of [90, 120, 240]) {
      for (const f of [{ type: 'fait' as const, a: L }, { type: 'interrompu' as const, a: L }, { type: 'mort' as const, a: L - 1, duree: L }]) {
        expect(calendrier(f), `${f.type} à ${f.a} min · semaine perdue sans alerte`).not.toBe('silence');
      }
    }
    expect(calendrier({ type: 'mort', a: 239, duree: 240 }), 'témoin · un passage de 4 h dépasse la patience et alerte').toBe('alerte');
  });

  it('témoin · si un 409 consommait une tentative (ancien comportement), un passage long perdait la semaine', () => {
    const ancien: typeof suiteRecap = (issue, c) => (issue.ok ? { action: 'fini' } : c.tentative < c.tentativesMax ? { action: 'retenter' } : { action: 'abandon', raison: 'x' });
    const perdues = DUREES.flatMap((L) => [calendrier({ type: 'interrompu', a: L }, ancien), calendrier({ type: 'mort', a: L, duree: L }, ancien)]).filter((x) => x !== 'fait');
    expect(perdues.length, 'la simulation ne voit pas le défaut qu’elle prétend garder').toBeGreaterThan(0);
  });

  it('les reports sont dérivés du pire calendrier servi', () => {
    expect(REPORTS_EN_COURS_MAX * REPORT_EN_COURS_MS).toBeGreaterThanOrEqual(2 * DUREE_PASSAGE_MAX_MS + SEUIL_ABANDON_RECAP_MS + REPORT_EN_COURS_MS);
  });
});
