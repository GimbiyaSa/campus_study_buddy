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

0. (If Local) Start the DB: `cd backend && docker compose up --build`
1. Start the backend: `cd backend && npm run dev`
2. Start the frontend: `cd frontend && npm run dev`
3. Open your browser to `http://localhost:5173`

The backend server will run on `http://localhost:5000` and the frontend on `http://localhost:5173`.

## 📡 API Endpoints

| Method | Endpoint                       | Description                  |
|--------|------------------------------- |-----------------------------|
| GET    | `/api/v1/health`               | Health check                 |
| GET    | `/api/v1/users/me`             | Get current user profile     |
| PUT    | `/api/v1/users/me`             | Update current user profile  |
| GET    | `/api/v1/courses`              | List user's enrolled courses |
| POST   | `/api/v1/courses`              | Add/enroll in a course       |
| DELETE | `/api/v1/courses/:id`          | Remove a course              |
| GET    | `/api/v1/partners/search`      | Search for study partners    |
| GET    | `/api/v1/groups`               | List study groups            |
| POST   | `/api/v1/groups`               | Create a study group         |
| GET    | `/api/v1/progress/analytics`   | Get progress analytics       |
| POST   | `/api/v1/progress/sessions`    | Log a study session          |
| GET    | `/api/v1/chat/rooms`           | List chat rooms              |
| POST   | `/api/v1/chat/messages`        | Send a chat message          |

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
