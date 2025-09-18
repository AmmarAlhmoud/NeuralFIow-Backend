# NeuralFlow (AI Task \& Workflow Automation) Backend

A production-ready JavaScript backend for an AI-powered task and workflow management platform built with Express.js, MongoDB, Firebase Authentication, Socket.IO for real-time updates, and Google Gemini AI integration.

## Features

- Firebase Authentication for secure JWT-based authentication.
- Multi-tenant Workspaces with role-based access control (admin/manager/member/viewer).
- Real-time Collaboration via Socket.IO for live updates and notifications.
- AI-Powered Automation using Google Gemini for summarization, subtask generation, and priority recommendations.
- Background Processing with BullMQ and Redis for AI job queues.
- Complete REST API for full CRUD operations across resources.
- Real-time Notifications for alerts, mentions, and workspace updates.

## Quick Start

### Prerequisites

- Node.js 18+ and npm 8+.
- Docker and Docker Compose.
- Firebase project with Admin SDK.
- Google Gemini API key.

### Installation

1. Install dependencies with the following command.

```bash
npm install
```

2. Copy and configure environment variables.

```bash
cp .env.example .env
# Edit .env with your actual values
```

3. Start services with Docker Compose.

```bash
docker compose up -d
```

4. Run the application and the AI worker.

```bash
# Development mode
npm run dev

# Start AI worker (separate terminal)
npm run worker
```

## Configuration

### Firebase Setup

1. Create a Firebase project.
2. Generate a service account key.
3. Add credentials to .env.

### Gemini AI Setup

1. Obtain an API key from Google AI Studio.
2. Add GEMINI_API_KEY to .env.

## API Documentation

The full API is documented and continuously maintained in Postman; refer to the published docs here: <POSTMAN_DOCS_URL>.

## AI Features

### Task Summarization

Generates concise, actionable summaries based on task context and recent comments, focusing on decisions, blockers, and next steps.

### Subtask Generation

Breaks down complex tasks into 6–10 actionable subtasks with acceptance criteria to streamline execution.

### Priority Suggestions

Analyzes due dates, labels, and task content to recommend priority levels aligned with urgency and scope.

## Deployment

Configure production environment variables, deploy to the preferred cloud platform, and use managed services such as MongoDB Atlas and Redis Cloud for scalability and resilience.

## Security

- Helmet.js for security headers.
- CORS protection for controlled cross-origin access.
- Firebase Admin SDK authentication for verified identity.
- Role-based access control to enforce least privilege.
- Input validation with Zod schemas for robust request handling.

## License

MIT License.

---

Built with ❤ for modern task management and AI automation.
