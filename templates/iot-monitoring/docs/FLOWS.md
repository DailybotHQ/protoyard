# Flows

## Review the field

1. Load `active`; the overview reads devices and telemetry through live queries.
2. Inspect device positions in the offline Harbor Bay map and select a device
   to view its daily telemetry chart and threshold.
3. Use DevTools to switch to `quiet`, `storm`, `network-offline` or `massive`.

## Respond to an alert

1. Open **Alerts and incidents** (`#/alerts`) and review severity, reading
   message and incident status.
2. Acknowledging an open alert runs `alerts.acknowledge`, checks the simulated
   `alerts:acknowledge` capability, validates the id and persists the alert and
   incident update in one Dexie transaction.
3. Resolving an active alert runs `alerts.resolve` with the
   `alerts:resolve` capability. Errors from validation, policy or offline
   network conditions are shown in the screen.
4. Advance simulated time. Each UTC day records one deterministic reading per
   device. A threshold breach creates an alert and opens or reopens an
   incident; normal readings move it to monitoring and eventually resolve it.

Roles are local UX simulations, not authentication. Network offline mode makes
writes fail; it does not make the generated records unavailable.
