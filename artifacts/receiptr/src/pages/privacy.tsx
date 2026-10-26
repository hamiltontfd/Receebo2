import { LegalPageLayout } from "@/components/LegalPageLayout";

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="How Receebo collects, uses, stores, and protects personal data."
    >
      <p>
        This Privacy Policy explains how Receebo handles personal data when you
        use its receipt-management service, website, installable web app, and
        related features. <strong>Receebo, Portugal</strong> is the data
        controller for the processing described here.
      </p>
      <p>
        Questions or requests can be sent to{" "}
        <a href="mailto:contact@receebo.net">contact@receebo.net</a>. Receebo is
        intended only for people aged 18 or over.
      </p>

      <h2>1. Personal data we process</h2>
      <ul>
        <li>
          <strong>Account data:</strong> name, email address, account identifier,
          login activity, and acceptance of the current Terms and Privacy Policy.
        </li>
        <li>
          <strong>Receipt data:</strong> uploaded receipt images and PDFs,
          merchant, date, products, prices, currency, transaction references,
          category, warranty information, return-window information, OCR text,
          and any documents you attach.
        </li>
        <li>
          <strong>Email connection data:</strong> when you connect a Microsoft
          (Outlook) mailbox, your connected email address, encrypted OAuth
          credentials, message identifiers used to prevent duplicates, sync
          timestamps and connection status, and receipt candidates found in
          your email. Receebo requests read-only mailbox access and uses it only
          to find and process likely receipts, invoices and order confirmations
          for the feature you enable.
        </li>
        <li>
          <strong>Billing data:</strong> plan, subscription status, trial and
          renewal dates, Stripe customer/subscription identifiers, and payment
          events. Complete card details are handled by Stripe and are not stored
          by Receebo.
        </li>
        <li>
          <strong>Notification data:</strong> email-reminder preferences and,
          when you opt in, browser push-subscription endpoints and encryption
          keys needed to deliver notifications.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, browser/device details,
          security logs, error logs, and essential session or local-storage data.
        </li>
      </ul>

      <h2>2. Why we use data and our lawful bases</h2>
      <ul>
        <li>
          <strong>Provide the service and subscription:</strong> to create your
          account, process and organise receipts, search your library, provide
          reminders, and administer your plan. The lawful basis is performance
          of our contract with you.
        </li>
        <li>
          <strong>Optional email import and push features:</strong> to access
          your mailbox on a read-only basis or send browser notifications after you
          choose to enable those features. The lawful basis is your consent,
          which you can withdraw at any time.
        </li>
        <li>
          <strong>Security and reliability:</strong> to prevent abuse, diagnose
          failures, protect accounts, and maintain the service. The lawful basis
          is our legitimate interest in operating a secure service.
        </li>
        <li>
          <strong>Billing and legal records:</strong> to process payments,
          respond to disputes, and meet tax, accounting, and regulatory duties.
          The bases are contract and legal obligation.
        </li>
        <li>
          <strong>Service communications:</strong> to send necessary account,
          receipt-processing, trial, security, and subscription messages. Where
          a message is optional, Receebo provides a separate preference control.
        </li>
      </ul>

      <h2>3. Automated and AI-assisted processing</h2>
      <p>
        Receebo uses AI-assisted OCR and extraction to determine whether an
        uploaded file is a receipt and to identify receipt fields. Receipt images
        or text may be sent to the AI provider solely for this processing.
        Extraction can be incomplete or inaccurate. You should check important
        dates, amounts, warranty details, and return deadlines. Receebo does not
        use receipt extraction to make decisions that produce legal or similarly
        significant effects about you.
      </p>

      <h2>4. Providers and recipients</h2>
      <p>
        Receebo uses service providers under contracts and instructions
        appropriate to their role. The current provider categories include:
      </p>
      <ul>
        <li><strong>Clerk:</strong> account authentication and session management.</li>
        <li>
          <strong>Replit and its infrastructure providers:</strong> application
          hosting, PostgreSQL database, private object storage, operational
          logging, and the managed AI-integration pathway.
        </li>
        <li>
          <strong>OpenAI through Replit AI Integrations:</strong> receipt
          classification, OCR, and structured data extraction.
        </li>
        <li><strong>Stripe:</strong> checkout, trials, subscriptions, invoices, and payments.</li>
        <li>
          <strong>Microsoft:</strong> optional Microsoft account sign-in (OAuth)
          and read-only receipt retrieval through Microsoft Graph when you
          connect an Outlook mailbox.
        </li>
        <li><strong>Resend:</strong> transactional and reminder email delivery.</li>
        <li>
          <strong>Browser push providers:</strong> Apple, Google, Mozilla, or
          another provider selected by your browser/device when you enable push
          notifications.
        </li>
      </ul>
      <p>
        Receebo does not sell personal data. To understand the no-card trial and
        subscription process, Receebo records limited first-party milestones such
        as trial start, successful-upload counts, paywall views, plan choice and
        payment confirmation. These records contain a random internal identifier,
        timestamps and fixed plan or paywall categories, not receipt contents,
        email addresses or payment details. The separate account mapping and
        milestone records are removed when your account is deleted. This
        measurement does not use analytics cookies or third-party tracking scripts.
        Non-essential tracking will not begin before any consent required by law.
      </p>

      <h2>5. Email inbox access (Microsoft Outlook)</h2>
      <p>
        Connecting a mailbox is optional and separate from creating an account.
        Receebo currently supports Microsoft mailboxes (Outlook.com, Hotmail,
        Live and Microsoft 365) through Microsoft Graph. Receebo requests only
        these delegated permissions: <strong>Mail.Read</strong> (read-only
        access to your mail), <strong>offline_access</strong> (so imports can
        continue without signing in each time), <strong>User.Read</strong>,{" "}
        <strong>openid</strong> and <strong>email</strong> (to identify the
        connected account).
      </p>
      <p>
        Receebo looks at messages received in the last 90 days, uses the sender
        and subject to identify likely receipts, invoices and order
        confirmations, and then reads only those messages: their PDF
        attachments and, for order emails without a PDF, the message body.
        Extracted candidates are presented for your review before anything is
        saved to your library. Receebo does not send, edit, move or delete your
        email, does not use your email content for advertising, and does not
        sell it.
      </p>
      <p>
        OAuth credentials are stored encrypted. You can disconnect at any time
        in Settings, and you can also remove Receebo’s access from your
        Microsoft account’s app permissions. Disconnecting removes the stored
        credentials and pending imports; receipts you previously approved
        remain in your Receebo library until you delete them.
      </p>
      <p>
        <strong>Earlier Gmail connections:</strong> Receebo previously offered a
        read-only Gmail connection. New Gmail connections are not currently
        offered and existing ones are no longer synced. If you connected Gmail
        before, you can disconnect it in Settings or revoke access from your
        Google Account; disconnecting removes the stored credentials.
      </p>

      <h2>6. Retention and deletion</h2>
      <ul>
        <li>
          Account, receipt, attachment, and preference data is generally kept
          while your account is active and removed when you delete it, subject
          to the exceptions below.
        </li>
        <li>
          A receipt used for the one-receipt onboarding test is temporary unless
          you create an account and start a trial to save it.
        </li>
        <li>
          Email connection credentials are kept only while the mailbox remains
          connected; pending
          imports are removed when dismissed, disconnected, or deleted with the
          account.
        </li>
        <li>
          Security and operational logs are retained only for the period needed
          to investigate incidents and keep the service reliable.
        </li>
        <li>
          Stripe, tax, invoice, dispute, and accounting records may be retained
          for the period required by applicable law even after account deletion.
        </li>
        <li>
          Residual encrypted copies may remain temporarily in restricted backups
          under provider backup schedules. They are not restored for ordinary
          use and are removed or overwritten through the normal backup cycle.
        </li>
      </ul>

      <h2>7. International transfers</h2>
      <p>
        Some providers may process data outside Portugal or the European
        Economic Area. Where GDPR requires it, Receebo relies on an adequacy
        decision, Standard Contractual Clauses, or another valid transfer
        safeguard, together with appropriate supplementary measures.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Depending on the circumstances, you may have the right to access,
        correct, erase, restrict, or object to processing; receive portable data;
        and withdraw consent without affecting earlier lawful processing. You
        can download a structured data export and request account deletion in
        Settings, or contact{" "}
        <a href="mailto:contact@receebo.net">contact@receebo.net</a>. Receebo may
        need to verify your identity before fulfilling a request.
      </p>
      <p>
        You may also complain to Portugal’s supervisory authority, the{" "}
        <a href="https://www.cnpd.pt/" target="_blank" rel="noreferrer">
          Comissão Nacional de Proteção de Dados (CNPD)
        </a>
        , or to the competent authority where you live or work.
      </p>

      <h2>9. Security</h2>
      <p>
        Receebo uses authentication, user-scoped access checks, encrypted
        transport, private object storage, encrypted email-connection
        credentials, limited
        OAuth scopes, and operational controls designed to protect personal
        data. No online service can guarantee absolute security. Please use a
        secure account and notify Receebo if you suspect unauthorised access.
      </p>

      <h2>10. Cookies and local storage</h2>
      <p>
        Receebo uses essential authentication/session technologies and browser
        storage needed for login, security, plan selection, the installable web
        app, and temporary onboarding continuity. Receebo currently does not use
        advertising cookies or enable non-essential analytics cookies. If that
        changes, Receebo will update this policy and request consent before
        activating non-essential technologies where required.
      </p>

      <h2>11. Changes and contact</h2>
      <p>
        Receebo may update this policy when the service, providers, or law
        changes. Material changes will be highlighted in the service and may
        require renewed acceptance. Contact{" "}
        <a href="mailto:contact@receebo.net">contact@receebo.net</a> with
        questions or rights requests.
      </p>
    </LegalPageLayout>
  );
}