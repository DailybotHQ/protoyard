/**
 * Texuli's charts color their series from `--tx-chart-1` … `--tx-chart-8`
 * (falling back to built-in light colors), while Protoyard themes write the
 * series colors as `--tx-chart1` … `--tx-chart8` (@protoyard/themes base.css
 * and `applyTheme`). Without this map a Texuli chart never sees the theme's
 * palette, so it ignores the theme and dark mode. Every chart root sets it
 * inline, so it holds wherever charts render, with or without this package's
 * stylesheet. Series 6–8 fall back as the themes' Tailwind colors do.
 */
export const TEXULI_CHART_TOKENS = [
  '--tx-chart-1:var(--tx-chart1)',
  '--tx-chart-2:var(--tx-chart2)',
  '--tx-chart-3:var(--tx-chart3)',
  '--tx-chart-4:var(--tx-chart4)',
  '--tx-chart-5:var(--tx-chart5)',
  '--tx-chart-6:var(--tx-chart6, var(--tx-chart1))',
  '--tx-chart-7:var(--tx-chart7, var(--tx-chart2))',
  '--tx-chart-8:var(--tx-chart8, var(--tx-chart3))',
].join(';');
