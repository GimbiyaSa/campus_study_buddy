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
  # Subscription and tenant will be provided via environment variables or CLI
  # subscription_id = var.azure_subscription_id != "" ? var.azure_subscription_id : null
  # tenant_id       = var.azure_tenant_id != "" ? var.azure_tenant_id : null
}

# Configure the Azure AD Provider
provider "azuread" {
  # Tenant will be provided via environment variables or CLI
  # tenant_id = var.azure_tenant_id != "" ? var.azure_tenant_id : null
}