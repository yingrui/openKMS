# openKMS Documentation

**Open Knowledge Management System** – A platform for document management, article CMS, and knowledge bases with RAG Q&A.

## Documentation Index

| Document | Description |
|----------|-------------|
| [Project Overview](#project-overview) | High-level summary and goals |
| [Functionalities](functionalities.md) | Feature list and capabilities |
| [Architecture](architecture.md) | System design, components, data flow |
| [Development Plan](development_plan.md) | Roadmap and planned work |
| [For Developer](for%20developer/) | Setup, design notes, environment |

## Project Overview

openKMS organizes content in **channel trees** (similar to Google Drive folders). It supports:

- **Documents** – Upload PDF, HTML, ZIP, images; parse via VLM (PaddleOCR-VL); convert to Markdown
- **Articles** – CMS-style articles with content and metadata (feature toggle)
- **Knowledge Bases** – RAG Q&A over documents (feature toggle)

### Tech Stack

- **Frontend**: React 19, Vite 7, TypeScript, React Router
- **Backend**: FastAPI, SQLAlchemy (async), PostgreSQL
- **Document Parsing**: PaddleOCR-VL with mlx-vlm-server as VLM backend
- **document_parsing** (planned): CLI with Typer (≥0.9.0), PaddleOCR-VL; configurable as pipeline, invoked by async jobs
- **Auth**: Keycloak (optional)

### Project Structure

```
openKMS/
├── frontend/          # React app
├── backend/           # FastAPI service
├── vlm-server/        # MLX-VLM server (VLM backend)
├── openkms-cli/       # CLI for document parsing (Typer)
└── docs/              # Documentation
```

### Quick Start

```bash
# 1. Start vlm-server (for document parsing)
cd vlm-server && ./start.sh

# 2. Backend
cd backend && pip install -r requirements.txt && alembic upgrade head && ./dev.sh

# 3. Frontend
cd frontend && npm install && npm run dev
```

Backend: http://localhost:8102 | Frontend: http://localhost:5173
