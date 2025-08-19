# Campus Study Buddy - Terraform Outputs
# This file defines outputs that can be used by other systems or for reference

# ==============================================================================
# RESOURCE GROUP OUTPUTS
# ==============================================================================

output "resource_group_name" {
  description = "The name of the main resource group"
  value       = azurerm_resource_group.main.name
}

output "resource_group_id" {
  description = "The ID of the main resource group"
  value       = azurerm_resource_group.main.id
}

output "location" {
  description = "The location where resources are deployed"
  value       = azurerm_resource_group.main.location
}

# ==============================================================================
# CORE INFRASTRUCTURE OUTPUTS
# ==============================================================================

output "storage_account_name" {
  description = "The name of the main storage account"
  value       = module.core.storage_account_name
}

output "storage_account_primary_endpoint" {
  description = "The primary endpoint of the storage account"
  value       = module.core.storage_account_primary_endpoint
}

output "sql_server_fqdn" {
  description = "The fully qualified domain name of the Azure SQL Server (MSSQL)"
  value       = module.core.sql_server_fqdn
}

output "sql_database_name" {
  description = "The name of the Azure SQL Database (MSSQL)"
  value       = module.core.sql_database_name
}

output "key_vault_uri" {
  description = "The URI of the Key Vault"
  value       = module.core.key_vault_uri
}


# ==============================================================================
# COMPUTE RESOURCES OUTPUTS
# ==============================================================================

output "container_apps_environment_name" {
  description = "The name of the Container Apps environment"
  value       = module.compute.container_apps_environment_name
}

output "container_apps_environment_default_domain" {
  description = "The default domain of the Container Apps environment"
  value       = module.compute.container_apps_environment_default_domain
}

output "api_container_app_fqdn" {
  description = "The FQDN of the API Container App"
  value       = module.compute.api_container_app_fqdn
}

output "frontend_app_service_default_hostname" {
  description = "The default hostname of the Frontend App Service"
  value       = module.compute.frontend_app_service_default_hostname
}


# ==============================================================================
# NETWORKING OUTPUTS
# ==============================================================================

output "virtual_network_name" {
  description = "The name of the virtual network"
  value       = module.network.virtual_network_name
}

output "virtual_network_id" {
  description = "The ID of the virtual network"
  value       = module.network.virtual_network_id
}

output "database_subnet_id" {
  description = "The ID of the database subnet"
  value       = module.network.database_subnet_id
}

output "container_apps_subnet_id" {
  description = "The ID of the container apps subnet"
  value       = module.network.container_apps_subnet_id
}

# ==============================================================================
# COMMUNICATION SERVICES OUTPUTS
# ==============================================================================

output "web_pubsub_hostname" {
  description = "The hostname of the Web PubSub service"
  value       = module.communication.web_pubsub_hostname
}


# ==============================================================================
# AUTOMATION OUTPUTS
# ==============================================================================

output "logic_app_name" {
  description = "The name of the Logic App for reminder scheduling"
  value       = module.automation.logic_app_name
}


# ==============================================================================
# CONNECTION STRINGS AND ENDPOINTS
# ==============================================================================

output "api_endpoint" {
  description = "The main API endpoint URL"
  value       = "https://${module.compute.api_container_app_fqdn}"
}

output "frontend_url" {
  description = "The frontend application URL"
  value       = "https://${module.compute.frontend_app_service_default_hostname}"
}


# ==============================================================================
# MONITORING ENDPOINTS
# ==============================================================================

output "storage_queue_study_session_name" {
  description = "The name of the study session storage queue"
  value       = module.automation.storage_queue_study_session_name
}

output "storage_queue_group_meeting_name" {
  description = "The name of the group meeting storage queue"
  value       = module.automation.storage_queue_group_meeting_name
}

output "storage_queue_progress_name" {
  description = "The name of the progress notifications storage queue"
  value       = module.automation.storage_queue_progress_name
}
