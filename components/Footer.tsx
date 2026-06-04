"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT } from "@/lib/i18n";

export default function Footer() {
  const pathname = usePathname();
  const { t } = useT();

  // Only show footer on legal page, nowhere else in the app
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
              {t("footer.brand_description")}
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-heading text-xs tracking-widest uppercase text-text-secondary mb-4">
              {t("footer.legal")}
            </h4>
            <nav className="space-y-2">
              <Link href="/legal" className="text-text-secondary hover:text-amber-sun transition text-sm">
                {t("footer.terms_privacy")}
              </Link>
              <p className="text-text-secondary text-sm">
                {t("footer.refund")}
              </p>
              <p className="text-text-secondary text-sm">
                {t("footer.price")}
              </p>
            </nav>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-heading text-xs tracking-widest uppercase text-text-secondary mb-4">
              {t("footer.contact")}
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
            {t("footer.copyright")}
          </p>
        </div>
      </div>
    </footer>
  );
}
