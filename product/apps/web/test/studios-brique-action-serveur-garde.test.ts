import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Garde de source · la rubrique projet (`spatial/vues/projet/`) n'a qu'UNE
 * brique « bouton d'action serveur » (`action-serveur.ts`) · les passes
 * #1024, #1027, #1031 et #1032 l'avaient recopiée quatre fois. Commentaires
 * retirés, chaque `<button` est lu attribut par attribut (pas une ligne au
 * hasard) et chaque fichier est recensé PAR MOTIF :
 *
 *  · `disabled-pendant-action` · un `disabled={…}` écrit à la main qui lit
 *    l'action en cours (`enCours`, `encours`, `occupe`…) · c'est `disabled`
 *    sous le doigt du bouton pressé, le focus tombe au document ; la brique
 *    (`boutonAction`) décide seule, et ne ferme jamais le pressé ;
 *  · `aria-busy-brut` · un `aria-busy` écrit à la main sur un bouton · seule
 *    la brique le pose, avec le second clic ignoré qui va avec ;
 *  · `FERME-local` · une copie de l'aspect fermé (`FERME`, ou ses valeurs) ;
 *  · `focus-local` · une copie du replacement du focus (`focaliserApres`,
 *    `rattraperFocus`, ou son corps · premier sélecteur présent et ouvert) ;
 *  · `hors-ligne-local` · le mot « Hors ligne » écrit à la main, ou passé en
 *    `etiquette` d'un message · c'est `<Message horsLigne>` (`briques.tsx`) ;
 *  · `import-focus` · la rubrique importe l'ancien `./focus` (réexport gardé
 *    pour les écrans hors rubrique) au lieu de la brique.
 *
 * EXCEPTIONS · AUCUNE. Les quatre derniers ateliers (parcours image,
 * Textes, Produit, rattachement Adsmap) sont passés sur la brique avec leur
 * passe design · la table est vide et le reste · une exception ajoutée fait
 * tomber le cas « la table est vide », avec le nom du fichier. Un bouton qui
 * ne peut pas passer par la brique se discute en PR, pas dans cette table.
 */
const RUBRIQUE = join(__dirname, '..', 'spatial', 'vues', 'projet');

/** Les fichiers de la brique · seuls autorisés à porter ce qu'ils définissent. */
const BRIQUE: Record<string, Motif[]> = {
  'action-serveur.ts': ['FERME-local', 'focus-local'],
};

type Motif = 'disabled-pendant-action' | 'aria-busy-brut' | 'FERME-local' | 'focus-local' | 'hors-ligne-local' | 'import-focus';

const EXCEPTIONS: Record<string, Partial<Record<Motif, [number, string]>>> = {};

const PHRASE: Record<Motif, string> = {
  'disabled-pendant-action': '`disabled` écrit à la main pendant une action serveur · le bouton pressé perdrait le focus · passe par `boutonAction` (`./action-serveur`)',
  'aria-busy-brut': '`aria-busy` écrit à la main sur un bouton · passe par `boutonAction` (`./action-serveur`), qui ignore aussi le second clic',
  'FERME-local': 'copie locale de `FERME` · importe-le de `./action-serveur`',
  'focus-local': 'copie locale du replacement du focus · utilise `replacerFocus(\'toujours\' | \'si-perdu\', …)` de `./action-serveur`',
  'hors-ligne-local': 'pastille « Hors ligne » écrite à la main · utilise `<Message horsLigne>` (`./briques`)',
  'import-focus': 'la rubrique importe `./focus` · importe la brique `./action-serveur`',
};

const sansCommentaires = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Fin (exclue) d'une expression `{…}` qui commence à `i` · chaînes et gabarits sautés. */
function finAccolades(s: string, i: number): number {
  let prof = 0;
  for (let j = i; j < s.length; j += 1) {
    const c = s[j];
    if (c === '"' || c === "'") { j = finChaine(s, j, c); continue; }
    if (c === '`') { j = finGabarit(s, j); continue; }
    if (c === '{') prof += 1;
    else if (c === '}') { prof -= 1; if (prof === 0) return j + 1; }
  }
  return s.length;
}
function finChaine(s: string, i: number, q: string): number {
  for (let j = i + 1; j < s.length; j += 1) { if (s[j] === '\\') { j += 1; continue; } if (s[j] === q) return j; }
  return s.length;
}
function finGabarit(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j += 1) {
    if (s[j] === '\\') { j += 1; continue; }
    if (s[j] === '`') return j;
    if (s[j] === '$' && s[j + 1] === '{') j = finAccolades(s, j + 1) - 1;
  }
  return s.length;
}

/** Les attributs d'une balise ouvrante `<button` (au premier niveau · une chaîne dans un `onClick` n'est pas un attribut). */
function attributsBouton(s: string, debut: number): Array<{ nom: string; valeur: string }> {
  const out: Array<{ nom: string; valeur: string }> = [];
  let i = debut + '<button'.length;
  while (i < s.length) {
    while (/\s/.test(s[i] ?? '')) i += 1;
    const c = s[i];
    if (c === undefined || c === '>' || c === '/') break;
    if (c === '{') { const f = finAccolades(s, i); out.push({ nom: '...', valeur: s.slice(i, f) }); i = f; continue; }
    const m = /^[\w:-]+/.exec(s.slice(i));
    if (!m) { i += 1; continue; }
    const nom = m[0]; i += nom.length;
    if (s[i] !== '=') { out.push({ nom, valeur: 'true' }); continue; }
    i += 1;
    if (s[i] === '{') { const f = finAccolades(s, i); out.push({ nom, valeur: s.slice(i, f) }); i = f; }
    else if (s[i] === '"' || s[i] === "'") { const f = finChaine(s, i, s[i]!); out.push({ nom, valeur: s.slice(i, f + 1) }); i = f + 1; }
  }
  return out;
}

const ETAT_EN_COURS = /\b(enCours|encours|occupe|pending|isPending|envoiEnCours)\b/;

function recenser(source: string): Record<Motif, string[]> {
  const s = sansCommentaires(source);
  const r: Record<Motif, string[]> = { 'disabled-pendant-action': [], 'aria-busy-brut': [], 'FERME-local': [], 'focus-local': [], 'hors-ligne-local': [], 'import-focus': [] };
  for (const m of s.matchAll(/<button(?=[\s>])/g)) {
    const attrs = attributsBouton(s, m.index!);
    const id = attrs.find((a) => a.nom.startsWith('data-'));
    const nom = id ? `${id.nom}=${id.valeur}` : `<button> ligne ${s.slice(0, m.index).split('\n').length}`;
    for (const a of attrs) {
      if (a.nom === 'disabled' && ETAT_EN_COURS.test(a.valeur)) r['disabled-pendant-action'].push(`${nom} · disabled=${a.valeur}`);
      if (a.nom === 'aria-busy') r['aria-busy-brut'].push(`${nom} · aria-busy=${a.valeur}`);
    }
  }
  for (const l of s.split('\n')) {
    if (/\bFERME\s*=|opacity:\s*0?\.5\s*,\s*cursor:\s*['"]default['"]/.test(l)) r['FERME-local'].push(l.trim().slice(0, 120));
    if (/\b(function\s+(focaliserApres|rattraperFocus|replacerFocus)\b|(const|let|var)\s+(focaliserApres|rattraperFocus|replacerFocus)\s*=)/.test(l)) r['focus-local'].push(l.trim().slice(0, 120));
    if (/['"`]Hors ligne['"`]|etiquette=\{[^}]*(Hors ligne|TEXTES_HORS_LIGNE)/.test(l)) r['hors-ligne-local'].push(l.trim().slice(0, 120));
    if (/from\s+['"]\.\/focus['"]/.test(l)) r['import-focus'].push(l.trim().slice(0, 120));
  }
  // Le corps recopié · « le premier sélecteur présent et ouvert prend le focus », quel que soit son nom.
  for (const m of s.matchAll(/querySelector<HTMLElement>\(\s*\w+\s*\)[\s\S]{0,160}?\.disabled\b[\s\S]{0,80}?\.focus\(\)/g)) r['focus-local'].push(m[0].replace(/\s+/g, ' ').slice(0, 120));
  return r;
}

const fichiers = () => readdirSync(RUBRIQUE).filter((n) => /\.(ts|tsx)$/.test(n)).sort();

describe('rubrique projet · une seule brique « bouton d’action serveur »', () => {
  const MOTIFS = Object.keys(PHRASE) as Motif[];
  for (const motif of MOTIFS) {
    it(`${motif} · aucun hors de la brique et des exceptions recensées`, () => {
      const fautes: string[] = [];
      for (const f of fichiers()) {
        if (BRIQUE[f]?.includes(motif)) continue;
        const trouves = recenser(readFileSync(join(RUBRIQUE, f), 'utf8'))[motif];
        const permis = EXCEPTIONS[f]?.[motif]?.[0] ?? 0;
        if (trouves.length > permis) fautes.push(`${f} · ${PHRASE[motif]} · ${trouves.length} au lieu de ${permis} · ${trouves.join(' | ')}`);
        else if (trouves.length < permis) fautes.push(`${f} · ${motif} · ${trouves.length} au lieu de ${permis} recensé(s) · bonne nouvelle, baisse le compte de la table EXCEPTIONS`);
      }
      expect(fautes).toEqual([]);
    });
  }

  it('la brique définit bien ce qu’elle prétend porter (la garde regarde la bonne chose)', () => {
    const brique = recenser(readFileSync(join(RUBRIQUE, 'action-serveur.ts'), 'utf8'));
    expect(brique['FERME-local'].length, 'action-serveur.ts doit définir FERME').toBeGreaterThan(0);
    expect(brique['focus-local'].length, 'action-serveur.ts doit définir replacerFocus').toBeGreaterThan(0);
    expect(sansCommentaires(readFileSync(join(RUBRIQUE, 'briques.tsx'), 'utf8')), 'briques.tsx doit porter la variante « Hors ligne » de Message').toMatch(/horsLigne \? TEXTES_HORS_LIGNE\.pastille/);
  });

  it('la table des exceptions est VIDE · aucun fichier de la rubrique n’a le droit d’écrire un bouton d’action hors brique', () => {
    const ouvertes = Object.entries(EXCEPTIONS).flatMap(([f, motifs]) => Object.entries(motifs).map(([motif, [n]]) => `${f} · ${motif} · ${n}`));
    expect(ouvertes, 'exception rouverte · passe le bouton par `boutonAction` (`./action-serveur`) au lieu d’agrandir la table').toEqual([]);
  });

  it('les quatre ateliers passés sur la brique y passent bien par la brique (la garde regarde des fichiers vivants)', () => {
    for (const f of ['ParcoursImage.tsx', 'Textes.tsx', 'Produit.tsx', 'Rattachement.tsx']) {
      const s = sansCommentaires(readFileSync(join(RUBRIQUE, f), 'utf8'));
      expect((s.match(/\.\.\.boutonAction\(/g) ?? []).length, `${f} n’étale plus la brique sur ses boutons`).toBeGreaterThanOrEqual(2);
    }
  });

  it('chaque exception nomme un fichier présent et dit pourquoi', () => {
    const presents = new Set(fichiers());
    for (const [f, motifs] of Object.entries(EXCEPTIONS)) {
      expect(presents.has(f), `${f} n’existe plus · retire-le de EXCEPTIONS`).toBe(true);
      for (const [, [n, pourquoi]] of Object.entries(motifs)) { expect(n).toBeGreaterThan(0); expect(pourquoi.length).toBeGreaterThan(20); }
    }
  });

  it('le lecteur d’attributs voit un `disabled` d’action, ignore une chaîne dans un `onClick` et un bouton passé par la brique', () => {
    const r = recenser([
      '<button className="btn" disabled={!!enCours} onClick={() => go()}>A</button>',
      '<button data-x="1" {...boutonAction({ presse: enCours === "a", occupe: !!enCours })} onClick={() => replacerFocus("si-perdu", \'[aria-busy="true"]\')}>B</button>',
      '<button data-y="2" disabled={!pret} aria-busy={occupe}>C</button>',
    ].join('\n'));
    expect(r['disabled-pendant-action']).toEqual(['<button> ligne 1 · disabled={!!enCours}']);
    expect(r['aria-busy-brut']).toEqual(['data-y="2" · aria-busy={occupe}']);
  });
});
