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
import HardwareLab from "./apps/HardwareLab";
import AssetManager from "./apps/AssetManager";
import RackSimulator from "./apps/RackSimulator";
import ServerManager from "./apps/ServerManager";
import DirectoryConsole from "./apps/DirectoryConsole";
import SharedDrives from "./apps/SharedDrives";
import Mail from "./apps/Mail";
import CoreMail from "./apps/CoreMail";
import NetOpsConsole from "./apps/NetOpsConsole";
import Toolbox from "./apps/Toolbox";
import Leaderboard from "./apps/Leaderboard";
import SettingsApp from "./apps/SettingsApp";
import ProfileApp from "./apps/ProfileApp";
import Wiki from "./apps/Wiki";
import Monitor from "./apps/Monitor";
import AetherConsole from "./apps/AetherConsole";
import Procurement from "./apps/Procurement";

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
    case "directory":
      return <DirectoryConsole />;
    case "shares":
      return <SharedDrives />;
    case "mail":
      return <Mail />;
    case "coremail":
      return <CoreMail />;
    case "netops":
      return <NetOpsConsole />;
    case "procurement":
      return <Procurement />;
    case "aethercloud":
      return <AetherConsole />;
    case "monitor":
      return <Monitor />;
    case "wiki":
      return <Wiki />;
    case "toolbox":
      return <Toolbox />;
    case "leaderboard":
      return <Leaderboard />;
    case "settings":
      return <SettingsApp />;
    case "profile":
      return <ProfileApp />;
  }
}
