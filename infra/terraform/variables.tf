# Campus Study Buddy - Terraform Variables
# This file defines all input variables for the infrastructure

# ===============================================================================

# Project and environment
variable "project_name" {
  description = "The name of the project"
  type        = string
  default     = "campus-study-buddy"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.project_name))
    error_message = "Project name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "environment" {
  description = "The deployment environment (prod only)"
  type        = string
  default     = "prod"

  validation {
    condition     = var.environment == "prod"
    error_message = "Environment must be 'prod' for this repository (single production environment)."
  }
}

variable "location" {
  description = "The Azure region where resources will be deployed"
  type        = string
  default     = "East US 2"

  # Accept either human-readable region names or common lowercase provider values
  validation {
    condition = contains([
      "east us", "east us 2", "west us", "west us 2", "central us", "south central us",
      "west europe", "north europe", "southeast asia", "east asia", "south africa north", "south africa west",
      "spain central", "central india", "brazil south", "austria east",
      "eastus", "eastus2", "westus", "westus2", "centralus", "southcentralus",
      "westeurope", "northeurope", "southeastasia", "eastasia", "southafricanorth", "southafricawest",
      "spaincentral", "centralindia", "brazilsouth", "austriaeast"
    ], lower(var.location))
    error_message = "Location must be a valid Azure region (case-insensitive). Examples: 'West Europe' or 'westeurope'."
  }
}

variable "tags" {
  description = "A map of tags to assign to resources"
  type        = map(string)
  default = {
    Project = "campus-study-buddy"
    Owner   = "DevOps Team"
  }
}

# ==============================================================================
# NETWORKING CONFIGURATION
# ==============================================================================

variable "vnet_address_space" {
  description = "The address space for the virtual network"
  type        = list(string)
  default     = ["10.0.0.0/16"]

  validation {
    condition     = length(var.vnet_address_space) > 0
    error_message = "At least one address space must be specified."
  }
}

variable "database_subnet_address_prefixes" {
  description = "Address prefixes for the database subnet"
  type        = list(string)
  default     = ["10.0.1.0/24"]
}

variable "container_apps_subnet_address_prefixes" {
  description = "Address prefixes for the container apps subnet"
  type        = list(string)
  default     = ["10.0.2.0/23"]
}

variable "storage_subnet_address_prefixes" {
  description = "Address prefixes for the storage subnet"
  type        = list(string)
  default     = ["10.0.4.0/24"]
}

# ==============================================================================
# DATABASE CONFIGURATION
# ==============================================================================

variable "database_admin_username" {
  description = "The administrator username for the SQL database"
  type        = string
  default     = "sqladmin"

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.database_admin_username))
    error_message = "Database admin username must start with a letter and contain only letters, numbers, and underscores."
  }
}

variable "database_admin_password" {
  description = "The administrator password for the SQL database"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.database_admin_password) >= 12
    error_message = "Database admin password must be at least 12 characters long."
  }
}

variable "database_sku_name" {
  description = "The SKU name for the SQL database"
  type        = string
  default     = "Basic"

  validation {
    condition     = contains(["Basic", "S0", "S1", "S2", "S3", "P1", "P2", "P4", "P6", "P11", "P15"], var.database_sku_name)
    error_message = "Database SKU must be a valid Azure SQL Database SKU."
  }
}

variable "database_max_size_gb" {
  description = "The maximum size of the database in GB"
  type        = number
  default     = 20

  validation {
    condition     = var.database_max_size_gb >= 1 && var.database_max_size_gb <= 1024
    error_message = "Database max size must be between 1 and 1024 GB."
  }
}

# ==============================================================================
# STORAGE CONFIGURATION
# ==============================================================================

variable "storage_account_tier" {
  description = "The performance tier of the storage account"
  type        = string
  default     = "Standard"

  validation {
    condition     = contains(["Standard", "Premium"], var.storage_account_tier)
    error_message = "Storage account tier must be either Standard or Premium."
  }
}

variable "storage_account_replication_type" {
  description = "The replication type of the storage account"
  type        = string
  default     = "LRS"

  validation {
    condition     = contains(["LRS", "GRS", "RAGRS", "ZRS", "GZRS", "RAGZRS"], var.storage_account_replication_type)
    error_message = "Storage account replication type must be one of: LRS, GRS, RAGRS, ZRS, GZRS, RAGZRS."
  }
}

# API container image for the backend service
variable "api_container_image" {
  description = "The container image for the API backend"
  type        = string
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

# ==============================================================================
# KEY VAULT CONFIGURATION
# ==============================================================================

variable "key_vault_soft_delete_retention_days" {
  description = "The number of days that items should be retained for once soft-deleted"
  type        = number
  default     = 7

  validation {
    condition     = var.key_vault_soft_delete_retention_days >= 7 && var.key_vault_soft_delete_retention_days <= 90
    error_message = "Key Vault soft delete retention days must be between 7 and 90."
  }
}

# ==============================================================================
# CONTAINER APPS CONFIGURATION
# ==============================================================================

variable "container_apps_cpu_limit" {
  description = "CPU limit for container apps"
  type        = string
  default     = "1.0"

  validation {
    condition     = can(regex("^[0-9]+(\\.[0-9]+)?$", var.container_apps_cpu_limit))
    error_message = "Container apps CPU limit must be a valid decimal number."
  }
}

variable "container_apps_memory_limit" {
  description = "Memory limit for container apps"
  type        = string
  default     = "2Gi"

  validation {
    condition     = can(regex("^[0-9]+(\\.[0-9]+)?[GM]i$", var.container_apps_memory_limit))
    error_message = "Container apps memory limit must be in format like '2Gi' or '512Mi'."
  }
}

variable "container_apps_min_replicas" {
  description = "Minimum number of replicas for container apps"
  type        = number
  default     = 1

  validation {
    condition     = var.container_apps_min_replicas >= 0 && var.container_apps_min_replicas <= 10
    error_message = "Container apps min replicas must be between 0 and 10."
  }
}

variable "container_apps_max_replicas" {
  description = "Maximum number of replicas for container apps"
  type        = number
  default     = 10

  validation {
    condition     = var.container_apps_max_replicas >= 1 && var.container_apps_max_replicas <= 100
    error_message = "Container apps max replicas must be between 1 and 100."
  }
}

# ==============================================================================
# STATIC WEB APP CONFIGURATION
# ==============================================================================

variable "static_web_app_sku_tier" {
  description = "The SKU tier for the Static Web App"
  type        = string
  default     = "Free"

  validation {
    condition     = contains(["Free", "Standard"], var.static_web_app_sku_tier)
    error_message = "Static Web App SKU tier must be either Free or Standard."
  }
}

# App Service Plan configuration for frontend
variable "app_service_plan_sku" {
  description = "The SKU for the App Service Plan (frontend)"
  type        = string
  default     = "F1" # Free tier

  validation {
    condition     = contains(["F1", "D1", "B1", "B2", "B3", "S1", "S2", "S3", "P1", "P2", "P3"], var.app_service_plan_sku)
    error_message = "App Service Plan SKU must be a valid Azure App Service Plan SKU."
  }
}
# ==============================================================================
# WEB PUBSUB CONFIGURATION
# ==============================================================================

variable "web_pubsub_sku" {
  description = "The SKU for Web PubSub service"
  type        = string
  default     = "Free_F1"

  validation {
    condition     = contains(["Free_F1", "Standard_S1"], var.web_pubsub_sku)
    error_message = "Web PubSub SKU must be either Free_F1 or Standard_S1."
  }
}

# ==============================================================================
# IDENTITY & B2C CONFIGURATION
# ==============================================================================

variable "b2c_tenant_name" {
  description = "The name of the B2C tenant (without .onmicrosoft.com suffix)"
  type        = string
  default     = "studybuddy"

  validation {
    condition     = can(regex("^[a-z0-9-]+$", var.b2c_tenant_name))
    error_message = "B2C tenant name must contain only lowercase letters, numbers, and hyphens."
  }
}

variable "b2c_signin_policy" {
  description = "The B2C sign-in policy name"
  type        = string
  default     = "signupsignin"

  validation {
    condition     = can(regex("^[a-zA-Z0-9]+$", var.b2c_signin_policy))
    error_message = "B2C signin policy must contain only letters and numbers."
  }
}

variable "enable_azure_ad_groups" {
  description = "Enable Azure AD group creation (requires Directory.ReadWrite.All permission)"
  type        = bool
  default     = false
}

variable "azure_subscription_id" {
  description = "Azure subscription ID to use for provider configuration (falls back to ARM_SUBSCRIPTION_ID env var)"
  type        = string
  default     = ""
}

variable "azure_tenant_id" {
  description = "Azure tenant ID to use for provider configuration (falls back to ARM_TENANT_ID env var)"
  type        = string
  default     = ""
}

# ------------------------------------------------------------------------------
# Minimal/compatibility variables declared because environments/prod/terraform.tfvars
# contains values for them. These are intentionally permissive defaults to avoid
# breaking existing tfvars-based workflows. If you prefer, remove the keys from
# the tfvars file instead.
# ------------------------------------------------------------------------------

variable "frontend_hostname" {
  description = "Frontend hostname (present in environments/prod/terraform.tfvars)"
  type        = string
  default     = ""
}

variable "application_name" {
  description = "Name of the Azure AD application"
  type        = string
  default     = "Campus Study Buddy"
}

variable "naming_prefix" {
  description = "Optional naming prefix used in the prod tfvars"
  type        = string
  default     = ""
}

variable "random_suffix" {
  description = "Optional random suffix used in the prod tfvars"
  type        = string
  default     = ""
}

variable "create_managed_db" {
  description = "Compatibility: whether to create a managed database (present in tfvars)"
  type        = bool
  default     = true
}

variable "enable_sql_database" {
  description = "Compatibility: legacy flag present in tfvars"
  type        = bool
  default     = true
}

variable "compute_subnet_address_prefixes" {
  description = "Compute subnet prefixes (present in tfvars)"
  type        = list(string)
  default     = ["10.0.2.0/24"]
}

variable "container_app_min_replicas" {
  description = "Min replicas for container apps (compat)"
  type        = number
  default     = 0
}

variable "container_app_max_replicas" {
  description = "Max replicas for container apps (compat)"
  type        = number
  default     = 10
}

variable "enable_private_endpoints" {
  description = "Compatibility flag present in tfvars"
  type        = bool
  default     = false
}

variable "allowed_ip_ranges" {
  description = "Compatibility: allowed IP ranges"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}