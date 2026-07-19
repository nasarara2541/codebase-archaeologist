import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RepoLens — See the product. Trace the code.",
  description:
    "Open a safe live preview of a frontend repository and connect visible features to their source code.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
