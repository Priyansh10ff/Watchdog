# Uptime Tracker

## Problem Statement
TODO

## Target Users
TODO

## Solution
TODO

## Key Features
- User accounts with cookie-based JWT authentication
- TODO: monitors, scheduled checks, incident state machine, email alerts, public status page

## Tech Stack
- Frontend: React, React Router, Axios, Tailwind CSS, React Context
- Backend: Node.js, Express, MongoDB, Mongoose
- Auth and security: JWT in httpOnly cookie, bcrypt, helmet, rate limiting
- TODO: node-cron, nodemailer

## Architecture
TODO

## Local Setup

### Backend
```bash
cd server
npm install
cp .env.example .env   # then fill in the values
npx nodemon
```

### Frontend
```bash
cd client
npm install
cp .env.example .env
npm run dev
```

## Environment Variables

Server (`server/.env`):
```text
PORT
NODE_ENV
MONGO_URI
JWT_SECRET
JWT_EXPIRES_IN
CLIENT_URL
```

Client (`client/.env`):
```text
VITE_API_URL
```

Never commit real secrets.

## Deployment
TODO

## Author
Priyansh
