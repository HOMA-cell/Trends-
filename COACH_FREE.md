# Coach Free MVP

Coach Free is the no-cost coaching discovery loop for the initial release.

## Included

- coach registration and profile editing
- public coach details on the existing public profile
- coach directory with text and service-mode filters
- existing normal posts on each coach profile
- private inquiry sending and coach inbox
- replies through the existing DM flow

## Intentionally deferred

- paid videos
- memberships or subscriptions
- client management
- detailed analytics
- AI features
- verification badges

## Data boundaries

- `coach_profiles` contains only coach-specific public listing fields.
- Core identity, avatar, bio, and posts continue to use `profiles` and `posts`.
- `coach_inquiries` is private to the sender and recipient coach.
- Inquiry status can only be updated by the recipient coach.
- Blocked users cannot discover or contact each other through Coach Free.
- Database validation rejects self-inquiries and limits inquiry bursts.

## Rollout

The UI is controlled by `coach_directory` and `coach_inquiries` in
`app_feature_flags`. Both default to off in the frontend, so deploying the code
before the migration does not expose an incomplete feature.

Apply `supabase/migrations/20260822090000_coach_free_mvp.sql` only after the
production migration is explicitly approved. Run database security and
performance advisors after applying it.

## Required smoke test

1. Complete a normal display name and handle.
2. Save a coach profile as a draft.
3. Publish it with at least one specialty and service mode.
4. Find it while signed out and from a second account.
5. Send an inquiry from the second account.
6. Open the coach inbox, mark the inquiry read, and reply in DM.
7. Close the inquiry.
8. Block the second account and confirm Coach Free no longer exposes contact paths.

