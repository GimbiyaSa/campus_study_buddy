# Communication Services Module - Outputs
# Output values from the communication services module

# Web PubSub outputs
output "web_pubsub_name" {
  description = "The name of the Web PubSub service"
  value       = azurerm_web_pubsub.main.name
}

output "web_pubsub_id" {
  description = "The ID of the Web PubSub service"
  value       = azurerm_web_pubsub.main.id
}

output "web_pubsub_hostname" {
  description = "The hostname of the Web PubSub service"
  value       = azurerm_web_pubsub.main.hostname
}

output "web_pubsub_primary_connection_string" {
  description = "The primary connection string for Web PubSub"
  value       = azurerm_web_pubsub.main.primary_connection_string
  sensitive   = true
}

output "web_pubsub_secondary_connection_string" {
  description = "The secondary connection string for Web PubSub"
  value       = azurerm_web_pubsub.main.secondary_connection_string
  sensitive   = true
}

output "web_pubsub_primary_access_key" {
  description = "The primary access key for Web PubSub"
  value       = azurerm_web_pubsub.main.primary_access_key
  sensitive   = true
}

output "web_pubsub_secondary_access_key" {
  description = "The secondary access key for Web PubSub"
  value       = azurerm_web_pubsub.main.secondary_access_key
  sensitive   = true
}

# Web PubSub Hub outputs
output "web_pubsub_hub_name" {
  description = "The name of the Web PubSub hub"
  value       = azurerm_web_pubsub_hub.chat_hub.name
}

output "web_pubsub_hub_id" {
  description = "The ID of the Web PubSub hub"
  value       = azurerm_web_pubsub_hub.chat_hub.id
}

# NOTIFICATION HUB OUTPUTS REMOVED
# Reason: Removed Notification Hub resources to avoid charges

# Key Vault Secret IDs
output "web_pubsub_connection_secret_id" {
  description = "The Key Vault secret ID for Web PubSub connection string"
  value       = azurerm_key_vault_secret.web_pubsub_connection_string.id
  sensitive   = true
}

output "web_pubsub_access_key_secret_id" {
  description = "The Key Vault secret ID for Web PubSub access key"
  value       = azurerm_key_vault_secret.web_pubsub_access_key.id
  sensitive   = true
}
