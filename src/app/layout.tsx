import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SessionProvider from "@/components/SessionProvider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXTAUTH_URL ?? "https://s3.nexuses.xyz";

export const metadata: Metadata = {
  title: "S3 Upload | Nexuses",
  description: "Upload files to Amazon S3, manage buckets, and get object URLs. Sign in to upload or create buckets with Nexuses.",
  icons: {
    icon: "https://cdn-nexlink.s3.us-east-2.amazonaws.com/Group_15_b5d5ad17-292a-47a6-a4e1-636f541568ae.png",
    shortcut: "https://cdn-nexlink.s3.us-east-2.amazonaws.com/Group_15_b5d5ad17-292a-47a6-a4e1-636f541568ae.png",
    apple: "https://cdn-nexlink.s3.us-east-2.amazonaws.com/Group_15_b5d5ad17-292a-47a6-a4e1-636f541568ae.png",
  },
  openGraph: {
    title: "S3 Upload | Nexuses",
    description: "Upload files to Amazon S3, manage buckets, and get object URLs. Sign in to upload or create buckets with Nexuses.",
    url: SITE_URL,
    siteName: "Nexuses",
    images: [
      {
        url: "https://nexuses.s3.us-east-2.amazonaws.com/Screenshot_2026-02-03_at_4.04.56_PM.png",
        width: 1200,
        height: 630,
        alt: "Nexuses S3 Upload",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "S3 Upload | Nexuses",
    description: "Upload files to Amazon S3, manage buckets, and get object URLs. Sign in to upload or create buckets with Nexuses.",
    images: ["https://nexuses.s3.us-east-2.amazonaws.com/Screenshot_2026-02-03_at_4.04.56_PM.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen`}
      >
        <div
          className="fixed inset-0 -z-10 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url(https://nexuseslink2024.s3.us-east-2.amazonaws.com/directly-shot-laptop-table-against-white-background__2_.jpg)",
          }}
        />
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
