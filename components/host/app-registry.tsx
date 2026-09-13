"use client";

/**
 * ITQuest — Host app component registry
 * ======================================
 * Binds each declarative `HostAppId` (from HOST_APP_REGISTRY data) to the React
 * component that renders its window body. Kept separate from the data registry
 * so `SessionState` stays serializable. As of Phase 6 every host app is real.
 */

import dynamic from "next/dynamic";
import type { HostAppId } from "@/lib/core";
import TicketCenter from "./apps/TicketCenter";
import RemoteGateway from "./apps/RemoteGateway";
import Mail from "./apps/Mail";
import CoreMail from "./apps/CoreMail";
import AppearanceApp from "./apps/AppearanceApp";
import EnterpriseGateway from "./apps/EnterpriseGateway";
import SettingsApp from "./apps/SettingsApp";
import ProfileApp from "./apps/ProfileApp";
import Wiki from "./apps/Wiki";
import Dashboard from "./apps/Dashboard";

/*
 * THE GATED APPS ARE SPLIT OUT, and the reason is the same one the unlock
 * ladder already gives.
 *
 * Every app body used to be a static import here, so opening the desktop
 * downloaded all twenty of them — the Edge Gateway, the datacentre floor, the
 * cloud console — before rendering a dashboard for an intern who cannot open
 * any of them for several levels. The registry is the one place that knows
 * which component belongs to which id, which makes it the one place this is
 * cheap to fix.
 *
 * What stays static is what a level-1 operator can actually reach on their
 * first shift: the dashboard, the queue, the mail clients, the wiki, the
 * gateway and the account screens. Those must not flicker — they are the
 * first thing anyone sees. Everything below unlocks later, by which point a
 * few hundred milliseconds on first open is invisible next to not having
 * shipped it at boot.
 */
const lazyApp = (load: Parameters<typeof dynamic>[0]) =>
  dynamic(load, { loading: () => <AppLoading /> });

function AppLoading() {
  return (
    <div className="flex h-full items-center justify-center bg-panel text-[11px] text-gray-500">
      Opening…
    </div>
  );
}

const HardwareLab = lazyApp(() => import("./apps/HardwareLab"));
const AssetManager = lazyApp(() => import("./apps/AssetManager"));
const RackSimulator = lazyApp(() => import("./apps/RackSimulator"));
const ServerManager = lazyApp(() => import("./apps/ServerManager"));
const EdgeGateway = lazyApp(() => import("./apps/EdgeGateway"));
const AetherConsole = lazyApp(() => import("./apps/AetherConsole"));
const Procurement = lazyApp(() => import("./apps/Procurement"));
const SwitchPanel = lazyApp(() => import("./apps/SwitchPanel"));
const BackupCenter = lazyApp(() => import("./apps/BackupCenter"));
const Leaderboard = lazyApp(() => import("./apps/Leaderboard"));

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
