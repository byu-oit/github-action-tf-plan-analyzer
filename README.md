![CI](https://github.com/byu-oit/github-action-tf-plan-analyzer/workflows/CI/badge.svg)
![Test](https://github.com/byu-oit/github-action-tf-plan-analyzer/workflows/Test/badge.svg)

# ![BYU logo](https://www.hscripts.com/freeimages/logos/university-logos/byu/byu-logo-clipart-128.gif) github-action-tf-plan-analyzer

GitHub Action to analyze the proposed Terraform plan for security and compliance

This action takes in the terraform plan and uses DivvyCloud to analyze it for specific security and compliance rules.

**Note:** This action does not run `terraform plan` for you, you must pass in the plan as an input as well as the directory of the Terraform configuration (where the plan and .terraform dir are located after `terraform init`).

## Usage
```yaml
on: pull_request
# ...
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    # ... 
    # terraform init
    # terraform plan
    - name: Analyze Terraform Plan
      uses: byu-oit/github-action-tf-plan-analyzer@v2.0.2
      with:
        divvycloud-username: ${{ secrets.DIVVYCLOUD_USERNAME }}
        divvycloud-password: ${{ secrets.DIVVYCLOUD_PASSWORD }}
        working-directory: terraform-iac/dev/app # where your terraform files are
        terraform-plan-file: plan.tfplan # relative to working directory
```

## Inputs
* `divvycloud-username` - (**required**) username of user within Divvycloud
* `divvycloud-password` - (**required**) password of user within Divvycloud
* `working-directory` - (_optional_) the directory of the terraform configuration files (defaults to `.`)
* `terraform-plan-file` - (**required**) Filename of the terraform plan (relative to `working-directory`)

## Contributing
Hopefully this is useful to others at BYU.
Feel free to ask me some questions about it, but I make no promises about being able to commit time to support it.

### Modifying Source Code
Just run `npm install` locally.
There aren't many files here, so hopefully it should be pretty straightforward.

### Cutting new releases
GitHub Actions will run the entry point from the action.yml. In our case, that happens to be /dist/index.js.

Actions run from GitHub repos. We don't want to check in node_modules. Hence, we package the app using npm run package.

Then, push to the corresponding branch, respecting SemVer.
