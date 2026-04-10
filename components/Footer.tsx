"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Footer() {
  const pathname = usePathname();
  
  // Only show footer on legal page — nowhere else in the app
  const showFooter = pathname === "/legal";
  
  if (!showFooter) return null;

  return (
    <footer className="bg-forest-deep border-t border-forest-border mt-16">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-8">
          {/* Brand */}
          <div>
            <h3 className="font-heading text-sm tracking-widest uppercase text-text-secondary mb-4">
              Solray
            </h3>
            <p className="text-text-secondary text-sm leading-relaxed">
              Spiritual companion app powered by Western Astrology, Human Design, and Gene Keys.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-heading text-xs tracking-widest uppercase text-text-secondary mb-4">
              Legal
            </h4>
            <nav className="space-y-2">
              <Link href="/legal" className="text-text-secondary hover:text-amber-sun transition text-sm">
                Terms & Privacy
              </Link>
              <p className="text-text-secondary text-sm">
                30-day refund guarantee
              </p>
              <p className="text-text-secondary text-sm">
                $23/month
              </p>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading text-xs tracking-widest uppercase text-text-secondary mb-4">
              Contact
            </h4>
            <nav className="space-y-2">
              <a href="mailto:support@solray.ai" className="text-text-secondary hover:text-amber-sun transition text-sm block">
                support@solray.ai
              </a>
              <a href="mailto:privacy@solray.ai" className="text-text-secondary hover:text-amber-sun transition text-sm block">
                privacy@solray.ai
              </a>
            </nav>
          </div>
        </div>

        <div className="border-t border-forest-border pt-8">
          <p className="text-text-secondary text-xs text-center">
            © 2026 Solray. All rights reserved. Built with intention.
          </p>
        </div>
      </div>
    </footer>
  );
}
