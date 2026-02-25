"use client";

import { useState } from "react";
import Link from "next/link";
import { LayoutDashboard, MessageSquare, Radio, Menu, X } from "lucide-react";
import QuickStartNavButton from "./QuickStartNavButton";

const links = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transcripts", label: "Transcripts", icon: MessageSquare },
  { href: "/sessions", label: "Sessions", icon: Radio },
];

export default function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden flex items-center gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-muted hover:text-foreground transition-all"
        aria-label="Menu"
      >
        {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>
      <QuickStartNavButton variant="icon" />
      {open && (
        <div className="fixed inset-x-0 top-14 z-50 border-b border-border bg-background/95 backdrop-blur-lg p-4 flex flex-col gap-1">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={label}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium text-muted hover:text-foreground hover:bg-surface-elevated transition-all"
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
