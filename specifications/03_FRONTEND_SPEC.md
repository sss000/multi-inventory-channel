# Inventory Truth & Reconciliation Platform — Canonical Frontend Design & Implementation Specification v1.0

## 0. Document Status

**Status:** Canonical frontend implementation contract  
**Version:** 1.0  
**Companion specifications:**
- `FINAL ENGINEERING SPECIFICATION V2 — Multichannel Inventory Control Platform`
- `Inventory Truth & Reconciliation Platform — Canonical Product Design System and Frontend Engineering Specification`

This document bridges the product design system and the backend engineering contract.

It defines how the frontend must be implemented, composed, validated, tested, instrumented, and released.

The three documents form one contract:

```text
Engineering Specification
        +
Product Design System
        +
Canonical Frontend Implementation Specification
        ↓
Production implementation
```

### Authority

The engineering specification remains authoritative for:
- domain behavior
- data integrity
- tenancy
- security
- database behavior
- synchronization
- provider behavior
- reconciliation rules
- backend APIs
- operational requirements

The product design system remains authoritative for:
- visual language
- interaction philosophy
- information architecture
- component intent
- responsive principles
- UX direction

This document is authoritative for:
- frontend architecture
- routes
- component contracts
- UI state handling
- data-to-screen mapping
- permission behavior
- responsive implementation
- interaction contracts
- instrumentation
- frontend acceptance criteria
- visual and UX definition of done

If a conflict exists, do not silently choose a behavior. Resolve the conflict against the authoritative engineering/domain rule and document the decision.

---

# 1. Implementation North Star

The frontend must make inventory state understandable without hiding system complexity.

The primary interaction loop is:

```text
STATE
 ↓
CONTEXT
 ↓
EVIDENCE
 ↓
ACTION
 ↓
RESULT
 ↓
AUDIT
```

The frontend is not an independent source of truth.

It is a deterministic projection of server-authoritative state.

### Core invariants

The frontend MUST:

1. Never represent an unverified write as verified.
2. Never silently replace unavailable provider data with fabricated/mock data.
3. Never imply that a queued operation has completed.
4. Never hide partial failure.
5. Never allow a user to bypass server authorization through UI assumptions.
6. Never perform direct inventory mutation outside approved domain APIs.
7. Always expose freshness for externally observed quantities.
8. Preserve causal navigation from quantity → event → synchronization → verification → exception.
9. Treat dangerous mutations as explicit decisions.
10. Make asynchronous work observable.

---

# 2. Frontend Architecture Contract

## 2.1 Required stack

Use the engineering specification stack:

```text
Next.js
TypeScript
React
Tailwind CSS
Accessible component primitives
TanStack Query
React Hook Form
Zod
```

Public pages should use server rendering/static generation where appropriate.

Authenticated application experiences may use client interaction where required.

## 2.2 Repository structure

The frontend belongs primarily under:

```text
/apps/web
/packages/ui
/packages/contracts
/packages/config
/packages/testing
```

The frontend MUST NOT duplicate server-side domain logic.

Shared types and API contracts should be consumed from `/packages/contracts` or the canonical generated contract layer.

## 2.3 State separation

Every frontend state must belong to one of these categories:

```text
Server State
    TanStack Query

URL State
    search
    filters
    sorting
    pagination
    selected tabs
    view modes where shareable

Form State
    React Hook Form

Local UI State
    drawers
    dialogs
    expanded rows
    temporary selection
    keyboard/navigation state

Session/Auth State
    authenticated user
    organization context
    permissions
```

Do not duplicate server state into unrelated local stores unless there is a documented reason.

---

# 3. Design Token Contract

All visual values must originate from semantic tokens.

Do not scatter raw color, spacing, radius, typography, or shadow values across application code.

## 3.1 Color tokens

Use semantic tokens rather than component-specific colors.

```text
background
background-subtle
background-muted
surface
surface-raised
surface-hover
surface-selected

border
border-subtle
border-strong

text
text-secondary
text-tertiary
text-disabled
text-inverse

primary
primary-hover
primary-active
primary-subtle

success
success-subtle
warning
warning-subtle
danger
danger-subtle
info
info-subtle

focus
overlay
```

Semantic status meaning:

| Token | Meaning |
|---|---|
| success | confirmed healthy/completed state |
| warning | attention required but not necessarily failure |
| danger | failure, destructive consequence, or critical condition |
| info | neutral operational information |
| muted | unavailable/secondary/non-actionable state |

Color MUST NOT be the only status signal.

Every status indicator must also have text, iconography, or structural context.

## 3.2 Typography tokens

Use a compact operational type scale.

```text
display
heading-xl
heading-lg
heading-md
heading-sm
body-lg
body-md
body-sm
caption
label
numeric-lg
numeric-md
numeric-sm
code
```

Numerical inventory quantities should use tabular numerals.

Identifiers, SKUs, provider IDs, job IDs, and correlation IDs may use a monospace face.

## 3.3 Spacing

Use a consistent base spacing scale.

Recommended semantic steps:

```text
xs
sm
md
lg
xl
2xl
3xl
4xl
```

Do not introduce arbitrary one-off spacing values unless required by a component primitive.

## 3.4 Radius

Use restrained radii:

```text
none
sm
md
lg
pill
```

Operational tables and data surfaces should generally use smaller radii than marketing cards.

## 3.5 Elevation

Use elevation sparingly:

```text
none
subtle
raised
overlay
```

Prefer borders and surface separation over heavy shadows.

## 3.6 Motion

Motion must communicate state, not decorate the interface.

Allowed:
- drawer transitions
- dialog transitions
- row expansion
- loading transitions
- progress transitions
- success/error state transitions

Avoid:
- continuous decorative animation
- large parallax effects
- animated backgrounds
- attention-seeking dashboard motion

Respect reduced-motion preferences.

---

# 4. Semantic State System

The system has two separate concepts:

1. **Operational state**
2. **Data trust/freshness state**

They must not be collapsed.

## 4.1 Operational states

Canonical states include:

```text
idle
queued
running
completed
failed
partial
cancelled
blocked
requires_approval
```

## 4.2 Trust states

Canonical trust states:

```text
LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN
```

Additional implementation-level provenance states may exist:

```text
OBSERVED
SUBMITTED
ACKNOWLEDGED
VERIFYING
VERIFIED
```

An acknowledgement is NOT verification.

## 4.3 State rendering rule

Example:

```text
Inventory update
Submitted
12:04:11

Verification
In progress
```

NOT:

```text
Inventory updated ✓
```

until read-back verification has succeeded.

---

# 5. Global Component Contract

Every reusable component must define:

```text
Purpose
Inputs
Variants
States
Events
Accessibility behavior
Responsive behavior
Loading behavior
Error behavior
Permission behavior
```

## 5.1 Primitive components

Minimum primitive library:

```text
Button
IconButton
Link
Input
Textarea
Select
Combobox
Checkbox
Radio
Switch
DatePicker
Popover
Tooltip
Badge
StatusBadge
Alert
Banner
Progress
Skeleton
Spinner
Divider
Avatar
Breadcrumb
Tabs
Pagination
CommandMenu
DropdownMenu
ContextMenu
Dialog
Drawer
Sheet
Toast
EmptyState
ErrorState
Table
DataGrid
Card
Metric
Timeline
CodeBlock
CopyButton
```

## 5.2 Button contract

Variants:

```text
primary
secondary
tertiary
ghost
danger
link
```

States:

```text
default
hover
focus
pressed
disabled
loading
success
```

Props conceptually:

```ts
variant
size
disabled
loading
loadingLabel
icon
iconPosition
type
onClick
```

Rules:
- primary action must be unique within a focused region
- destructive actions use danger treatment
- loading buttons must prevent accidental duplicate submission
- disabled state must remain understandable
- use semantic `<button>` for mutations

## 5.3 StatusBadge contract

Props:

```ts
status
label
description?
size
showIcon
```

The component maps domain status → semantic presentation.

Do not pass arbitrary colors from screens.

## 5.4 DataTable contract

Required capabilities:

```text
columns
rows
sorting
filtering
search
pagination
selection
row actions
loading
empty
error
partial
responsive mode
column visibility
```

Large datasets must use server-side pagination.

Default page size:

```text
50
```

Maximum:

```text
250
```

Never load an unlimited organization-wide dataset into the browser.

---

# 6. Application Shell

Authenticated routes use:

```text
Sidebar
Topbar
Breadcrumb/context
Page header
Page content
Global notifications
```

## 6.1 Sidebar

Primary navigation:

```text
Overview

Inventory
Orders
Products
Warehouses
Purchasing
Exceptions
Integrations
Synchronization
Reports
Automation
AI Assistant

Notifications
Audit

Settings
Billing
```

Navigation items should only appear when relevant to the user's access and enabled product configuration.

Do not remove critical functionality merely because a user lacks permission; show permission-aware entry behavior where appropriate.

## 6.2 Topbar

Contains:

```text
Organization switcher
Global search / command palette
System status indicator
Notifications
Help/docs
User menu
```

Topbar must remain stable across application routes.

## 6.3 Breadcrumb

Breadcrumbs represent hierarchy, not navigation history.

Example:

```text
Inventory / SKU / ABC-123
```

Do not use breadcrumbs as a substitute for browser history.

---

# 7. Route Contract

Canonical authenticated route family:

```text
/app
/app/inventory
/app/inventory/[sku]
/app/inventory/events
/app/inventory/reservations
/app/inventory/allocations
/app/inventory/reconciliation

/app/orders
/app/orders/[id]
/app/returns

/app/products
/app/products/[id]
/app/skus/[id]

/app/warehouses
/app/warehouses/[id]
/app/transfers

/app/purchasing
/app/purchasing/orders/[id]
/app/suppliers

/app/exceptions
/app/exceptions/[id]

/app/integrations
/app/integrations/[id]
/app/integrations/mappings

/app/synchronization
/app/synchronization/[id]

/app/reports
/app/automation
/app/ai
/app/notifications
/app/audit

/app/migration
/app/migration/[id]

/app/settings
/app/settings/organization
/app/settings/members
/app/settings/roles
/app/settings/permissions
/app/settings/notifications
/app/settings/inventory
/app/settings/allocation
/app/settings/source-of-truth
/app/settings/security
/app/settings/data
/app/settings/api

/app/billing
/app/usage
```

Public route families remain separate:

```text
/
/pricing
/integrations
/compare
/migration
/docs/*
/status
```

Authenticated application pages must not compete with public SEO pages.

---

# 8. URL State Contract

URL-addressable state should include:

```text
search
filters
sort
page/cursor where appropriate
date range
selected tab
view mode
selected integration/channel
exception status
severity
warehouse
SKU/product filters
```

Rules:

1. Reloading a filtered table should preserve its meaningful state.
2. Shareable investigation views should be deep-linkable.
3. Temporary UI state should not pollute the URL.
4. Sensitive values must never be placed in URLs.
5. Server state remains authoritative.

---

# 9. Data Contract

The frontend should consume normalized domain data.

## 9.1 Inventory quantity view model

A displayed inventory quantity should be capable of representing:

```ts
quantity
available
reserved
allocated
onHand
safetyStock
location
sku
observedAt
receivedAt
verifiedAt
trustState
source
```

Not every screen must show every field.

The screen determines progressive disclosure.

## 9.2 External quantity

External inventory must retain:

```text
provider
channelAccount
externalQuantity
observedAt
receivedAt
verifiedAt
syncState
verificationState
```

## 9.3 Sync operation

UI model:

```text
jobId
correlationId
entity
entityId
provider
operation
status
attempt
createdAt
startedAt
completedAt
errorClass
errorMessage
verificationState
```

## 9.4 Exception

UI model:

```text
id
type
severity
status
title
description
entityType
entityId
rootCause
recommendedAction
automatable
createdAt
updatedAt
resolvedAt
resolvedBy
```

---

# 10. Query and Mutation Contract

Every server-backed screen must define:

```text
query key
query parameters
pagination behavior
stale time
refetch behavior
mutation endpoints/actions
optimistic update policy
invalidation policy
error mapping
```

## 10.1 Inventory mutations

Inventory mutations must not use optimistic UI that can temporarily present an invented inventory truth.

Preferred sequence:

```text
User submits action
↓
Server validates
↓
Mutation accepted
↓
UI shows queued/running
↓
Provider operation
↓
Verification
↓
Server state refresh
↓
UI displays verified/result state
```

## 10.2 Safe optimistic UI

Optimistic interaction is acceptable for non-authoritative UI state such as:

```text
drawer open
tab selected
filter changed
local form edits
```

It should not be used to pretend that authoritative inventory has changed before the server confirms the mutation.

---

# 11. Permission Contract

Canonical system roles from engineering specification:

```text
OWNER
ADMIN
MANAGER
OPERATOR
VIEWER
```

The backend remains authoritative.

The frontend uses permissions for:
- visibility
- affordances
- explanatory messaging
- confirmation flow

The frontend MUST NOT use permissions as the security boundary.

## 11.1 Permission matrix

| Capability | Owner | Admin | Manager | Operator | Viewer |
|---|---:|---:|---:|---:|---:|
| View inventory | Yes | Yes | Yes | Yes | Yes |
| View orders | Yes | Yes | Yes | Yes | Yes |
| View exceptions | Yes | Yes | Yes | Yes | Yes |
| Investigate exceptions | Yes | Yes | Yes | Yes | Read |
| Manual inventory adjustment | Yes | Yes | Configured | Configured | No |
| Run reconciliation | Yes | Yes | Yes | Configured | No |
| Approve risky reconciliation | Yes | Yes | Configured | No | No |
| Connect integration | Yes | Yes | No | No | No |
| Modify mappings | Yes | Yes | Configured | No | No |
| Configure automation | Yes | Yes | Configured | No | No |
| Manage members | Yes | Yes | No | No | No |
| Billing | Yes | Configured | No | No | No |
| Organization settings | Yes | Configured | No | No | No |
| Audit access | Yes | Yes | Yes | Configured | Configured |
| AI read actions | Yes | Yes | Yes | Yes | Yes |
| AI mutation actions | Yes | Yes | Configured | Configured | No |

`Configured` means the effective permission is determined by organization-level RBAC/permission configuration. The UI must not hard-code the final entitlement.

## 11.2 Permission-denied behavior

Never silently hide the result of a direct URL navigation.

Use:

```text
Access restricted

You do not have permission to perform this action.
```

Where useful, explain the required permission without exposing sensitive policy details.

---

# 12. Global State Matrix

Every production screen must explicitly implement:

| State | Required behavior |
|---|---|
| Loading | Preserve layout with skeletons |
| Empty | Explain why empty and provide next action where appropriate |
| Success | Show authoritative data |
| Error | Explain actionable failure |
| Partial failure | Show successful data and failed portions separately |
| Permission denied | Explain restriction |
| Stale | Show last verified/observed time |
| Conflict | Show conflicting states and evidence |
| Unknown | Do not infer or fabricate state |

No screen is complete without this matrix.

---

# 13. Overview Screen Contract

Purpose:

```text
Answer:
Is inventory trustworthy?
What needs attention?
What changed?
```

Primary regions:

```text
Page header
Trust/health summary
Inventory health
Exception priority
Synchronization health
Recent material events
Quick operational actions
```

Do not turn Overview into a generic analytics dashboard.

## Required metrics

Possible metrics:

```text
Inventory health
Unresolved critical exceptions
Synchronization failures
Verification coverage
Material discrepancies
Negative inventory
Orders requiring attention
```

Each metric must be explorable.

Example:

```text
17,842 verified units
```

opens the relevant inventory state rather than an unrelated report.

---

# 14. Inventory Screen Contract

Inventory is a working surface, not a decorative dashboard.

Primary table fields:

```text
SKU
Product
Location
On Hand
Reserved
Allocated
Available
Safety Stock
Channel Coverage
Trust State
Last Verified
Exceptions
```

Columns should be configurable.

Default density is high enough for operational work without becoming unreadable.

Row actions:

```text
Open SKU
View events
View reservations
View synchronization
Adjust inventory
```

Dangerous actions require explicit confirmation.

---

# 15. SKU Detail Contract

SKU Detail is the flagship investigative experience.

Header:

```text
SKU
Product
Status
Trust state
Primary action
```

Summary:

```text
On Hand
Reserved
Allocated
Available
Safety Stock
```

Tabs:

```text
Overview
Inventory by Location
Channel Inventory
Orders/Reservations
Timeline
Synchronization
Exceptions
Audit
```

The page must support causal traversal:

```text
Quantity
→ Reservation
→ Order
→ Event
→ Sync Job
→ Verification
```

---

# 16. Exception Inbox Contract

Exception inbox is an operational incident surface.

Columns:

```text
Severity
Type
Title
Affected Entity
Channel
Status
Age
Last Attempt
Recommended Action
```

Filters:

```text
status
severity
type
channel
warehouse
age
automatable
```

Default sort should surface unresolved operationally important items without implying an overall business ranking.

---

# 17. Exception Investigation Contract

Header:

```text
Exception type
Severity
Status
Affected entity
Created time
```

Question order:

```text
WHAT HAPPENED?
WHY?
WHAT IS AFFECTED?
WHAT DID THE SYSTEM TRY?
WHAT HAPPENS NEXT?
WHAT CAN I DO?
```

Evidence panel:

```text
Internal state
External state
Last successful state
Last attempted state
Verification result
Relevant events
Relevant jobs
```

Recommended action must be explicitly labeled as:

```text
System recommendation
```

not presented as fact when it is an inference.

---

# 18. Reconciliation Contract

Reconciliation overview:

```text
Runs
Matches
Minor differences
Material differences
Missing external
Missing internal
Stale external
Unknown
```

Run detail:

```text
Coverage
Matches
Differences
Auto-resolvable
Requires approval
Failed
```

Every discrepancy must expose:

```text
internal quantity
external quantity
difference
classification
evidence
recommended action
resolution status
```

## Safe auto-reconciliation

Display the reason safety conditions passed:

```text
Known mapping
Known source of truth
No competing event
Within configured threshold
No manual lock
Low-risk state
```

If any required condition fails:

```text
Manual approval required
```

Never represent the action as safe merely because the difference is numerically small.

---

# 19. Synchronization Contract

Synchronization screen must show execution reality.

Queue fields:

```text
Job
Provider
Entity
Operation
Status
Attempt
Created
Started
Completed
Verification
```

Statuses:

```text
Queued
Running
Succeeded
Failed
Partial
Verifying
Conflict
Blocked
```

A job that received an API acknowledgement but failed read-back verification must be represented as conflict/verification failure according to backend state.

---

# 20. Integration Contract

Integration directory:

```text
Provider
Connection status
Health
Capabilities
Last sync
Last verification
Action
```

Integration detail:

```text
Connection
Capabilities
Mappings
Synchronization
Errors
Rate limits
Verification
Audit
```

Connection status and operational health must remain separate.

Example:

```text
Connected
but
Inventory synchronization degraded
```

---

# 21. Products and Catalog Contract

Products screen:

```text
Product
Variants
SKU
Channel mappings
Status
Inventory
```

Product detail must connect:

```text
Product
→ Variant
→ SKU
→ Mapping
→ Inventory
→ Channel
```

Do not bury SKU identity inside product presentation.

---

# 22. Orders and Returns Contract

Orders table:

```text
Order
Channel
Status
Customer/reference
Items
Inventory impact
Created
Updated
```

Order detail:

```text
Order state
Line items
Reservations
Inventory events
Synchronization
Returns
Audit
```

Inventory impact must be directly explorable.

---

# 23. Warehouses and Transfers

Warehouse detail:

```text
Location
Inventory
Capacity metadata where available
Pending transfers
Exceptions
Recent events
```

Transfer workflow:

```text
Draft
→ Submitted
→ Approved where required
→ In transit
→ Received
→ Verified
```

Do not mark transferred stock as received until the authoritative receiving event is complete.

---

# 24. Purchasing

Purchasing surfaces:

```text
Suppliers
Purchase Orders
Receiving
```

Purchase order detail should show:

```text
Supplier
Lines
Expected quantities
Received quantities
Outstanding
Receiving events
Inventory impact
```

Receiving must distinguish:

```text
Expected
Received
Verified
```

---

# 25. Reports

Reports must remain analytical.

Supported patterns:

```text
Inventory history
Synchronization reliability
Exception trends
Reconciliation
Order/inventory relationship
Provider health
Usage
```

Charts are secondary to precise tables when exact values matter.

Exports:

```text
Preparing
Processing
Ready
Failed
Expired
```

Large exports are asynchronous.

---

# 26. Automation

Automation builder:

```text
Trigger
→ Conditions
→ Action
→ Approval policy
→ Execution
→ Audit
```

Examples:

```text
When inventory discrepancy exceeds threshold
AND source of truth is internal
THEN create reconciliation proposal
```

Never allow an automation to bypass:
- permission
- safety policy
- source-of-truth rules
- audit
- verification

---

# 27. AI Assistant Contract

AI is a secondary interface over deterministic system data.

It is not the source of truth.

## Read action

```text
User asks question
↓
AI interprets
↓
Deterministic data query
↓
Validated result
↓
Answer with source context
```

## Mutation action

```text
User intent
↓
Permission check
↓
Deterministic tool call
↓
Validation
↓
Confirmation if required
↓
Mutation
↓
Verification
↓
Audit/result
```

AI must not:
- invent inventory
- invent integration status
- fabricate verification
- directly bypass domain services
- silently execute dangerous actions

---

# 28. Notifications

Notification center must group repeated failures.

Prefer:

```text
Amazon inventory synchronization failed for 14 SKUs
```

over fourteen identical notifications.

Each notification should expose:

```text
what happened
when
scope
current state
action
```

Email/push notification wording must match in-app state.

---

# 29. Audit Contract

Every material mutation should be reconstructable.

Minimum visible audit sequence:

```text
Before
Event
Actor
Reason
After
Channel impact
Synchronization result
Verification result
```

Audit entries should support:
- timestamp
- actor/system
- entity
- action
- before/after summary where permitted
- correlation ID
- job ID
- provider
- result

Sensitive credentials must never be displayed.

---

# 30. Migration Contract

Migration wizard:

```text
01 Upload
02 Detect
03 Map
04 Validate
05 Conflicts
06 Preview
07 Confirm
08 Import
09 Verify
```

Each step has:

```text
completed
current
blocked
needs attention
```

Unmapped records must never be silently discarded.

Large imports are asynchronous.

---

# 31. Billing and Usage

Billing surfaces:

```text
Current Plan
Usage
Invoices
Payment Method
Entitlements
```

Plans:

```text
Starter
Growth
Scale
Enterprise
```

Entitlements are server-authoritative.

The frontend must never independently calculate whether a customer is entitled to a feature.

Usage:

```text
Orders
Channels
Warehouses
Users
API Calls
Automation Executions
Storage
```

Soft limits should explain consequences before access becomes blocked.

---

# 32. Settings

Settings sections:

```text
Organization
Members & Roles
Permissions
Notifications
Integrations
Inventory Rules
Allocation Rules
Source of Truth
Automation
Security
Data & Retention
Exports
API
```

High-risk configuration must provide explanatory context and impact.

## Source-of-truth setting

Example presentation:

```text
Inventory Authority

Internal Inventory
Authoritative

Amazon
Observed state only

Shopify
Observed state only
```

Never infer authority from recency.

---

# 33. Dangerous Operation Contract

Dangerous operations include:

```text
bulk inventory adjustment
mass reconciliation
source-of-truth changes
mapping replacement
disconnecting integrations
data deletion
large migration
bulk cancellation
automation activation
```

Confirmation must include:

```text
Action
Scope
Affected records
Expected consequence
Risk/irreversibility
Current source-of-truth
Verification behavior
```

For high-risk operations require an explicit confirmation action.

Do not use vague:

```text
Are you sure?
```

Prefer:

```text
Reconcile 184 SKUs

This will submit inventory corrections to Amazon for 184 mapped SKUs.

17 SKUs have competing events and will be excluded.

The remaining 167 SKUs will be verified after submission.

[Cancel] [Confirm reconciliation]
```

---

# 34. Bulk Operations

Bulk actions must expose:

```text
selected count
eligible count
excluded count
reason for exclusions
estimated scope
```

Execution:

```text
Prepare
→ Validate
→ Confirm
→ Queue
→ Execute
→ Verify
→ Results
```

Results must support:

```text
Succeeded
Failed
Skipped
Conflict
Needs review
```

Do not collapse partial success into success.

---

# 35. Asynchronous Job UX

Any long-running operation must expose:

```text
job status
progress where meaningful
started time
current phase
result count
failure count
verification status
```

The user must be able to leave the page without losing the job.

Notifications can announce completion.

The UI must not fake progress when exact progress is unavailable.

Use:

```text
Processing...
184 records queued
```

rather than fabricated:

```text
73% complete
```

unless the backend provides reliable progress.

---

# 36. Partial Failure Contract

Partial failure is a first-class state.

Example:

```text
Reconciliation completed with issues

167 corrected
12 failed
5 skipped
```

The user must be able to open each failure category.

Never use:

```text
Completed
```

alone for a partial operation.

---

# 37. Freshness UX

External state should display freshness where material.

Examples:

```text
Verified 42 seconds ago
Observed 2 minutes ago
Last verified yesterday
Provider unavailable
Last verified 11:42 UTC
```

When stale:

```text
STALE
Last verified 18 minutes ago
```

When unknown:

```text
UNKNOWN
Verification unavailable
```

Do not display stale quantities as if they were live.

---

# 38. Loading, Empty, Error, Partial Patterns

## Loading

Use structural skeletons.

Do not replace an entire operational page with a spinner unless there is genuinely no predictable structure.

## Empty

Every empty state should answer:

```text
Why is this empty?
Is this expected?
What can I do next?
```

## Error

Show:

```text
What failed
What is still available
What the user can do
Reference/job/correlation ID where useful
```

## Partial

Show successful and failed portions separately.

## Permission

Show restriction rather than blank content when the user directly navigated to a protected resource.

---

# 39. Search and Command Palette

Global search should support the engineering-defined search domains:

```text
SKU
Product title
Barcode
Order number
External ID
```

Results should identify type:

```text
SKU
Product
Order
Exception
Integration
```

Command palette should prioritize operational actions:

```text
Open SKU
Find order
Open exceptions
Run reconciliation
Open synchronization
Connect integration
Open settings
```

Dangerous commands must route through normal confirmation and permission checks.

---

# 40. Responsive Contract

Desktop is the primary high-density workspace.

Tablet preserves operational workflows with reduced columns.

Mobile is an operational companion, not a shrunken desktop.

## Desktop

Use:
- multi-column layouts
- dense tables
- persistent navigation
- side-by-side evidence panels

## Tablet

Use:
- collapsible navigation
- fewer simultaneous columns
- drawers for secondary details
- horizontally scrollable data regions where necessary

## Mobile

Prioritize:

```text
Current state
Critical alert
Primary action
Essential quantity
Evidence
Next action
```

Convert wide tables into:
- stacked records
- horizontal data regions
- expandable rows
- detail pages

Do not simply shrink typography to fit a desktop table.

---

# 41. Mobile Navigation

Primary mobile navigation should expose:

```text
Overview
Inventory
Exceptions
Synchronization
More
```

High-frequency operational surfaces must remain easy to reach.

Deep administrative areas can live under More.

---

# 42. Accessibility Contract

Target:

**WCAG 2.2 AA**

Required:
- keyboard navigation
- visible focus
- semantic landmarks
- accessible labels
- accessible tables
- accessible dialogs
- accessible alerts
- sufficient contrast
- screen-reader-compatible status
- no color-only meaning
- reduced-motion support

Focus must be managed correctly for:
- dialogs
- drawers
- command palette
- route transitions where appropriate

Tables must expose meaningful headers and relationships.

---

# 43. Keyboard Contract

Required global shortcuts may include:

```text
/
search

g then i
inventory

g then e
exceptions

g then s
synchronization

?
shortcut help
```

Shortcuts must never interfere with text entry.

All critical operations remain accessible without shortcuts.

---

# 44. Performance Contract

Frontend must follow the engineering performance requirements:

```text
fast initial render
minimal client JavaScript
lazy-load heavy components
server-render where appropriate
cursor pagination
background processing
```

Never:
- load all orders
- load all inventory
- load all events
- perform large aggregation in the browser

Use server-side aggregation for large datasets.

---

# 45. Caching Contract

Cache only data whose consistency semantics are understood.

Safe candidates may include:

```text
product metadata
integration metadata
dashboard aggregates
```

Inventory truth remains database-backed and server-authoritative.

The frontend must display explicit freshness if cached data is material to an operational decision.

---

# 46. Error Mapping Contract

Backend errors must map to user-understandable states.

Examples:

```text
AUTHENTICATION_FAILURE
→ Reconnect integration

RATE_LIMIT
→ Provider is throttling requests; retry scheduled

MISSING_MAPPING
→ Map this SKU before synchronization

CONFLICT
→ External quantity differs after verification

PROVIDER_OUTAGE
→ Provider unavailable; last verified state shown

PERMISSION_DENIED
→ You do not have permission for this action
```

Do not expose raw stack traces.

Technical identifiers may be available in an expandable diagnostic section.

---

# 47. Provider-Specific UI Contract

The common UI must use normalized provider capability metadata.

Do not assume every provider supports every operation.

Provider-specific actions should be capability-driven:

```text
canReadInventory
canWriteInventory
canImportOrders
canReceiveWebhooks
canVerify
canReconcile
```

The backend remains authoritative for capability.

---

# 48. Integration Health Contract

Connection health has at least three dimensions:

```text
Authentication
Synchronization
Verification
```

Example:

```text
Authentication
Connected

Synchronization
Degraded

Verification
Last successful: 11:42
```

Never collapse all three into a single green “Connected” state.

---

# 49. Auditability of UI Actions

Every material UI mutation must produce an auditable server action.

Frontend event:

```text
user clicks reconcile
```

is not itself the audit record.

The backend mutation must produce the authoritative audit record.

Frontend should retain and display:

```text
job_id
correlation_id
audit reference
```

where provided.

---

# 50. Analytics Instrumentation

Product analytics must measure behavior without becoming a second operational truth system.

Canonical event categories:

```text
page_view
search
filter_change
table_sort
entity_opened
exception_opened
sync_job_opened
reconciliation_started
reconciliation_confirmed
reconciliation_cancelled
inventory_adjustment_started
inventory_adjustment_confirmed
integration_connected
integration_disconnected
mapping_created
mapping_changed
export_requested
export_completed
automation_created
automation_enabled
ai_query
ai_action_proposed
ai_action_confirmed
ai_action_completed
```

Each event should include safe contextual metadata:

```text
organization_id
user_role
route
entity_type
entity_id where permitted
feature_flag state where useful
```

Do not send:
- access tokens
- payment secrets
- passwords
- sensitive customer data
- raw provider credentials

Analytics must not determine operational correctness.

---

# 51. Core UX Metrics

Measure product experience around operational outcomes.

Suggested metrics:

```text
time_to_first_verified_inventory
time_to_resolve_exception
percentage_of_exceptions_with_clear_root_cause
verification_coverage
sync_failure_recovery_time
reconciliation_resolution_time
percentage_of_actions_completed_without_rework
```

Do not optimize a metric at the expense of inventory integrity.

---

# 52. Feature Flag Contract

Feature flags may control:

```text
new integrations
AI
automatic reconciliation
new allocation strategies
migration tools
experimental UI
```

Flags must be:
- organization-aware
- server-authoritative
- observable
- removable

A disabled feature must not leave broken navigation or incomplete UI.

---

# 53. Release States

Features may be:

```text
Not released
Internal
Alpha
Beta
Production
Deprecated
```

The UI must not expose an incomplete production claim.

If a feature is visible during alpha/beta, label it appropriately.

---

# 54. Visual QA Contract

Every major screen must be checked at:

```text
1440+
1280
1024
768
390
```

Check:

```text
layout
density
typography
alignment
status rendering
table behavior
drawer/modal behavior
overflow
focus
keyboard
empty
loading
error
partial failure
permission
stale
conflict
unknown
```

Visual QA must use real representative data shapes, including:
- long SKU
- long product title
- large quantity
- zero quantity
- negative quantity
- missing data
- many exceptions
- no exceptions
- failed provider
- stale provider
- partial job result

---

# 55. Content QA

Every operational message must answer the appropriate question.

Avoid:

```text
Something went wrong.
```

Prefer:

```text
Amazon inventory verification failed for 12 SKUs.
The last verified state remains available.
Retry is scheduled automatically.
```

Use exact state language.

Do not use “synced” when the system means “submitted”.

Do not use “verified” without verification.

Do not use “healthy” when only authentication is healthy.

---

# 56. UX Acceptance Criteria — Overview

A release candidate passes Overview when:

- operational health is understandable within seconds
- important exceptions are visible
- metrics link to evidence
- stale/unknown states are explicit
- no fake real-time values are shown
- loading/empty/error/partial states exist
- role restrictions work
- mobile remains useful
- all critical metrics have deterministic sources

---

# 57. UX Acceptance Criteria — Inventory

Pass when:

- large datasets paginate server-side
- sorting/filtering/search work
- quantity decomposition is explorable
- freshness is visible where required
- trust state is visible
- SKU navigation is direct
- bulk actions show scope
- mutations require correct permission
- dangerous actions confirm
- results are refreshed from authoritative state

---

# 58. UX Acceptance Criteria — SKU

Pass when:

- quantity can be explained
- location state is visible
- channel state is visible
- events are traceable
- reservations link to orders
- synchronization links to jobs
- verification state is explicit
- exceptions link back to evidence
- audit trail is accessible

---

# 59. UX Acceptance Criteria — Exceptions

Pass when every exception can answer:

```text
What happened?
Why?
What is affected?
What did the system try?
What happens next?
What can I do?
```

The screen must distinguish:
- fact
- observed state
- system recommendation
- user action
- verified result

---

# 60. UX Acceptance Criteria — Synchronization

Pass when:

- queue status is truthful
- retry state is visible
- provider throttling is represented
- partial failure is explicit
- verification is distinct from acknowledgement
- job and correlation IDs are traceable
- failed jobs are actionable
- provider outage is not replaced with fake data

---

# 61. UX Acceptance Criteria — Reconciliation

Pass when:

- discrepancies are classified
- evidence is visible
- source of truth is visible
- safe auto-resolution conditions are visible
- approval requirements are visible
- bulk scope is explicit
- results are partial-failure aware
- all material actions are auditable

---

# 62. UX Acceptance Criteria — Integrations

Pass when:

- authentication status is distinct from synchronization status
- capabilities are accurate
- mappings are visible
- connection lifecycle is understandable
- provider errors are actionable
- verification state is visible
- disconnect actions are confirmed

---

# 63. UX Acceptance Criteria — Billing

Pass when:

- plan is server-authoritative
- usage is current enough for the displayed purpose
- invoices are accessible
- payment failure is clear
- entitlement restrictions are explained
- no frontend-only billing logic controls access

---

# 64. UX Acceptance Criteria — Migration

Pass when:

- upload status is visible
- mapping is explicit
- unmapped records are surfaced
- conflicts are surfaced
- preview exists before import
- import is asynchronous where required
- verification follows import
- no silent data loss occurs

---

# 65. End-to-End Critical Journeys

## Journey A — New merchant

```text
Sign up
→ Create organization
→ Select plan
→ Connect Shopify
→ Import catalog
→ Review mappings
→ Import inventory
→ Verify
→ Connect Amazon
→ Map SKUs
→ Synchronize
→ Verify
→ Overview
```

## Journey B — Inventory discrepancy

```text
Overview
→ Exception
→ SKU
→ Compare internal/external
→ Timeline
→ Synchronization job
→ Verification conflict
→ Reconciliation
→ Confirm
→ Verify
→ Resolved
→ Audit
```

## Journey C — Sync failure

```text
Exception
→ Failed job
→ Provider error
→ Retry
→ Running
→ Verification
→ Completed
```

If retry fails:

```text
Running
→ Failed
→ Exception remains open
```

## Journey D — Negative inventory

```text
Inventory
→ Negative quantity
→ Exception
→ Event history
→ Relevant order/reservation
→ Cause
→ Resolution
→ Verification
```

## Journey E — Bulk reconciliation

```text
Reconciliation
→ Filter
→ Select
→ Scope review
→ Safety validation
→ Confirmation
→ Queued
→ Running
→ Partial results
→ Verification
→ Audit
```

---

# 66. Causal Navigation Contract

Important entities must cross-link.

Minimum graph:

```text
Product
  ↓
Variant
  ↓
SKU
  ↓
Inventory
  ↓
Reservation
  ↓
Order
  ↓
Inventory Event
  ↓
Sync Job
  ↓
Provider
  ↓
Verification
  ↓
Exception
  ↓
Resolution
  ↓
Audit
```

The user should rarely need to manually reconstruct this graph from unrelated screens.

---

# 67. Empty-State Contract

Examples:

## No inventory

```text
No inventory has been imported yet.

Connect a channel or import inventory to begin.
```

## No exceptions

```text
No unresolved exceptions.

Inventory synchronization and reconciliation currently have no unresolved issues.
```

## No synchronization jobs

```text
No synchronization jobs yet.

Jobs will appear here when the system begins processing channel updates.
```

Do not make empty states look like errors.

---

# 68. Error-State Contract

Errors must distinguish:

```text
User error
Provider error
System error
Permission error
Validation error
Conflict
Timeout
Rate limit
```

Where retry is safe, show:

```text
Retry
```

Where retry is automatic:

```text
Retry scheduled
```

Where user action is required:

```text
Action required
```

---

# 69. Conflict-State Contract

Conflict is not failure in every case.

Example:

```text
CONFLICT

Internal inventory
17

Amazon
15

Last attempted update
17

Read-back verification
15

The provider accepted the request but returned a different quantity during verification.
```

Actions:

```text
Investigate
Reconcile
Retry where supported
```

Do not automatically label one side “wrong” without deterministic evidence.

---

# 70. Unknown-State Contract

Unknown must be explicit.

Example:

```text
UNKNOWN

Current provider inventory could not be verified.

Last verified:
17 units
11:42 UTC

Provider unavailable.
```

Unknown is preferable to fabricated certainty.

---

# 71. Negative Inventory Contract

Negative inventory must be visible.

Example:

```text
Available
-3

NEGATIVE INVENTORY

Cause investigation required
```

Link directly to:
- events
- orders
- reservations
- adjustments
- exceptions

Never normalize negative inventory into an ordinary zero-state display.

---

# 72. Table Density Rules

Default:

```text
high information density
compact row height
strong column hierarchy
tabular numerals
```

But:
- never truncate critical status without a way to inspect it
- use tooltips sparingly
- provide column visibility controls where appropriate
- preserve primary identity columns during horizontal scrolling
- keep action columns predictable

---

# 73. Drawer Contract

Use drawers for:

```text
quick details
event preview
job preview
secondary evidence
```

Do not put multi-step critical workflows inside narrow drawers.

Deep investigation should become a full route.

---

# 74. Modal Contract

Use modals only for focused decisions:

```text
confirmation
destructive action
small form
permission request
```

Do not build complex dashboards inside modals.

---

# 75. Toast Contract

Toasts are supplemental, not the only communication channel.

Use for:

```text
saved
copied
queued
minor confirmation
```

Do not rely on toasts for:
- critical errors
- verification results
- partial failure
- destructive operation results

Those states must persist in page content.

---

# 76. Notification Deduplication UX

Repeated operational failures should aggregate.

Example:

```text
Amazon synchronization

14 SKUs affected
First failure: 11:21
Latest failure: 11:41
Status: Retrying

Open affected SKUs
```

Do not flood the operator with identical notifications.

---

# 77. Support/Admin Frontend Contract

Internal admin routes:

```text
/admin/organizations
/admin/users
/admin/subscriptions
/admin/integrations
/admin/sync-jobs
/admin/exceptions
/admin/system-health
/admin/feature-flags
/admin/audit
```

Admin UI must:
- require authorization
- display tenant context clearly
- log material actions
- never bypass normal audit requirements
- distinguish impersonation/support access if such a capability exists

---

# 78. Security UI Contract

Security settings may include:

```text
sessions
authentication
API keys
webhook credentials metadata
security events
```

Never render secret values after creation unless the security model explicitly permits one-time display.

Do not expose provider tokens.

---

# 79. API Error and Correlation UX

For supportable errors, show:

```text
Reference ID: <request/job/correlation ID>
```

where appropriate.

The user should be able to provide the reference to support without exposing secrets.

---

# 80. SEO/Public UI Boundary

Public pages use the same brand DNA but not the authenticated application shell.

Public navigation:

```text
Product
Solutions
Integrations
Pricing
Compare
Migration
Resources
Docs

Sign In
Start Free
```

Public pages must follow engineering SEO/GEO requirements.

Application routes should be protected and appropriately excluded from search indexing.

---

# 81. Documentation UI

Documentation layout:

```text
Docs navigation
Page title
Summary
Concept
Steps
Examples
Warnings
Related pages
```

Core routes:

```text
/docs/getting-started
/docs/inventory
/docs/orders
/docs/integrations
/docs/reconciliation
/docs/api
/docs/security
/docs/billing
```

---

# 82. Status Page UI

Components:

```text
Application
API
Shopify
Amazon
eBay
Walmart
Synchronization
```

Allowed operational states:

```text
Operational
Degraded
Major issue
```

Status must be generated from actual monitoring.

---

# 83. Testing Contract

## Unit tests

Test:
- component states
- formatters
- status mapping
- permission presentation
- quantity presentation
- URL-state parsing
- validation schemas

## Integration tests

Test:
- API contract integration
- query invalidation
- mutations
- authorization presentation
- error mapping
- pagination
- feature flags

## End-to-end tests

Test:

```text
signup
connect channel
import product
map SKU
import order
reserve inventory
sync inventory
verify
create mismatch
reconcile
resolve exception
```

---

# 84. Critical Frontend E2E Tests

## Verification integrity

Given:

```text
Internal = 17
Provider write = 17
Provider read-back = 15
```

Expected:

```text
Conflict
```

Never:

```text
Verified
```

## Duplicate mutation protection

Repeated user submission must not create duplicate logical actions.

## Permission enforcement

Viewer attempting a mutation:

```text
Mutation unavailable
Server rejects unauthorized request
UI displays restriction
```

## Partial job

Given:

```text
167 success
12 failed
5 skipped
```

Expected:

```text
Partial
```

with all categories accessible.

## Stale provider

Expected:

```text
Last verified timestamp
STALE
```

not a live-looking quantity.

---

# 85. Visual Regression Contract

Visual regression coverage should include:

```text
Application shell
Overview
Inventory table
SKU detail
Exception investigation
Synchronization
Integration detail
Reconciliation
Billing
Settings
Mobile navigation
Dialogs
Drawers
Empty states
Error states
```

Test with:
- light mode
- dark mode if implemented
- long content
- high-density data
- permission states
- status variations

---

# 86. Component Story Contract

Reusable components should have isolated examples covering:

```text
default
loading
disabled
error
success
warning
danger
empty
long content
mobile
keyboard
accessibility
```

Critical state components should have explicit stories for every semantic state.

---

# 87. Frontend Definition of Done

A frontend feature is complete only when:

### Architecture
- uses shared components
- follows route conventions
- uses correct state boundaries
- uses canonical contracts

### Data
- consumes authoritative API data
- handles freshness
- handles partial data
- handles verification

### Interaction
- primary action is clear
- dangerous action is protected
- async work is visible
- result is persistent

### State
- loading exists
- empty exists
- error exists
- partial exists
- permission exists
- stale/conflict/unknown exists where relevant

### Accessibility
- keyboard accessible
- focus correct
- labels correct
- semantic structure correct
- contrast passes

### Responsive
- desktop passes
- tablet passes
- mobile passes

### Testing
- unit tests
- integration tests where applicable
- E2E coverage for critical workflows

### Observability
- required analytics events
- useful request/job references
- no sensitive telemetry

### QA
- visual regression checked
- representative data tested
- no console errors
- no broken links
- no fake completion states

---

# 88. Screen-Level Implementation Template

Every new screen must be specified using this template:

```text
SCREEN NAME

Purpose:
Primary user question:

Route:
Permissions:

Primary entity:
Primary query:

URL state:

Primary action:
Secondary actions:
Dangerous actions:

Information hierarchy:
1.
2.
3.
4.

Components:

Data fields:

Loading:
Empty:
Success:
Error:
Partial:
Permission:
Stale:
Conflict:
Unknown:

Responsive:
Desktop:
Tablet:
Mobile:

Accessibility:

Analytics:

E2E acceptance:

Definition of done:
```

No production screen should be implemented without this contract.

---

# 89. Component-Level Implementation Template

Every shared component must define:

```text
COMPONENT NAME

Purpose:

Props:
Variants:
States:

Data contract:

Interaction contract:

Keyboard behavior:

ARIA semantics:

Responsive behavior:

Loading behavior:

Error behavior:

Permission behavior:

Analytics:

Test cases:

Visual regression cases:
```

---

# 90. Implementation Sequence

Frontend implementation follows the engineering implementation order rather than visual convenience.

After backend/domain prerequisites exist:

```text
1. Design tokens
2. Primitive components
3. Application shell
4. Authentication surfaces
5. Organization/RBAC surfaces
6. Inventory primitives
7. Inventory table
8. SKU detail
9. Orders
10. Synchronization UI
11. Integrations
12. Reconciliation
13. Exceptions
14. Audit
15. Billing
16. Notifications
17. Overview
18. Products
19. Warehouses
20. Purchasing
21. Reports
22. Automation
23. AI
24. Migration
25. Settings
26. Admin
27. Public website
28. Documentation
29. Status page
30. Visual regression
31. Accessibility hardening
32. Production QA
```

This does not permit building disconnected mock screens first and retrofitting behavior later.

---

# 91. Anti Gravity Operating Instructions

When implementing this specification:

1. Read the relevant engineering domain section.
2. Read the relevant product design section.
3. Identify server/API dependencies.
4. Identify permissions.
5. Define the screen contract.
6. Define loading/empty/error/partial states.
7. Define responsive behavior.
8. Implement or reuse shared components.
9. Connect real API data.
10. Implement mutations through canonical domain APIs.
11. Implement verification-aware state.
12. Add analytics.
13. Add tests.
14. Run lint/typecheck/build.
15. Run relevant E2E tests.
16. Perform visual QA.
17. Only then mark the feature complete.

Do not claim a production feature is complete when it is:
- mocked
- hard-coded
- visually simulated
- disconnected from the API
- missing error states
- missing permission handling
- missing verification behavior
- missing tests

---

# 92. No Mock Completion Rule

Mock data is allowed only for:
- isolated component development
- deterministic automated tests
- explicit demo environments

Mock data must never masquerade as production data.

Production UI must clearly distinguish:
```text
real provider state
last verified state
queued operation
simulated/test state
```

---

# 93. No Silent Fallback Rule

If an API/provider fails:

Do not silently replace the result with:
- static sample data
- cached data without freshness labeling
- generated data
- guessed data

Instead:

```text
Provider unavailable.

Last verified state:
17 units
11:42 UTC
```

---

# 94. Product Trust Contract

The frontend must consistently communicate:

```text
What we know
What we observed
What we submitted
What we verified
What we do not know
What conflicts
What action is available
```

The design succeeds when an operator can investigate an incorrect quantity without asking:

> “Where did this number come from?”

because the interface already answers it.

---

# 95. Final Quality Gate

Before production release, verify all of the following:

```text
[ ] Shared design tokens are used
[ ] Shared UI primitives are used
[ ] No duplicated component systems exist
[ ] All routes follow canonical structure
[ ] URL state is deterministic
[ ] Server state is TanStack Query managed
[ ] No authoritative inventory is fabricated client-side
[ ] Verification is distinct from acknowledgement
[ ] Freshness is visible
[ ] Conflict is visible
[ ] Unknown is visible
[ ] Partial failure is visible
[ ] Permissions are enforced server-side
[ ] UI permission behavior is correct
[ ] Dangerous actions confirm
[ ] Bulk actions show scope
[ ] Async jobs persist beyond the page
[ ] Audit references are available
[ ] Critical analytics are instrumented
[ ] WCAG 2.2 AA requirements are met
[ ] Keyboard flows work
[ ] Mobile flows work
[ ] Loading states work
[ ] Empty states work
[ ] Error states work
[ ] Visual regression passes
[ ] E2E critical paths pass
[ ] No mock production functionality remains
[ ] No silent fallback exists
[ ] No raw secrets appear in UI or telemetry
[ ] Public/app SEO boundary is correct
[ ] Production build passes
```

---

# 96. Final Frontend Principle

The frontend is not a collection of pages.

It is a coherent operational system.

Its job is to turn:

```text
inventory data
+
external provider state
+
events
+
synchronization
+
verification
+
reconciliation
+
exceptions
+
audit
```

into an interface that is:

```text
understandable
traceable
actionable
safe
responsive
accessible
honest about uncertainty
```

The final experience should feel:

```text
Calm when healthy.
Immediate when something is wrong.
Precise during investigation.
Deliberate before dangerous actions.
Transparent during synchronization.
Honest when synchronization fails.
Quiet when the system is healthy.
```

The governing product principle remains:

> **Inventory must be explainable.**

The implementation is complete only when the interface makes that principle true in actual production behavior—not merely in the visual design.
