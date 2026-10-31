# Flows

The catalog is bundled with the prototype. Search filters its names, groups and summaries locally. Selecting an entry loads its demo component on demand. The same component is mounted in desktop and phone preview frames.

Opening Sketches loads the canvas section on demand. Each change in the editor calls the sketch service, which checks `kit:sketch`, validates the canvas, runs through the simulated environment, then writes the row in a transaction; a refused or failed save puts the stored sketch back.

Saving a review calls the service, which checks permissions and bounded input, runs through the simulated environment, then upserts the row in a transaction.
