import { redirect } from "next/navigation";

/**
 * The analytics page has been merged into /trends with the "regional overview"
 * view mode. Redirect old /analytics links to the new unified page.
 */
export default function AnalyticsRedirect() {
  redirect("/trends?province=all&range=90");
}
