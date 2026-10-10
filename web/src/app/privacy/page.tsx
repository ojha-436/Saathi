import Link from "next/link";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";

export const metadata = { title: "Privacy Policy", description: "How Saathi collects, uses, protects and deletes your information." };

const UPDATED = "10 October 2026";

/** Contact details come from Cloud Run env vars, so they can change without a code change. */
function contact() {
  return {
    entity: process.env.LEGAL_ENTITY_NAME || "the Saathi team",
    email: process.env.PRIVACY_CONTACT_EMAIL || "",
    officer: process.env.GRIEVANCE_OFFICER_NAME || "",
  };
}

const SECTIONS = [
  ["summary", "Summary"],
  ["who", "Who we are and our role"],
  ["collect", "Information we collect"],
  ["use", "How we use information"],
  ["ai", "How Saathi's AI works with your data"],
  ["google", "Google user data (Calendar, Gmail, Drive)"],
  ["visibility", "Who can see what"],
  ["sharing", "Service providers and sharing"],
  ["location", "Where data is stored"],
  ["security", "Security"],
  ["retention", "Retention and deletion"],
  ["rights", "Your rights and choices"],
  ["cookies", "Cookies and browser storage"],
  ["children", "Children"],
  ["changes", "Changes to this policy"],
  ["contact", "Contact and grievances"],
] as const;

export default async function PrivacyPage() {
  await connection(); // read contact details at request time
  const c = contact();
  const mail = c.email ? (
    <a href={`mailto:${c.email}`} className="font-semibold text-ink underline">
      {c.email}
    </a>
  ) : (
    <span>the privacy contact listed in the Contact section</span>
  );

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="border-b border-line bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 lg:px-8">
          <Link href="/" aria-label="Saathi home">
            <Logo />
          </Link>
          <nav className="flex gap-4 text-sm">
            <Link href="/login" className="font-medium hover:underline">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 py-10 lg:grid-cols-[220px_1fr] lg:px-8">
        <aside className="hidden lg:block">
          <nav aria-label="On this page" className="sticky top-6 space-y-1 text-sm">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-muted">On this page</p>
            {SECTIONS.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="block rounded px-2 py-1 text-muted hover:bg-paper-2 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <article className="policy max-w-3xl">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">Last updated {UPDATED}</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="mt-4 text-lg text-muted">
            Saathi is a workplace chat app with an AI assistant. This policy explains what information Saathi handles, why, who can see it, where it is stored,
            how long we keep it, and the choices and rights you have.
          </p>

          <section id="summary">
            <h2>Summary</h2>
            <ul>
              <li>We use your information only to run Saathi for you and your organisation. We do not sell it and we do not use it for advertising.</li>
              <li>You only ever see, and Saathi only ever searches, the chats, channels, files and meetings you are a member of. Workspace admins cannot read messages.</li>
              <li>AI features run on Google Cloud (Gemini on Vertex AI, Document AI). Under Google Cloud&rsquo;s terms, your content is not used to train Google&rsquo;s models.</li>
              <li>Connecting Google Calendar, Gmail or Drive is optional and read-only. Only you can see what Saathi reads from them, and disconnecting deletes it.</li>
              <li>Data is stored on Google Cloud in Mumbai (asia-south1), encrypted in transit and at rest.</li>
              <li>You can hide any chat from the AI, mute notifications, disconnect apps, sign out of all devices, and ask us to access, correct or delete your data.</li>
            </ul>
          </section>

          <section id="who">
            <h2>Who we are and our role</h2>
            <p>
              Saathi is operated by {c.entity} (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Saathi is organised into <b>workspaces</b>. When an organisation uses Saathi, the
              organisation decides who joins its workspace and how it is used, and is responsible for the content its members create. For that content we act on the
              organisation&rsquo;s behalf (as a processor, or &ldquo;data processor&rdquo; under India&rsquo;s Digital Personal Data Protection Act, 2023). For your account
              itself, and if you create a personal workspace, we are responsible for your data (as the &ldquo;data fiduciary&rdquo; / controller).
            </p>
          </section>

          <section id="collect">
            <h2>Information we collect</h2>
            <h3>Account and profile</h3>
            <ul>
              <li>Name, email address and sign-in method. If you sign in with Google we receive your name, email address and profile photo from Google.</li>
              <li>Passwords are handled by Firebase Authentication (Google). Saathi never sees or stores your password.</li>
              <li>Profile details you choose to add: job title, department, phone, location, time zone and a profile photo (resized to 256 px; visible to your workspace).</li>
              <li>Your workspace and role (owner, admin, member or guest), and invitations sent to your email address.</li>
            </ul>
            <h3>What you and your colleagues create</h3>
            <ul>
              <li>Messages, thread replies, reactions, @mentions, files you share (PDF, images, Word, Excel, text) and their text extracted by OCR.</li>
              <li>Tasks, reminders, meeting notes and transcripts you upload or paste, and summaries generated from them.</li>
              <li>Information Saathi derives from that content: detected promises and decisions, document fields (for example drawing numbers and revisions), and search indexes.</li>
              <li>Your conversations with the Saathi assistant, including the questions you ask and its answers, so you can see your history.</li>
            </ul>
            <h3>Presence and settings</h3>
            <ul>
              <li>Your status (available, busy, do not disturb, away), any status message and when you were last active.</li>
              <li>Notification preferences, quiet hours, favourites and read positions.</li>
              <li>If you turn on push notifications, a device token from Firebase Cloud Messaging for each browser or device.</li>
            </ul>
            <h3>Connected apps (optional)</h3>
            <p>Only if you connect them. See <a href="#google">Google user data</a> for details.</p>
            <h3>Usage, security and technical data</h3>
            <ul>
              <li>An audit log of security and administrative events: sign-ins and workspace joins, invitations, role changes, deactivations, channel creation and deletion, app connections, and sign-out of all sessions.</li>
              <li>Assistant usage records: the question asked, which tools ran and how long the answer took. They are used to secure and improve the service. Admins see that a question was asked, never its text.</li>
              <li>Standard server logs (for example IP address, browser type, request time and errors) kept by Google Cloud.</li>
            </ul>
          </section>

          <section id="use">
            <h2>How we use information</h2>
            <ul>
              <li>
                <b>To provide Saathi:</b> deliver messages and files, show who is available, run search and the assistant, track tasks and reminders, and send the
                notifications you ask for.
              </li>
              <li>
                <b>To power AI features you use:</b> answers with sources, catch-up briefs, chat and meeting summaries, promise and decision detection, document
                reading, meeting prep and email commitment detection.
              </li>
              <li>
                <b>To keep Saathi secure:</b> enforce workspace boundaries and permissions, prevent abuse (for example rate limits), investigate incidents and keep
                audit records.
              </li>
              <li>
                <b>To operate and improve the service:</b> measure reliability and answer quality using aggregated usage information and test datasets.
              </li>
              <li>
                <b>To meet legal obligations</b> and respond to lawful requests.
              </li>
            </ul>
            <p>
              We do not sell personal data, use it for advertising, or build advertising profiles. We process your data because it is needed to provide the service
              you or your organisation signed up for, with your consent where required (for example connecting Google apps or turning on push notifications), and
              where the law requires or allows it.
            </p>
          </section>

          <section id="ai">
            <h2>How Saathi&rsquo;s AI works with your data</h2>
            <ul>
              <li>
                Saathi uses Google&rsquo;s Gemini models through Vertex AI, and Google Document AI for text recognition, all on Google Cloud. Content is sent to these
                services only to produce the result you asked for.
              </li>
              <li>Under Google Cloud&rsquo;s terms, Google does not use this content to train its models. Saathi does not train its own models on your content.</li>
              <li>
                The assistant only searches content you can already access, and every answer links to its sources. Content inside messages, files and emails is treated
                as information, never as instructions to the assistant.
              </li>
              <li>
                The assistant never acts on your behalf in other apps. Tasks and assignments it drafts wait for you to confirm, and nothing is posted to a chat without
                your click.
              </li>
              <li>
                AI can make mistakes. Check important details against the cited source. Any chat can be marked <b>Hidden from AI</b>, which removes it from the
                assistant&rsquo;s index; workspace admins can turn the assistant off for the whole workspace.
              </li>
            </ul>
          </section>

          <section id="google">
            <h2>Google user data (Calendar, Gmail, Drive)</h2>
            <p>
              Connecting Google is optional. You choose Calendar, Gmail and/or Drive in Settings → Connected apps, and Google shows you exactly what you are granting.
              Access is <b>read-only</b>: Saathi cannot send email, change your calendar or delete anything.
            </p>
            <ul>
              <li>
                <b>Google Calendar</b> (<code>calendar.readonly</code>): your events from 2 days ago to 14 days ahead, including title, time, location, video link and
                attendees, so Saathi can show your day, prepare you for meetings and help you take notes. Private events are stored only as &ldquo;Busy&rdquo;.
                Colleagues can see that you are in a meeting (times only, never titles).
              </li>
              <li>
                <b>Gmail</b> (<code>gmail.readonly</code>): messages from the last 14 days in your inbox and sent mail, excluding promotions, social and forum mail. We
                use the sender, recipients, subject, date and message text to detect commitments (for example &ldquo;we will dispatch on the 15th&rdquo;) and let
                you track them as tasks, and to answer your questions about your email.
              </li>
              <li>
                <b>Google Drive</b> (<code>drive.readonly</code>): a list of files you own or that were shared with you and that changed in the last 60 days
                (name, type, owner, last editor, modified time and link). The text of Google Docs, Sheets, Slides and plain-text files is read so Saathi can
                answer your questions about them with a link back; other files are only listed. Files that leave that window are removed from Saathi.
              </li>
            </ul>
            <p>
              Calendar, email and Drive data is visible and searchable <b>only by you</b>, not your colleagues and not workspace admins. Google sign-in tokens are encrypted
              with Google Cloud Key Management Service before they are stored. Saathi syncs about every 10 minutes while connected. When you disconnect (or an admin
              turns Google connections off), we revoke Saathi&rsquo;s access at Google and delete the calendar events, emails, Drive file records and search index we synced.
            </p>
            <p className="rounded-xl border border-line bg-paper-2 p-4">
              Saathi&rsquo;s use and transfer of information received from Google APIs to any other app will adhere to the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy" className="underline">
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements. We do not use Google user data for advertising, do not sell it, do not use it to train AI models, and do not
              let people read it except with your permission, for security purposes, to comply with the law, or where it has been aggregated and anonymised for
              internal operations.
            </p>
          </section>

          <section id="visibility">
            <h2>Who can see what</h2>
            <ul>
              <li>
                <b>Workspace members</b> see each other&rsquo;s profiles and status, and see only the chats and channels they belong to. Public channels can be found
                and joined by members of the same workspace; private channels are invite-only.
              </li>
              <li>
                <b>Guests</b> (for example vendors) see only the channels they were invited to and the people in them.
              </li>
              <li>
                <b>Workspace admins</b> can manage members, roles, invitations and channels, and view the audit log. They see channel names and membership, not the
                messages or files inside them, and they cannot see your connected Google data.
              </li>
              <li>
                <b>People outside your workspace</b> cannot see anything in it. Removing someone from a chat removes their access to its history and search.
              </li>
              <li>
                <b>Our team</b> does not read your content. Limited operational access is used only to keep the service running, to investigate security issues or
                where required by law.
              </li>
            </ul>
          </section>

          <section id="sharing">
            <h2>Service providers and sharing</h2>
            <p>We share data only with providers that run Saathi for us, under their data-processing terms:</p>
            <ul>
              <li>
                <b>Google Cloud:</b> Cloud Run (hosting), Firestore (database), Cloud Storage (files), Vertex AI (Gemini), Document AI (text recognition), BigQuery
                (usage analytics), Cloud Logging, Secret Manager, Key Management Service and Cloud Scheduler.
              </li>
              <li>
                <b>Firebase (Google):</b> Authentication (sign-in) and Cloud Messaging (push notifications).
              </li>
              <li>
                <b>Google Workspace APIs:</b> only if you connect Calendar, Gmail or Drive.
              </li>
            </ul>
            <p>
              We may also disclose information if required by law or a valid legal process, to protect the rights and safety of users or the public, or as part of a
              merger or acquisition (in which case this policy continues to apply). We never sell personal data.
            </p>
          </section>

          <section id="location">
            <h2>Where data is stored</h2>
            <p>
              Your workspace data (database, files, document processing, encryption keys and secrets) is stored on Google Cloud in <b>Mumbai, India (asia-south1)</b>.
              Requests to the Gemini models are processed by Google&rsquo;s global Vertex AI service, and push notifications are delivered by Firebase Cloud
              Messaging, so this processing may take place outside India under Google&rsquo;s safeguards. Data is encrypted in transit (TLS) and at rest.
            </p>
          </section>

          <section id="security">
            <h2>Security</h2>
            <ul>
              <li>Encryption in transit and at rest; Google sign-in tokens encrypted with Cloud KMS; secrets kept in Secret Manager.</li>
              <li>Workspace isolation enforced by the server and by database security rules on every request, plus role-based access (owner, admin, member, guest).</li>
              <li>Search and the assistant are limited to content each person can access.</li>
              <li>Rate limits, restricted upload types, strict browser security headers and an audit log of administrative actions.</li>
              <li>
                Deactivated accounts lose access to Saathi&rsquo;s servers immediately and are signed out of every device within the hour. You can sign out of all
                your own sessions from Settings → Security.
              </li>
            </ul>
            <p>No system is perfectly secure. If we become aware of a breach that affects your personal data, we will notify you and the authorities as the law requires.</p>
          </section>

          <section id="retention">
            <h2>Retention and deletion</h2>
            <ul>
              <li>Workspace content is kept while the workspace is in use, until it is deleted by members or admins, or until the organisation asks us to delete it.</li>
              <li>Deleting a channel removes its messages, files and search index. Hiding a chat from AI removes it from the assistant&rsquo;s index.</li>
              <li>Disconnecting Google deletes the synced calendar events, emails, Drive file records and their index straight away.</li>
              <li>You can clear your assistant conversation at any time (New conversation).</li>
              <li>
                When an account is deleted, we delete or anonymise its profile and personal settings. Messages you posted in shared conversations stay part of that
                workspace&rsquo;s record unless the organisation asks for them to be removed.
              </li>
              <li>Server logs are kept by Google Cloud Logging for up to 30 days. Audit and usage records are kept for as long as needed for security and compliance.</li>
            </ul>
          </section>

          <section id="rights">
            <h2>Your rights and choices</h2>
            <p>Depending on where you live, including under India&rsquo;s Digital Personal Data Protection Act, 2023, you can:</p>
            <ul>
              <li>get a summary of the personal data we process and who we share it with;</li>
              <li>correct, complete or update your data (most of it is editable in Settings → Profile);</li>
              <li>ask us to delete your data;</li>
              <li>withdraw consent, for example by disconnecting Google or turning off push notifications. This does not affect processing done before.</li>
              <li>raise a grievance with us, and if unresolved, with the Data Protection Board of India;</li>
              <li>nominate someone to exercise these rights for you in case of death or incapacity.</li>
            </ul>
            <p>In the app you can also: hide a chat from AI, mute or customise notifications, set quiet hours, disconnect connected apps and sign out everywhere.</p>
            <p>
              If your account belongs to an organisation&rsquo;s workspace, some requests (for example deleting workspace content) are handled with your workspace
              admin. To exercise any right, contact us at {mail}. We will verify your request and reply within the time the law requires.
            </p>
          </section>

          <section id="cookies">
            <h2>Cookies and browser storage</h2>
            <p>
              Saathi does not use advertising or third-party tracking cookies. Firebase Authentication keeps you signed in using your browser&rsquo;s storage, and
              Saathi stores a few interface preferences on your device (for example collapsed sections and whether you dismissed a prompt). If you turn on
              notifications, a service worker is registered to show them. Clearing your browser data signs you out and resets these preferences.
            </p>
          </section>

          <section id="children">
            <h2>Children</h2>
            <p>
              Saathi is a workplace tool for people aged 18 and over. We do not knowingly process children&rsquo;s data. If you believe a child has created an
              account, contact us and we will delete it.
            </p>
          </section>

          <section id="changes">
            <h2>Changes to this policy</h2>
            <p>
              We will update this page when our practices change and revise the date at the top. If a change materially affects how we use your data, we will tell
              you in the app before it takes effect.
            </p>
          </section>

          <section id="contact">
            <h2>Contact and grievances</h2>
            <p>
              Questions, requests or complaints about privacy: {c.email ? mail : <span>please contact your workspace administrator, who can reach us.</span>}
              {c.officer && (
                <>
                  {" "}
                  Grievance Officer: <b>{c.officer}</b>.
                </>
              )}{" "}
              We will respond within the time required by applicable law.
            </p>
          </section>

          <p className="mt-12 border-t border-line pt-6 text-sm text-muted">
            <Link href="/" className="underline">
              Back to Saathi
            </Link>
          </p>
        </article>
      </main>
    </div>
  );
}
