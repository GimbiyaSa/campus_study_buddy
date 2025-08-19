################################################################################
# Core Module Variables
# Purpose: Variable declarations for storage, database, and Key Vault configuration
################################################################################

variable "resource_group_name" {
  description = "Name of the resource group"
  type        = string
}

variable "location" {
  description = "Azure region for resources"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "naming_prefix" {
  description = "Prefix for naming resources"
  type        = string
}

variable "random_suffix" {
  description = "Random suffix for unique resource naming"
  type        = string
}

variable "storage_account_tier" {
  description = "The tier of the storage account"
  type        = string
  default     = "Standard"
}

variable "storage_account_replication_type" {
  description = "The replication type of the storage account"
  type        = string
  default     = "LRS"
}

variable "database_admin_username" {
  description = "The administrator username for the SQL database"
  type        = string
  default     = "sqladmin"
}

variable "database_admin_password" {
  description = "The administrator password for the SQL database"
  type        = string
  sensitive   = true
}

variable "database_sku_name" {
  description = "The SKU name for the SQL database"
  type        = string
  default     = "Basic"
}

variable "database_max_size_gb" {
  description = "The maximum size of the database in GB"
  type        = number
  default     = 2
}

variable "create_managed_db" {
  description = "Whether to create a managed SQL database"
  type        = bool
  default     = true
}

variable "enable_sql_database" {
  description = "Whether to enable SQL database creation"
  type        = bool
  default     = true
}

variable "key_vault_soft_delete_retention_days" {
  description = "Number of days to retain soft-deleted Key Vault items"
  type        = number
  default     = 7

  validation {
    condition     = var.key_vault_soft_delete_retention_days >= 7 && var.key_vault_soft_delete_retention_days <= 90
    error_message = "Key Vault soft delete retention days must be between 7 and 90."
  }
}

variable "tags" {
  description = "A map of tags to assign to the resources"
  type        = map(string)
  default     = {}
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "project_abbrev" {
  description = "Project abbreviation for naming"
  type        = string
  default     = "csb"
}

variable "env_abbrev" {
  description = "Environment abbreviation for naming"
  type        = string
}

variable "location_abbrev" {
  description = "Location abbreviation for naming"
  type        = string
}

