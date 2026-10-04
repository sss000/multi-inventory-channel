export interface DrawerProps {
  id: string;
  title: string;
  subtitle?: string;
  isOpen?: boolean;
  position?: "right" | "left";
  width?: "sm" | "md" | "lg" | "xl";
  contentHtml: string;
  footerActionsHtml?: string;
  closeAriaLabel?: string;
}

/**
 * Drawer component: Accessible slide-out panel for deep inspection, SKU balance breakdowns,
 * and filter panels. Conforms to WAI-ARIA dialog specifications.
 */
export function renderDrawer(props: DrawerProps): string {
  const position = props.position || "right";
  const width = props.width || "md";
  const isOpen = Boolean(props.isOpen);
  const openClass = isOpen ? "drawer-open" : "drawer-closed";

  return `
    <div class="drawer-overlay ${openClass}" 
         id="overlay-${props.id}"
         data-drawer-id="${props.id}"
         ${isOpen ? '' : 'hidden aria-hidden="true"'}>
      <aside class="drawer-panel drawer-${position} drawer-${width}"
             id="${props.id}"
             role="dialog"
             aria-modal="true"
             aria-labelledby="drawer-title-${props.id}"
             ${props.subtitle ? `aria-describedby="drawer-sub-${props.id}"` : ''}
             tabindex="-1">
        <header class="drawer-header">
          <div class="drawer-header-text">
            <h3 class="drawer-title" id="drawer-title-${props.id}">${props.title}</h3>
            ${props.subtitle ? `<p class="drawer-subtitle" id="drawer-sub-${props.id}">${props.subtitle}</p>` : ''}
          </div>
          <button class="drawer-close-btn" 
                  aria-label="${props.closeAriaLabel || 'Close Drawer'}"
                  data-close-drawer="${props.id}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </header>

        <div class="drawer-body">
          ${props.contentHtml}
        </div>

        ${props.footerActionsHtml ? `
          <footer class="drawer-footer">
            ${props.footerActionsHtml}
          </footer>
        ` : ''}
      </aside>
    </div>
  `;
}
