# Monetization foundation

The September launch keeps the social core free while preparing controlled
paths for Pro, sponsor placements, and a gym directory.

## Launch state

- `pro_preview`: on. Shows a non-purchasable preview in Account.
- `pro_membership`: off. No billing UI or purchase flow is exposed.
- `sponsor_ads`: on. Delivers the first active house campaign after six posts,
  then every twelve posts, with at most two placements per session.
- `external_ads`: off. AdSense remains disabled in production.
- `gym_directory`, `gym_reviews`, and `gym_claims`: off.

Public switches live in `app_feature_flags`. Never place API keys, billing
secrets, private prices, or internal targeting rules in this table because its
public rows are readable by the browser.

## Data boundaries

- `user_entitlements` is read-only for the owning user. Only trusted backend
  code may create or update access.
- `sponsor_campaigns` exposes active delivery copy only. Campaign billing and
  internal analytics belong in a private schema or the billing provider.
- Gym reviews and claims reject browser writes until their feature flags are
  enabled. Review publication and gym manager approval remain server-only.
- Sponsored campaigns must use a clear disclosure such as `Advertising / PR`.
  Organic gym ratings must never be changed by campaign priority.

## Safe rollout order

1. Validate retention and the native house placement.
2. Add provider webhooks that write verified Pro entitlements.
3. Launch the gym directory in one area.
4. Enable reviews after moderation and appeal tools are ready.
5. Sell clearly disclosed sponsor campaigns through an operator workflow.
6. Consider external ad networks only after consent and UGC policy checks.

## Operations

Feature changes should be made through an audited admin workflow or a reviewed
migration. Do not restore the browser-local AdSense controls in production.
The app intentionally ignores local ad overrides unless
`window.__TRENDS_ADS__.allowLocalOverrides` is set to `true` in a development
build.
