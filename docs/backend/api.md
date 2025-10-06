
# API

### Health Check
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/api/v1/health` | Check application and Azure services health |

### User Service (`/api/v1/users`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/me` | Get current user profile |
| PUT | `/me` | Update current user profile |
| GET | `/` | Get all users |
| GET | `/me/modules` | Get user's enrolled modules |
| POST | `/me/modules/:moduleId/enroll` | Enroll in a module |
| GET | `/me/progress` | Get user's progress |
| PUT | `/me/progress` | Update user's progress |
| GET | `/me/study-hours` | Get user's study hours |
| POST | `/me/study-hours` | Log study hours |
| GET | `/me/statistics` | Get user statistics |
| GET | `/me/notifications` | Get user notifications |
| PUT | `/me/notifications/:notificationId/read` | Mark notification as read |
| POST | `/files/upload` | Upload files |

### Partner Service (`/api/v1/partners`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/` | Get study partners |
| GET | `/search` | Search for study partners |
| POST | `/request` | Send partner request |
| POST | `/test-users` | Create test users (development) |

### Group Service (`/api/v1/groups`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| POST | `/` | Create a new study group |
| GET | `/` | Get all study groups |
| GET | `/my-groups` | Get user's study groups |
| POST | `/:groupId/join` | Join a study group |
| POST | `/:groupId/leave` | Leave a study group |
| POST | `/:groupId/invite` | Invite users to a group |
| POST | `/:groupId/sessions` | Create a session for a group |

### Progress Service (`/api/v1/progress`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| POST | `/sessions` | Log a study session |
| GET | `/analytics` | Get progress analytics |
| GET | `/modules/:moduleId` | Get progress for a specific module |
| PUT | `/topics/:topicId/complete` | Mark a topic as complete |
| GET | `/leaderboard` | Get progress leaderboard |
| GET | `/goals` | Get user goals |

### Chat Service (`/api/v1/chat`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| POST | `/negotiate` | Negotiate WebSocket connection for real-time chat |
| POST | `/groups/:groupId/messages` | Send a message to a group |
| GET | `/groups/:groupId/messages` | Get messages from a group |

### Course Service (`/api/v1/courses`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/` | Get all courses |
| POST | `/` | Create a new course |
| PUT | `/:id` | Update a course |
| DELETE | `/:id` | Delete a course |
| GET | `/test-search` | Test search functionality (development) |
| GET | `/debug` | Debug endpoint for courses |
| GET | `/available` | Get available courses |
| GET | `/:id/topics` | Get topics for a specific course |

### Module Service (`/api/v1/modules`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/` | Get all modules |
| GET | `/:moduleId` | Get a specific module |
| GET | `/:moduleId/topics` | Get topics for a module |
| GET | `/topics/:topicId/chapters` | Get chapters for a topic |
| POST | `/` | Create a new module |
| POST | `/:moduleId/topics` | Create a topic for a module |
| POST | `/topics/:topicId/chapters` | Create a chapter for a topic |
| PUT | `/:moduleId` | Update a module |
| DELETE | `/:moduleId` | Delete a module |

### Session Service (`/api/v1/sessions`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/` | Get all study sessions |
| GET | `/:sessionId` | Get a specific session |
| POST | `/` | Create a new study session |
| POST | `/:sessionId/join` | Join a study session |
| DELETE | `/:sessionId/leave` | Leave a study session |
| PUT | `/:sessionId` | Update a session |
| PUT | `/:sessionId/start` | Start a session |
| PUT | `/:sessionId/end` | End a session |
| PUT | `/:sessionId/cancel` | Cancel a session |
| DELETE | `/:sessionId` | Delete a session |

### Notification Service (`/api/v1/notifications`)
| Method | Endpoint | Description |
|-------:|----------|-------------|
| GET | `/` | Get user notifications |
| GET | `/counts` | Get notification counts |
| PUT | `/:notificationId/read` | Mark a notification as read |
| PUT | `/read-all` | Mark all notifications as read |
| DELETE | `/:notificationId` | Delete a notification |
| POST | `/` | Create a new notification |
| POST | `/group/:groupId/notify` | Send notification to group members |
| GET | `/pending` | Get pending notifications |
| PUT | `/mark-sent` | Mark notifications as sent |

> Swagger APIs: <https://gimbiyasa.github.io/campus_study_buddy/docs/swagger/index.html>
