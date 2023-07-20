terraform {
  required_version = "1.5.2"
  backend "s3" {
    bucket         = "terraform-state-storage-887069801155"
    dynamodb_table = "terraform-state-lock-887069801155"
    key            = "gha-tf-plan-analyzer/setup.tfstate"
    region         = "us-west-2"
  }
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 4.67"
    }
  }
}

locals {
  name    = "gha-tf-plan-analyzer"
  gh_org  = "byu-oit"
  gh_repo = "github-action-tf-plan-analyzer"
}

provider "aws" {
  region = "us-west-2"

  default_tags {
    tags = {
      repo                   = "https://github.com/byu-oit/${local.gh_repo}"
      data-sensitivity       = "public"
      env                    = "prd"
      resource-creator-email = "GitHub-Actions"
    }
  }
}

module "acs" {
  source = "github.com/byu-oit/terraform-aws-acs-info?ref=v4.0.0"
}

module "gha_role" {
  source                         = "terraform-aws-modules/iam/aws//modules/iam-assumable-role-with-oidc"
  version                        = "5.17.0"
  create_role                    = true
  role_name                      = "${local.name}-org-gha"
  provider_url                   = module.acs.github_oidc_provider.url
  role_permissions_boundary_arn  = module.acs.role_permissions_boundary.arn
  role_policy_arns               = module.acs.power_builder_policies[*].arn
  oidc_fully_qualified_audiences = ["sts.amazonaws.com"]
  oidc_subjects_with_wildcards   = ["repo:${local.gh_org}/${local.gh_repo}:*"]
}