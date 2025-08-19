################################################################################
# Compute Module
# Purpose: Provisions Container Apps environment and API container app for Campus Study Buddy
# Resources: Container Apps Environment (cae), Container App (ca), User Assigned Identity (id)
# Free Tier: Container Apps provides 180,000 vCPU seconds and 360,000 GiB seconds monthly
# Architecture: Serverless containers with auto-scaling from 0 to reduce costs
# Security: Managed identity for Key Vault access, RBAC assignments
################################################################################

# ==============================================================================
# CONTAINER APPS ENVIRONMENT
# ==============================================================================

# Container Apps Environment - using 'cae' abbreviation per Azure CAF
resource "azurerm_container_app_environment" "main" {
  # Format: {project}-{env}-cae-{location}-{suffix}
  name                     = "${var.naming_prefix}-cae-${var.location_abbrev}-${var.random_suffix}"
  resource_group_name      = var.resource_group_name
  location                 = var.location
  infrastructure_subnet_id = var.subnet_id

  tags = var.common_tags
}

# ==============================================================================
# MANAGED IDENTITY
# ==============================================================================

# User Assigned Identity for Container Apps - using 'id' abbreviation per Azure CAF
resource "azurerm_user_assigned_identity" "container_apps" {
  # Format: {project}-{env}-id-ca-{suffix}
  name                = "${var.naming_prefix}-id-ca-${var.random_suffix}"
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = var.common_tags
}

# ==============================================================================
# RBAC ASSIGNMENTS
# ==============================================================================

# Key Vault Secrets User role for accessing application secrets
resource "azurerm_role_assignment" "container_apps_kv_secrets_user" {
  scope                = var.key_vault_id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.container_apps.principal_id
}

# Storage Blob Data Contributor for file operations
resource "azurerm_role_assignment" "container_apps_storage_contributor" {
  scope                = var.storage_account_id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_user_assigned_identity.container_apps.principal_id
}

# ==============================================================================
# API CONTAINER APP
# ==============================================================================

# API Container App - using 'ca' abbreviation per Azure CAF
resource "azurerm_container_app" "api" {
  # Format: {project}-{env}-ca-api-{suffix}
  name                         = "${var.naming_prefix}-ca-api-${var.random_suffix}"
  container_app_environment_id = azurerm_container_app_environment.main.id
  resource_group_name          = var.resource_group_name
  revision_mode                = "Single"

  template {
    # Free tier optimization: Scale to 0 when idle
    min_replicas = var.container_apps_min_replicas # Should be 0 for free tier
    max_replicas = var.container_apps_max_replicas # Limit to control costs

    container {
      name   = "api"
      image  = var.api_container_image         # Node.js Express API
      cpu    = var.container_apps_cpu_limit    # 0.25 for free tier
      memory = var.container_apps_memory_limit # 0.5Gi for free tier

      # Application configuration
      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      # Database connection from Key Vault
      env {
        name        = "DATABASE_URL"
        secret_name = "database-connection-string"
      }

      # JWT configuration from Key Vault
      env {
        name        = "JWT_SECRET"
        secret_name = "jwt-secret"
      }

      env {
        name  = "JWT_EXPIRES_IN"
        value = "7d"
      }

      # Storage configuration from Key Vault
      env {
        name        = "AZURE_STORAGE_CONNECTION_STRING"
        secret_name = "storage-connection-string"
      }

      env {
        name  = "AZURE_STORAGE_CONTAINER_NAME"
        value = "user-files"
      }

      # CORS configuration for frontend
      env {
        name  = "CORS_ORIGIN"
        value = var.cors_origin
      }

      # Rate limiting for free tier protection
      env {
        name  = "RATE_LIMIT_WINDOW_MS"
        value = "900000" # 15 minutes
      }

      env {
        name  = "RATE_LIMIT_MAX_REQUESTS"
        value = "100"
      }
    }

    # Auto-scaling configuration
    http_scale_rule {
      name                = "http-requests"
      concurrent_requests = 10 # Conservative for free tier
    }
  }

  # External access configuration
  ingress {
    allow_insecure_connections = false
    external_enabled           = true
    target_port                = 3000
    transport                  = "http"

    traffic_weight {
      percentage      = 100
      latest_revision = true
    }
  }

  # Key Vault secrets configuration
  secret {
    name                = "database-connection-string"
    key_vault_secret_id = var.database_connection_secret_id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }

  secret {
    name                = "jwt-secret"
    key_vault_secret_id = var.jwt_secret_id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }

  secret {
    name                = "storage-connection-string"
    key_vault_secret_id = var.storage_connection_secret_id
    identity            = azurerm_user_assigned_identity.container_apps.id
  }

  # Managed identity configuration
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.container_apps.id]
  }

  tags = var.common_tags

  depends_on = [
    azurerm_role_assignment.container_apps_kv_secrets_user,
    azurerm_role_assignment.container_apps_storage_contributor
  ]
}

# ==============================================================================
# FRONTEND APP SERVICE
# ==============================================================================

# App Service Plan for Frontend - using 'plan' abbreviation per Azure CAF
resource "azurerm_service_plan" "frontend" {
  # Format: {project}-{env}-plan-frontend-{suffix}
  name                = "${var.naming_prefix}-plan-frontend-${var.random_suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location

  # Free tier configuration
  os_type  = "Linux"
  sku_name = var.app_service_plan_sku # This should be "F1" for free tier

  tags = var.common_tags
}

# Linux Web App for React frontend - using 'app' abbreviation per Azure CAF
resource "azurerm_linux_web_app" "frontend" {
  # Format: {project}-{env}-app-frontend-{suffix}
  name                = "${var.naming_prefix}-app-frontend-${var.random_suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location
  service_plan_id     = azurerm_service_plan.frontend.id

  site_config {
    # Node.js runtime for React application
    application_stack {
      node_version = "18-lts"
    }

    # Enable health check
    health_check_path                 = "/"
    health_check_eviction_time_in_min = 2

    # Always on disabled for free tier
    always_on = false
  }

  # App settings for API integration
  app_settings = {
    "API_URL"     = "https://${azurerm_container_app.api.latest_revision_fqdn}"
    "API_VERSION" = "v1"
    "NODE_ENV"    = var.environment
  }

  tags = var.common_tags
}
