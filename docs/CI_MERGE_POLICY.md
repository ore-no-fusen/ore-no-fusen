# CI and merge policy

## Required rule for both `develop` and `main`

- Do **not** merge a PR while any applicable required check is failing, pending, cancelled, or unverified. PR creation is not approval to merge.
- Enable GitHub branch protection / rulesets for both branches: require PR before merging; require passing applicable status checks; block direct pushes and bypasses except explicitly approved release automation. Set the required checks after verifying stable job names. These repository settings must be configured by a maintainer with permissions; this document alone does not enforce them.
- If a check fails in unrelated code, diagnose and resolve it or document an explicitly authorized exception **before** merging. Never infer that a failure is harmless from the changed-file list alone.
- Inspect all triggered workflow runs and recheck the exact PR head SHA. Run the targeted unit tests for modified components. Do not merge on an older green result.
- Merge only after the maintainer-approved checks succeed, then verify the merge commit and any relevant deployment.

## Scope of checks

- `Test / Dashboard analysis regression tests` executes the Node regression tests for the dashboard analysis.
- MSIX CI is limited to app/package-related paths on push and PR. A dashboard-script-only PR should not build installers.
- Changes to CI definitions require reviewing both event filters and branch protection's required-check list. Path-filtered workflows may be skipped: **do not mark a skipped conditional workflow as universally required**; use a stable always-running gate if mandatory checks differ by file type.
- Never silently turn off failures or use unconditional `continue-on-error` to make a PR mergeable.

## Recovery from a premature merge

1. Identify the merge SHA and its exact effects before taking action.
2. Use a new, reviewed revert PR if a rollback is warranted. Do not rewrite shared branch history.
3. Confirm checks pass before merging the corrective PR.
