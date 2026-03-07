# Document Channel Management – Design

## Overview

Channels organize documents into a tree (e.g. Sales → Product Brochures). Channels are stored in the backend (`document_channels` table). The frontend should use the API as the single source of truth—no mock data.

## Current Backend

- **GET** `/api/channels/documents` → tree of `{ id, name, children[] }`
- **POST** `/api/channels/documents` → `{ name, parent_id?, sort_order? }` → create channel
- Model: `DocumentChannel` with `id`, `name`, `parent_id`, `sort_order`

## Design Principles

1. **API as source of truth** – All channel data comes from the backend.
2. **Create-first flow** – Users create channels before browsing documents.
3. **Graceful empty state** – When no channels exist, guide users to create the first one.
4. **Document channels only** – Articles use separate channels; focus on documents first.

## User Flows

### 1. First-time setup (no channels)

- User goes to **Documents** (`/documents`).
- Sidebar: empty or “No channels yet”.
- Main area: empty state with CTA: “Create your first channel” → links to `/documents/channels`.
- User creates a top-level channel at `/documents/channels`.
- After creation, user can return to Documents and see the new channel in the sidebar.

### 2. Channel management (`/documents/channels`)

- Create top-level channel: name only, parent = None.
- Create sub-channel: name + parent.
- List shows tree.
- Entry: from Documents page “Manage channels” link (no sidebar menu).

### 3. Browsing documents

- Sidebar: channel tree from API.
- Selecting a channel filters documents by that channel (and its descendants).
- If no channel selected and channels exist: default to first channel or “All”.
- If no channels: show empty state with CTA to create.

## Data Flow

```
Backend (document_channels)
    ↓ GET /api/channels/documents
channelsApi.fetchDocumentChannels()
    ↓
Documents page / Sidebar (channel tree, selection)
DocumentChannels page (create, list)
```

## Components to Change

| Component | Before | After |
|-----------|--------|-------|
| `data/channels.ts` | Mock `documentChannels`, `defaultDocumentChannel` | Remove mocks. Keep `ChannelNode` type. Add helpers that accept channel list as argument. |
| `data/channelsApi.ts` | Already fetches from API | Keep as-is |
| Sidebar | Uses `documentChannels[0]?.children` | Fetch from API. Show empty state when no channels. |
| Documents page | Uses `defaultDocumentChannel`, `getDocumentChannelName`, `getDocumentLeafChannelIds` | Fetch channels from API. Handle no-channel / no-selection. |
| DocumentChannelSettings | Uses `defaultDocumentChannel`, `getDocumentChannelName` | Receive channel from URL; show name from API or fallback. |
| `data/documents.ts` | `mockDocumentsByChannel` keyed by mock channel IDs | Will need backend integration later; for now empty or placeholder. |

## Empty States

- **Documents, no channels**: “No channels yet. Create your first channel to organize documents.” [Create channel]
- **Documents, channels exist but none selected**: Default to first leaf or “All documents”.
- **Sidebar, no channels**: Collapse Documents section or show “Create channel” link.
- **DocumentChannels**: Already has empty state with create form.

## Open Questions

1. **“All documents” view** – Show documents from all channels when no channel selected?
2. **Article channels** – Same pattern later, or different model?
3. **Default channel** – When channels exist, default to first one, or require explicit selection?
4. **Channel settings** – DocumentChannelSettings uses `?channel=id`. If channel is deleted, handle 404?
