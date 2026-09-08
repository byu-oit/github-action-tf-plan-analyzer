![CI](https://github.com/byu-oit/github-action-tf-plan-analyzer/workflows/CI/badge.svg)
![Test](https://github.com/byu-oit/github-action-tf-plan-analyzer/workflows/Test/badge.svg)

# github-action-tf-plan-analyzer

GitHub Action to analyze Terraform or Tofu for infrastructure misconfigurations with [Trivy](https://trivy.dev/).

This action is a backward-compatible replacement for the retired DivvyCloud integration. Existing callers can continue using `byu-oit/github-action-tf-plan-analyzer@v2` without supplying working DivvyCloud credentials or changing their existing inputs.

## Migration behavior

- `HIGH` and `CRITICAL` Terraform or Tofu findings are printed in the workflow log by default.
- Findings do not fail the action. This is intentionally non-gating while repositories adopt Trivy.
- All severities are written to SARIF and upload to GitHub Code Scanning is attempted by default.
- A failed SARIF upload produces a warning but does not fail the action.
- The old plan and DivvyCloud inputs are accepted and ignored so existing workflows remain compatible. They can be removed from callers.

Trivy statically scans all `.tf` files under `working-directory`. Its checks and severities are not a one-to-one replacement for the former DivvyCloud policy set, and values that are only available from provider calls or computed during planning may be unknown.

## Usage

Point the action at the directory containing the `.tf` files. Existing callers may continue passing `terraform-plan-file`, but it is no longer used.
Neither `init` nor `plan` is required. Trivy downloads remote modules itself, but it can reuse modules already present under `.terraform/modules`.

```yaml
on: pull_request

jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write # Optional; enables SARIF upload
    steps:
      # checkout and any project-specific setup steps...

      - name: Analyze Terraform or Tofu
        uses: byu-oit/github-action-tf-plan-analyzer@v2
        with:
          working-directory: terraform-iac/dev/app
```

The action itself still succeeds if `security-events: write` is omitted or GitHub Code Security is unavailable. Set `upload-sarif: 'false'` to skip the upload attempt entirely.

SARIF source locations are normalized to repository-relative paths such as `terraform-iac/dev/app/main.tf` before upload.

## Inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `working-directory` | No | `.` | Directory containing the `.tf` files to scan |
| `severity` | No | `HIGH,CRITICAL` | Severities shown in the workflow log |
| `upload-sarif` | No | `true` | Attempt a best-effort upload of all findings to GitHub Code Scanning |
| `terraform-plan-file` | No | | Deprecated compatibility input; ignored |
| `divvycloud-username` | No | | Deprecated compatibility input; ignored |
| `divvycloud-password` | No | | Deprecated compatibility input; ignored |

## Releasing

The action is implemented as a composite action, so there is no JavaScript packaging step. Publish a semantic version tag and update the corresponding major-version branch according to the repository's release process.
