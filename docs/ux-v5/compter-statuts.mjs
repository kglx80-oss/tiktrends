#!/usr/bin/env node
// Compte les statuts des quatre inventaires V5 et imprime le tableau de MATRICE.md.
//
//   node docs/ux-v5/compter-statuts.mjs            tableau de comptage (Markdown)
//   node docs/ux-v5/compter-statuts.mjs --reste    lignes « à créer » et « partiel », par zone
//   node docs/ux-v5/compter-statuts.mjs --dossier <chemin>   lit les inventaires ailleurs
//
// Aucune dépendance. Une ligne de tableau compte quand elle suit un en-tête dont la
// première cellule est « id » et qui porte une colonne « statut ». Un statut mixte qui
// contient « décision Kevin » compte en « décision Kevin » (règle de MATRICE.md).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const i = args.indexOf('--dossier');
const dossier = i >= 0 ? args[i + 1] : dirname(fileURLToPath(import.meta.url));

export const ZONES = [
  ['Coquille et Accueil', 'inventaire-coquille-accueil.md'],
  ['Veille, Bibliothèque, Marques', 'inventaire-veille-biblio-marques.md'],
  ['Projets et canvas', 'inventaire-projets-canvas.md'],
  ['Résultats, Jarvis, ADMIN+', 'inventaire-resultats-jarvis-admin.md'],
];
export const STATUTS = ['raccordé', 'raccordé PR', 'partiel', 'à créer', 'décision Kevin', 'caduc'];

export function normaliser(s) {
  const t = s.trim();
  if (t.includes('décision Kevin')) return 'décision Kevin';
  if (t.startsWith('raccordé PR')) return 'raccordé PR';
  if (t.startsWith('raccordé')) return 'raccordé';
  if (t.startsWith('partiel')) return 'partiel';
  if (t.startsWith('à créer')) return 'à créer';
  if (t.startsWith('caduc') || t.startsWith('ne pas porter')) return 'caduc';
  return `inconnu (${t})`;
}

const cellules = (l) => l.trimEnd().split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim());

export function lignes(texte) {
  const out = [];
  let entete = null;
  for (const l of texte.split('\n')) {
    if (!l.startsWith('|')) { if (!l.trim()) entete = null; continue; }
    const c = cellules(l);
    if (c[0]?.toLowerCase() === 'id') { entete = c; continue; }
    if (!entete || /^[-:\s]*$/.test(c.join(''))) continue;
    const k = entete.indexOf('statut');
    if (k < 0 || c.length !== entete.length) continue;
    out.push({ id: c[0], vue: c[1], controle: c[2], statut: normaliser(c[k]) });
  }
  return out;
}

const parZone = ZONES.map(([zone, fichier]) => ({ zone, fichier, lignes: lignes(readFileSync(join(dossier, fichier), 'utf8')) }));

if (args.includes('--reste')) {
  for (const z of parZone) {
    console.log(`\n## ${z.zone}`);
    for (const s of ['à créer', 'partiel']) {
      const l = z.lignes.filter((x) => x.statut === s);
      console.log(`\n${s} (${l.length}) : ${l.map((x) => x.id).join(', ')}`);
    }
  }
} else {
  const total = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  const inconnus = [];
  console.log(`| Zone | ${STATUTS.join(' | ')} | lignes |`);
  console.log(`| --- |${STATUTS.map(() => ' --- |').join('')} --- |`);
  for (const z of parZone) {
    const n = Object.fromEntries(STATUTS.map((s) => [s, 0]));
    for (const x of z.lignes) { if (x.statut in n) { n[x.statut] += 1; total[x.statut] += 1; } else inconnus.push(`${z.fichier} ${x.id} ${x.statut}`); }
    console.log(`| ${z.zone} | ${STATUTS.map((s) => n[s]).join(' | ')} | ${z.lignes.length} |`);
  }
  const t = parZone.reduce((a, z) => a + z.lignes.length, 0);
  console.log(`| **Total** | ${STATUTS.map((s) => `**${total[s]}**`).join(' | ')} | **${t}** |`);
  if (inconnus.length) { console.error(`Statuts non reconnus :\n${inconnus.join('\n')}`); process.exitCode = 1; }
}
