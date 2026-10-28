import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/register-sw";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERAM Meeting Planner",
  description: "Meetings, tasks and clients for ERAM Holdings",
  // The red W reads on both light and dark browser tabs, so one set of icons serves both themes.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/eram-workforce-icon-512.png", type: "image/png", sizes: "512x512" },
    ],
    apple: { url: "/eram-workforce-app-icon-512.png", sizes: "512x512" },
  },
  // Installed on an iPhone home screen: open full screen, with a short name under the icon.
  appleWebApp: { capable: true, title: "ERAM Planner", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#1F3864", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <RegisterServiceWorker />
      </body>
    </html>
  );
}
