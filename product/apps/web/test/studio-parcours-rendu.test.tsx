// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { DetailProjet } from '../lib/studios/sources/projet';
import { liensAtelierProjet } from '../lib/navigation';
import { ParcoursProjet } from '../components/studios/projet/ParcoursProjet';
import { ConceptHote } from '../components/studios/projet/ConceptHote';
import { VueProjet } from '../components/studios/projet/VueProjet';
const ecran = vi.hoisted(() => ({ mobile: false }));
vi.mock('../components/useIsMobile', () => ({ useIsMobile: () => ecran.mobile }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push() {}, replace() {}, refresh() {} }) }));
const detail: DetailProjet = {
  projet: { id: 'projet-demo', brandId: 'marque-demo', marque: 'Enissati Cosmetics', title: 'Hydra Complex · une routine lissante à la maison', kind: 'image', libelleType: 'Image', status: 'draft', createdAt: '2026-10-21', updatedAt: '2026-10-21' },
  version: { id: 'version-demo', n: 2, createdAt: '2026-10-21', contentHash: 'test' },
  brief: { objective: 'Présenter le soin', audience: '', hypothesisId: null, testedVariable: '', facts: [], invariants: [], variables: [], references: [], composition: 'Flacon au centre sur fond rose', styleIntent: 'Lumière douce', texts: ['Hydra Complex'], formats: ['4:5'], exclusions: [] },
  briefIllisible: false, hypothese: null,
  produit: { productId: 'produit-demo', assetId: null, nom: 'Hydra Complex', faits: [], manques: [], photoDisponible: true, instantaneLe: '2026-10-21' },
  sources: [], sourcesIllisibles: 0, droitsAssets: [], completude: { etape: 'production', libelleEtape: 'En production', manques: [] },
  versions: [{ id: 'version-demo', n: 2, createdAt: '2026-10-21', reason: '', contentHash: 'test', courante: true }],
};
const atelier = liensAtelierProjet(detail.projet.id, () => true);
function dom(d = detail, active = true, exportAutorise = true) {
  const el = document.createElement('div');
  el.innerHTML = renderToStaticMarkup(<ParcoursProjet detail={d} atelier={atelier} exportAutorise={exportAutorise} generationActive={active} />);
  return el;
}
describe('prochaine étape visible du projet', () => {
  it('brief présent : un CTA vers atelier, format et photos, devis avant lancement', () => {
    const el = dom(); expect(el.querySelectorAll('[data-action-principale]')).toHaveLength(1);
    expect(el.querySelector('[data-action-principale]')?.getAttribute('href')).toBe('/studio/projets/projet-demo/image');
    expect(el.textContent).toContain('Hydra Complex'); expect(el.textContent).toContain('4:5'); expect(el.textContent).toContain('devis avant de lancer');
    expect(el.querySelector('a[href="/studio/projets/projet-demo/produit"]')).not.toBeNull();
  });
  it('brief absent : prépare avec Jarvis', () => {
    const el = dom({ ...detail, brief: null, produit: null });
    expect(el.querySelector('[data-action-principale]')?.getAttribute('href')).toBe('#conversation-projet'); expect(el.textContent).toContain('à préciser si nécessaire');
  });
  it('génération fermée et export interdit : aucun CTA génération ni lien export', () => {
    const el = dom(detail, false, false);
    expect(el.querySelector('[data-action-principale]')?.textContent).toBe('Préparer avec Jarvis'); expect(el.textContent).not.toContain('Générer l’image');
    expect(el.querySelector('a[href$="/export"]')).toBeNull(); expect(el.querySelector('[role="status"]')?.textContent).toContain('pas activée');
  });
  it('ancienne version et brief illisible : retour courant et erreur visibles', () => {
    const el = dom({ ...detail, briefIllisible: true, versions: [{ ...detail.versions[0]!, courante: false }] });
    expect(el.querySelector('[data-action-principale]')?.textContent).toBe('Reprendre la version courante'); expect(el.querySelector('[role="alert"]')?.textContent).toContain('illisible');
  });
});
it('harness local composants réels, données synthétiques', async () => {
  if (!process.env.PARCOURS_PREVIEW_DIR) return;
  const { writeFileSync, mkdirSync, readFileSync } = await import('node:fs'); const { resolve } = await import('node:path');
  const cible = process.env.PARCOURS_PREVIEW_DIR; mkdirSync(cible, { recursive: true });
  const tokens = readFileSync(resolve(__dirname, '../../../packages/ui/tokens.css'), 'utf8'); const global = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8').replace(/^@import.*$/gm, '');
  for (const mobile of [false, true]) {
    ecran.mobile = mobile;
    const html = renderToStaticMarkup(<main style={{ maxWidth: 1200, margin: '0 auto', padding: mobile ? 16 : 28 }}>
      <ParcoursProjet detail={detail} atelier={atelier} exportAutorise generationActive />
      <div id="conversation-projet"><ConceptHote projectId={detail.projet.id} brandName={detail.projet.marque} kind="image" generationImageActive versionCourante={{ id: 'version-demo', n: 2 }} initialThread={null} /></div>
      <details style={{ marginTop: 20, padding: 18, border: '1px solid var(--line-2)', borderRadius: 12 }}><summary style={{ minHeight: 44 }}>Détails et outils du projet</summary><VueProjet detail={detail} atelier={atelier} exportAutorise masquerPropositions masquerEntete /></details>
      <details style={{ marginTop: 18, padding: 18, border: '1px solid var(--line-2)', borderRadius: 12 }}><summary style={{ minHeight: 44 }}>Ouvrir le canvas</summary></details>
    </main>);
    writeFileSync(`${cible}/${mobile ? 'mobile' : 'desktop'}.html`, `<!doctype html><html lang="fr" data-theme="clair"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Recette locale · données synthétiques</title><style>${tokens}\n${global}\nbody{margin:0;background:var(--bg);color:var(--ink);font-family:Arial,sans-serif}*{box-sizing:border-box}</style><body>${html}</body></html>`);
  }
  ecran.mobile = false;
});
