# Data model

All records are fictional and local to this template's IndexedDB namespace.
No backend or physical device is contacted.

| Table | Purpose | Important indexes |
| --- | --- | --- |
| `devices` | Sensor identity, type, Harbor Bay point, unit, baseline and threshold | `name`, `kind`, `status`, `ownerId` |
| `telemetry` | One reading per device and UTC day, plus its threshold result | `[deviceId+at]`, `breached` |
| `alerts` | Threshold event with severity and acknowledgement/resolution state | `[deviceId+status]`, `createdAt` |
| `incidents` | Device response state and consecutive normal samples | `deviceId`, `status`, `updatedAt` |

Telemetry ids are `${deviceId}:${YYYY-MM-DD}`. This stable key makes a
repeated timeline window idempotent. `timeSeries()` derives values from the
scenario id, seed, series key and date; advancing time records daily samples
through the runtime timeline. All timestamps use the simulated UTC clock.

An alert progresses from `open` to `acknowledged` or `resolved`. A device
incident progresses from `investigating` to `monitoring` after a normal reading
and to `resolved` after two consecutive normal daily readings. A new breach
returns the incident to `investigating`.
