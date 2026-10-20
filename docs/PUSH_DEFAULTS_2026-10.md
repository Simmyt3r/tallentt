# ChombuTar push defaults: all categories checked for new subscribers

## Behavior

In **Settings → Notifications**, all six category checkboxes begin checked for subscribers who have never saved push preferences:

- Deals
- Negotiations
- Deals Chat
- Payments
- Live
- Marketing

A subscriber may turn off any optional category. Previously saved preferences, including explicit `false` values, are never overwritten. Critical deal and payment alerts continue to follow their existing security rules.

**Checking categories is not subscription permission.** The application must still require the subscriber to choose **Enable on this device**, after which the browser handles permission. Never call the permission dialog silently from page load, and never silently subscribe a new device.

## Database migration

After deployment, administrators can run the allowlisted **push-defaults-2026-10** migration under **Admin → Database Migrations**. It changes the `notification_preferences.marketing` column default to `true` for future rows only. It does **not** update existing records or force marketing back on for someone who disabled it.

The backend also supplies the default `true` when there is no preference record, so the UI remains correct before the migration. A backup is recommended before any production migration.

## Validation

Run `npm test`, `npm run check:api`, `npm run build` and the UI checks before releasing. Manually test a new account, an existing account with disabled preferences and a browser that refuses notification permission. Check that preferences persist across sign-in and devices.

The VAPID push server must be configured for alerts to arrive. This change does not by itself make push delivery operational.
