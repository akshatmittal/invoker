import type React from "react";

import { Button } from "#components/button";

import { Logo } from "./logo";

const navLinks = [
  { href: "#", label: "Features" },
  { href: "#", label: "Blog" },
  { href: "#", label: "About" },
  { href: "#", label: "Contact" },
  { href: "#", label: "Licence" },
  { href: "#", label: "Privacy" },
];

const socialLinks = [
  {
    href: "#",
    label: "X",
    icon: <XIcon data-icon="inline-start" />,
  },
  {
    href: "#",
    label: "Github",
    icon: <GitHubIcon data-icon="inline-start" />,
  },
];

export function Footer() {
  return (
    <footer className="mx-auto max-w-5xl *:px-4 *:md:px-6">
      <div className="flex flex-col gap-6 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo className="h-4.5" />
          </div>
          <div className="flex items-center">
            {socialLinks.map(({ href, label, icon }) => (
              <Button
                asChild
                key={label}
                size="icon-sm"
                variant="ghost"
              >
                <a
                  aria-label={label}
                  href={href}
                >
                  {icon}
                </a>
              </Button>
            ))}
          </div>
        </div>

        <nav>
          <ul className="flex flex-wrap gap-4 text-sm font-medium text-muted-foreground md:gap-6">
            {navLinks.map((link) => (
              <li key={link.label}>
                <a
                  className="hover:text-foreground"
                  href={link.href}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="flex items-center justify-between gap-4 border-t py-4 text-sm text-muted-foreground">
        <p>&copy; {new Date().getFullYear()} efferd</p>

        <p className="inline-flex items-center gap-1">
          <span>Built by</span>
          <a
            aria-label="x/twitter"
            className="inline-flex items-center gap-1 text-foreground/80 hover:text-foreground hover:underline"
            href={"https://x.com/shabanhr"}
            rel="noreferrer"
            target="_blank"
          >
            <img
              alt="shaban"
              className="size-4 rounded-full"
              height="auto"
              src="https://github.com/shabanhr.png"
              width="auto"
            />
            Shaban
          </a>
        </p>
      </div>
    </footer>
  );
}

function XIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="m18.9,1.153h3.682l-8.042,9.189,9.46,12.506h-7.405l-5.804-7.583-6.634,7.583H.469l8.6-9.831L0,1.153h7.593l5.241,6.931,6.065-6.931Zm-1.293,19.494h2.039L6.482,3.239h-2.19l13.314,17.408Z" />
    </svg>
  );
}

function GitHubIcon(props: React.ComponentProps<"svg">) {
  return (
    <svg
      fill="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M12 2C6.477 2 2 6.591 2 12.253c0 4.528 2.865 8.369 6.839 9.725.5.095.683-.222.683-.494 0-.244-.009-.889-.014-1.745-2.782.62-3.369-1.375-3.369-1.375-.455-1.185-1.11-1.501-1.11-1.501-.909-.637.069-.624.069-.624 1.004.073 1.533 1.057 1.533 1.057.893 1.567 2.342 1.115 2.913.852.091-.663.35-1.115.636-1.371-2.221-.259-4.555-1.139-4.555-5.067 0-1.119.39-2.034 1.03-2.751-.103-.26-.446-1.301.098-2.713 0 0 .84-.276 2.75 1.051A9.408 9.408 0 0 1 12 6.951a9.41 9.41 0 0 1 2.504.346c1.909-1.327 2.747-1.051 2.747-1.051.546 1.412.203 2.453.1 2.713.641.717 1.028 1.632 1.028 2.751 0 3.938-2.337 4.805-4.566 5.059.359.317.679.943.679 1.9 0 1.371-.013 2.477-.013 2.815 0 .274.18.594.688.493C19.138 20.619 22 16.779 22 12.253 22 6.591 17.523 2 12 2Z" />
    </svg>
  );
}
