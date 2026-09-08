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

- **Text** (recommended) — named `Segments`. The workflow writes
  `new_signup, high_roller`. Any value is accepted, so nothing else to set up.
- **Multi-Select** — named `Segments`, filterable in Twenty, but every slug has
  to exist as an option or Twenty rejects the write. Add all eleven:

  ```
  new_signup, registration_incomplete, email_verified, email_unverified,
  has_naira_account, has_crypto_wallet, never_played, active_player,
  dormant_player, high_roller, contest_creator
  ```

  Add any new slug here too whenever you add one to `SEGMENT_DEFS`.

Note the field's **API name** (shown under the field name in Twenty — usually
`segments`) and put it in the Config node's `segmentField`. They must match
exactly, or Twenty answers
`400 Object person doesn't have any "segments" field`.

Not ready to deal with segments yet? Clear `segmentField` in the Config node
and contacts sync without them.

> **If you sync without segments first**, note that turning them on later does
> not change what the admin sends — only what the workflow writes — so the
> change-detection hash is identical and "Push new & changed" will skip every
> contact. Use **Push everyone** once, after setting `segmentField`, to
> backfill segments onto contacts that are already in Twenty.

## 2. Import the workflow

In n8n: **Workflows → Import from File →** `vermo-contacts-to-twenty.json`.

That is the whole import — there is no credential to attach. The three HTTP
nodes send `Authorization: Bearer <twentyApiKey>` built from the Config node,
so nothing needs selecting per node.

Get the API key from Twenty: **Settings → API & Webhooks → Create API key**.

### Using n8n's credential store instead

The Config-node route above puts the key in the workflow. To keep it in n8n's
encrypted credential store instead:

1. **Credentials → New → Header Auth**, and fill in both fields:

   | Field | Value |
   |---|---|
   | Name | `Authorization` |
   | Value | `Bearer YOUR_TWENTY_API_KEY` |

   `Name` is the **HTTP header name** — it must be spelled exactly
   `Authorization`. A typo here (`Authorizarion`) sends a header Twenty
   ignores, and it answers `403 Missing authentication token` as if no key
   were sent at all. Leave the `fx` expression toggle off; these are literal
   values, not expressions.

   Optionally set **Allowed HTTP Request Domains** to your Twenty host rather
   than `All`, so the key cannot be sent anywhere else.

2. On **each of the three** HTTP nodes (find / create / update):
   - Authentication → **Generic Credential Type** → **Header Auth**
   - pick the credential you just made
   - under **Headers**, delete the `Authorization` entry the workflow ships
     with — otherwise both are sent and the blank one can win

3. Leave `twentyApiKey` empty in the Config node.

A credential is not attached by importing a workflow, so this has to be done
after every re-import — which is why the shipped default uses the Config node.

## 3. Fill in the Config node

| Field | Meaning |
|---|---|
| `twentyUrl` | Base URL of your Twenty instance, no trailing slash (e.g. `https://crm.example.com`) |
| `twentyApiKey` | Twenty API key (Settings → API & Webhooks → Create API key). Sent as `Authorization: Bearer …` |
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

If the test reports success but no contact appears, re-import the workflow —
older copies swallowed Twenty's error responses and reported delivery
regardless. The current one reports the status code and message.

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
nothing for the CRM to key on. When a whole batch has nothing usable, the
"Any contacts to sync?" IF routes straight to the response so the caller still
gets an answer instead of waiting for a timeout.

## Rate limiting

Twenty allows 100 requests per 60 seconds by default, and every contact costs
**two** — a lookup, then a create or update. The admin paces batches against
that budget (using 80% of it) rather than sending them back to back, so a
batch of 20 goes out roughly every 30 seconds: about 40 contacts a minute.

A first sync of a few thousand contacts therefore takes a while. It runs in the
background and survives leaving the page. If a 429 slips through at a window
boundary, the batch waits 60 seconds and retries once.

If you have raised Twenty's limit, set **Twenty rate limit /min** on the CRM
Sync page to match and the pacing widens automatically.

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
| "Node was not executed" on **Twenty: find person** | The batch had nothing to push, so the "Any contacts to sync?" IF sent it down the no-op branch. Check the Verify & expand output: if it shows one item with `__empty`, the request carried no contacts — usually from pressing "Execute workflow" without the admin actually sending one |
| `HTTP 429: Limit reached (100 tokens per 60000 ms)` | Twenty's rate limit. Each contact costs **two** calls (lookup + write), so a 50-contact batch is 100 calls. Lower **Batch size** on the CRM Sync page; the admin already paces batches and retries once after 60s |
| `timeout` | Workflow is slow or n8n is unreachable; large batches on a small instance can exceed 30s — lower the batch size |
| `HTTP 400: Object person doesn't have any "segments" field` | The Person field does not exist yet, or `segmentField` does not match its API name. Create it (step 1), or clear `segmentField` to sync without segments |
| `HTTP 400` naming a segment value | A Multi-Select field is missing that slug as an option — add it, or switch the field to Text |
| `Twenty lookup failed (HTTP 403): Missing authentication token` | `twentyApiKey` is empty in the Config node — or, on an older import, the Header Auth credential was never selected on the node |
| `Twenty lookup failed (HTTP 401): Invalid token` | `twentyApiKey` is set but wrong or expired — create a fresh key in Twenty |
| `Twenty lookup failed (HTTP 404)` | `twentyUrl` in the Config node is wrong — it is still the `https://crm.example.com` placeholder unless you changed it |
| Test says delivered but nothing in Twenty | An old workflow copy. Re-import: writes are now checked and failures reported |
| "carried no contacts" on a batch you know had some | An old workflow copy: the Config (Set) node replaced the item, dropping the webhook body before Verify & expand read it. Re-import — Verify now reads the Webhook node directly |
| Duplicate people | An existing person has a different email/phone than the dashboard holds, so the lookup misses |
