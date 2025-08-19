# Campus Study Buddy - Infrastructure

🏗️ **Infrastructure as Code** for the Campus Study Buddy platform using Terraform and Azure.

## 🚀 Quick Start

This repository contains the complete Azure infrastructure setup for the Campus Study Buddy platform.

### Architecture

- **Azure Container Apps** - API backend hosting (Node.js Express)
- **Azure App Service** - Frontend hosting (React application)
- **Azure SQL Database** - Data storage (Serverless, free tier optimized)
- **Azure Web PubSub** - Real-time chat and communication
- **Azure Key Vault** - Secrets management and secure configuration
- **Azure Storage Account** - File storage and blob containers
- **Azure Virtual Network** - Network isolation and security

## 📋 Prerequisites

- Azure CLI installed and authenticated
- Terraform >= 1.5.0
- Azure subscription with Contributor access
- GitHub repository with production environment configured
- GitHub branch protection rules enabled on `master` branch

## 🔧 Local Development

```bash
# Navigate to terraform directory
cd infra/terraform

# Initialize Terraform
terraform init -backend-config="environments/prod/-backend-config"

# Format code (fix any formatting issues)
terraform fmt -recursive

# Validate configuration
terraform validate

# Plan deployment (validation only)
terraform plan -var-file="environments/prod/terraform.tfvars"
```

### Current Status

✅ **Terraform Formatting Fixed** - All files now pass `terraform fmt -check -recursive`  
✅ **Configuration Validated** - Infrastructure passes `terraform validate`  
🔄 **Ready for Deployment** - Workflows configured for automated CI/CD

### Recent Updates
- Fixed Terraform formatting issues in all modules
- Validated configuration syntax and structure
- Optimized for Azure Free Tier limits

## 🎯 Production Deployment

**Production deployments happen via GitHub Actions only with branch protection!**

### Decoupled CI/CD Workflow:

1. **Create feature branch** from `master`
   ```bash
   git checkout -b feature/infrastructure-update
   ```

2. **Make infrastructure changes** and commit
   ```bash
   git add .
   git commit -m "feat: update infrastructure configuration"
   ```

3. **Push branch** → Triggers `terraform-plan.yml` workflow ✅
   ```bash
   git push origin feature/infrastructure-update
   ```

4. **Verify plan passes** in GitHub Actions
   - Check **Actions** → **Terraform Plan** workflow
   - Ensure terraform formatting check succeeds (`terraform fmt -check -recursive`)
   - Ensure terraform validation succeeds (`terraform validate`)
   - Review planned infrastructure changes

5. **Create Pull Request** to `master`
   ```bash
   gh pr create --title "Infrastructure update" --body "Description of changes"
   ```

6. **Get team review** and approval on PR
   - Code review process
   - Team reviews infrastructure changes
   - All checks must pass

7. **Merge PR** → Triggers `terraform-apply.yml` workflow with **manual approval**
   ```bash
   gh pr merge --merge
   ```

### Workflow Architecture:
- 🔄 **terraform-plan.yml** - Validation on feature branch push
- 🚀 **terraform-apply.yml** - Deployment on PR merge

### Key Features:
- ✅ **Branch protection** - No direct pushes to master allowed
- ✅ **Decoupled workflows** - Each workflow has single responsibility
- ✅ **PR merge trigger** - Apply only runs when PR is merged to master
- ✅ **Environment secrets** - All credentials in production environment

## 📁 Structure

```
infra/
├── terraform/
│   ├── environments/
│   │   └── prod/
│   │       ├── terraform.tfvars     # Production configuration values
│   │       └── -backend-config      # Terraform backend settings
│   ├── modules/
│   │   ├── core/          # Storage, Azure SQL Database, Key Vault
│   │   ├── compute/       # Container Apps, App Service (React frontend)
│   │   ├── network/       # VNet, Subnets, NSGs, Route Tables
│   │   ├── communication/ # Web PubSub, Notification Services
│   │   ├── identity/      # Azure AD, Service Principals, RBAC
│   │   └── automation/    # Logic Apps, Service Bus, Monitoring
│   ├── main.tf            # Main Terraform configuration
│   ├── variables.tf       # Input variables with validation
│   ├── locals.tf          # Local values and naming conventions
│   ├── outputs.tf         # Output values
│   ├── data.tf            # Data sources
│   └── provider.tf        # Azure provider configuration
└── .github/
    └── workflows/
        ├── terraform-plan.yml      # Validation workflow (all branches except master)
        └── terraform-apply.yml     # Deployment workflow (PR merge to master)
```

## 🤝 Contributing

### Standard Development Flow:

1. **Create feature branch** from `master`
2. **Make infrastructure changes** 
3. **Push branch** → **terraform-plan.yml** validates changes
4. **Verify plan succeeds** ✅ in GitHub Actions
5. **Create Pull Request** for team review
6. **Team approves PR** and merges to master
8. **Auto-Approve deployment** → Infrastructure deployed to Azure

## 🔐 Security & Environment Setup

### GitHub Environment Configuration:
All secrets are stored in the **production environment**:

**Required Secrets:**
- `AZURE_CLIENT_ID` - Service Principal Client ID
- `AZURE_CLIENT_SECRET` - Service Principal Secret
- `AZURE_SUBSCRIPTION_ID` - Azure Subscription ID
- `AZURE_TENANT_ID` - Azure Tenant ID
- `TF_VAR_database_admin_password` - Database admin password

**Environment Protection:**
- **Required reviewers** - Manual approval for deployments
- **Branch protection** - Master branch protected from direct pushes
- **Environment-only secrets** - No repository-level secrets

### Branch Protection Rules:
- ✅ **Require pull request reviews** before merging
- ✅ **Require status checks** to pass (terraform-plan)
- ✅ **Require branches to be up to date** before merging
- ✅ **Restrict pushes** to master branch

## 🔍 Workflow Details

### terraform-plan.yml
- **Trigger**: Push to any branch except `master`
- **Purpose**: Validate terraform configuration and formatting
- **Steps**: 
  - `terraform init` with backend config
  - `terraform fmt -check -recursive` (formatting validation)
  - `terraform validate` (syntax validation)  
  - `terraform plan` (infrastructure planning)
- **Environment**: Uses production environment secrets
- **Approval**: None required (validation only)

### terraform-apply.yml
- **Trigger**: Pull request merged to `master`
- **Purpose**: Deploy infrastructure to Azure
- **Steps**:
  - `terraform init` with backend config
  - `terraform plan` (show planned changes)
  - `terraform apply -auto-approve` (deploy infrastructure)
- **Environment**: Uses production environment secrets
- **Approval**: Automatic after PR merge (uses environment protection rules)

## 🚨 Important Notes

### DO NOT:
- ❌ Deploy production infrastructure locally
- ❌ Store secrets at repository level (use environment only)
- ❌ Bypass the GitHub Actions workflows
- ❌ Push directly to `master` branch (protected)
- ❌ Skip the code review process
- ❌ Ignore Terraform formatting requirements

### DO:
- ✅ Use separate workflows for different operations
- ✅ Test infrastructure changes in feature branches
- ✅ Create PRs for all infrastructure changes
- ✅ Review plan output before approving deployment
- ✅ Use production environment for all secrets
- ✅ Follow branch protection and approval processes
- ✅ Run `terraform fmt` locally before committing
- ✅ Validate configuration with `terraform validate`

## 🔧 Troubleshooting

### Common Issues

**Terraform Formatting Errors**
```bash
# Error: terraform fmt -check -recursive failed
# Solution: Run format command locally
cd infra/terraform
terraform fmt -recursive
git add . && git commit -m "fix: format terraform files"
```

**Backend Configuration Issues**
```bash
# Error: Backend initialization failed
# Check backend configuration file exists and has correct settings
ls environments/prod/-backend-config
```

**Secret/Environment Variable Issues**
- Ensure all required secrets are set in GitHub production environment
- Verify secret names match exactly what's expected in workflows
- Check that production environment is configured with proper protection rules

**Validation Errors**
```bash
# Run validation locally to debug
terraform validate
terraform plan -var-file="environments/prod/terraform.tfvars"
```