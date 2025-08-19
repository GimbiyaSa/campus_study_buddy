# Compute Resources Module - Outputs
# Output values from the compute resources module

# Container Apps Environment outputs
output "container_apps_environment_name" {
  description = "The name of the Container Apps environment"
  value       = azurerm_container_app_environment.main.name
}

output "container_apps_environment_id" {
  description = "The ID of the Container Apps environment"
  value       = azurerm_container_app_environment.main.id
}

output "container_apps_environment_default_domain" {
  description = "The default domain of the Container Apps environment"
  value       = azurerm_container_app_environment.main.default_domain
}

# API Container App outputs
output "api_container_app_name" {
  description = "The name of the API Container App"
  value       = azurerm_container_app.api.name
}

output "api_container_app_id" {
  description = "The ID of the API Container App"
  value       = azurerm_container_app.api.id
}

output "api_container_app_fqdn" {
  description = "The FQDN of the API Container App"
  value       = azurerm_container_app.api.latest_revision_fqdn
}

output "api_container_app_url" {
  description = "The URL of the API Container App"
  value       = "https://${azurerm_container_app.api.latest_revision_fqdn}"
}

# Frontend App Service outputs
output "frontend_app_service_name" {
  description = "The name of the Frontend App Service"
  value       = azurerm_linux_web_app.frontend.name
}

output "frontend_app_service_id" {
  description = "The ID of the Frontend App Service"
  value       = azurerm_linux_web_app.frontend.id
}

output "frontend_app_service_default_hostname" {
  description = "The default hostname of the Frontend App Service"
  value       = azurerm_linux_web_app.frontend.default_hostname
}

output "frontend_app_service_url" {
  description = "The URL of the Frontend App Service"
  value       = "https://${azurerm_linux_web_app.frontend.default_hostname}"
}

# Managed Identity outputs
output "container_apps_identity_name" {
  description = "The name of the Container Apps managed identity"
  value       = azurerm_user_assigned_identity.container_apps.name
}

output "container_apps_identity_id" {
  description = "The ID of the Container Apps managed identity"
  value       = azurerm_user_assigned_identity.container_apps.id
}

output "container_apps_identity_principal_id" {
  description = "The principal ID of the Container Apps managed identity"
  value       = azurerm_user_assigned_identity.container_apps.principal_id
}

output "container_apps_identity_client_id" {
  description = "The client ID of the Container Apps managed identity"
  value       = azurerm_user_assigned_identity.container_apps.client_id
}

# Application Gateway outputs (when enabled)
# Note: Application Gateway is not implemented in this configuration
# output "app_gateway_public_ip" {
#   description = "The public IP address of the Application Gateway"
#   value       = azurerm_public_ip.app_gateway.ip_address
# }
