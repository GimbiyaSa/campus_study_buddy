# Core Infrastructure Module - Outputs
# Output values from the core infrastructure module

# Storage Account outputs
output "storage_account_name" {
  description = "The name of the storage account"
  value       = azurerm_storage_account.main.name
}

output "storage_account_id" {
  description = "The ID of the storage account"
  value       = azurerm_storage_account.main.id
}

output "storage_account_primary_endpoint" {
  description = "The primary endpoint of the storage account"
  value       = azurerm_storage_account.main.primary_blob_endpoint
}

output "storage_account_primary_connection_string" {
  description = "The primary connection string of the storage account"
  value       = azurerm_storage_account.main.primary_connection_string
  sensitive   = true
}

# Azure SQL (MSSQL) outputs
output "sql_server_name" {
  description = "The name of the Azure SQL Server (MSSQL)"
  value       = var.create_managed_db ? azurerm_mssql_server.main[0].name : ""
}

output "sql_server_fqdn" {
  description = "The fully qualified domain name of the Azure SQL Server (MSSQL)"
  value       = var.create_managed_db ? azurerm_mssql_server.main[0].fully_qualified_domain_name : ""
}

output "sql_server_id" {
  description = "The ID of the Azure SQL Server (MSSQL)"
  value       = var.create_managed_db ? azurerm_mssql_server.main[0].id : ""
}

output "sql_database_name" {
  description = "The name of the Azure SQL Database (MSSQL)"
  value       = var.create_managed_db ? azurerm_mssql_database.main[0].name : ""
}

output "sql_database_id" {
  description = "The ID of the Azure SQL Database (MSSQL)"
  value       = var.create_managed_db ? azurerm_mssql_database.main[0].id : ""
}

# Convenience: expose the Key Vault secret name for the DB connection string
output "database_connection_secret_name" {
  description = "The Key Vault secret name that stores the DB connection string"
  value       = var.create_managed_db ? azurerm_key_vault_secret.database_connection_string[0].name : ""
}

output "database_connection_secret_id" {
  description = "The Key Vault secret id that stores the DB connection string"
  value       = var.create_managed_db ? azurerm_key_vault_secret.database_connection_string[0].id : ""
  sensitive   = true
}

# Key Vault outputs
output "key_vault_name" {
  description = "The name of the Key Vault"
  value       = azurerm_key_vault.main.name
}

output "key_vault_id" {
  description = "The ID of the Key Vault"
  value       = azurerm_key_vault.main.id
}

output "key_vault_uri" {
  description = "The URI of the Key Vault"
  value       = azurerm_key_vault.main.vault_uri
}

# Key Vault Secret IDs
output "jwt_secret_id" {
  description = "The Key Vault secret ID for JWT secret"
  value       = azurerm_key_vault_secret.jwt_secret.id
  sensitive   = true
}

output "storage_connection_secret_id" {
  description = "The Key Vault secret ID for storage connection string"
  value       = azurerm_key_vault_secret.storage_connection_string.id
  sensitive   = true
}

# Key Vault RBAC assignment output for module dependencies
output "key_vault_rbac_assignment" {
  description = "The Key Vault RBAC assignment resource for dependency management"
  value       = azurerm_role_assignment.current_user_kv_admin
}

/* Log Analytics and Application Insights outputs removed to avoid paid telemetry.
  If you need these later, re-add them carefully and consider budget alerts.
*/
