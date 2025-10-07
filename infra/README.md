# Campus Study Buddy Infrastructure

This directory contains the Terraform infrastructure code for the Campus Study Buddy platform, configured for Azure cloud deployment with Docker containerization and GitHub Actions CI/CD.


## 🏗️ Architecture Overview

The following Azure resources are provisioned for the Campus Study Buddy platform (see detailed list below):

## ✅ Infrastructure Status

The infrastructure has been successfully provisioned to Azure subscription `cf028dfd-d156-4146-8706-6225f19a1cab` (University of Witwatersrand Azure for Students).

### Provisioned Resources:
- ✅ Resource Group
- ✅ Virtual Network (VNet)
- ✅ Subnets (Database, Container Apps, Storage)
- ✅ Network Security Groups (Database, Container Apps, Storage)
- ✅ NSG Associations (subnets)
- ✅ Route Table (for Container Apps subnet)
- ✅ Azure Key Vault (with secrets: DB connection, JWT, Storage, Web PubSub)
- ✅ User Assigned Managed Identity (for Container Apps)
- ✅ Azure Container Registry
- ✅ Azure Container Apps Environment
- ✅ API Container App (Backend)
- ✅ Azure Linux App Service Plan (Frontend)
- ✅ Azure Linux Web App (Frontend)
- ✅ Azure SQL Server
- ✅ Azure SQL Database
- ✅ Azure Storage Account (with containers: user-files, study-materials, profile-images)
- ✅ Azure Storage Queues (study-session-notifications, group-meeting-reminders, progress-notifications)
- ✅ Azure Web PubSub (with chat hub)
- ✅ Logic Apps (Reminder Scheduler, Email Notifications)
- ✅ Logic App HTTP Triggers (reminder, email)
- ✅ Logic App Custom Actions (delay, send notification, send email)
- ✅ Terraform State Storage (Azure Storage Account + containers)

### Live Endpoints:
- 🚀 **API Endpoint**: https://csb-prod-ca-api-w0zgifbb--dvhncmj.whiteriver-3b1efee3.southafricanorth.azurecontainerapps.io
- 🌐 **Frontend URL**: https://csb-prod-app-frontend-w0zgifbb.azurewebsites.net

## 🔐 Security Configuration

The infrastructure is configured with development-friendly security settings:

- **Storage Account**: Public access enabled for easier local development
- **Key Vault**: Public network access enabled
- **SQL Database**: Firewall allows all IPs (⚠️ **Tighten for production**)
- **Container Registry**: Admin access enabled for CI/CD

### ⚠️ Production Security Hardening

For production deployment, consider:

1. Enable private endpoints for Storage and Key Vault
2. Restrict SQL Database firewall rules
3. Implement network security groups
4. Enable audit logging
5. Configure backup and disaster recovery

## 💰 Cost Optimization

Configured for Azure for Students subscription limits:

- **SQL Database**: Serverless tier with auto-pause (free tier)
- **Storage Account**: LRS (Locally Redundant Storage)
- **Container Apps**: Scale to zero capability
- **App Service**: Free tier (F1)
- **Web PubSub**: Free tier
- **Key Vault**: Standard tier

## 🛠️ Development Workflow

### For Infrastructure Changes:

1. **Create feature branch:**
   ```bash
   git checkout -b feature/infrastructure-update
   ```

2. **Make changes and test locally:**
   ```bash
   terraform plan -var-file="environments/prod/terraform.tfvars"
   ```

3. **Commit and push:**
   ```bash
   git add .
   git commit -m "feat: description of changes"
   git push origin feature/infrastructure-update
   ```

4. **Create PR** - This triggers `terraform-plan.yml` workflow
5. **Review and merge** - This triggers `terraform-apply.yml` workflow

## 🔍 Troubleshooting

### Common Issues

1. **Terraform Init Fails**
   - Ensure you're logged into Azure: `az login`
   - Check subscription access: `az account show`

---