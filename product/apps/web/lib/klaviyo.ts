import 'server-only';

/**
 * Synchronisation marketing Klaviyo (best-effort).
 * On pousse un ÉVÉNEMENT Klaviyo : cela crée/actualise le profil du client (e-mail +
 * propriétés : plan, espace, profil d'onboarding…) ET déclenche les flows marketing
 * (bienvenue, nurturing d'essai, relances). N'échoue jamais et ne bloque jamais l'app.
 *
 * Config : KLAVIYO_API_KEY (clé privée « pk_… ») dans l'environnement serveur.
 * Aucun e-mail transactionnel critique ne passe par ici (reset MDP, etc.).
 */
const REVISION = '2024-10-15';

export function klaviyoConfigured(): boolean {
  return !!process.env.KLAVIYO_API_KEY;
}

interface TrackOpts {
  email: string;
  name?: string | null;
  event: string;                                  // ex. « Signed Up », « Completed Onboarding »
  properties?: Record<string, unknown>;           // propriétés de l'événement
  profileProperties?: Record<string, unknown>;    // propriétés persistées sur le profil
}

export async function klaviyoTrack(opts: TrackOpts): Promise<{ ok: boolean; skipped?: boolean; error?: string }> {
  const key = process.env.KLAVIYO_API_KEY;
  if (!key) { console.log(`[klaviyo:skip] (non configuré) ${opts.event} → ${opts.email}`); return { ok: false, skipped: true }; }

  const firstName = opts.name ? opts.name.trim().split(/\s+/)[0] : undefined;
  const body = {
    data: {
      type: 'event',
      attributes: {
        metric: { data: { type: 'metric', attributes: { name: opts.event } } },
        profile: { data: { type: 'profile', attributes: {
          email: opts.email,
          ...(firstName ? { first_name: firstName } : {}),
          ...(opts.profileProperties ? { properties: opts.profileProperties } : {}),
        } } },
        properties: opts.properties ?? {},
      },
    },
  };

  try {
    const res = await fetch('https://a.klaviyo.com/api/events/', {
      method: 'POST',
      headers: {
        Authorization: `Klaviyo-API-Key ${key}`,
        revision: REVISION,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const txt = await res.text().catch(() => '');
    console.error('[klaviyo:error]', res.status, txt.slice(0, 300));
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (e) {
    console.error('[klaviyo:error]', (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

/** Nouvel inscrit : crée le profil + déclenche le flow « bienvenue / essai ». */
export async function klaviyoSignedUp(opts: { email: string; name?: string | null; workspaceName: string; plan: string }) {
  return klaviyoTrack({
    email: opts.email,
    name: opts.name,
    event: 'Signed Up',
    properties: { workspace: opts.workspaceName, plan: opts.plan, source: 'tiktrends-app' },
    profileProperties: { workspace: opts.workspaceName, plan: opts.plan },
  });
}

/** Onboarding terminé : enrichit le profil (profil déclaré, niveau IA, objectifs, marque). */
export async function klaviyoOnboarded(opts: {
  email: string; name?: string | null; profile?: string; aiLevel?: string; goals?: string[]; brandName?: string; siteUrl?: string;
}) {
  return klaviyoTrack({
    email: opts.email,
    name: opts.name,
    event: 'Completed Onboarding',
    properties: { profile: opts.profile, aiLevel: opts.aiLevel, goals: opts.goals, brandName: opts.brandName, siteUrl: opts.siteUrl },
    profileProperties: {
      onboarding_profile: opts.profile, ai_level: opts.aiLevel, goals: opts.goals,
      first_brand: opts.brandName, first_site: opts.siteUrl,
    },
  });
}
