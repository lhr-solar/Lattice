import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { latticeMarkLogo } from "@/assets/logos";
import { ModalOverlay } from "@/components/ui/Modal";
import {
  ADMIN_HELP_SECTIONS,
  buildHelpSections,
  type HelpBlock,
} from "@/components/shell/helpContent";
import { useAppStore } from "@/stores/appStore";
import { useSessionStore } from "@/stores/sessionStore";

const ACTION_PATTERN = /\{\{([^}]+)\}\}/g;

function HelpAction({ label }: { label: string }) {
  return (
    <span
      className="mx-0.5 inline-flex items-center rounded border border-tesla-border bg-tesla-bg px-1.5 py-px text-[13px] font-medium leading-snug text-tesla-text shadow-sm"
    >
      {label}
    </span>
  );
}

function HelpInlineText({ text }: { text: string }) {
  const parts: Array<{ type: "text" | "action"; value: string }> = [];
  let lastIndex = 0;

  for (const match of text.matchAll(ACTION_PATTERN)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      parts.push({ type: "text", value: text.slice(lastIndex, index) });
    }
    parts.push({ type: "action", value: match[1] });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", value: text.slice(lastIndex) });
  }

  if (parts.length === 0) return text;

  return (
    <>
      {parts.map((part, i) =>
        part.type === "action" ? (
          <HelpAction key={i} label={part.value} />
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </>
  );
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-sm leading-relaxed text-tesla-muted">
          <HelpInlineText text={block.text} />
        </p>
      );
    case "h4":
      return (
        <h4 className="text-sm font-medium text-tesla-text">
          <HelpInlineText text={block.text} />
        </h4>
      );
    case "ul":
      return (
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-tesla-muted">
          {block.items.map((item) => (
            <li key={item}>
              <HelpInlineText text={item} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-tesla-muted">
          {block.items.map((item) => (
            <li key={item}>
              <HelpInlineText text={item} />
            </li>
          ))}
        </ol>
      );
  }
}

export function HelpModal() {
  const showHelpModal = useAppStore((s) => s.showHelpModal);
  const setShowHelpModal = useAppStore((s) => s.setShowHelpModal);
  const isAdmin = useSessionStore((s) => s.isAdmin);

  const sections = useMemo(() => buildHelpSections(isAdmin), [isAdmin]);
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    if (!showHelpModal) return;
    const valid = sections.some((s) => s.id === activeId);
    if (!valid) setActiveId(sections[0]?.id ?? "");
  }, [showHelpModal, sections, activeId]);

  const activeSection = sections.find((s) => s.id === activeId) ?? sections[0];

  if (!showHelpModal) return null;

  return (
    <ModalOverlay
      open={showHelpModal}
      onClose={() => setShowHelpModal(false)}
      layer="manager"
      ariaLabel="Lattice Help"
      panelClassName="max-w-5xl"
    >
      <header className="relative flex items-center gap-2 border-b border-tesla-border px-5 py-3 pr-12">
        <img
          src={latticeMarkLogo}
          alt=""
          aria-hidden
          className="h-6 w-6 rounded-sm object-contain"
        />
        <h2 className="text-sm font-semibold text-tesla-text">Lattice Help</h2>
        <button
          type="button"
          onClick={() => setShowHelpModal(false)}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-1 text-lg leading-none text-tesla-muted transition hover:bg-tesla-border hover:text-tesla-text"
          aria-label="Close"
        >
          ×
        </button>
      </header>

      <div className="flex min-h-[28rem] max-h-[min(36rem,70vh)]">
        <nav
          className="w-52 shrink-0 overflow-y-auto border-r border-tesla-border bg-tesla-bg/40 px-2 py-3"
          aria-label="Help topics"
        >
          {isAdmin && (
            <p className="mb-2 px-2 text-[10px] font-medium uppercase tracking-wider text-tesla-muted">
              Admin
            </p>
          )}
          {sections.map((section, index) => {
            const isFirstUserSection =
              isAdmin && index === ADMIN_HELP_SECTIONS.length && !section.adminOnly;
            return (
              <div key={section.id}>
                {isFirstUserSection && (
                  <p className="mb-2 mt-3 px-2 text-[10px] font-medium uppercase tracking-wider text-tesla-muted">
                    Workspace
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setActiveId(section.id)}
                  className={clsx(
                    "mb-0.5 w-full rounded-md px-2 py-1.5 text-left text-xs leading-snug transition",
                    activeId === section.id
                      ? "bg-tesla-accent/15 text-tesla-text"
                      : "text-tesla-muted hover:bg-tesla-border/50 hover:text-tesla-text",
                  )}
                >
                  {section.title}
                </button>
              </div>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
          {activeSection && (
            <div className="space-y-3">
              <h3 className="text-lg font-medium text-tesla-text">{activeSection.title}</h3>
              {activeSection.content.map((block, i) => (
                <HelpBlockView key={i} block={block} />
              ))}
            </div>
          )}
        </div>
      </div>
    </ModalOverlay>
  );
}
