# Campus Study Buddy - Production Environment Configuration
# Optimized for Azure Free Tier and student use

# ==============================================================================
# BASIC CONFIGURATION
# ==============================================================================
environment  = "prod"
project_name = "csb"              # Campus Study Buddy abbreviated
location     = "southafricanorth" # Azure for Students supported region

# ==============================================================================
# NETWORKING CONFIGURATION (FREE TIER OPTIMIZED)
# ==============================================================================
vnet_address_space                     = ["10.0.0.0/16"]
database_subnet_address_prefixes       = ["10.0.1.0/24"]
container_apps_subnet_address_prefixes = ["10.0.2.0/23"] # Container Apps requires /23 minimum
storage_subnet_address_prefixes        = ["10.0.4.0/24"]

# ==============================================================================
# DATABASE CONFIGURATION (FREE TIER)
# ==============================================================================
database_admin_username = "csb_admin"
create_managed_db       = true
enable_sql_database     = true

# ==============================================================================
# COMPUTE CONFIGURATION (FREE TIER OPTIMIZED)
# ==============================================================================
api_container_image         = "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest" # Temporary placeholder
container_apps_cpu_limit    = "0.25"           # Free tier: 0.25 CPU
container_apps_memory_limit = "0.5Gi"          # Free tier: 0.5 GB memory
container_apps_min_replicas = 0                # Scale to zero for cost optimization
container_apps_max_replicas = 3                # Limit replicas for free tier

# ==============================================================================
# STORAGE CONFIGURATION (FREE TIER)
# ==============================================================================
storage_account_tier             = "Standard"
storage_account_replication_type = "LRS" # Locally redundant for free tier

# ==============================================================================
# SECURITY CONFIGURATION
# ==============================================================================
key_vault_soft_delete_retention_days = 7 # Minimum for testing

# ==============================================================================
# COMMUNICATION SERVICES (FREE TIER)
# ==============================================================================
web_pubsub_sku = "Free_F1" # Free tier: 20 connections, 20K messages/day

# ==============================================================================
# IDENTITY CONFIGURATION
# ==============================================================================
application_name       = "Campus Study Buddy"
frontend_hostname      = "csb-prod.azurestaticapps.net"
b2c_tenant_name        = "csbprod"
b2c_signin_policy      = "signupsignin"
enable_azure_ad_groups = false

# ==============================================================================
# STATIC WEB APP CONFIGURATION (FREE TIER)
# ==============================================================================
static_web_app_sku_tier = "Free" # Free tier: 100 GB bandwidth, 0.5 GB storage
