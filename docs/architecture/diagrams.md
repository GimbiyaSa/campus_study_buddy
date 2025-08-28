# Diagrams

```mermaid
flowchart LR
  A[React + TS] -- Axios --> B[Express API]
  B --> C[(Cosmos DB)]
  B --> D((Web PubSub))
  B --> E[(Service Bus)]
