import type {
  Metadata,
} from "next";

import {
  Geist,
  Geist_Mono,
} from "next/font/google";

import AppShell from "@/components/site/AppShell";

import "./globals.css";

const geistSans =
  Geist({
    variable:
      "--font-geist-sans",

    subsets: [
      "latin",
    ],
  });

const geistMono =
  Geist_Mono({
    variable:
      "--font-geist-mono",

    subsets: [
      "latin",
    ],
  });

export const metadata:
  Metadata = {
    title: {
      default:
        "DictazIQ | Football Intelligence",

      template:
        "%s | DictazIQ",
    },

    description:
      "DictazIQ football predictions, live match intelligence, evidence-driven analysis and transparent performance tracking.",

    applicationName:
      "DictazIQ",

    category:
      "sports",

    robots: {
      index:
        false,

      follow:
        false,
    },
  };

export default function RootLayout({
  children,
}: {
  children:
    React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <AppShell>
          {
            children
          }
        </AppShell>
      </body>
    </html>
  );
}