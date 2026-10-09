import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { redirect } from 'next/navigation';
import { desc } from 'drizzle-orm';
import { db, schema } from '@tiktrends/db';
import { ecranReconciliation, type EcranReconciliation, type EcranReconciliees } from '@tiktrends/core';
import { spendStatus, spendByAction, depensesAReconcilier, depensesReconciliees } from '../../../../lib/spend-guard';
import { cadrePage, surface, h1 } from '../../../../components/ui';
import { SectionReconciliation } from './SectionReconciliation';
import { SectionReconciliees } from './SectionReconciliees';
import { porteDepenses } from './porte';

export const dynamic = 'force-dynamic';

/**
 * Dépense réelle chez les fournisseurs d'IA · fondateur uniquement.
 *
 * À ne pas confondre avec /usage, qui montre les CRÉDITS : la comptabilité
 * interne facturée au client. Cette page-ci montre les dollars qui partent
 * vraiment et qui arrivent sur une facture à la fin du mois.
 *
 * Elle existe pour une raison simple : un plafond dont on ne voit pas le
 * compteur n'est pas rassurant, il est inquiétant · on ne sait jamais s'il reste
 * de la marge ou si tout est bloqué depuis hier.
 *
 * R4 · elle montre aussi les dépenses « à réconcilier » (issue incertaine,
 * gardées au maximum, R3) et ce qu'il faut en faire. Lecture seule : la
 * consulter n'écrit rien. La porte ne change pas · admin de l'espace ET
 * fondateur (plateforme) ; un admin d'espace seul est renvoyé ailleurs AVANT
 * toute lecture.
 *
 * R5 · chaque ligne à réconcilier porte le geste de réconciliation (montant
 * facturé, devise, preuve, motif ; action `reconcilierDepenseAction`, même
 * porte), et l'historique « Réconciliées » suit. Le compteur retient le
 * montant facturé d'une ligne réconciliée (`spentUsd` → `depenseDepuis`).
 */
type ParametresDepenses = Record<string, string | string[] | undefined>;
// Deux signatures · Next lit la dernière (props de page) ; un rendu de test appelle la page sans argument.
export default function DepensesPage(): Promise<React.JSX.Element>;
export default function DepensesPage(props: { searchParams?: Promise<ParametresDepenses> }): Promise<React.JSX.Element>;
export default async function DepensesPage(props?: { searchParams?: Promise<ParametresDepenses> }): Promise<React.JSX.Element> {
  const porte = await porteDepenses();
  if (!porte.ok) redirect(porte.vers);
  const q = (await props?.searchParams) ?? {};
  const vientDe = typeof q.reconciliee === 'string' ? q.reconciliee : null;

  const [status, parAction, recentes, reconciliation, historique] = await Promise.all([
    spendStatus(),
    spendByAction(12),
    db
      ? db.select().from(schema.aiSpend).orderBy(desc(schema.aiSpend.createdAt)).limit(25)
      : Promise.resolve([]),
    lireReconciliation(),
    lireHistorique(),
  ]);
  // R5 · une clé d'idempotence par ligne et par rendu : la même soumission rejouée rend la même réconciliation.
  const cles = Object.fromEntries((reconciliation.ecran?.lignes ?? []).map((l) => [l.id, randomUUID()]));

  const pct = status.capUsd > 0 ? Math.min(100, Math.round((status.spentUsd / status.capUsd) * 100)) : 100;
  const usd = (n: number) => `${n.toFixed(n < 1 ? 4 : 2)} $`;
  const alerte = pct >= 80;

  return (
    <main style={cadrePage}>
      <h1 style={{ ...h1, marginBottom: 4 }}>Dépense IA réelle</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, marginTop: 6, marginBottom: 22, maxWidth: 720, lineHeight: 1.6 }}>
        Les dollars qui partent vraiment chez Anthropic et fal, sur 30 jours glissants. À ne pas
        confondre avec <Link href="/usage" style={{ color: 'var(--accent-strong)' }}>les crédits</Link>, qui
        sont la comptabilité interne facturée au client. Le plafond s’applique à <b>tout le monde</b>,
        comptes à crédits illimités compris.
      </p>

      {/* Compteur */}
      <div style={{
        border: `1px solid ${alerte ? 'rgba(254,44,85,.35)' : 'var(--line)'}`, borderRadius: surface.borderRadius,
        background: 'var(--surface)', padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: alerte ? '#ff8095' : 'var(--ink)', lineHeight: 1 }}>
            {usd(status.spentUsd)}
          </span>
          <span style={{ fontSize: 14, color: 'var(--muted)' }}>sur un plafond de {usd(status.capUsd)}</span>
          <span style={{ flex: 1 }} />
          {status.blocked && (
            <span style={{ padding: '3px 11px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, color: '#ff8095', border: '1px solid rgba(254,44,85,.4)' }}>
              BLOQUÉ
            </span>
          )}
        </div>
        <div style={{ height: 8, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden', marginTop: 12 }}>
          <div style={{
            width: `${pct}%`, height: '100%', borderRadius: 999,
            background: alerte ? 'linear-gradient(90deg,#ff6b81,#fe2c55)' : 'var(--grad-accent)',
          }} />
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: alerte ? '#ffcf8f' : 'var(--ink-2)', lineHeight: 1.55 }}>
          {status.summary}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--muted)', lineHeight: 1.5 }}>
          Le plafond se règle avec <code style={code}>AI_SPEND_CAP_USD</code> dans <code style={code}>.env.deploy</code>.
          Au-delà, aucune requête payante ne part · le blocage est dur, pas un avertissement.
        </p>
      </div>

      {/* R4 · ce qui reste à rapprocher de la facture · avant le détail, c'est ce qui demande un geste. */}
      <SectionReconciliation ecran={reconciliation.ecran} erreur={reconciliation.erreur} cles={cles} />
      <SectionReconciliees ecran={historique.ecran} erreur={historique.erreur} vientDe={vientDe} deja={q.deja === '1'} />

      {/* Où part l'argent */}
      <h2 style={titre}>Où part l’argent</h2>
      {parAction.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Aucune dépense enregistrée sur la période.</p>
      ) : (
        <div style={{ display: 'grid', gap: 7 }}>
          {parAction.map((a) => {
            const part = status.spentUsd > 0 ? (a.usd / status.spentUsd) * 100 : 0;
            return (
              <div key={a.action} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 190, fontSize: 12.5, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.action}</span>
                <div style={{ flex: 1, height: 8, background: 'var(--paper)', borderRadius: 999, overflow: 'hidden' }}>
                  <div style={{ width: `${part}%`, height: '100%', borderRadius: 999, background: 'var(--grad-accent)' }} />
                </div>
                <span style={{ width: 74, textAlign: 'right', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>{usd(a.usd)}</span>
                <span style={{ width: 62, textAlign: 'right', fontSize: 11.5, color: 'var(--muted)' }}>{a.calls} appel(s)</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Détail */}
      <h2 style={titre}>25 derniers appels</h2>
      {recentes.length === 0 ? (
        <p style={{ fontSize: 12.5, color: 'var(--muted)' }}>Rien pour l’instant.</p>
      ) : (
        <div style={{ overflowX: 'auto', ...surface, background: 'var(--surface)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700, fontSize: 12 }}>
            <thead>
              <tr>{['Quand', 'Fournisseur', 'Modèle', 'Poste', 'Jetons', 'Coût'].map((h) => (
                <th key={h} style={th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {recentes.map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {(r.createdAt as Date).toLocaleString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td style={td}>{r.provider}</td>
                  <td style={{ ...td, color: 'var(--muted)' }}>{r.model ?? '—'}</td>
                  <td style={td}>{r.action}</td>
                  <td style={{ ...td, color: 'var(--muted)', whiteSpace: 'nowrap' }}>
                    {r.inputTokens !== null ? `${r.inputTokens} → ${r.outputTokens ?? 0}` : '—'}
                  </td>
                  <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{usd(r.actualUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

/** Lecture des lignes à réconcilier · un échec s'affiche (état « lecture impossible »), il ne casse pas la page. */
async function lireReconciliation(): Promise<{ ecran: EcranReconciliation | null; erreur: string | null }> {
  try {
    return { ecran: ecranReconciliation(await depensesAReconcilier()), erreur: null };
  } catch (e) {
    console.error('[depenses] lecture des lignes à réconcilier', e instanceof Error ? e.message : e);
    return { ecran: null, erreur: 'erreur de lecture en base' };
  }
}

/** R5 · historique des réconciliations · même règle : un échec se dit, la page tient. */
async function lireHistorique(): Promise<{ ecran: EcranReconciliees | null; erreur: string | null }> {
  try {
    return { ecran: await depensesReconciliees(), erreur: null };
  } catch (e) {
    console.error('[depenses] lecture des réconciliations', e instanceof Error ? e.message : e);
    return { ecran: null, erreur: 'erreur de lecture en base' };
  }
}

const titre = { margin: '26px 0 12px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' } as const;
const code = { fontFamily: 'ui-monospace, monospace', fontSize: 11, background: 'var(--paper)', padding: '1px 5px', borderRadius: 5 } as const;
const th = {
  textAlign: 'left', padding: '9px 12px', fontSize: 10.5, fontWeight: 700, letterSpacing: '.04em',
  textTransform: 'uppercase', color: 'var(--muted)', borderBottom: '1px solid var(--line)', whiteSpace: 'nowrap',
} as const;
const td = { padding: '8px 12px', borderTop: '1px solid var(--line)', color: 'var(--ink-2)' } as const;
