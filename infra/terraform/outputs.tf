# Campus Study Buddy - Terraform Outputs
# Essential outputs for application configuration and monitoring (NON-SENSITIVE)

# ==============================================================================
# RESOURCE GROUP OUTPUTS
# ==============================================================================

output "resource_group_name" {
  description = "The name of the main resource group"
  value       = azurerm_resource_group.main.name
}

output "location" {
  description = "The location where resources are deployed"
  value       = azurerm_resource_group.main.location
}

# ==============================================================================
# APPLICATION ENDPOINTS
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
# COMPUTE RESOURCES OUTPUTS
# ==============================================================================

output "container_apps_environment_name" {
  description = "The name of the Container Apps environment"
  value       = module.compute.container_apps_environment_name
}

# ==============================================================================
# NETWORKING OUTPUTS
# ==============================================================================

output "virtual_network_name" {
  description = "The name of the virtual network"
  value       = module.network.virtual_network_name
}

# ==============================================================================
# MONITORING AND QUEUES
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
