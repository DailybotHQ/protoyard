# Screens

## Money overview (`/`)

- Account cards show checking and savings balances plus total available funds.
- A lazily loaded line chart shows the generated checking balance with its
  payday cycle; a grouped bar chart compares monthly income and expenses.
- The transactions spreadsheet (read-only, `@protoyard/views-ui/sheet`) lists
  date, description, account, category and signed amount, newest first (the
  latest 1,000), with a `Net` row that sums the amounts by formula and a
  "Download CSV" button. Record text is shown as typed and never evaluates.
- Monthly category budgets show spend-to-limit progress and an alert at the
  configured threshold.
- The transfer form is available to owners and members, with a read-only
  explanation for viewers. The shared LayoutHost supports the manifest's
  responsive sidebar, rail, top-nav and mobile layouts.
