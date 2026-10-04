# Inventory Truth & Reconciliation Platform
# Human-Centered UX & Comprehension Contract — Production Revision v2.0

**Status:** Canonical UX quality and human-experience contract  
**Version:** 2.0  
**Supersedes:** `inventory_truth_reconciliation_platform_human_centered_ux_comprehension_contract_v1.md`  
**Companion specifications:**
1. `multichannel_inventory_control_final_engineering_spec_v2.md`
2. `inventory_truth_reconciliation_platform_canonical_ui_ux_design_system_frontend_engineering_specification.md`
3. `inventory_truth_reconciliation_platform_canonical_frontend_design_implementation_specification_v1.md`

---

# 0. Purpose and Authority

This document converts the existing human-centered UX principles into an enforceable production UX contract.

It does **not** replace the engineering, product-design, or frontend implementation specifications.

The authority model is:

```text
01 ENGINEERING SPECIFICATION
        ↓
02 PRODUCT DESIGN SYSTEM
        ↓
03 FRONTEND IMPLEMENTATION SPECIFICATION
        ↓
04 HUMAN-CENTERED UX CONTRACT v2
        ↓
PRODUCTION IMPLEMENTATION + VALIDATION
```

The first three documents define what the system is, how it is designed, and how it is implemented.

This document defines how the resulting product must be **understood, operated, experienced, validated, and accepted by humans**.

If a conflict exists:
- engineering/domain rules remain authoritative for system truth;
- security rules remain authoritative for permissions and tenancy;
- provider capabilities remain authoritative for integration behavior;
- this document is authoritative for human-facing presentation, interaction quality, comprehension, accessibility, usability validation, and UX release gates.

Do not silently resolve conflicts.

---

# 1. Production UX North Star

The product must be technically sophisticated underneath and obvious on the surface.

The user should never need to understand:

- event normalization
- ledgers
- queues
- provider adapters
- correlation IDs
- retry infrastructure
- database transactions
- API contracts
- worker architecture

in order to safely operate the product.

The user **must** be able to understand:

```text
What do I have?
What is happening?
Is anything wrong?
Why?
Which information can I trust?
Do I need to do something?
What will happen if I act?
Did it work?
What can I do if it did not?
```

The product must minimize the user's mental burden without hiding material evidence.

Core principle:

> **Complexity belongs in the system, not in the user's mental burden.**

---

# 2. Human-Centred Design Basis

This contract follows the existing product principles and is strengthened using established human-centred and usability guidance.

ISO 9241-210:2019 defines human-centred design as a lifecycle activity for interactive systems and remains the current ISO edition as of 2026.

The product must therefore treat UX as an ongoing lifecycle discipline, not a visual-design phase.

The product also adopts the ten Nielsen usability heuristics as a formal inspection framework:

1. Visibility of system status
2. Match between system and the real world
3. User control and freedom
4. Consistency and standards
5. Error prevention
6. Recognition rather than recall
7. Flexibility and efficiency of use
8. Aesthetic and minimalist design
9. Help users recognize, diagnose, and recover from errors
10. Help and documentation

Accessibility target:

> **WCAG 2.2 AA**

Accessibility is a release requirement, not an optional enhancement.

---

# 3. The Human Operating Model

The user's primary mental model is:

```text
My products
    ↓
My inventory
    ↓
My sales channels
    ↓
What is happening
    ↓
What needs attention
    ↓
What should I do
    ↓
Did it get fixed?
```

The system's internal model may be:

```text
events
ledgers
reservations
allocations
queues
providers
verification
reconciliation
exceptions
audit
```

The second model must not be required to operate the first.

---

# 4. Universal Screen Contract

Every important screen MUST answer these questions in this order:

```text
1. What am I looking at?
2. What is happening?
3. Is it healthy?
4. What matters?
5. Do I need to act?
6. Why?
7. What can I safely do?
8. What will happen if I do it?
9. How will I know whether it worked?
10. Where can I inspect evidence?
```

The default information hierarchy is:

```text
USER OUTCOME
    ↓
CURRENT STATE
    ↓
IMPORTANT CONTEXT
    ↓
NEXT ACTION
    ↓
EXPLANATION
    ↓
EVIDENCE
    ↓
TECHNICAL DETAIL
```

Never reverse this hierarchy on a normal operational screen.

---

# 5. Primary Action Architecture

Every screen must define:

```text
Primary action
Secondary action
Tertiary actions
Dangerous actions
Navigation actions
```

Only the primary action receives primary visual emphasis.

Actions must be labelled by outcome, not implementation mechanism.

Prefer:

```text
Update Amazon
Check inventory differences
Connect store
Review issue
Try again
Confirm correction
```

Avoid:

```text
Execute synchronization
Run reconciliation
Invoke provider adapter
Retry job
Execute mutation
```

Technical terms may appear in advanced evidence views when they improve accuracy.

---

# 6. Universal State Machine Contract

Every asynchronous or consequential operation must have an explicit state model.

Minimum conceptual lifecycle:

```text
IDLE
 ↓
INTENT
 ↓
VALIDATING
 ↓
CONFIRMATION_REQUIRED
 ↓
ACCEPTED
 ↓
QUEUED
 ↓
RUNNING
 ↓
PROVIDER_RESPONSE
 ↓
VERIFYING
 ↓
VERIFIED
```

Failure and alternate states:

```text
VALIDATION_FAILED
CANCELLED
TIMED_OUT
RATE_LIMITED
PROVIDER_UNAVAILABLE
FAILED
PARTIALLY_SUCCEEDED
VERIFICATION_FAILED
CONFLICT
STALE
UNKNOWN
REQUIRES_ACTION
RETRYING
RETRY_EXHAUSTED
```

For every state, the implementation must define:

- user-facing label
- plain-language explanation
- visual treatment
- allowed actions
- prohibited actions
- next expected state
- whether polling/refetch occurs
- accessibility announcement
- audit requirement
- recovery path
- whether the user must act

Never represent:

```text
QUEUED = completed
SUBMITTED = verified
API accepted = inventory confirmed
```

---

# 7. Human State Vocabulary

Canonical presentation:

| Internal concept | User-facing presentation |
|---|---|
| QUEUED | Waiting to start |
| RUNNING | Updating |
| SUBMITTED | Update sent |
| VERIFYING | Checking the result |
| VERIFIED | Confirmed |
| FAILED | Update failed |
| PARTIAL | Some updates succeeded |
| STALE | May be out of date |
| CONFLICT | The numbers do not match |
| UNKNOWN | We could not confirm the current state |
| AUTHENTICATION_FAILURE | Connection needs attention |
| RATE_LIMIT | Sales channel is temporarily limiting requests |
| PROVIDER_OUTAGE | Sales channel is unavailable |
| MISSING_MAPPING | Product connection is missing |
| NEGATIVE_INVENTORY | Inventory is below zero |
| ACTION_REQUIRED | You need to review this |
| NO_ACTION | No action needed |

Use the simplest accurate language for the user's context.

---

# 8. Trust Presentation Contract

Inventory is the product's core trust surface.

Every material quantity MUST have a discoverable trust context containing:

```text
VALUE
SOURCE
LOCATION
AGE
OBSERVED TIME
RECEIVED TIME
VERIFICATION TIME
TRUST STATE
CAUSE / EXPLANATION where relevant
AVAILABLE ACTION
```

Example:

```text
17 available

Your inventory
Updated 2 minutes ago
Confirmed

[View breakdown]
```

External example:

```text
15 on Amazon

Amazon
Last checked 3 minutes ago
The number does not match your inventory

Your inventory: 17
Amazon: 15

[Review difference]
```

Do not use colour alone to communicate trust.

Do not display a stronger trust state than the underlying evidence permits.

Trust states:

```text
LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN
```

---

# 9. Inventory Truth Presentation

A displayed available quantity should be explainable.

Example:

```text
17 Available

20 On hand
-2 Reserved
-1 Safety stock
----------------
17 Available
```

Every material component should be inspectable where appropriate.

Causal navigation must support:

```text
Quantity
→ reservation
→ order
→ inventory event
→ channel update
→ verification
→ exception
→ resolution
```

The user must never be forced to reconstruct causality from unrelated screens.

---

# 10. Workflow-First UX Contract

Screens are not the primary unit of UX quality.

Critical workflows are.

The following end-to-end journeys MUST be explicitly designed and tested:

## 10.1 First-time setup

```text
Create account
→ organization
→ connect sales channel
→ establish connection
→ import/discover products
→ review mappings
→ establish inventory source
→ explain available inventory
→ perform first controlled update
→ verify
→ show successful completion
```

The user must understand what happened at every consequential step.

## 10.2 Daily inventory monitoring

```text
Open Overview
→ understand overall state
→ identify issue
→ open affected SKU
→ understand discrepancy
→ inspect evidence
→ act if appropriate
→ verify
→ return to healthy state
```

## 10.3 Inventory discrepancy

```text
Difference detected
→ show both quantities
→ show timestamps
→ identify trust state
→ explain known cause
→ state whether correction is safe
→ preview effect
→ require confirmation if consequential
→ perform operation
→ verify
→ show final state
→ record audit
```

## 10.4 Failed synchronization

```text
Failure
→ explain outcome
→ explain known cause
→ distinguish transient/permanent/user-action failure
→ offer recovery
→ retry where safe
→ verify
→ show result
```

## 10.5 Provider outage

```text
Provider unavailable
→ clearly show affected scope
→ preserve known last state
→ label it as potentially stale
→ prevent false verification
→ explain what is blocked
→ provide safe next step
→ automatically recover where allowed
→ verify when provider returns
```

## 10.6 Product mapping

```text
Unmapped product
→ explain what is missing
→ identify matching candidates
→ show confidence/evidence
→ allow user confirmation
→ preview consequence
→ save mapping
→ verify subsequent synchronization
```

---

# 11. Workflow State Tables

Every critical workflow must have a state table.

Minimum schema:

| Field | Requirement |
|---|---|
| User goal | Explicit |
| Entry points | Explicit |
| Preconditions | Explicit |
| Normal path | Explicit |
| Alternate paths | Explicit |
| Failure paths | Explicit |
| User decisions | Explicit |
| Consequences | Explicit |
| System feedback | Explicit |
| Recovery | Explicit |
| Audit | Explicit |
| Accessibility behavior | Explicit |
| Analytics events | Explicit |
| Exit criteria | Explicit |

A workflow cannot be considered UX-complete if only the happy path is specified.

---

# 12. Confirmation and Dangerous Operations

Before a consequential action, show:

```text
What will change
Where it will change
How many records/items are affected
What will not change
Why the system considers it safe or unsafe
Whether verification will occur
What happens if verification fails
```

Example:

```text
Update Amazon inventory?

Amazon currently shows: 15
Your confirmed inventory: 17

This will set Amazon to: 17

After the update, we will check Amazon again.
If Amazon still reports a different number, the update will be shown as unconfirmed.

[Cancel] [Update Amazon]
```

Never use vague confirmations such as:

```text
Are you sure?
Confirm action?
Proceed?
```

unless the specific action is already completely obvious.

---

# 13. Bulk Operations

Bulk actions must expose:

```text
Selection count
Scope
Included records
Excluded records
Expected effect
Risk
Progress
Success count
Failure count
Partial-result state
Recovery options
```

After execution:

```text
47 updated
3 need attention

[View 3 issues]
```

Never show a generic:

```text
Success
```

when only part of the operation succeeded.

---

# 14. Error UX Contract

Every error must answer:

```text
What happened?
Why did it happen?
Does it affect my inventory?
Do I need to act?
What can I do?
Can I retry?
What will happen if I retry?
```

Errors must be classified internally, but presented according to user consequence.

Example:

```text
Amazon could not be reached.

Your last confirmed Amazon quantity is 15.
It may now be out of date.

No inventory update was marked as confirmed.

[Try again] [View connection]
```

Avoid exposing raw stack traces, provider payloads, or infrastructure errors in the primary message.

Technical evidence belongs in an advanced details section.

---

# 15. Partial Failure Contract

Partial failure is a first-class state.

The interface MUST never collapse:

```text
47 succeeded
3 failed
```

into:

```text
50 completed
```

Required presentation:

```text
Completed with 3 issues

47 items updated successfully.
3 items could not be updated.

[Review 3 issues]
```

The user must be able to isolate the failed subset.

---

# 16. Empty States

Every empty state must explain:

```text
What is empty
Why it is empty
Whether this is expected
What the user can do next
```

Examples:

```text
No issues need your attention.

Your connected channels are currently reporting consistent inventory.
```

Not:

```text
No data.
```

For first-run states:

```text
Your inventory will appear here after you connect a sales channel.
```

---

# 17. Loading and Transitional States

Loading states must communicate what is happening when the operation is meaningful.

Prefer:

```text
Checking Amazon inventory…
```

over:

```text
Loading…
```

For longer operations:

```text
Checking 1,240 products
238 checked so far
```

Do not create artificial progress percentages when actual progress is unknown.

---

# 18. Information Density Contract

The product must optimize for operational clarity, not maximum data exposure.

For dense tables:

### Always visible
- identifying information
- primary quantity/state
- primary trust state
- primary action

### Conditionally visible
- secondary quantities
- timestamps
- channel details
- diagnostic information

### Progressive disclosure
- event IDs
- provider response details
- operation IDs
- technical timestamps
- raw payloads

### Full investigation
- event history
- causal chain
- audit records
- provider evidence

Never force users to open multiple panels merely to understand the basic state.

---

# 19. Table Interaction Contract

Every major operational table must define:

```text
Default columns
Column priority
Sortable columns
Filterable columns
Search behavior
Pagination
Selection behavior
Bulk actions
Row actions
Keyboard navigation
Responsive transformation
Empty state
Loading state
Error state
Partial failure state
Permission state
```

Tables must preserve the user's context when returning from a detail view where technically feasible.

Filters, sorting, search, and meaningful pagination state should be URL-addressable according to the frontend specification.

---

# 20. Mobile Contract

Mobile is not a compressed desktop layout.

For each screen define:

```text
Primary information
Secondary information
Critical action
Deferred information
Hidden information
Alternative interaction
```

On mobile:

- preserve critical trust state;
- preserve primary action;
- preserve failure visibility;
- preserve consequence information;
- avoid horizontal scrolling where a better transformation is possible;
- allow horizontal scrolling for genuinely tabular data when necessary;
- provide accessible alternatives to dense interactions.

No mobile implementation may hide a material inventory discrepancy merely because the screen is small.

---

# 21. Accessibility Contract

Target:

> **WCAG 2.2 AA**

The implementation must test, not merely declare, accessibility.

Required categories:

### Perceivable
- sufficient text and non-text contrast;
- information not conveyed by colour alone;
- meaningful alternatives for non-text content;
- semantic structure;
- reflow and zoom support;
- status communicated without relying solely on visual styling.

### Operable
- all functionality available by keyboard;
- visible focus;
- logical focus order;
- no keyboard traps;
- appropriate focus restoration;
- sufficient target size where applicable;
- alternatives to complex pointer interactions;
- reduced-motion support;
- predictable interaction timing.

### Understandable
- consistent terminology;
- predictable controls;
- clear labels;
- useful error messages;
- inline validation;
- instructions before high-risk actions;
- recovery guidance.

### Robust
- semantic HTML where possible;
- correct ARIA only where required;
- accessible names;
- correct relationships;
- correct live-region use;
- screen-reader verification;
- compatibility with supported assistive technologies.

### Complex widgets

Explicit keyboard and focus contracts are required for:

```text
Dialogs
Drawers
Menus
Comboboxes
Autocomplete
Tabs
Data tables
Selectable tables
Pagination
Command palette
Date pickers
Filters
Toasts
Live status indicators
Bulk-action controls
```

Asynchronous status changes that materially affect the user must be communicated accessibly.

---

# 22. Accessibility Release Gate

A feature cannot pass production UX acceptance if:

```text
Keyboard-only user cannot complete the critical workflow
OR
focus becomes lost or trapped
OR
a control lacks an accessible name
OR
state changes are inaccessible
OR
critical information is conveyed only through colour
OR
error recovery is inaccessible
OR
zoom/reflow causes loss of essential functionality
OR
screen-reader output materially contradicts visible state
```

Automated accessibility tests are necessary but insufficient.

Manual keyboard and assistive-technology testing is required for critical workflows.

---

# 23. Content Design System

All user-facing content must follow these rules.

## Titles
State the user's purpose or the current business state.

## Labels
Use familiar business terminology.

## Buttons
Describe the outcome.

## Errors
Explain consequence and recovery.

## Warnings
Explain risk before the user commits.

## Success
State what actually happened.

## Notifications
Do not merely announce an internal event; explain its relevance.

## Tooltips
Explain unfamiliar concepts, not obvious controls.

## Dates and times
Use locale-aware formatting while preserving enough precision for operational investigation.

## Unknown values
Use explicit language such as:

```text
Not available
Could not confirm
Not yet checked
```

Never use misleading zeroes.

## Missing values
Distinguish:

```text
0
Unknown
Not available
Not applicable
Not yet collected
```

These are not interchangeable.

---

# 24. Terminology Governance

Canonical user vocabulary remains:

| Technical/domain term | Preferred user-facing language |
|---|---|
| Synchronization | Update / Updating sales channels |
| Verification | Checking that the update worked |
| Reconciliation | Fixing / reviewing inventory differences |
| Exception | Issue |
| Mapping | Product connection |
| Channel account | Connected store/account |
| Stale | May be out of date |
| Conflict | The numbers do not match |
| Unknown | We could not confirm the current state |
| Queued | Waiting to start |
| Running | In progress / Updating |
| Correlation ID | Reference ID |
| Provider | Sales channel / connected service |

Terms such as SKU, reservation, allocation, and reconciliation may remain when they are familiar to the target audience.

Rule:

> **Use the simplest term that remains accurate in context.**

No screen may use different terms for the same concept without an explicit reason.

---

# 25. Heuristic Evaluation Contract

Every major release must be inspected against all ten usability heuristics.

For every major screen/workflow, reviewers must record:

```text
Heuristic
Observed behavior
Problem
Severity
Evidence
Recommendation
Resolution
Regression test
```

Severity:

```text
0 = no issue
1 = cosmetic/minor
2 = moderate usability problem
3 = serious problem
4 = critical/blocking problem
```

Severity 3 and 4 issues affecting critical workflows block production release until resolved or formally accepted by the product owner.

The score is an internal quality mechanism and must not be presented as a marketing claim.

---

# 26. Five-Second Comprehension Test

For every major screen, a representative user should be able to answer after a brief exposure:

```text
What is this screen?
What is the current state?
Is anything wrong?
What needs attention?
What is the primary action?
```

If users cannot answer these without explanation, the screen requires redesign.

---

# 27. Task Comprehension Test

Success is not merely clicking the correct button.

After completing a critical task, the participant should be able to explain:

```text
What they did
Why they did it
What changed
Whether the result is trustworthy
What they would do if it failed
```

A participant who completes a workflow by guessing does not count as a successful usability result.

---

# 28. Representative User Testing

Critical workflows must be tested with people who did not design the interface.

Test participants should represent relevant operator profiles, such as:

```text
New ecommerce operator
Experienced marketplace operator
Operations manager
Inventory specialist
Owner/administrator
```

Testing must capture:

```text
Task success
Critical errors
Misinterpretations
Time to meaningful understanding
Time to action
Recovery success
Confidence
Trust interpretation
Accessibility barriers
```

Do not manufacture usability results.

Before actual testing occurs, the status must remain:

```text
NOT YET VALIDATED
```

---

# 29. Critical Usability Scenarios

At minimum:

1. Determine whether inventory is healthy.
2. Find a product with a discrepancy.
3. Explain why two inventory numbers differ.
4. Determine which number is currently trusted.
5. Determine whether an update actually succeeded.
6. Fix a safe inventory difference.
7. Recognize when a difference is unsafe to auto-fix.
8. Investigate a failed synchronization.
9. Recover from a provider outage.
10. Find the order responsible for reserved inventory.
11. Connect a new sales channel.
12. Resolve an unmapped product.
13. Interpret a partial bulk-operation result.
14. Determine whether any action is required right now.
15. Trace a material quantity from current value to evidence and audit history.

---

# 30. Misinterpretation Testing

Test specifically for dangerous misunderstandings.

Examples:

```text
User thinks queued = completed
User thinks API accepted = verified
User thinks stale = zero
User thinks conflict = system error
User thinks 0 = unknown
User thinks update failed when it is still verifying
User thinks all bulk records succeeded when some failed
User thinks a recommendation is an automatic action
User thinks a provider outage means internal inventory is wrong
```

Any dangerous interpretation discovered during testing is a release-blocking UX defect until addressed.

---

# 31. Recovery Contract

Every critical failure must provide a recoverable path where recovery is possible.

The user must know:

```text
What failed
What was preserved
What may be affected
What can be retried
What cannot be retried
Whether retry is safe
What will happen next
```

Never force users to restart an entire workflow when a safe continuation is possible.

---

# 32. Help and Documentation Boundary

The interface answers:

> What is happening right now?

Documentation answers:

> How does this work?

The interface must not send users to documentation for basic state interpretation that can be explained locally.

Documentation should handle:

- advanced concepts
- configuration
- troubleshooting
- policies
- provider limitations
- API usage
- migration
- security
- billing

Contextual help should be task-specific and concise.

---

# 33. Search and Command UX

Search must distinguish:

```text
Product
SKU
Order
Issue
Channel
Warehouse
Supplier
Reference ID
```

Search results should reveal enough context to prevent ambiguous selection.

Command interfaces must:

- use human-readable commands;
- show consequences before material actions;
- respect permissions;
- never bypass confirmation rules;
- never make AI or command interpretation authoritative;
- preserve the same deterministic workflow as normal UI actions.

---

# 34. AI UX Contract

AI remains secondary to deterministic product truth.

AI may:

```text
summarize
explain
find relevant evidence
suggest actions
prepare actions
```

AI may not silently:

```text
change inventory
change source of truth
override permissions
mark an operation verified
hide uncertainty
invent provider state
```

Material AI action flow:

```text
Intent
→ Permission
→ Deterministic tool call
→ Validation
→ Confirmation if required
→ Mutation
→ Verification
→ Audit
```

The interface must distinguish:

```text
Known fact
Inference
Recommendation
Proposed action
Completed action
Verified result
```

---

# 35. Notification Contract

Notifications must be:

```text
Relevant
Actionable where appropriate
Non-duplicative
State-aware
Permission-aware
Dismissible where appropriate
Linked to evidence
```

Do not send multiple notifications for the same underlying incident merely because internal retries occurred.

Notifications must not create anxiety without actionable information.

---

# 36. Consistency Contract

The same concept must use the same:

```text
Name
Icon
Colour semantics
Status wording
Interaction pattern
Placement
Confirmation behavior
Error behavior
```

across the product.

A user should not have to relearn the same interaction on different screens.

---

# 37. Responsive Contract

Every major screen must be evaluated at:

```text
Mobile
Tablet
Desktop
Large desktop
```

Do not simply shrink desktop layouts.

For each breakpoint, explicitly define:

```text
Information priority
Navigation behavior
Table behavior
Action placement
Drawer behavior
Modal behavior
Filter behavior
Bulk-selection behavior
```

---

# 38. Performance Perception

UX performance includes perceived responsiveness.

The interface must provide appropriate feedback for:

```text
Immediate actions
Short requests
Long requests
Asynchronous jobs
Provider-dependent operations
Large data sets
Exports
Imports
Bulk actions
```

Do not leave the user staring at an unchanged interface while work is occurring.

Do not fake progress.

---

# 39. UX Analytics Contract

Critical UX events should be measurable without recording unnecessary sensitive information.

Measure where appropriate:

```text
Workflow started
Workflow completed
Workflow abandoned
Primary action used
Confirmation cancelled
Error encountered
Retry used
Recovery succeeded
Issue opened
Issue resolved
Bulk action partial failure
Search with no result
Mapping rejected
Help opened
```

Analytics must not become a substitute for direct usability testing.

---

# 40. Design QA Contract

Before a screen is accepted:

### Visual
- spacing consistent
- typography consistent
- hierarchy clear
- state styling consistent
- no visual clutter
- no misleading emphasis

### Interaction
- hover/focus/pressed/disabled states
- keyboard behavior
- loading
- empty
- error
- partial
- permission
- success
- stale/conflict/unknown

### Content
- terminology correct
- action labels outcome-oriented
- error messages actionable
- no unexplained jargon
- numbers and dates correct

### Responsive
- mobile
- tablet
- desktop
- large desktop

### Accessibility
- keyboard
- focus
- semantic structure
- accessible names
- screen reader
- contrast
- zoom/reflow
- reduced motion

---

# 41. Production UX Release Gate

A feature is NOT production-ready merely because:

```text
It renders.
API data loads.
Buttons work.
Unit tests pass.
```

A feature is production-ready only when:

```text
DOMAIN
✓ Correct business behavior

STATE
✓ All material states represented

TRUST
✓ No false confidence

INTERACTION
✓ Critical workflows are deterministic

USABILITY
✓ Users understand the workflow

COMPREHENSION
✓ Users understand what happened and why

ACCESSIBILITY
✓ WCAG 2.2 AA requirements applicable to the feature pass

RESPONSIVE
✓ Critical functionality survives supported screen sizes

CONTENT
✓ Language is accurate and understandable

ERROR RECOVERY
✓ Failure paths are usable

HEURISTIC REVIEW
✓ No unresolved critical/serious UX defects

TESTING
✓ Critical workflows tested with representative users

VISUAL QA
✓ Implementation matches the canonical design system

PERFORMANCE
✓ No unacceptable interaction or loading behavior

SECURITY
✓ Permissions and tenancy remain server-authoritative

OBSERVABILITY
✓ Material operations are diagnosable

AUDIT
✓ Material mutations are traceable
```

---

# 42. Release Blocking UX Defects

The following block production release for the affected feature:

```text
False inventory state
False verification state
Hidden material discrepancy
Hidden partial failure
Ambiguous consequential action
Unrecoverable critical workflow
Dangerous misleading status
Critical accessibility failure
Permission-sensitive action exposed incorrectly
User cannot determine whether a material mutation succeeded
User cannot determine which quantity is trustworthy
Critical error has no understandable recovery path
Mobile removes essential operational information
Technical terminology causes dangerous misunderstanding
```

---

# 43. Definition of Done

A screen is complete only when:

```text
The user understands its purpose.
The user understands the current state.
The user understands what matters.
The user knows whether action is required.
The user understands the primary action.
The user understands its consequence.
The user can tell whether it worked.
The user can recover from failure.
The user can access deeper evidence.
The user is not required to understand system architecture.
The interface remains usable with keyboard and assistive technology.
The interface remains usable across supported screen sizes.
The terminology is consistent.
The state is truthful.
The evidence is traceable.
```

---

# 44. What This Contract Does Not Pretend to Solve

This document is a specification and quality contract.

It cannot itself prove:

```text
Actual usability with real users
Actual accessibility with real assistive technologies
Actual visual quality of the implemented UI
Actual mobile quality on physical devices
Actual performance under production load
Actual provider behavior
Actual integration reliability
Actual copy comprehension across every language
Actual customer support effectiveness
```

Those require implementation, testing, observation, and evidence.

Therefore:

> **Unvalidated requirements must remain explicitly marked as unvalidated.**

Never convert “specified” into “proven.”

---

# 45. Current Coverage Status

## Covered by this revision

- Human mental model
- Progressive disclosure
- Screen comprehension
- Primary action hierarchy
- Full asynchronous state model
- Trust presentation
- Inventory explainability
- End-to-end critical workflows
- Workflow state tables
- Confirmation design
- Bulk operations
- Partial failures
- Error recovery
- Empty/loading states
- Information density
- Table behavior
- Mobile principles
- WCAG 2.2 AA target
- Keyboard/focus contract
- Complex widget accessibility
- Content design
- Terminology governance
- Heuristic evaluation
- Five-second comprehension
- Task comprehension
- Misinterpretation testing
- Representative user testing framework
- Recovery testing
- Help/documentation boundary
- Search/command UX
- AI interaction safety
- Notifications
- Cross-product consistency
- Responsive behavior
- Performance perception
- UX analytics
- Design QA
- Production release gates
- Release-blocking UX defects
- Explicit distinction between specified and validated

## Already covered by companion specifications

- Domain model
- Inventory ledger
- Reservations
- Orders
- Synchronization architecture
- Provider integrations
- Verification rules
- Reconciliation rules
- Exceptions
- Audit
- Billing
- Tenancy
- RBAC
- Security architecture
- Database architecture
- Infrastructure
- API architecture
- Frontend architecture
- Component architecture
- Visual design tokens
- Application information architecture
- SEO/GEO
- Public website
- Observability
- Deployment
- Migration

---

# 46. Not Yet Proven / Not Covered by Documentation Alone

The following remain implementation or empirical work, not specification gaps:

### 46.1 Real user validation
Actual representative users have not yet validated the workflows.

Status:

**NOT YET VALIDATED**

### 46.2 Real accessibility audit
Automated and manual testing with actual keyboard-only and assistive-technology users remains necessary.

Status:

**NOT YET VALIDATED**

### 46.3 Physical-device responsive QA
Real phones, tablets, browsers, viewport combinations, and touch interaction require implementation testing.

Status:

**NOT YET VALIDATED**

### 46.4 Actual visual implementation
The specification cannot prove that Anti Gravity's generated UI visually conforms to the design system.

Status:

**NOT YET VALIDATED**

### 46.5 Production performance
Actual performance under realistic tenant sizes, large SKU catalogs, large tables, concurrent operations, and network variability requires benchmarking.

Status:

**NOT YET VALIDATED**

### 46.6 Provider-specific UX behavior
Shopify/Amazon/etc. behavior must be verified against real provider environments and their actual failure/rate-limit semantics.

Status:

**NOT YET VALIDATED**

### 46.7 Localization
If internationalization is later required, translations, pluralization, date/time formats, number formats, currencies, text expansion, RTL, and locale-specific comprehension need dedicated validation.

Status:

**NOT YET SPECIFIED FOR FULL INTERNATIONALIZATION**

### 46.8 Formal usability benchmark numbers
This contract defines what to measure but does not invent arbitrary success percentages before baseline research.

Status:

**BENCHMARKS TO BE ESTABLISHED AFTER BASELINE TESTING**

### 46.9 Final content audit
The vocabulary contract exists, but the implemented product must still undergo a complete screen-by-screen content audit.

Status:

**NOT YET VALIDATED**

### 46.10 Production incident UX
Real incident data will eventually reveal failure modes that cannot be completely predicted in advance.

Status:

**CONTINUOUSLY VALIDATED AFTER LAUNCH**

---

# 47. Mandatory Anti Gravity Operating Rule

For every user-facing feature, Anti Gravity must evaluate:

```text
1. Does it work?
2. Is the state truthful?
3. Is the interaction safe?
4. Is it accessible?
5. Is it understandable?
6. Is the next action obvious?
7. Can the user predict the consequence?
8. Can the user tell whether it worked?
9. Can the user recover from failure?
10. Can the user investigate when necessary?
11. Does the implementation remain consistent with the rest of the product?
12. Has the feature passed the applicable production UX gates?
```

If the answer to any critical question is no:

```text
DO NOT MARK THE FEATURE PRODUCTION READY.
```

Do not compensate for a confusing workflow by adding more technical information.

First simplify the user's mental model.

Then progressively expose evidence.

---

# 48. Final Product Principle

The product must feel like a knowledgeable operations specialist explaining:

```text
Here's what is happening.

Here's what we know.

Here's what we do not know.

Here's why.

Here's what matters.

Here's what you need to do.

Here's what will happen if you do it.

Here's how we will check it.

Here's the result.
```

It must never feel like:

```text
Here are 40 fields.
Figure it out.
```

The deepest product requirement remains:

> **Build a system that is technically rigorous underneath and obvious on the surface.**

---

# 49. Canonical Quality Model

The final product-quality model is:

```text
CORRECT
    ↓
TRUTHFUL
    ↓
UNDERSTANDABLE
    ↓
SAFE
    ↓
ACCESSIBLE
    ↓
EFFICIENT
    ↓
RECOVERABLE
    ↓
TRACEABLE
    ↓
VALIDATED
    ↓
PRODUCTION READY
```

A feature does not skip levels.

A feature that is technically correct but confusing is not UX-complete.

A feature that is understandable but gives false inventory confidence is not acceptable.

A feature that works visually but fails accessibility is not production-ready.

A feature that passes automated tests but has not undergone required human validation must remain explicitly marked as unvalidated.

---

# 50. Final Canonical Specification Stack

The product should now be treated as one coordinated system:

```text
01 ENGINEERING SPECIFICATION V2
Backend, domain, data, security, integrations
                 ↓
02 PRODUCT DESIGN SYSTEM
IA, visual language, interaction architecture
                 ↓
03 FRONTEND IMPLEMENTATION SPECIFICATION
Routes, components, states, API/UI contracts
                 ↓
04 HUMAN-CENTERED UX CONTRACT V2
Comprehension, workflows, accessibility,
trust, usability, validation, release gates
                 ↓
IMPLEMENTATION
                 ↓
EMPIRICAL VALIDATION
                 ↓
PRODUCTION RELEASE
```

The final distinction is critical:

```text
SPECIFIED ≠ IMPLEMENTED
IMPLEMENTED ≠ VERIFIED
VERIFIED ≠ USER-VALIDATED
USER-VALIDATED ≠ PRODUCTION-READY
```

All applicable stages must be evidenced before the product is called production-ready.

---

# 51. Reference Basis

This revision is informed by:

- ISO 9241-210:2019 — Human-centred design for interactive systems.
- W3C Web Content Accessibility Guidelines (WCAG) 2.2.
- W3C WAI accessibility guidance.
- Nielsen Norman Group — Ten Usability Heuristics for User Interface Design.

These references provide supporting standards and principles; they do not replace the product-specific requirements in this contract.
