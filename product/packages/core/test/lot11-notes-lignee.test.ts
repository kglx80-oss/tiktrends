import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  projeterLignee, ligneeVersCanvas, deriverCanvas, cleNoeudNote, noeudPourNote, libelleNoeudNote, repartirNotes, notesOuvertes, phraseIndicateurNotes,
  resumeNotesNoeud, validerTexteCommentaire, droitsCommentaire, etatPublicationCommentaire, journalProjet, entreeJournal, lienLigneeProjet,
  TEXTES_NOTE, TEXTES_COMMENTAIRE, RAISON_LECTEUR_COMMENTAIRE, RAISON_LECTEUR_NOTE, RAISON_NOEUD_ABSENT, RAISON_PAS_UN_NOEUD, LONGUEUR_MAX_COMMENTAIRE,
  LIGNEE_A_VENIR, TYPES_JOURNAL,
  type EntreeLignee, type DonneesVariantes, type VarianteLue, type FaitJournal,
} from '../src/index';
import { contenuVideo } from './studios-fixtures';

/**
 * Lot 11 V5 · PC E11 · les NOTES du canvas de lignée · noyau pur. On vérifie
 * un RÉSULTAT · où une note se range (sous son nœud, ou « sans nœud »), qu'elle
 * ne vise jamais un lien ni rien de libre, que sa clé survit à une nouvelle
 * projection, que ses règles de texte et de gestes SONT celles des
 * commentaires (seules les phrases changent), et ce que le journal en dit.
 */

const variante = (o: Partial<VarianteLue> & Pick<VarianteLue, 'id' | 'versionId' | 'jobId' | 'lot' | 'position'>): VarianteLue => ({
  assetId: `a_${o.id}`, parentVariantId: null, mime: 'image/png', largeur: 1080, hauteur: 1350, sha256: 'f'.repeat(64),
  hypothese: null, variable: null, qualite: 'passed', etatTechnique: 'completed', creeLe: '2026-10-05',
  test: null, lecture: null, relecture: null, ...o,
});

/** Brief (hypothèse, direction) → lot 1 (deux créations, ou une seule si `sansVb`) · une référence · un projet source et une copie. */
function entree(o: { sansVb?: boolean; plusUneVersion?: boolean } = {}): EntreeLignee {
  const donnees: DonneesVariantes = {
    projet: { id: 'p1', titre: 'Sérum', versionCouranteId: o.plusUneVersion ? 'v2' : 'v1' },
    versions: [{ id: 'v1', n: 1, parentId: null, creeLe: '2026-10-01' }, ...(o.plusUneVersion ? [{ id: 'v2', n: 2, parentId: 'v1', creeLe: '2026-10-06' }] : [])],
    lots: [{ jobId: 'j1', lot: 1, versionId: 'v1', etat: 'completed', qualite: 'passed', creeLe: '2026-10-02', attendues: 2, sorties: [] }],
    variantes: [
      variante({ id: 'va', versionId: 'v1', jobId: 'j1', lot: 1, position: 1 }),
      ...(o.sansVb ? [] : [variante({ id: 'vb', versionId: 'v1', jobId: 'j1', lot: 1, position: 2 })]),
    ],
    adsmap: { acces: true, protocoleMarque: null, offres: [], pages: [] },
    droits: { proposer: true },
    relecture: { disponible: false, raison: null, coutMaxUsd: null },
  };
  return {
    projet: { id: 'p1', titre: 'Sérum', marque: 'Neva' },
    freres: { source: { id: 'p0', titre: 'Sérum · origine', versionId: 'v0' }, copies: [{ id: 'p2', titre: 'Sérum · copie', versionId: 'v1' }] },
    sources: [{ sourceId: 'src1', titre: 'Annonce concurrente', presentation: 'Annonce Meta.', lien: null }],
    briefs: {
      v1: { objectif: 'Faire connaître', hypothese: 'Une question retient', hypotheseId: 'h1', variable: 'hook', direction: 'Pastel' },
      ...(o.plusUneVersion ? { v2: { objectif: 'Itérer', hypothese: null, hypotheseId: null, variable: null, direction: null } } : {}),
    },
    donnees,
  };
}

const m = projeterLignee(entree());
const note = (id: string, noeud: string, resolu = false) => ({ id, noeud, resolu: resolu ? { par: 'x', quand: 'y' } : null });

describe('PC E11 · une note vise UN NŒUD, jamais un lien, jamais rien de libre', () => {
  it('la forme · chaque identifiant de la lignée projetée est une clé de note · un lien, un texte libre, une carte de production ne le sont pas', () => {
    expect(m.noeuds.length).toBeGreaterThan(6);
    for (const n of m.noeuds) expect(cleNoeudNote(n.id), n.id).toBe(n.id);
    for (const l of m.liens) expect(cleNoeudNote(`${l.de}>${l.vers}`), `lien ${l.de}>${l.vers}`).toBeNull();
    for (const x of ['', 'note libre', 'brief: v1', 'x'.repeat(10), `brief:${'a'.repeat(200)}`, 42, null, undefined, { id: 'marque' }, ['marque']]) {
      expect(cleNoeudNote(x), JSON.stringify(x)).toBeNull();
    }
    // Les cartes du canvas de PRODUCTION ne sont jamais des nœuds de lignée (identifiants disjoints).
    const prod = deriverCanvas(contenuVideo());
    expect(prod.cartes.length).toBeGreaterThan(0);
    for (const k of prod.cartes) expect(cleNoeudNote(k.id), `carte de production ${k.id}`).toBeNull();
  });

  it('`noeudPourNote` · le nœud présent donne sa clé et son libellé · absent ou lien · refusé avec sa raison, rien de créé', () => {
    expect(noeudPourNote(m, 'brief:v1')).toEqual({ ok: true, cle: 'brief:v1', libelle: 'Brief · version 1' });
    expect(noeudPourNote(m, 'creation:va')).toEqual({ ok: true, cle: 'creation:va', libelle: expect.stringMatching(/^Création · /) });
    expect(noeudPourNote(m, 'marque')).toEqual({ ok: true, cle: 'marque', libelle: 'Marque · Neva' });
    expect(noeudPourNote(m, 'creation:inconnue')).toEqual({ ok: false, raison: RAISON_NOEUD_ABSENT });
    expect(noeudPourNote(m, 'brief:v1>groupe:j1')).toEqual({ ok: false, raison: RAISON_PAS_UN_NOEUD });
    expect(noeudPourNote(m, 'commentaire libre')).toEqual({ ok: false, raison: RAISON_PAS_UN_NOEUD });
    // Le modèle n'est pas touché · aucune carte, aucun trait.
    const avant = JSON.stringify(m);
    noeudPourNote(m, 'brief:v1');
    expect(JSON.stringify(m)).toBe(avant);
  });

  it('le libellé gardé avec la note est lisible sans le nœud · type en tête, borné à 300', () => {
    expect(libelleNoeudNote({ type: 'brief', titre: 'Brief · version 3' })).toBe('Brief · version 3');
    expect(libelleNoeudNote({ type: 'creation', titre: 'Image 1  du\nlot 1' })).toBe('Création · Image 1 du lot 1');
    const long = libelleNoeudNote({ type: 'reference', titre: 'x'.repeat(400) });
    expect([...long].length).toBe(300);
    expect(long.endsWith('…')).toBe(true);
  });

  it('la contrainte posée en base (0076) admet EXACTEMENT les clés du noyau · chaque type de nœud de la lignée y passe, un lien non', () => {
    const sql = readFileSync(join(__dirname, '../../db/drizzle/0076_notes_lignee.sql'), 'utf8');
    const motif = sql.match(/"node_key" ~ '([^']+)'/)![1]!.replace('[:space:]', '\\s');
    const re = new RegExp(motif);
    const types = new Set(m.noeuds.map((n) => n.type));
    // Le semis couvre les types aux identifiants composés (`projet-source:`, `projet-copie:`) et la marque sans deux-points.
    for (const t of ['marque', 'reference', 'brief', 'hypothese', 'direction', 'groupe', 'creation', 'projet_source', 'copie'] as const) expect(types.has(t), t).toBe(true);
    for (const n of m.noeuds) expect(re.test(n.id), `la base refuserait la note sur ${n.id}`).toBe(true);
    for (const l of m.liens) expect(re.test(`${l.de}>${l.vers}`), `la base accepterait une note sur le lien ${l.de}>${l.vers}`).toBe(false);
    expect(re.test('note libre')).toBe(false);
  });
});

describe('PC E11 · la clé survit à une nouvelle projection · nœud disparu, note gardée « sans nœud »', () => {
  const notes = [note('n1', 'brief:v1'), note('n2', 'creation:vb'), note('n3', 'creation:vb', true), note('n4', 'marque'), note('n5', 'groupe:j1')];

  it('des données AJOUTÉES (une itération) · même clé pour les mêmes nœuds, chaque note reste sous son nœud', () => {
    const plus = projeterLignee(entree({ plusUneVersion: true }));
    expect(plus.noeuds.length).toBeGreaterThan(m.noeuds.length);
    for (const n of m.noeuds) expect(plus.noeuds.some((x) => x.id === n.id), `${n.id} perdu à la reprojection`).toBe(true);
    const r = repartirNotes(notes, plus);
    expect(r.sansNoeud).toEqual([]);
    expect(r.parNoeud.get('creation:vb')!.map((x) => x.id)).toEqual(['n2', 'n3']);
    expect(r.parNoeud.get('brief:v1')!.map((x) => x.id)).toEqual(['n1']);
  });

  it('une donnée RETIRÉE (la variante vb) · ses notes passent dans « Notes sans nœud », lisibles, dans l’ordre · aucune perdue', () => {
    const moins = projeterLignee(entree({ sansVb: true }));
    expect(moins.noeuds.some((n) => n.id === 'creation:vb')).toBe(false);
    const r = repartirNotes(notes, moins);
    expect(r.sansNoeud.map((x) => x.id)).toEqual(['n2', 'n3']);
    expect([...r.parNoeud.values()].flat().map((x) => x.id).sort()).toEqual(['n1', 'n4', 'n5']);
    expect(r.sansNoeud.length + [...r.parNoeud.values()].flat().length).toBe(notes.length);
  });

  it('l’indicateur compte les notes OUVERTES · la phrase et le résumé du nœud', () => {
    const r = repartirNotes(notes, m);
    expect(notesOuvertes(r.parNoeud.get('creation:vb'))).toBe(1);
    expect(notesOuvertes(r.parNoeud.get('creation:va'))).toBe(0);
    expect(phraseIndicateurNotes(1)).toBe('1 note ouverte');
    expect(phraseIndicateurNotes(3)).toBe('3 notes ouvertes');
    expect(resumeNotesNoeud(r.parNoeud.get('creation:vb'))).toBe('1 note ouverte · 1 résolue');
    expect(resumeNotesNoeud([])).toBe('Aucune note sur ce nœud.');
  });

  it('la lignée ne projette aucune note · « Note » n’est plus « à venir », aucun nœud ni lien n’en vient', () => {
    expect(LIGNEE_A_VENIR.map((a) => a.element)).not.toContain('Note');
    expect(m.noeuds.some((n) => n.id.startsWith('note'))).toBe(false);
    expect(ligneeVersCanvas(m).cartes.map((k) => k.id).sort()).toEqual(m.noeuds.map((n) => n.id).sort());
  });
});

describe('PC E11 · les règles SONT celles des commentaires · seules les phrases changent', () => {
  it('texte · même normalisation, mêmes bornes · `<script>` reste du texte · phrases de note', () => {
    expect(validerTexteCommentaire('  <script>alert(1)</script>\r\n\r\n\r\nfin  ', TEXTES_NOTE)).toEqual({ ok: true, texte: '<script>alert(1)</script>\n\nfin' });
    expect(validerTexteCommentaire(' \n ', TEXTES_NOTE)).toEqual({ ok: false, raison: 'La note est vide · écris ce que tu veux retenir sur ce nœud.' });
    expect(validerTexteCommentaire(42, TEXTES_NOTE)).toEqual({ ok: false, raison: 'La note doit être un texte · recharge la page puis recommence.' });
    expect(validerTexteCommentaire('a'.repeat(LONGUEUR_MAX_COMMENTAIRE + 1), TEXTES_NOTE)).toEqual({ ok: false, raison: 'La note fait 2001 caractères · 2000 au plus, raccourcis-la.' });
    // La même règle que le commentaire, sur chaque entrée · seules les raisons diffèrent.
    for (const x of ['ok', '  a\u0007b  ', '', 'x'.repeat(2000), 'x'.repeat(2001), 7]) {
      const c = validerTexteCommentaire(x); const n = validerTexteCommentaire(x, TEXTES_NOTE);
      expect(n.ok, JSON.stringify(x)).toBe(c.ok);
      if (c.ok && n.ok) expect(n.texte).toBe(c.texte);
    }
  });

  it('gestes · modifier SEULEMENT la sienne, encore ouverte · résoudre / rouvrir pour qui propose · le lecteur lit seulement', () => {
    const moi = { userId: 'u1', peutProposer: true };
    expect(droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: 0 }, moi, TEXTES_NOTE).modifier).toEqual({ ok: true, raison: null });
    expect(droitsCommentaire({ auteurId: 'u2', resolu: false, modifications: 0 }, moi, TEXTES_NOTE).modifier).toEqual({ ok: false, raison: 'Seule la personne qui l’a écrite peut la modifier · ajoute une nouvelle note.' });
    expect(droitsCommentaire({ auteurId: 'u1', resolu: true, modifications: 0 }, moi, TEXTES_NOTE)).toEqual({
      modifier: { ok: false, raison: 'Cette note est résolue · rouvre-la pour la modifier.' },
      resoudre: { ok: false, raison: 'Cette note est déjà résolue.' },
      rouvrir: { ok: true, raison: null },
    });
    expect(droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: 20 }, moi, TEXTES_NOTE).modifier.raison).toBe('Déjà modifiée 20 fois · écris une nouvelle note.');
    const lecteur = droitsCommentaire({ auteurId: 'u1', resolu: false, modifications: 0 }, { userId: 'u1', peutProposer: false }, TEXTES_NOTE);
    expect(Object.values(lecteur)).toEqual([0, 1, 2].map(() => ({ ok: false, raison: RAISON_LECTEUR_NOTE })));
    expect(etatPublicationCommentaire('Une note', { peutProposer: true, cibleChoisie: true }, TEXTES_NOTE)).toEqual({ ok: true, raison: null });
    expect(etatPublicationCommentaire('', { peutProposer: true, cibleChoisie: true }, TEXTES_NOTE).raison).toBe(TEXTES_NOTE.vide);
  });

  it('les commentaires gardent leurs phrases (aucune régression)', () => {
    expect(RAISON_LECTEUR_COMMENTAIRE).toBe(TEXTES_COMMENTAIRE.lecteur);
    expect(validerTexteCommentaire('  ').ok === false && (validerTexteCommentaire('  ') as { raison: string }).raison).toBe('Le commentaire est vide · écris ce que tu as vu avant de publier.');
    expect(droitsCommentaire({ auteurId: 'u2', resolu: false, modifications: 0 }, { userId: 'u1', peutProposer: true }).modifier.raison).toBe('Seule la personne qui l’a écrit peut le modifier · réponds par un nouveau commentaire.');
  });
});

describe('PC E11 · le journal du projet dit la note · son nœud, jamais son texte', () => {
  const faits: FaitJournal[] = [
    { source: 'note', id: 'n1:ecrite', le: '2026-11-02T10:00:00.000Z', acteur: 'Toi', geste: 'ecrite', noeud: 'Brief · version 1' },
    { source: 'note', id: 'n1:resolue', le: '2026-11-03T10:00:00.000Z', acteur: 'ur@x.test', geste: 'resolue', noeud: 'Brief · version 1' },
    { source: 'version', id: 'v1', le: '2026-11-01T10:00:00.000Z', acteur: 'Toi', versionN: 1, raison: 'création' },
  ];

  it('une phrase par geste, type « Notes de la lignée », lien vers la lignée du projet', () => {
    const e = entreeJournal(faits[0]!, { projectId: 'p1' });
    expect(e).toMatchObject({ type: 'notes', phrase: 'Note sur la lignée', detail: 'Sur « Brief · version 1 »', acteur: 'Toi', versionN: null, lien: { href: '/studio/projets/p1?disposition=libre&graphe=lignee', libelle: 'Voir la lignée' } });
    expect(entreeJournal(faits[1]!, { projectId: 'p1' }).phrase).toBe('Note de la lignée résolue');
    expect(lienLigneeProjet('p 1')).toBe('/studio/projets/p%201?disposition=libre&graphe=lignee');
  });

  it('filtre « Notes de la lignée » offert seulement quand il y a des notes, compté · trié du plus récent', () => {
    const j = journalProjet(faits, { projectId: 'p1' });
    expect(j.entrees.map((x) => x.phrase)).toEqual(['Note de la lignée résolue', 'Note sur la lignée', 'Version 1 enregistrée']);
    expect(j.filtres).toEqual([{ cle: 'versions', libelle: 'Versions', n: 1 }, { cle: 'notes', libelle: 'Notes de la lignée', n: 2 }]);
    expect(journalProjet(faits, { projectId: 'p1', type: 'notes' }).total).toBe(2);
    expect(journalProjet(faits.slice(2), { projectId: 'p1' }).filtres.map((f) => f.cle)).toEqual(['versions']);
    expect(TYPES_JOURNAL.map((t) => t.cle)).toContain('notes');
  });
});
