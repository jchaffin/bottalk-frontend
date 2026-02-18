import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";
import ThemeToggle from "@/components/ThemeToggle";
import { LayoutDashboard, MessageSquare, Radio, Phone } from "lucide-react";

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
  title: "OutRival Dashboard",
  description: "Agent performance metrics, latency tracking, and KPI outcomes",
};

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
  const pccConsoleUrl =
    process.env.NEXT_PUBLIC_PCC_CONSOLE_URL ||
    "https://pipecat.daily.co/solid-earwig-harlequin-473/agents";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${duran.variable} ${schibstedGrotesk.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {/* Top navigation bar */}
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-lg">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link
                href="/"
                className="text-lg font-bold tracking-tight text-foreground"
                style={{ fontFamily: "var(--font-display), Duran, sans-serif" }}
              >
                OutRival
              </Link>
              <nav className="hidden sm:flex items-center gap-1">
                <Link
                  href="/"
                  className="text-xs font-medium text-muted hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-surface-elevated transition-all flex items-center gap-1.5"
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  Dashboard
                </Link>
                <Link
                  href="/transcripts"
                  className="text-xs font-medium text-muted hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-surface-elevated transition-all flex items-center gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Transcripts
                </Link>
                <Link
                  href="/sessions"
                  className="text-xs font-medium text-muted hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-surface-elevated transition-all flex items-center gap-1.5"
                >
                  <Radio className="w-3.5 h-3.5" />
                  Sessions
                </Link>
                <Link
                  href="/call"
                  className="text-xs font-medium text-white bg-accent hover:bg-accent-hover px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Start Call
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={pccConsoleUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted bg-surface-elevated px-2.5 py-1 rounded-lg border border-border hover:bg-border/50 transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
                PCC Connected
              </a>
              <ThemeToggle />
            </div>
          </div>
        </header>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>

        {/* Footer */}
        <footer className="border-t border-border/50 mt-12">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <p className="text-[10px] text-muted/40">
              &copy; {new Date().getFullYear()} Jacob Chaffin &middot; OutRival
            </p>
            <p className="text-[10px] text-muted/40">
              Powered by Pipecat Cloud + Pinecone
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
