# Campus Study Buddy Application

A simple full-stack application built with React (frontend) and Node.js (backend), both using TypeScript for type safety and better development experience.

## 🚀 Features

- **Frontend**: React with TypeScript, responsive UI, real-time API communication
- **Backend**: Node.js with Express and TypeScript, RESTful API design
- **Type Safety**: Shared TypeScript interfaces between frontend and backend
- **User Management**: Create and view users with form validation
- **Error Handling**: Comprehensive error handling on both client and server
- **Modern Development**: Hot reloading, ESLint, and development-friendly setup

## 🛠️ Tech Stack

### Frontend
- React 18
- TypeScript
- Axios (HTTP client)
- CSS3 with responsive design

### Backend
- Node.js
- Express.js
- TypeScript
- CORS middleware
- dotenv for environment variables

## 📋 Prerequisites

Before running this application, make sure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or higher)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

## 🏗️ Project Structure

```
campus-study-buddy/
├── backend/
│   ├── src/
│   │   ├── app.ts
│   │   ├── services/
│   │   │   ├── userService.js
│   │   │   ├── courseService.js
│   │   │   ├── partnerService.js
│   │   │   ├── groupService.js
│   │   │   ├── progressService.js
│   │   │   └── chatService.js
│   │   ├── database/
│   │   │   ├── run_database_setup.js
│   │   │   └── database_setup.js
│   ├── .env
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── CoursesPage.tsx
│   │   │   └── ...other pages
│   │   ├── components/
│   │   │   ├── Courses.tsx
│   │   │   └── ...other components
│   │   ├── types/
│   │   ├── App.tsx
│   │   └── router.ts
│   ├── .env
│   ├── package.json
│   └── vite.config.js
└── README.md
```

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/GimbiyaSa/campus_study_buddy.git
cd campus-study-buddy
```

### 2. Install Dependencies

#### Backend
```bash
cd backend
npm install
```

#### Frontend
```bash
cd frontend
npm install
```

### 3. Environment Setup

Create `.env` files in both directories:

**Backend (.env)**
```bash
PORT=5000
NODE_ENV=development
COSMOS_CONNECTION_STRING=AccountEndpoint=https://cosmosexercise7025.documents.azure.com:443/;AccountKey=A4VXcA5x6BsVeWgfosrKOWtLLL3YY2m8PeiMPG8Qep59TIl2O1p1PZOXFs4Aae3HsFifCEoBUTtBACDbpTwhRw==;
COSMOS_KEY_STRING="A4VXcA5x6BsVeWgfosrKOWtLLL3YY2m8PeiMPG8Qep59TIl2O1p1PZOXFs4Aae3HsFifCEoBUTtBACDbpTwhRw=="
WEB_PUBSUB_CONNECTION_STRING=Endpoint=https://webpubsubexercise13992.webpubsub.azure.com;AccessKey=84vUkUphFjPh43mpVkHDOJSpm9jL5KRN5HRmIoz1rfRcXeHQRx5zJQQJ99BHACrIdLPXJ3w3AAAAAWPSr6V7;Version=1.0;
AZURE_CLIENT_ID=your_b2c_client_id
AZURE_TENANT_ID=your_b2c_tenant_id
SERVICE_BUS_CONNECTION_STRING=your_servicebus_connection
```

**Frontend (.env)**
```bash
REACT_APP_API_URL=http://localhost:5173/api
```

## 🏃‍♂️ Running the Application

1. Start the DB: `cd backend && docker compose up --build`
2. Start the backend: `cd backend && npm run dev`
3. Start the frontend: `cd frontend && npm run dev`
4. Open your browser to `http://localhost:5173`

The backend server will run on `http://localhost:5000` and the frontend on `http://localhost:5173`.

## 📡 API Endpoints

### Health Check
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/health` | Check application and Azure services health |

### User Service (`/api/v1/users`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/me` | Get current user profile |
| PUT    | `/me` | Update current user profile |
| GET    | `/` | Get all users |
| GET    | `/me/modules` | Get user's enrolled modules |
| POST   | `/me/modules/:moduleId/enroll` | Enroll in a module |
| GET    | `/me/progress` | Get user's progress |
| PUT    | `/me/progress` | Update user's progress |
| GET    | `/me/study-hours` | Get user's study hours |
| POST   | `/me/study-hours` | Log study hours |
| GET    | `/me/statistics` | Get user statistics |
| GET    | `/me/notifications` | Get user notifications |
| PUT    | `/me/notifications/:notificationId/read` | Mark notification as read |
| POST   | `/files/upload` | Upload files |

### Partner Service (`/api/v1/partners`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | Get study partners |
| GET    | `/search` | Search for study partners |
| POST   | `/request` | Send partner request |
| POST   | `/test-users` | Create test users (development) |

### Group Service (`/api/v1/groups`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/` | Create a new study group |
| GET    | `/` | Get all study groups |
| GET    | `/my-groups` | Get user's study groups |
| POST   | `/:groupId/join` | Join a study group |
| POST   | `/:groupId/leave` | Leave a study group |
| POST   | `/:groupId/invite` | Invite users to a group |
| POST   | `/:groupId/sessions` | Create a session for a group |

### Progress Service (`/api/v1/progress`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/sessions` | Log a study session |
| GET    | `/analytics` | Get progress analytics |
| GET    | `/modules/:moduleId` | Get progress for a specific module |
| PUT    | `/topics/:topicId/complete` | Mark a topic as complete |
| GET    | `/leaderboard` | Get progress leaderboard |
| GET    | `/goals` | Get user goals |

### Chat Service (`/api/v1/chat`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST   | `/negotiate` | Negotiate WebSocket connection for real-time chat |
| POST   | `/groups/:groupId/messages` | Send a message to a group |
| GET    | `/groups/:groupId/messages` | Get messages from a group |

### Course Service (`/api/v1/courses`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | Get all courses |
| POST   | `/` | Create a new course |
| PUT    | `/:id` | Update a course |
| DELETE | `/:id` | Delete a course |
| GET    | `/test-search` | Test search functionality (development) |
| GET    | `/debug` | Debug endpoint for courses |
| GET    | `/available` | Get available courses |
| GET    | `/:id/topics` | Get topics for a specific course |

### Module Service (`/api/v1/modules`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | Get all modules |
| GET    | `/:moduleId` | Get a specific module |
| GET    | `/:moduleId/topics` | Get topics for a module |
| GET    | `/topics/:topicId/chapters` | Get chapters for a topic |
| POST   | `/` | Create a new module |
| POST   | `/:moduleId/topics` | Create a topic for a module |
| POST   | `/topics/:topicId/chapters` | Create a chapter for a topic |
| PUT    | `/:moduleId` | Update a module |
| DELETE | `/:moduleId` | Delete a module |

### Session Service (`/api/v1/sessions`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | Get all study sessions |
| GET    | `/:sessionId` | Get a specific session |
| POST   | `/` | Create a new study session |
| POST   | `/:sessionId/join` | Join a study session |
| DELETE | `/:sessionId/leave` | Leave a study session |
| PUT    | `/:sessionId` | Update a session |
| PUT    | `/:sessionId/start` | Start a session |
| PUT    | `/:sessionId/end` | End a session |
| PUT    | `/:sessionId/cancel` | Cancel a session |
| DELETE | `/:sessionId` | Delete a session |

### Notification Service (`/api/v1/notifications`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/` | Get user notifications |
| GET    | `/counts` | Get notification counts |
| PUT    | `/:notificationId/read` | Mark a notification as read |
| PUT    | `/read-all` | Mark all notifications as read |
| DELETE | `/:notificationId` | Delete a notification |
| POST   | `/` | Create a new notification |
| POST   | `/group/:groupId/notify` | Send notification to group members |
| GET    | `/pending` | Get pending notifications |
| PUT    | `/mark-sent` | Mark notifications as sent |

**Note:** Most endpoints require authentication via JWT tokens. Development endpoints are marked accordingly.

### Example API Usage

**Get all users:**
```bash
curl http://localhost:5000/api/users
```

**Create a new user: For testing**
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

## 🔧 Available Scripts

### Backend
- `npm run dev` - Start development server with hot reloading
- `npm run build` - Build TypeScript to JavaScript
- `npm run lint` - Run Linter on code
- `npm run lint:fix` - Run Linter and auto-fix
- `npm run format` - Run Formatter
- `npm run test` - Run tests (jest)
- `npm run test:coverage` - Run test with coverage report
- `npm start` - Start production server
- `npm run clean` - Remove build directory

### Frontend
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run lint` - Run Linter on code
- `npm run lint:fix` - Run Linter and auto-fix
- `npm run format` - Run Formatter
- `npm run test` - Run tests (vitest)
- `npm run test:coverage` - Run test with coverage report
- `npm run eject` - Eject from Create React App (irreversible)

### Security & Auditing
- `npm run audit:deps` - Run dependency security checks across `backend` and `frontend`

The audit script produces a consolidated report at `reports/security/dependency-audit.json` and exits with a non-zero status when vulnerabilities at `AUDIT_FAIL_LEVEL` (defaults to `moderate`) or higher are present. You can change the threshold temporarily when running locally:

```powershell
$env:AUDIT_FAIL_LEVEL = 'high'
npm run audit:deps
$env:AUDIT_FAIL_LEVEL = $null # optional cleanup
```

A dedicated **Dependency Security Audit** workflow executes automatically for pushes, pull requests, and every Monday at 04:00 UTC. The workflow surface results as an artifact named `dependency-audit-report` for easy review.

## 🌟 Features Walkthrough

### User Management
- View all users in a responsive card layout
- Create new users with form validation
- Real-time server status indicator
- Error handling for network issues

### Type Safety
- Shared TypeScript interfaces ensure consistency
- Compile-time error checking
- IntelliSense support in development

### Development Experience
- Hot reloading on both frontend and backend
- Detailed error messages and logging
- Environment-based configuration

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🐛 Troubleshooting

### Common Issues

**Port already in use:**
```bash
# Kill process on port 5000 (backend)
lsof -ti:5000 | xargs kill -9

# Kill process on port 3000 (frontend)  
lsof -ti:3000 | xargs kill -9
```

**CORS issues:**
Make sure the backend is running before starting the frontend, and verify the `REACT_APP_API_URL` in the frontend `.env` file.

**TypeScript compilation errors:**
Run `npm run build` in the backend directory to check for TypeScript errors.

## 📞 Support

If you encounter any issues or have questions, please open an issue in the GitHub repository.

---

**Happy coding! 🎉**
