export interface ConfirmDialogProps {
  id: string;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  intent?: "danger" | "warning" | "default";
  requiresTypedConfirmation?: string;
  isOpen?: boolean;
  onConfirmAction?: string;
}

/**
 * ConfirmDialog component: Guardrail for destructive actions (e.g., balance reset,
 * channel disconnect, account deletion, manual overwrite).
 * Adheres to Section 47 (Dangerous Operations) of Engineering Spec.
 */
export function renderConfirmDialog(props: ConfirmDialogProps): string {
  const intent = props.intent || "danger";
  const confirmText = props.confirmText || (intent === "danger" ? "Confirm Delete" : "Confirm");
  const cancelText = props.cancelText || "Cancel";
  const isOpen = Boolean(props.isOpen);
  const openClass = isOpen ? "modal-open" : "modal-closed";

  const iconSvg = intent === "danger" ? `
    <div class="confirm-icon-box danger-icon-box" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
    </div>
  ` : `
    <div class="confirm-icon-box warning-icon-box" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    </div>
  `;

  let typedConfirmationHtml = "";
  if (props.requiresTypedConfirmation) {
    typedConfirmationHtml = `
      <div class="typed-confirmation-block">
        <label for="confirm-input-${props.id}" class="typed-confirm-label">
          Please type <strong class="user-select-all">${props.requiresTypedConfirmation}</strong> to proceed:
        </label>
        <input type="text" 
               id="confirm-input-${props.id}" 
               class="input input-sm typed-confirm-input" 
               placeholder="${props.requiresTypedConfirmation}"
               autocomplete="off"
               data-expected-confirmation="${props.requiresTypedConfirmation}" />
      </div>
    `;
  }

  return `
    <div class="modal-backdrop ${openClass}" 
         id="backdrop-${props.id}"
         data-confirm-dialog-id="${props.id}"
         ${isOpen ? '' : 'hidden aria-hidden="true"'}>
      <div class="modal-card modal-confirm confirm-${intent}"
           id="${props.id}"
           role="alertdialog"
           aria-modal="true"
           aria-labelledby="confirm-title-${props.id}"
           aria-describedby="confirm-desc-${props.id}"
           tabindex="-1">
        <div class="modal-body confirm-dialog-body">
          <div class="confirm-header-row">
            ${iconSvg}
            <div class="confirm-text">
              <h3 class="confirm-title" id="confirm-title-${props.id}">${props.title}</h3>
              <p class="confirm-desc" id="confirm-desc-${props.id}">${props.message}</p>
            </div>
          </div>
          ${typedConfirmationHtml}
        </div>

        <div class="modal-footer confirm-dialog-footer">
          <button type="button" 
                  class="btn btn-secondary" 
                  data-dismiss-dialog="${props.id}">
            ${cancelText}
          </button>
          <button type="button" 
                  class="btn btn-${intent}" 
                  id="confirm-action-btn-${props.id}"
                  ${props.requiresTypedConfirmation ? 'disabled' : ''}
                  ${props.onConfirmAction ? `onclick="${props.onConfirmAction}"` : ''}>
            ${confirmText}
          </button>
        </div>
      </div>
    </div>
  `;
}
