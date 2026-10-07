import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PACK_EMBARQUE } from '../lib/studios/prompts/pack-embarque';
import { moduleEmbarque, DOSSIER_SOURCE, CIBLE_EMBARQUE, FICHIERS_EMBARQUES, decider, CONFIRMATION } from '../scripts/importer-pack-prompts';
import { environnementPrompts } from '../lib/studios/prompts/environnement';
import { versionVersEntier, entierVersVersion, versionSuivante, empreinteReleaseComplete, lireEntrees } from '../lib/studios/prompts/correspondance';
import { POLITIQUE_JARVIS_1_0_0 } from '../lib/studios/prompts/complement-tiktrends';
import { validerPolitiqueConversation } from '../lib/studios/prompts/conversation';
import { expurgerRun, nomsSourcesUtiles } from '../lib/studios/prompts/traces';
import { diffLignes } from '../lib/studios/prompts/vue';

/**
 * Règles pures du serveur L2 · copie embarquée, garde du script, environnement,
 * correspondance des versions et des empreintes, expurgation, frontière client.
 */

describe('copie embarquée du pack', () => {
  it('chaque fichier embarqué est la copie octet pour octet de docs/studios-v2', () => {
    for (const [nom, fichier] of Object.entries(FICHIERS_EMBARQUES)) {
      const disque = readFileSync(join(DOSSIER_SOURCE, fichier), 'utf8');
      const e = PACK_EMBARQUE[nom as keyof typeof FICHIERS_EMBARQUES];
      expect(e.texte === disque, `${fichier} diffère de la copie embarquée · lancer IMPORTER_PACK_MODE=embarquer npx tsx scripts/importer-pack-prompts.ts`).toBe(true);
      expect(e.sha256).toBe(createHash('sha256').update(disque, 'utf8').digest('hex'));
    }
  });
  it('le module généré est celui que le script produirait aujourd’hui', () => {
    expect(readFileSync(CIBLE_EMBARQUE, 'utf8') === moduleEmbarque(DOSSIER_SOURCE), 'pack-embarque.ts périmé · régénérer avec le script (mode embarquer)').toBe(true);
  });
});

describe('garde du script d’import', () => {
  it('refuse sans base, se limite au plan sans la confirmation exacte', () => {
    expect(decider({})).toEqual({ ok: false, raison: 'DATABASE_URL absente · aucun registre à lire ni à écrire.' });
    expect(decider({ DATABASE_URL: 'postgres://x' })).toEqual({ ok: true, mode: 'importer', ecrire: false });
    expect(decider({ DATABASE_URL: 'postgres://x', IMPORTER_PACK_CONFIRM: 'oui' })).toEqual({ ok: true, mode: 'importer', ecrire: false });
    expect(decider({ DATABASE_URL: 'postgres://x', IMPORTER_PACK_CONFIRM: CONFIRMATION })).toEqual({ ok: true, mode: 'importer', ecrire: true });
    expect(decider({ IMPORTER_PACK_MODE: 'embarquer' })).toEqual({ ok: true, mode: 'embarquer' });
    expect(decider({ IMPORTER_PACK_MODE: 'activer', DATABASE_URL: 'postgres://x' }).ok).toBe(false);
  });
});

describe('environnement · le drapeau de recette ne vaut que sur une base locale', () => {
  it.each([
    [{}, 'production'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: '1' }, 'production'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://tiktrends:x@db:5432/tiktrends' }, 'production'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://p@10.0.0.4:5432/t' }, 'production'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: 'oui', DATABASE_URL: 'postgres://postgres@127.0.0.1:5433/l2' }, 'production'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'pas une url' }, 'production'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://postgres@127.0.0.1:5433/l2' }, 'test'],
    [{ STUDIOS_PROMPTS_RECETTE_LOCALE: '1', DATABASE_URL: 'postgres://postgres@localhost/l2' }, 'test'],
  ])('%j → %s', (env, attendu) => {
    expect(environnementPrompts(env as Record<string, string>)).toBe(attendu);
  });
});

describe('correspondance', () => {
  it('versions · codage injectif et croissant, bornes refusées', () => {
    const v = ['1.0.0', '1.0.1', '1.0.999', '1.1.0', '1.10.0', '2.0.0', '10.0.0'];
    const n = v.map((x) => versionVersEntier(x)!);
    expect([...n].sort((a, b) => a - b)).toEqual(n);
    expect(n.map(entierVersVersion)).toEqual(v);
    expect([versionVersEntier('1.1000.0'), versionVersEntier('0.0.0'), versionVersEntier('2147.0.0'), versionVersEntier('1.0')]).toEqual([null, null, null, null]);
    expect(versionSuivante(['1.0.0', '1.0.3', '1.0.2'])).toBe('1.0.4');
    expect(versionSuivante([])).toBe('1.0.0');
  });

  it('empreinte de release · égale au noyau sans conversation, change avec UNE phrase de Jarvis', () => {
    const pack = 'a'.repeat(64);
    expect(empreinteReleaseComplete(pack, [])).toBe(pack);
    const p1 = validerPolitiqueConversation(POLITIQUE_JARVIS_1_0_0);
    if (!p1.ok) throw new Error('politique');
    const p2 = { ...p1.politique, sections: { ...p1.politique.sections, socle: `${p1.politique.sections.socle} ` } };
    const h1 = empreinteReleaseComplete(pack, [p1.politique]);
    expect(h1).not.toBe(pack);
    expect(empreinteReleaseComplete(pack, [p2])).not.toBe(h1);
  });

  it('entrées de release · une forme bancale est refusée', () => {
    const e = { cle: 'k', version: '1.0.0', contentHash: 'h' };
    expect(lireEntrees({ templates: [e], recettes: [], conversations: [], socle: e, rendu: e, packHash: 'a'.repeat(64) })).not.toBeNull();
    expect(lireEntrees({ templates: [e], recettes: [], socle: e, rendu: e, packHash: 'a'.repeat(64) })).toBeNull();
    expect(lireEntrees({ templates: [e], recettes: [], conversations: [], socle: e, rendu: e, packHash: 'x' })).toBeNull();
  });
});

describe('traces · liste blanche', () => {
  it('seuls les champs autorisés traversent, les noms de sources pour l’utilisateur', () => {
    const r = expurgerRun({
      id: 'r', workspaceId: 'w', brandId: 'b', projectId: null, jobId: null, templateKey: 'k', promptVersionId: null, promptReleaseId: 'rel',
      compiledHash: 'c', contextSnapshotHash: 'd', model: 'm', documentVersionId: null, outputHash: null, latencyMs: 5, costUsdMicros: 1500, credits: null,
      status: 'succeeded', traceId: 't', createdAt: '2026-10-07T10:00:00Z',
      sourceRefs: [{ type: 'connaissance', id: 'k1', version: 'v', titre: 'Ton', texte: 'TEXTE_INTERDIT' }, { type: 'memoire', id: 'b', version: 'h', titre: 'Mémoire' }],
      config: { releaseHash: 'x', prompt: 'TEXTE_INTERDIT', reponse: 'TEXTE_INTERDIT' },
    });
    expect(JSON.stringify(r)).not.toContain('TEXTE_INTERDIT');
    expect(r.coutUsd).toBe(0.0015);
    expect(nomsSourcesUtiles(r.sources)).toEqual(['Ton']);
  });
});

describe('diff', () => {
  it('ligne ajoutée, retirée, conservée', () => {
    expect(diffLignes('a\nb\nc', 'a\nc\nd')).toEqual([{ op: '=', texte: 'a' }, { op: '-', texte: 'b' }, { op: '=', texte: 'c' }, { op: '+', texte: 'd' }]);
  });
});

/* ─────────────────────── Frontière client et texte en dur ────────────────── */

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(p);
  }
  return out;
}
const RACINE = process.cwd();
const sources = [...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'components')), ...fichiers(join(RACINE, 'lib'))]
  .map((p) => ({ p: p.slice(RACINE.length + 1), s: readFileSync(p, 'utf8') }));

describe('frontière client et prompts concurrents (PROMPT-12)', () => {
  it('aucun composant client n’importe le registre (Ajv, contenus, dépôt)', () => {
    const fautifs = sources.filter((f) => /^\s*['"]use client['"]/m.test(f.s) && /lib\/studios\/prompts\/(?!.*\btypes?\b)|@tiktrends\/core\/src\/prompts/.test(f.s)).map((f) => f.p);
    expect(fautifs, `composant client qui importe le registre : ${fautifs.join(', ')}`).toEqual([]);
  });

  it('le noyau du registre n’est importé par chemin profond que depuis noyau.ts', () => {
    const fautifs = sources.filter((f) => f.s.includes('@tiktrends/core/src/prompts') && !f.p.endsWith(join('lib', 'studios', 'prompts', 'noyau.ts'))).map((f) => f.p);
    expect(fautifs).toEqual([]);
  });

  it('la route Jarvis n’assemble plus de consigne codée en dur', () => {
    const route = readFileSync(join(RACINE, 'app/api/jarvis/chat/route.ts'), 'utf8');
    expect(route).not.toMatch(/chatSystemPrompt/);
    expect(route).toMatch(/resoudreConversationJarvis/);
  });

  it('aucun texte de consigne Jarvis ni du pack hors du registre et de sa source', () => {
    const phrases = ['Tu es Jarvis, le stratège créatif', 'Tu es un composant de TikTrends', 'Identifie la demande et sa cible explicite'];
    const permis = [join('lib', 'studios', 'prompts', 'pack-embarque.ts'), join('lib', 'studios', 'prompts', 'complement-tiktrends.ts')];
    const fautifs = sources.filter((f) => !permis.some((p) => f.p.endsWith(p)) && phrases.some((ph) => f.s.includes(ph))).map((f) => f.p);
    expect(fautifs, `texte de prompt codé en dur : ${fautifs.join(', ')}`).toEqual([]);
  });
});
