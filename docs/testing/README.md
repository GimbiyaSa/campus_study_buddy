# API Testing Documentation

This directory contains tools and documentation for testing the Campus Study Buddy API.

## Files

- **[index.md](index.md)** - Main testing documentation page
- **[setup.md](setup.md)** - Detailed setup guide for testing environment
- **[api-testing.html](api-testing.html)** - Interactive HTML tool for getting Google tokens and testing endpoints

## Quick Start

1. **Open the [testing page](index.md)** to learn about testing options
2. **Use the [interactive tool](api-testing.html)** to get Google ID tokens
3. **Follow the [setup guide](setup.md)** for detailed configuration

## External Files

- **[Postman Collection](../Campus_Study_Buddy_API.postman_collection.json)** - Import into Postman for API testing
- **[API Specification](../docs/swagger/)** - Complete API documentation

## Important Notes

- You need a Google OAuth Client ID to use the testing tools
- ID tokens expire after approximately 1 hour
- The API uses Google ID tokens for authentication, not traditional JWT tokens
- Make sure your API server is running before testing endpoints