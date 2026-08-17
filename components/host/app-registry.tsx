"use client";

/**
 * ITQuest — Host app component registry
 * ======================================
 * Binds each declarative `HostAppId` (from HOST_APP_REGISTRY data) to the React
 * component that renders its window body. Kept separate from the data registry
 * so `SessionState` stays serializable. As of Phase 6 every host app is real.
 */

import type { HostAppId } from "@/lib/core";
import TicketCenter from "./apps/TicketCenter";
import RemoteGateway from "./apps/RemoteGateway";
import HardwareLab from "./apps/HardwareLab";
import AssetManager from "./apps/AssetManager";
import RackSimulator from "./apps/RackSimulator";
import ServerManager from "./apps/ServerManager";
import Mail from "./apps/Mail";
import CoreMail from "./apps/CoreMail";
import EdgeGateway from "./apps/EdgeGateway";
import Leaderboard from "./apps/Leaderboard";
import AppearanceApp from "./apps/AppearanceApp";
import EnterpriseGateway from "./apps/EnterpriseGateway";
import SettingsApp from "./apps/SettingsApp";
import ProfileApp from "./apps/ProfileApp";
import Wiki from "./apps/Wiki";
import AetherConsole from "./apps/AetherConsole";
import Procurement from "./apps/Procurement";
import SwitchPanel from "./apps/SwitchPanel";
import BackupCenter from "./apps/BackupCenter";
import Dashboard from "./apps/Dashboard";

export function renderHostApp(appId: HostAppId): React.ReactNode {
  switch (appId) {
    case "itsm":
      return <TicketCenter />;
    case "gateway":
      return <RemoteGateway />;
    case "hardwarelab":
      return <HardwareLab />;
    case "assetmanager":
      return <AssetManager />;
    case "racklab":
      return <RackSimulator />;
    case "serverman":
      return <ServerManager />;
    case "mail":
      return <Mail />;
    case "coremail":
      return <CoreMail />;
    case "dashboard":
      return <Dashboard />;
    case "backup":
      return <BackupCenter />;
    case "switches":
      return <SwitchPanel />;
    case "edge":
      return <EdgeGateway />;
    case "procurement":
      return <Procurement />;
    case "aethercloud":
      return <AetherConsole />;
    case "wiki":
      return <Wiki />;
    case "leaderboard":
      return <Leaderboard />;
    case "enterprise":
      return <EnterpriseGateway />;
    case "appearance":
      return <AppearanceApp />;
    case "settings":
      return <SettingsApp />;
    case "profile":
      return <ProfileApp />;
  }
}
