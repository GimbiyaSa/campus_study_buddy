# Campus Study Buddy

Welcome to the docs. Use the left nav or search (press `/`).

!!! tip
    Keep pages short. Link out to detail pages. Treat this like a team wiki.

```mermaid
flowchart TD
  A[Web App (React)] -->|REST| B(API Gateway)
  B --> C[Users Service]
  B --> D[Sessions Service]
  B --> E[Recommendations]
  D --> F[(Postgres)]
  E --> G[(Vector Store)]
