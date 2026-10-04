export interface ModalProps {
  id: string;
  title: string;
  description?: string;
  isOpen?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  contentHtml: string;
  footerActionsHtml?: string;
  closeButton?: boolean;
}

/**
 * Modal component: Accessible dialog container with backdrop blur, focus trapping attributes,
 * and keyboard escape behavior.
 */
export function renderModal(props: ModalProps): string {
  const size = props.size || "md";
  const isOpen = Boolean(props.isOpen);
  const openClass = isOpen ? "modal-open" : "modal-closed";
  const showClose = props.closeButton ?? true;

  return `
    <div class="modal-backdrop ${openClass}" 
         id="backdrop-${props.id}"
         data-modal-id="${props.id}"
         ${isOpen ? '' : 'hidden aria-hidden="true"'}>
      <div class="modal-card modal-${size}"
           id="${props.id}"
           role="dialog"
           aria-modal="true"
           aria-labelledby="modal-title-${props.id}"
           ${props.description ? `aria-describedby="modal-desc-${props.id}"` : ''}
           tabindex="-1">
        <div class="modal-header">
          <div class="modal-title-group">
            <h3 class="modal-title" id="modal-title-${props.id}">${props.title}</h3>
            ${props.description ? `<p class="modal-description" id="modal-desc-${props.id}">${props.description}</p>` : ''}
          </div>
          ${showClose ? `
            <button class="modal-close-btn" 
                    aria-label="Close dialog" 
                    data-close-modal="${props.id}">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          ` : ''}
        </div>

        <div class="modal-body">
          ${props.contentHtml}
        </div>

        ${props.footerActionsHtml ? `
          <div class="modal-footer">
            ${props.footerActionsHtml}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}
