/**
 * TriageOS — Linux node ⇄ interpreter adapter
 * ===========================================
 * Re-points the proven Phase-1 CLI engine at a node inside InfrastructureState.
 * The interpreter operates on a flat VMState; a LinuxNodeState carries the same
 * sub-structures plus node metadata, so we project a VMState view, run the
 * command, then fold the mutated fields back onto the node. One engine, now
 * driving a node in the multi-node store.
 */

import { Interpreter } from "@/lib/vm/interpreter";
import { baseCommands, makeHelp } from "@/lib/vm/commands";
import type { VMState } from "@/lib/vm/types";
import type { LinuxNodeState } from "@/lib/core";

/** Shared, pre-registered interpreter instance (command registry). */
export const linuxInterpreter: Interpreter = (() => {
  const interp = new Interpreter();
  interp.registerAll(baseCommands);
  interp.register(makeHelp(() => interp.list()));
  return interp;
})();

/** Project a LinuxNodeState onto the flat VMState the interpreter expects. */
export function nodeToVM(node: LinuxNodeState): VMState {
  return {
    vmId: node.nodeId,
    hostname: node.hostname,
    os: "linux",
    kernel: node.kernel,
    cwd: node.session.cwd,
    currentUser: node.session.user,
    env: node.session.env,
    filesystem: node.filesystem,
    users: node.users,
    services: node.services,
    processes: node.processes,
    network: node.network,
    logs: node.logs,
    nextPid: node.nextPid,
  };
}

/** Fold a (possibly mutated) VMState back onto the node, preserving metadata. */
export function writeVMToNode(node: LinuxNodeState, vm: VMState): LinuxNodeState {
  return {
    ...node,
    kernel: vm.kernel,
    filesystem: vm.filesystem,
    users: vm.users,
    services: vm.services,
    processes: vm.processes,
    network: vm.network,
    logs: vm.logs,
    nextPid: vm.nextPid,
    session: { ...node.session, cwd: vm.cwd, user: vm.currentUser, env: vm.env },
  };
}
