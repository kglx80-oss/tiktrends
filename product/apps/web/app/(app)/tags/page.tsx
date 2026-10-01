import { fixtures } from '@tiktrends/integrations';
import { topCreativeTags, personaHookMatrix, type TaggedCreative } from '@tiktrends/core';
import { PageInfo } from '../../../components/PageInfo';
import { Bandeau } from '../../../components/Bandeau';
import { cadrePage } from '../../../components/ui';

const creatives = (fixtures.tagged as { creatives: TaggedCreative[] }).creatives;
const DIMS = [['hook_type', 'Type de hook'], ['persona', 'Persona'], ['angle', 'Angle'], ['emotion', 'Émotion']] as const;

export default function Tags() {
  const matrix = personaHookMatrix(creatives).slice(0, 5);
  const max = (arr: { weightedMetric: number }[]) => Math.max(1, ...arr.map((x) => x.weightedMetric));
  return (
    <main style={{ minHeight: '100vh', ...cadrePage }}>
      <h1 style={{ fontSize: 'clamp(28px, 4vw, 32px)', fontWeight: 500, color: 'var(--ink)' }}>Top Creative Tags</h1>
      <p style={{ color: 'var(--ink-2)', fontSize: 13, margin: '6px 0 22px' }}>
        Analyse par ingrédient créatif (métrique cible : ROAS, pondérée par le spend). La combinaison gagnante persona × hook en un coup d'œil.
      </p>

      {/* Toute cette page est calculée sur un échantillon FIXE · aucun compte
          branché ne l'alimente (la page ne lit que `fixtures.tagged`). On ne
          promet donc pas qu'une connexion active l'analyse (recette #106). */}
      <Bandeau ton="demo" titre="Mode démonstration">
        Ces tags portent sur un échantillon d’exemple. L’analyse de tes propres créas n’est pas encore disponible ici.
      </Bandeau>

      <PageInfo title="lire tes tags créatifs">
        Le Tagging décompose des créas en ingrédients (type de hook, persona, angle, émotion) et mesure leur
        performance moyenne pondérée par la dépense · ici sur un échantillon d’exemple. La matrice <b>persona × hook</b> révèle les combinaisons qui
        convertissent le mieux, pour orienter tes prochains briefs.
      </PageInfo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 16 }}>
        {DIMS.map(([dim, label]) => {
          const rows = topCreativeTags(creatives, dim);
          const m = max(rows);
          return (
            <div key={dim} style={card}>
              <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 12 }}>{label}</div>
              {rows.map((r) => (
                <div key={r.value} style={{ marginBottom: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                    <span style={{ color: 'var(--ink)' }}>{r.value}</span>
                    <b style={{ fontFamily: 'var(--font-mono)' }}>{r.weightedMetric.toFixed(2)}×</b>
                  </div>
                  <div style={{ height: 7, borderRadius: 999, background: 'var(--paper)' }}>
                    <div style={{ height: '100%', width: (r.weightedMetric / m) * 100 + '%', borderRadius: 999, background: 'var(--grad-accent)' }} />
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, margin: '26px 0 12px', color: 'var(--ink)' }}>Combinaisons gagnantes (persona × hook)</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {matrix.map((c, i) => (
          <div key={i} style={{ ...card, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
            <span style={{ color: 'var(--ink)', fontSize: 13.5 }}><b>{c.persona}</b> × {c.hook}</span>
            <b style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)' }}>{c.weightedMetric.toFixed(2)}×</b>
          </div>
        ))}
      </div>
    </main>
  );
}
const card: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 20, padding: 16, boxShadow: 'var(--sh-card)' };
