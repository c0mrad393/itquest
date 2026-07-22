"use client";

/**
 * TriageOS — Host app component registry
 * ======================================
 * Binds each declarative `HostAppId` (from HOST_APP_REGISTRY data) to the React
 * component that renders its window body. Kept separate from the data registry
 * so `SessionState` stays serializable. As of Phase 6 every host app is real.
 */

import type { HostAppId } from "@/lib/core";
import TicketCenter from "./apps/TicketCenter";
import RemoteGateway from "./apps/RemoteGateway";
import Mail from "./apps/Mail";
import Toolbox from "./apps/Toolbox";
import Leaderboard from "./apps/Leaderboard";
import SettingsApp from "./apps/SettingsApp";

export function renderHostApp(appId: HostAppId): React.ReactNode {
  switch (appId) {
    case "itsm":
      return <TicketCenter />;
    case "gateway":
      return <RemoteGateway />;
    case "mail":
      return <Mail />;
    case "toolbox":
      return <Toolbox />;
    case "leaderboard":
      return <Leaderboard />;
    case "settings":
      return <SettingsApp />;
  }
}
