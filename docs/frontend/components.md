
---
## Key Features
- **Groups Page**: create, join, and manage study groups.  
- **Sessions Page**: create study sessions (linked to groups), track attendance, and filter by upcoming sessions.  
- **Courses Page**: display enrolled courses, allow filtering/sorting.  
- **Dashboard**: summary cards for sessions, partners, and progress tracking.  
- **Profile Page**: user information, learning preferences, and settings.  

---

## Development Guidelines
- **State Management**: Local state via `useState`/`useEffect`; heavier flows should be centralized in service functions.  
- **Routing**: React Router used for navigation between pages.  
- **Data Fetching**: `DataService` abstracts API calls to keep components clean.  
- **Error Handling**: Errors caught at service level; UI should show fallback error messages.  
- **Styling**: Always use Tailwind utilities unless building shared class sets.  

