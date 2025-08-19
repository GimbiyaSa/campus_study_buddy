# Networking Module - Variables
# Input variables for the networking module

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

# Virtual Network configuration
variable "vnet_address_space" {
  description = "The address space for the virtual network"
  type        = list(string)
  default     = ["10.0.0.0/16"]
}

# Subnet configurations
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
