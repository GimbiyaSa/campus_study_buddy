# Networking Module - Outputs
# Output values from the networking module

# Virtual Network outputs
output "virtual_network_name" {
  description = "The name of the virtual network"
  value       = azurerm_virtual_network.main.name
}

output "virtual_network_id" {
  description = "The ID of the virtual network"
  value       = azurerm_virtual_network.main.id
}

output "virtual_network_address_space" {
  description = "The address space of the virtual network"
  value       = azurerm_virtual_network.main.address_space
}

# Subnet outputs
output "database_subnet_name" {
  description = "The name of the database subnet"
  value       = azurerm_subnet.database.name
}

output "database_subnet_id" {
  description = "The ID of the database subnet"
  value       = azurerm_subnet.database.id
}

output "container_apps_subnet_name" {
  description = "The name of the container apps subnet"
  value       = azurerm_subnet.container_apps.name
}

output "container_apps_subnet_id" {
  description = "The ID of the container apps subnet"
  value       = azurerm_subnet.container_apps.id
}

output "storage_subnet_name" {
  description = "The name of the storage subnet"
  value       = azurerm_subnet.storage.name
}

output "storage_subnet_id" {
  description = "The ID of the storage subnet"
  value       = azurerm_subnet.storage.id
}

# Network Security Group outputs
output "database_nsg_id" {
  description = "The ID of the database network security group"
  value       = azurerm_network_security_group.database.id
}

output "container_apps_nsg_id" {
  description = "The ID of the container apps network security group"
  value       = azurerm_network_security_group.container_apps.id
}

output "storage_nsg_id" {
  description = "The ID of the storage network security group"
  value       = azurerm_network_security_group.storage.id
}

# Route Table outputs
output "route_table_name" {
  description = "The name of the route table"
  value       = azurerm_route_table.main.name
}

output "route_table_id" {
  description = "The ID of the route table"
  value       = azurerm_route_table.main.id
}
