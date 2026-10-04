# Multichannel Inventory Control Platform
# Master Orchestration & Authority Contract v1.0

**Status:** Canonical orchestration layer  
**Purpose:** Coordinate the existing canonical specifications without replacing, merging, weakening, or silently rewriting them.  
**Applies to:** Google Antigravity implementation, validation, evidence, and production release.  
**Version:** 1.0  
**Date:** 2026-09-26

---

# 0. EXECUTIVE DIRECTIVE

The platform is governed by the following canonical source specifications:

1. `multichannel_inventory_control_final_engineering_spec_v2.md`
2. `inventory_truth_reconciliation_platform_canonical_ui_ux_design_system_frontend_engineering_specification.md`
3. `inventory_truth_reconciliation_platform_canonical_frontend_design_implementation_specification_v1.md`
4. `inventory_truth_reconciliation_platform_human_centered_ux_comprehension_contract_v2_production_revision.md`
5. `inventory_truth_reconciliation_platform_canonical_production_ux_implementation_validation_gate_v1.md`

This document is a **master orchestration and authority contract** above those five documents.

It does **not** replace them.

It does **not** merge them into one specification.

It does **not** remove their substantive requirements.

Its purpose is to answer the questions that become ambiguous when the five documents are supplied together:

- Which document is authoritative for which decision?
- What happens when two documents describe the same requirement?
- Which implementation sequence controls?
- Which completion vocabulary controls?
- Which state and terminology definitions control?
- When should Anti Gravity read the documents?
- When should it stop and ask for resolution?
- What evidence is required before a feature can advance?
- What does “production-ready” mean across all layers?

If a source specification contains a more specific requirement than this document, the specific source requirement remains binding.

---

# 1. GOVERNING PRINCIPLE

Treat the five source specifications as **one coordinated contract with domain-specific authorities**, not as five equal instruction streams.

The correct mental model is:

```text
                    MASTER ORCHESTRATION
                 AUTHORITY / PRECEDENCE / FLOW
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     ENGINEERING      PRODUCT DESIGN    FRONTEND
     DOMAIN TRUTH     VISUAL / IA       IMPLEMENTATION
          │                │                │
          └────────────────┼────────────────┘
                           │
                    HUMAN-CENTERED UX
             COMPREHENSION / HUMAN OPERATION
                           │
                           ▼
                    VALIDATION GATE
              EVIDENCE / ACCEPTANCE / RELEASE
```

The documents are complementary layers.

They must not be interpreted as competing versions of the same specification.

---

# 2. AUTHORITY AND PRECEDENCE

## 2.1 Authority is domain-specific

| Decision | Authoritative source |
|---|---|
| Domain model | Engineering Specification |
| Inventory truth | Engineering Specification |
| Inventory mutation rules | Engineering Specification |
| Concurrency / transactions | Engineering Specification |
| Orders / reservations / ledger semantics | Engineering Specification |
| Synchronization semantics | Engineering Specification |
| Provider capabilities and behavior | Engineering Specification + provider-specific implementation evidence |
| Reconciliation rules | Engineering Specification |
| Security / tenancy / server authorization | Engineering Specification + security requirements |
| Backend/API contracts | Engineering Specification and canonical API/contracts |
| Information architecture | Product Design System |
| Visual language / design tokens | Product Design System |
| Component intent | Product Design System |
| Interaction philosophy | Product Design System |
| Frontend architecture | Frontend Implementation Specification |
| Routes | Frontend Implementation Specification |
| Component contracts | Frontend Implementation Specification |
| UI state handling | Frontend Implementation Specification |
| Data-to-screen mapping | Frontend Implementation Specification |
| Frontend permission behavior | Frontend Implementation Specification, subject to server authority |
| Human-facing language and comprehension | Human-Centered UX Contract |
| Progressive disclosure | Human-Centered UX Contract + Product Design System |
| Human workflow quality | Human-Centered UX Contract |
| Human validation | Human-Centered UX Contract + Validation Gate |
| Accessibility release gate | Human-Centered UX Contract + Validation Gate |
| Usability validation | Validation Gate |
| Visual QA | Product Design System + Validation Gate |
| Production acceptance | Validation Gate, subject to all applicable source requirements |

No document may redefine another document's authoritative domain merely because it contains related wording.

---

# 3. CONFLICT RESOLUTION

When two requirements appear to conflict:

## Step 1 — Classify the conflict

Determine whether it concerns:

```text
DOMAIN TRUTH
SECURITY / AUTHORIZATION
PROVIDER CAPABILITY
DATA / API CONTRACT
FRONTEND ARCHITECTURE
INFORMATION ARCHITECTURE
VISUAL DESIGN
HUMAN COMPREHENSION
VALIDATION / RELEASE
```

## Step 2 — Apply the authority table

Use the authoritative source for that domain.

## Step 3 — Check specificity

A more specific requirement governs a more general requirement within the same authority domain.

Example:

```text
General:
"Show synchronization status."

Specific:
"Verification must remain distinct from acknowledgement."
```

The specific requirement governs the implementation of the general requirement.

## Step 4 — Preserve the stricter safety/truthfulness requirement

Where requirements are genuinely compatible but one is stricter about:

- truthfulness
- verification
- security
- auditability
- failure visibility
- permission enforcement
- data integrity

the stricter requirement must not be weakened.

## Step 5 — Do not silently invent a compromise

If a true contradiction remains after applying authority and specificity:

```text
STOP
DOCUMENT THE CONFLICT
IDENTIFY THE AFFECTED REQUIREMENTS
PROPOSE THE MINIMUM CHANGE REQUIRED
WAIT FOR RESOLUTION
```

Do not choose whichever instruction is easiest to implement.

Do not delete one requirement merely to make implementation easier.

---

# 4. SOURCE-SPECIFICATION HIERARCHY

The five documents have different jobs.

## 4.1 Engineering Specification

Defines the system itself:

```text
domain
business rules
data integrity
inventory truth
ledger
reservations
orders
synchronization
providers
verification
reconciliation
exceptions
audit
security
tenancy
operations
infrastructure
production architecture
```

This is the authority for what the platform **is and does**.

## 4.2 Product Design System

Defines the product's visual and interaction architecture:

```text
information architecture
design language
visual hierarchy
tokens
components
interaction patterns
responsive principles
screen intent
progressive disclosure
causal navigation
```

This is the authority for how the product **is designed and visually organized**.

## 4.3 Frontend Implementation Specification

Defines how the frontend is implemented:

```text
routes
frontend architecture
state boundaries
component contracts
screen contracts
data-to-screen mapping
URL state
permissions presentation
loading / empty / error / partial states
analytics
frontend testing
visual regression
frontend definition of done
```

This is the authority for how the frontend **is built**.

## 4.4 Human-Centered UX Contract

Defines how the system must be understandable and safely operated:

```text
human mental model
comprehension
business language
progressive disclosure
workflow clarity
consequence awareness
trust presentation
accessibility
usability
human validation
UX quality
```

This is the authority for how the product **must be understood and operated by people**.

It may determine presentation and interaction quality.

It must not redefine domain truth.

## 4.5 Production UX Implementation & Validation Gate

Defines whether implementation has sufficient evidence to advance through acceptance and release:

```text
feature acceptance
screen acceptance
workflow acceptance
UX inspection
accessibility
responsive QA
content QA
trust QA
error / recovery QA
heuristic review
user validation
visual QA
automated testing
production readiness
evidence
```

This is the authority for **acceptance and release gating**.

---

# 5. ONE CANONICAL LIFECYCLE

The platform uses one lifecycle vocabulary.

```text
SPECIFIED
    ↓
IMPLEMENTED
    ↓
VERIFIED
    ↓
USER-VALIDATED
    ↓
PRODUCTION-READY
```

These are not interchangeable.

## SPECIFIED

The applicable requirements and dependencies are known.

The feature has an implementation contract.

## IMPLEMENTED

Required code and behavior exist.

This does not mean the behavior has been proven correct.

## VERIFIED

The implementation has passed the applicable technical, automated, integration, provider, security, or other required verification checks and evidence exists.

## USER-VALIDATED

Required human validation has been performed for the applicable feature/workflow and findings have been addressed or explicitly accepted under the validation gate.

For non-user-facing technical components, this stage may be **NOT APPLICABLE**.

Do not fabricate user-validation status.

## PRODUCTION-READY

All applicable source requirements and release gates have passed.

This includes, where applicable:

```text
domain correctness
truthfulness
security
permissions
failure handling
recovery
accessibility
responsive behavior
content
visual QA
E2E
observability
audit
performance
provider validation
user validation
operational readiness
rollback / recovery
evidence
```

### Forbidden shortcut

Never use:

```text
DONE
COMPLETE
FINISHED
```

as a lifecycle state.

If such wording appears in a source document as informal prose, interpret it through the canonical lifecycle above.

---

# 6. DEFINITION OF DONE: HOW TO INTERPRET DUPLICATES

The source specifications contain several layer-specific “definition of done” or quality gates.

They are **not competing lifecycle definitions**.

Interpret them as follows:

```text
Engineering DoD
    = domain / system acceptance

Frontend DoD
    = frontend implementation acceptance

Human UX quality model
    = human-experience acceptance

Validation Gate
    = cross-layer release acceptance
```

The final release state is controlled by the Validation Gate and requires all applicable lower-level requirements to have passed.

Therefore:

```text
Engineering DoD passing
        ≠
Frontend DoD passing
        ≠
UX quality passing
        ≠
Production-ready
```

All applicable gates must pass.

---

# 7. IMPLEMENTATION ORDER: TWO SEQUENCES, ONE DEPENDENCY MODEL

The specifications contain:

1. a **system/engineering implementation order**, and
2. a **frontend implementation sequence**.

They are not competing sequences.

## 7.1 Master engineering dependency order

The Engineering Specification's implementation order remains authoritative:

```text
1. Repository
2. Infrastructure
3. Database
4. Authentication
5. Organizations / RBAC
6. Domain models
7. Inventory ledger
8. Reservations
9. Orders
10. Job system
11. Synchronization framework
12. Shopify adapter
13. Shopify verification
14. Amazon adapter
15. Amazon verification
16. Reconciliation
17. Exception inbox
18. Audit system
19. Billing
20. Notifications
21. Dashboard
22. Product/inventory UI
23. Integration UI
24. Testing
25. Observability
26. Security hardening
27. Public website
28. SEO/GEO
29. Migration
30. Production deployment
```

Do not reorder this dependency chain merely for visual convenience.

## 7.2 Frontend sequence is subordinate to backend/domain prerequisites

The frontend sequence governs frontend work **within the dependency model**:

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

This sequence does not authorize disconnected mock screens.

Frontend implementation may proceed in parallel with backend work only where the required contract is stable and the implementation does not fabricate production behavior.

The dependency rule remains:

```text
NO FRONTEND ASSUMPTION MAY OVERRIDE DOMAIN TRUTH.
NO MOCK MAY BE PRESENTED AS PRODUCTION FUNCTIONALITY.
```

---

# 8. FEATURE IMPLEMENTATION LOOP

Every feature follows this loop:

```text
SPECIFICATION
      ↓
DEPENDENCY CHECK
      ↓
FEATURE CONTRACT
      ↓
DOMAIN / API PREREQUISITES
      ↓
FRONTEND IMPLEMENTATION
      ↓
AUTOMATED TESTS
      ↓
VISUAL / INTERACTION INSPECTION
      ↓
ACCESSIBILITY / RESPONSIVE QA
      ↓
UX / HEURISTIC REVIEW
      ↓
USER VALIDATION WHERE APPLICABLE
      ↓
OBSERVABILITY / AUDIT
      ↓
EVIDENCE
      ↓
PRODUCTION GATE
```

The loop is iterative.

A failed validation step sends the feature back to the relevant earlier stage.

Example:

```text
Visual QA failure
    ↓
frontend/design correction
    ↓
retest
```

Example:

```text
User misunderstanding
    ↓
UX correction
    ↓
technical regression check
    ↓
revalidation
```

Example:

```text
Domain correctness failure
    ↓
engineering/domain correction
    ↓
API/frontend regression
    ↓
reverification
```

---

# 9. READ ONLY WHAT IS RELEVANT — BUT READ THE WHOLE CONTRACT BEFORE STARTING

Anti Gravity must not repeatedly reinterpret the entire corpus for every small UI change.

For a feature:

## First

Read this Master Orchestration Contract.

## Then

Read the relevant sections of all applicable source specifications.

At minimum determine:

```text
engineering dependency
domain truth
permissions
provider behavior
design requirements
frontend contract
human UX requirements
validation gates
```

## Then

Implement only after the feature contract is mapped.

A feature-specific implementation must not rely on a partial reading that omits an applicable source.

---

# 10. FEATURE CONTRACT

Before implementation, create an internal feature contract containing:

```text
Feature:
User goal:
Primary user question:

Engineering source sections:
Product-design source sections:
Frontend source sections:
Human-UX source sections:
Validation-gate sections:

Domain dependencies:
API dependencies:
Provider dependencies:

Route:
Permissions:
Primary entity:
Primary query:

Primary action:
Secondary actions:
Dangerous actions:

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

Responsive behavior:
Accessibility behavior:

Human-facing terminology:
Trust state:
Freshness requirements:

Analytics:
Audit:
Observability:

Automated tests:
E2E tests:
User validation:
Visual QA:

Known limitations:
Open conflicts:
Acceptance evidence:
```

No production screen should bypass this mapping.

---

# 11. CANONICAL STATE OWNERSHIP

The specifications describe many states. To prevent duplication or contradictory meanings, use the following ownership model.

## 11.1 Domain state

Owned by Engineering.

Examples:

```text
order state
reservation state
inventory state
job state
reconciliation classification
exception lifecycle
provider connection state
```

The frontend may display these states but must not redefine them.

## 11.2 Trust / freshness presentation

The underlying observation and verification facts are owned by Engineering.

The user-facing presentation of those facts is owned jointly by Frontend + Human UX, using the Design System.

Canonical trust states include:

```text
LIVE
VERIFIED
STALE
CONFLICT
UNKNOWN
```

The UI must not invent additional meanings that contradict the source model.

## 11.3 UI state

Owned by Frontend.

Examples:

```text
drawer open
dialog open
expanded row
selected rows
temporary form state
tab selection
keyboard state
```

UI state must never be mistaken for domain state.

---

# 12. CANONICAL TERMINOLOGY RULE

The same domain concept must not acquire different user-facing names across screens.

Maintain a terminology registry with:

```text
Domain term
Internal meaning
User-facing term
Definition
Allowed synonyms
Forbidden alternatives
Context
```

Example:

```text
Internal:
verification

User-facing:
Verified

Do not create another status label that implies the same thing.
```

Technical terminology may appear where necessary for investigation, but ordinary business language must be preferred when it communicates the same meaning safely.

The Human-Centered UX Contract controls human-facing language.

The Engineering Specification controls the underlying meaning.

---

# 13. TRUST AND TRUTHFULNESS ARE CROSS-LAYER INVARIANTS

The following are non-negotiable across every document:

```text
Never represent an unverified external write as verified.

Never represent a queued operation as completed.

Never fabricate provider state.

Never silently replace unavailable provider data with fake data.

Never hide material partial failure.

Never silently resolve material conflicts.

Never allow frontend state to override server authority.

Never mutate inventory outside approved domain APIs.

Never imply a result stronger than the evidence supports.
```

The interface must distinguish, where applicable:

```text
what the system knows
what was observed
what was submitted
what was verified
what is stale
what is unknown
what conflicts
what action is available
```

---

# 14. ASYNCHRONOUS WORK CONTRACT

All long-running or external synchronization work must be treated as asynchronous.

The user must be able to distinguish:

```text
NOT STARTED
QUEUED
RUNNING
SUCCEEDED / VERIFIED
FAILED
PARTIAL
BLOCKED / ACTION REQUIRED
```

Do not collapse:

```text
request accepted
operation completed
external state verified
```

into one success state.

A mutation acknowledgement is not verification.

The exact domain/job states remain governed by Engineering.

The user-facing explanation is governed by Human UX and Frontend.

---

# 15. FAILURE AND PARTIAL-FAILURE CONTRACT

Failure is a first-class state.

Every applicable screen/workflow must account for:

```text
loading
empty
success
error
partial
permission denied
stale
conflict
unknown
```

Do not hide failure by:

```text
showing stale data without labeling it
showing cached data as current
showing mock data
showing partial success as total success
removing failed records from view
```

Recovery must explain:

```text
what happened
what is affected
what the system tried
what remains unresolved
what the user can do
what will happen next
```

---

# 16. PERMISSIONS AND SECURITY

Permissions are not a frontend concern alone.

The governing rule is:

```text
SERVER AUTHORIZATION = SECURITY BOUNDARY
FRONTEND PERMISSION PRESENTATION = USER EXPERIENCE
```

The frontend may hide or disable unavailable actions for clarity.

The server must still enforce authorization.

Never treat:

```text
button hidden
button disabled
route inaccessible in UI
```

as proof that an operation is secure.

Tenant isolation, RBAC, OAuth security, webhook security, secrets, and material mutations remain governed by Engineering/Security requirements.

---

# 17. ACCESSIBILITY

The product target remains:

```text
WCAG 2.2 AA
```

Accessibility is a release requirement.

Ownership:

```text
Design System
    ↓
accessible component intent / visual requirements

Frontend
    ↓
semantic implementation / keyboard / focus / ARIA

Human UX
    ↓
comprehension / interaction accessibility

Validation Gate
    ↓
verification and release evidence
```

Do not treat accessibility as a final visual-polish step.

---

# 18. RESPONSIVE BEHAVIOR

Responsive implementation belongs to Frontend, constrained by the Product Design System and Human UX requirements.

The product must preserve information priority rather than simply shrink desktop layouts.

At minimum validate:

```text
desktop
tablet
mobile
```

Critical information must not disappear merely because viewport space is limited.

Responsive behavior must preserve:

```text
truth
trust state
important evidence
primary action
dangerous-action protection
failure visibility
recovery path
```

---

# 19. VISUAL SYSTEM OWNERSHIP

The Product Design System is the source of truth for:

```text
design tokens
typography
spacing
color semantics
status styling
elevation
radius
icons
components
tables
cards
dialogs
drawers
forms
charts
data density
visual hierarchy
```

The Frontend Specification defines how those primitives are implemented.

The Human UX Contract defines whether the resulting presentation is understandable and operable.

The Validation Gate verifies conformance.

Do not create ad-hoc visual systems for individual features.

---

# 20. CAUSAL NAVIGATION

The product's central explanatory model remains:

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

Important entities should remain causally connected:

```text
quantity
  ↓
inventory state
  ↓
reservation / order / event
  ↓
synchronization
  ↓
verification
  ↓
exception / reconciliation
  ↓
audit
```

Do not create disconnected dashboards that show numbers without a path to explanation.

---

# 21. USER VALIDATION: WHEN IT IS REQUIRED

User validation is mandatory where the Validation Gate requires it, especially for critical user workflows.

Minimum critical workflows include:

```text
First-time setup
Connect channel
Product mapping
First inventory synchronization
Inventory discrepancy
Safe correction
Unsafe correction
Synchronization failure
Provider outage
Partial synchronization
Order/reservation investigation
Negative inventory
Audit investigation
Bulk operation
```

For purely internal technical components with no direct user interaction:

```text
USER-VALIDATED = NOT APPLICABLE
```

For applicable user-facing workflows not yet tested:

```text
USER-VALIDATED = NO
```

Never invent validation evidence.

Automated tests do not prove usability.

---

# 22. VALIDATION EVIDENCE

Evidence must correspond to the claim being made.

Examples:

```text
Unit test
    proves the tested unit behavior.

Integration test
    proves the tested integration behavior.

E2E
    proves the tested end-to-end path.

Provider sandbox/live evidence
    proves the documented provider interaction at that evidence level.

Security test
    proves the tested security behavior.

Accessibility test
    proves the tested accessibility criteria.

Visual regression
    proves the tested visual states.

User validation
    provides evidence about human comprehension and operation.

Production monitoring
    provides evidence about live operational behavior.
```

Do not use weaker evidence to claim stronger readiness.

For example:

```text
mock-provider test
    ≠
real marketplace production readiness
```

---

# 23. FEATURE ACCEPTANCE RECORD

Every production-bound feature must maintain:

```text
Feature:
Owner:
Source specifications:
Lifecycle status:

Domain requirements:
Frontend requirements:
UX requirements:
Accessibility:
Responsive:
Content:
Security:
Observability:
Audit:

Known limitations:
Open defects:

Automated evidence:
Integration/provider evidence:
E2E evidence:
Accessibility evidence:
Visual evidence:
User-validation evidence:
Performance evidence:
Security evidence:

Release decision:
Release version:
Date:
```

Lifecycle status must use the canonical vocabulary.

---

# 24. SCREEN ACCEPTANCE

Every major screen must define:

```text
Purpose
Primary user question
Route
Permissions
Primary data
Primary action
Secondary actions
Dangerous actions
Information hierarchy
URL state

Loading
Empty
Success
Error
Partial
Permission
Stale
Conflict
Unknown

Responsive behavior
Accessibility behavior
Analytics
E2E acceptance
```

A material state must not be left undefined.

---

# 25. WORKFLOW ACCEPTANCE

Every critical workflow must define:

```text
User goal
Entry points
Preconditions
Normal path
Alternate path
Failure paths
User decisions
Consequences
System feedback
Recovery
Audit
Accessibility
Analytics
Exit criteria
```

The workflow must make consequences visible before material commitment.

---

# 26. DANGEROUS OPERATIONS

For dangerous or material mutations:

```text
Explain current state
        ↓
Explain intended change
        ↓
Explain scope
        ↓
Explain consequences
        ↓
Confirm
        ↓
Execute
        ↓
Show actual result
        ↓
Verify where applicable
        ↓
Audit
```

Do not turn a dangerous action into a one-click opaque mutation merely because the backend can execute it.

Bulk operations must explicitly communicate:

```text
scope
selection
safety checks
excluded items
queued state
running state
partial results
failed items
verification
audit
```

---

# 27. PUBLIC WEBSITE / SEO / GEO BOUNDARY

Public product surfaces remain governed by Engineering and Product Design requirements.

The public website must not be confused with the authenticated operational application.

Use the source requirements for:

```text
public rendering
SEO architecture
crawlability
documentation
pricing
legal pages
structured information
GEO requirements
protected/noindexed app routes
```

Do not expose tenant or private operational data through public pages.

SEO/GEO optimization must not weaken security, truthfulness, or application boundaries.

---

# 28. AI BOUNDARY

AI remains secondary to deterministic system truth.

AI may assist with:

```text
investigation
explanation
navigation
summarization
recommended actions
```

AI must not become an alternate inventory source of truth.

For AI-driven actions:

```text
intent
 ↓
permission
 ↓
deterministic tool call
 ↓
validation
 ↓
confirmation when required
 ↓
mutation
 ↓
verification
 ↓
audit
```

AI must not bypass normal domain APIs, permissions, verification, or audit requirements.

---

# 29. OBSERVABILITY AND AUDIT

Observability is not a substitute for auditability.

Use:

```text
observability
    = system health / operational behavior

audit
    = material business action history
```

Material inventory and reconciliation actions must remain explainable and auditable.

External synchronization must retain the evidence required by Engineering, including appropriate provider identifiers, timestamps, correlation, verification, and failure context.

---

# 30. ANTI GRAVITY OPERATING CONTRACT

Before implementing any feature:

1. Read this Master Orchestration Contract.
2. Identify the feature's authoritative source sections.
3. Check dependencies against the Engineering implementation order.
4. Create the feature contract.
5. Resolve any actual specification conflict before implementation.
6. Implement domain/backend prerequisites.
7. Implement frontend behavior against real contracts.
8. Implement all material states.
9. Apply the canonical design system.
10. Apply human-centered comprehension requirements.
11. Implement permissions through server authority.
12. Implement observability and audit where required.
13. Add automated tests.
14. Run relevant E2E/provider/security/accessibility tests.
15. Perform visual and responsive QA.
16. Perform UX/heuristic inspection.
17. Perform user validation where applicable.
18. Capture evidence.
19. Evaluate the Production Readiness Gate.
20. Only then advance the lifecycle state.

Never report production readiness merely because the UI exists.

---

# 31. ANTI GRAVITY NON-NEGOTIABLES

Never:

```text
Build fake production functionality and call it real.

Use mock data as production data.

Represent an unverified write as verified.

Represent a queued job as completed.

Hide partial failure.

Hide stale/conflict/unknown state when material.

Invent provider capabilities.

Assume a provider behavior that has not been established.

Use frontend permissions as the security boundary.

Mutate inventory outside the canonical inventory domain.

Duplicate domain logic across layers.

Create different meanings for the same state.

Create ad-hoc terminology for existing concepts.

Silently resolve a real specification conflict.

Delete requirements to make implementation easier.

Skip failure states.

Skip empty/loading/permission states.

Treat automated tests as proof of usability.

Treat visual similarity as proof of design-system compliance.

Treat accessibility as polish.

Declare user validation without actual users/evidence.

Declare production readiness without evidence.

Skip verification.

Hide important information on mobile.

Allow AI to bypass deterministic domain controls.
```

---

# 32. HOW TO HANDLE IMPLEMENTATION PARALLELISM

Parallel implementation is allowed only when dependencies are satisfied.

Safe example:

```text
Backend contract stable
        ↓
Frontend can implement against the contract
        ↓
No fabricated production state
```

Unsafe example:

```text
Backend behavior unknown
        ↓
Frontend invents expected provider behavior
```

Unsafe example:

```text
Verification semantics unresolved
        ↓
UI labels an operation "Verified"
```

When work is parallelized, each workstream must still obey its authority boundary.

Parallelism must never create competing sources of truth.

---

# 33. CHANGE CONTROL

When changing a canonical requirement:

## Minor implementation clarification

May be handled by Anti Gravity if it:

- does not change domain behavior;
- does not weaken a MUST;
- does not alter security;
- does not alter provider semantics;
- does not change user-facing meaning;
- does not change the lifecycle;
- does not remove an acceptance gate.

Record the clarification.

## Material change

Stop and request explicit resolution if the proposed change affects:

```text
domain truth
inventory semantics
security
tenant isolation
provider capabilities
reconciliation behavior
verification semantics
permissions
audit requirements
production gates
user safety
canonical lifecycle
```

Do not silently modify the source specification.

---

# 34. REGRESSION RULE

A change that fixes one layer must be checked against dependent layers.

Examples:

```text
Engineering change
    → API contract
    → frontend
    → UX states
    → tests
    → evidence

Frontend change
    → design system
    → UX comprehension
    → accessibility
    → responsive behavior
    → E2E

UX wording change
    → terminology consistency
    → trust interpretation
    → workflow comprehension
    → content QA

Provider behavior change
    → synchronization
    → verification
    → reconciliation
    → exceptions
    → UI trust states
```

Do not declare a local fix complete until affected dependent layers have been checked.

---

# 35. PRODUCTION READINESS MODEL

A production-ready feature must satisfy the applicable requirements across the full stack:

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
PRODUCTION-READY
```

This quality model is not a replacement for the Validation Gate checklist.

It is the conceptual ordering of the quality bar.

The Validation Gate remains the operational acceptance mechanism.

---

# 36. FINAL RELEASE GATE

Before production release, confirm all applicable items:

```text
[ ] Engineering requirements satisfied
[ ] Domain behavior correct
[ ] Inventory truth preserved
[ ] Server authority preserved
[ ] Tenant isolation verified
[ ] Permissions verified
[ ] Provider behavior verified to the applicable evidence level
[ ] Synchronization verified
[ ] Reconciliation verified
[ ] Audit requirements satisfied
[ ] Frontend contracts satisfied
[ ] Design-system conformance verified
[ ] All material UI states implemented
[ ] Trust states truthful
[ ] Freshness visible where required
[ ] Dangerous actions protected
[ ] Async work observable
[ ] Failure and recovery paths tested
[ ] Accessibility tested
[ ] Responsive behavior tested
[ ] Content and terminology reviewed
[ ] Heuristic inspection completed
[ ] Visual QA completed
[ ] E2E tests pass
[ ] Observability present
[ ] Performance acceptable
[ ] Security tests pass
[ ] User validation completed where applicable
[ ] Evidence recorded
[ ] Known limitations recorded
[ ] No release-blocking defects
[ ] Rollback/recovery requirements satisfied
```

Only after all applicable gates pass:

```text
PRODUCTION-READY
```

---

# 37. WHAT THIS DOCUMENT DOES NOT DO

This document intentionally does not:

- rewrite the engineering architecture;
- redefine inventory semantics;
- replace the product design system;
- replace frontend component specifications;
- replace the Human-Centered UX Contract;
- replace the Production Validation Gate;
- remove detailed screen requirements;
- remove detailed domain requirements;
- create a sixth competing design system;
- create a second lifecycle;
- create a second implementation order.

It exists to coordinate the existing specifications.

---

# 38. FINAL CANONICAL MODEL

The complete specification system is:

```text
MASTER ORCHESTRATION & AUTHORITY
            │
            ├── Engineering
            │     Domain / truth / security / providers / backend
            │
            ├── Product Design
            │     IA / visual / interaction architecture
            │
            ├── Frontend
            │     Routes / components / states / UI implementation
            │
            ├── Human UX
            │     Comprehension / operation / accessibility / usability
            │
            └── Validation Gate
                  Evidence / acceptance / release
```

Implementation flow:

```text
SPECIFIED
    ↓
DEPENDENCY-CHECKED
    ↓
IMPLEMENTED
    ↓
VERIFIED
    ↓
USER-VALIDATED (where applicable)
    ↓
PRODUCTION-READY
```

The central product principle remains:

> **Inventory must be explainable.**

The central UX principle remains:

> **Complexity belongs in the system, not in the user's mental burden.**

The central engineering principle remains:

> **The frontend is a deterministic projection of server-authoritative state.**

The central release principle remains:

> **Do not confuse implementation with verification, validation, or production readiness.**

The governing Anti Gravity rule is:

> **When a requirement is unclear, resolve it by authority and evidence—not by assumption, convenience, or visual approximation.**
