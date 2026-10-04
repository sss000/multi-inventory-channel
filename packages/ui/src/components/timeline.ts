export interface TimelineEvent {
  id: string;
  timestamp: string;
  title: string;
  eventType: string;
  actor?: string;
  status?: "success" | "warning" | "error" | "info";
  description?: string;
  quantityDelta?: number;
  metadata?: Record<string, any>;
  correlationId?: string;
}

export interface TimelineProps {
  id?: string;
  events: TimelineEvent[];
  title?: string;
  reverseChronological?: boolean;
  emptyMessage?: string;
}

/**
 * Timeline component: Chronological audit and event ledger visualization.
 * Renders an accessible, responsive chronological spine with status-colored nodes,
 * inventory delta chips, and causal metadata.
 */
export function renderTimeline(props: TimelineProps): string {
  if (!props.events || props.events.length === 0) {
    return `
      <div class="timeline-empty">
        <p class="timeline-empty-text">${props.emptyMessage || "No timeline events recorded."}</p>
      </div>
    `;
  }

  const sortedEvents = props.reverseChronological 
    ? [...props.events].reverse() 
    : props.events;

  const eventsHtml = sortedEvents.map((evt) => {
    const status = evt.status || "info";
    let deltaHtml = "";

    if (evt.quantityDelta !== undefined) {
      const isPositive = evt.quantityDelta > 0;
      const isNegative = evt.quantityDelta < 0;
      const sign = isPositive ? "+" : "";
      const deltaClass = isPositive ? "delta-positive" : isNegative ? "delta-negative" : "delta-zero";
      deltaHtml = `<span class="timeline-delta-badge ${deltaClass}">${sign}${evt.quantityDelta} units</span>`;
    }

    let metaDetailsHtml = "";
    if (evt.metadata && Object.keys(evt.metadata).length > 0) {
      metaDetailsHtml = `
        <details class="timeline-metadata-drawer">
          <summary>Payload Details</summary>
          <pre><code>${JSON.stringify(evt.metadata, null, 2)}</code></pre>
        </details>
      `;
    }

    return `
      <li class="timeline-item timeline-${status}" id="timeline-event-${evt.id}">
        <div class="timeline-node" aria-hidden="true">
          <span class="timeline-dot"></span>
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <div class="timeline-title-row">
              <span class="timeline-event-title">${evt.title}</span>
              ${deltaHtml}
            </div>
            <time class="timeline-time" datetime="${evt.timestamp}">${evt.timestamp}</time>
          </div>
          <div class="timeline-subhead">
            <span class="timeline-type-pill"><code>${evt.eventType}</code></span>
            ${evt.actor ? `<span class="timeline-actor">by <strong>${evt.actor}</strong></span>` : ""}
            ${evt.correlationId ? `<span class="timeline-correlation">cid: <code>${evt.correlationId.slice(0, 8)}...</code></span>` : ""}
          </div>
          ${evt.description ? `<p class="timeline-desc">${evt.description}</p>` : ""}
          ${metaDetailsHtml}
        </div>
      </li>
    `;
  }).join("");

  return `
    <section class="timeline-wrapper" id="${props.id || 'ledger-timeline'}" aria-label="${props.title || 'Ledger Audit Timeline'}">
      ${props.title ? `<h3 class="timeline-section-title">${props.title}</h3>` : ""}
      <ol class="timeline-list">
        ${eventsHtml}
      </ol>
    </section>
  `;
}
