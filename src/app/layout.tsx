import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import { History } from "lucide-react";

const duran = localFont({
  src: [
    { path: "../../public/fonts/Duran-Thin.woff2", weight: "100", style: "normal" },
    { path: "../../public/fonts/Duran-Light.woff2", weight: "300", style: "normal" },
    { path: "../../public/fonts/Duran-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/Duran-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-duran",
  display: "swap",
});

const schibstedGrotesk = Schibsted_Grotesk({
  variable: "--font-schibsted",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OutRival Technical Project",
  description: "Watch two AI voice agents have a real-time conversation",
};

// Inline script to apply theme before first paint (prevents flash)
const themeScript = `
(function(){
  try {
    var t = localStorage.getItem('theme') || 'system';
    var dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${duran.variable} ${schibstedGrotesk.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2">
          <Link
            href="/transcripts"
            aria-label="Conversation history"
            title="Conversation history"
            className="w-9 h-9 rounded-xl bg-surface border border-border flex items-center justify-center text-muted hover:text-foreground hover:border-foreground/20 transition-all"
          >
            <History className="w-4 h-4" />
          </Link>
          <ThemeToggle />
        </div>
        {children}
      </body>
    </html>
  );
}
