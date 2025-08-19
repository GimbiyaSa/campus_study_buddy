# Identity and Security Module - Outputs
# Output values from the identity and security module

# Azure AD Application outputs
output "application_name" {
  description = "The name of the Azure AD application"
  value       = azuread_application.main.display_name
}

output "application_id" {
  description = "The application ID of the Azure AD application"
  value       = azuread_application.main.client_id
}

output "application_client_id" {
  description = "The client ID of the Azure AD application"
  value       = azuread_application.main.client_id
}

output "application_object_id" {
  description = "The object ID of the Azure AD application"
  value       = azuread_application.main.object_id
}

# Service Principal outputs
output "service_principal_id" {
  description = "The ID of the service principal"
  value       = azuread_service_principal.main.id
}

output "service_principal_object_id" {
  description = "The object ID of the service principal"
  value       = azuread_service_principal.main.object_id
}

output "service_principal_application_id" {
  description = "The application ID of the service principal"
  value       = azuread_service_principal.main.client_id
}

# Application Password outputs
output "application_password_id" {
  description = "The ID of the application password"
  value       = azuread_application_password.main.id
}

output "application_password_value" {
  description = "The value of the application password"
  value       = azuread_application_password.main.value
  sensitive   = true
}

# Azure AD Groups outputs
output "students_group_id" {
  description = "The ID of the students group"
  value       = var.enable_azure_ad_groups ? azuread_group.students[0].id : ""
}

output "students_group_object_id" {
  description = "The object ID of the students group"
  value       = var.enable_azure_ad_groups ? azuread_group.students[0].object_id : ""
}

output "tutors_group_id" {
  description = "The ID of the tutors group"
  value       = var.enable_azure_ad_groups ? azuread_group.tutors[0].id : ""
}

output "tutors_group_object_id" {
  description = "The object ID of the tutors group"
  value       = var.enable_azure_ad_groups ? azuread_group.tutors[0].object_id : ""
}

output "admins_group_id" {
  description = "The ID of the admins group"
  value       = var.enable_azure_ad_groups ? azuread_group.admins[0].id : ""
}

output "admins_group_object_id" {
  description = "The object ID of the admins group"
  value       = var.enable_azure_ad_groups ? azuread_group.admins[0].object_id : ""
}

# Tenant information
output "tenant_id" {
  description = "The tenant ID"
  value       = data.azuread_client_config.current.tenant_id
}

# B2C Configuration outputs
output "b2c_tenant_domain" {
  description = "The B2C tenant domain"
  value       = local.b2c_tenant_domain
}

output "b2c_policy_name" {
  description = "The B2C sign-in policy name"
  value       = local.b2c_policy_name
}

output "b2c_tenant_name" {
  description = "The B2C tenant name"
  value       = var.b2c_tenant_name
}
