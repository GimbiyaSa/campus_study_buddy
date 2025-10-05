################################################################################
# Core Infrastructure Module
# Purpose: Provisions storage account, Azure SQL Database, and Key Vault for Campus Study Buddy
# Resources: Storage Account (st), SQL Server (sql), SQL Database (sqldb), Key Vault (kv)
# Naming: Uses Azure CAF abbreviations for consistent resource naming
# Free Tier: All resources configured within Azure free tier limits
# Security: RBAC enabled, secure defaults, managed identities
################################################################################

# ==============================================================================
# DATA SOURCES
# ==============================================================================

data "azurerm_client_config" "current" {}

# ==============================================================================
# STORAGE ACCOUNT
# ==============================================================================

# Storage Account - using 'st' abbreviation per Azure CAF
# Configured for free tier with LRS replication and Standard performance
resource "azurerm_storage_account" "main" {
  # Format: {project}{env}st{location}{suffix} (max 24 chars, lowercase alphanumeric)
  name = substr(
    lower(replace("${var.project_abbrev}${var.env_abbrev}st${var.location_abbrev}${var.random_suffix}", "-", "")),
    0, 24
  )
  resource_group_name = var.resource_group_name
  location            = var.location

  # Free tier configuration
  account_tier             = var.storage_account_tier             # Standard
  account_replication_type = var.storage_account_replication_type # LRS

  # Security hardening - relaxed for local development
  allow_nested_items_to_be_public = true # Allow public access for easier local dev
  shared_access_key_enabled       = true
  public_network_access_enabled   = true

  # Enable CORS for local development
  network_rules {
    default_action = "Allow"
    bypass         = ["AzureServices"]
  }

  # Blob properties for security
  blob_properties {
    delete_retention_policy {
      days = 7
    }

    container_delete_retention_policy {
      days = 7
    }
  }

  tags = var.common_tags
}

# Storage containers for application data segregation
resource "azurerm_storage_container" "user_files" {
  name                  = "user-files"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "study_materials" {
  name                  = "study-materials"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

resource "azurerm_storage_container" "profile_images" {
  name                  = "profile-images"
  storage_account_id    = azurerm_storage_account.main.id
  container_access_type = "private"
}

# ==============================================================================
# KEY VAULT
# ==============================================================================

# Key Vault - using 'kv' abbreviation per Azure CAF
# Configured with RBAC authorization and secure defaults
resource "azurerm_key_vault" "main" {
  # Format: {project}-{env}-kv-{location}-{suffix} (max 24 chars)
  name = substr(
    "${var.naming_prefix}-kv-${var.location_abbrev}-${var.random_suffix}",
    0, 24
  )
  resource_group_name = var.resource_group_name
  location            = var.location
  tenant_id           = data.azurerm_client_config.current.tenant_id

  # Standard SKU for free tier
  sku_name = "standard"

  # Security configuration - relaxed for local development
  soft_delete_retention_days = var.key_vault_soft_delete_retention_days
  purge_protection_enabled   = false # Disabled for easier cleanup in dev
  enable_rbac_authorization  = true  # Keep RBAC for managed identities

  # Network access (public for easier local access)
  public_network_access_enabled = true

  # Allow all Azure services to bypass network rules
  network_acls {
    default_action = "Allow"
    bypass         = "AzureServices"
  }

  tags = var.common_tags
}

# RBAC assignment for current user to manage Key Vault
resource "azurerm_role_assignment" "current_user_kv_admin" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Administrator"
  principal_id         = data.azurerm_client_config.current.object_id
}

# ==============================================================================
# AZURE SQL DATABASE
# ==============================================================================

# SQL Server - using 'sql' abbreviation per Azure CAF
# Configured within free tier limits
resource "azurerm_mssql_server" "main" {
  count = var.create_managed_db ? 1 : 0

  # Format: {project}-{env}-sql-{location}-{suffix}
  name                = "${var.naming_prefix}-sql-${var.location_abbrev}-${var.random_suffix}"
  resource_group_name = var.resource_group_name
  location            = var.location

  # Authentication
  administrator_login          = var.database_admin_username
  administrator_login_password = var.database_admin_password

  # Security configuration - relaxed for local development
  version                       = "12.0"
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true

  # Allow Azure services to access the server
  azuread_administrator {
    login_username = data.azurerm_client_config.current.object_id
    object_id      = data.azurerm_client_config.current.object_id
  }

  tags = var.common_tags
}

# SQL Database - using 'sqldb' abbreviation per Azure CAF
# Configured for free tier (100,000 vCore seconds serverless)
resource "azurerm_mssql_database" "main" {
  count = var.create_managed_db ? 1 : 0

  # Format: {project}-{env}-sqldb-{suffix}
  name      = "${var.naming_prefix}-sqldb-${var.random_suffix}"
  server_id = azurerm_mssql_server.main[0].id

  # Free tier configuration - Serverless with auto-pause
  sku_name                    = "GP_S_Gen5_1" # Serverless, 1 vCore
  max_size_gb                 = 32            # Free tier limit
  min_capacity                = 0.5           # Minimum compute
  auto_pause_delay_in_minutes = 60            # Auto-pause after 1 hour

  tags = var.common_tags
}

# Allow Azure services to access the SQL server
resource "azurerm_mssql_firewall_rule" "azure_services" {
  count = var.create_managed_db ? 1 : 0

  name             = "AllowAzureServices"
  server_id        = azurerm_mssql_server.main[0].id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

# Allow all IP addresses for local development (remove in production)
resource "azurerm_mssql_firewall_rule" "allow_all" {
  count = var.create_managed_db ? 1 : 0

  name             = "AllowAll"
  server_id        = azurerm_mssql_server.main[0].id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "255.255.255.255"
}

# ==============================================================================
# KEY VAULT SECRETS
# ==============================================================================

# Generate JWT secret
resource "random_string" "jwt_secret" {
  length  = 32
  special = true
  upper   = false
}

# Database connection string secret
# ==============================================================================

# Database connection string secret
resource "azurerm_key_vault_secret" "database_connection_string" {
  count = var.create_managed_db ? 1 : 0

  name         = "database-connection-string"
  value        = "Server=tcp:${azurerm_mssql_server.main[0].fully_qualified_domain_name},1433;Database=${azurerm_mssql_database.main[0].name};User Id=${var.database_admin_username};Password=${var.database_admin_password};Encrypt=true;TrustServerCertificate=false;Connection Timeout=30;"
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.current_user_kv_admin]
  tags       = var.common_tags
}

# Storage account connection string secret
resource "azurerm_key_vault_secret" "storage_connection_string" {
  name         = "storage-connection-string"
  value        = azurerm_storage_account.main.primary_connection_string
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.current_user_kv_admin]
  tags       = var.common_tags
}

# JWT secret for application authentication
resource "azurerm_key_vault_secret" "jwt_secret" {
  name         = "jwt-secret"
  value        = random_string.jwt_secret.result
  key_vault_id = azurerm_key_vault.main.id

  depends_on = [azurerm_role_assignment.current_user_kv_admin]
  tags       = var.common_tags
}