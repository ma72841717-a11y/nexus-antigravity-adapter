/**
 * @fileoverview Skills synchronization and registration subsystem for Google Antigravity local CLI plugins.
 * Manages symlinks connecting Paperclip runtime skill definitions into the target `~/.agy/plugins` directory.
 *
 * Vendored with a compile-compatibility fix (no security-relevant behavior change) from
 * `@weslleycapelari/adapter-antigravity-local` at pinned commit
 * `691725a674ec28b566868b39898ffa3ff0eae4f2`. See docs/UPSTREAM_PROVENANCE.md — the
 * desired-skill-set union below no longer reads a `.required` field that doesn't exist on
 * the `@paperclipai/adapter-utils` release this fork targets.
 *
 * Not otherwise reviewed or exercised by this fork's P0 slice; tracked as deferred follow-up
 * (see docs/CURRENT_STATE.md) rather than silently assumed correct.
 *
 * @copyright Antigravity Adapter Contributors
 * @license MIT
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AdapterSkillContext,
  AdapterSkillSnapshot,
} from "@paperclipai/adapter-utils";
import {
  buildPersistentSkillSnapshot,
  ensurePaperclipSkillSymlink,
  readPaperclipRuntimeSkillEntries,
  readInstalledSkillTargets,
  resolvePaperclipDesiredSkillNames,
} from "@paperclipai/adapter-utils/server-utils";

import { isNonEmptyString } from "../utils.js";

const __moduleDir = path.dirname(fileURLToPath(import.meta.url));

function readNonEmptyString(value: unknown): string | null {
  return isNonEmptyString(value) ? value.trim() : null;
}

/**
 * Resolves the effective target plugins directory path (`~/.agy/plugins`).
 */
function resolveAntigravitySkillsHome(config: Record<string, unknown>): string {
  const env =
    typeof config.env === "object" && config.env !== null && !Array.isArray(config.env)
      ? (config.env as Record<string, unknown>)
      : {};
  const configuredHome = readNonEmptyString(env.HOME);
  const home = configuredHome ? path.resolve(configuredHome) : os.homedir();

  return path.join(home, ".agy", "plugins");
}

/**
 * Builds a stateful representation snapshot of available, active, and conflicting skills.
 */
async function buildAntigravitySkillSnapshot(config: Record<string, unknown>): Promise<AdapterSkillSnapshot> {
  const availableEntries = await readPaperclipRuntimeSkillEntries(config, __moduleDir);
  const desiredSkills = resolvePaperclipDesiredSkillNames(config, availableEntries);
  const skillsHome = resolveAntigravitySkillsHome(config);
  const installed = await readInstalledSkillTargets(skillsHome);

  return buildPersistentSkillSnapshot({
    adapterType: "antigravity_local",
    availableEntries,
    desiredSkills,
    installed,
    skillsHome,
    locationLabel: "~/.agy/plugins",
    missingDetail: "Configured but not currently linked into the Antigravity plugins home.",
    externalConflictDetail: "Plugin name is occupied by an external installation.",
    externalDetail: "Installed outside Paperclip management.",
  });
}

/**
 * Lists all registered, available, and conflicting Antigravity local skills.
 */
export async function listAntigravitySkills(ctx: AdapterSkillContext): Promise<AdapterSkillSnapshot> {
  return buildAntigravitySkillSnapshot(ctx.config);
}

/**
 * Synchronizes the filesystem target symlinks between Paperclip's repository and
 * the local `~/.agy/plugins` directory. Establishes missing links and prunes obsolete ones.
 */
export async function syncAntigravitySkills(
  ctx: AdapterSkillContext,
  desiredSkills: string[],
): Promise<AdapterSkillSnapshot> {
  const availableEntries = await readPaperclipRuntimeSkillEntries(ctx.config, __moduleDir);

  // NOTE: upstream (pinned at 691725a6...) also unioned in entries flagged `.required`,
  // a field that existed on an older `@paperclipai/adapter-utils` release's
  // `PaperclipSkillEntry`. The `2026.1005.0` release this fork targets has no such field
  // (verified against the shipped type declarations), so only explicitly desired skills
  // are installed. See docs/UPSTREAM_PROVENANCE.md.
  const desiredSet = new Set(desiredSkills);

  const skillsHome = resolveAntigravitySkillsHome(ctx.config);
  await fs.mkdir(skillsHome, { recursive: true });

  const installed = await readInstalledSkillTargets(skillsHome);
  const availableByRuntimeName = new Map(availableEntries.map((entry) => [entry.runtimeName, entry]));

  for (const available of availableEntries) {
    if (!desiredSet.has(available.key)) {
      continue;
    }
    const target = path.join(skillsHome, available.runtimeName);
    await ensurePaperclipSkillSymlink(available.source, target);
  }

  for (const [name, installedEntry] of installed.entries()) {
    const available = availableByRuntimeName.get(name);
    if (!available) {
      continue;
    }
    if (desiredSet.has(available.key)) {
      continue;
    }
    if (installedEntry.targetPath !== available.source) {
      continue;
    }

    const targetLink = path.join(skillsHome, name);
    await fs.unlink(targetLink).catch(() => {});
  }

  return buildAntigravitySkillSnapshot(ctx.config);
}

/**
 * Resolves the final subset of desired skills based on adapter configurations.
 */
export function resolveAntigravityDesiredSkillNames(
  config: Record<string, unknown>,
  availableEntries: Array<{ key: string; required?: boolean }>,
): string[] {
  return resolvePaperclipDesiredSkillNames(config, availableEntries);
}
