import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceKit Demo Agent",
  description: "Voice AI Agent example using @kond/voicekit",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
