# CI/CD

## Docs
- Workflow builds MkDocs & deploys to GitHub Pages.

## App
- Lint/test → build → deploy to hosting (e.g., Azure Web Apps)

## Azure Deployment Workflow

The `azure-deploy.yml` GitHub Actions workflow builds and deploys the backend and frontend independently:

- **Backend**: builds the Container App image from `backend/`, pushes it to the configured Azure Container Registry, and updates the existing Azure Container App revision.
- **Frontend**: builds the Vite SPA from `frontend/`, zips the static output, and deploys it to the Linux Web App provisioned by Terraform.

### Required secrets

Add the following repository or organization secrets before running the workflow:

| Secret | Description |
| --- | --- |
| `AZURE_CREDENTIALS` | Output of `az ad sp create-for-rbac --sdk-auth ...` for the deployment service principal. |
| `AZURE_RESOURCE_GROUP` | Resource group created by Terraform (e.g., `csb-prod-rg-eus2-xxxx`). |
| `AZURE_CONTAINER_APP_NAME` | Container App name (Terraform output `module.compute.api_container_app_name`). |
| `AZURE_ACR_NAME` | Azure Container Registry name used to store backend images. |
| `AZURE_ACR_LOGIN_SERVER` | Login server for the registry (e.g., `myregistry.azurecr.io`). |
| `AZURE_WEBAPP_NAME` | Linux Web App name for the frontend (Terraform output `module.compute.frontend_app_service_name`). |

### Usage

- Triggered automatically on pushes to `main` and via **Run workflow** (manual dispatch).
- Ensure the backend Dockerfile (`backend/Dockerfile`) stays in sync with the Node/TypeScript build.
- If you rotate registry credentials, update the ACR secret/password and re-run the workflow.
