# Update Meta Page Access Token + Verify Connection

No code or database changes. Only the backend secret value changes, followed by read-only verification calls.

## Step 1 — Store the new token

`META_PAGE_ACCESS_TOKEN` already exists in the backend secrets, so it will be replaced with the new value you provided. Nothing is written into source files; `META_PAGE_ID`, `META_AD_ACCOUNT_ID` (`1355914965043357`), and all WhatsApp secrets stay untouched.

Note: the token was pasted directly in chat. After this update works, consider regenerating it in Meta so the pasted copy is no longer usable.

## Step 2 — Verify (read-only, via the existing `meta-ads` function)

| Check | How |
|---|---|
| Facebook Page loads | `list_lead_forms` returns a `page` object with id + name |
| Lead Forms load | same call returns a non-empty `forms` array |
| Ad Campaigns load | `list_campaigns` returns campaigns without `(#200)` |
| Ad Account access | campaigns/insights resolve for `act_1355914965043357` |

Connected Platforms sync and Workflow auto-sync both call these same actions, so a clean result on both confirms them. No lead data is inserted during verification — `sync_leads_to_crm` is not run.

## Step 3 — Report

If `(#200) Ad account owner has NOT granted ads_management or ads_read` persists after the token swap, the cause is not the token value but permissions, and I will report which one applies:

- token lacks the `ads_read` / `ads_management` scope, or
- the token's user/system user has no asset assignment on ad account `1355914965043357`, or
- the ad account belongs to a different Business than the token's Business.

Page and Lead Form access can succeed while Ads access still fails — these are separate scopes, so partial success is a possible outcome and will be reported explicitly.
