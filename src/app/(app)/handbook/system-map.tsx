"use client";

/**
 * The hierarchy diagram, drawn as inline SVG so it inherits the app's theme
 * tokens and stays crisp at any zoom. It answers one question: what contains
 * what, and who can see each level.
 */
export function SystemMap() {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-card p-4">
      <svg
        viewBox="0 0 760 470"
        role="img"
        aria-label="System hierarchy: Workspace contains Organizations, which contain Projects, which contain Categories, which contain Tasks, which contain checklists, comments, time logs and links."
        className="mx-auto h-auto w-full min-w-[640px] max-w-3xl"
      >
        <defs>
          <marker
            id="map-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" className="text-border" />
          </marker>
        </defs>

        {/* Level 0 — Workspace */}
        <g>
          <rect
            x="270"
            y="10"
            width="220"
            height="48"
            rx="12"
            className="fill-primary/10 stroke-primary/40"
            strokeWidth="1.5"
          />
          <text x="380" y="31" textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
            Workspace
          </text>
          <text x="380" y="47" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            One Admin sees everything below
          </text>
        </g>

        <line x1="380" y1="58" x2="380" y2="82" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />

        {/* Level 1 — Organizations */}
        <g>
          <rect x="120" y="84" width="240" height="58" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
          <text x="240" y="106" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
            Organization — “Company A”
          </text>
          <text x="240" y="122" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Managers + Members who may see each other
          </text>
          <text x="240" y="135" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Created by the Admin only
          </text>
        </g>
        <g>
          <rect x="400" y="84" width="240" height="58" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
          <text x="520" y="106" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
            Organization — “Company B”
          </text>
          <text x="520" y="122" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Completely walled off from Company A
          </text>
          <text x="520" y="135" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Its managers see none of A&apos;s people
          </text>
        </g>

        <path d="M 380 58 L 380 72 L 240 72 L 240 82" fill="none" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />
        <path d="M 380 58 L 380 72 L 520 72 L 520 82" fill="none" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />

        <line x1="240" y1="142" x2="240" y2="166" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />

        {/* Level 2 — Projects */}
        <g>
          <rect x="120" y="168" width="240" height="62" rx="12" className="fill-chart-2/10 stroke-chart-2/40" strokeWidth="1.5" />
          <text x="240" y="190" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
            Project
          </text>
          <text x="240" y="206" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Assigned managers + assigned members
          </text>
          <text x="240" y="220" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Invisible to everyone not assigned
          </text>
        </g>

        <line x1="240" y1="230" x2="240" y2="254" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />

        {/* Level 3 — Categories */}
        <g>
          <rect x="120" y="256" width="240" height="48" rx="12" className="fill-card stroke-border" strokeWidth="1.5" />
          <text x="240" y="277" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
            Category
          </text>
          <text x="240" y="293" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            A named group of tasks — a heading
          </text>
        </g>

        <line x1="240" y1="304" x2="240" y2="328" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />

        {/* Level 4 — Tasks */}
        <g>
          <rect x="120" y="330" width="240" height="48" rx="12" className="fill-chart-4/15 stroke-chart-4/50" strokeWidth="1.5" />
          <text x="240" y="351" textAnchor="middle" className="fill-foreground text-[12px] font-semibold">
            Task
          </text>
          <text x="240" y="367" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Assignee · priority · status · due date
          </text>
        </g>

        <line x1="240" y1="378" x2="240" y2="402" className="stroke-border" strokeWidth="1.5" markerEnd="url(#map-arrow)" />

        {/* Level 5 — Task contents */}
        <g>
          <rect x="40" y="404" width="400" height="52" rx="12" className="fill-muted stroke-border" strokeWidth="1.5" />
          <text x="240" y="425" textAnchor="middle" className="fill-foreground text-[11px] font-semibold">
            Checklist · Comments · Time logs · Labels · Dependencies
          </text>
          <text x="240" y="441" textAnchor="middle" className="fill-muted-foreground text-[10px]">
            Everything that lives inside one task
          </text>
        </g>

        {/* Side note on the right */}
        <g>
          <rect
            x="470"
            y="168"
            width="250"
            height="210"
            rx="12"
            className="fill-muted/50 stroke-border"
            strokeDasharray="4 3"
            strokeWidth="1.5"
          />
          <text x="486" y="192" className="fill-foreground text-[11px] font-semibold">
            The two rules that matter
          </text>

          <text x="486" y="216" className="fill-muted-foreground text-[10px] font-semibold">
            1. Organization = who you can SEE
          </text>
          <text x="486" y="230" className="fill-muted-foreground text-[10px]">
            Being in an organization lets you find
          </text>
          <text x="486" y="243" className="fill-muted-foreground text-[10px]">
            its people when staffing a project.
          </text>
          <text x="486" y="256" className="fill-muted-foreground text-[10px]">
            It does not show you its projects.
          </text>

          <text x="486" y="284" className="fill-muted-foreground text-[10px] font-semibold">
            2. Assignment = what you can OPEN
          </text>
          <text x="486" y="298" className="fill-muted-foreground text-[10px]">
            A project appears for you only when
          </text>
          <text x="486" y="311" className="fill-muted-foreground text-[10px]">
            you are its manager, its member, or
          </text>
          <text x="486" y="324" className="fill-muted-foreground text-[10px]">
            the person who created it.
          </text>

          <text x="486" y="352" className="fill-muted-foreground text-[10px]">
            The Admin is the single exception —
          </text>
          <text x="486" y="365" className="fill-muted-foreground text-[10px]">
            they see every level, always.
          </text>
        </g>
      </svg>
    </div>
  );
}
