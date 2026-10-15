import { InviteFlow } from "./InviteFlow";

// The token is a credential: keep the page out of search engines and the URL out of Referer headers.
export const metadata = { title: "Your invite", robots: { index: false, follow: false }, referrer: "no-referrer" as const };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <InviteFlow token={token} />;
}
