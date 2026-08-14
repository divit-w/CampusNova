import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { Toaster } from "sonner"
import { AuthProvider } from "@/lib/auth"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
})

export const metadata: Metadata = {
  title: "CampusNova — Intelligent Campus Operations",
  description:
    "CampusNova unifies AI-assisted ERP queries, constraint-based timetable generation, and real-time substitute resolution into one calm, fast operations console.",
  applicationName: "CampusNova",
}

export const viewport: Viewport = {
  themeColor: "#0a84ff",
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} bg-surface`}>
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            classNames: {
              toast:
                "!rounded-2xl !border !border-border !bg-card !text-card-foreground !shadow-soft-lg !font-sans",
              title: "!text-sm !font-medium",
              description: "!text-xs !text-muted-foreground",
            },
          }}
        />
      </body>
    </html>
  )
}
