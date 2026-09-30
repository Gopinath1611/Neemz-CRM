import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * PageContainer — unified page shell.
 * Applies the global `.page-shell` class (consistent padding + max-width so
 * lists never stretch edge-to-edge when the sidebar is open). Use as the
 * outermost wrapper of any page for perfect alignment across the app.
 *
 * Note: CRMLayout already wraps <Outlet/> in `.page-shell`, so pages get
 * this by default. Use this component for pages rendered outside the layout
 * or when composing nested sections.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("page-shell", className)}>{children}</div>;
}

/**
 * StickyTableScroll — wrap any wide table so the horizontal scrollbar stays
 * pinned to the bottom of the visible area (viewport-anchored), not the
 * bottom of the entire list. Users no longer need to scroll to the last row
 * to reveal the scrollbar.
 *
 * Usage:
 *   <StickyTableScroll>
 *     <table>...</table>
 *   </StickyTableScroll>
 */
export function StickyTableScroll({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("sticky-x-scroll rounded-md border bg-card", className)}>
      {children}
    </div>
  );
}

export default PageContainer;
