"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export default function LegalPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

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
          <nav className="flex gap-6 text-sm">
            <Link href="/" className="text-text-secondary hover:text-text-primary transition">
              Home
            </Link>
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-16 pb-24">
        <h1 className="text-4xl font-heading tracking-wide text-text-primary mb-2">Terms of Service</h1>
        <p className="text-text-secondary mb-8">Privacy Policy, Refund Policy & Pricing</p>
        <p className="text-text-secondary text-sm mb-12">Last Updated: April 9, 2026</p>

        <div className="space-y-8 text-text-secondary leading-relaxed">
          {/* Section 1 */}
          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">1. Terms of Service</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.1 Agreement to Terms</h3>
            <p>By accessing and using the Solray AI application ("Service"), you agree to be bound by these Terms of Service. If you do not agree to abide by the above, please do not use this service.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.2 Use License</h3>
            <p>Permission is granted to temporarily download one copy of the materials (information or software) on Solray AI for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Modify or copy the materials</li>
              <li>Use the materials for any commercial purpose or for any public display</li>
              <li>Attempt to decompile or reverse engineer any software contained on the Service</li>
              <li>Remove any copyright or other proprietary notations from the materials</li>
              <li>Transfer the materials to another person or "mirror" the materials on any other server</li>
              <li>Violate any applicable laws or regulations in your jurisdiction</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.3 Disclaimer</h3>
            <p>The materials on Solray AI are provided on an 'as is' basis. Solray makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.4 User Accounts</h3>
            <p>You are responsible for maintaining the confidentiality of your account information and password. You agree to accept responsibility for all activities that occur under your account. You must notify Solray immediately of any unauthorized uses of your account.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.5 Prohibited Activities</h3>
            <p>You agree not to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Harass or cause distress to other users</li>
              <li>Engage in any illegal activity</li>
              <li>Attempt to gain unauthorized access to the Service</li>
              <li>Use the Service to transmit viruses or malware</li>
              <li>Spam or flood the Service with unsolicited communications</li>
              <li>Violate any applicable laws or regulations</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">1.6 Governing Law</h3>
            <p>These terms and conditions are governed by and construed in accordance with the laws of Iceland, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.</p>
          </section>

          <hr className="border-forest-border my-8" />

          {/* Section 2 */}
          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">2. Pricing</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.1 Subscription Cost</h3>
            <p className="text-amber-sun font-semibold">Solray AI Premium: $23 USD per month</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.2 What's Included</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Access to all three calculation engines: Western Astrology, Human Design, and Gene Keys</li>
              <li>Daily AI-generated forecasts personalized to your chart</li>
              <li>Higher Self chat with streaming responses</li>
              <li>Soul connections and compatibility readings</li>
              <li>Extended natal chart with 14+ points</li>
              <li>Full access to all features and updates</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.3 Billing</h3>
            <p>Subscriptions are billed monthly on the same day each month. Your subscription will automatically renew unless you cancel.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">2.4 Payment Methods</h3>
            <p>Payments are processed securely via Lemon Squeezy. We accept all major credit and debit cards.</p>
          </section>

          <hr className="border-forest-border my-8" />

          {/* Section 3 */}
          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">3. Refund Policy</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.1 30-Day Money-Back Guarantee</h3>
            <p>If you are not satisfied with Solray AI within the first 30 days of your subscription, you are entitled to a full refund of your subscription fee. No questions asked.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.2 How to Request a Refund</h3>
            <p>To request a refund:</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Email support@solray.ai with your request</li>
              <li>Include your account email and reason for refund (optional but helpful)</li>
              <li>We will process your refund within 5 business days</li>
            </ol>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.3 Refunds After 30 Days</h3>
            <p>After the initial 30-day period, refunds are available on a case-by-case basis. Contact support@solray.ai to discuss your situation.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.4 Cancellation</h3>
            <p>You may cancel your subscription at any time through your account settings. Cancellation takes effect at the end of your current billing cycle. You will retain access to the Service until the end of the paid period.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">3.5 Refund Methods</h3>
            <p>Refunds will be issued to the original payment method used for the subscription. Processing time may vary by financial institution (typically 5-10 business days).</p>
          </section>

          <hr className="border-forest-border my-8" />

          {/* Section 4 */}
          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">4. Privacy Policy</h2>
            
            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.1 Information We Collect</h3>
            <p><strong className="text-text-primary">Account Information:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Name, email address, password</li>
              <li>Birth date, birth time, birth location (required for chart calculations)</li>
              <li>Timezone information</li>
            </ul>

            <p className="mt-4"><strong className="text-text-primary">Usage Information:</strong></p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Pages visited, features used, time spent in app</li>
              <li>Chart data generated and stored</li>
              <li>Chat history and interactions</li>
              <li>Device information (OS, browser, device type)</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.2 How We Use Your Information</h3>
            <p>We use the information we collect to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Generate accurate astrology, Human Design, and Gene Keys calculations</li>
              <li>Personalize your daily forecasts and Higher Self chat</li>
              <li>Process payments and manage subscriptions</li>
              <li>Send you transactional emails (account updates, billing, service notices)</li>
              <li>Improve the Service through analytics and user feedback</li>
              <li>Comply with legal obligations</li>
              <li>Prevent fraud and ensure security</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.3 Data Storage & Security</h3>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Your birth data and chart information are stored securely in our database</li>
              <li>Passwords are hashed and never stored in plain text</li>
              <li>All data transmissions use HTTPS encryption</li>
              <li>We do not sell or share your personal data with third parties for marketing purposes</li>
              <li>Data is retained for as long as your account is active, plus 30 days after cancellation</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.4 Third-Party Services</h3>
            <p>Solray AI uses the following third-party services:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li><strong className="text-text-primary">Lemon Squeezy</strong>: Payment processing</li>
              <li><strong className="text-text-primary">Railway</strong>: Infrastructure and hosting</li>
              <li><strong className="text-text-primary">Claude AI</strong> (Anthropic): Powering the Higher Self chat feature</li>
            </ul>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.5 Your Rights</h3>
            <p>You have the right to:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Access your personal data</li>
              <li>Correct inaccurate information</li>
              <li>Request deletion of your data</li>
              <li>Opt-out of non-essential communications</li>
              <li>Receive a copy of your data in portable format</li>
            </ul>
            <p className="mt-4">To exercise these rights, email <a href="mailto:privacy@solray.ai" className="text-amber-sun hover:underline">privacy@solray.ai</a>.</p>

            <h3 className="text-lg font-heading text-text-primary mt-6 mb-2">4.6 GDPR & CCPA Compliance</h3>
            <p>If you are an EU or California resident, you have additional privacy rights. Contact <a href="mailto:privacy@solray.ai" className="text-amber-sun hover:underline">privacy@solray.ai</a> to exercise your rights.</p>
          </section>

          <hr className="border-forest-border my-8" />

          {/* Section 5 */}
          <section>
            <h2 className="text-2xl font-heading tracking-wide text-text-primary mb-4">5. Contact Us</h2>
            
            <p>For questions about these terms, privacy, refunds, or anything else:</p>
            <ul className="space-y-2 mt-4">
              <li><a href="mailto:support@solray.ai" className="text-amber-sun hover:underline">support@solray.ai</a></li>
              <li><a href="mailto:privacy@solray.ai" className="text-amber-sun hover:underline">privacy@solray.ai</a></li>
              <li><a href="https://solray.ai" className="text-amber-sun hover:underline">https://solray.ai</a></li>
            </ul>
            <p className="mt-4 text-sm">We aim to respond to all inquiries within 48 business hours.</p>
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
