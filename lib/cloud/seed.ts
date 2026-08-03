/**
 * TriageOS — AetherCloud tenant seed
 * ==================================
 * Every generated world gets a small cloud footprint, so the console is never
 * an empty shell: one AVN in the estate's home region, a couple of vNodes, a
 * backup DataBucket, and a baseline set of Shield rules.
 *
 * The tunnel starts DOWN by design. Bringing it up is gameplay, not setup.
 */

import type { CloudState, ShieldRule } from "@/lib/core";
import type { Rng } from "@/lib/org/rng";
import { int, pick } from "@/lib/org/rng";

const REGIONS = ["aether-west-1", "aether-east-2", "aether-north-1", "aether-central-3"];

export function createCloudState(orgName: string, orgSlug: string, rng: Rng): CloudState {
  const region = pick(rng, REGIONS);
  // Cloud sits in RFC1918 space that cannot collide with the 10.x on-prem plan,
  // so a hybrid route is unambiguous about which side an address is on.
  const third = int(rng, 10, 60);
  const cidr = `172.16.${third}.0/24`;
  const avnId = "avn-01";

  const baseRules: ShieldRule[] = [
    {
      id: "sr-1001",
      avnId,
      description: "HTTPS from the internet",
      protocol: "tcp",
      port: 443,
      source: "0.0.0.0/0",
      action: "allow",
    },
    {
      id: "sr-1002",
      avnId,
      description: "HTTP from the internet",
      protocol: "tcp",
      port: 80,
      source: "0.0.0.0/0",
      action: "allow",
    },
    {
      id: "sr-1003",
      avnId,
      description: "SSH from the corporate network only",
      protocol: "tcp",
      port: 22,
      source: "10.0.0.0/8",
      action: "allow",
    },
  ];

  return {
    tenant: `${orgName} (${orgSlug}-tenant)`,
    avns: [{ id: avnId, name: "avn-prod", cidr, region }],
    vnodes: [
      {
        id: "vnode-01",
        name: "vnode-web-01",
        avnId,
        size: "standard",
        status: "running",
        privateIp: `172.16.${third}.11`,
        purpose: "web",
        createdAt: Date.now() - 1000 * 60 * 60 * int(rng, 20, 400),
      },
      {
        id: "vnode-02",
        name: "vnode-backup-01",
        avnId,
        size: "micro",
        status: "running",
        privateIp: `172.16.${third}.21`,
        purpose: "backup",
        createdAt: Date.now() - 1000 * 60 * 60 * int(rng, 20, 400),
      },
    ],
    buckets: [
      { id: "bkt-backups", name: "nightly-db-backups", tier: "cool", sizeGb: int(rng, 400, 1800), publicAccess: false },
      { id: "bkt-assets", name: "web-static-assets", tier: "hot", sizeGb: int(rng, 20, 120), publicAccess: false },
    ],
    shieldRules: baseRules,
    routers: [],
    vpn: {
      status: "down",
      localGatewayNodeId: null,
      localCidr: "",
      remoteAvnId: null,
      psk: "",
      lastError: null,
      connectedAt: null,
    },
    audit: [
      {
        id: "aud-seed-2",
        at: Date.now() - 1000 * 60 * 60 * 6,
        actor: "svc-provisioner",
        action: "Launched vNode vnode-backup-01 (Micro)",
        target: "vnode-02",
        severity: "info",
      },
      {
        id: "aud-seed-1",
        at: Date.now() - 1000 * 60 * 60 * 30,
        actor: "svc-provisioner",
        action: `Created Aether Virtual Network avn-prod (${cidr})`,
        target: avnId,
        severity: "info",
      },
    ],
  };
}
