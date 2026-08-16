/**
 * ITQuest — Product naming (v0.8.0)
 * ==================================
 * The estate runs fictional software. Every product a real sysadmin would
 * recognise has a parody name here, and this module is the ONLY place those
 * names are written down — so a rename is one edit, not a grep across ninety
 * components, and no screen can drift back to a trademark.
 *
 * The parodies are deliberately transparent. A learner should read "Enterprise
 * Directory Services" and know they are looking at the thing their workplace
 * calls something else; an educational simulator that invents unrecognisable
 * jargon teaches nothing transferable. The CONCEPTS — domains, OUs, security
 * groups, policy inheritance, account lockout — are real and keep their real
 * behaviour.
 */

/** The server operating system the estate's infrastructure runs. */
export const SERVER_OS = "ServerOS";
export const SERVER_OS_VENDOR = "Macrohard";
export const SERVER_OS_FULL = "Macrohard ServerOS 2024";

/** The client operating system on staff endpoints. */
export const CLIENT_OS = "Macrohard DeskOS 12";
export const CLIENT_OS_SHORT = "DeskOS";

/** The management console the operator works in. */
export const ADMIN_CENTER = "ServerOS Admin Center";

/** Directory service — the Active Directory analogue. */
export const EDS = "Enterprise Directory Services";
export const EDS_SHORT = "EDS";

/** Policy engine — the Group Policy analogue. */
export const CFP = "Centralized Fleet Policies";
export const CFP_SHORT = "CFP";
/** One policy object. */
export const CFP_OBJECT = "Fleet Policy";

/** Remote access to a member of staff's own machine. */
export const REMOTE_SUPPORT = "Remote Support";

/** File sharing protocol/service name used on shares and services lists. */
export const FILE_SERVICE = "FleetShare";

/** Directory service unit name, as it appears in the services list. */
export const EDS_SERVICE = "EDSCore";

/**
 * Display name for a node's operating system.
 *
 * Nodes carry a real-world-ish `distro` string from the generator; this is
 * what the UI shows instead.
 */
export function osLabel(os: "linux" | "windows" | "macos", role?: string): string {
  if (os === "windows") return role === "workstation" ? CLIENT_OS : SERVER_OS_FULL;
  if (os === "macos") return "Orchard MacOS 15";
  return "Ubuntu Server 22.04 LTS"; // Linux is genuinely free software — no parody needed
}
