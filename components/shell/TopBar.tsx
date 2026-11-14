"use client";
import Link from "next/link";
import type { RefObject } from "react";
import type { MeResponse } from "@/lib/api-types";
import { copy } from "@/lib/content";
import { Icon } from "../icons";
import { IconButton } from "../ui";
import { CalendarButton } from "./CalendarPopover";
import { SearchBox } from "./SearchBox";

/** Top bar: menu (mobile), title, search (md+, app pages), calendar button always last on the right. */
export function TopBar({
  me,
  title,
  variant,
  onMenu,
  menuRef,
}: {
  me: MeResponse | null;
  title?: string;
  variant: "app" | "flow";
  onMenu: () => void;
  menuRef: RefObject<HTMLButtonElement | null>;
}) {
  const ready = !!me && (me.stage === "lesson" || me.stage === "done");
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="flex h-topbar-mobile items-center gap-2 px-2 md:h-topbar md:gap-4 md:px-8">
        {variant === "app" ? (
          <>
            <IconButton ref={menuRef} icon="menu" label={copy.shell.openMenu} className="md:hidden" onClick={onMenu} />
            {title && <p className="min-w-0 truncate text-h3 text-ink md:shrink-0">{title}</p>}
          </>
        ) : (
          <Link href="/" className="flex min-h-tap items-center gap-2 rounded-control px-2 text-h3 text-ink">
            <span className="grid size-8 place-items-center rounded-control bg-accent text-on-primary" aria-hidden>
              <Icon name="check" className="size-5" />
            </span>
            <span className="truncate">{copy.appName}</span>
          </Link>
        )}
        <div className="flex min-w-0 flex-1 justify-center">{variant === "app" && ready && <div className="hidden w-full max-w-md md:block"><SearchBox /></div>}</div>
        {ready && me && <CalendarButton me={me} />}
      </div>
    </header>
  );
}
