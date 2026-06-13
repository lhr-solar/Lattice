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
        text: "Admins open the {{Admin}} panel from the top bar. It covers user accounts, vehicles, and destructive database operations. Regular designers use the main Lattice workspace only.",
      },
      {
        type: "ul",
        items: [
          "{{Back to app}} returns to the design workspace without signing out.",
          "Only admin accounts see the {{Admin}} button; other users cannot access these pages.",
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
        ],
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
          "Place instances on the vehicle: enclosures, nodes, and inline connectors.",
          "Click {{Edit pinout}} — assign pin names and optional net pre-assignments.",
          "Enable {{Wire}} mode and pair pins to create harness wires and nets.",
          "Use {{Pin shorts}} for internal continuity inside one connector.",
          "Review nets in {{Net Manager}} and the connection table.",
          "Switch to {{Manufacturing}} mode to track wire builds.",
          "Click {{Publish revision}} when the design is ready.",
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
          "Click any row to focus the graph and property panel on that instance.",
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
        text: "Opened from {{Connector Library}} in the top bar. Mating-pair connectors with unified pinouts, male/female part numbers, and images. Categories include inline harness connectors, node slot connectors, and enclosure panel mounts.",
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
        text: "In {{Design}} mode, the Properties panel lists Add from library actions scoped to your current selection.",
      },
      {
        type: "ul",
        items: [
          "With the vehicle selected: {{Add enclosure to…}}, {{Add node to…}}, or {{Add inline to…}} at the vehicle level.",
          "With an enclosure selected: add nested enclosures, nodes, or inline connectors inside it.",
          "Each flow picks a template and optional custom nickname (instance label), then {{Add}}.",
          "If a template is missing, click {{Add}} in the picker to jump to the right library tab.",
        ],
      },
      {
        type: "p",
        text: "After placement, select the instance in the hierarchy to nickname it or open connector-specific tools in the property panel.",
      },
    ],
  },
  {
    id: "pinouts",
    title: "Connector pinouts",
    content: [
      {
        type: "p",
        text: "Select any connector (inline, panel mount, or on a node) and click {{Edit pinout}} in the Properties panel.",
      },
      {
        type: "ul",
        items: [
          "Assign human-readable pin names from the pin name library or type custom names.",
          "Pin names drive automatic net naming when you wire — define them before heavy wiring.",
          "Optionally assign pins to existing nets or create nets from the pinout editor.",
          "Apply a pin template to bulk-fill names for connectors that share the same template.",
          "Conflicts when applying templates can be resolved per pin before {{Save}}.",
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
        text: "Wire mode changes pin clicks from navigation to pairing. Toggle it with the {{Wire}} button on the graph canvas (top right).",
      },
      {
        type: "ol",
        items: [
          "Click {{Wire}} — the button shows {{Wiring active}} when enabled.",
          "First pin click selects pin A (highlighted in the pairing panel).",
          "Second pin click on another pin creates a wire edge and assigns both pins to a net.",
          "Choose an existing net, create a new named net, or leave naming automatic.",
          "Optional wire color applies to the new connection.",
        ],
      },
      {
        type: "p",
        text: "You can also drag between pin ports on the graph when Wire mode is on. Click an existing wire edge to disconnect it.",
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
          "Available in Wire mode when a connector is selected.",
          "Shown as dashed edges on the graph, distinct from solid harness wires.",
          "Use the {{Pin shorts}} section in the Properties panel to add or remove shorts.",
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
          "Open from the graph via {{Open table}} or from Properties — scope follows your current selection.",
          "{{Open selection in connection table}} scopes to your hierarchy selection.",
          "Scopes include entire vehicle, enclosure, node, or single connector.",
          "Review source and destination connectors, pins, signal names, and wire colors.",
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
          "Zoom and pan with React Flow controls; minimap helps orientation on large designs.",
          "Projection level in Properties reflects how deep you are (vehicle → enclosure → connector → pin).",
          "Selecting in the hierarchy and clicking on the graph stay in sync.",
          "Topology summary in Properties shows enclosure, node, edge, and net counts.",
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
        text: "The top-bar search field filters graph entities and hierarchy labels as you type. Use it to jump to connectors, nodes, or enclosures in large vehicles without scrolling the tree.",
      },
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing mode",
    content: [
      {
        type: "p",
        text: "Switch mode in the right sidebar: {{Design}} / {{Manufacturing}}. Manufacturing focuses on building harnesses, not editing topology.",
      },
      {
        type: "ul",
        items: [
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
          "{{Publish revision}} at the bottom of Properties in Design mode snapshots the current draft as immutable.",
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
        text: "When a vehicle revision is open, the sync indicator in the top bar shows how updates arrive.",
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
          "{{Connector Library}} in the top bar is the fastest path to global connector templates.",
        ],
      },
    ],
  },
];

export function buildHelpSections(isAdmin: boolean): HelpSection[] {
  if (isAdmin) return [...ADMIN_HELP_SECTIONS, ...USER_HELP_SECTIONS];
  return USER_HELP_SECTIONS;
}
