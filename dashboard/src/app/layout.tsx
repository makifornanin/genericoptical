import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Inter_Tight } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const interTight = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], display: "swap" });
const instrument = Instrument_Sans({ variable: "--font-instrument", subsets: ["latin"], weight: ["500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Optical business platform", template: "%s" },
  description: "Eye care and eyewear — point of sale, orders, inventory, CRM and reporting.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#18191b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${interTight.variable} ${instrument.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast: "!rounded-[12px] !border !border-line !bg-surface !text-text !shadow-[var(--shadow-pop)] !font-sans",
              description: "!text-text-2",
            },
          }}
        />
      </body>
    </html>
  );
}
