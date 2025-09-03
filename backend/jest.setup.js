// Jest global setup: mock Azure SDKs that are instantiated at module import time
// This prevents tests from failing in CI when real connection strings are not available.

// Mock @azure/cosmos with a minimal in-memory API used by services
jest.mock('@azure/cosmos', () => {
  const fakeItem = (data = null) => ({
    read: jest.fn().mockResolvedValue({ resource: data }),
    replace: jest.fn().mockImplementation(async (obj) => ({ resource: obj })),
  });

  const fakeItems = {
    create: jest.fn().mockImplementation(async (obj) => ({ resource: obj })),
    query: jest.fn().mockReturnValue({ fetchAll: jest.fn().mockResolvedValue({ resources: [] }) }),
  };

  const fakeContainer = (data = null) => ({
    item: jest.fn().mockImplementation(() => fakeItem(data)),
    items: fakeItems,
  });

  const fakeDatabase = (data = null) => ({
    containers: {
      createIfNotExists: jest.fn().mockResolvedValue({ container: fakeContainer(data) }),
    },
    container: jest.fn().mockReturnValue(fakeContainer(data)),
  });

  const CosmosClient = jest.fn().mockImplementation(() => ({
    databases: { createIfNotExists: jest.fn().mockResolvedValue({ database: fakeDatabase() }) },
    database: jest.fn().mockReturnValue(fakeDatabase()),
  }));

  return { CosmosClient };
});

// Mock @azure/web-pubsub to avoid parsing connection strings during import
jest.mock('@azure/web-pubsub', () => ({
  WebPubSubServiceClient: jest.fn().mockImplementation(() => ({
    sendToAll: jest.fn().mockResolvedValue({}),
    // add any other methods your services call if needed
  })),
}));
