# Vermo Admin → n8n → Twenty CRM

Pushes dashboard contacts (with their segments) into a self-hosted Twenty CRM.

The admin never talks to Twenty directly. It posts signed batches to an n8n
webhook; the workflow owns the CRM credentials and the field mapping, so the
CRM side can be changed without deploying the dashboard.

```
Admin (CRM Sync page) ──signed JSON batches──► n8n webhook ──REST──► Twenty CRM
```

## 1. Create the segments field in Twenty

Segments arrive as a list of slugs (`new_signup`, `high_roller`, …). They need
somewhere to land:

**Settings → Data model → Person → Add field**

- **Text** field named `Segments` — the workflow writes `new_signup, high_roller`
  (this is the default), or
- **Multi-Select** field named `Segments` with one option per slug — the workflow
  writes a real array, which is filterable in Twenty.

Note the field's **API name** (usually `segments`); you will need it in step 3.
Leave the workflow's `segmentField` blank to skip writing segments entirely.

## 2. Import the workflow

In n8n: **Workflows → Import from File →** `vermo-contacts-to-twenty.json`.

Then create the credential the HTTP nodes use:

**Credentials → New → Header Auth**

| Field | Value |
|---|---|
| Name | `Authorization` |
| Value | `Bearer YOUR_TWENTY_API_KEY` |

Get the API key from Twenty: **Settings → API & Webhooks → Create API key**.

Select that credential on all three HTTP Request nodes (find / create / update).

## 3. Fill in the Config node

| Field | Meaning |
|---|---|
| `twentyUrl` | Base URL of your Twenty instance, no trailing slash (e.g. `https://crm.example.com`) |
| `webhookSecret` | Shared secret — must match **Shared secret** in the admin (System → CRM Sync). Leave *both* blank to accept unsigned requests (not recommended) |
| `segmentField` | API name of the Person field that holds segments (default `segments`) |
| `segmentMode` | `text` for a Text field, `multiselect` for a Multi-Select field |

## 4. Activate and connect

1. **Activate** the workflow (toggle, top right).
2. Copy the Webhook node's **Production URL** — it looks like
   `https://n8n.example.com/webhook/vermo-contacts`.
   The `/webhook-test/` URL only accepts a single call after you press
   "Test step", so it is not the one to use here.
3. In the dashboard: **System → CRM Sync**, paste the URL, set the same shared
   secret, **Save**, then **Send test contact**.

A successful test creates "Vermo Test Contact" in Twenty. Delete it afterwards.

## What gets sent

```json
{
  "source": "vermo-admin",
  "sentAt": "2026-09-08T12:00:00.000Z",
  "batch": { "index": 0, "size": 50, "total": 12 },
  "contacts": [
    {
      "userId": "6a7391593dc90f1549b5af89",
      "name": "David Emmanuel",
      "firstName": "David",
      "lastName": "Emmanuel",
      "email": "david@example.com",
      "phone": "+2348135835516",
      "phoneNumber": "8135835516",
      "phoneCallingCode": "+234",
      "username": "Mallam Apollo",
      "createdAt": "2026-08-05T19:39:05.726Z",
      "segments": ["new_signup", "active_player"],
      "attributes": { "role": "USER", "registrationStage": "COMPLETED",
                      "referralCode": "VERI35516", "gender": "M" }
    }
  ]
}
```

### Where the shared secret goes

It is one value that you choose, entered in **two** places, and they must match:

1. **Admin** → System → CRM Sync → **Shared secret** → Save
2. **n8n** → this workflow → **Config** node → `webhookSecret`

Any random string works — e.g. `openssl rand -hex 24`. If the two differ, every
batch fails with `HTTP 401: Invalid signature`. Leaving *both* blank disables
signature checking, which is only sensible on a private network.

The signature is computed with the **Web Crypto API** (`globalThis.crypto`), a
standard global in Node 18+. It deliberately does not `require('crypto')`,
because the Code node sandbox blocks built-in modules and would fail with
`Module 'crypto' is disallowed`. (If you prefer the module, start n8n with
`NODE_FUNCTION_ALLOW_BUILTIN=crypto` — but the shipped workflow needs no such
setting.)

Header `x-vermo-signature: sha256=<hex>` is an HMAC-SHA256 of the **exact request
body** using the shared secret. The workflow recomputes it from the raw body —
which is why the Webhook node has **Raw Body** enabled. Re-serializing the parsed
JSON would produce different bytes and never match.

## Segments

Computed on every sync from the user record plus betting aggregates, so they are
always current rather than stored and stale:

| Slug | Meaning |
|---|---|
| `new_signup` | Registered within the last N days (default 7) |
| `registration_incomplete` | `registrationStage` is not `COMPLETED` |
| `email_verified` / `email_unverified` | Email verification state |
| `has_naira_account` | A virtual Naira account is provisioned |
| `has_crypto_wallet` | At least one coin address on file |
| `never_played` | Has not joined any wager |
| `active_player` | Joined a wager within the last N days (default 30) |
| `dormant_player` | Has played, but not within the last N days (default 90) |
| `high_roller` | Lifetime stake at or above the threshold (default 1000) |
| `contest_creator` | Has created at least one wager |

Thresholds live in `n8n_segment_config` in `admin_settings`. The CRM Sync page
can push a chosen subset of segments rather than everyone.

To add a segment, add an entry to `SEGMENT_DEFS` in `server/segments.js` — the
API, the settings UI and the push all read from that one list.

## How records are matched

Twenty's REST API has **no upsert** (that is GraphQL-only), so the workflow looks
the person up first and branches:

1. `GET /rest/people?filter=emails.primaryEmail[eq]:…` — falling back to
   `phones.primaryPhoneNumber[eq]:…` when the contact has no email.
2. Found → `PATCH /rest/people/{id}`; not found → `POST /rest/people`.

Local numbers (`08135835517`) are converted to E.164 before sending, so the same
person cannot be created twice under two number formats.

A contact with neither an email nor a phone is never sent — there would be
nothing for the CRM to key on.

## Re-running

"Push new & changed" hashes each contact's details and segments and skips any
that are unchanged since the last successful push, so it is safe to run often.
"Push everyone" ignores that and re-sends the full book.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `HTTP 404` | Workflow not active, or the test URL was used instead of the production one |
| `HTTP 401` + "Invalid signature" | The secret in the Config node does not match the admin |
| `Module 'crypto' is disallowed` | An old copy of the workflow. Re-import this file — the current one uses Web Crypto and needs no env var |
| "Web Crypto is unavailable" | n8n is on Node < 18. Upgrade, or clear `webhookSecret` to run unsigned |
| `A 'json' property isn't an object` | An old copy of the workflow. Re-import this file — every Code node now runs in "Run Once for All Items" mode and returns an array |
| `timeout` | Workflow is slow or n8n is unreachable; large batches on a small instance can exceed 30s — lower the batch size |
| Twenty returns 400 | Usually the segments field name or type is wrong — check `segmentField` / `segmentMode` against the field you created |
| Duplicate people | An existing person has a different email/phone than the dashboard holds, so the lookup misses |
