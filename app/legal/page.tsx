import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Terms & Privacy - Solray AI",
  description: "Terms of Service, Privacy Policy, Refund Policy & Pricing",
};

export default function LegalPage() {
  return (
    <div className="min-h-screen bg-forest-deep text-text-primary">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-forest-deep border-b border-forest-border">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="w-6 h-6 rounded-full overflow-hidden">
              <Image src="/logo.jpg" alt="Solray" width={24} height={24} className="w-full h-full object-cover" />
            </div>
            <span className="font-heading text-sm tracking-widest uppercase text-text-secondary">Solray</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16 pb-24">
        <h1 className="text-4xl font-heading tracking-wide text-text-primary mb-2">Terms of Service</h1>
        <p className="text-text-secondary mb-8">Privacy Policy, Refund Policy & Pricing</p>
        <p className="text-text-secondary text-sm mb-12">Last Updated: April 9, 2026</p>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          
          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">1. Terms of Service</h2>
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.1 Agreement to Terms</h3>
            <p>By accessing and using the Solray AI application ("Service"), you agree to be bound by these Terms of Service.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.2 Use License</h3>
            <p>Permission is granted for personal, non-commercial use only. You may not:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Modify or copy the materials</li>
              <li>Use for commercial purposes</li>
              <li>Reverse engineer any software</li>
              <li>Remove copyright notices</li>
              <li>Violate any applicable laws</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.3 Disclaimer</h3>
            <p>The materials on Solray AI are provided 'as is' without warranties of any kind.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.4 User Accounts</h3>
            <p>You are responsible for maintaining confidentiality of your account and password. Notify us immediately of unauthorized access.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.5 Governing Law</h3>
            <p>These terms are governed by the laws of Iceland.</p>
          </section>

          <hr className="border-forest-border my-8" />

          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">2. Pricing</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.1 Subscription Cost</h3>
            <p className="text-amber-sun font-semibold">Solray AI Premium: $23 USD per month</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.2 What's Included</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Western Astrology, Human Design, and Gene Keys engines</li>
              <li>Daily AI-generated forecasts</li>
              <li>Higher Self chat with streaming</li>
              <li>Soul connections and compatibility readings</li>
              <li>Extended natal chart with 14+ points</li>
              <li>Full access to all features</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.3 Billing</h3>
            <p>Subscriptions renew monthly unless cancelled. Payments via Lemon Squeezy.</p>
          </section>

          <hr className="border-forest-border my-8" />

          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">3. Refund Policy</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.1 30-Day Money-Back Guarantee</h3>
            <p>If unsatisfied within 30 days of subscription, you get a full refund. No questions asked.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.2 How to Request a Refund</h3>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Email support@solray.ai</li>
              <li>Include your account email</li>
              <li>We process within 5 business days</li>
            </ol>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.3 Refunds After 30 Days</h3>
            <p>Available on a case-by-case basis. Contact support@solray.ai.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.4 Cancellation</h3>
            <p>Cancel anytime through account settings. Access continues until end of billing cycle.</p>
          </section>

          <hr className="border-forest-border my-8" />

          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">4. Privacy Policy</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.1 Information We Collect</h3>
            <p><strong className="text-text-primary">Account:</strong> Name, email, password, birth date/time/location, timezone</p>
            <p className="mt-2"><strong className="text-text-primary">Usage:</strong> Pages visited, features used, chart data, chat history, device info</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.2 How We Use Your Information</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Generate accurate calculations</li>
              <li>Personalize forecasts and chat</li>
              <li>Process payments</li>
              <li>Send transactional emails</li>
              <li>Improve the Service</li>
              <li>Ensure security</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.3 Data Storage & Security</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Birth data stored securely</li>
              <li>Passwords hashed, never plain text</li>
              <li>HTTPS encryption for transmissions</li>
              <li>No third-party data sharing</li>
              <li>Retained while account active + 30 days</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.4 Third-Party Services</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong className="text-text-primary">Lemon Squeezy:</strong> Payment processing</li>
              <li><strong className="text-text-primary">Railway:</strong> Hosting</li>
              <li><strong className="text-text-primary">Claude AI:</strong> Higher Self chat</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.5 Your Rights</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion</li>
              <li>Opt-out of communications</li>
              <li>Data portability</li>
            </ul>
            <p className="mt-4">Contact: <a href="mailto:privacy@solray.ai" className="text-amber-sun hover:underline">privacy@solray.ai</a></p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.6 GDPR & CCPA Compliance</h3>
            <p>EU and California residents have additional privacy rights. Email privacy@solray.ai to exercise them.</p>
          </section>

          <hr className="border-forest-border my-8" />

          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">5. Contact</h2>
            <p>Questions about terms, privacy, or refunds?</p>
            <ul className="space-y-2 mt-4">
              <li><a href="mailto:support@solray.ai" className="text-amber-sun hover:underline">support@solray.ai</a></li>
              <li><a href="mailto:privacy@solray.ai" className="text-amber-sun hover:underline">privacy@solray.ai</a></li>
              <li><a href="https://solray.ai" className="text-amber-sun hover:underline">https://solray.ai</a></li>
            </ul>
            <p className="mt-4 text-sm">Response within 48 business hours.</p>
          </section>

          <hr className="border-forest-border my-8" />

          <p className="text-xs text-center text-text-secondary mt-12">
            © 2026 Solray. All rights reserved. Built with intention.
          </p>
        </div>
      </div>
    </div>
  );
}
