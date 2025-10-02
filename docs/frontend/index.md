# Frontend Overview

- **Framework:** React + TypeScript
- **Build:** Vite
- **Styling:** Tailwind + custom components
- **Icons:** lucide-react
- **HTTP:** Axios (services/api.ts)

### Local dev
```bash
cd frontend
npm i
npm run dev
# http://localhost:5173

# Frontend Documentation

## Overview
The **Campus Study Buddy frontend** is built with **React 18** and **TypeScript**, styled with **TailwindCSS**, and bundled with **Vite** for fast local development and production builds. The frontend connects to the backend via a service layer (`DataService`) that centralizes API calls.

The design emphasizes:
- **Role-based dashboards** (Student vs Organization views)  
- **Reusable components** (Sidebar, Header, StatsCards, BuddySearch, etc.)  
- **Responsive layouts** (mobile → desktop with Tailwind breakpoints)  
- **Modern UI/UX principles** (clean cards, accessible forms, subtle animation)  

---


