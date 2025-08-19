// Data sources shared across modules
// Provides Azure AD and AzureRM client configuration data sources used by
// multiple modules (tenant, object id, subscription, etc.).

data "azurerm_client_config" "current" {}
data "azuread_client_config" "current" {}