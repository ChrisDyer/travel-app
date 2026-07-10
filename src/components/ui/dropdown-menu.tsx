"use client"

import * as React from "react"
import { Menu } from "@base-ui/react/menu"

import { cn } from "@/lib/utils"

function DropdownMenu({ ...props }: Menu.Root.Props) {
  return <Menu.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuTrigger({ ...props }: Menu.Trigger.Props) {
  return <Menu.Trigger data-slot="dropdown-menu-trigger" {...props} />
}

function DropdownMenuContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "start",
  alignOffset = 0,
  ...props
}: Menu.Popup.Props &
  Pick<Menu.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset">) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <Menu.Popup
          data-slot="dropdown-menu-content"
          className={cn(
            "min-w-44 rounded-lg border border-stone-200 bg-white p-1 shadow-md z-50 no-print data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
            className
          )}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: Menu.Item.Props & { variant?: "default" | "destructive" }) {
  return (
    <Menu.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-stone-700 outline-none cursor-pointer data-highlighted:bg-stone-100 data-highlighted:text-stone-900",
        variant === "destructive" &&
          "text-red-600 data-highlighted:bg-red-50 data-highlighted:text-red-700",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuLinkItem({
  className,
  variant = "default",
  ...props
}: Menu.LinkItem.Props & { variant?: "default" | "destructive" }) {
  return (
    <Menu.LinkItem
      data-slot="dropdown-menu-link-item"
      data-variant={variant}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-stone-700 outline-none cursor-pointer data-highlighted:bg-stone-100 data-highlighted:text-stone-900",
        variant === "destructive" &&
          "text-red-600 data-highlighted:bg-red-50 data-highlighted:text-red-700",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({ className, ...props }: Menu.Separator.Props) {
  return (
    <Menu.Separator
      data-slot="dropdown-menu-separator"
      className={cn("my-1 h-px bg-stone-100", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
}
