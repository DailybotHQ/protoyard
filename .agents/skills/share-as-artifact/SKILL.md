---
name: share-as-artifact
description: Prepare and share a Protoyard prototype as a Claude artifact, then record the returned URL.
version: "1.0.0"
user-invocable: true
allowed-tools: Bash, Read, Grep, Glob
tier: standard
intent: publish
max-files: 0
---

# Share a prototype as a Claude artifact

## Goal

Build a checked artifact pack, publish its files with the Claude Artifact tool, and record only the URL returned by that tool. Reuse the previously recorded artifact URL when updating a share.

## When to use

Use when the developer asks to share a prototype through Claude artifacts. The Artifact tool is available only in a compatible Claude session; the Protoyard CLI prepares and records files but cannot publish them.

## Inputs

- A prototype `<slug>`.
- Optional `--comments` to pack the artifact review capabilities, or `--no-devtools` to omit DevTools.
- Optional `--dry-run` to check the artifact export without publishing or recording it.

## Steps

1. For `--dry-run`, run:
   ```bash
   pnpm protoyard export <slug> --target artifact --dry-run
   ```
   Report the output, including failures and warnings. This command builds and checks the artifact export but does not write the pack, publish it, or update the share ledger. Stop here.

2. For a share, run `pnpm protoyard export <slug> --target artifact --json`, adding `--comments` and/or `--no-devtools` only when requested. Stop on any nonzero exit or `ok: false`; report every reason and warning. The JSON includes `manifest` and the exact per-batch arguments in `publish`.

3. Read the pack manifest at `artifacts/<slug>/artifact/artifact-manifest.json`, its `page.path`, and every `manifest.files[*].path` in full. Use the file-reading tool for each file, including binary files. If a path is missing or any file cannot be read completely, do not publish. Match each read path to the manifest and the corresponding `publish` batch; do not invent or rewrite the tool arguments. `--comments` capabilities are included only when the manifest declares them.

4. Run `pnpm protoyard artifact list --json` and find the latest entry for `<slug>`. Present the pack summary, warnings, batch count, comments capability status, and whether this will create or update a share. Sharing is an external publish: wait for the developer's explicit approval before calling the Artifact tool. If the Artifact tool is unavailable, stop after preparation and report that no share or ledger entry was created.

5. If a URL is recorded, read that URL first with the Artifact tool's `read` action. Publish every batch using the exact matching `publish` arguments from the export JSON. On the first batch, pass the recorded `url` to update the existing artifact; if there is no recorded URL, create it using the first batch's `file_path`, `files`, `icon`, and `description`. Include `capabilities` only when present in that batch. Send later batches as successive publishes to the same URL returned by the first publish. Stop on any tool error; report which batches completed and do not claim that the share is complete.

6. After all batches succeed, run:
   ```bash
   pnpm protoyard artifact record <slug> --url <exact URL returned by the Artifact tool>
   ```
   Never guess, edit, or record a URL the Artifact tool did not return. If recording fails after publishing, report that the artifact may be published but the local ledger was not updated. Report the subscription/visibility line exactly as the tool result states it; if no such line is returned, say it was not provided.

7. Only when `--comments` was packed, perform one ArtifactData `list` of `review/<slug>/threads`. Report the result and its limits: this lists thread roots only; it does not verify replies, write permissions, or another viewer's access. Do not create test comments as part of this pass.

## Validation and honest reporting

- The export command must exit successfully and include the manifest and publish batches.
- Every packed file must be readable before publishing.
- The artifact URL must come from the Artifact tool, and `artifact record` must succeed before reporting it as recorded.
- State clearly that prototypes are private by default. People the owner shares the artifact with may access it according to Claude's sharing controls; do not claim it is public unless the sharing UI confirms that.
- Prototype database and browser storage are per viewer and are not shared. With `--comments`, review threads use the declared shared ArtifactData capability; report only the access exercised in this run.

## Notes

- Artifact export refuses unsupported build settings and reports pack violations; fix those before sharing rather than bypassing the checks.
- Existing URLs are reused so later publishes update the same artifact. The local share ledger records the latest URL per prototype and visibility at record time; it does not track later sharing-setting changes.
- Do not paste a private artifact URL into tracked documentation.
