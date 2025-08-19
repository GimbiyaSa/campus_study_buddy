################################################################################
# Module: network
# Purpose: Create virtual network, subnets, NSGs, and route tables for Campus Study Buddy.
# Inputs: resource_group_name, location, naming_prefix, vnet_address_space, subnet prefixes, tags
# Outputs: virtual_network_id, subnet ids, nsg ids, route table id (see module outputs.tf)
# Provision order in this module: virtual network -> subnets -> NSGs -> NSG associations -> route table
# Best practices: keep network layout minimal and predictable; use service endpoints/private endpoints for PaaS; attach NSGs to subnets, not individual NICs; avoid wide open rules.
################################################################################

# ==============================================================================
# VIRTUAL NETWORK
# ==============================================================================

resource "azurerm_virtual_network" "main" {
  name                = "${var.naming_prefix}-vnet"
  address_space       = var.vnet_address_space
  location            = var.location
  resource_group_name = var.resource_group_name

  tags = var.tags
}

# ==============================================================================
# SUBNETS
# ==============================================================================

# Database subnet with service endpoints for SQL Database
resource "azurerm_subnet" "database" {
  name                 = "${var.naming_prefix}-database-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = var.database_subnet_address_prefixes

  service_endpoints = [
    "Microsoft.Sql",
    "Microsoft.Storage"
  ]

  # No delegation needed for Azure SQL Database (serverless)
  # Delegation is only for Managed Instances, not SQL Database
}

# Container Apps subnet (requires delegation)
resource "azurerm_subnet" "container_apps" {
  name                 = "${var.naming_prefix}-container-apps-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = var.container_apps_subnet_address_prefixes

  service_endpoints = [
    "Microsoft.Storage",
    "Microsoft.KeyVault",
    "Microsoft.Sql"
  ]

  # Note: Delegation removed - let Container App Environment handle it
  # This prevents the "SubnetIsDelegated" error
}

# Storage subnet with private endpoints

# Storage subnet with private endpoints
resource "azurerm_subnet" "storage" {
  name                 = "${var.naming_prefix}-storage-subnet"
  resource_group_name  = var.resource_group_name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = var.storage_subnet_address_prefixes

  service_endpoints = [
    "Microsoft.Storage"
  ]
}

# ==============================================================================
# NETWORK SECURITY GROUPS
# ==============================================================================

# Database NSG
resource "azurerm_network_security_group" "database" {
  name                = "${var.naming_prefix}-database-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "AllowSqlFromContainerApps"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "1433" # SQL Server port, not PostgreSQL
    source_address_prefixes    = var.container_apps_subnet_address_prefixes
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

# Container Apps NSG
resource "azurerm_network_security_group" "container_apps" {
  name                = "${var.naming_prefix}-container-apps-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "AllowHttpsInbound"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowHttpInbound"
    priority                   = 1002
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "80"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "AllowContainerAppsManagement"
    priority                   = 1003
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_ranges    = ["8080", "8081"]
    source_address_prefix      = "AzureCloud"
    destination_address_prefix = "*"
  }

  tags = var.tags
}

# Storage NSG
resource "azurerm_network_security_group" "storage" {
  name                = "${var.naming_prefix}-storage-nsg"
  location            = var.location
  resource_group_name = var.resource_group_name

  security_rule {
    name                       = "AllowStorageFromContainerApps"
    priority                   = 1001
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "443"
    source_address_prefixes    = var.container_apps_subnet_address_prefixes
    destination_address_prefix = "*"
  }

  tags = var.tags
}

# ==============================================================================
# NSG ASSOCIATIONS
# ==============================================================================

resource "azurerm_subnet_network_security_group_association" "database" {
  subnet_id                 = azurerm_subnet.database.id
  network_security_group_id = azurerm_network_security_group.database.id
}

resource "azurerm_subnet_network_security_group_association" "container_apps" {
  subnet_id                 = azurerm_subnet.container_apps.id
  network_security_group_id = azurerm_network_security_group.container_apps.id
}

resource "azurerm_subnet_network_security_group_association" "storage" {
  subnet_id                 = azurerm_subnet.storage.id
  network_security_group_id = azurerm_network_security_group.storage.id
}

# ==============================================================================
# ROUTE TABLES (Optional for future use)
# ==============================================================================

resource "azurerm_route_table" "main" {
  name                = "${var.naming_prefix}-route-table"
  location            = var.location
  resource_group_name = var.resource_group_name

  route {
    name           = "ToInternet"
    address_prefix = "0.0.0.0/0"
    next_hop_type  = "Internet"
  }

  tags = var.tags
}

# Associate route table with Container Apps subnet
resource "azurerm_subnet_route_table_association" "container_apps" {
  subnet_id      = azurerm_subnet.container_apps.id
  route_table_id = azurerm_route_table.main.id
}
