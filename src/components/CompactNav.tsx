"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  createPortal,
} from "react-dom";

import {
  usePathname,
} from "next/navigation";

export default function CompactNav() {
  const pathname =
    usePathname();

  const [
    header,
    setHeader,
  ] =
    useState<HTMLElement | null>(
      null
    );

  const [
    open,
    setOpen,
  ] = useState(false);

  const menuRef =
    useRef<HTMLDivElement>(null);

  useEffect(() => {
    const siteHeader =
      document.querySelector(
        ".site-header"
      ) as HTMLElement | null;

    setHeader(siteHeader);
  }, [pathname]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleOutsideClick(
      event: MouseEvent
    ) {
      const target =
        event.target as Node;

      if (
        menuRef.current?.contains(
          target
        )
      ) {
        return;
      }

      setOpen(false);
    }

    document.addEventListener(
      "mousedown",
      handleOutsideClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );
    };
  }, [open]);

  useEffect(() => {
    function handleEscape(
      event: KeyboardEvent
    ) {
      if (
        event.key === "Escape"
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, []);

  if (!header) {
    return null;
  }

  return createPortal(
    <div
      className="compact-nav"
      ref={menuRef}
    >
      <button
        className={`compact-nav-trigger ${
          open ? "open" : ""
        }`}
        type="button"
        aria-label="Open navigation"
        aria-expanded={open}
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
      >
        <span />
        <span />
        <span />
      </button>

      <nav
        className={`compact-nav-menu ${
          open ? "open" : ""
        }`}
      >
        <a
          className={
            pathname === "/"
              ? "active"
              : ""
          }
          href="/"
          onClick={() =>
            setOpen(false)
          }
        >
          products
        </a>

        <a
          className={
            pathname === "/install"
              ? "active"
              : ""
          }
          href="/install"
          onClick={() =>
            setOpen(false)
          }
        >
          how to install
        </a>

        <a
          className={
            pathname ===
            "/whats-new"
              ? "active"
              : ""
          }
          href="/whats-new"
          onClick={() =>
            setOpen(false)
          }
        >
          what&apos;s new
        </a>
      </nav>
    </div>,
    header
  );
}