# Overview

Campus Study Buddy helps students organize learning, track progress, and connect with study partners.

## High-level features
- Dashboard with study buddy suggestions, activity, schedule
- Courses list + progress
- Notes & reminders
- Study sessions / calendar

## Tech stack
- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, Lucide-react icons
- **Backend:** Node.js, Express, TypeScript
- **Infra/Services:** GitHub Actions/Pages, Azure Cosmos DB, Azure Web PubSub, Azure Service Bus

## Why This Tech Stack?
We chose React + TypeScript for the frontend because it allows us to write safe, reusable components. TailwindCSS accelerates UI prototyping. Vite gives us faster builds compared to older tools.

On the backend, Express + Node.js are easy to learn and integrate well with frontend JavaScript skills. TypeScript helps us avoid bugs. Cosmos DB provides flexibility for storing varied data like courses, notes, and study sessions.

Using Azure services (Service Bus, Web PubSub) allows us to add real-time features and async processing without reinventing the wheel.

GitHub Actions + Pages handle our CI/CD and documentation hosting for free and automatically.

