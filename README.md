# openKMS - Open Knowledge Management System

An enterprise-ready open knowledge management system combining:

- **Documents** – Tree of document channels (like Google Drive). PDF, HTML, ZIP, images → Markdown
- **Articles** – Tree of article channels (like Google Drive). CMS-style content with custom fields
- **Knowledge Bases** – Create KBs, copy content from search, generate FAQs, and run per-KB RAG Q&A

## Core Workflow

1. **Manage content** – Upload documents and create articles; organize in channel trees (like Google Drive)
2. **Organize** – Document channels and article channels are separate trees
3. **Build knowledge bases** – Search documents and articles, copy selected items into a KB
4. **Generate FAQ** – Generate FAQs from documents/articles and add to the knowledge base
5. **RAG Q&A** – Each knowledge base provides its own RAG-based question answering

## Tech Stack

- **React 19** + **TypeScript**
- **Vite** – Build tool
- **React Router** – Client-side routing
- **Lucide React** – Icons

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Build for Production

```bash
cd frontend
npm run build
npm run preview
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── Layout/       # Sidebar, Header, MainLayout
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Documents.tsx      # Document channels tree + documents table
│   │   ├── DocumentDetail.tsx # View document: markdown + parsing result
│   │   ├── Articles.tsx       # Article channels tree + articles
│   │   ├── KnowledgeBaseList.tsx
│   │   └── KnowledgeBaseDetail.tsx  # Content, Search & Copy, FAQ, RAG Q&A
│   ├── App.tsx
│   └── main.tsx
└── package.json
```

## Features (Prototype)

- **Documents** – Tree of document channels (sidebar), documents in table, View opens detail with markdown + parsing result (from `src/data/examples/`)
- **Articles** – Tree of article channels (sidebar), articles in selected channel, CMS-style with fields
- **Knowledge Bases** – Create KBs; each KB has:
  - Content view (docs, articles, FAQs copied in)
  - Search & Copy (search docs/articles, copy to KB)
  - Generate FAQ (from KB content, add to KB)
  - RAG Q&A (per-KB question answering)
- **Theme** – Light/dark mode
- **Search** – Global search bar (UI)

## Next Steps for Production

- Backend API
- Document parsing (PDF, HTML, ZIP, images → Markdown)
- Vector store per knowledge base
- LLM integration for RAG and FAQ generation
- Authentication (OAuth, LDAP, SAML)
- Role-based access control
