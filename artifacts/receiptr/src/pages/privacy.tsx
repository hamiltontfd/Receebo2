import { LegalPageLayout } from "@/components/LegalPageLayout";
import { Link } from "wouter";

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout
      title="Privacy Policy"
      description="How Receebo collects, uses, stores, and protects personal data."
      effectiveDate="17 November 2026"
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
        <li>
          <strong>Approximate country:</strong> our server looks up the country
          of your IP address in a local database (no third-party service) to
          tell you if your country is not covered yet and, after you accept the
          Terms and this Privacy Policy, to fill your account&apos;s region and
          save its actual country once. The saved country helps estimate the
          rules for online purchases when the receipt has no delivery or purchase
          country; it does not change a receipt&apos;s stored country. Travel or a
          VPN does not replace the saved country, which can be corrected through
          your account. Before consent, nothing is stored. We keep the region and
          country, not the IP address used for this lookup. You can change the region in
          Settings. If you tap &quot;I&apos;m interested&quot; for a country we
          don&apos;t cover yet, we only add one to a count for that country,
          with nothing that identifies you.
        </li>
        <li>
          <strong>Language:</strong> after you accept the Terms and this Privacy
          Policy, the app saves your browser&apos;s language (English,
          Portuguese or Brazilian Portuguese; otherwise English) to your
          account so account emails can use it. A language you choose in
          Settings always takes priority.
        </li>
        <li>
          <strong>Landing page counts:</strong> when our public pages load or
          you tap a sign-up button there, we add one to a daily total for that
          page and, if the link came from one of our ads, its ad label
          (utm_content). No cookie or identifier is set for that count.
        </li>
        <li>
          <strong>Ad attribution and measurement:</strong> If the link that opened Receebo includes campaign parameters (utm_source, utm_medium, utm_campaign, utm_content, utm_term) or a Meta click ID (fbclid), and your cookie choice allows attribution, Receebo stores that first link in your browser for up to 90 days. When you create an account, Receebo saves it with your account so we know which campaign started your trial. If your choice allows marketing, we also use the Meta Pixel (in your browser) and the Meta Conversions API (from our server) to measure our ads on Facebook and Instagram.
          <ul>
            <li>Events sent to Meta: page views of our public pages, account creation (trial start), the first receipt saved during the trial, a return to the app on a later day, and subscription purchases with their price and currency.</li>
            <li>Through the Pixel, Meta receives your IP address, browser and device information, the page address and referrer, the event name and time, and identifiers in Meta cookies (_fbp, and _fbc when you arrive from an ad). If you are logged in to Facebook or Instagram in the same browser, Meta&apos;s own cookies are included too.</li>
            <li>Through the Conversions API, Meta receives the event name and time, an event ID, the page address without query parameters, a one-way hashed (SHA-256) version of your Receebo account ID, the _fbp/_fbc identifiers, and, for subscriptions, the price and currency.</li>
            <li>Never sent: receipt contents, merchant names, receipt amounts, search terms, email contents or uploaded files.</li>
          </ul>
          See the{" "}
          <Link href="/cookies">Cookie Policy</Link>.
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
          trial, security, and subscription messages, and warranty and
          return-window reminders while your account has access. Reminders are
          optional: you can turn them off in Settings or with the unsubscribe
          link in each reminder email.
        </li>
      </ul>

      <p><strong>Measuring our advertising:</strong> to learn which campaigns bring people to Receebo and lead to trials and subscriptions.</p>
      <ul>
        <li>First-party attribution and the cookie-free daily page counts: our legitimate interest in measuring our own marketing, using minimal data.</li>
        <li>Meta Pixel and Conversions API in the EU/EEA, UK, Brazil and anywhere we cannot determine your country: your consent (Accept or Preferences &gt; Marketing), which you can withdraw at any time.</li>
        <li>Visitors we locate in the United States: our legitimate interest in measuring our advertising, balanced by an easy opt-out. You can object at any time with &apos;Do Not Sell or Share My Personal Information&apos;, &apos;Reject&apos; in Cookie settings, or a Global Privacy Control signal, and we then stop.</li>
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
          <strong>Meta (Meta Platforms Ireland Ltd.; for US users also Meta Platforms, Inc.):</strong> ad measurement through the Meta Pixel and Conversions API, only when your choice allows marketing. Receebo and Meta Platforms Ireland are joint controllers for collecting this data on our site and sending it to Meta (Article 26 GDPR), under <a href="https://www.facebook.com/legal/controller_addendum">Meta&apos;s Controller Addendum</a>. Receebo is responsible for showing you this information and collecting your choice. Meta is responsible for letting you exercise your rights over the data once Meta holds it. After receiving the data, Meta processes it as an independent controller under its own <a href="https://www.facebook.com/privacy/policy">Privacy Policy</a>. Meta may combine it with other information it holds about you and use it to measure, deliver and improve ads. You can contact us or Meta to exercise your rights.
        </li>
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
        Receebo does not sell personal data for money. To understand the no-card trial and
        subscription process, Receebo records limited first-party milestones such
        as trial start, successful-upload counts, paywall views, plan choice and
        payment confirmation. These records contain a random internal identifier,
        timestamps and fixed plan or paywall categories, not receipt contents,
        email addresses or payment details. The separate account mapping and
        milestone records are removed when your account is deleted. This
        measurement uses no cookies. The advertising measurement described in section 1 is the only third-party tracking on Receebo, and it runs only as your cookie choice allows.
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
        <li>Ad attribution: the first campaign link stays in your browser for up to 90 days; the campaign fields, Meta click identifiers and your marketing choice saved with your account are kept while the account exists and deleted with it.</li>
        <li>
          Account, receipt, attachment, and preference data is generally kept
          while your account is active and removed when you delete it, subject
          to the exceptions below.
        </li>
        <li>
          When your access to Receebo
          ends without an active subscription, either because your free trial
          ended or because your paid subscription was cancelled or lapsed, your
          account is paused and we keep your account and data for 60 days so
          you can subscribe or ask for a copy. While paused, copies are
          provided on request to{" "}
          <a href="mailto:contact@receebo.net">contact@receebo.net</a>; there
          is no in-app export. We email you 30 days and 7 days before the
          deletion date. If you subscribe before then, nothing is deleted. On
          the deletion date we permanently delete your account and all
          associated data, including receipts, uploaded files, extracted
          information and any Outlook connection. We keep only the billing and
          payment records that we or our payment processor, Stripe, are
          required to keep by law, for the period the law requires. We email
          you to confirm the deletion.
        </li>
        <li>
          If you rated your experience with Receebo, we keep that rating
          anonymously after your account is deleted, with no link to you or
          your email. Any comment you added with the rating is deleted with
          your account.
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
      <p>Data sent to Meta through the Pixel and Conversions API may be processed in the United States. Meta Platforms, Inc. is certified under the EU-U.S. Data Privacy Framework, and Meta also uses Standard Contractual Clauses for transfers.</p>
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
        and withdraw consent without affecting earlier lawful processing. While
        your account has access you can download a structured data export in
        Settings; while it is paused you can request a copy by email. You can
        request account deletion in Settings (confirmed with a one-time code
        sent to your account email), or contact{" "}
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
        data. Receipt contents (summary, OCR text and product lines), email
        imports awaiting your review, connected mailbox addresses and
        push-notification keys are also encrypted at rest in our database,
        with a key stored separately from it. No online service can guarantee
        absolute security. Please use a
        secure account and notify Receebo if you suspect unauthorised access.
      </p>

      <h2>10. Cookies and local storage</h2>
      <p>
        Receebo uses essential authentication and payment technologies (Clerk and Stripe), storage of your cookie choice, optional preference storage, optional ad-attribution storage and, only when your choice allows marketing, the Meta Pixel and matching server events.
      </p>
      <ul>
        <li>EU/EEA, UK, Brazil, or country unknown: everything non-essential stays off until you select Accept or turn it on in Preferences. Rejecting is as easy as accepting.</li>
        <li>United States: ad attribution and marketing are on unless you opt out. You can opt out at any time with &apos;Do Not Sell or Share My Personal Information&apos; in the footer of our US pages, &apos;Reject&apos; in Cookie settings, or a Global Privacy Control signal, which we treat as an opt-out of sale or sharing unless you later choose Accept.</li>
        <li>When you withdraw or opt out, the Pixel stops loading, we delete the _fbp and _fbc cookies on our domain, and we stop sending server events for your account. Data already sent to Meta is handled under Meta&apos;s policies.</li>
        <li>To limit ads based on activity elsewhere, use your <a href="https://www.facebook.com/adpreferences">Facebook/Instagram ad preferences</a>, <a href="https://optout.aboutads.info">https://optout.aboutads.info</a>, or <a href="https://www.youronlinechoices.eu">https://www.youronlinechoices.eu</a>.</li>
      </ul>
      <p>Names, purposes and durations are listed in the <Link href="/cookies">Cookie Policy</Link>.</p>
      <h2>11. Notice for US residents</h2>
      <p>In the last 12 months, Receebo collected these categories of personal information, as described above:</p>
      <ul>
        <li>Identifiers: name, email, account ID, IP address, cookie IDs.</li>
        <li>Commercial information: subscription and the receipts you choose to save.</li>
        <li>Internet activity on our site: pages and events.</li>
        <li>Approximate location: country from IP.</li>
        <li>Inferences limited to which campaign brought you.</li>
      </ul>
      <p>We do not sell personal information for money. When marketing is on, letting Meta collect data through the Pixel and Conversions API to measure our ads may count as &apos;sharing&apos; for cross-context behavioral advertising, or &apos;targeted advertising&apos;, under California and other state privacy laws. We share only the identifiers and internet-activity data listed in section 1 with Meta, and never receipt contents.</p>
      <ul>
        <li>Opting out: select &apos;Do Not Sell or Share My Personal Information&apos; in the footer of our US pages, or send a Global Privacy Control signal, which we honor in that browser. If you are signed in, we also apply the opt-out to your account.</li>
        <li>Your other rights: you can ask us to access, correct or delete your information, or to tell you what we share, at contact@receebo.net. You may use an authorized agent, and we will not discriminate against you for using these rights.</li>
        <li>Sensitive information: we do not use or disclose it for any purpose that would require a &apos;limit&apos; right.</li>
        <li>Age: we do not knowingly sell or share the information of anyone under 16, and Receebo is only for adults (18+).</li>
      </ul>
      <h2>12. Changes and contact</h2>
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