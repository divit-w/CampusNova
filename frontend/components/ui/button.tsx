"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 ease-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-blue-600 to-cyan-500 text-primary-foreground shadow-inset-soft hover:scale-[1.02] hover:shadow-glow-btn-primary hover:brightness-105",
        secondary: "bg-white/60 backdrop-blur-md border border-white/40 text-foreground shadow-sm hover:scale-[1.02] hover:bg-white/80 transition-all duration-300 ease-spring",
        outline: "border border-white/40 bg-transparent backdrop-blur-md text-foreground shadow-sm hover:scale-[1.02] hover:bg-white/40 transition-all duration-300 ease-spring",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        destructive:
          "bg-gradient-to-r from-destructive to-destructive/80 text-destructive-foreground shadow-inset-soft hover:scale-[1.02] hover:shadow-glow-btn-destructive hover:brightness-105",
        success:
          "bg-gradient-to-r from-success to-success/80 text-success-foreground shadow-inset-soft hover:scale-[1.02] hover:shadow-glow-btn-success hover:brightness-105",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 rounded-lg px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-12 rounded-xl px-6 text-base",
        icon: "h-10 w-10 rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  },
)
Button.displayName = "Button"

export { Button, buttonVariants }
