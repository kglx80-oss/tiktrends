import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Le garde de dépense ne vaut que s'il est INCONTOURNABLE.
 *
 * Le dépôt compte une trentaine de points d'appel payants. Un garde qu'il faut
 * penser à invoquer finit toujours par être oublié au suivant · et c'est
 * celui-là qui fait la facture. Ce test échoue si quelqu'un réintroduit un
 * chemin direct vers un fournisseur payant.
 *
 * Il lit les fichiers plutôt que d'exécuter du code : c'est la seule façon de
 * vérifier une propriété qui porte sur TOUT le dossier, y compris sur des
 * fichiers qui n'existent pas encore.
 */

const RACINE = join(__dirname, '..');
const GARDE = join('lib', 'spend-guard.ts');

function fichiers(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next' || e === 'test') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) fichiers(p, out);
    else if (p.endsWith('.ts') || p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const sources = [...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'lib'))]
  .filter((p) => !p.endsWith(GARDE))
  .map((p) => ({ p: p.slice(RACINE.length + 1), s: readFileSync(p, 'utf8') }));

describe('aucun chemin ne contourne le plafond de dépense', () => {
  it('personne n’instancie le client Anthropic directement', () => {
    // `guardedAnthropic` est le seul point d'entrée · lui seul compte les dollars.
    const coupables = sources.filter((f) => /anthropicFromEnv|new Anthropic\(/.test(f.s)).map((f) => f.p);
    expect(coupables, `utilise le client brut au lieu de guardedAnthropic : ${coupables.join(', ')}`).toEqual([]);
  });

  it('chaque appel image/vidéo payant passe par l’enveloppeur', () => {
    // La génération d'image et de vidéo se facture au coup · sans garde, un
    // bouton cliqué en boucle passe la facture sans que rien ne l'arrête.
    //
    // On exige `sousPlafond`, pas `guardFixedCost` · le premier retient ET rend,
    // le second ne fait que retenir. Six points d'appel utilisaient le second :
    // chacun comptait 0,08 $ (0,60 $ en vidéo) même quand le fournisseur
    // refusait la demande à la porte sans rien produire. Un plafond dur de 10 $
    // se vidait ainsi en quelques lots ratés, sans qu'une seule image ne sorte.
    //
    // « Penser à rendre la dépense » est une consigne qu'on applique cinq fois
    // sur six · la sixième est celle qui verrouille le produit.
    //
    // Higgsfield (hfSubmitVideo / hfSubmitImageVideo) est un fournisseur vidéo
    // payant au même titre que fal · il sert de repli quand FAL_KEY manque. Il
    // était absent de ce garde : ses appels SONT enveloppés aujourd'hui, mais un
    // futur appel Higgsfield ajouté sans `sousPlafond` serait passé au vert. La
    // barrière de TEST doit couvrir tout ce qui coûte, pas seulement fal.
    const APPEL_PAYANT = /falGenerateImage\(|falSubmitVideo\(|falSubmitImageVideo\(|hfSubmitVideo\(|hfSubmitImageVideo\(/;
    const coupables = sources
      .filter((f) => APPEL_PAYANT.test(f.s) && !/sousPlafond\(/.test(f.s))
      .map((f) => f.p);
    expect(coupables, `appelle un moteur image/vidéo payant sans sousPlafond : ${coupables.join(', ')}`).toEqual([]);
  });

  it('personne ne retient une dépense sans pouvoir la rendre', () => {
    // `guardFixedCost` seul est la moitié du contrat. Il reste exporté parce que
    // `sousPlafond` s'en sert · l'appeler ailleurs réintroduit la fuite.
    const coupables = sources.filter((f) => /guardFixedCost\(/.test(f.s)).map((f) => f.p);
    expect(coupables, `retient une dépense sans enveloppeur : ${coupables.join(', ')}`).toEqual([]);
  });

  it('le garde existe et exporte ce sur quoi le reste s’appuie', () => {
    const g = readFileSync(join(RACINE, GARDE), 'utf8');
    for (const nom of ['guardedAnthropic', 'guardFixedCost', 'sousPlafond', 'annuleCoutFixe', 'spendStatus', 'SpendBlockedError']) {
      expect(g, `${nom} n\u2019est plus export\u00e9`).toMatch(
        new RegExp(`export\\s+(async\\s+)?(function|class)\\s+${nom}\\b`),
      );
    }
  });
});

/* ── F-A · le worker et `packages/integrations` sont couverts aussi ─────────── */

/**
 * Le worker des studios dépense désormais (fournisseur fal réel). Il ne peut
 * pas importer `sousPlafond` du web : sa barrière est `sousPlafondStudio`
 * (`packages/integrations/src/plafond-depense.ts`, même règle, même table).
 * Ce bloc étend la garde à `apps/workers/src` et `packages/integrations/src` :
 *  · un appel aux fonctions payantes historiques hors de leur définition doit
 *    passer par une barrière (`sousPlafond` ou `sousPlafondStudio`) ;
 *  · tout fournisseur studio RÉEL (`implements FournisseurStudio`, `simule =
 *    false`) n'a qu'UNE soumission (`method: 'POST'`), et elle est DANS
 *    l'enveloppe `sousPlafondStudio` ;
 *  · un `fetch` vers la file fal (`queue.fal.run`, `urlSoumissionFal`) ailleurs
 *    que dans un fournisseur couvert est un contournement.
 * Le RÉSULTAT (plafond atteint ⇒ 0 requête) est prouvé par
 * `packages/integrations/test/fa-studios-fal.test.ts` et
 * `apps/workers/test/fa-worker-fal.test.ts`.
 */
const PRODUIT = join(RACINE, '..', '..');
const sourcesHorsWeb = [...fichiers(join(PRODUIT, 'apps', 'workers', 'src')), ...fichiers(join(PRODUIT, 'packages', 'integrations', 'src'))]
  .map((p) => ({ p: p.slice(PRODUIT.length + 1), s: readFileSync(p, 'utf8') }));

describe('aucun chemin du worker ni des intégrations ne contourne le plafond', () => {
  it('les dossiers sont bien lus (garde non vide)', () => {
    expect(sourcesHorsWeb.map((f) => f.p)).toEqual(expect.arrayContaining([
      join('apps', 'workers', 'src', 'studios', 'fournisseurs.ts'),
      join('packages', 'integrations', 'src', 'studios-fal.ts'),
    ]));
  });

  it('un appel payant historique hors de sa définition passe par une barrière', () => {
    const APPEL = /(?<!function\s)\b(falGenerateImage|falSubmitVideo|falSubmitImageVideo|hfSubmitVideo|hfSubmitImageVideo)\(/;
    const coupables = sourcesHorsWeb.filter((f) => APPEL.test(f.s) && !/sousPlafond(Studio)?\(/.test(f.s)).map((f) => f.p);
    expect(coupables, `appelle un moteur payant sans barrière : ${coupables.join(', ')}`).toEqual([]);
  });

  it('chaque fournisseur studio réel soumet UNE fois, et dans `sousPlafondStudio`', () => {
    const reels = sourcesHorsWeb.filter((f) => /implements\s+FournisseurStudio/.test(f.s) && /simule\s*=\s*false/.test(f.s));
    expect(reels.length, 'aucun fournisseur réel trouvé · la garde regarde-t-elle le bon endroit ?').toBeGreaterThan(0);
    for (const f of reels) {
      const posts = [...f.s.matchAll(/method:\s*'POST'/g)].map((m) => m.index!);
      const enveloppe = f.s.indexOf('sousPlafondStudio(');
      expect(posts.length, `${f.p} · une seule soumission attendue`).toBe(1);
      expect(enveloppe, `${f.p} · soumission sans sousPlafondStudio`).toBeGreaterThan(-1);
      // La soumission est dans le corps de l'appel enveloppé : après l'ouverture,
      // avant la fin de la méthode `soumettre` (la méthode suivante, `statut`).
      const finSoumettre = f.s.indexOf('async statut(');
      expect(posts[0]! > enveloppe && posts[0]! < finSoumettre, `${f.p} · la soumission est hors de l'enveloppe de dépense`).toBe(true);
    }
  });

  it('aucune soumission à la file fal en dehors d’un fournisseur couvert', () => {
    const coupables = sourcesHorsWeb
      // `fal.ts` (bibliothèque historique) porte l'URL par défaut ; ses points
      // d'appel sont gardés plus haut. Ici : le constructeur d'URL de soumission
      // studio, et toute adresse fal écrite dans le worker.
      .filter((f) => /urlSoumissionFal\(/.test(f.s) || (f.p.startsWith(join('apps', 'workers')) && /fal\.run/.test(f.s)))
      .filter((f) => !(/implements\s+FournisseurStudio/.test(f.s) && /sousPlafondStudio\(/.test(f.s)))
      .map((f) => f.p);
    expect(coupables, `soumet à la file fal hors barrière : ${coupables.join(', ')}`).toEqual([]);
  });
});

/* ── R2 · UNE réservation pour tous les chemins payants ─────────────────────── */

/**
 * Contre-recette du 8 octobre (P1) : le site lisait la somme puis écrivait sa
 * ligne `ai_spend` sans le verrou du worker, et Anthropic l'écrivait APRÈS
 * l'appel. « Une table commune n'est pas un verrou commun. »
 *
 * Le RÉSULTAT (course mixte : la somme ne dépasse jamais le plafond ; la
 * réservation existe pendant l'appel) est prouvé par
 * `fa-reservation-commune.test.ts` (pglite) et `fa-course-mixte-pg.test.ts`
 * (PostgreSQL réel). Cette garde-ci rend le contournement visible partout, y
 * compris dans un fichier ajouté demain :
 *  · une ligne `ai_spend` ne s'ÉCRIT (insertion, mise à jour) que dans
 *    `packages/db/src/plafond-depense.ts` (réservation sous verrou, règlement,
 *    libération) ;
 *  · la barrière du site passe par `reserverDepense` ;
 *  · aucune méthode payante du client Anthropic autre que `messages.create`
 *    (seule gardée) n'est appelée.
 */
const MODULE_RESERVATION = join('packages', 'db', 'src', 'plafond-depense.ts');
const toutesSources = [
  ...fichiers(join(RACINE, 'app')), ...fichiers(join(RACINE, 'lib')),
  ...fichiers(join(PRODUIT, 'apps', 'workers', 'src')),
  ...['core', 'db', 'integrations', 'ai', 'ui'].flatMap((p) => fichiers(join(PRODUIT, 'packages', p, 'src'))),
].map((p) => ({ p: p.slice(PRODUIT.length + 1), s: readFileSync(p, 'utf8') }));

describe('une seule réservation pour tous les chemins payants', () => {
  it('les dossiers sont bien lus (garde non vide)', () => {
    expect(toutesSources.map((f) => f.p)).toEqual(expect.arrayContaining([
      join('apps', 'web', 'lib', 'spend-guard.ts'), MODULE_RESERVATION,
      join('apps', 'workers', 'src', 'studios', 'fournisseurs.ts'),
      join('packages', 'integrations', 'src', 'plafond-depense.ts'),
    ]));
  });

  it('une ligne ai_spend ne s’écrit que dans le module de réservation', () => {
    const ECRITURE = /\.(insert|update)\(\s*(schema\.)?aiSpend\b|(insert\s+into|update)\s+"?ai_spend"?/i;
    const coupables = toutesSources.filter((f) => f.p !== MODULE_RESERVATION && ECRITURE.test(f.s)).map((f) => f.p);
    expect(coupables, `écrit ai_spend hors de la réservation commune (verrou, règlement, libération) : ${coupables.join(', ')}`).toEqual([]);
    // Le module de réservation lui-même écrit bien sous le verrou commun.
    const m = toutesSources.find((f) => f.p === MODULE_RESERVATION)!.s;
    expect(m, 'la réservation ne prend plus le verrou consultatif').toMatch(/pg_advisory_xact_lock\(\$\{VERROU_PLAFOND\}\)/);
  });

  it('la barrière du site réserve par la fonction commune', () => {
    const g = readFileSync(join(RACINE, GARDE), 'utf8');
    expect(g, 'spend-guard.ts ne passe plus par reserverDepense').toMatch(/\breserverDepense\(/);
    expect(g, 'spend-guard.ts règle Anthropic hors de reglerDepense').toMatch(/\breglerDepense\(/);
  });

  it('aucune méthode payante du client Anthropic hors de messages.create', () => {
    const AUTRE = /\.beta\.(messages|prompt)|\.messages\.batches\b|\.completions\.create\(/;
    const coupables = toutesSources.filter((f) => AUTRE.test(f.s)).map((f) => f.p);
    expect(coupables, `appelle une méthode payante non gardée du client Anthropic : ${coupables.join(', ')}`).toEqual([]);
  });
});
