# Microsoft Store submission

This project publishes Microsoft Store updates from GitHub Actions only after the first manual Partner Center submission has passed certification and is live.

## Current policy

- Initial submission: manual in Partner Center.
- Update submission: GitHub Actions manual workflow.
- Automatic tag-to-Store submission: disabled until the manual workflow has succeeded at least once.

This avoids modifying or replacing an in-progress first submission.

## Required GitHub configuration

Add these repository secrets:

```text
AZURE_AD_TENANT_ID
AZURE_AD_APPLICATION_CLIENT_ID
AZURE_AD_APPLICATION_SECRET
SELLER_ID
```

Add this repository variable:

```text
MICROSOFT_STORE_PRODUCT_ID
```

The Microsoft Entra application must be associated with the Partner Center account and assigned the Manager role.

Reference:
https://learn.microsoft.com/en-us/windows/apps/publish/msstore-dev-cli/github-actions

## Manual update submission

After a GitHub Release exists and contains the Store MSIX package:

1. Open GitHub Actions.
2. Run `Microsoft Store Submit`.
3. Set `release_tag` to the release tag, for example `v3.6.2`.
4. Keep `package_pattern` as `*.msix` unless the release asset name changes.
5. First run with `submit_to_store` disabled to verify the package selection.
6. If the dry run selects exactly one package, rerun with `submit_to_store` enabled.
7. Set `safety_ack` to:

```text
FIRST_STORE_SUBMISSION_PASSED
```

The workflow then runs:

```text
msstore publish <downloaded-msix> -id <MICROSOFT_STORE_PRODUCT_ID>
```

## When not to use the workflow

Do not enable `submit_to_store` while the first Partner Center submission is still in certification.

Do not use it for releases that change:

- Microsoft Store product identity
- app category or age rating behavior
- pricing or markets
- Store listing language coverage
- restricted capabilities such as `runFullTrust`

For those releases, verify the Partner Center draft manually before submitting.

## Future release.yml connection

After the first Store update succeeds through `Microsoft Store Submit`, the Store job can be connected to `.github/workflows/release.yml` after the existing `release` job.

Keep the `winget` job as-is. Store submission and winget submission are separate distribution channels.
