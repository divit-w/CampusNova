# CampusNova

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Python](https://img.shields.io/badge/python-3.11-blue)
![Node](https://img.shields.io/badge/node-20-blue)
![Security Audit](https://img.shields.io/badge/security%20audit-A-brightgreen)

## Executive Summary
CampusNova is an intelligent, high-performance campus operations and ERP platform. Designed to solve complex institutional bottlenecks through constraint-based resource scheduling, real-time alerting, and automated administrative workflows. It transforms fragmented legacy campus processes into a single, cohesive, minimal-click command center.

## System Architecture & Tech Stack

| Layer | Technologies | Primary Function |
|---|---|---|
| **Backend** | Python 3.11, FastAPI, Pydantic | High-throughput API routing, core orchestration, input validation |
| **Database** | MongoDB, Motor (Async) | Scalable document storage, asynchronous I/O |
| **Frontend** | Next.js 14 (App Router), React, Tailwind CSS | Server-side rendered interfaces, responsive client views, Framer Motion animations |
| **AI/ML Layer** | LlamaIndex, ChromaDB, NLP Models | Intelligent query parsing, predictive resource allocation, constraint-solving algorithms |
| **Real-time** | Server-Sent Events (SSE) | Unidirectional event streaming for live operational alerts |

*Note: The current architecture represents a production-ready MVP. Future extensions include distributed caching (Redis), message queues (Celery/RabbitMQ), and horizontal scaling across Kubernetes clusters.*

## Core Engineering Features

- **Automated Constraint Solving:** Heuristic algorithms compute conflict-free timetables balancing teacher availability, room capacity, and subject requirements.
- **Real-Time Operations Pipeline:** A robust SSE architecture streams live operational alerts directly to the dashboard, enabling immediate triage of attendance drops or substitute teacher requirements.
- **Strict Security & Authorization:** Comprehensive IDOR mitigations, role-based access control (RBAC), and rigorous input validation at the Pydantic boundary ensure institutional data integrity.
- **Minimal-Click User Experience:** Actionable interfaces proactively surface bottlenecks, eliminating the need for administrators to hunt for data.
- **Geofence Mitigation & Audit Trails:** Secure IP logging, spoofing flags on faculty clock-ins, and strict document approval pipelines.

## Project Directory Tree

```text
CampusNova/
├── backend/
│   ├── app/                # Core FastAPI application
│   │   ├── api/            # API routing and endpoints
│   │   ├── core/           # Security, config, and infrastructure utilities
│   │   ├── schemas/        # Pydantic validation models
│   │   └── services/       # Business logic and external service integrations
│   ├── tests/              # Pytest suites for backend endpoints
│   ├── Dockerfile          # Container definition
│   └── requirements.txt    # Python dependencies
├── frontend/
│   ├── app/                # Next.js App Router structure
│   ├── components/         # Reusable React UI components
│   ├── lib/                # Frontend utilities, API clients, and state
│   └── public/             # Static assets
├── docs/                   # Architecture diagrams and specifications
├── scripts/                # Database seed and operational scripts
└── docker-compose.yml      # Local development container orchestration
```

## Local Installation & Deployment Guide

### Prerequisites
- Docker and Docker Compose
- Node.js 20+
- Python 3.11+
- MongoDB instance (local or Atlas)

### Step 1: Environment Configuration
Copy the sample environment variables and configure them for your local environment:
```bash
cp .env.example .env
```
Ensure the `MONGO_URI` is correctly pointed to your running MongoDB instance.

### Step 2: Bootstrapping the Backend
The backend runs seamlessly via Docker Compose:
```bash
docker-compose up --build -d
```
Alternatively, for local development:
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Step 3: Database Seeding
Execute the automation scripts to populate the database with initial administrative accounts and demo data:
```bash
python scripts/seed_admin.py
python scripts/seed_demo_data.py
```

### Step 4: Launching the Frontend
Navigate to the frontend directory and start the Next.js development server:
```bash
cd frontend
npm install
npm run dev
```
The application will be accessible at `http://localhost:3000`.

## Try It Live & Demo Access

The backend API documentation is automatically generated and accessible when running locally:
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

Test credentials for the demonstration environment:
- **Admin Portal:** `admin@campusnova.app` / `admin_secure_password`
- **Faculty Portal:** Refer to the seeded demo data output for generated teacher credentials.

## Enterprise Security & Compliance

CampusNova is built with security as a primary directive. The system implements:
- **Role-Based Access Control (RBAC):** Strict separation of privileges between `admin`, `teacher`, and `student` roles.
- **Insecure Direct Object Reference (IDOR) Prevention:** Cryptographically signed tokens map strictly to domain profiles, preventing cross-tenant data access.
- **Rate Limiting:** IP-based request throttling on sensitive endpoints to mitigate brute-force and DDoS vectors.
- **Input Sanitization:** Deep validation via Pydantic models guarantees safe data ingestion from the client.
