import { linkSignals, throwIfAborted } from "./lib/async";
import { getDomainParts, isLikelyDomain, toAsciiDomain } from "./lib/domain";
import { classifyError, RdapperError } from "./lib/errors";
import { getSubRegistrySuffix } from "./lib/subregistries";
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
import { normalizeWhois, whoisReplyDomain } from "./whois/normalize";
import { looksEmptyWhois } from "./whois/throttle";
import { collectWhoisReferralChain } from "./whois/referral";

/**
 * The registrable name a domain belongs to ("example.com" for www.example.com), undefined for a
 * public suffix itself. Sub-registry names (google.uk.com) are registrable; under a TLD missing
 * from the Public Suffix List the input is taken as is.
 */
function registrableNameOf(domain: string): string | undefined {
  const sub = getSubRegistrySuffix(domain);
  if (sub)
    return domain
      .split(".")
      .slice(-(sub.split(".").length + 1))
      .join(".");
  const parts = getDomainParts(domain);
  return parts.isIcann ? (parts.domain ?? undefined) : domain;
}

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
  input: string,
  opts: LookupOptions | undefined,
  ctx: LookupContext,
): Promise<LookupResult> {
  if (opts?.rdapOnly && opts?.whoisOnly) {
    return failure(ctx, "invalid_input", "rdapOnly and whoisOnly can't both be set");
  }
  // Query the ASCII form: "  München.DE." becomes "xn--mnchen-3ya.de"
  const domain = toAsciiDomain(input);
  if (!domain || !isLikelyDomain(domain)) {
    return failure(ctx, "invalid_input", "Input does not look like a domain");
  }

  // Only a registrable name has a registration: the registry would answer "not registered" for
  // www.example.com, which reads as available. Say which name to look up instead.
  const registrable = registrableNameOf(domain);
  if (registrable !== domain) {
    return failure(
      ctx,
      "invalid_input",
      registrable
        ? `"${domain}" is not a registrable domain; look up "${registrable}"`
        : `"${domain}" is a public suffix, not a registrable domain`,
    );
  }

  // Names under a sub-registry (e.g. google.uk.com) are routed by that suffix, not the ICANN one
  const tld = getSubRegistrySuffix(domain) ?? getDomainParts(domain).publicSuffix;
  if (!tld) {
    return failure(ctx, "invalid_tld", "Invalid TLD");
  }

  // If WHOIS-only, skip RDAP path
  if (!opts?.whoisOnly) {
    // Some ccTLD registries publish RDAP only at the registry TLD (e.g., br) while the public
    // suffix can be multi-label (e.g., com.br); this falls back to the last label.
    const bases = await getRdapBaseUrlsForPublicSuffix(tld, opts, ctx);
    const tried: string[] = [];
    let readError: string | undefined;
    for (const base of bases) {
      throwIfAborted(opts?.signal);
      tried.push(base);
      const attemptsBefore = ctx.attempts.length;
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
      } catch (err) {
        // Caller abort / deadline must stop the lookup, not fall through to the next phase
        throwIfAborted(opts?.signal);
        // otherwise try next base. A failed fetch is recorded in ctx.attempts; a response that
        // arrived but couldn't be read is not, so keep its error for the message below.
        if (ctx.attempts.slice(attemptsBefore).every((a) => a.ok)) {
          readError = err instanceof Error ? err.message : String(err);
        }
      }
    }
    // Some TLDs are not in bootstrap yet; continue to WHOIS fallback unless rdapOnly
    if (opts?.rdapOnly) {
      // Report why RDAP failed (rate_limited, timeout, ...) so callers can tell a transient
      // failure from a TLD without RDAP
      const last = lastFailedAttempt(ctx, ["rdap", "rdap_bootstrap"]);
      if (last) {
        return failure(
          ctx,
          last.errorCode ?? "unknown",
          `RDAP lookup failed for TLD '${tld}' (${last.phase} ${last.server}: ${last.error})`,
          { phase: last.phase, server: last.server, retryAfterMs: last.retryAfterMs },
        );
      }
      if (readError) {
        return failure(
          ctx,
          "unparseable",
          `RDAP response for TLD '${tld}' could not be read (${readError})`,
          { phase: "rdap", server: tried.at(-1) },
        );
      }
      return failure(
        ctx,
        "rdap_unavailable",
        `RDAP not available for TLD '${tld}' (no RDAP server listed in the IANA bootstrap). Many TLDs do not publish RDAP; try WHOIS fallback (omit rdapOnly).`,
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
  // A registry that doesn't hold the name may answer with the delegation it sits under (Nominet
  // gave ac.uk's record for ox.ac.uk), which would pass for the name's own record
  const replyDomain = chain[0] && whoisReplyDomain(chain[0].text);
  if (replyDomain && domain.endsWith(`.${replyDomain}`)) {
    return failure(
      ctx,
      "unparseable",
      `WHOIS response from ${whoisServer} describes ${replyDomain}, not ${domain}`,
      { phase: "whois", server: whoisServer },
    );
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

/** A failed lookup as an error, keeping its code (and the name "AbortError" for aborts). */
function lookupError(res: LookupResult): RdapperError {
  return new RdapperError(res.errorCode ?? "unknown", res.error || "Lookup failed", {
    phase: res.errorPhase,
    server: res.errorServer,
    retryAfterMs: res.retryAfterMs,
  });
}

/**
 * Determine if a domain appears available (not registered).
 * Performs a lookup and resolves to a boolean. Rejects on lookup error with an RdapperError
 * carrying the result's errorCode (as `code`), errorPhase, errorServer, and retryAfterMs.
 */
export async function isAvailable(domain: string, opts?: LookupOptions): Promise<boolean> {
  const res = await lookup(domain, opts);
  if (!res.ok || !res.record) throw lookupError(res);
  return res.record.isRegistered === false;
}

/**
 * Determine if a domain appears registered.
 * Performs a lookup and resolves to a boolean. Rejects on lookup error with an RdapperError
 * carrying the result's errorCode (as `code`), errorPhase, errorServer, and retryAfterMs.
 */
export async function isRegistered(domain: string, opts?: LookupOptions): Promise<boolean> {
  const res = await lookup(domain, opts);
  if (!res.ok || !res.record) throw lookupError(res);
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
export { normalizeEppStatus } from "./lib/status";
export { RdapperError } from "./lib/errors";
export type * from "./types";
