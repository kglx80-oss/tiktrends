'use client';

import { useState } from 'react';
import { configureBucketAction, testStorageAction } from '../app/actions/storage';

type Step = { label: string; ok: boolean; detail: string };

export function StorageConfigurator({ enabled }: { enabled: boolean }) {
  const [busy, setBusy] = useState<'' | 'config' | 'test'>('');
  const [steps, setSteps] = useState<Step[]>([]);
  const [test, setTest] = useState<{ put?: boolean; publicRead?: boolean; deleted?: boolean } | null>(null);
  const [err, setErr] = useState('');

  async function configure() {
    if (busy) return;
    setBusy('config'); setErr(''); setSteps([]); setTest(null);
    const r = await configureBucketAction();
    setBusy('');
    if (r.error) setErr(r.error);
    if (r.steps) setSteps(r.steps);
  }
  async function runTest() {
    if (busy) return;
    setBusy('test'); setErr(''); setTest(null);
    const r = await testStorageAction();
    setBusy('');
    if (r.error) setErr(r.error);
    setTest({ put: r.put, publicRead: r.publicRead, deleted: r.deleted });
  }

  if (!enabled) {
    return (
      <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.6 }}>
        Pose d'abord les clés S3 dans <code style={code}>.env.deploy</code> sur le VPS
        (<code style={code}>S3_ENDPOINT</code>, <code style={code}>S3_REGION</code>, <code style={code}>S3_BUCKET</code>,
        <code style={code}>S3_ACCESS_KEY_ID</code>, <code style={code}>S3_SECRET_ACCESS_KEY</code>), puis
        <code style={code}>docker compose up -d web workers</code>. Les boutons de configuration apparaîtront ici.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={configure} disabled={!!busy} style={primary}>{busy === 'config' ? 'Configuration…' : '⚙ Configurer le bucket (public + CORS)'}</button>
        <button type="button" onClick={runTest} disabled={!!busy} style={ghost}>{busy === 'test' ? 'Test…' : '🧪 Tester le stockage'}</button>
      </div>

      {err && <div style={{ marginTop: 12, fontSize: 13, color: '#ff9db0' }}>{err}</div>}

      {steps.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', background: 'var(--surface)' }}>
              <span style={{ fontSize: 15 }}>{s.ok ? '✅' : '⚠️'}</span>
              <span style={{ fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{s.label}</span>
              <span style={{ fontSize: 11.5, color: s.ok ? '#7ee8bf' : '#f5b043', fontFamily: 'var(--font-mono)' }}>{s.detail}</span>
            </div>
          ))}
        </div>
      )}

      {test && (
        <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
          <Row label="Écriture (upload d'un témoin)" ok={!!test.put} />
          <Row label="Lecture publique de l'objet" ok={!!test.publicRead} />
          <Row label="Suppression du témoin" ok={!!test.deleted} />
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            {test.put && test.publicRead ? 'Stockage opérationnel · tu peux téléverser des rushs dans Assets.'
              : test.put && !test.publicRead ? 'Écriture OK mais lecture publique KO : relance « Configurer le bucket » (policy) ou renseigne S3_PUBLIC_BASE_URL.'
              : 'Écriture KO : vérifie les clés S3, le nom du bucket et la région.'}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, border: '1px solid var(--line)', borderRadius: 10, padding: '9px 12px', background: 'var(--surface)' }}>
      <span style={{ fontSize: 15 }}>{ok ? '✅' : '❌'}</span>
      <span style={{ fontWeight: 700, color: 'var(--ink)', flex: 1 }}>{label}</span>
      <span style={{ fontSize: 11.5, fontWeight: 800, color: ok ? '#7ee8bf' : '#ff9db0' }}>{ok ? 'OK' : 'KO'}</span>
    </div>
  );
}

const code = { fontFamily: 'var(--font-mono, monospace)', fontSize: 11.5, background: 'rgba(255,255,255,.06)', padding: '1px 5px', borderRadius: 5, color: 'var(--ink)' } as const;
const primary = { padding: '10px 16px', borderRadius: 999, border: 'none', background: 'var(--grad-accent)', color: '#0d070c', fontWeight: 800, fontSize: 13, cursor: 'pointer' } as const;
const ghost = { padding: '10px 16px', borderRadius: 999, border: '1px solid var(--line-2)', background: 'transparent', color: 'var(--ink)', fontWeight: 700, fontSize: 13, cursor: 'pointer' } as const;
