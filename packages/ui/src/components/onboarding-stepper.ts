/**
 * Onboarding Stepper Component
 * Canonical Specifications: Section 62 of 01_ENGINEERING_SPEC.md & Prompt 26
 * 
 * Progressive 9-step wizard navigation with accessible state indicators:
 * Completed | Current | Blocked | Needs attention
 */

export interface StepInfo {
  id: string;
  number: number;
  label: string;
  status: "COMPLETED" | "CURRENT" | "BLOCKED" | "NEEDS_ATTENTION";
  description?: string;
  href?: string;
}

export interface OnboardingStepperProps {
  currentStepId: string;
  steps: StepInfo[];
  className?: string;
}

export const CANONICAL_ONBOARDING_STEPS: StepInfo[] = [
  { id: "CREATE_ACCOUNT", number: 1, label: "Create Account", status: "COMPLETED", description: "Identity established" },
  { id: "CREATE_ORGANIZATION", number: 2, label: "Create Organization", status: "COMPLETED", description: "Tenant configured" },
  { id: "CHOOSE_PRIMARY_CHANNEL", number: 3, label: "Primary Channel", status: "CURRENT", description: "Select sales channel" },
  { id: "CONNECT_CHANNEL", number: 4, label: "Connect Channel", status: "BLOCKED", description: "Authenticate store" },
  { id: "IMPORT_CATALOG", number: 5, label: "Import Catalog", status: "BLOCKED", description: "Fetch products & SKUs" },
  { id: "MAP_SKUS", number: 6, label: "Map SKUs", status: "BLOCKED", description: "Align catalog identifiers" },
  { id: "VALIDATE_INVENTORY", number: 7, label: "Validate Inventory", status: "BLOCKED", description: "Source of truth check" },
  { id: "ENABLE_SYNCHRONIZATION", number: 8, label: "Enable Sync", status: "BLOCKED", description: "Confirm outbound sync" },
  { id: "COMPLETED", number: 9, label: "Dashboard", status: "BLOCKED", description: "Launch platform" },
];

export function renderOnboardingStepper(props: OnboardingStepperProps): string {
  const steps = props.steps || CANONICAL_ONBOARDING_STEPS;

  const stepsHtml = steps
    .map((step) => {
      const isCurrent = step.id === props.currentStepId || step.status === "CURRENT";
      const ariaCurrent = isCurrent ? ' aria-current="step"' : "";

      let statusBadge = "";
      let statusClass = "stepper-step-blocked";
      let stepIcon = `<span class="stepper-step-number">${step.number}</span>`;

      switch (step.status) {
        case "COMPLETED":
          statusClass = "stepper-step-completed";
          stepIcon = `<span class="stepper-step-icon" aria-hidden="true">✓</span>`;
          statusBadge = `<span class="badge badge-success" style="font-size: var(--text-2xs); padding: 2px 6px;">Completed</span>`;
          break;
        case "CURRENT":
          statusClass = "stepper-step-current";
          statusBadge = `<span class="badge badge-primary" style="font-size: var(--text-2xs); padding: 2px 6px;">Current</span>`;
          break;
        case "NEEDS_ATTENTION":
          statusClass = "stepper-step-attention";
          stepIcon = `<span class="stepper-step-icon" aria-hidden="true" style="color: var(--color-warning);">!</span>`;
          statusBadge = `<span class="badge badge-warning" style="font-size: var(--text-2xs); padding: 2px 6px;">Needs Attention</span>`;
          break;
        case "BLOCKED":
        default:
          statusClass = "stepper-step-blocked";
          statusBadge = `<span class="badge badge-neutral" style="font-size: var(--text-2xs); padding: 2px 6px;">Pending</span>`;
          break;
      }

      return `
        <li class="stepper-step ${statusClass}" data-step="${step.id}"${ariaCurrent}>
          <div class="stepper-step-indicator">
            ${stepIcon}
          </div>
          <div class="stepper-step-content">
            <div class="stepper-step-header">
              <span class="stepper-step-label">${step.label}</span>
              ${statusBadge}
            </div>
            ${step.description ? `<span class="stepper-step-desc">${step.description}</span>` : ""}
          </div>
        </li>
      `;
    })
    .join("");

  return `
    <nav class="onboarding-stepper-container ${props.className || ""}" aria-label="Progressive Onboarding Steps">
      <ol class="onboarding-stepper-list">
        ${stepsHtml}
      </ol>
    </nav>
  `;
}
