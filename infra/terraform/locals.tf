// Local values used across the Terraform configuration
// Defines common tags, naming conventions using Azure CAF abbreviations, and helpers.

locals {
  # Common tags applied to all resources
  common_tags = merge(var.tags, {
    Environment = var.environment
    Project     = "csb" # Campus Study Buddy abbreviation
    ManagedBy   = "terraform"
    Owner       = "DevOps"
    Purpose     = "Production environment for campus study buddy application"
    CostCenter  = "Education"
  })

  # Naming convention using Azure CAF abbreviations
  # Format: {project}-{environment}-{resource-type}-{suffix}
  project_abbrev = "csb"  # Campus Study Buddy
  env_abbrev     = "prod" # Production environment only

  # Core naming patterns
  naming_prefix = "${local.project_abbrev}-${local.env_abbrev}"

  # Resource group name using abbreviated naming
  resource_group_name = "${local.naming_prefix}-rg"

  # Location abbreviations for Azure regions (CAF compliant)
  location_short = {
    "southafricanorth" = "san"
    "southafricawest"  = "saw"
    "eastus"           = "eus"
    "westus2"          = "wus2"
  }

  # Current location abbreviation
  location_abbrev = local.location_short[var.location]
}
