# Flows

## Overview

The overview reads live account, transaction, snapshot and budget rows. It shows
checking and savings balances, daily checking history, monthly income and
spending, recent categorized entries and category budget alerts. Chart modules
load on demand from the screen.

## Transfer

1. Select distinct source and destination accounts, enter an amount in dollars
   and a note.
2. The service checks the simulated `transfers:create` permission, validates
   input, rejects insufficient funds and enters the simulated environment.
3. One Dexie transaction updates both balances, adds debit and credit ledger
   rows, and updates both account snapshots for the simulated day.
4. Offline or validation failure leaves every account and ledger row untouched.

No request leaves the browser; this flow does not connect to a bank.
