# API Documentation

## Interactive Swagger UI

The complete API documentation is available through our interactive Swagger UI interface.

<div style="text-align: center; margin: 2rem 0;">
    <a href="https://gimbiyasa.github.io/campus_study_buddy/swagger/" target="_blank" style="
        display: inline-block;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        padding: 1rem 2rem;
        text-decoration: none;
        border-radius: 8px;
        font-weight: bold;
        font-size: 1.1rem;
        box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
        transition: transform 0.2s, box-shadow 0.2s;
    " onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 6px 20px rgba(102, 126, 234, 0.4)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 4px 12px rgba(102, 126, 234, 0.3)'">
        🚀 Open Interactive API Documentation
    </a>
</div>

## Alternative Access Methods

If the main Swagger UI link doesn't work, try these alternatives:

### Direct Links
- **Swagger UI**: [https://gimbiyasa.github.io/campus_study_buddy/swagger/](https://gimbiyasa.github.io/campus_study_buddy/swagger/)
- **Raw API Spec**: [api-spec.yaml](https://raw.githubusercontent.com/GimbiyaSa/campus_study_buddy/dev/docs/swagger/api-spec.yaml)

### Quick Reference

#### Base URL
```
https://your-api-domain.com/api/v1
```

#### Authentication
```bash
Authorization: Bearer <your-jwt-token>
```

#### Main Service Endpoints

| Service | Base Path | Description |
|---------|-----------|-------------|
| **Users** | `/api/v1/users` | User management and profiles |
| **Courses** | `/api/v1/courses` | Course and module management |
| **Groups** | `/api/v1/groups` | Study group operations |
| **Sessions** | `/api/v1/sessions` | Study session scheduling |
| **Partners** | `/api/v1/partners` | Study partner matching |
| **Progress** | `/api/v1/progress` | Progress tracking and analytics |
| **Chat** | `/api/v1/chat` | Real-time messaging |
| **Notifications** | `/api/v1/notifications` | User notifications |

## Features

- **Try It Out**: Test API endpoints directly from the documentation
- **Request/Response Examples**: See real request and response formats
- **Authentication**: Built-in support for JWT token authentication
- **Real-time Updates**: Documentation stays in sync with the API

## Getting Started

1. **Obtain API Access**: Contact your system administrator for API credentials
2. **Authentication**: Use the `/auth/login` endpoint to obtain a JWT token
3. **Explore**: Use the interactive documentation to explore available endpoints
4. **Test**: Try out API calls directly from the Swagger interface

!!! tip "Development Environment"
    For development and testing, you can use the test endpoints marked with `(development)` in the API documentation.

!!! warning "Rate Limiting"
    Please be aware that API endpoints are rate-limited. Check the response headers for rate limit information.