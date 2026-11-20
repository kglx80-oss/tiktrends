import { describe, it, expect } from 'vitest';
import {
  semaineIso, cleVerrouRecap, MOTIF_RECAP_HEBDO, FUSEAU_RECAP_HEBDO,
  SEUIL_ABANDON_RECAP_MS, DELAI_DECLENCHEUR_RECAP_MS, TENTATIVES_RECAP, ATTENTE_RECAP_MS,
  etatInitialRecap, lireEtatRecap, decisionVerrouRecap, repriseRecap, avecMarquesRecap,
  avecNotificationRecap, avecCourrielRecap, dejaNotifieRecap, dejaEcritRecap, finRecap,
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
