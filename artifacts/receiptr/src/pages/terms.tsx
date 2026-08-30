import { LegalPageLayout } from "@/components/LegalPageLayout";

export default function TermsOfService() {
  return (
    <LegalPageLayout
      title="Terms of Service"
      description="The terms that apply when using Receebo's receipt-management service."
    >
      <p>
        These Terms govern your use of Receebo’s website, installable web app,
        receipt-processing features, Gmail integration, notifications, and paid
        subscription service. The service provider is{" "}
        <strong>Receebo, Portugal</strong>.
      </p>
      <p>
        By accepting these Terms, you confirm that you are at least 18 years old
        and agree to the accompanying Privacy Policy. Optional Gmail access,
        email reminders, and push notifications are controlled separately.
      </p>

      <h2>1. The service</h2>
      <p>
        Receebo helps you upload, extract, organise, search, and manage receipts
        and related documents. It may provide estimates of warranty or consumer
        return periods and can retrieve likely receipt PDFs from Gmail after you
        grant read-only access. Features may change as the service develops.
      </p>

      <h2>2. One-receipt onboarding test</h2>
      <p>
        A visitor may be offered one temporary receipt upload to see an
        extraction result before creating an account. This is a limited product
        demonstration, not a permanent free plan. You must create an account,
        accept these Terms, choose a paid plan, and start the trial to save that
        receipt and continue using Receebo. Unsaved demonstration data may be
        deleted after the onboarding session expires.
      </p>

      <h2>3. Accounts</h2>
      <ul>
        <li>You must provide accurate information and keep your login secure.</li>
        <li>
          You are responsible for activity under your account and should contact
          Receebo promptly if you suspect unauthorised access.
        </li>
        <li>
          Accounts are personal unless Receebo expressly offers a team or
          business plan. You may not share access in a way that bypasses plan
          limits or security controls.
        </li>
      </ul>

      <h2>4. Trials, subscriptions, and renewal</h2>
      <ul>
        <li>
          Receebo offers monthly and yearly paid plans. Current prices, taxes,
          billing frequency, and included features are shown before checkout.
        </li>
        <li>
          Eligible subscriptions begin with a seven-day trial. A payment method
          is collected by Stripe, and the selected plan automatically becomes a
          paid, recurring subscription when the trial ends unless you cancel
          beforehand.
        </li>
        <li>
          Subscriptions renew for the selected billing period until cancelled.
          You can manage or cancel renewal through the Stripe billing portal
          linked in Settings.
        </li>
        <li>
          Cancellation normally stops future renewal and leaves access available
          until the end of the paid period, unless the service or law requires
          immediate termination. Deleting your account cancels the known active
          subscription before account data is removed.
        </li>
        <li>
          Payments are normally non-refundable after a billing period starts,
          except where applicable consumer law requires a refund or Receebo
          expressly agrees otherwise. Nothing in these Terms limits mandatory
          EU or Portuguese consumer rights, including any applicable withdrawal,
          conformity, or remedy rights.
        </li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You keep ownership of receipt images, documents, and other content you
        upload. You grant Receebo a limited licence to host, copy, transmit, and
        process that content only as needed to provide, secure, and support the
        service. You confirm that you have the right to upload the content and
        that doing so does not unlawfully disclose another person’s data.
      </p>

      <h2>6. Gmail, notifications, and third-party services</h2>
      <p>
        Gmail connection is optional and uses read-only access for receipt
        retrieval. You can disconnect it at any time. Email and browser
        notifications are conveniences and may be delayed, blocked, or
        unavailable because of device, provider, or network settings. Receebo
        also depends on third-party services including Clerk, Replit, OpenAI,
        Stripe, Google, Resend, and browser push providers. Their availability
        and separate terms may affect features.
      </p>

      <h2>7. AI and reminder limitations</h2>
      <p>
        OCR and AI extraction can be inaccurate. Receipt categories, totals,
        products, warranties, return windows, and other results are informational
        aids and must be checked against the original receipt, retailer terms,
        manufacturer warranty, and applicable law. Receebo is not a legal,
        tax, accounting, warranty, or consumer-rights adviser. You remain
        responsible for acting before any deadline.
      </p>

      <h2>8. Acceptable use</h2>
      <p>You must not:</p>
      <ul>
        <li>use Receebo for unlawful, fraudulent, or abusive activity;</li>
        <li>upload malware or content you are not entitled to process;</li>
        <li>probe, disrupt, overload, scrape, or bypass security or usage controls;</li>
        <li>use repeated guest sessions to obtain an ongoing free service;</li>
        <li>reverse engineer the service except where law expressly permits it; or</li>
        <li>use the service to infringe privacy, intellectual-property, or other rights.</li>
      </ul>

      <h2>9. Availability and changes</h2>
      <p>
        Receebo aims to provide a reliable service but does not promise
        uninterrupted or error-free availability. Maintenance, security events,
        provider outages, legal requirements, or product changes may temporarily
        limit features. Receebo may change or discontinue features with
        reasonable notice where practical, especially if a change materially
        affects a paid subscription.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        You may cancel your subscription or delete your account through
        Settings. Receebo may suspend or terminate access for serious or repeated
        breach, fraud, security risk, non-payment, or legal necessity. Where
        appropriate, Receebo will provide notice and an opportunity to remedy
        the issue. Terms that by nature should survive termination—including
        payment obligations, ownership, disclaimers, and liability limits—remain
        in effect.
      </p>

      <h2>11. Liability</h2>
      <p>
        To the fullest extent permitted by law, Receebo is not liable for
        indirect or consequential loss, lost opportunities, or loss caused by
        reliance on an inaccurate extraction or reminder. Receebo’s aggregate
        liability relating to the service will not exceed the amount you paid
        Receebo in the 12 months before the event giving rise to the claim.
        These limits do not apply where liability cannot legally be excluded or
        limited, including mandatory consumer protections.
      </p>

      <h2>12. Governing law and disputes</h2>
      <p>
        These Terms are governed by Portuguese law. If you are an EU consumer,
        you also retain mandatory protections and the right to bring proceedings
        in the courts available under applicable consumer law. Please first
        contact <a href="mailto:contact@receebo.net">contact@receebo.net</a> so
        Receebo can try to resolve the issue.
      </p>

      <h2>13. Changes and contact</h2>
      <p>
        Receebo may update these Terms to reflect service, provider, business, or
        legal changes. Material changes will be communicated and may require
        renewed acceptance. Questions can be sent to{" "}
        <a href="mailto:contact@receebo.net">contact@receebo.net</a>.
      </p>
    </LegalPageLayout>
  );
}