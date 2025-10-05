# Campus Study Buddy - Main Terraform Configuration
# This file defines the core infrastructure for the Campus Study Buddy platform

# Random string for unique resource naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Main Resource Group
resource "azurerm_resource_group" "main" {
  name     = local.resource_group_name
  location = var.location
  tags     = local.common_tags
}

// Core infrastructure module (storage, database, key vault)
module "core" {
  source = "./modules/core"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  project_name        = var.project_name
  naming_prefix       = local.naming_prefix
  random_suffix       = random_string.suffix.result
  tags                = local.common_tags
  common_tags         = local.common_tags
  project_abbrev      = local.project_abbrev
  env_abbrev          = local.env_abbrev
  location_abbrev     = local.location_abbrev

  # Database configuration
  database_admin_username = var.database_admin_username
  database_admin_password = var.database_admin_password
  create_managed_db       = var.create_managed_db
  database_sku_name       = var.database_sku_name
  database_max_size_gb    = var.database_max_size_gb

  # Storage configuration
  storage_account_tier             = var.storage_account_tier
  storage_account_replication_type = var.storage_account_replication_type

  # Key Vault configuration
  key_vault_soft_delete_retention_days = var.key_vault_soft_delete_retention_days

}

# Compute Resources Module
module "compute" {
  source = "./modules/compute"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  project_name        = var.project_name
  naming_prefix       = local.naming_prefix
  random_suffix       = random_string.suffix.result
  tags                = local.common_tags
  common_tags         = local.common_tags
  location_abbrev     = local.location_abbrev

  # Dependencies
  key_vault_id       = module.core.key_vault_id
  storage_account_id = module.core.storage_account_id
  subnet_id          = module.network.container_apps_subnet_id

  # Container Apps configuration
  container_apps_cpu_limit    = var.container_apps_cpu_limit
  container_apps_memory_limit = var.container_apps_memory_limit
  container_apps_min_replicas = var.container_apps_min_replicas
  container_apps_max_replicas = var.container_apps_max_replicas
  api_container_image         = var.api_container_image

  # Frontend App Service configuration
  app_service_plan_sku = var.app_service_plan_sku

  # CORS configuration
  cors_origin = "https://*" # Allow all origins for now, restrict later

  # Key Vault secret IDs (depends on core and communication modules)
  database_connection_secret_id   = module.core.database_connection_secret_id
  jwt_secret_id                   = module.core.jwt_secret_id
  storage_connection_secret_id    = module.core.storage_connection_secret_id
  web_pubsub_connection_secret_id = module.communication.web_pubsub_connection_secret_id

  depends_on = [module.core, module.communication]
}

// Networking module (VNet, subnets, NSGs, route tables)
module "network" {
  source = "./modules/network"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  project_name        = var.project_name
  naming_prefix       = local.naming_prefix
  tags                = local.common_tags

  # VNet configuration
  vnet_address_space = var.vnet_address_space

  # Subnet configurations
  database_subnet_address_prefixes       = var.database_subnet_address_prefixes
  container_apps_subnet_address_prefixes = var.container_apps_subnet_address_prefixes
  storage_subnet_address_prefixes        = var.storage_subnet_address_prefixes
}

// Communication services module (Web PubSub, Notification Hubs, Communication Services)
module "communication" {
  source = "./modules/communication"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  project_name        = var.project_name
  naming_prefix       = local.naming_prefix
  random_suffix       = random_string.suffix.result
  tags                = local.common_tags

  # Web PubSub configuration
  web_pubsub_sku = var.web_pubsub_sku

  # Ensure Web PubSub secrets are stored in Key Vault
  key_vault_id              = module.core.key_vault_id
  key_vault_rbac_assignment = module.core.key_vault_rbac_assignment

  depends_on = [module.core]
}

// Automation module (Logic Apps, Service Bus, automation monitoring)
module "automation" {
  source = "./modules/automation"

  resource_group_name = azurerm_resource_group.main.name
  location            = azurerm_resource_group.main.location
  environment         = var.environment
  project_name        = var.project_name
  naming_prefix       = local.naming_prefix
  tags                = local.common_tags

  # Dependencies
  storage_account_name = module.core.storage_account_name
}
