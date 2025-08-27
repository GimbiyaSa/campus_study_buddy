################################################################################
# Module: communication
# Purpose: Provision Web PubSub for real-time chat (Notification Hubs removed to avoid charges)
# Inputs: resource_group_name, location, naming_prefix, web_pubsub_sku, key_vault_id (optional), tags
# Outputs: web_pubsub_primary_connection_string, web_pubsub_hostname
# Provision order in this module: web pubsub -> hubs -> store secrets in Key Vault
# Best practices: avoid exposing keys; store in Key Vault; use managed identity/event handlers for secure processing.
################################################################################

# ==============================================================================
# WEB PUBSUB SERVICE
# ==============================================================================

resource "azurerm_web_pubsub" "main" {
  name                = "${var.naming_prefix}-pubsub-${var.random_suffix}"
  location            = var.location
  resource_group_name = var.resource_group_name

  sku      = var.web_pubsub_sku
  capacity = 1

  # CORS settings for web clients
  live_trace {
    enabled                   = true
    messaging_logs_enabled    = true
    connectivity_logs_enabled = true
  }

  # Public network access
  public_network_access_enabled = true

  # Local authentication
  local_auth_enabled = true

  # AAD authentication
  aad_auth_enabled = true

  tags = var.tags
}

# Web PubSub Hub for chat functionality
resource "azurerm_web_pubsub_hub" "chat_hub" {
  name          = "chat_hub"
  web_pubsub_id = azurerm_web_pubsub.main.id

  # Event handlers for chat messages
  dynamic "event_handler" {
    for_each = var.managed_identity_id != null ? [1] : []
    content {
      url_template       = "https://{api-hostname}/api/chat/webhook/{event}"
      user_event_pattern = "*"
      system_events      = ["connect", "connected", "disconnected"]

      auth {
        managed_identity_id = var.managed_identity_id
      }
    }
  }

  # Disable anonymous connections for production; require AAD auth
  anonymous_connections_enabled = false
}

# Store Web PubSub connection string in Key Vault
resource "azurerm_key_vault_secret" "web_pubsub_connection_string" {
  name         = "web-pubsub-connection-string"
  value        = azurerm_web_pubsub.main.primary_connection_string
  key_vault_id = var.key_vault_id

  depends_on = [var.key_vault_rbac_assignment]
  tags       = var.tags
}

resource "azurerm_key_vault_secret" "web_pubsub_access_key" {
  name         = "web-pubsub-access-key"
  value        = azurerm_web_pubsub.main.primary_access_key
  key_vault_id = var.key_vault_id

  depends_on = [var.key_vault_rbac_assignment]
  tags       = var.tags
}

# ==============================================================================
# NOTIFICATION HUB REMOVED TO AVOID AVAILABILITY ZONE CHARGES
# ==============================================================================

# REMOVED: Notification Hub Namespace and Hub resources
# Reason: Even with "Free" SKU, Azure charges for Availability Zones
# Alternative: Use Web PubSub for notifications or implement push notifications
# via browser APIs and your own notification service

# ==============================================================================
# COMMUNICATION SERVICES (Optional for future email/SMS)
# ==============================================================================

# Communication Service for email and SMS (future feature)
/* Removed Azure Communication Service to avoid paid SMS/email services. Use external providers or optional modules later. */
