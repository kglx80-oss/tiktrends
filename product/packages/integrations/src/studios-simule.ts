/**
 * Studios · L3 · fournisseur et stockage SIMULÉS · RÉSERVÉS AUX TESTS.
 *
 * Ce module n'est PAS exporté par `src/index.ts` : aucun code de production ne
 * peut l'importer par le nom du paquet. Il refuse en plus de se construire :
 *
 *  · si `NODE_ENV === 'production'` ;
 *  · sans le drapeau explicite `TESTS_SEULEMENT` passé par l'appelant.
 *
 * Aucun appel réseau, aucune dépense. Les médias produits sont des PNG unis
 * portant la mention « SIMULE » dans un bloc tEXt et une clé de stockage
 * préfixée `simule/` : ils ne peuvent pas passer pour des générations réelles.
 *
 * Il sait jouer les cas de la recette COST : succès, échec certain, réponse
 * perdue après acceptation, webhooks dupliqués ou inversés (il fabrique et
 * signe les événements), stockage indisponible, résultat tardif après
 * annulation, produit faux (constat qualité), résultat illisible.
 */

import { createHmac, randomUUID } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import {
  ErreurFournisseurCertaine, ErreurFournisseurIncertaine, chaineSignee,
  type DemandeFournisseur, type FournisseurStudio, type StatutFournisseur, type StockageStudio, type EvenementFournisseur,
} from '@tiktrends/core';

export const DRAPEAU_SIMULE = 'TESTS_SEULEMENT' as const;

export class SimulationInterdite extends Error {
  constructor(motif: string) { super(`Fournisseur simulé refusé · ${motif}`); this.name = 'SimulationInterdite'; }
}

function autoriser(drapeau: unknown, env: Record<string, string | undefined>): void {
  if (env.NODE_ENV === 'production') throw new SimulationInterdite('NODE_ENV=production');
  if (drapeau !== DRAPEAU_SIMULE) throw new SimulationInterdite('drapeau de test absent');
}

/** Ce que fait la PROCHAINE soumission (puis le scénario par défaut). */
export type ScenarioSimule =
  | 'succes'
  /** Refus immédiat, rien facturé. */
  | 'echec_certain'
  /** La requête est ACCEPTÉE (et facturable) mais la réponse ne revient pas. */
  | 'reponse_perdue'
  /** Acceptée, puis échoue chez le fournisseur sans facturer. */
  | 'echec_distant'
  /** Réussit, mais le produit visible n'est pas le bon. */
  | 'produit_faux'
  /** Réussit, mais le fichier rendu n'est pas une image. */
  | 'resultat_illisible';

export interface OptionsFournisseurSimule {
  drapeau: unknown;
  env?: Record<string, string | undefined>;
  /** Le fournisseur retrouve une requête par sa clé (et déduplique sur elle). */
  rechercheParCle?: boolean;
  /** Nombre de lectures de statut « en cours » avant l'issue. */
  etapes?: number;
  /** Une annulation distante arrive-t-elle à temps ? */
  annulation?: 'sans_frais' | 'trop_tard';
  coutUsdMicros?: number;
  scenario?: ScenarioSimule;
}

interface RequeteSimulee {
  id: string;
  cle: string;
  scenario: ScenarioSimule;
  operations: string[];
  restant: number;
  annulee: 'non' | 'sans_frais' | 'trop_tard';
}

/** PNG uni 8×8 avec un bloc tEXt « SIMULE » · décodable par n'importe quel lecteur. */
export function pngSimule(couleur: [number, number, number] = [255, 92, 138]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloc = (type: string, data: Uint8Array) => {
    const t = new TextEncoder().encode(type);
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(t, 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const l = 8;
  const ihdr = new Uint8Array(13);
  new DataView(ihdr.buffer).setUint32(0, l);
  new DataView(ihdr.buffer).setUint32(4, l);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const brut = new Uint8Array(l * (1 + 3 * l));
  for (let y = 0; y < l; y++) for (let x = 0; x < l; x++) brut.set(couleur, y * (1 + 3 * l) + 1 + 3 * x);
  const texte = new TextEncoder().encode('Comment\0SIMULE · média de test, jamais réel');
  const parties = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloc('IHDR', ihdr), bloc('tEXt', texte), bloc('IDAT', new Uint8Array(deflateSync(brut))), bloc('IEND', new Uint8Array())];
  const total = new Uint8Array(parties.reduce((s, p) => s + p.length, 0));
  let i = 0;
  for (const p of parties) { total.set(p, i); i += p.length; }
  return total;
}

export class FournisseurSimule implements FournisseurStudio {
  readonly nom = 'simule';
  readonly simule = true;
  readonly rechercheParCle: boolean;
  /** Requêtes réellement créées (= ce qu'un vrai fournisseur facturerait). */
  readonly requetes = new Map<string, RequeteSimulee>();
  /** Appels à `soumettre`, y compris ceux dédupliqués par la clé. */
  appelsSoumettre = 0;
  private readonly file: ScenarioSimule[] = [];
  private readonly o: Required<Omit<OptionsFournisseurSimule, 'drapeau' | 'env'>>;

  constructor(o: OptionsFournisseurSimule) {
    autoriser(o.drapeau, o.env ?? process.env);
    this.rechercheParCle = o.rechercheParCle ?? true;
    this.o = {
      rechercheParCle: this.rechercheParCle,
      etapes: o.etapes ?? 0,
      annulation: o.annulation ?? 'sans_frais',
      coutUsdMicros: o.coutUsdMicros ?? 39_000,
      scenario: o.scenario ?? 'succes',
    };
  }

  /** Programme la prochaine soumission. */
  prochaine(...s: ScenarioSimule[]): this { this.file.push(...s); return this; }

  /** Nombre de requêtes payantes créées · la mesure de « jamais de resoumission aveugle ». */
  get soumissions(): number { return this.requetes.size; }

  async soumettre(d: DemandeFournisseur): Promise<{ requestId: string }> {
    this.appelsSoumettre += 1;
    if (this.rechercheParCle) {
      for (const r of this.requetes.values()) if (r.cle === d.cleIdempotence) return { requestId: r.id };
    }
    const scenario = this.file.shift() ?? this.o.scenario;
    if (scenario === 'echec_certain') throw new ErreurFournisseurCertaine('requête refusée par le fournisseur simulé');
    const r: RequeteSimulee = { id: `sim_${randomUUID()}`, cle: d.cleIdempotence, scenario, operations: d.operations.map((x) => x.operation), restant: this.o.etapes, annulee: 'non' };
    this.requetes.set(r.id, r);
    if (scenario === 'reponse_perdue') throw new ErreurFournisseurIncertaine('réponse perdue après acceptation (simulée)');
    return { requestId: r.id };
  }

  async chercherParCle(cle: string): Promise<string | null> {
    if (!this.rechercheParCle) return null;
    for (const r of this.requetes.values()) if (r.cle === cle) return r.id;
    return null;
  }

  /** Lecture d'état sans effet de bord (sert aux webhooks fabriqués). */
  issue(requestId: string): StatutFournisseur {
    const r = this.requetes.get(requestId);
    if (!r) return { etat: 'inconnu' };
    if (r.annulee === 'sans_frais') return { etat: 'annule', facture: false, coutUsdMicros: 0 };
    if (r.restant > 0) return { etat: 'en_cours', progression: 50 };
    if (r.scenario === 'echec_distant') return { etat: 'echoue', facture: false, coutUsdMicros: 0, motif: 'échec simulé' };
    return {
      etat: 'reussi',
      coutUsdMicros: this.o.coutUsdMicros,
      sorties: r.operations.map((op) => ({ operation: op, ref: `${r.id}/${op}`, constat: { produitConforme: r.scenario === 'produit_faux' ? false : null } })),
    };
  }

  async statut(requestId: string): Promise<StatutFournisseur> {
    const r = this.requetes.get(requestId);
    if (r && r.restant > 0 && r.annulee === 'non') { r.restant -= 1; return { etat: 'en_cours', progression: 50 }; }
    return this.issue(requestId);
  }

  /** Termine immédiatement une requête (pour piloter un webhook « succès »). */
  terminer(requestId: string): void { const r = this.requetes.get(requestId); if (r) r.restant = 0; }

  async annuler(requestId: string): Promise<void> {
    const r = this.requetes.get(requestId);
    if (!r) return;
    if (this.o.annulation === 'sans_frais') r.annulee = 'sans_frais';
    else { r.annulee = 'trop_tard'; r.restant = 0; }
  }

  async telecharger(requestId: string, ref: string): Promise<{ octets: Uint8Array; mimeAnnonce: string }> {
    const r = this.requetes.get(requestId);
    if (!r || !ref.startsWith(`${requestId}/`)) throw new ErreurFournisseurCertaine('résultat inconnu');
    if (r.scenario === 'resultat_illisible') return { octets: new TextEncoder().encode('<html>502</html>'), mimeAnnonce: 'image/png' };
    return { octets: pngSimule(r.scenario === 'produit_faux' ? [40, 40, 40] : [255, 92, 138]), mimeAnnonce: 'image/png' };
  }

  /** Fabrique un événement de webhook (non signé). */
  evenement(requestId: string, type: EvenementFournisseur['type'], emisA: number, id: string = `evt_${randomUUID()}`): EvenementFournisseur {
    const ev: EvenementFournisseur = { id, type, requestId, emisA };
    const r = this.requetes.get(requestId);
    if (r) ev.cle = r.cle;
    if (type === 'progress') ev.progression = 40;
    if (type === 'succeeded') ev.coutUsdMicros = this.o.coutUsdMicros;
    return ev;
  }
}

/** Signature d'un webhook simulé · même schéma que celui que le worker vérifie. */
export function signerWebhookSimule(corpsBrut: string, horodatageS: number, secret: string): Record<string, string> {
  const signature = createHmac('sha256', secret).update(chaineSignee(horodatageS, corpsBrut)).digest('hex');
  return { 'x-studio-timestamp': String(horodatageS), 'x-studio-signature': `v1=${signature}` };
}

export class StockageSimule implements StockageStudio {
  readonly fichiers = new Map<string, Uint8Array>();
  indisponible = false;
  /** Acquitte le dépôt sans rien conserver (disque plein silencieux, cache menteur). */
  perteSilencieuse = false;
  depots = 0;

  constructor(o: { drapeau: unknown; env?: Record<string, string | undefined> }) {
    autoriser(o.drapeau, o.env ?? process.env);
  }

  async deposer(cle: string, octets: Uint8Array): Promise<void> {
    if (this.indisponible) throw new Error('stockage simulé indisponible');
    if (!cle.startsWith('simule/')) throw new Error('le stockage simulé n’accepte que des clés « simule/ »');
    this.depots += 1;
    if (this.perteSilencieuse) return;
    this.fichiers.set(cle, new Uint8Array(octets));
  }

  async relire(cle: string): Promise<Uint8Array | null> {
    if (this.indisponible) throw new Error('stockage simulé indisponible');
    return this.fichiers.get(cle) ?? null;
  }
}
