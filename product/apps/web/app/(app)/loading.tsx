/**
 * Écran de chargement global (App Router) : s'affiche INSTANTANÉMENT à chaque navigation
 * pendant que la page se rend côté serveur. Améliore fortement la performance perçue.
 */
export default function Loading() {
  return (
    <main style={{ padding: '30px 36px 60px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <Bar w={190} h={26} />
        <Bar w={90} h={20} />
      </div>
      <Bar w={420} h={13} />
      <div style={{ height: 10 }} />
      <Bar w={320} h={13} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16, marginTop: 28 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 16, background: 'var(--surface)', overflow: 'hidden' }}>
            <Bar w="100%" h={150} radius={0} />
            <div style={{ padding: 14 }}>
              <Bar w="70%" h={13} />
              <div style={{ height: 8 }} />
              <Bar w="45%" h={11} />
            </div>
          </div>
        ))}
      </div>

      <style>{'@keyframes ttshimmer{0%{background-position:-450px 0}100%{background-position:450px 0}}'}</style>
    </main>
  );
}

function Bar({ w, h, radius = 7 }: { w: number | string; h: number; radius?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: radius,
      background: 'linear-gradient(90deg, var(--line) 25%, var(--line-2) 37%, var(--line) 63%)',
      backgroundSize: '900px 100%', animation: 'ttshimmer 1.4s ease-in-out infinite',
    }} />
  );
}
