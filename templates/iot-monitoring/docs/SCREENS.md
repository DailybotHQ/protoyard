# Screens

## Device map (`#/`)

Shows the offline Harbor Bay device map and accessible marker list, device
count, open-alert count, active incident count, selectable device list and
selected device's daily telemetry chart. Loading, empty and database errors
have explicit states. The map and chart components load lazily.

## Alerts and incidents (`#/alerts`)

Lists threshold alerts and active incidents. Authorized operators can
acknowledge open alerts or resolve active alerts. Actions show pending state;
validation, permission and simulated network failures are visible to the user.
