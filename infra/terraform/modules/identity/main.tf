################################################################################
# Module: identity
# Purpose: Create Microsoft Entra External ID (B2C) tenant and Azure AD Application for customer authentication.
# Inputs: application_name, frontend_hostname, key_vault_id, tags
# Outputs: application_client_id, application_object_id, service_principal_object_id, b2c_tenant_name
# Provision order in this module: B2C tenant -> app -> service principal -> secrets -> groups
# Best practices: Use B2C for customer-facing auth, store client secret in Key Vault, configure proper redirect URIs.
################################################################################

# ==============================================================================
# MICROSOFT ENTRA EXTERNAL ID (B2C) CONFIGURATION
# ==============================================================================

# Note: B2C tenant creation requires manual setup through Azure portal
# This configuration assumes B2C tenant already exists
# Create B2C tenant manually: https://portal.azure.com -> Create Resource -> Azure AD B2C

# B2C tenant domain (to be provided as variable)
# Format: <tenant-name>.onmicrosoft.com
locals {
  b2c_tenant_domain = "${var.b2c_tenant_name}.onmicrosoft.com"
  b2c_policy_name   = "B2C_1_${var.b2c_signin_policy}"
}

# ==============================================================================
# DATA SOURCES
# ==============================================================================

data "azuread_client_config" "current" {}

# ==============================================================================
# AZURE AD APPLICATION (for B2C integration)
# ==============================================================================

# ==============================================================================
# AZURE AD APPLICATION
# ==============================================================================

resource "azuread_application" "main" {
  display_name     = var.application_name
  owners           = [data.azuread_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg" # Change to single tenant for simplicity

  # API configuration for B2C
  api {
    mapped_claims_enabled          = false
    requested_access_token_version = 2

    oauth2_permission_scope {
      admin_consent_description  = "Allow the application to access the Campus Study Buddy API on behalf of the signed-in user."
      admin_consent_display_name = "Access Campus Study Buddy API"
      enabled                    = true
      id                         = "00000000-0000-0000-0000-000000000001"
      type                       = "User"
      user_consent_description   = "Allow the application to access the Campus Study Buddy API on your behalf."
      user_consent_display_name  = "Access Campus Study Buddy API"
      value                      = "api.access"
    }
  }

  # App roles for different user types in B2C
  app_role {
    allowed_member_types = ["User"]
    description          = "Students can access student features"
    display_name         = "Student"
    enabled              = true
    id                   = "00000000-0000-0000-0000-000000000002"
    value                = "Student"
  }

  app_role {
    allowed_member_types = ["User"]
    description          = "Tutors can access tutor features"
    display_name         = "Tutor"
    enabled              = true
    id                   = "00000000-0000-0000-0000-000000000003"
    value                = "Tutor"
  }

  app_role {
    allowed_member_types = ["User"]
    description          = "Admins can access administrative features"
    display_name         = "Admin"
    enabled              = true
    id                   = "00000000-0000-0000-0000-000000000004"
    value                = "Admin"
  }

  # Required resource access (Microsoft Graph for B2C)
  required_resource_access {
    resource_app_id = "00000003-0000-0000-c000-000000000000" # Microsoft Graph

    resource_access {
      id   = "e1fe6dd8-ba31-4d61-89e7-88639da4683d" # User.Read
      type = "Scope"
    }

    resource_access {
      id   = "b4e74841-8e56-480b-be8b-910348b18b4c" # User.ReadWrite
      type = "Scope"
    }
  }

  # Web platform configuration for B2C
  web {
    homepage_url = "https://${var.frontend_hostname}"
    logout_url   = "https://${var.frontend_hostname}/logout"
    redirect_uris = [
      "https://${var.frontend_hostname}/auth/callback",
      "https://${var.frontend_hostname}/.auth/login/aad/callback",
      "https://${local.b2c_tenant_domain}/${var.application_name}/oauth2/authresp"
    ]

    implicit_grant {
      access_token_issuance_enabled = true
      id_token_issuance_enabled     = true
    }
  }

  # Single Page Application configuration for B2C
  single_page_application {
    redirect_uris = [
      "https://${var.frontend_hostname}/auth/callback",
      "http://localhost:3000/auth/callback", # For development
      "https://${local.b2c_tenant_domain}/${var.application_name}/oauth2/authresp"
    ]
  }

  tags = [var.environment, var.project_name, "b2c"]
}

# ==============================================================================
# SERVICE PRINCIPAL
# ==============================================================================

resource "azuread_service_principal" "main" {
  client_id                    = azuread_application.main.client_id
  app_role_assignment_required = false
  owners                       = [data.azuread_client_config.current.object_id]

  tags = [var.environment, var.project_name, "terraform"]
}

# ==============================================================================
# APPLICATION PASSWORD (Client Secret)
# ==============================================================================

resource "azuread_application_password" "main" {
  application_id = azuread_application.main.id
  display_name   = "Terraform Managed Secret"
  end_date       = timeadd(timestamp(), "8760h") # 1 year from now
}

# Store client secret in Key Vault
resource "azurerm_key_vault_secret" "client_secret" {
  name         = "aad-client-secret"
  value        = azuread_application_password.main.value
  key_vault_id = var.key_vault_id

  tags = var.tags

  depends_on = [var.key_vault_rbac_assignment]
}

# Store client ID in Key Vault
resource "azurerm_key_vault_secret" "client_id" {
  name         = "aad-client-id"
  value        = azuread_application.main.client_id
  key_vault_id = var.key_vault_id

  tags = var.tags

  depends_on = [var.key_vault_rbac_assignment]
}

# Store tenant ID in Key Vault
resource "azurerm_key_vault_secret" "tenant_id" {
  name         = "aad-tenant-id"
  value        = data.azuread_client_config.current.tenant_id
  key_vault_id = var.key_vault_id

  tags = var.tags

  depends_on = [var.key_vault_rbac_assignment]
}

# Store B2C tenant domain in Key Vault
resource "azurerm_key_vault_secret" "b2c_tenant_domain" {
  name         = "b2c-tenant-domain"
  value        = local.b2c_tenant_domain
  key_vault_id = var.key_vault_id

  tags = var.tags

  depends_on = [var.key_vault_rbac_assignment]
}

# Store B2C policy name in Key Vault
resource "azurerm_key_vault_secret" "b2c_policy_name" {
  name         = "b2c-policy-name"
  value        = local.b2c_policy_name
  key_vault_id = var.key_vault_id

  tags = var.tags

  depends_on = [var.key_vault_rbac_assignment]
}

# ==============================================================================
# AZURE AD GROUPS (Optional)
# ==============================================================================

# Students group
resource "azuread_group" "students" {
  count            = var.enable_azure_ad_groups ? 1 : 0
  display_name     = "${var.naming_prefix}-students"
  description      = "Students group for Campus Study Buddy"
  security_enabled = true
}

# Tutors group
resource "azuread_group" "tutors" {
  count            = var.enable_azure_ad_groups ? 1 : 0
  display_name     = "${var.naming_prefix}-tutors"
  description      = "Tutors group for Campus Study Buddy"
  security_enabled = true
}

# Admins group
resource "azuread_group" "admins" {
  count            = var.enable_azure_ad_groups ? 1 : 0
  display_name     = "${var.naming_prefix}-admins"
  description      = "Administrators group for Campus Study Buddy"
  security_enabled = true
}
