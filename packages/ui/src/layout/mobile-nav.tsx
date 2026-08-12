import React from "react";

import { MenuIcon, XIcon } from "lucide-react";

import { Button } from "#components/button";
import { cn } from "#lib/utils";

import { navLinks } from "./nav-links";
import { Portal, PortalBackdrop } from "./portal";

export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="md:hidden">
      <Button
        aria-controls="mobile-menu"
        aria-expanded={open}
        aria-label="Toggle menu"
        className="md:hidden"
        onClick={() => setOpen(!open)}
        size="icon"
        variant="outline"
      >
        {open ? <XIcon /> : <MenuIcon />}
      </Button>
      {open && (
        <Portal
          className="top-14"
          id="mobile-menu"
        >
          <PortalBackdrop />
          <div
            className={cn("ease-out data-[slot=open]:animate-in data-[slot=open]:zoom-in-97", "size-full p-4")}
            data-slot={open ? "open" : "closed"}
          >
            <div className="grid gap-y-2">
              {navLinks.map((link) => (
                <Button
                  asChild
                  className="justify-start"
                  key={link.label}
                  variant="ghost"
                >
                  <a href={link.href}>{link.label}</a>
                </Button>
              ))}
            </div>
            <div className="mt-12 flex flex-col gap-2">
              <Button
                className="w-full"
                variant="outline"
              >
                Sign In
              </Button>
              <Button className="w-full">Get Started</Button>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
