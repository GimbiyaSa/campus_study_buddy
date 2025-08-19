# Automation Module - Variables
# Input variables for the automation module

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
  default     = ""
}

variable "tags" {
  description = "A map of tags to assign to resources"
  type        = map(string)
  default     = {}
}

variable "storage_account_name" {
  description = "The name of the storage account to host queues"
  type        = string
}

# API configuration
variable "api_base_url" {
  description = "The base URL of the API"
  type        = string
  default     = "https://api.campusstudybuddy.com"
}

