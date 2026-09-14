# Agent A — Auth Handoff (Anonymous Session)

The Foundation provides the plumbing for Supabase Anonymous Auth (browser
client, server client, session-refresh middleware, `requireOwner`), but does
not build any UI. This note documents how a future UI (Agent D) should
initiate and carry the session, since the contract doesn't formalize this.

Production prerequisites and CAPTCHA token handoff are in `agent-a2-auth-production.md`.
The example below is for local development without CAPTCHA.

## Initiating a session

The UI is expected to call, once, on first load if no session exists yet:

```ts
import { createSupabaseBrowserClient } from "@/core/supabase/browser";

const supabase = createSupabaseBrowserClient();
const { data } = await supabase.auth.getSession();

if (!data.session) {
  await supabase.auth.signInAnonymously();
}
```

This creates a real `auth.users` row and a session cookie. `middleware.ts`
keeps that cookie fresh on subsequent navigations/requests; Route Handlers
read it via `await createSupabaseServerClient()` + `requireOwner()`. After validation, domain operations use the privileged server-only backend client; the browser has no domain or Storage mutation authority.

## What the Foundation guarantees

- Every API route derives `ownerId` exclusively from the validated session
  (`auth.getUser()`, which revalidates against the Supabase Auth server -
  not a locally decoded JWT). No endpoint reads `owner_id` from any request
  body, query param, or header.
- If no valid session exists, every protected endpoint returns
  `401 UNAUTHENTICATED` with the canonical error envelope.

## What the Foundation does NOT provide (out of scope this round)

- Any UI for the sign-in call above.
- Session upgrade/linking (e.g. converting an anonymous user into a
  permanent account) - not part of the MVP contract as written.
- Cross-device session continuity beyond whatever Supabase's default cookie
  behavior provides.

If Agent D needs a different session-initiation trigger (e.g. lazy, only on
first "create comparison" click, rather than eagerly on load), that's a UI
decision that doesn't require any Foundation change - both clients above are
safe to call at any time.
