import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import React from "react";
import { afterEach, vi } from "vitest";

export const routerPushMock = vi.fn();
export const routerReplaceMock = vi.fn();
export const useParamsMock = vi.fn(() => ({ id: "workout-1" }));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    href: string | { pathname?: string };
    children: React.ReactNode;
  }) => {
    const hrefObject = href as { pathname?: string } | string;
    const resolvedHref =
      typeof hrefObject === "string"
        ? hrefObject
        : hrefObject.pathname ?? "/";

    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: routerReplaceMock,
    prefetch: vi.fn(),
  }),
  useParams: useParamsMock,
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  routerPushMock.mockReset();
  routerReplaceMock.mockReset();
  useParamsMock.mockReset();
  useParamsMock.mockReturnValue({ id: "workout-1" });
  vi.restoreAllMocks();
});
