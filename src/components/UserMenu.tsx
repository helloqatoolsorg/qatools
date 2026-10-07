"use client";

import {
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/context/AuthContext";

type MenuPosition = {
  top: number;
  right: number;
};

export default function UserMenu() {
  const {
    user,
    loading,
    signIn,
  } = useAuth();

  const menuRef =
    useRef<HTMLDivElement>(null);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    position,
    setPosition,
  ] =
    useState<MenuPosition>({
      top: 68,
      right: 26,
    });

  const [
    email,
    setEmail,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    busy,
    setBusy,
  ] = useState(false);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null
    );

  /*
    Intercept clicks on the existing
    user icon anywhere on the site.

    Logged out:
    stop navigation and open this menu.

    Logged in:
    do nothing and let the existing
    link navigate normally to /user.
  */
  useEffect(() => {
    function handleUserIconClick(
      event: MouseEvent
    ) {
      const target =
        event.target as HTMLElement;

      const userLink =
        target.closest(
          'a.icon-link[href="/user"]'
        ) as HTMLAnchorElement | null;

      if (!userLink) {
        return;
      }

      if (
        loading ||
        user
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const rect =
        userLink.getBoundingClientRect();

      setPosition({
        top:
          rect.bottom + 8,

        right:
          window.innerWidth -
          rect.right,
      });

      setError(null);

      setOpen(
        (current) =>
          !current
      );
    }

    document.addEventListener(
      "click",
      handleUserIconClick,
      true
    );

    return () => {
      document.removeEventListener(
        "click",
        handleUserIconClick,
        true
      );
    };
  }, [
    user,
    loading,
  ]);

  /*
    When a login succeeds, auth state
    changes and the menu disappears.
  */
  useEffect(() => {
    if (user) {
      setOpen(false);
      setPassword("");
      setError(null);
    }
  }, [user]);

  /*
    Close when clicking elsewhere.
  */
  useEffect(() => {
    function handleOutsideClick(
      event: MouseEvent
    ) {
      if (!open) {
        return;
      }

      const target =
        event.target as Node;

      if (
        menuRef.current?.contains(
          target
        )
      ) {
        return;
      }

      const element =
        event.target as HTMLElement;

      if (
        element.closest(
          'a.icon-link[href="/user"]'
        )
      ) {
        return;
      }

      setOpen(false);
    }

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
      "mousedown",
      handleOutsideClick
    );

    document.addEventListener(
      "keydown",
      handleEscape
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutsideClick
      );

      document.removeEventListener(
        "keydown",
        handleEscape
      );
    };
  }, [open]);

  async function handleLogIn(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail =
      email.trim();

    if (
      !cleanEmail ||
      !password
    ) {
      return;
    }

    setBusy(true);
    setError(null);

    const result =
      await signIn(
        cleanEmail,
        password
      );

    if (result.error) {
      setError(
        result.error
      );

      setBusy(false);
      return;
    }

    setBusy(false);
  }

  if (
    !open ||
    user ||
    loading
  ) {
    return null;
  }

  return (
    <div
      ref={menuRef}
      className="qatools-user-menu"
      style={{
        position: "fixed",

        top:
          `${position.top}px`,

        right:
          `${position.right}px`,

        zIndex: 250,

        width: "250px",

        padding: "18px",

        border:
          "1px solid #292929",

        background:
          "#101010",

        boxShadow:
          "0 18px 42px rgba(0,0,0,.45)",
      }}
    >
      <div
        style={{
          marginBottom:
            "17px",

          color: "#555",

          font:
            "9px monospace",

          letterSpacing:
            ".1em",
        }}
      >
        ACCOUNT
      </div>

      <form
        onSubmit={
          handleLogIn
        }
        style={{
          display: "grid",
          gap: "12px",
        }}
      >
        <label
          style={{
            display: "grid",
            gap: "6px",

            color: "#666",

            font:
              "8px monospace",
          }}
        >
          EMAIL

          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(
              event
            ) =>
              setEmail(
                event.target.value
              )
            }
            style={{
              width: "100%",
              height: "36px",

              border:
                "1px solid #2a2a2a",

              background:
                "#0d0d0d",

              color: "#ccc",

              padding:
                "0 9px",

              outline: "none",

              font:
                "9px monospace",
            }}
          />
        </label>

        <label
          style={{
            display: "grid",
            gap: "6px",

            color: "#666",

            font:
              "8px monospace",
          }}
        >
          PASSWORD

          <input
            type="password"
            required
            autoComplete="current-password"
            value={
              password
            }
            onChange={(
              event
            ) =>
              setPassword(
                event.target.value
              )
            }
            style={{
              width: "100%",
              height: "36px",

              border:
                "1px solid #2a2a2a",

              background:
                "#0d0d0d",

              color: "#ccc",

              padding:
                "0 9px",

              outline: "none",

              font:
                "9px monospace",
            }}
          />
        </label>

        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            height: "38px",

            marginTop: "2px",

            border:
              "1px solid #ededeb",

            background:
              "#ededeb",

            color:
              "#0d0d0d",

            cursor:
              busy
                ? "default"
                : "pointer",

            opacity:
              busy
                ? 0.45
                : 1,

            font:
              "500 9px monospace",
          }}
        >
          {busy
            ? "LOGGING IN..."
            : "LOG IN"}
        </button>
      </form>

      {error && (
        <p
          style={{
            margin:
              "12px 0 0",

            color:
              "#e86565",

            font:
              "8px monospace",

            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      )}

      <div
        style={{
          marginTop:
            "16px",

          paddingTop:
            "13px",

          borderTop:
            "1px solid #222",

          display: "flex",

          alignItems:
            "center",

          justifyContent:
            "space-between",

          gap: "12px",
        }}
      >
        <a
          href="/user?mode=reset"
          style={{
            color: "#666",

            font:
              "8px monospace",
          }}
        >
          FORGOT PASSWORD
        </a>

        <a
          href="/user?mode=signup"
          style={{
            color: "#999",

            font:
              "8px monospace",
          }}
        >
          SIGN UP
        </a>
      </div>
    </div>
  );
}