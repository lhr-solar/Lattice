export interface HelpSection {
  id: string;
  title: string;
  adminOnly?: boolean;
  content: HelpBlock[];
}

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "h4"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] };

export const ADMIN_HELP_SECTIONS: HelpSection[] = [
  {
    id: "admin-overview",
    title: "Admin overview",
    adminOnly: true,
    content: [
      {
        type: "p",
        text: "Admins open the admin panel via {{Admin Settings}} in the top bar. It covers user accounts, vehicles, and destructive database operations. Regular designers use the main Lattice workspace only.",
      },
      {
        type: "ul",
        items: [
          "{{Back to app}} returns to the design workspace without signing out.",
          "Only admin accounts see {{Admin Settings}}; other users cannot access these pages.",
        ],
      },
    ],
  },
  {
    id: "admin-users",
    title: "User management",
    adminOnly: true,
    content: [
      {
        type: "p",
        text: "Create and maintain sign-in accounts for your team. The connected-user count reflects who is online right now (live presence when available).",
      },
      {
        type: "h4",
        text: "Adding users",
      },
      {
        type: "ul",
        items: [
          "Single add: enter a username, choose {{Use default password}} or a custom password (minimum 6 characters), then click {{Add user}}.",
          "{{Bulk add…}}: one username per line; all new users share the same password choice, then {{Add users}}.",
          "Existing usernames in a bulk import are skipped automatically.",
        ],
      },
      {
        type: "h4",
        text: "Managing existing users",
      },
      {
        type: "ul",
        items: [
          "{{Edit password}} on any user; active sessions for that user are signed out.",
          "Select users with checkboxes, then {{Set password…}} or {{Delete selected}} for bulk actions.",
          "Admin accounts and your own account cannot be deleted via bulk delete.",
          "Enable {{Show connected users only}} when you need to see who is online.",
          "{{Clear selection}} deselects all checked users.",
        ],
      },
    ],
  },
  {
    id: "admin-default-password",
    title: "Default password",
    adminOnly: true,
    content: [
      {
        type: "p",
        text: "When you create a user with {{Use default password}}, Lattice applies the server-side default rather than typing a password each time.",
      },
      {
        type: "ul",
        items: [
          "Click {{Edit default password}} in the banner at the top of User management.",
          "If no custom default is configured, new users receive the system admin password.",
          "Changing a user’s password or the default signs out affected sessions on individual password edits.",
        ],
      },
    ],
  },
  {
    id: "admin-vehicles",
    title: "Vehicle management",
    adminOnly: true,
    content: [
      {
        type: "p",
        text: "Vehicles are top-level projects in Lattice. Each vehicle has its own node and enclosure template libraries, revisions, and harness data.",
      },
      {
        type: "ul",
        items: [
          "{{+ New vehicle}} creates a blank vehicle with a default name; use {{Rename}} to match your program.",
          "{{Rename}} updates the display name shown in the hierarchy and manufacturing views.",
          "{{Delete}} removes the vehicle, all revisions, and every instance tied to it. This cannot be undone.",
          "The current revision (blue dot, R#, and label) is shown on each row; use {{Revisions}} or the arrow to open revision history.",
        ],
      },
    ],
  },
  {
    id: "admin-revisions",
    title: "Revision history & reverting",
    adminOnly: true,
    content: [
      {
        type: "p",
        text: "Open revision history from the {{Revisions}} button or the arrow next to the current revision on any vehicle row.",
      },
      {
        type: "h4",
        text: "Revision timeline",
      },
      {
        type: "ul",
        items: [
          "Revisions are listed newest first; scroll down to load older entries.",
          "Search by label, author, revision number, or revision ID.",
          "Each entry shows R#, status (Draft or Published), label, author, created and published times, parent lineage, and full revision ID.",
          "The working draft is marked {{Current}}.",
        ],
      },
      {
        type: "h4",
        text: "Reverting",
      },
      {
        type: "ul",
        items: [
          "{{Revert to this}} on any non-current revision creates a new draft copied from that snapshot.",
          "The vehicle head switches to the new draft automatically; older revisions remain in the timeline.",
          "Revert descriptions are generated automatically from the source revision and timestamp.",
          "Designers with the vehicle open sync forward to the new head when vehicles data refreshes.",
        ],
      },
      {
        type: "p",
        text: "Publishing (in the design workspace) is separate from revert: publish locks the current draft and starts a new draft for continued work. Revert branches from any past revision without removing history.",
      },
    ],
  },
  {
    id: "admin-database",
    title: "Database management",
    adminOnly: true,
    content: [
      {
        type: "p",
        text: "Destructive clears are per vehicle. Confirm carefully — there is no undo.",
      },
      {
        type: "h4",
        text: "{{Clear all revisions}}",
      },
      {
        type: "p",
        text: "Deletes older revisions but keeps the current draft design. The surviving draft is renumbered to R1 Draft. Library templates are kept.",
      },
      {
        type: "h4",
        text: "{{Clear topology}}",
      },
      {
        type: "p",
        text: "On the current draft only: removes placed enclosures, nodes, connectors, and all wires. Vehicle-scoped library templates are kept.",
      },
      {
        type: "h4",
        text: "{{Clear wires only}}",
      },
      {
        type: "p",
        text: "Removes wires, signals, splices, and harness topology while keeping placed enclosures, nodes, connectors, and library templates. Use this to reset connectivity without rebuilding the physical layout.",
      },
      {
        type: "h4",
        text: "{{Clear all data}}",
      },
      {
        type: "p",
        text: "Wipes all design data and vehicle-scoped library items for that vehicle, including revisions. The vehicle shell remains but you start from an empty draft.",
      },
    ],
  },
];

export const USER_HELP_SECTIONS: HelpSection[] = [
  {
    id: "getting-started",
    title: "Getting started",
    content: [
      {
        type: "p",
        text: "Lattice is a graph-first harness planner for vehicle electrical systems. You model enclosures, nodes (PCBs), and connectors, assign pin names, then wire pins into nets for logical connectivity and manufacturing output.",
      },
      {
        type: "h4",
        text: "Suggested workflow",
      },
      {
        type: "ol",
        items: [
          "Sign in and select a vehicle from the left hierarchy.",
          "Define or import templates in the libraries (connectors, nodes, enclosures).",
          "Place instances with {{+ Enclosure}}, {{+ Node}}, and {{+ Inline}} in the bottom toolbar.",
          "Use the pencil icon in the topology tree to rename instances or edit connector pinouts.",
          "Enable {{Wire}} mode and pair pins on the graph to create harness wires and nets.",
          "Review nets in {{Net Manager}} and the {{Open table}} connection view.",
          "Switch to {{Manufacturing}} with the top-bar mode switch to track wire builds.",
          "Click {{Publish revision}} in the bottom toolbar when the design is ready.",
        ],
      },
    ],
  },
  {
    id: "workspace",
    title: "Workspace layout",
    content: [
      {
        type: "p",
        text: "The top bar is split into three fixed zones so controls do not jump when you switch modes.",
      },
      {
        type: "ul",
        items: [
          "Left: Lattice branding and {{Connector Library}} (Design mode only — the search bar expands smoothly when it hides).",
          "Center: search field and the {{Design}} / {{Manufacturing}} mode switch.",
          "Right: {{Admin Settings}} (admins), help (?), live sync status, username, and sign out.",
          "Design mode adds a floating bottom toolbar for add actions, {{Open table}}, {{Wire}}, and {{Publish revision}}.",
          "The graph uses the full width — there is no right properties sidebar.",
        ],
      },
    ],
  },
  {
    id: "vehicles-hierarchy",
    title: "Vehicles & hierarchy",
    content: [
      {
        type: "p",
        text: "The left sidebar lists vehicles and, once selected, the full instance tree for the current draft revision.",
      },
      {
        type: "ul",
        items: [
          "Click a vehicle name to load its current draft revision.",
          "The tree shows enclosures, nodes, and connectors nested under their parents.",
          "Click any row to focus the graph on that instance.",
          "The pencil icon renames enclosures and nodes, or opens the pinout editor for connectors.",
          "Chevrons collapse or expand branches; use {{Collapse all}} / {{Expand all}} when the tree is large.",
          "The trash icon removes an enclosure, node, or connector instance — not the underlying template.",
          "Utilities opens {{Node Library}}, {{Enclosure Library}}, {{Net Manager}}, and {{Pin templates}}.",
        ],
      },
    ],
  },
  {
    id: "libraries",
    title: "Template libraries",
    content: [
      {
        type: "p",
        text: "Templates describe reusable definitions before you place instances on a vehicle.",
      },
      {
        type: "h4",
        text: "Connector library (global)",
      },
      {
        type: "p",
        text: "Opened from {{Connector Library}} beside the logo (Design mode). Mating-pair connectors with unified pinouts, male/female part numbers, and images. Categories include inline harness connectors, node slot connectors, and enclosure panel mounts.",
      },
      {
        type: "h4",
        text: "Node & enclosure libraries (per vehicle)",
      },
      {
        type: "p",
        text: "Node templates define PCB/node connectors and slot pinouts. Enclosure templates group panel-mount connectors. Both are scoped to the selected vehicle and opened from Utilities or the add-instance flows.",
      },
      {
        type: "ul",
        items: [
          "{{Add}}, {{Edit}}, and delete templates from each library modal.",
          "Slot pinout editors let you map connector pins to node slots.",
          "Library changes affect future instances; existing instances keep their data until you edit them.",
        ],
      },
    ],
  },
  {
    id: "adding-instances",
    title: "Adding instances",
    content: [
      {
        type: "p",
        text: "In {{Design}} mode, use the floating bottom toolbar to add instances scoped to your current selection.",
      },
      {
        type: "ul",
        items: [
          "With the vehicle selected: {{+ Enclosure}}, {{+ Node}}, or {{+ Inline}} at the vehicle level.",
          "With an enclosure selected: add nested enclosures, nodes, or inline connectors inside it.",
          "Each flow picks a template and optional custom nickname (instance label), then {{Add}}.",
          "If a template is missing, click {{Add}} in the picker to jump to the right library tab.",
        ],
      },
      {
        type: "p",
        text: "After placement, use the pencil icon in the topology tree to rename enclosures and nodes, or edit connector pinouts. Renaming dialogs stay open after {{Save name}} so you can make several edits.",
      },
      {
        type: "ul",
        items: [
          "{{Use library name → …}} at the bottom of the rename dialog reverts to the template label.",
          "Connector pinout editing includes the same rename field; on shared node/enclosure slots the name updates every matching connector instance.",
        ],
      },
    ],
  },
  {
    id: "pinouts",
    title: "Connector pinouts",
    content: [
      {
        type: "p",
        text: "Select any connector (inline, panel mount, or on a node) and click the pencil icon in the topology tree.",
      },
      {
        type: "ul",
        items: [
          "Rename the connector at the top of the editor; slot connectors share names across every instance on that node or enclosure slot.",
          "Assign human-readable pin names from the pin name library or type custom names.",
          "Pin names drive automatic net naming when you wire — define them before heavy wiring.",
          "Optionally assign pins to existing nets or create nets from the pinout editor.",
          "Apply a pin template to bulk-fill names for connectors that share the same template.",
          "Conflicts when applying templates can be resolved per pin before {{Save}}.",
          "{{Use library name → …}} reverts the connector name to the template label.",
        ],
      },
    ],
  },
  {
    id: "pin-templates",
    title: "Pin templates & names",
    content: [
      {
        type: "p",
        text: "Pin templates and the pin name library live under Utilities → {{Pin templates}} (or from within pinout editors).",
      },
      {
        type: "h4",
        text: "Pin name library",
      },
      {
        type: "p",
        text: "Reusable signal names (e.g. CAN_H, 12V) shared across the vehicle. Pick them when editing pinouts instead of retyping.",
      },
      {
        type: "h4",
        text: "Pin templates",
      },
      {
        type: "p",
        text: "Saved pin-name layouts tied to a connector template. Applying a template fills every pin position on matching connectors in one step.",
      },
    ],
  },
  {
    id: "wiring",
    title: "Wiring",
    content: [
      {
        type: "p",
        text: "Wire mode changes pin clicks from navigation to pairing. Toggle it with the {{Wire}} button in the bottom toolbar.",
      },
      {
        type: "ol",
        items: [
          "Click {{Wire}} — the button turns green and shows {{Wiring active}}.",
          "First pin click selects pin A.",
          "Second pin click on another pin creates a wire edge and assigns both pins to a net.",
          "Drag between pin ports on the graph when Wire mode is on.",
          "Click an existing wire edge to select it, then × or Delete to remove.",
        ],
      },
    ],
  },
  {
    id: "nets",
    title: "Nets",
    content: [
      {
        type: "p",
        text: "Nets group electrically connected pins. Open {{Net Manager}} from Utilities or from pinout tools.",
      },
      {
        type: "h4",
        text: "Naming",
      },
      {
        type: "ul",
        items: [
          "User-named nets: explicit names you choose (e.g. CAN1_H) via {{Net Manager}} or when wiring.",
          "Auto-named nets: created as Origin.Pin → Dest.Pin for wire pairs, or Connector.Pin for lone pins after deletes.",
        ],
      },
      {
        type: "h4",
        text: "{{Net Manager}}",
      },
      {
        type: "ul",
        items: [
          "Filter all, named-only, or auto-named nets; search by name.",
          "Edit net name and default wire color; delete nets when cleanup is needed.",
          "Inspect which pins belong to each net from the detail view.",
        ],
      },
    ],
  },
  {
    id: "pin-shorts",
    title: "Pin shorts",
    content: [
      {
        type: "p",
        text: "Pin shorts bond two pins inside the same connector (internal continuity) without a harness wire — for example tying redundant CAN-H pins on one connector.",
      },
      {
        type: "ul",
        items: [
          "Add shorts from the connection table when scoped to a single connector — pick two pins in the Internal pin shorts section.",
          "Shown as dashed edges on the graph, distinct from solid harness wires.",
          "Select a short edge on the graph and delete it with × or Delete.",
        ],
      },
    ],
  },
  {
    id: "connection-table",
    title: "Connection table",
    content: [
      {
        type: "p",
        text: "The connection table is a spreadsheet-style view of harness connections for a scope.",
      },
      {
        type: "ul",
        items: [
          "Open from the bottom toolbar via {{Open table}} — scope follows your current graph selection.",
          "Scopes include entire vehicle, enclosure, node, or single connector.",
          "Review source and destination connectors, pins, signal names, and wire colors.",
          "When scoped to one connector, use Internal pin shorts to bond pins inside that connector.",
          "Useful for bulk review, export-oriented workflows, and finding gaps before manufacturing.",
        ],
      },
    ],
  },
  {
    id: "graph",
    title: "Graph & projection",
    content: [
      {
        type: "p",
        text: "The main canvas is an interactive topology graph built from your design projection.",
      },
      {
        type: "ul",
        items: [
          "Containers represent enclosures and nodes; connector groups show pins on the right edge.",
          "Zoom and pan with the + / − / fit controls at the bottom-left of the canvas.",
          "The minimap sits at the bottom-right for orientation on large designs.",
          "The selection info panel at the top-right shows the focused instance (nickname and library name), projection level, type:id, and topology counts.",
          "Selecting in the hierarchy and clicking on the graph stay in sync.",
        ],
      },
    ],
  },
  {
    id: "search",
    title: "Search",
    content: [
      {
        type: "p",
        text: "The center top-bar search field filters graph entities and hierarchy labels as you type. Use it to jump to connectors, nodes, or enclosures in large vehicles without scrolling the tree. In Design mode the field is slightly narrower to make room for {{Connector Library}}; switching to {{Manufacturing}} animates the search bar wider.",
      },
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing mode",
    content: [
      {
        type: "p",
        text: "Switch mode with the {{Design}} / {{Manufacturing}} switch beside the search bar. Manufacturing focuses on building harnesses, not editing topology.",
      },
      {
        type: "ul",
        items: [
          "The wire table fills the workspace width with harness scope on the left.",
          "Open the › tab on the left edge to slide out navigation for vehicles and utilities.",
          "Wire table lists every harness wire with signal, endpoints, color, gauge, and notes.",
          "Sort and group by section, signal, or flat list.",
          "Mark wires as manufactured and continuity-checked with timestamps.",
          "Filter and search across the full wire list for shop-floor workflows.",
        ],
      },
    ],
  },
  {
    id: "revisions",
    title: "Revisions & publishing",
    content: [
      {
        type: "p",
        text: "Each vehicle works on a draft revision. Edits apply to the draft until you publish.",
      },
      {
        type: "ul",
        items: [
          "{{Publish revision}} in the bottom toolbar in Design mode snapshots the current draft as immutable.",
          "Publishing creates a new draft revision automatically so you can keep working.",
          "If a revision was already published elsewhere, Lattice switches you to the current draft.",
          "Stale revision banners appear when another session changed data — refresh or reload before saving.",
        ],
      },
    ],
  },
  {
    id: "collaboration",
    title: "Live sync",
    content: [
      {
        type: "p",
        text: "When a vehicle revision is open, the live sync indicator (left of your username) shows how updates arrive. Click the ? help button beside it to reopen this guide.",
      },
      {
        type: "ul",
        items: [
          "Live sync: WebSocket connected; changes from teammates appear in near real time.",
          "Reconnecting: brief connection loss; Lattice retries automatically.",
          "Polling for updates: fallback polling when live sync is unavailable.",
        ],
      },
      {
        type: "p",
        text: "Concurrent edits use edit-sequence checks; conflicting saves surface errors so you can refresh and retry.",
      },
    ],
  },
  {
    id: "tips",
    title: "Tips",
    content: [
      {
        type: "ul",
        items: [
          "Define pinouts early — pin names drive auto net naming.",
          "Wire within a connector projection context when pairing many pins on one connector.",
          "Dashed graph edges are pin shorts; solid edges are harness wires.",
          "Use {{Net Manager}} to rename auto nets into stable signal names before manufacturing.",
          "Connection table + {{Manufacturing}} mode complement the graph for verification.",
          "{{Connector Library}} beside the logo is the fastest path to global connector templates.",
          "Check the top-right selection panel when you need instance nickname, library name, or topology counts.",
        ],
      },
    ],
  },
];

export function buildHelpSections(isAdmin: boolean): HelpSection[] {
  if (isAdmin) return [...ADMIN_HELP_SECTIONS, ...USER_HELP_SECTIONS];
  return USER_HELP_SECTIONS;
}
