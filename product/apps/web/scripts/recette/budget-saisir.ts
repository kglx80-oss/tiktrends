/**
 * Recette Studios · E2 · `recette:budget:saisir` · saisir une dépense
 * ANTÉRIEURE (connue par facture, hors de toute base de recette).
 *
 *   pnpm --filter @tiktrends/web recette:budget:saisir -- --usd 0,40 --motif "facture fal du 7 octobre"
 *
 * Ajout seul : la dépense entre au registre et au journal, rien n'est
 * modifié ni retiré. Aucune base n'est écrite.
 */

import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lireMontantUsd, masquerSecrets, verifierCibleRecette, type Env } from './regles';
import { bilanRegistre, coherenceRegistre, ecrireRegistre, journaliser, lireBase, lireFichierRegistre, registreVierge, resoudreDossier, texteBilan } from './registre';

export function lireOptionsSaisie(argv: readonly string[]): { ok: true; usdMicros: number; motif: string } | { ok: false; raison: string } {
  let usd: string | null = null;
  let motif: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '--') continue;
    if (a === '--usd' || a === '--motif') {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) return { ok: false, raison: `Valeur attendue après ${a}.` };
      i++;
      if (a === '--usd') usd = v; else motif = v;
      continue;
    }
    return { ok: false, raison: `Option inconnue « ${a} ».` };
  }
  const m = lireMontantUsd(usd);
  if (m === null || m <= 0) return { ok: false, raison: 'Montant attendu : --usd 0,40 (dollars, au centime).' };
  if (!motif || motif.trim().length < 3) return { ok: false, raison: 'Motif attendu : --motif "facture … du …".' };
  return { ok: true, usdMicros: m, motif: motif.trim().slice(0, 300) };
}

export async function saisirAnterieure(env: Env, argv: readonly string[], maintenant: Date = new Date()): Promise<{ code: 0 | 2; texte: string }> {
  const cible = verifierCibleRecette(env);
  if (!cible.ok) return { code: 2, texte: `Saisie refusée · ${cible.raisons.join(' ; ')}` };
  const o = lireOptionsSaisie(argv);
  if (!o.ok) return { code: 2, texte: o.raison };
  const dossier = resoudreDossier(env);
  const lu = await lireBase();
  const f = lireFichierRegistre(dossier);
  const c = coherenceRegistre(f, lu.lignes.length, dossier);
  if (!c.ok) return { code: 2, texte: c.raison };
  const reg = f.etat === 'lisible' ? f.registre : registreVierge(maintenant);
  const a = { id: randomUUID(), usdMicros: o.usdMicros, motif: o.motif, saisieLe: maintenant.toISOString() };
  const neuf = { ...reg, anterieures: [...reg.anterieures, a], majLe: maintenant.toISOString() };
  ecrireRegistre(dossier, neuf);
  journaliser(dossier, { le: a.saisieLe, type: 'anterieure', anterieure: a, bilan: bilanRegistre(neuf) });
  return { code: 0, texte: `Dépense antérieure saisie · ${a.id}\n${texteBilan(neuf)}` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  saisirAnterieure(process.env, process.argv.slice(2)).then((r) => {
    (r.code === 0 ? console.log : console.error)(masquerSecrets(r.texte, process.env));
    process.exit(r.code);
  }, (e) => { console.error('✗', masquerSecrets((e as Error).message, process.env)); process.exit(1); });
}
