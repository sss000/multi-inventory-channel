# Inventory Truth & Reconciliation Platform — Canonical Product Design System and Frontend Engineering Specification

## 0. Document Purpose

This document defines the canonical visual language, information architecture, interaction model, component system, screen architecture, responsive behavior, and frontend implementation rules for the Multichannel Inventory Control Platform.

The underlying engineering specification remains the source of truth for domain behavior, data integrity, synchronization, reconciliation, security, tenancy, API behavior, and acceptance criteria. This document translates those requirements into a coherent product experience.

The product should feel like:

> **A calm, precise operational control plane for ecommerce inventory.**

It must not feel like:

- a generic SaaS dashboard
- an ERP clone
- a spreadsheet wrapped in cards
- a visual analytics product
- an AI-first chatbot
- a marketplace aggregator

The complete feature set must be designed from the beginning, even when individual capabilities are released progressively.

Feature flags and release controls determine what is exposed to customers at a given release. They must not result in inconsistent or visually unfinished screens.

The core product principle remains:

> **Inventory must be explainable.**

The user should always be able to move from a number to the state that produced it, the event that changed it, the channels affected, the verification result, the exception, and the available action.

---

# 1. Design North Star

## 1.1 Experience Objective

The interface must allow an ecommerce operator to answer five questions quickly:

1. Is my inventory trustworthy?
2. What needs my attention?
3. Where is the discrepancy?
4. Why did it happen?
5. What can I safely do about it?

The interface should make complex backend behavior appear simple without hiding important evidence.

---

## 1.2 Core UX Principle

### Progressive Disclosure

Do not put every available piece of information onto the first screen.

Instead:

```text
Current state
    ↓
Relevant context
    ↓
Evidence
    ↓
Action
    ↓
Audit/result
```

Example:

```text
Amazon: 15 units
        ↓
Internal: 17
        ↓
Difference: -2
        ↓
Last attempted update: 17
        ↓
Verification returned: 15
        ↓
Conflict identified
        ↓
Reconcile
        ↓
Verify
        ↓
Audit
```

---

## 1.3 Every Important Number Is Explorable

Numbers should behave as entry points into explanation.

Examples:

`17 Available`

opens:

```text
20 On Hand
-2 Reserved
-1 Safety Stock
----------------
17 Available
```

A reservation is clickable.

The reservation links to the order.

The order links to its inventory events.

The event links to synchronization.

Synchronization links to verification.

This creates a causal navigation model instead of disconnected screens.

---

# 2. Complete Product Information Architecture

The complete application surface is:

```text
Overview

Inventory
  ├─ Inventory
  ├─ Reservations
  ├─ Allocations
  ├─ Reconciliation
  └─ Inventory Events

Orders
  ├─ Orders
  ├─ Returns
  └─ Order Events

Products
  ├─ Products
  ├─ Variants
  └─ SKUs

Warehouses
  ├─ Locations
  ├─ Stock
  └─ Transfers

Purchasing
  ├─ Suppliers
  ├─ Purchase Orders
  └─ Receiving

Exceptions

Integrations
  ├─ Channels
  ├─ Channel Accounts
  ├─ Mappings
  └─ Health

Synchronization
  ├─ Queue
  ├─ Jobs
  ├─ Failed Jobs
  └─ Verification

Reports
  ├─ Inventory
  ├─ Channels
  ├─ Warehouses
  ├─ Orders
  ├─ Exceptions
  └─ Synchronization

Automation

AI Assistant

Notifications

Audit

Migration

Settings
  ├─ Organization
  ├─ Users
  ├─ Roles
  ├─ Security
  ├─ Notifications
  ├─ Data
  └─ Preferences

Billing
  ├─ Subscription
  ├─ Usage
  ├─ Invoices
  └─ Entitlements
```

The navigation should remain visually simple even though the information architecture is deep.

Use grouped navigation with collapsible secondary sections rather than exposing every route simultaneously.

---

# 3. Application Shell

## 3.1 Desktop Shell

```text
┌──────────────────────────────────────────────────────────┐
│ Sidebar │ Topbar / Global Search / Notifications / User │
│         ├────────────────────────────────────────────────┤
│         │ Breadcrumb                                      │
│         ├────────────────────────────────────────────────┤
│         │ Page Header                                     │
│         │                                                 │
│         │ Primary Content                                 │
│         │                                                 │
│         └────────────────────────────────────────────────┤
└──────────────────────────────────────────────────────────┘
```

### Sidebar

Desktop width:

```text
240px expanded
68px collapsed
```

The sidebar should visually recede behind the content.

Navigation order:

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

Settings
Billing
```

Use visual grouping and whitespace rather than heavy divider lines.

---

# 4. Topbar

The topbar contains:

```text
Global Search
Context / Environment where applicable
Notification Bell
Help
User / Organization Switcher
```

Global search must support:

```text
SKU
Product
Barcode
Order number
External ID
Exception
Integration
```

Search should eventually support natural-language queries such as:

> “Show wireless headphones with Amazon discrepancies.”

However, normal deterministic search remains the default.

---

# 5. Design Language

## 5.1 Visual Direction

The visual direction is:

```text
Professional
Technical
Trustworthy
Operational
Minimal
Fast
Calm
Precise
```

Avoid:

- excessive gradients
- decorative glassmorphism
- oversized illustrations inside the app
- animated dashboards
- excessive shadows
- decorative charts
- excessive rounded containers
- visual noise

The specification explicitly establishes this restrained, mission-control direction.

---

# 6. Color System

Use semantic tokens rather than hard-coded colors.

## 6.1 Core Palette

```text
Primary
Primary-50
Primary-100
Primary-500
Primary-600
Primary-700
Primary-900

Neutral
Neutral-0
Neutral-50
Neutral-100
Neutral-200
Neutral-300
Neutral-400
Neutral-500
Neutral-600
Neutral-700
Neutral-800
Neutral-900
```

Primary should be a controlled technical blue.

---

## 6.2 Semantic Colors

```text
Success
Warning
Danger
Info
```

Use semantic colors to communicate system state rather than decoration.

---

## 6.3 State Model

The product must distinguish:

```text
LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN
```

These distinctions are fundamental to product trust and must not be collapsed into a generic green check.

---

# 7. Status Language

Use a consistent semantic vocabulary.

```text
Healthy
Connected
Verified
Live
Processing
Queued
Pending
Retrying
Warning
Open
Requires Action
Conflict
Failed
Stale
Unknown
Disconnected
Not Connected
```

Do not invent alternate terminology for the same system state.

---

# 8. Freshness Model

External values must expose freshness when meaningful.

Show:

```text
Observed
Received
Verified
```

Examples:

> Last verified 42 seconds ago.

> Observed 3 minutes ago.

> Verification pending.

> Last verified state: 15 units.

The UI must never imply that an external value is current merely because it is displayed.

This follows the source requirements for `observed_at`, `received_at`, `verified_at`, and explicit freshness.

---

# 9. Typography

Use Inter or the equivalent clean system sans-serif.

## Type Scale

```text
Display
32 / 40 / 700

Page Title
28 / 36 / 700

Section Title
20 / 28 / 650

Subsection
16 / 24 / 650

Body
14 / 22 / 400

Body Medium
14 / 22 / 500

Table
13 / 20 / 400

Caption
12 / 18 / 400

Micro
11 / 16 / 500
```

Do not use typography as decoration.

Use weight and whitespace to establish hierarchy.

---

# 10. Numerical Typography

Inventory values, order totals, counts, and health metrics should use tabular numerals where supported.

Examples:

```text
12,482
17
-2
98.7%
$284,392
```

Negative quantities must remain visible.

Do not silently clamp them to zero.

---

# 11. Spacing System

Use an 8-point base system.

```text
4
8
12
16
20
24
32
40
48
64
80
```

Default:

```text
Card padding: 20–24px
Section gap: 24–32px
Page gutter: 24–32px
Table cell padding: 12–16px
```

---

# 12. Border Radius

Use moderate radii.

```text
Small controls: 6px
Inputs: 8px
Cards: 10–12px
Dialogs: 12–16px
```

Avoid excessively pill-shaped UI except for compact status indicators.

---

# 13. Elevation

Use subtle elevation.

Preferred hierarchy:

```text
Flat surface
Subtle border
Low shadow
Modal elevation
```

Do not rely on large shadows to distinguish every component.

---

# 14. Iconography

Use one icon family throughout.

Icons must:

- communicate function
- remain visually secondary to text
- have consistent stroke weight
- support tooltips when meaning is ambiguous

Do not use icons merely for decoration.

---

# 15. Core Component System

Create one canonical implementation for each shared component.

Required families:

```text
ApplicationShell
Sidebar
Topbar
Breadcrumb
PageHeader

MetricCard
StatusBadge
StateIndicator
FreshnessLabel

DataTable
TableToolbar
FilterBar
FilterChip
Pagination
ColumnSelector
SavedView

InventoryCell
InventoryComparison
InventoryBreakdown

Timeline
ActivityFeed
EvidencePanel
ChangeRecord

ExceptionCard
ExceptionSummary
ExceptionEvidence
ExceptionAction

IntegrationCard
HealthIndicator
SyncState
JobProgress

Drawer
Modal
ConfirmDialog

Toast
Notification
InlineAlert

EmptyState
LoadingState
ErrorState
PartialFailureState
PermissionState

FormField
Select
Combobox
DateRange
NumberInput
SearchInput

CommandPalette
Tooltip
Popover
Dropdown
Tabs

Chart
TrendCard
ReportTable
```

No one-off versions unless a genuinely new interaction primitive is required.

This directly follows the specification's reusable-component requirement.

---

# 16. Metric Card

Metric cards should answer a question.

Bad:

> Inventory

Good:

> Available Inventory  
> 12,482 units

Optional secondary context:

```text
+2.5% vs previous period
Last verified 2 min ago
```

Every metric should have:

```text
label
value
state/context
optional delta
optional freshness
```

Do not fill dashboards with metrics that require interpretation without context.

---

# 17. Status Badges

Badges communicate state, not categories.

Example:

```text
● Verified
● Processing
● Warning
● Failed
● Conflict
```

Do not use the same green pill for:

```text
Connected
Synced
Verified
Active
Healthy
```

These are semantically different.

---

# 18. Data Table

The DataTable is one of the most important primitives.

Required:

```text
search
filtering
sorting
column visibility
server-side pagination
row selection
bulk actions
responsive behavior
loading
empty
error
partial failure
```

Default page size:

```text
50
```

Maximum:

```text
250
```

The system must never load an entire organization history into the browser.

---

# 19. Table Design Rules

Priority order:

```text
Identity
Current state
Important quantity
Operational status
Secondary metadata
Actions
```

Do not give every column equal visual weight.

Use:

- stronger typography for primary identity
- muted typography for metadata
- semantic status indicators
- right alignment for numbers
- compact controls

---

# 20. Overview Screen

## Primary Job

Answer:

> **Is my inventory system healthy right now?**

## Structure

```text
Page Header
System Status

Primary Metrics
Channel Health
Critical Exceptions
Inventory Trend
Recent Activity
Inventory by Location
```

## Primary Metrics

```text
Inventory Health
Active Exceptions
Sync Verification Rate
Open Orders
```

Do not add ten metric cards.

---

## Channel Health

Display:

```text
Shopify
Amazon
eBay
Walmart
WooCommerce
```

Each row/card:

```text
provider
account
health
last verified sync
open issues
```

Example:

```text
Amazon
Healthy
98.9%
Last verified 3 min ago
1 open issue
```

---

# 21. Overview Exception Priority

Exceptions must be visible without dominating the entire interface.

Use:

```text
Critical
High
Medium
Low
```

Prioritize by:

```text
severity
impact
age
```

not merely creation time.

This follows the source requirement.

---

# 22. Inventory Screen

## Primary Job

Find and act on inventory issues at SKU/location/channel level.

Top area:

```text
Inventory
Description

Search
Location
Channel
Stock State
Mismatch
Sync State

Saved Views
Columns
Bulk Actions
```

Core table:

```text
SKU
Product
Warehouse
On Hand
Reserved
Available
Amazon
Shopify
eBay
Walmart
Status
```

The structure comes directly from the product specification.

---

# 23. Inventory Cell

An inventory cell should show:

```text
17
Verified 42s ago
```

or:

```text
15
Conflict
```

or:

```text
17
Pending verification
```

Do not use color alone.

Hover/click opens a compact detail popover:

```text
Current
17

Last change
+2

Event
Inventory adjustment

Verified
11:42:16
```

---

# 24. Inventory Row Detail

Clicking a row should open a detail drawer before requiring full navigation.

Drawer:

```text
SKU
Product

Inventory summary
Location state
Channel state
Recent events
Open exceptions

View full SKU
```

This supports fast operations without forcing page transitions.

---

# 25. SKU Detail — Flagship Experience

This is one of the primary product experiences.

## Header

```text
Product image
Product title
SKU
Status
Brand/category

Actions
Edit
More
```

Primary summary:

```text
Available
393

On Hand
425

Reserved
32

Safety Stock
20
```

---

# 26. SKU Tab Structure

```text
Overview
Inventory
Channels
Timeline
Orders
Purchasing
Exceptions
Forecast
Audit
Settings
```

Only display tabs appropriate to the product state and organization capabilities.

---

# 27. SKU Inventory by Location

Table:

```text
Location
On Hand
Reserved
Allocated
Available
```

Bottom total row:

```text
Total
```

Every quantity should be explainable.

---

# 28. SKU Channel Inventory

Show:

```text
Channel
Current Quantity
Internal Quantity
Difference
Sync State
Last Verified
```

Example:

```text
Shopify     390   390   0   Verified
Amazon      390   392  -2   Conflict
eBay        392   392   0   Verified
```

---

# 29. SKU Timeline

The timeline is critical.

Chronological structure:

```text
11:42:16
Inventory updated
17 → 15
Amazon
System

11:41:58
Sync submitted
Target: 17
Amazon
System

11:41:20
Order reserved
-1
Shopify
Customer

11:35:10
Purchase received
+50
Warehouse
Operator
```

Every event must be expandable.

Expanded evidence can show:

```text
Event
Actor
Reason
Source
Correlation ID
Before state
After state
Channel impact
```

This reflects the requirement that support staff be able to reconstruct before → event → actor → reason → after → channel impact → sync result.

---

# 30. Exception Inbox

## Primary Job

Turn system problems into understandable, actionable incidents.

Top:

```text
Exceptions

Critical
High
Medium
Low
Open
Investigating
Resolving
Resolved

Search
Channel
Type
Age
Impact
```

Table:

```text
Priority
Type
SKU/Product
Channel
Impact
Detected
Status
Action
```

---

# 31. Exception Investigation Workspace

This should not look like a standard CRUD detail page.

Structure:

```text
Exception Header

Problem Statement

Impact

Observed State

Expected State

Evidence

Likely Cause

System Attempts

Recommended Action

Resolution

Audit Trail
```

---

# 32. Exception Header

Example:

```text
INVENTORY MISMATCH

Amazon
Wireless Headphones
SKU ABC-123

Critical
Open
Detected 28 minutes ago
```

Primary action:

```text
Reconcile
```

Secondary:

```text
Investigate
Ignore
Retry
```

Dangerous actions require confirmation.

---

# 33. Exception Comparison Panel

Use a visually obvious comparison:

```text
INTERNAL
17 units

AMAZON
15 units

DIFFERENCE
-2 units
```

Do not make the user infer the difference manually.

---

# 34. Exception Evidence

Show evidence in chronological form.

```text
11:41:58
Inventory update submitted
Target = 17

11:42:01
Provider acknowledged request

11:42:05
Read-back verification returned 15

11:42:06
Conflict created
```

Use explicit labels:

```text
Observed
Inference
Recommendation
Unknown
```

AI and deterministic reasoning must use these distinctions where relevant.

---

# 35. Exception Recommendation

Example:

```text
Recommended Action

Reconcile Amazon to 17 units.

Reason:
No unresolved competing event detected.
Mapping is valid.
Internal inventory is authoritative.

[Review & Reconcile]
```

Never silently execute an unsafe correction.

---

# 36. Confirmation Dialogs

For dangerous operations:

```text
This action will update:

1,284 SKUs
Amazon
3 warehouses

Current source:
Internal Inventory

Destination:
Amazon

[Cancel]
[Confirm Update]
```

The source explicitly requires confirmation for bulk inventory adjustment, mass reconciliation, large corrections, channel disconnection, and other dangerous operations.

---

# 37. Mass Action UX

Every mass action must show:

```text
Scope
Affected count
Affected channels
Affected locations
Expected result
Risk
```

Then:

```text
Confirm
Cancel
```

Execution happens asynchronously.

---

# 38. Asynchronous Job UX

Never freeze the interface during:

```text
imports
large synchronization
reconciliation
exports
migrations
bulk actions
```

Show:

```text
Queued
Running
Succeeded
Partial
Retrying
Failed
Cancelled
```

The job detail must expose:

```text
Job ID
Type
Started
Duration
Progress
Attempts
Current state
Errors
```

This directly follows the source job requirements.

---

# 39. Partial Failure UX

Never show:

> Successful

when the operation was only partially successful.

Instead:

```text
Inventory update

1,000 total
982 succeeded
12 retrying
6 failed
```

Actions:

```text
View failures
Retry failed
Download report
```

The source explicitly requires this behavior.

---

# 40. Synchronization Screen

Primary view:

```text
Synchronization

All
Running
Pending
Completed
Retrying
Failed
Conflicts
```

Table:

```text
Job
Type
Channel
SKU/Resource
State
Started
Duration
Attempts
```

---

# 41. Sync Detail

Visualize the synchronization state machine:

```text
QUEUED
  ↓
PROCESSING
  ↓
SENT
  ↓
ACKNOWLEDGED
  ↓
VERIFYING
  ↓
VERIFIED
```

Failure branches:

```text
RETRYING
FAILED
REQUIRES ACTION
CONFLICT
```

Do not visually collapse:

```text
Acknowledged
```

and:

```text
Verified
```

The specification explicitly says an API success/acknowledgement is not sufficient to mark the job verified.

---

# 42. Integrations

## Overview

Cards or rows for:

```text
Shopify
Amazon
eBay
Walmart
WooCommerce
Future integrations
```

Each integration shows:

```text
Provider
Account
Health
Last successful API call
Last successful inventory sync
Last webhook
Pending jobs
Failed jobs
Rate limit state
```

Actions:

```text
Manage
Sync Now
Reconnect
Disconnect
```

---

# 43. Integration Detail

Sections:

```text
Overview
Capabilities
Mappings
Inventory
Orders
Webhooks
Synchronization
Errors
Health
Settings
Audit
```

Technical details should be progressively disclosed.

Do not expose credentials or secrets.

---

# 44. Products

Products should remain catalog-centric.

Primary view:

```text
Product
Variants
SKU
Status
Inventory
Channels
Price
```

Avoid turning Products into an inventory duplicate.

Inventory is the inventory authority.

Products are the catalog identity layer.

---

# 45. Orders

Orders should be operational and compact.

Columns:

```text
Order #
Channel
Customer
Items
Status
Payment
Fulfillment
Total
Date
```

Order detail:

```text
Order summary
Items
Reservations
Inventory impact
Events
Fulfillment
Returns
Channel
Audit
```

The inventory relationship should be visible directly from the order.

---

# 46. Returns

Returns should show:

```text
Return
Order
Product
Quantity
Reason
Status
Received
Sellable state
Inventory impact
```

Returned inventory must not be presented as sellable simply because the physical return exists.

This follows the source requirement that returned stock not automatically increase sellable inventory until the appropriate business rule applies.

---

# 47. Warehouses

Warehouse overview:

```text
Locations
Inventory value
Stock level
Available
Reserved
Incoming
Transfers
```

Warehouse detail:

```text
Overview
Inventory
Transfers
Receiving
Exceptions
Activity
Settings
```

Use location-centric workflows rather than copying the Inventory interface.

---

# 48. Inventory Transfers

Workflow:

```text
Source
Destination
SKU
Quantity
Reason
Status
```

Status:

```text
Draft
Requested
In Transit
Received
Exception
Completed
```

Every transfer creates inventory events.

---

# 49. Purchasing

Purchasing overview:

```text
Purchase Orders
Draft
Ordered
Receiving
Completed
```

Table:

```text
PO
Supplier
Items
Total
Status
Expected
Received
```

Purchase order detail:

```text
Header
Supplier
Items
Ordered
Received
Remaining
Expected date
Receiving history
Inventory impact
Audit
```

---

# 50. Suppliers

Supplier detail:

```text
Supplier
Contact
Open POs
Historical spend
Receiving
Products
Activity
```

Do not turn supplier management into a full procurement ERP unless the underlying product scope supports it.

---

# 51. Reports

Reports should answer business questions.

Core reports:

```text
Inventory Value
Inventory by Warehouse
Inventory by Channel
Low Stock
Stockouts
Synchronization Health
Discrepancy History
Order Volume
```

The source defines these report classes and requires reports to derive from transactional data.

---

# 52. Report Design

Prefer:

```text
Summary
Trend
Breakdown
Detail
Export
```

Do not place charts simply because charts are available.

Every chart should answer a specific question.

---

# 53. Automation

Automation should be a rule-management product surface.

Structure:

```text
Automations

Active
Paused
Draft
Failed

Create Automation
```

Rule anatomy:

```text
WHEN
condition

IF
condition

THEN
action

EXCEPT
safety rule
```

Examples:

```text
When stock drops below threshold
→ create replenishment alert

When integration authentication fails
→ notify administrator

When discrepancy meets safe auto-reconciliation policy
→ reconcile automatically
```

Dangerous mutations must respect the same permission, validation, and confirmation model as manual actions.

---

# 54. AI Assistant

AI is a secondary interface over deterministic system data.

It may:

```text
Explain
Search
Summarize
Diagnose
Recommend
Prepare action
```

It must never become the source of truth.

---

# 55. AI Experience

Chat layout:

```text
Conversation

Question
System evidence
Explanation
Recommendation
Action
```

Example:

```text
Why is ABC-123 different on Amazon?

Observed
Amazon reports 15 units.

Observed
Internal inventory is 17.

Observed
The last update attempted to set 17.

Likely cause
The provider did not retain the requested quantity.

Recommendation
Run reconciliation.

[Show evidence]
[Prepare reconciliation]
```

---

# 56. AI Action Flow

Never let the AI jump from text directly to mutation.

Required:

```text
User request
↓
Intent
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
Audit
```

This is required by the source architecture.

---

# 57. Notifications

Use:

```text
In-app
Email
```

Primary categories:

```text
Critical inventory conflict
Integration authentication
Repeated sync failure
Low stock
Negative inventory
Reconciliation required
Billing
```

Do not notify users about every successful background operation.

Group repeated incidents rather than generating excessive notifications.

---

# 58. Notification Center

Notification item:

```text
Critical
Amazon sync failure

14 SKUs affected
Last 20 minutes

View incident
```

State:

```text
Unread
Read
Resolved
```

Notifications should link directly to the affected operational object.

---

# 59. Audit

Audit must be treated as evidence, not decoration.

Audit view:

```text
Timestamp
Actor
Action
Entity
Reason
Before
After
Request ID
Correlation ID
```

Audit history must be append-only.

Ordinary users must never receive an edit mechanism for audit history.

---

# 60. Reconciliation

Reconciliation overview:

```text
Runs
Matched
Minor differences
Material differences
Missing external
Missing internal
Stale external
Unknown
```

Run detail:

```text
Run summary
Coverage
Matches
Differences
Auto-resolvable
Requires approval
Failed
```

---

# 61. Safe Auto-Reconciliation

The UI must expose why an action is safe.

Example:

```text
Automatic correction available

✓ Mapping known
✓ Internal inventory authoritative
✓ No competing event
✓ Within configured threshold
✓ No manual lock
✓ Low-risk correction
```

Otherwise:

```text
Manual approval required
```

The source requires these conditions for automatic reconciliation.

---

# 62. Migration Experience

Migration workflow:

```text
Upload
↓
Detect
↓
Map
↓
Validate
↓
Conflict report
↓
Preview
↓
Confirm
↓
Import
↓
Verify
```

Never silently discard unmapped records.

---

# 63. Migration UI

Use a wizard with progress:

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

Every step must show:

```text
Completed
Current
Blocked
Needs attention
```

Large migrations run asynchronously.

---

# 64. Billing

Billing should remain visually consistent with the core application.

Sections:

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

The source defines these plan families and states that entitlement logic must be stored internally rather than hard-coded into frontend components.

---

# 65. Usage

Show:

```text
Orders
Channels
Warehouses
Users
API Calls
Automation Executions
Storage
```

Use progress indicators only where they improve comprehension.

Example:

```text
2,184 / 2,500 orders
87%
```

Soft limits should not be represented as sudden product failure.

---

# 66. Settings

Group settings into:

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

Use sectioned settings pages rather than one enormous form.

---

# 67. Source-of-Truth UX

This setting is high-risk and must use explanatory language.

Example:

```text
Inventory Authority

Internal Inventory
Authoritative

Amazon
Observed state only

Shopify
Observed state only
```

Never infer authority from whichever quantity is newer.

The source explicitly requires explicit authority rules.

---

# 68. Allocation UX

Show:

```text
Available: 100

Amazon
40

Shopify
30

eBay
20

Reserve
10
```

Supported strategies:

```text
Fixed
Priority
Proportional
Unallocated
```

V1 may prioritize fixed and priority allocation, but the complete design should accommodate all defined strategies.

---

# 69. Negative Inventory Experience

Never hide negative inventory.

Example:

```text
Available
-3

NEGATIVE INVENTORY

Cause investigation required
```

The user should be able to open the event history immediately.

The system must create the corresponding exception rather than masking the condition.

---

# 70. Loading States

Loading screens must preserve page structure.

Prefer skeletons for:

```text
tables
metric values
cards
timeline entries
```

Avoid full-screen spinners whenever content structure is predictable.

---

# 71. Empty States

Empty states must explain:

```text
What is empty
Why it may be empty
What action can create data
```

Example:

```text
No integrations connected

Connect Shopify or Amazon to begin importing inventory.

[Connect Integration]
```

---

# 72. Error States

Errors must be actionable.

Bad:

> Something went wrong.

Good:

```text
Amazon inventory could not be verified.

Last verified state:
15 units
3 minutes ago

Reason:
Provider returned an inconsistent quantity.

[Investigate]
[Retry]
```

This follows the specification's requirement for explicit provider-unavailable and last-known-state behavior.

---

# 73. Partial Failure States

Partial failure should be a first-class state.

Example:

```text
Import complete with issues

4,982 imported
43 failed
12 require mapping

[View issues]
```

Never hide failed subsets beneath a generic success state.

---

# 74. Permission States

Permission-denied pages should explain the required access level where safe.

Example:

```text
You don't have permission to perform bulk inventory adjustments.

Required:
Inventory Management

Contact an organization administrator.
```

Do not reveal sensitive implementation details.

---

# 75. Responsive Design

## Desktop

Primary interaction model.

```text
1440+
```

Use full sidebar and dense tables.

## Laptop

```text
1024–1439
```

Reduce margins and secondary metadata.

## Tablet

```text
768–1023
```

Use collapsible navigation and horizontal table scrolling where unavoidable.

## Mobile

```text
<768
```

Mobile is an operational companion, not merely a compressed desktop layout.

Use:

```text
bottom navigation or compact drawer
stacked summaries
cards instead of wide tables
horizontal detail sections
drawers for secondary actions
```

Prioritize:

```text
Exceptions
Inventory alerts
Integration health
Critical notifications
```

---

# 76. Mobile Table Behavior

Never simply shrink a desktop table until it becomes unreadable.

Instead:

```text
Primary identity
Current quantity
Status
One primary action
```

Additional information lives inside expandable rows.

---

# 77. Keyboard UX

All critical workflows must be keyboard accessible.

Support:

```text
Tab
Shift+Tab
Enter
Escape
Arrow keys
Space
Command/Ctrl+K
```

Command search should eventually provide keyboard-first navigation.

---

# 78. Accessibility

Target:

> WCAG 2.2 AA

Required:

```text
Keyboard navigation
Visible focus
Semantic HTML
Accessible labels
Accessible tables
Accessible dialogs
Accessible alerts
Sufficient contrast
Screen-reader compatibility
```

Do not rely on color alone for system state.

---

# 79. Motion

Motion is optional and functional.

Use motion for:

```text
drawer opening
modal opening
state transitions
progress
loading
```

Avoid:

```text
continuous animation
decorative movement
animated charts
large page transitions
```

Default motion should be subtle and fast.

Respect reduced-motion preferences.

---

# 80. Search and Command Palette

Global search should eventually act as a universal command interface.

Examples:

```text
Find SKU ABC-123
Open Amazon integration
Show open critical exceptions
Go to Purchase Orders
Reconcile SKU ABC-123
```

Mutation commands must still pass normal authorization and confirmation paths.

---

# 81. Bulk Actions

Bulk-action toolbar appears only after selection.

Example:

```text
14 selected

Adjust
Reconcile
Assign
Export
More
```

Dangerous actions must be visually separated from routine actions.

---

# 82. Action Hierarchy

Every page should have:

```text
Primary action
Secondary action
Tertiary actions
Dangerous actions
```

Do not make five buttons visually equal.

---

# 83. Drawers

Use drawers for:

```text
quick details
events
preview
secondary investigation
```

Use full pages for:

```text
complex workflows
large configuration surfaces
deep investigations
reports
multi-step forms
```

---

# 84. Modals

Use modals only for focused decisions.

Good uses:

```text
confirmation
destructive operation
small focused form
permission request
```

Do not put complex operational workflows into giant modal windows.

---

# 85. Data Visualization

Charts must remain analytical, not decorative.

Recommended chart types:

```text
Line
Area
Bar
Stacked bar
Donut only when composition is useful
```

Do not use 3D charts.

Do not use charts when a table would be more precise.

---

# 86. Report Exports

Export actions should show:

```text
Preparing export
```

Then:

```text
Export ready

CSV
XLSX

Download
```

Large exports are asynchronous according to the source specification.

---

# 87. Public Website Design System

The public website must share the brand DNA but not reuse the application shell.

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

The source specifies separation between public pages and `/app/*`.

---

# 88. Public Site Visual Language

Marketing pages can be more expressive than the application, but remain technically credible.

Avoid:

- giant abstract animations
- fake dashboards
- fake customer statistics
- fake testimonials
- exaggerated claims

The visual language should emphasize:

```text
trust
clarity
inventory accuracy
verified synchronization
explainability
```

---

# 89. Documentation

Documentation should visually align with the product but use a reading-oriented layout.

Structure:

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

Public documentation routes:

```text
/getting-started
/inventory
/orders
/integrations
/reconciliation
/api
/security
/billing
```

---

# 90. Status Page

Status page should use the same semantic language.

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

Each shows:

```text
Operational
Degraded
Major issue
```

Status must be derived from actual monitoring.

---

# 91. Design System Implementation

Use:

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

as specified by the engineering document.

All components must be implemented through shared UI packages where appropriate.

Recommended:

```text
/packages/ui
```

No duplicate domain-specific UI implementations without justification.

---

# 92. Frontend Architecture

Canonical structure:

```text
app/
  (marketing)/
  (auth)/
  (dashboard)/
```

Authenticated layout:

```text
Sidebar
Topbar
Breadcrumb
Page content
Notifications
```

as specified in the engineering architecture.

---

# 93. Server State

Use TanStack Query for server state.

Distinguish:

```text
server state
local UI state
form state
URL state
```

Filter/sort/search state should be URL-addressable where appropriate.

---

# 94. URL Design

Examples:

```text
/app
/app/inventory
/app/inventory/sku/ABC-123
/app/orders
/app/orders/100023
/app/products
/app/products/123
/app/exceptions
/app/exceptions/EXC-123
/app/integrations
/app/integrations/amazon
/app/synchronization
/app/synchronization/jobs/JOB-123
/app/warehouses
/app/purchasing
/app/reports
/app/automation
/app/ai
/app/settings
/app/billing
```

Use stable URLs for operational objects.

---

# 95. URL-State Rule

Persist useful workspace state in URLs where appropriate:

```text
filters
search
sort
date range
view
pagination cursor where applicable
```

This allows users to bookmark and share operational views.

---

# 96. Performance

The UI must be optimized for:

```text
fast initial render
minimal client JavaScript
lazy loading
server-side data fetching
indexed queries
cursor pagination
background processing
```

Never load an entire organization's order history into the browser.

---

# 97. Performance UX

Large operations must reveal progress.

Examples:

```text
Importing 12,482 SKUs
67%

Synchronization
843 / 1,200 completed

Reconciliation
1,203 / 4,822 evaluated
```

Users must be able to leave the page without losing the job.

---

# 98. Trust Model

The UI should distinguish:

```text
Requested
Submitted
Acknowledged
Verified
Failed
Conflict
Unknown
```

Use explicit language.

Preferred:

> Update submitted. Verification pending.

Not:

> Inventory synchronized.

until the system has actually verified the result.

This follows the explicit eventual-consistency requirements.

---

# 99. No-Silent-Fallback Rule

When a provider is unavailable:

Do not replace live data with fabricated or fake data.

Show:

```text
Provider unavailable.

Last verified state:
17 units
11:42 AM
```

This rule is critical to trust.

---

# 100. Content Design

Use precise language.

Prefer:

> Verification failed.

over:

> Uh oh, something went wrong.

Prefer:

> Amazon returned 15 units during read-back verification.

over:

> Amazon is having trouble.

Never disguise uncertainty.

Use:

```text
Observed
Likely cause
Recommendation
Unknown
```

when appropriate.

---

# 101. Dangerous Operation Language

Dangerous actions should state impact before execution.

Example:

```text
Disconnect Amazon

This will:
• stop outbound inventory synchronization
• leave the last verified marketplace quantity unchanged
• pause pending Amazon jobs

There are currently:
1,284 pending inventory relationships

[Cancel]
[Disconnect Amazon]
```

This is preferable to a generic:

> Are you sure?

---

# 102. Bulk Operation Results

After execution:

```text
Completed with partial failures

982 succeeded
12 retrying
6 failed

[View failures]
[Download report]
```

The user should never have to infer partial status.

---

# 103. Notification Deduplication

Repeated failures should be grouped.

Example:

> Amazon inventory synchronization has failed for 14 SKUs over the last 20 minutes.

rather than:

> 14 separate emails.

This follows the notification deduplication requirement.

---

# 104. Feature Flags

Design every full-product screen even when the capability is not yet generally available.

Use feature flags for:

```text
New integrations
AI
Automatic reconciliation
Advanced allocations
Migration tools
Automation
Advanced warehouse functionality
```

Flags must be organization-aware.

The visual system should not change when a feature moves from gated to general availability.

---

# 105. Release Experience

Feature gating should produce:

```text
Available
Coming soon
Beta
Requires plan
Requires permission
Not configured
```

Do not expose fake functional controls.

Do not show a production feature as complete if the underlying functionality is not complete.

The source explicitly prohibits representing mock functionality as production functionality.

---

# 106. Responsive Information Priority

When space becomes constrained, remove in this order:

```text
secondary metadata
secondary statistics
secondary actions
decorative content
```

Never remove:

```text
identity
current state
critical warning
primary action
```

---

# 107. Design QA Checklist

Every production page must support:

```text
Loading
Empty
Success
Error
Partial failure
Permission denied
```

Every table must support:

```text
Search
Filter
Sort
Pagination
Responsive behavior
```

Every form must support:

```text
Validation
Actionable error
Disabled submission
Loading state
Success state
Failure state
```

These requirements come directly from the frontend acceptance criteria.

---

# 108. Visual QA

Every screen must be reviewed for:

```text
Hierarchy
Alignment
Density
Contrast
Semantic state
Spacing
Typography
Responsive behavior
Keyboard accessibility
Error behavior
Loading behavior
```

A page is not approved because the success state looks good.

Failure and recovery states are part of the design.

---

# 109. UX Acceptance Tests

## Inventory Mismatch

Given:

```text
Internal = 20
Amazon = 18
```

the interface must show:

```text
Inventory discrepancy detected
Internal: 20
Amazon: 18
Difference: -2
Investigate
```

It must not silently overwrite Amazon.

---

## Failed Synchronization

When Amazon rejects an update:

Show:

```text
Amazon inventory update failed

Reason
<normalized provider error>

Attempts
3

Retry state
Retrying

Affected SKU
ABC-123

[Retry]
```

Never show green success.

---

## Verification Conflict

Given:

```text
Internal = 17
Provider acknowledged = 17
Read-back = 15
```

The UI must show:

```text
Conflict

Expected: 17
Verified externally: 15
```

The job must not be presented as verified.

---

# 110. Audit Acceptance

For every inventory change, the UI must permit reconstruction of:

```text
Before
Event
Actor
Reason
After
Channel impact
Synchronization result
```

This is a core trust interaction rather than an administrative afterthought.

---

# 111. Design Principles to Enforce

### Principle 1

**State before detail.**

### Principle 2

**Evidence before speculation.**

### Principle 3

**Action after understanding.**

### Principle 4

**Verification is not acknowledgement.**

### Principle 5

**Errors remain visible.**

### Principle 6

**Uncertainty is explicit.**

### Principle 7

**Dangerous actions require confirmation.**

### Principle 8

**Large work is asynchronous.**

### Principle 9

**Every material inventory mutation remains explainable.**

### Principle 10

**Complexity should be available, not constantly visible.**

---

# 112. What the Product Should Feel Like

When the user opens the application:

> Calm.

When something is wrong:

> Immediate.

When investigating:

> Precise.

When performing a dangerous action:

> Deliberate.

When synchronization is running:

> Transparent.

When synchronization fails:

> Honest.

When the system is healthy:

> Quiet.

The design should not constantly demand attention.

---

# 113. Final Visual Target

The product should occupy the conceptual space between:

```text
Operational observability
+
Inventory management
+
Modern SaaS precision
+
Financial-grade auditability
```

The design should borrow qualities—not visual copies—from operationally strong products:

```text
precision
clarity
density
traceability
system state
```

Do not copy another company's visual identity.

---

# 114. Final Implementation Rule

The product team must not treat the mockups as loose inspiration.

Implement the design system as a reusable foundation:

```text
Design tokens
↓
Typography
↓
Semantic states
↓
Primitive components
↓
Composite components
↓
Application shell
↓
Page templates
↓
Screens
↓
Interaction states
↓
Responsive behavior
↓
Accessibility
↓
Visual QA
```

Do not build twenty pages independently.

Build the design language once and compose the application from it.

---

# 115. Final Screen Inventory

The complete design system should cover, at minimum:

```text
01 Overview
02 Inventory
03 Inventory Detail
04 SKU Detail
05 Product Detail
06 Orders
07 Order Detail
08 Returns
09 Warehouses
10 Warehouse Detail
11 Transfers
12 Purchasing
13 Purchase Order Detail
14 Suppliers
15 Exceptions
16 Exception Investigation
17 Reconciliation
18 Reconciliation Run Detail
19 Integrations
20 Integration Detail
21 Mappings
22 Synchronization Queue
23 Synchronization Job Detail
24 Reports
25 Automation
26 AI Assistant
27 Notifications
28 Audit
29 Migration
30 Migration Detail
31 Settings
32 Organization
33 Users & Roles
34 Security
35 Billing
36 Usage
37 Public Website
38 Pricing
39 Integrations Directory
40 Compare / Alternatives
41 Migration Marketing
42 Documentation
43 Status Page
```

These should use one common design system.

---

# 116. Final Quality Bar

A screen is approved only when:

```text
It is visually coherent.
It has a clear primary purpose.
It communicates state correctly.
It handles failure.
It handles partial failure.
It handles loading.
It handles empty data.
It handles permission limits.
It is keyboard accessible.
It is responsive.
It uses shared components.
It exposes the correct evidence.
It does not misrepresent asynchronous work.
It does not hide uncertainty.
It does not imply verification without verification.
It does not allow dangerous mutation without appropriate confirmation.
```

---

# 117. Final Product Design Principle

The entire UI should ultimately communicate one idea:

> **The system is not asking the merchant to trust a black box. It is showing the merchant why the inventory can be trusted.**

That is the core UX identity of the platform.

The interface is therefore not merely an inventory management interface.

It is an **inventory truth and reconciliation interface**.

Design every screen accordingly.
