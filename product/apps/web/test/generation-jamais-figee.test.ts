import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Une génération qui échoue ne fige jamais le bouton en silence.
 *
 * ── L'incident que ce garde ferme ────────────────────────────────────────────
 *
 * Le bouton reste sur « Génération… » tant que `busy` est vrai. Les actions
 * serveur RENVOIENT normalement { error }, et alors tout se dénoue. Mais si
 * l'une LÈVE au lieu de renvoyer — coupure réseau, exception du fournisseur non
 * rattrapée, délai de la requête serveur — le `await` propage, `setBusy(false)`
 * était sauté, et l'appelant n'attrapait pas. Une seule exception figeait le
 * bouton POUR TOUJOURS, sans un mot · rapporté comme « l'outil ne fonctionne
 * plus ».
 *
 * On vérifie donc deux invariants du lanceur `run` :
 *  1. `busy` est remis à faux dans un `finally` · impossible à sauter, quel que
 *     soit le chemin de sortie ;
 *  2. une exception rend l'échec VISIBLE · un message est posé, pas un silence.
 */

const STUDIO = readFileSync(join(process.cwd(), 'app/(app)/studio/ads/AdsStudio.tsx'), 'utf8');

describe('run rend toujours la main', () => {
  it('remet busy à faux dans un finally · jamais sauté sur une exception', () => {
    // `setBusy(false)` est la PREMIÈRE chose du finally · d'autres nettoyages
    // peuvent suivre (retrait de l'indicateur de génération), mais la main est
    // rendue d'abord, et dans un finally impossible à sauter.
    expect(STUDIO).toMatch(/finally\s*\{\s*setBusy\(false\);/);
  });

  it('capture l’exception, POSE le message ET le câble à l’écran', () => {
    // Trois maillons, chacun cassable seul · l'ancienne version ne gardait que
    // le deuxième (« la string existe »), si bien que couper le troisième
    // (erreur={''}) laissait le garde vert alors que RIEN ne s'affichait.
    //
    // 1. le catch POSE le message (setError) avant le finally · il n'avale pas ;
    //    l'ancrage `catch (e) { … setError(message); … } finally {` tombe si on
    //    retire le setError du catch.
    expect(STUDIO).toMatch(/catch \(e\) \{[\s\S]*?setError\(message\);[\s\S]*?\} finally \{/);
    // 2. le message DIT l'échec, pas un silence.
    expect(STUDIO).toMatch(/const message = `La génération s['’]est interrompue/);
    // 3. l'état d'erreur est CÂBLÉ à la fenêtre visible · sans ce fil, le message
    //    est posé mais jamais rendu. La visibilité d'un `erreur` non vide est
    //    elle-même prouvée par le rendu HTML d'assistant-rendu.
    expect(STUDIO).toMatch(/erreur=\{error\}/);
  });
});
