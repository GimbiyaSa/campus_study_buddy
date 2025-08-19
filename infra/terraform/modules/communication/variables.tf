# Communication Services Module - Variables
# Input variables for the communication services module

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

# Web PubSub configuration
variable "web_pubsub_sku" {
  description = "The SKU for Web PubSub service"
  type        = string
  default     = "Free_F1"
}

# Optional dependencies
variable "key_vault_id" {
  description = "The ID of the Key Vault for storing secrets"
  type        = string
}

variable "managed_identity_id" {
  description = "The ID of the managed identity for Web PubSub authentication (optional)"
  type        = string
  default     = null
}

variable "key_vault_rbac_assignment" {
  description = "Key Vault RBAC assignment dependency"
  type        = any
  default     = null
}