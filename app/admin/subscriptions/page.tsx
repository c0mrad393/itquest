"use client";

/**
 * Phase 1 stub.
 *
 * A real route rather than a missing one: the sidebar links here, and a 404
 * from your own navigation is a worse answer than "not built yet". The page
 * states what it will hold, so the section is legible before it exists.
 */

import { AdminPage } from "@/components/admin/AdminShell";
import ComingSoon from "@/components/admin/ComingSoon";

export default function Page() {
  return (
    <AdminPage title="Enterprise Subscriptions" blurb="B2B accounts, seats and renewals.">
      <ComingSoon slug="subscriptions" />
    </AdminPage>
  );
}
