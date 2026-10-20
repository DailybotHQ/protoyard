# IoT Monitoring

A working Protoyard template for a fictional field-operations team. It combines
an offline device map, per-device telemetry charts, threshold alerts and
incidents that respond to simulated time. Everything runs in the browser's
local database; it does not connect to real sensors, maps or networks.

```bash
pnpm protoyard new my-monitoring --template iot-monitoring
pnpm protoyard dev my-monitoring
```

## What works

- **Device map** — devices are placed in the fictional Harbor Bay region. The
  hand-authored map and marker list work offline; map and chart UI chunks load
  only when the overview screen opens.
- **Telemetry** — daily readings are keyed by device and UTC day. The
  `timeSeries()` generator anchors readings to each scenario's seed and
  reference time, and the timeline records the next daily sample on time
  advance.
- **Threshold response** — readings over a device threshold create alerts and
  incidents. Operators can acknowledge or resolve alerts through validated,
  permission-checked services.
- **Incidents** — an over-threshold reading moves an incident to investigating;
  normal samples move it to monitoring and resolve it after two consecutive
  days. This is a deterministic simulation, not an on-call service.
- **Scenarios** — active field operations, quiet devices, storm response,
  offline actions and a 1,000-device world for generation benchmarks.

## Checks

```bash
pnpm vitest run templates/iot-monitoring
pnpm --filter @protoyard-template/iot-monitoring typecheck
pnpm protoyard validate iot-monitoring --strict-spec --build
pnpm protoyard scenario bench iot-monitoring --check
```

The production initial JavaScript target is 250 KB gzip. The map and chart
packages are dynamically imported and stay out of the initial application
chunk. Personas and permissions are interface simulations, not authentication
or device security.
