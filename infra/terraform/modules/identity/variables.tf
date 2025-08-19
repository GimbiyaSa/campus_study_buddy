# Identity and Security Module - Variables
# Input variables for the identity and security module

variable "resource_group_name" {
  description = "The name of the resource group"
  type        = string
}

variable "location" {
  description = "The Azure region where resources will be deployed"
  type        = string
}

variable "environment" {
  description = "The deployment environment (staging, prod)"
  type        = string
}

variable "project_name" {
  description = "The name of the project"
  type        = string
}

variable "naming_prefix" {
  description = "The naming prefix for resources"
  type        = string
}

variable "tags" {
  description = "A map of tags to assign to resources"
  type        = map(string)
  default     = {}
}

# Application configuration
variable "application_name" {
  description = "The name of the Azure AD application"
  type        = string
}

variable "frontend_hostname" {
  description = "The hostname of the frontend application (e.g., app.example.com)"
  type        = string
  default     = "localhost:3000"
}

# Sign-in audience for the Azure AD application. Keep the default for a single-tenant
# Azure AD app. To use Azure AD B2C register the app in your B2C tenant and supply
# the appropriate audience value or leave as the default and create the app inside
# the B2C tenant context.
variable "sign_in_audience" {
  description = "The sign in audience for the Azure AD application (e.g. AzureADMyOrg)"
  type        = string
  default     = "AzureADMyOrg"
}

# Dependencies
variable "key_vault_id" {
  description = "The ID of the Key Vault to store secrets"
  type        = string
}

# B2C Configuration
variable "b2c_tenant_name" {
  description = "The name of the B2C tenant (without .onmicrosoft.com suffix)"
  type        = string
  default     = "studybuddy"
}

variable "b2c_signin_policy" {
  description = "The B2C sign-in policy name"
  type        = string
  default     = "signupsignin"
}

variable "enable_azure_ad_groups" {
  description = "Enable Azure AD group creation (requires Directory.ReadWrite.All permission)"
  type        = bool
  default     = false
}

variable "key_vault_rbac_assignment" {
  description = "Key Vault RBAC assignment dependency"
  type        = any
  default     = null
}
