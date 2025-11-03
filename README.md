# NeuralFlow — AI Task & Workflow Automation (Backend)

A production-ready **Node.js backend** for **NeuralFlow**, an AI-powered task and workflow automation platform.
Built with **Express.js**, **MongoDB**, **Firebase Authentication**, **Socket.IO** (for AI operations), and **Google Gemini AI integration**.

**Live API Base URL:** `https://neuralfiow-backend.onrender.com`  
**API Documentation:** [Postman Docs](https://documenter.getpostman.com/view/38183390/2sB3WpSgYz)  
**Frontend Repository:** [NeuralFlow Frontend](https://github.com/AmmarAlhmoud/NeuralFIow)

---

## Features

- **Firebase Authentication** for secure JWT-based auth.
- **Multi-tenant Workspaces** with **role-based access control**: admin, manager, member, viewer.
- **Real-time Collaboration** via Socket.IO (AI operations only).
- **AI-Powered Automation** with Google Gemini for:

  - Task summarization
  - Subtask generation
  - Priority suggestions

- **Background Processing** with **BullMQ** and **Redis** for AI job queues.
- **REST API** for full CRUD operations across workspaces, projects, tasks, and members.
- **Real-time Notifications** for alerts, mentions, and workspace events.
- **Searchable Workspaces and Projects** for fast access.

---

## Quick Start

### Prerequisites

- Node.js 18+ and npm 8+
- MongoDB (local or Atlas)
- Redis (local or cloud)
- Firebase project with Admin SDK
- Google Gemini API key
- Docker & Docker Compose (optional)

---

### Installation (Local Node.js)

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your actual values
```

### Running Locally

```bash
# Start backend server
npm run dev

# Start AI worker in a separate terminal
npm run worker

# Start both concurrently
npm run dev:all
```

---

### Running with Docker

**Dockerfile** is set up to run the backend with PM2.
**docker-compose.yaml** includes MongoDB and Redis services for a full-stack setup.

```bash
# Build and start all services
docker compose up --build
```

**Docker Services:**

- `mongo` — MongoDB
- `redis` — Redis
- `backend` — NeuralFlow backend

The backend will be available on `http://localhost:5000` (or your mapped port).
Volumes persist MongoDB and Redis data across restarts.

---

## Environment Variables

```env
# Server
PORT=8080
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development

# Database
MONGO_URI=mongodb://localhost:27017/ai_task_platform
REDIS_URL=redis://localhost:6379

# Firebase Admin
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Google Gemini API
GEMINI_API_KEY=your_gemini_key
```

---

## API Overview

Endpoints are organized by domain:

- **Workspaces**: manage workspaces, members, and AI stats
- **Projects & Tasks**: CRUD, assignment, AI-assisted actions
- **AI Endpoints**: summarize tasks, generate subtasks, suggest priorities
- **Comments**: discussion threads per task/entity
- **Notifications**: alerts and updates
- **Health**: service status and liveness checks

All endpoints **require authentication** and follow standard HTTP status codes.

---

## Workspaces Endpoints

| Endpoint                                                    | Method | Description                                        |
| ----------------------------------------------------------- | ------ | -------------------------------------------------- |
| `/workspaces`                                               | GET    | List workspaces accessible to authenticated user   |
| `/workspaces/:workspaceId`                                  | GET    | Fetch workspace details by ID                      |
| `/workspaces/:workspaceId/search`                           | GET    | Fetch workspace data optimized for search/indexing |
| `/workspaces/:workspaceId/ai-stats`                         | GET    | Get AI usage metrics for the workspace             |
| `/workspaces`                                               | POST   | Create a new workspace                             |
| `/workspaces/:workspaceId`                                  | PATCH  | Update workspace metadata/settings                 |
| `/workspaces/:workspaceId`                                  | DELETE | Delete workspace permanently                       |
| `/workspaces/:workspaceId/members/invite`                   | POST   | Invite member to workspace                         |
| `/workspaces/:workspaceId/members/accept-invite/:inviteId`  | POST   | Accept a workspace invitation                      |
| `/workspaces/:workspaceId/members/decline-invite/:inviteId` | POST   | Decline a workspace invitation                     |
| `/workspaces/:workspaceId/member/:memberId`                 | PATCH  | Update member role/status                          |
| `/workspaces/:workspaceId/member/:memberId`                 | DELETE | Remove member from workspace                       |

> Replace `:workspaceId`, `:memberId`, and `:inviteId` with actual IDs.
> Use `{{apiBase}}` environment variable for API base URL.

---

## Roles & Permissions

| Role        | Permissions                                                       |
| ----------- | ----------------------------------------------------------------- |
| **Admin**   | Full access; can manage managers                                  |
| **Manager** | Manage members (except managers), projects, tasks; view analytics |
| **Member**  | View all content, use AI features; cannot modify or invite        |
| **Viewer**  | Read-only; cannot modify content or use AI features               |

---

## AI Features

- **Task Summarization**: Generates concise summaries for tasks based on content and comments.
- **Subtask Generation**: Suggests structured subtasks to break down complex tasks.
- **Priority Suggestions**: Analyzes task details and recommends priority levels.

**Analytics Summary:**

- Active Projects, Team Members, Subtasks Generated, Hours Saved
- AI Accuracy Rate, Automation Metrics, Completion Rate
- Week-over-week comparisons, normalized historical metrics

---

## Deployment

- Use **MongoDB Atlas** and **Redis Cloud** for production.
- Configure `.env` with production credentials.
- Use **PM2** or Docker for persistent deployment.

```bash
# Node.js production start
npm start

# Or via Docker (recommended for full-stack)
docker compose up --build -d
```

---

## Security

- **Helmet.js** for HTTP headers security
- **CORS** configuration for controlled origins
- **Firebase Admin SDK** for verified authentication
- **Role-based access control**
- **Request validation** using Zod schemas

---

## License

This project is licensed under the [MIT License](./LICENSE.md).

---

**Frontend Repository:** [NeuralFlow Frontend](https://github.com/AmmarAlhmoud/NeuralFIow)
**Live App:** [https://neuralflow-app.netlify.app](https://neuralflow-app.netlify.app)

**Built with ❤ by Ammar Alhmoud** — powering AI-driven workflow and productivity solutions.
