import type { Metadata } from "next";
import { Zen_Kaku_Gothic_New } from "next/font/google";
import "./admin.css";
import AdminNav from "./AdminNav";

// The connector's typeface, self-hosted by next/font so the operator pages
// load it the same way the member app loads its own fonts. --font-connector
// feeds --font-heading and --font-body inside .sa-root (see admin.css).
const connector = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-connector",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Solray operations",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${connector.variable} sa-root`}>
      <AdminNav />
      {children}
    </div>
  );
}
