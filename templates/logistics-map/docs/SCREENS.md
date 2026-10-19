# Logistics Map: screens

## Routes

<!-- protoyard:generated:routes -->
_No `src/routes.ts`: this prototype declares its routes in `src/App.svelte`. List the screens by hand below._
<!-- /protoyard:generated:routes -->

## Screens

<!-- protoyard:generated:screens -->
_No generated route map; list the screens by hand._
<!-- /protoyard:generated:screens -->

Describe the data, actions, and empty, loading, error and denied states for each screen above.

## Live dispatch (`#/`)

Shows a fictional offline map, accessible marker list, active route lines and
shipment cards. Loading and database errors have dedicated states; an empty
scenario explains how to load sample shipments. Dispatch/reassign actions are
hidden for read-only roles, and service failures use an inline alert.

## Route timeline (`#/schedule`)

Shows shipment windows and progress in a read-only timeline. Loading, read
errors and no active shipments each have a visible state. Timeline progress
uses the simulated clock.

## Shell

Responsive browser workspace using the sidebar layout by default. Its manifest
supports sidebar, rail, top navigation and mobile layouts; the map and shipment
cards stack on narrow screens.
