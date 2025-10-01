// Jest global setup: mock Azure SDKs that are instantiated at module import time
// This prevents tests from failing in CI when real connection strings are not available.

// Mock Azure Identity services
jest.mock('@azure/identity', () => ({
  DefaultAzureCredential: jest.fn().mockImplementation(() => ({})),
}));

// Mock Azure Key Vault
jest.mock('@azure/keyvault-secrets', () => ({
  SecretClient: jest.fn().mockImplementation(() => ({
    getSecret: jest.fn().mockResolvedValue({ value: 'mock-secret-value' }),
  })),
}));

// Mock Azure Storage Blob
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: jest.fn().mockReturnValue({
      getContainerClient: jest.fn().mockReturnValue({
        createIfNotExists: jest.fn().mockResolvedValue({}),
        getBlockBlobClient: jest.fn().mockReturnValue({
          upload: jest.fn().mockResolvedValue({
            etag: 'mock-etag',
            lastModified: new Date(),
          }),
          url: 'https://mock-storage.blob.core.windows.net/container/file',
          generateSasUrl: jest
            .fn()
            .mockResolvedValue(
              'https://mock-storage.blob.core.windows.net/container/file?sas=token'
            ),
        }),
      }),
    }),
  },
  BlobSASPermissions: jest.fn().mockImplementation(() => ({
    read: true,
  })),
}));

// Mock @azure/web-pubsub to avoid parsing connection strings during import
jest.mock('@azure/web-pubsub', () => ({
  WebPubSubServiceClient: jest.fn().mockImplementation(() => ({
    sendToAll: jest.fn().mockResolvedValue({}),
    getClientAccessToken: jest.fn().mockResolvedValue({
      url: 'wss://mock-webpubsub.service.signalr.net/client/hubs/chat-hub',
      token: 'mock-access-token',
    }),
  })),
}));

// Mock mssql package for SQL Server database operations
jest.mock('mssql', () => {
  // Sample data for different tables
  const sampleUsers = [
    {
      user_id: 1,
      id: 1, // Include both for compatibility
      email: 'test@example.com',
      name: 'Test User',
      first_name: 'Test',
      last_name: 'User',
      university: 'UniXYZ',
      course: 'Computer Science',
      profile: JSON.stringify({
        studyPreferences: { studyStyle: 'visual' },
        academicInfo: { major: 'Computer Science', year: 'Junior' },
      }),
      study_preferences: JSON.stringify({
        preferredTimes: [],
        studyStyle: 'visual',
        groupSize: 'medium',
      }),
      created_at: new Date('2024-01-01T00:00:00.000Z'),
      updated_at: new Date('2024-01-01T00:00:00.000Z'),
      enrolled_modules: '',
    },
    {
      user_id: 2,
      id: 2, // Include both for compatibility
      email: 'test2@example.com',
      name: 'Test User 2',
      first_name: 'Test',
      last_name: 'User 2',
      profile: JSON.stringify({
        studyPreferences: { studyStyle: 'auditory' },
        academicInfo: { major: 'Mathematics', year: 'Senior' },
      }),
      study_preferences: JSON.stringify({
        preferredTimes: [],
        studyStyle: 'auditory',
        groupSize: 'medium',
      }),
      created_at: new Date('2024-01-02T00:00:00.000Z'),
      updated_at: new Date('2024-01-02T00:00:00.000Z'),
    },
  ];

  const sampleCourses = [
    {
      id: 'c1',
      module_id: 1,
      module_code: 'CS301',
      module_name: 'Introduction to Computer Science',
      title: 'Introduction to Computer Science',
      description: 'Basic programming concepts',
      instructor: 'Dr. Smith',
      schedule: JSON.stringify({ days: ['Monday', 'Wednesday'], time: '10:00-11:30' }),
      university: 'Test University',
      is_active: 1,
      status: 'active',
      created_at: new Date('2024-01-01T00:00:00.000Z'),
      updated_at: new Date('2024-01-01T00:00:00.000Z'),
      createdAt: new Date('2024-01-01T00:00:00.000Z'),
      updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      progress: 0,
      totalHours: 0,
    },
    {
      id: 'c2',
      module_id: 2,
      module_code: 'CS302',
      module_name: 'Data Structures',
      title: 'Data Structures',
      description: 'Advanced data structures and algorithms',
      instructor: 'Dr. Johnson',
      schedule: JSON.stringify({ days: ['Tuesday', 'Thursday'], time: '14:00-15:30' }),
      university: 'Test University',
      is_active: 1,
      status: 'active',
      created_at: new Date('2024-01-02T00:00:00.000Z'),
      updated_at: new Date('2024-01-02T00:00:00.000Z'),
      createdAt: new Date('2024-01-02T00:00:00.000Z'),
      updatedAt: new Date('2024-01-02T00:00:00.000Z'),
      progress: 0,
      totalHours: 0,
    },
  ];

  const sampleUserModules = [
    {
      user_id: 1,
      module_id: 'c1',
      enrollment_status: 'active',
      enrolled_at: new Date('2024-01-01T00:00:00.000Z'),
    },
    {
      user_id: 2,
      module_id: 'c1',
      enrollment_status: 'active',
      enrolled_at: new Date('2024-01-01T00:00:00.000Z'),
    },
  ];

  const sampleProgress = [
    {
      progress_id: 'progress-1',
      user_id: 'test-user-1',
      course_id: 'course-1',
      progress_percentage: 75.5,
      completed_modules: JSON.stringify(['module-1', 'module-2', 'module-3']),
      study_sessions: 12,
      total_study_time: 480, // minutes
      last_studied_at: new Date('2024-01-15T10:00:00.000Z'),
      created_at: new Date('2024-01-01T00:00:00.000Z'),
      updated_at: new Date('2024-01-15T10:00:00.000Z'),
    },
    {
      progress_id: 'progress-2',
      user_id: 'test-user-1',
      course_id: 'course-2',
      progress_percentage: 45.0,
      completed_modules: JSON.stringify(['module-1']),
      study_sessions: 8,
      total_study_time: 320,
      last_studied_at: new Date('2024-01-14T14:00:00.000Z'),
      created_at: new Date('2024-01-02T00:00:00.000Z'),
      updated_at: new Date('2024-01-14T14:00:00.000Z'),
    },
  ];

  const sampleStudyHours = [
    {
      hour_id: 1,
      user_id: 'test-user-1',
      module_id: 1,
      topic_id: 1,
      session_id: null,
      hours_logged: 2.5,
      description: 'Study session on data structures',
      study_date: new Date('2024-01-15T00:00:00.000Z'),
      logged_at: new Date('2024-01-15T10:00:00.000Z'),
    },
    {
      hour_id: 2,
      user_id: 'test-user-1',
      module_id: 2,
      topic_id: null,
      session_id: null,
      hours_logged: 1.5,
      description: 'Review of algorithms',
      study_date: new Date('2024-01-14T00:00:00.000Z'),
      logged_at: new Date('2024-01-14T14:00:00.000Z'),
    },
  ];

  // Mock Decimal type
  const Decimal = jest.fn().mockImplementation((value) => ({
    toString: () => value.toString(),
    valueOf: () => value,
    toJSON: () => value,
  }));

  // Mock Transaction class
  class MockTransaction {
    constructor() {
      this.requests = [];
    }

    begin() {
      return Promise.resolve();
    }

    commit() {
      return Promise.resolve();
    }

    rollback() {
      return Promise.resolve();
    }

    request() {
      const mockRequest = new MockRequest();
      this.requests.push(mockRequest);
      return mockRequest;
    }
  }

  // Mock Request class
  class MockRequest {
    constructor() {
      this.inputParams = {};
      this.queryText = '';
      this.isSelect = false;
    }

    input(name, value) {
      this.inputParams[name] = value;
      return this;
    }

    async query(sql) {
      this.queryText = sql;
      this.isSelect = sql.toLowerCase().trim().startsWith('select');
      const lowerSql = sql.toLowerCase();

      // Route queries to appropriate sample data based on content
      if (lowerSql.includes('users') || lowerSql.includes('from users')) {
        let results = [...sampleUsers];

        // Handle WHERE clauses
        if (lowerSql.includes('where') && lowerSql.includes('user_id =')) {
          const userIdMatch =
            sql.match(/user_id\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/user_id\s*=\s*@(\w+)/i);
          if (userIdMatch) {
            const paramName = userIdMatch[1];
            const userId = this.inputParams?.[paramName] || paramName;
            results = results.filter((u) => u.user_id === userId);
          }
        }

        if (lowerSql.includes('where') && lowerSql.includes('email =')) {
          const emailMatch =
            sql.match(/email\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/email\s*=\s*@(\w+)/i);
          if (emailMatch) {
            const paramName = emailMatch[1];
            const email = this.inputParams?.[paramName] || paramName;
            results = results.filter((u) => u.email === email);
          }
        }

        // Add enrolled_modules field for complex user queries
        if (lowerSql.includes('string_agg') || lowerSql.includes('enrolled_modules')) {
          results = results.map((u) => ({
            ...u,
            enrolled_modules: '', // Mock empty for now
          }));
        }

        return { recordset: results };
      }

      if (lowerSql.includes('modules') || lowerSql.includes('from modules')) {
        let results = [...sampleCourses];

        if (lowerSql.includes('where') && lowerSql.includes('module_id =')) {
          const idMatch =
            sql.match(/module_id\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/module_id\s*=\s*@(\w+)/i);
          if (idMatch) {
            const paramName = idMatch[1];
            const moduleId = parseInt(this.inputParams?.[paramName] || paramName);
            results = results.filter((m) => m.module_id === moduleId);
          }
        }

        return { recordset: results };
      }

      if (lowerSql.includes('progress') || lowerSql.includes('from progress')) {
        let results = [...sampleProgress];

        if (lowerSql.includes('where') && lowerSql.includes('user_id =')) {
          const userIdMatch =
            sql.match(/user_id\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/user_id\s*=\s*@(\w+)/i);
          if (userIdMatch) {
            const paramName = userIdMatch[1];
            const userId = this.inputParams?.[paramName] || paramName;
            results = results.filter((p) => p.user_id === userId);
          }
        }

        if (lowerSql.includes('where') && lowerSql.includes('course_id =')) {
          const courseIdMatch =
            sql.match(/course_id\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/course_id\s*=\s*@(\w+)/i);
          if (courseIdMatch) {
            const paramName = courseIdMatch[1];
            const courseId = this.inputParams?.[paramName] || paramName;
            results = results.filter((p) => p.course_id === courseId);
          }
        }

        // Convert progress_percentage to Decimal for consistency
        results = results.map((p) => ({
          ...p,
          progress_percentage: Decimal(p.progress_percentage),
          completed_modules: p.completed_modules,
          last_studied_at: p.last_studied_at.toISOString(),
        }));

        return { recordset: results };
      }

      if (lowerSql.includes('study_hours') || lowerSql.includes('from study_hours')) {
        let results = [...sampleStudyHours];

        if (lowerSql.includes('where') && lowerSql.includes('user_id =')) {
          const userIdMatch =
            sql.match(/user_id\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/user_id\s*=\s*@(\w+)/i);
          if (userIdMatch) {
            const paramName = userIdMatch[1];
            const userId = this.inputParams?.[paramName] || paramName;
            results = results.filter((h) => h.user_id === userId);
          }
        }

        // Add joined module and topic data for analytics queries
        if (lowerSql.includes('left join') && lowerSql.includes('modules')) {
          results = results.map((h) => ({
            ...h,
            module_name: 'Introduction to Computer Science',
            module_code: 'CS101',
            topic_name: h.topic_id ? 'Data Structures' : null,
            study_date: h.study_date instanceof Date ? h.study_date : new Date(h.study_date),
            hours_logged: h.hours_logged,
            description: h.description,
            logged_at: h.logged_at instanceof Date ? h.logged_at : new Date(h.logged_at),
          }));
        }

        return { recordset: results };
      }

      // Handle INSERT queries with OUTPUT
      if (lowerSql.includes('insert into') && lowerSql.includes('output inserted.')) {
        if (lowerSql.includes('study_hours')) {
          // Mock inserted study hours record with correct userId format
          return {
            recordset: [
              {
                hour_id: 1,
                userId: 'u1', // Use string ID format that tests expect
                study_date: new Date().toISOString().split('T')[0],
                logged_at: new Date().toISOString(),
              },
            ],
          };
        }
        // Default mock for other INSERT OUTPUT queries
        return { recordset: [{ id: 1 }] };
      }

      // Handle UPDATE queries with OUTPUT
      if (lowerSql.includes('update') && lowerSql.includes('output inserted.')) {
        if (lowerSql.includes('users')) {
          // Mock updated user record
          const updatedUser = { ...sampleUsers[0] };
          // Apply any study_preferences updates from the input
          if (this.inputParams.study_preferences) {
            updatedUser.study_preferences = this.inputParams.study_preferences;
          }
          return { recordset: [updatedUser] };
        }
        // Default mock for other UPDATE OUTPUT queries
        return { recordset: [{ id: 1 }] };
      }

      // Handle DELETE queries
      if (lowerSql.includes('delete from')) {
        if (lowerSql.includes('user_modules') && lowerSql.includes('where')) {
          // Extract the module ID and user ID from the query
          const moduleIdMatch =
            sql.match(/module_id\s*=\s*['"]([^'"]+)['"]/i) || sql.match(/module_id\s*=\s*@(\w+)/i);
          const userIdMatch =
            sql.match(/user_id\s*=\s*(\d+)/i) || sql.match(/user_id\s*=\s*@(\w+)/i);

          if (moduleIdMatch && userIdMatch) {
            const moduleParamName = moduleIdMatch[1];
            const userParamName = userIdMatch[1];
            const moduleId = this.inputParams?.[moduleParamName] || moduleParamName;
            const userId = this.inputParams?.[userParamName] || parseInt(userParamName);

            // Check if the enrollment exists in our sample data
            const enrollmentExists = sampleUserModules.some(
              (um) =>
                (um.module_id === moduleId || um.module_id.toString() === moduleId) &&
                um.user_id === userId
            );

            if (enrollmentExists) {
              return { recordset: [], rowsAffected: [1] };
            } else {
              return { recordset: [], rowsAffected: [0] };
            }
          }
        }
        // Mock successful deletion for other DELETE queries
        return { recordset: [], rowsAffected: [1] };
      }

      // Default empty result for unmatched queries
      return { recordset: [] };
    }

    async execute(procedureName) {
      // Mock stored procedure execution
      if (procedureName === 'GetUserProgress') {
        const userId = this.inputParams.userId;
        const progress = sampleProgress.filter((p) => p.user_id === userId);
        return {
          recordset: progress.map((p) => ({
            ...p,
            progress_percentage: Decimal(p.progress_percentage),
            completed_modules: p.completed_modules,
            last_studied_at: p.last_studied_at.toISOString(),
          })),
        };
      }
      return { recordset: [] };
    }

    async executeScalar() {
      // Return a single value for scalar queries
      if (this.queryText.toLowerCase().includes('count')) {
        return 1;
      }
      return null;
    }
  }

  // Mock ConnectionPool class
  class MockConnectionPool {
    constructor(config) {
      this.config = config;
      this.connected = false;
    }

    async connect() {
      this.connected = true;
      return this;
    }

    async close() {
      this.connected = false;
      return this;
    }

    request() {
      return new MockRequest();
    }

    transaction() {
      return new MockTransaction();
    }

    async query(sql) {
      // Simple fallback for direct pool.query calls - return empty result
      return { recordset: [] };
    }
  }

  // Mock connect function
  const connect = jest.fn().mockImplementation(async (config) => {
    return new MockConnectionPool(config);
  });

  return {
    connect,
    ConnectionPool: MockConnectionPool,
    Request: MockRequest,
    Transaction: MockTransaction,
    Decimal,
    TYPES: {
      VarChar: 'VarChar',
      Int: 'Int',
      Decimal: 'Decimal',
      DateTime: 'DateTime',
      NVarChar: 'NVarChar',
      MAX: 4000,
    },
    // Mock sql type constructors that services call directly
    NVarChar: jest.fn().mockReturnValue('NVarChar'),
    Int: jest.fn().mockReturnValue('Int'),
    VarChar: jest.fn().mockReturnValue('VarChar'),
    DateTime: jest.fn().mockReturnValue('DateTime'),
    NText: jest.fn().mockReturnValue('NText'),
    Date: jest.fn().mockReturnValue('Date'),
    MAX: 4000,
  };
});
