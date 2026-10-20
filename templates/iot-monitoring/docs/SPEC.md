# IoT Monitoring specification

## Product

A small operations console for a fictional sensor fleet. It helps an operator
spot readings outside a device threshold, inspect recent telemetry and follow
a simulated incident response.

## Honest boundaries

This is a browser-only scenario. Device points are fictional Harbor Bay data;
there are no real sensors, external maps, network tiles, paging, backend or
on-call integrations. Personas and permissions are UX simulations, not
security controls.

## Scenarios

<!-- protoyard:generated:scenarios -->
| Scenario | Name | Group | Density | Seed | Generator knobs | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `active` | Field operations | Lifecycle | normal | 7241 | `{"monitoring":{"devices":12,"historyDays":14}}` | A live fleet with recent telemetry, threshold alerts and an active incident. |
| `massive` | Large sensor network | Scale | massive | 7241 | `{"monitoring":{"devices":1000,"historyDays":7}}` | A thousand devices for testing map and scenario generation at scale. |
| `network-offline` | Offline field team | Conditions | normal | 7241 | `{"monitoring":{"devices":12,"historyDays":14}}` | The fleet remains readable while alert acknowledgements fail offline. |
| `quiet` | Steady operations | Lifecycle | normal | 7241 | `{"monitoring":{"devices":8,"historyDays":14,"quiet":true}}` | A calm site with devices inside their operating thresholds. |
| `storm` | Storm response | Conditions | dense | 7241 | `{"monitoring":{"devices":24,"historyDays":14,"storm":true}}` | A weather event creates critical readings across several devices. |
<!-- /protoyard:generated:scenarios -->

## Domain

<!-- protoyard:generated:tables -->
<!-- /protoyard:generated:tables -->

The template's domain tables are described in the hand-maintained
[data model](DATA_MODEL.md): devices, daily telemetry, threshold alerts and
incidents.

## Manifest

<!-- protoyard:generated:manifest -->
| Field | Value |
| --- | --- |
| id | `template.iot-monitoring` |
| slug | `iot-monitoring` |
| name | IoT Monitoring |
| version | 0.1.0 |
| platform | responsive |
| category | operations |
| default scenario | `active` |
| default theme | `violet` |
| storage namespace | `template-iot-monitoring` |
| schema version | 1 |
| generator version | 1 |
| timeline | yes (simulated time advances apply events) |
| themes | built-in presets only |
<!-- /protoyard:generated:manifest -->
