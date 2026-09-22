import type { DeploymentState } from '@tiktrends/core';
import { Icon } from './Icon';

/**
 * Ce que le serveur exécute VRAIMENT · dans le panneau de diagnostic (CDC v7 · lot 0).
 *
 * Une grille rapportée cassée venait d'un build antérieur au correctif · rien
 * dans le produit ne disait quelle version tournait, et chaque rapport de bug
 * devenait une enquête. Ce panneau réconcilie code et production · commit du
 * build, version de maquette, retard de migrations, dit en clair. L'état porte
 * un texte ET une icône ET une couleur · jamais la couleur seule.
 */
function etatVisuel(etat: DeploymentState): { libelle: string; fg: string; bord: string; icone: string } {
  // Schéma appliqué à jour ET commit servi identifié · le meilleur état que le
  // produit peut CONSTATER seul. Il ne prouve pas que ce commit est le dernier
  // (origin/main) · le badge le dit précisément plutôt qu'un « À jour » qui
  // laisserait croire le code forcément à jour (CDC v8 · F09).
  if (etat.ok) return { libelle: 'Schéma à jour · commit identifié', fg: '#18cc8c', bord: 'rgba(24,204,140,.45)', icone: 'check' };
  if (etat.applied === null) return { libelle: 'État illisible', fg: 'var(--muted)', bord: 'var(--line-2)', icone: 'help' };
  if (etat.behind && etat.behind > 0) return { libelle: 'Migrations en attente', fg: '#ff9db0', bord: 'rgba(255,77,109,.55)', icone: 'alert' };
  if (etat.ahead) return { libelle: 'Base en avance', fg: '#ffca6b', bord: 'rgba(255,202,107,.5)', icone: 'alert' };
  // Schéma à jour mais commit inconnu · on ne peut pas afficher un vert « À jour »
  // qui laisserait croire le CODE à jour · schéma à jour ≠ code à jour (F09).
  if (!etat.codeIdentifie && etat.behind === 0 && !etat.ahead) {
    return { libelle: 'Schéma à jour · code non identifié', fg: '#ffca6b', bord: 'rgba(255,202,107,.5)', icone: 'alert' };
  }
  return { libelle: 'À vérifier', fg: 'var(--muted)', bord: 'var(--line-2)', icone: 'help' };
}

export function DiagnosticDeploiement({ etat, builtAt }: { etat: DeploymentState; builtAt?: string | null }) {
  const v = etatVisuel(etat);
  const cases: Array<{ k: string; val: string; coupe?: boolean }> = [
    { k: 'Commit du build', val: etat.build || 'inconnu', coupe: true },
    { k: 'Maquette', val: `v${etat.renderVersion}` },
    { k: 'Migrations', val: `${etat.applied ?? '—'} / ${etat.inBuild}` },
    { k: 'Build', val: builtAt ? new Date(builtAt).toLocaleString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—' },
  ];
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Diagnostic du déploiement</h3>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 999, color: v.fg, border: `1px solid ${v.bord}` }}>
          <span aria-hidden style={{ display: 'inline-flex' }}><Icon name={v.icone} size={13} /></span>{v.libelle}
        </span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{etat.summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {cases.map((c) => (
          <div key={c.k} style={{ border: '1px solid var(--line)', borderRadius: 12, background: 'var(--bg)', padding: '10px 12px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 4 }}>{c.k}</div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', wordBreak: c.coupe ? 'break-all' : 'normal' }}>{c.val}</div>
          </div>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
        Compare ce commit à <b>origin/main</b> pour savoir si le correctif attendu est en ligne · un écart explique un défaut « déjà corrigé » qui persiste en production.
      </p>
    </div>
  );
}
