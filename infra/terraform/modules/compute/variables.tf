# Compute Resources Module - Variables
# Input variables for the compute resources module

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

variable "random_suffix" {
  description = "Random suffix for unique resource naming"
  type        = string
}

variable "tags" {
  description = "A map of tags to assign to resources"
  type        = map(string)
  default     = {}
}

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "location_abbrev" {
  description = "Location abbreviation for naming"
  type        = string
}

variable "key_vault_id" {
  description = "The ID of the Key Vault"
  type        = string
}

variable "storage_account_id" {
  description = "The ID of the storage account"
  type        = string
}

variable "subnet_id" {
  description = "The ID of the subnet for Container Apps"
  type        = string
}

# Container Apps configuration
variable "container_apps_cpu_limit" {
  description = "CPU limit for container apps"
  type        = string
  default     = "1.0"
}

variable "container_apps_memory_limit" {
  description = "Memory limit for container apps"
  type        = string
  default     = "2Gi"
}

# API container image (make it configurable for CI/CD)
variable "api_container_image" {
  description = "The container image for the API container app"
  type        = string
  default     = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"
}

variable "container_apps_min_replicas" {
  description = "Minimum number of replicas for container apps"
  type        = number
  default     = 1
}

variable "container_apps_max_replicas" {
  description = "Maximum number of replicas for container apps"
  type        = number
  default     = 10
}


# Static Web App configuration
variable "static_web_app_sku_tier" {
  description = "The SKU tier for the Static Web App"
  type        = string
  default     = "Free"
}

# App Service Plan configuration
variable "app_service_plan_sku" {
  description = "The SKU for the App Service Plan"
  type        = string
  default     = "F1" # Free tier
}

variable "cors_origin" {
  description = "The allowed CORS origin for the API (frontend host)"
  type        = string
  default     = ""
}

variable "api_base_url" {
  description = "The base URL to expose to the frontend for API calls"
  type        = string
  default     = ""
}

# Key Vault Secret IDs
variable "database_connection_secret_id" {
  description = "The Key Vault secret ID for database connection string"
  type        = string
  default     = ""
}

variable "jwt_secret_id" {
  description = "The Key Vault secret ID for JWT secret"
  type        = string
  default     = ""
}

variable "storage_connection_secret_id" {
  description = "The Key Vault secret ID for storage connection string"
  type        = string
  default     = ""
}

variable "web_pubsub_connection_secret_id" {
  description = "The Key Vault secret ID for Web PubSub connection string"
  type        = string
  default     = ""
}
