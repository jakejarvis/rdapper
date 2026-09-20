import { linkSignals, throwIfAborted } from "./lib/async";
import { getDomainParts, isLikelyDomain } from "./lib/domain";
import { classifyError, RdapperError } from "./lib/errors";
import { attemptForError, type LookupContext } from "./lib/trace";
import { getRdapBaseUrlsForPublicSuffix } from "./rdap/bootstrap";
import { fetchRdapDomain } from "./rdap/client";
import { fetchAndMergeRdapRelated } from "./rdap/merge";
import { normalizeRdap } from "./rdap/normalize";
import type {
  DomainRecord,
  LookupAttempt,
  LookupErrorCode,
  LookupOptions,
  LookupResult,
} from "./types";
import { discoverWhoisServer, parseIanaRegistrationInfoUrl } from "./whois/discovery";
import { mergeWhoisRecords } from "./whois/merge";
import { normalizeWhois } from "./whois/normalize";
import { looksEmptyWhois } from "./whois/throttle";
import { collectWhoisReferralChain } from "./whois/referral";

function failure(
  ctx: LookupContext,
  errorCode: LookupErrorCode,
  error: string,
  where?: { phase?: LookupAttempt["phase"]; server?: string; retryAfterMs?: number },
): LookupResult {
  return {
    ok: false,
    error,
    errorCode,
    ...(where?.phase ? { errorPhase: where.phase } : {}),
    ...(where?.server ? { errorServer: where.server } : {}),
    ...(where?.retryAfterMs !== undefined ? { retryAfterMs: where.retryAfterMs } : {}),
    attempts: ctx.attempts,
  };
}

function lastFailedAttempt(
  ctx: LookupContext,
  phases?: LookupAttempt["phase"][],
): LookupAttempt | undefined {
  return ctx.attempts.findLast((a) => !a.ok && (!phases || phases.includes(a.phase)));
}

/**
 * High-level lookup that prefers RDAP and falls back to WHOIS.
 * Ensures a standardized DomainRecord, independent of the source.
 *
 * Every result carries `attempts`, a per-operation trace; failures carry an `errorCode`.
 */
export async function lookup(domain: string, opts?: LookupOptions): Promise<LookupResult> {
  const ctx: LookupContext = { attempts: [] };

  // Optional overall deadline: one signal (linked to the caller's) that every phase observes.
  let signalOpts = opts;
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let link: ReturnType<typeof linkSignals> | undefined;
  const deadlineMs = opts?.deadlineMs;
  if (deadlineMs !== undefined && Number.isFinite(deadlineMs) && deadlineMs > 0) {
    const deadline = new AbortController();
    link = linkSignals(opts?.signal, deadline.signal);
    deadlineTimer = setTimeout(
      () =>
        deadline.abort(new RdapperError("timeout", `Lookup deadline exceeded (${deadlineMs}ms)`)),
      deadlineMs,
    );
    signalOpts = { ...opts, signal: link.signal };
  }

  try {
    return await runLookup(domain, signalOpts, ctx);
  } catch (err: unknown) {
    const { code, error, retryAfterMs } = classifyError(err);
    const source = attemptForError(err);
    return failure(ctx, code, error, {
      phase: source?.phase,
      server: source?.server,
      retryAfterMs,
    });
  } finally {
    if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
    link?.dispose();
  }
}

async function runLookup(
  domain: string,
  opts: LookupOptions | undefined,
  ctx: LookupContext,
): Promise<LookupResult> {
  if (!isLikelyDomain(domain)) {
    return failure(ctx, "invalid_input", "Input does not look like a domain");
  }

  const { publicSuffix: tld } = getDomainParts(domain);
  if (!tld) {
    return failure(ctx, "invalid_tld", "Invalid TLD");
  }

  // If WHOIS-only, skip RDAP path
  if (!opts?.whoisOnly) {
    // Some ccTLD registries publish RDAP only at the registry TLD (e.g., br) while the public
    // suffix can be multi-label (e.g., com.br); this falls back to the last label.
    const bases = await getRdapBaseUrlsForPublicSuffix(tld, opts, ctx);
    const tried: string[] = [];
    for (const base of bases) {
      throwIfAborted(opts?.signal);
      tried.push(base);
      try {
        const { json, notFound } = await fetchRdapDomain(domain, base, opts, ctx);

        // HTTP 404 = domain not registered
        if (notFound) {
          const record: DomainRecord = {
            domain,
            tld,
            isRegistered: false,
            rdapServers: tried,
            source: "rdap",
          };
          return { ok: true, record, attempts: ctx.attempts };
        }

        const rdapEnriched = await fetchAndMergeRdapRelated(domain, json, opts, ctx);
        const record: DomainRecord = normalizeRdap(
          domain,
          tld,
          rdapEnriched.merged,
          [...tried, ...rdapEnriched.serversTried],
          !!opts?.includeRaw,
        );
        return { ok: true, record, attempts: ctx.attempts };
      } catch {
        // Caller abort / deadline must stop the lookup, not fall through to the next phase
        throwIfAborted(opts?.signal);
        // otherwise try next base (the failure is recorded in ctx.attempts)
      }
    }
    // Some TLDs are not in bootstrap yet; continue to WHOIS fallback unless rdapOnly
    if (opts?.rdapOnly) {
      const last = lastFailedAttempt(ctx, ["rdap", "rdap_bootstrap"]);
      const detail = last
        ? ` (${last.phase} ${last.server}: ${last.error})`
        : " (no RDAP server listed in the IANA bootstrap)";
      return failure(
        ctx,
        "rdap_unavailable",
        `RDAP not available or failed for TLD '${tld}'${detail}. Many TLDs do not publish RDAP; try WHOIS fallback (omit rdapOnly).`,
        { phase: last?.phase, server: last?.server, retryAfterMs: last?.retryAfterMs },
      );
    }
  }

  // WHOIS fallback path
  const discovery = await discoverWhoisServer(tld, opts, ctx);
  const whoisServer = discovery.server;
  if (!whoisServer) {
    if (discovery.ianaFailure) {
      // IANA never answered (timeout, connection error): don't claim the registry has no WHOIS
      const { code, error } = discovery.ianaFailure;
      return failure(ctx, code, `WHOIS server discovery via IANA failed for '.${tld}' (${error})`, {
        phase: "iana",
        server: "whois.iana.org",
      });
    }
    // Provide a clearer, actionable message
    const regUrl = discovery.ianaText
      ? parseIanaRegistrationInfoUrl(discovery.ianaText)
      : undefined;
    const hint = regUrl ? ` See registration info at ${regUrl}.` : "";
    return failure(
      ctx,
      "no_server",
      `No WHOIS server discovered for TLD '${tld}'. This registry may not publish public WHOIS over port 43.${hint}`,
    );
  }

  // Query the TLD server first; optionally follow registrar referrals (multi-hop)
  // Collect the chain and coalesce so we don't lose details when a registrar returns minimal/empty data.
  const { results: chain, warnings } = await collectWhoisReferralChain(
    whoisServer,
    domain,
    opts,
    ctx,
  );

  // Normalize all WHOIS texts in the chain and merge conservatively
  const normalizedRecords = chain.map((r) =>
    normalizeWhois(domain, tld, r.text, r.serverQueried, !!opts?.includeRaw),
  );
  const [first, ...rest] = normalizedRecords;
  if (!first) {
    return failure(ctx, "no_data", "No WHOIS data retrieved");
  }
  // A "registered" answer with no fields at all is an error page or throttle notice, not a record
  if (first.isRegistered && looksEmptyWhois(first)) {
    return failure(
      ctx,
      "unparseable",
      `WHOIS response from ${whoisServer} contained no recognizable domain data`,
      { phase: "whois", server: whoisServer },
    );
  }
  const mergedRecord = rest.length ? mergeWhoisRecords(first, rest) : first;
  if (warnings.length) {
    mergedRecord.warnings = [...(mergedRecord.warnings ?? []), ...warnings];
  }
  return { ok: true, record: mergedRecord, attempts: ctx.attempts };
}

/**
 * Determine if a domain appears available (not registered).
 * Performs a lookup and resolves to a boolean. Rejects on lookup error.
 */
export async function isAvailable(domain: string, opts?: LookupOptions): Promise<boolean> {
  const res = await lookup(domain, opts);
  if (!res.ok || !res.record) throw new Error(res.error || "Lookup failed");
  return res.record.isRegistered === false;
}

/**
 * Determine if a domain appears registered.
 * Performs a lookup and resolves to a boolean. Rejects on lookup error.
 */
export async function isRegistered(domain: string, opts?: LookupOptions): Promise<boolean> {
  const res = await lookup(domain, opts);
  if (!res.ok || !res.record) throw new Error(res.error || "Lookup failed");
  return res.record.isRegistered === true;
}

/**
 * @deprecated Use `lookup` instead.
 */
export const lookupDomain = lookup;

export { getDomainParts, getDomainTld, isLikelyDomain, toRegistrableDomain } from "./lib/domain";
export { finalizeContact, isPrivacyContact } from "./lib/contacts";
export { resolveCountry } from "./lib/countries";
export { isPlaceholderValue, isPrivacyName } from "./lib/privacy";
export type * from "./types";
