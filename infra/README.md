# Campus Study Buddy Infrastructure

This directory contains the Terraform infrastructure code for the Campus Study Buddy platform, configured for Azure cloud deployment with Docker containerization and GitHub Actions CI/CD.

## 🏗️ Architecture Overview

The infrastructure includes:

- **Azure Container Registry** - For storing Docker images
- **Azure Container Apps** - For running the backend API
- **Azure App Service** - For hosting the frontend
- **Azure SQL Database** - For data storage (serverless tier)
- **Azure Storage Account** - For file storage (LRS for cost optimization)
- **Azure Key Vault** - For secrets management
- **Azure Web PubSub** - For real-time communication
- **Virtual Network** - For network isolation

## ✅ Infrastructure Status

The infrastructure has been successfully provisioned to Azure subscription `cf028dfd-d156-4146-8706-6225f19a1cab` (University of Witwatersrand Azure for Students).

### Provisioned Resources:
- ✅ Resource Group: `csb-prod-rg`
- ✅ Terraform State Storage: `csbprodtfstate`
- ✅ Azure Container Registry: `csbprodcrsanw0zgifbb.azurecr.io`
- ✅ Azure Container Apps Environment: `csb-prod-cae-san-w0zgifbb`
- ✅ Azure SQL Database (Serverless)
- ✅ Azure Storage Account (LRS)
- ✅ Azure Key Vault
- ✅ Virtual Network: `csb-prod-vnet`

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

2. **Resource Provider Registration**
   - Register required providers: `az provider register --namespace Microsoft.App`

3. **Container App Deployment Fails**
   - Verify image exists in ACR
   - Check container app logs: `az containerapp logs show`

4. **PIM Permission Issues**
   - Activate your Owner role in Azure Portal PIM
   - Wait 5-10 minutes for permissions to propagate

## 📋 Next Steps

1. **Configure GitHub Actions Secrets** (see workflows documentation)
2. **Deploy Backend Application** to Container Apps
3. **Deploy Frontend Application** to App Service
4. **Set up monitoring and logging**
5. **Configure custom domain and SSL**

---

**Infrastructure provisioned successfully! 🎉**  
Ready for application deployment and CI/CD setup.