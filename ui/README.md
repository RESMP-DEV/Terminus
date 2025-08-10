# Terminus UI

Modern frontend interface for the Terminus agent orchestration platform, featuring real-time workflow visualization and backend integration.

## 🚀 Features

### Progressive Waterfall Flow
- **Visual Workflow**: Task Queue → Executor → Sandbox → Monitor progression
- **Interactive Steps**: Click-through workflow with progressive reveal animations
- **Status Indicators**: Real-time status updates (pending, active, completed, failed)
- **Retry Mechanisms**: One-click retry for failed steps with error details

### Real-time Backend Integration
- **Socket.IO Client**: Live connection to Terminus backend (`agent_core/main.py`)
- **Goal Execution**: Submit goals and watch real-time plan generation
- **Live Monitoring**: Track step execution, command output, and errors
- **Auto-reconnection**: Handles connection drops gracefully

### System Dashboard
- **Live Metrics**: Tasks completed, success rate, response times, active agents
- **Performance Tracking**: Real-time system health monitoring
- **Queue Management**: Visual queue depth and priority indicators

## 🛠 Tech Stack

- **Framework**: Next.js 15 with App Router + Turbopack
- **Styling**: Tailwind CSS 4 with modern design system
- **Animations**: Framer Motion for smooth transitions
- **Real-time**: Socket.IO client for backend communication
- **TypeScript**: Full type safety with agent_core payload types
- **Responsive**: Mobile-friendly design with accessibility support

## 🏃‍♂️ Quick Start

```bash
cd ui
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

If your backend is not on the default `http://localhost:8000`, set an environment variable before starting the UI:

```bash
export NEXT_PUBLIC_BACKEND_URL="http://your-backend-host:port"
npm run dev
```

### Backend Connection
The UI automatically connects to the Terminus backend when available:
1. Start backend (recommended): `uvicorn agent_core.main:build_asgi --factory --reload --host 0.0.0.0 --port 8000`
2. Ensure it's running on `http://localhost:8000` (or set `NEXT_PUBLIC_BACKEND_URL` to your backend URL)
3. UI will show "Connected" status and enable live functionality

## 📁 Project Structure

```
ui/
├── app/
│   └── page.tsx              # Main application page
├── components/
│   ├── StepCard.tsx          # Interactive workflow step cards
│   ├── ArrowDown.tsx         # Animated connectors
│   ├── SystemMetrics.tsx     # Live metrics dashboard
│   └── LiveDemo.tsx          # Real-time backend integration
├── lib/
│   ├── types.ts              # TypeScript definitions
│   ├── orchestration.ts      # Mock data and state management
│   └── socket-client.ts      # Socket.IO client wrapper
└── README.md
```

## 🎯 Usage Modes

### Demo Mode (Standalone)
- Works without backend connection
- Mock workflow progression
- System metrics simulation
- Perfect for presentations and development

### Live Mode (Backend Connected)
- Real goal execution via Socket.IO
- Live plan generation and step tracking
- Actual command output and error handling
- Full integration with Terminus orchestration engine

## 🔌 Backend Integration

The UI integrates seamlessly with the Terminus backend through Socket.IO events:

**Outgoing Events:**
- `execute_goal`: Submit user goals for processing

**Incoming Events:**
- `plan_generated`: Receive generated execution plans
- `step_executing`: Track current step execution
- `step_result`: Display command output and results
- `error_detected`: Handle execution errors
- `workflow_complete`: Mark workflow completion
- `re_planning`: Handle plan regeneration

## 🎨 Design Philosophy

Inspired by modern SaaS dashboards with:
- **Progressive Disclosure**: Information revealed as needed
- **Visual Hierarchy**: Clear status and priority indicators
- **Smooth Interactions**: Framer Motion animations
- **Accessibility First**: ARIA labels, keyboard navigation, proper contrast
- **Mobile Responsive**: Works seamlessly on all devices

## 🔧 Development

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build

# Start production server
npm start

# Linting
npm run lint
```

## 🚀 Deployment

The UI is a standard Next.js application and can be deployed to:
- Vercel (recommended)
- Netlify
- Docker containers
- Static hosting (after `npm run build`)

Ensure the backend Socket.IO endpoint is accessible from your deployment environment.
