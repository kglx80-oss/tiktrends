#!/usr/bin/env node
/**
 * Studios · L9 · BASE-05 · temps et erreurs des parcours, mesurés sur une app
 * LOCALE (next start) et une base LOCALE synthétique. Aussi la preuve de MIG-02
 * et MIG-03 côté écran : chaque page dit si le contenu attendu est bien rendu.
 *
 * Ce sont des MESURES d'un environnement donné (machine, charge, données), pas
 * des objectifs. Le rapport les accompagne toujours de l'environnement.
 *
 * Usage :
 *   node ops/migration/mesurer-parcours.mjs --app http://127.0.0.1:3485 \
 *     --secret <AUTH_SECRET local de l'app lancée> --utilisateur <uuid> --marque <uuid> \
 *     [--repetitions 7] [--projet <uuid>] [--etiquette main] [--sortie mesures.json]
 *
 * Aucune dépendance : le cookie de session est le JWT HS256 que `lib/auth.ts`
 * vérifie ({ uid, ep }), signé avec le secret LOCAL passé à l'app de recette.
 * Refuse toute app qui n'écoute pas sur 127.0.0.1 / localhost.
 */
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import os from 'node:os';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const APP = args.app ?? 'http://127.0.0.1:3485';
const N = Math.max(2, Number(args.repetitions ?? 7));
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(APP)) {
  console.error(`ARRÊT · app non locale refusée : ${APP}`);
  process.exit(2);
}
for (const k of ['secret', 'utilisateur', 'marque']) {
  if (!args[k]) { console.error(`ARRÊT · --${k} manquant`); process.exit(2); }
}

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function jeton(uid, secret) {
  const t = Math.floor(Date.now() / 1000);
  const corps = `${b64({ alg: 'HS256' })}.${b64({ uid, ep: 0, iat: t, exp: t + 3600 })}`;
  return `${corps}.${createHmac('sha256', secret).update(corps).digest('base64url')}`;
}
const COOKIE = `tt_session=${jeton(args.utilisateur, args.secret)}; tt_brand=${args.marque}`;

/** Parcours mesurés · `attendu` = texte qui prouve que le contenu (hérité ou nouveau) est rendu. */
const PARCOURS = [
  { groupe: 'Accueil', route: '/dashboard', attendu: 'Marque L9 Alpha' },
  { groupe: 'Pubs IA', route: '/studio/ads', attendu: 'Pub héritée L9 n°' },
  { groupe: 'Studio historique', route: '/studio', attendu: null },
  { groupe: 'Studio historique', route: '/studio/image', attendu: 'Image héritée L9 n°' },
  { groupe: 'Studio historique', route: '/studio/video', attendu: 'Vidéo héritée L9 n°' },
  { groupe: 'Studio historique', route: '/studio/textes', attendu: null },
  { groupe: 'Veille', route: '/veille', attendu: null },
  { groupe: 'Veille', route: '/veille/scale', attendu: null },
  { groupe: 'Veille', route: '/saved', attendu: 'Annonceur synthétique' },
  { groupe: 'Adsmap', route: '/adsmap', attendu: null },
  { groupe: 'Studios v1', route: '/studio/projets', attendu: 'Projet Studios L9' },
  ...(args.projet ? [{ groupe: 'Studios v1', route: `/studio/projets/${args.projet}`, attendu: 'Projet Studios L9' }] : []),
];

/** Marqueurs d'une page cassée rendue avec un statut 200 (erreur React côté serveur). */
const MARQUEURS_ERREUR = ['Application error', 'Internal Server Error', 'NEXT_NOT_FOUND', 'Une erreur est survenue'];

async function une(route) {
  const t0 = performance.now();
  try {
    const r = await fetch(APP + route, { headers: { cookie: COOKIE }, redirect: 'manual' });
    const corps = await r.text();
    return { statut: r.status, ms: performance.now() - t0, octets: corps.length, corps, redirection: r.headers.get('location') };
  } catch (e) {
    return { statut: 0, ms: performance.now() - t0, octets: 0, corps: '', erreur: String(e?.cause?.code ?? e?.message ?? e) };
  }
}

const quantile = (xs, q) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
};
const r1 = (x) => (x === null ? null : Math.round(x));

const environnement = {
  date: new Date().toISOString(), app: APP, etiquette: args.etiquette ?? null,
  machine: `${os.cpus().length} cœurs ${os.cpus()[0]?.model ?? ''}`.trim(), memoireMo: Math.round(os.totalmem() / 2 ** 20),
  chargeAvant: os.loadavg().map((x) => x.toFixed(2)), node: process.version, repetitions: N,
};

const resultats = [];
for (const p of PARCOURS) {
  const essais = [];
  for (let i = 0; i < N; i++) essais.push(await une(p.route));
  const chauds = essais.slice(1).filter((e) => e.statut === 200).map((e) => e.ms);
  const statuts = [...new Set(essais.map((e) => e.statut))];
  const casses = essais.filter((e) => e.statut >= 500 || e.statut === 0 || MARQUEURS_ERREUR.some((m) => e.corps.includes(m))).length;
  const vers = essais.find((e) => e.redirection)?.redirection ?? null;
  resultats.push({
    groupe: p.groupe, route: p.route.replace(args.projet ?? '¤', '[id]'), statuts, redirection: vers,
    froidMs: r1(essais[0].ms), medianeMs: r1(quantile(chauds, 0.5)), p95Ms: r1(quantile(chauds, 0.95)),
    minMs: r1(chauds.length ? Math.min(...chauds) : null), maxMs: r1(chauds.length ? Math.max(...chauds) : null),
    erreurs: casses, octets: essais[essais.length - 1].octets,
    contenuAttendu: p.attendu === null ? null : essais.some((e) => e.statut === 200 && e.corps.includes(p.attendu)),
    detailErreur: essais.find((e) => e.erreur)?.erreur ?? null,
  });
}
environnement.chargeApres = os.loadavg().map((x) => x.toFixed(2));

const sortie = { environnement, resultats };
if (args.sortie) writeFileSync(args.sortie, JSON.stringify(sortie, null, 2));
console.log(`Mesures ${environnement.etiquette ?? ''} · ${environnement.machine} · ${environnement.memoireMo} Mo · charge avant ${environnement.chargeAvant.join(' ')} après ${environnement.chargeApres.join(' ')} · ${N} requêtes par route (1 à froid + ${N - 1} à chaud)`);
console.log('| Parcours | Route | Statuts | 1re (ms) | Médiane (ms) | p95 (ms) | Erreurs | Contenu attendu |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of resultats) {
  const contenu = r.contenuAttendu === null ? '·' : r.contenuAttendu ? 'oui' : 'NON';
  console.log(`| ${r.groupe} | ${r.route} | ${r.statuts.join(',')}${r.redirection ? ` → ${r.redirection}` : ''} | ${r.froidMs} | ${r.medianeMs ?? '·'} | ${r.p95Ms ?? '·'} | ${r.erreurs} | ${contenu} |`);
}
