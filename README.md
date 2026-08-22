<div align="center">
  
<img src="./screenshots/logo.png" alt="CampusNova Logo" width="150" />

# CampusNova: Intelligent Campus Operations

**An AI-driven, algorithmic operating system that automates NP-Hard scheduling, logistics, and document workflows for modern educational institutions.**

[![Next.js](https://img.shields.io/badge/Frontend-Next.js_14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Python](https://img.shields.io/badge/Core-Python_3.11-3776AB?style=for-the-badge&logo=python)](https://www.python.org/)
[![OR-Tools](https://img.shields.io/badge/Solver-Google_OR--Tools-4285F4?style=for-the-badge&logo=google)](https://developers.google.com/optimization)
[![ChromaDB](https://img.shields.io/badge/Vector_DB-ChromaDB-FF4F00?style=for-the-badge)](https://www.trychroma.com/)

</div>

---

## 🎯 Problem Statement & Solution

Administrative operations in large educational institutions are plagued by combinatorial complexity. Scheduling thousands of classes without conflicts is an NP-Hard problem. Managing transportation logistics across scattered student coordinates is a mathematically intense routing challenge. Furthermore, extracting structured data from handwritten physical forms creates massive operational bottlenecks.

**CampusNova** solves this by replacing manual administration with high-performance algorithmic engines and Edge AI. By leveraging Constraint Programming (CP-SAT), K-Means Clustering, and localized Retrieval-Augmented Generation (RAG), CampusNova delivers an automated, zero-latency, and highly intelligent campus management system.

---

## 🧠 Architectural & Algorithmic Logic (The Secret Sauce)

Our platform isn't just a CRUD app; it is powered by a robust algorithmic backend designed to solve mathematically rigorous operational challenges.

### 1. Timetable Optimizer (CP-SAT Solver)
Scheduling is a notoriously NP-Hard constraint satisfaction problem. We implemented **Google OR-Tools' CP-SAT solver** to mathematically guarantee conflict-free schedules. 
* **The Matrix:** We model the academic week as a massive 6D boolean array `[grade][section][subject][teacher][day][time_slot]`.
* **Hard Constraints (Pruning):** The solver algorithmically prunes invalid permutations, enforcing strict physical boundaries (e.g., a teacher cannot physically be in two rooms at the same time, sections can only attend one class per slot, and daily subject maximums cannot be exceeded).
* **Soft Constraints (Optimization):** We introduced a proprietary **"Morning Bias"** weight function. The solver maximizes an objective function that mathematically prioritizes scheduling cognitively demanding subjects (like Mathematics and Physics) in earlier morning time slots to optimize student cognitive load.

### 2. Smart Transport Engine (K-Means & TSP)
Routing school buses efficiently requires solving complex logistics. 
* **Stop Generation:** We extract geospatial coordinates of all enrolled students and apply **K-Means Clustering** to dynamically generate optimal, centralized depot stops, minimizing the walking distance for grouped students.
* **Vehicle Routing:** Once the clusters are established, we treat the sequence of stops as a variant of the **Traveling Salesperson Problem (TSP)**, applying spatial heuristics to calculate the most fuel- and time-efficient sequence for the transport fleet.

### 3. Knowledge Base (Zero-Cost Local RAG)
Our RAG (Retrieval-Augmented Generation) chat interface allows administrators to talk to their institutional documents with complete data privacy.
* **Local Embeddings:** We bypassed expensive third-party APIs by generating vector embeddings entirely locally using the HuggingFace `all-MiniLM-L6-v2` transformer model.
* **Vector Indexing:** These high-dimensional embeddings are indexed directly into a localized **ChromaDB** instance for rapid semantic similarity search (`L2` distance).
* **3-Tier Fallback & Safety Guardrails:** To ensure absolute UI stability, our LLM parser features a robust 3-tier fallback (Strict JSON -> Regex Extraction -> Plain Text) and intercepts innate AI model safety refusals, sanitizing them through strict `_SAFETY_SIGNALS` guardrails before they reach the client.

### 4. Vision OCR & Edge Liveness
* **Intelligent Document Intake:** We pipeline physical, handwritten documents (like leave applications and medical notes) through a Vision OCR model, forcing the output into strict JSON schemas for instant digitization and operational indexing.
* **Edge AI Attendance:** Faculty geofenced clock-ins are protected by an in-browser Edge AI React portal. It accesses the device camera to verify real-time human liveness via localized object/face detection before authorizing the geolocation payload to the backend.

---

## ✨ Core Features & Interface

We built a stunning, glassmorphism-inspired UI designed for speed, clarity, and administrative efficiency.

### Landing Page & Auth
Secure, seamless onboarding into the institutional ecosystem.
<div align="center">
  <img src="./screenshots/landing%20page.png" alt="Landing Page" width="100%" />
</div>

### Operations Dashboard
A high-altitude, real-time telemetry view of campus health, attendance, and logistics.
<div align="center">
  <img src="./screenshots/dashboard.png" alt="Dashboard" width="100%" />
</div>

### AI Command Center
Execute natural language prompts to perform complex administrative actions instantly.
<div align="center">
  <img src="./screenshots/ai%20command.png" alt="AI Command" width="100%" />
</div>

### Timetable Engine (CP-SAT)
Watch the algorithmic solver generate mathematically perfect, conflict-free schedules in seconds.
<div align="center">
  <img src="./screenshots/timetable.png" alt="Timetable Optimizer" width="100%" />
</div>

### Edge AI Attendance
Geofenced, liveness-verified clock-ins for faculty and staff.
<div align="center">
  <img src="./screenshots/attendance.png" alt="Attendance & Liveness" width="100%" />
</div>

### Document Intake & OCR
Drag and drop messy handwritten forms; get structured, verified JSON data back.
<div align="center">
  <img src="./screenshots/documents.png" alt="Vision OCR" width="100%" />
</div>

### Smart Transport
Visualize the K-Means clustered stops and optimized fleet routing paths.
<div align="center">
  <img src="./screenshots/transport.png" alt="Transport Optimizer" width="100%" />
</div>

### RAG Knowledge Base
Ask questions in plain English. Get answers grounded in your exact institutional policies.
<div align="center">
  <img src="./screenshots/knowledge.png" alt="Knowledge Chat" width="100%" />
</div>

### Vector Document Library
Manage the chunks and embeddings stored inside the local ChromaDB vector store.
<div align="center">
  <img src="./screenshots/doc%20library.png" alt="Doc Library" width="100%" />
</div>

### User Management
Comprehensive RBAC (Role-Based Access Control) for students, teachers, and administrators.
<div align="center">
  <img src="./screenshots/user%20management.png" alt="User Management" width="100%" />
</div>

---

## 🚀 Local Setup & Deployment

Follow these instructions to run the CampusNova stack locally for evaluation.

### 1. Prerequisites
- Python 3.10+
- Node.js 18+
- MongoDB (Running locally on default port `27017`)

### 2. Backend Setup (FastAPI)
```bash
# Clone the repository
git clone https://github.com/vishaljaiswal14/CampusNova.git
cd CampusNova

# Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # On Windows use `venv\Scripts\activate`

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
# Copy .env.example to .env and insert your OpenRouter / Gemini API Keys

# Start the FastAPI server
uvicorn app.main:app --reload
```
*The backend will be live at `http://127.0.0.1:8000`*

### 3. Frontend Setup (Next.js)
```bash
# Open a new terminal tab
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev
```
*The frontend will be live at `http://localhost:3000`*
