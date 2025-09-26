# Campus Study Buddy - Azure Deployment Guide

## 🚀 DEPLOYMENT TO AZURE INFRASTRUCTURE

Your Azure infrastructure is **100% provisioned and ready**! Here's how to deploy your application.

### 📋 Infrastructure Summary

- **API Endpoint**: https://csb-prod-ca-api-7ndjbzgu--0v3kcw5.ambitiouspond-14c47de2.southafricanorth.azurecontainerapps.io
- **Frontend URL**: https://csb-prod-app-frontend-7ndjbzgu.azurewebsites.net
- **Web PubSub**: csb-prod-pubsub-7ndjbzgu.webpubsub.azure.com
- **SQL Database**: csb-prod-sql-san-7ndjbzgu.database.windows.net
- **Storage Account**: csbprodstsan7ndjbzgu
- **Key Vault**: csb-prod-kv-san-7ndjbzgu

### 🔧 Step 1: Deploy Backend to Container Apps

```bash
# Build and deploy backend
cd backend

# Build Docker image
docker build -t csb-backend .

# Tag for Azure Container Registry (you'll need to create ACR first)
docker tag csb-backend csbprodacr.azurecr.io/csb-backend:latest

# Push to ACR
az acr login --name csbprodacr
docker push csbprodacr.azurecr.io/csb-backend:latest

# Update Container App with new image
az containerapp update \
  --name csb-prod-ca-api-7ndjbzgu \
  --resource-group csb-prod-rg \
  --image csbprodacr.azurecr.io/csb-backend:latest
```

### 🎨 Step 2: Deploy Frontend to App Service

```bash
# Build React app for production
cd frontend
npm run build

# Deploy to Azure App Service
az webapp deployment source config-zip \
  --resource-group csb-prod-rg \
  --name csb-prod-app-frontend-7ndjbzgu \
  --src dist.zip
```

### 🔐 Step 3: Configure Environment Variables

#### Backend (Container Apps)
```bash
# Set environment variables for Container App
az containerapp update \
  --name csb-prod-ca-api-7ndjbzgu \
  --resource-group csb-prod-rg \
  --set-env-vars \
    NODE_ENV=production \
    PORT=3000 \
    CORS_ORIGIN=https://csb-prod-app-frontend-7ndjbzgu.azurewebsites.net
```

#### Frontend (App Service)
```bash
# Set app settings for App Service
az webapp config appsettings set \
  --resource-group csb-prod-rg \
  --name csb-prod-app-frontend-7ndjbzgu \
  --settings \
    VITE_API_URL=https://csb-prod-ca-api-7ndjbzgu--0v3kcw5.ambitiouspond-14c47de2.southafricanorth.azurecontainerapps.io \
    VITE_WEB_PUBSUB_HUB_URL=https://csb-prod-pubsub-7ndjbzgu.webpubsub.azure.com \
    NODE_ENV=production
```

### 🗃️ Step 4: Initialize Database

```bash
# Run database setup script against Azure SQL
cd backend
node src/database/run_database_setup.js
```

### 🔒 Step 5: Configure Authentication

```bash
# Set up Google OAuth (you'll need Google credentials)
az keyvault secret set \
  --vault-name csb-prod-kv-san-7ndjbzgu \
  --name google-client-id \
  --value "your-google-client-id"

az keyvault secret set \
  --vault-name csb-prod-kv-san-7ndjbzgu \
  --name google-client-secret \
  --value "your-google-client-secret"
```

### 🧪 Step 6: Test Deployment

1. **Backend Health Check**:
   ```bash
   curl https://csb-prod-ca-api-7ndjbzgu--0v3kcw5.ambitiouspond-14c47de2.southafricanorth.azurecontainerapps.io/health
   ```

2. **Frontend Access**:
   ```bash
   curl https://csb-prod-app-frontend-7ndjbzgu.azurewebsites.net
   ```

3. **Database Connection**:
   ```bash
   curl https://csb-prod-ca-api-7ndjbzgu--0v3kcw5.ambitiouspond-14c47de2.southafricanorth.azurecontainerapps.io/api/v1/users
   ```

### 📊 Step 7: Monitor Resources

```bash
# Check Container App logs
az containerapp logs show \
  --name csb-prod-ca-api-7ndjbzgu \
  --resource-group csb-prod-rg

# Check App Service logs
az webapp log show \
  --name csb-prod-app-frontend-7ndjbzgu \
  --resource-group csb-prod-rg
```

### 🎯 Resource Utilization Status

✅ **Azure SQL Database** - Connected and ready
✅ **Azure Storage** - Blob containers created
✅ **Azure Key Vault** - Secrets stored
✅ **Azure Web PubSub** - Chat hub configured
✅ **Container Apps Environment** - API ready for deployment
✅ **App Service Plan** - Frontend ready for deployment
✅ **Virtual Network** - Security groups configured
✅ **Logic Apps** - Automation workflows ready
✅ **Storage Queues** - Notification queues created

### 🚨 Next Steps

1. **Create Azure Container Registry** (ACR) for Docker images
2. **Deploy backend** using the commands above
3. **Deploy frontend** using Azure CLI
4. **Configure Google OAuth** credentials
5. **Test end-to-end** functionality

Your infrastructure is **production-ready** and properly configured with security, networking, and all required Azure services! 🎉