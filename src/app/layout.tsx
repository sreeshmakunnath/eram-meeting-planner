import type { Metadata } from "next";
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
