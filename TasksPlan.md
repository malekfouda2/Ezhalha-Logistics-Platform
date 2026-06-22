# Tasks Module Plan

## Summary
Build an internal-only Task Management module for ezhalha staff, inspired by Basecamp workflow and adapted to existing system architecture, layouts, permissions, notifications, and styling.

V1 scope:
- Available only to internal users: `admin` and `operations`
- No client access, no client routes, no client visibility
- Any internal authenticated user can create, assign, comment on, and view tasks
- Single assignee only
- Two statuses only: `PENDING`, `COMPLETED`
- Assignee completes task
- Creator reopens task
- Tasks are standalone collaboration records and do not trigger business logic elsewhere

Expose module in two shells:
- `/admin/tasks`
- `/operations/tasks`

Use one shared backend service and one shared frontend page implementation, rendered inside existing admin and operations layouts.

## Architecture and Key Changes

### 1. Data Model
Add new shared schema entities:

- `tasks`
  - `id`
  - `title`
  - `description`
  - `status` (`PENDING` | `COMPLETED`)
  - `priority` (`LOW` | `MEDIUM` | `HIGH` | `URGENT`)
  - `createdByUserId`
  - `assignedToUserId`
  - `deadlineAt` nullable
  - `completedAt` nullable
  - `completedByUserId` nullable
  - `reopenedAt` nullable
  - `reopenedByUserId` nullable
  - `lastActivityAt`
  - `createdAt`
  - `updatedAt`

- `task_completion_recipients`
  - `id`
  - `taskId`
  - `userId`
  - unique on `(taskId, userId)`

- `task_attachments`
  - `id`
  - `taskId`
  - `objectPath`
  - `fileName`
  - `contentType`
  - `sizeBytes`
  - `uploadedByUserId`
  - `sortOrder`
  - `createdAt`

- `task_comments`
  - `id`
  - `taskId`
  - `authorUserId`
  - `parentCommentId` nullable
  - `body`
  - `createdAt`
  - `updatedAt`
  - `deletedAt` nullable

- `task_activity_events`
  - `id`
  - `taskId`
  - `actorUserId` nullable
  - `eventType`
  - `title`
  - `description` nullable
  - `metadata` text JSON nullable
  - `createdAt`

Indexes:
- `tasks`: `(status)`, `(assignedToUserId, status)`, `(createdByUserId, status)`, `(deadlineAt, status)`, `(lastActivityAt desc)`
- `task_comments`: `(taskId, createdAt)`
- `task_activity_events`: `(taskId, createdAt desc)`
- `task_attachments`: `(taskId, sortOrder)`

No task linkage to shipments, clients, invoices, or operations entities in v1.

### 2. Permissions and Access Model
Add internal permission family:
- `tasks:read`
- `tasks:create`
- `tasks:update`
- `tasks:assign`
- `tasks:complete`
- `tasks:reopen`
- `task-comments:create`

Seed these permissions to all internal roles in v1:
- platform roles
- operations roles
- all internal department roles

Policy rules:
- create: any authenticated internal user
- assign: any authenticated internal user
- view: any authenticated internal user can view all internal tasks
- complete: current assignee only, task must be `PENDING`
- reopen: creator only, task must be `COMPLETED`
- comment/reply: any internal user who can view task
- edit core task fields: creator only in v1
- attachment add: any user who can create/edit/comment in allowed context
- attachment delete: task creator or attachment uploader

No client permissions, client routes, or client visibility rules.

### 3. APIs and Interfaces
Add authenticated internal API set under shared `requireAuth`, then enforce internal-user guard plus task policy:

- `GET /api/tasks`
  - query: `view`, `search`, `assigneeId`, `creatorId`, `status`, `priority`, `deadlinePreset`, `createdFrom`, `createdTo`, `page`, `pageSize`, `sort`
  - returns paginated task list DTOs
  - rejects client sessions

- `POST /api/tasks`
  - body: `title`, `description`, `assignedToUserId`, `deadlineAt?`, `priority`, `completionRecipientUserIds[]`, `attachments[]`
  - creates task, recipients, attachments, initial activity
  - rejects client sessions

- `GET /api/tasks/:id`
  - returns:
    - task header
    - recipients
    - attachments
    - comments with replies
    - activity timeline
    - capability flags: `canEdit`, `canComplete`, `canReopen`, `canComment`

- `PATCH /api/tasks/:id`
  - creator-only
  - patchable: `title`, `description`, `assignedToUserId`, `deadlineAt`, `priority`, `completionRecipientUserIds[]`, `attachments[]`

- `POST /api/tasks/:id/complete`
  - assignee-only

- `POST /api/tasks/:id/reopen`
  - creator-only

- `POST /api/tasks/:id/comments`
  - body: `body`, `parentCommentId?`

- `GET /api/tasks/users`
  - internal active user directory for assign/filter controls
  - returns minimal user refs:
    - `id`, `fullName`, `email`, `userType`, `primaryRole`, `department`

- `GET /api/tasks/summary`
  - returns dashboard/widget counters:
    - `myPending`
    - `dueToday`
    - `overdue`
    - `recentlyCompleted`
    - `allPending`
    - `assignedByMePending`

Primary DTOs:
- `TaskListItem`
  - `id`, `title`, `status`, `priority`, `deadlineAt`, `isOverdue`, `createdAt`, `completedAt`, `lastActivityAt`
  - `creator`, `assignee`
  - `commentCount`, `attachmentCount`, `completionRecipientCount`
- `TaskDetail`
  - `task`
  - `completionRecipients`
  - `attachments`
  - `comments`
  - `activity`
  - `capabilities`
- `TaskSummary`
  - widget/view counters

Reuse existing `/api/uploads/request-url` for attachment uploads. No task-specific upload endpoint.

### 4. Notifications and Activity
Reuse existing `notifications` table and `notifyUser` / `notifyUsers` pipeline.

On create:
- create `task_created` activity event
- notify assignee in app
- optional email can stay off by default unless current notification helper behavior is reused globally

On assignee change:
- create `assignment_changed`
- notify new assignee

On deadline change:
- create `deadline_changed`

On comment:
- create `comment_added`
- no broad broadcast notification in v1

On complete:
- create `task_completed`
- notify creator and completion recipients
- notification includes:
  - task title
  - assignee name
  - completion timestamp
  - link to task
- link resolves to recipient shell:
  - admin recipient -> `/admin/tasks?taskId=...`
  - operations recipient -> `/operations/tasks?taskId=...`

On reopen:
- create `task_reopened`
- notify assignee in app

Activity timeline source of truth is `task_activity_events`.

### 5. Frontend UX and Component Design
Routes:
- `/admin/tasks`
- `/operations/tasks`

Navigation:
- add `Tasks` item to admin sidebar guarded by `tasks:read`
- add `Tasks` item to operations sidebar
- no client navigation entry

Page structure:
- page header with title, short description, `New Task` button
- saved view tabs:
  - `All Tasks`
  - `My Tasks`
  - `Assigned By Me`
  - `Completed Tasks`
  - `Overdue Tasks`
- filter/search toolbar
- task list grouped into:
  - `Overdue`
  - `Due Today`
  - `Upcoming`
  - `No Deadline`
  - `Completed`

Task row:
- compact list/table row using existing system spacing and typography
- status control
- title
- assignee avatar/name
- creator
- priority badge
- deadline badge
- comment count
- attachment count
- overdue styling uses existing warning/destructive tokens

Task detail:
- right-side sheet
- top section:
  - title
  - status
  - priority
  - assignee
  - creator
  - deadline
- description
- attachments
- completion recipients
- discussion thread
- activity timeline
- footer actions:
  - edit
  - complete
  - reopen
  - comment

Create/Edit task modal:
- title
- description
- assignee select
- deadline picker
- priority select
- completion recipients multi-select
- attachments uploader
- submit

Comments:
- top-level comments oldest-first
- replies one level deep in v1
- plain text only
- no mentions, reactions, or rich text in v1

Dashboard widgets:
- `My Pending Tasks`
- `Tasks Due Today`
- `Overdue Tasks`
- `Recently Completed Tasks`
- reusable cards backed by `GET /api/tasks/summary`

State management:
- React Query for server state
- URL query params for view/filter/search/open task
- local state for modal/sheet open state and draft forms
- shared hooks:
  - `useTasksList`
  - `useTaskDetail`
  - `useTaskSummary`
  - `useTaskUsers`

## Step-by-Step Implementation Plan

1. Add task enums, tables, insert schemas, select types, and indexes in shared schema.
2. Seed task permissions into internal permission catalog and assign to all internal roles.
3. Add storage methods and task service layer for:
   - list
   - detail
   - create/update
   - complete/reopen
   - comments/replies
   - activity writing
   - notification dispatch
4. Add internal-user access guard for task routes.
5. Add API validation schemas and task endpoints.
6. Add task summary endpoint and internal user directory endpoint.
7. Add admin navigation permission config for tasks and sidebar entries in admin and operations shells.
8. Add shared frontend Tasks page with shell-aware wrappers for admin and operations.
9. Build toolbar, saved views, grouped list, row component, task sheet, create/edit modal, attachments block, comments block, activity timeline.
10. Add dashboard widget components and summary query integration.
11. Add backend tests for permissions, visibility, CRUD, comments, notifications, summary, and attachment metadata.
12. Add frontend tests for routing, filters, modal/sheet flows, overdue states, and dark mode.
13. Run manual QA in admin and operations shells.

## Test Plan

### Backend
- migration creates all task tables and indexes
- client session rejected from all `/api/tasks*` endpoints
- internal users can create, assign, list, comment
- assignee can complete; non-assignee cannot
- creator can reopen; non-creator cannot
- creator can edit; non-creator cannot
- completion recipients persist correctly
- assignment/deadline/complete/reopen/comment create activity rows
- completion sends notifications to creator and selected recipients
- summary counters match fixture data
- user directory returns active internal users only

### Frontend
- `/admin/tasks` renders in admin shell
- `/operations/tasks` renders in operations shell
- no client route exists
- sidebar entry visibility respects internal shell and permissions
- saved view tabs map correctly to query state
- filters and search drive list query correctly
- detail sheet loads comments/activity and capability flags
- complete/reopen actions update list and detail views
- overdue tasks visually highlighted in light and dark mode
- widget cards deep-link to filtered tasks views

### Manual QA
- admin creates task for operations user
- operations user creates task for admin user
- assignee completes task and creator receives notification
- creator reopens completed task
- comment and reply workflow works
- attachment upload and download works under authenticated internal session
- layout and spacing match existing internal system feel

## Assumptions and Defaults
- Final file, when execution mode starts: `/TasksPlan.md`
- Internal-only means `admin` and `operations` users only
- No client route, client visibility, or client task permissions in v1
- Tasks are standalone and not linked to shipments or clients
- Single assignee only
- Creator owns edit and reopen
- Assignee owns complete
- Plain-text comments only
- One-level replies in UI
- Task attachments are task-level only, not comment-level
- Existing upload and notification infrastructure are reused
- Future expansion can add subtasks, private scopes, mentions, linked entities, advanced permission rules, and analytics
