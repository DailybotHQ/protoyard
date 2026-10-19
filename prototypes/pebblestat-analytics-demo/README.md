# Pebblestat Analytics

A flagship Protoyard prototype: fictional product analytics in the spirit of
Mixpanel, built from the [analytics template](../../templates/analytics/README.md).
Pebblestat tracks its two products, **Pebblestat Web** and **Pebblestat
Mobile**. Everything is simulated: the data lives in your browser, and roles
are a UX simulation, not security.

```bash
pnpm protoyard dev pebblestat-analytics-demo
pnpm vitest run prototypes/pebblestat-analytics-demo
pnpm protoyard scenario bench pebblestat-analytics-demo --check
```

**Screens** (each a lazy route):

| Screen | What it shows |
| --- | --- |
| **Overview** | KPI tiles, release annotations, the editable project dashboard |
| **Insights** | Over time with a compare period, or totals per breakdown; filters, segments, **Save report** and **Annotate** |
| **Users** | A drill-down by plan, country and platform, and each user's events |
| **Funnels** | The activation funnel |
| **Retention** | Cohort retention |
| **Reports** | Saved Trends queries |
| **Alerts & annotations** | Daily thresholds that fire as simulated time advances, and the chart notes |
| **Live** | A live counter and a stream of events and alert checks |
| **Segments** | Saved filters |

| Scenario | What you see |
| --- | --- |
| `new-project` | Projects exist, no data yet: every empty state |
| `healthy-growth` *(default)* | 90 days of growth: reports, segments, two alerts, release annotations |
| `launch-day` | A launch 3 days ago: a wave of signups and a campaign annotation (analyst view) |
| `outage-incident` | A 2-day ingestion dip 6 days ago: the page-view alert fired, an incident annotation |
| `churn-risk` | Cohorts from 5–8 weeks ago went quiet after week one (analyst view) |
| `enterprise-scale` | ~100k Web events as daily rollups plus a 5 % user sample (~5k raw events) |

| Persona | Role | Can do |
| --- | --- | --- |
| `user_0001` Maya | owner | everything |
| `user_0002` Theo | analyst | edit dashboards; save reports, segments, alerts and annotations, and manage their own |
| `user_0003` Inês | viewer | read only |

Open DevTools with **Ctrl/⌘ + .** to switch persona, load a scenario, go
offline, or **advance time**. Advancing time runs the daily alert checks and
moves the live counter.

**Why enterprise scale is sampled.** Generating 100,000 raw events, or even a
20,000-event sample, takes far longer than the 50 ms scenario budget. So
enterprise scale stores daily rollups, the full stream's counts per event type,
plus a 5 % user sample:
- event totals come from the rollups;
- user counts are estimated from the sample and labelled "(est.)".

See [docs/SPEC.md](docs/SPEC.md#honest-boundaries).

The agent spec is in [AGENTS.md](AGENTS.md) and [docs/](docs/). Refresh it
with `pnpm protoyard spec pebblestat-analytics-demo --write`.
