"use client";

import { Button } from "#components/button";

import { Logo } from "./logo";
import { MobileNav } from "./mobile-nav";
import { navLinks } from "./nav-links";

export { navLinks };

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur-sm supports-backdrop-filter:bg-background/50">
      <nav className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <a
          className="rounded-md p-2 hover:bg-muted"
          href="#"
        >
          <Logo className="h-4" />
        </a>
        <div className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => (
            <Button
              asChild
              key={link.label}
              size="sm"
              variant="ghost"
            >
              <a href={link.href}>{link.label}</a>
            </Button>
          ))}
          <Button
            size="sm"
            variant="outline"
          >
            Sign In
          </Button>
          <Button size="sm">Get Started</Button>
        </div>
        <MobileNav />
      </nav>
    </header>
  );
}
