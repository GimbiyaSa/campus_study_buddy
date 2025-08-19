# Campus Study Buddy - Terraform Providers & Backend
# This file defines the required Terraform version, providers, and backend
# configuration. Providers configured: azurerm, azuread, random.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "4.40.0" }
    azuread = { source = "hashicorp/azuread", version = "3.5.0" }
    random  = { source = "hashicorp/random", version = "3.7.2" }
  }

  backend "azurerm" {
    # Backend configuration should be provided during 'terraform init'
    # e.g. via -backend-config or environment variables in CI
  }
}

# Configure the Azure Provider
provider "azurerm" {
  features {}
  # For local development, uncomment and add your values:
  subscription_id = "7db47e1f-79a2-4a18-9797-c803ca806c29"
  tenant_id       = "4b1b908c-5582-4377-ba07-a36d65e34934"
  # 
  # For CI/CD, these values come from environment variables:
  # ARM_SUBSCRIPTION_ID and ARM_TENANT_ID
}

# Configure the Azure AD Provider
provider "azuread" {
  # For local development, uncomment and add your value:
  tenant_id = "4b1b908c-5582-4377-ba07-a36d65e34934"
  #
  # For CI/CD, this value comes from environment variable: ARM_TENANT_ID
}