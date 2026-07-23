// Phase 2 groundwork — the LinkedIn API publishing flow, typed out and inert.
//
// Status: INACTIVE. Nothing in the console calls this yet, and every function
// throws until the env flag and credentials exist. It documents the exact flow
// so wiring it up later is a UI task, not a research task. Even once active,
// the house rule holds: a founder taps Approve, then a founder taps Publish.
// Nothing ever auto-posts.
//
// The flow, end to end:
//   1. One-time app setup on developer.linkedin.com: create an app, request
//      the "Share on LinkedIn" product (scope w_member_social; the company
//      page needs w_organization_social via Community Management API).
//   2. Three-legged OAuth per founder: browser visit to authorizationUrl(),
//      LinkedIn redirects back with ?code=..., exchangeCode() swaps it for an
//      access token (~60-day expiry; refresh needs the token-refresh product).
//   3. Publishing an image post is three calls:
//      a. POST /rest/images?action=initializeUpload -> uploadUrl + image URN.
//      b. PUT the PNG bytes to uploadUrl.
//      c. POST /rest/posts with the commentary and the image URN.
//      A carousel PDF is the same shape via /rest/documents.
//
// Env (.env.local), all required before anything activates:
//   STRIDE_LINKEDIN=on
//   LINKEDIN_CLIENT_ID=...
//   LINKEDIN_CLIENT_SECRET=...
//   LINKEDIN_REDIRECT_URI=http://localhost:3000/api/linkedin/callback

const OAUTH_BASE = "https://www.linkedin.com/oauth/v2";
const API_BASE = "https://api.linkedin.com/rest";
/** Pinned REST version (LinkedIn-Version header), YYYYMM. Bump deliberately. */
const LINKEDIN_VERSION = "202506";
const SCOPES = ["w_member_social"];

export interface LinkedInTokens {
  accessToken: string;
  /** Seconds until expiry, from the token response. */
  expiresIn: number;
  scope: string;
}

export interface RegisteredUpload {
  /** PUT the image bytes here. Valid for a short window. */
  uploadUrl: string;
  /** urn:li:image:... — goes into the post's content.media.id. */
  imageUrn: string;
}

export interface CreatePostInput {
  /** urn:li:person:... for a founder, urn:li:organization:... for the page. */
  authorUrn: string;
  /** The post text, exactly as approved in the console. */
  commentary: string;
  /** From registerImageUpload(); omit for a text-only post. */
  imageUrn?: string;
}

export function linkedinEnabled(): boolean {
  return (
    process.env.STRIDE_LINKEDIN === "on" &&
    Boolean(process.env.LINKEDIN_CLIENT_ID) &&
    Boolean(process.env.LINKEDIN_CLIENT_SECRET) &&
    Boolean(process.env.LINKEDIN_REDIRECT_URI)
  );
}

function assertEnabled(): void {
  if (!linkedinEnabled()) {
    throw new Error(
      "LinkedIn publishing is off. Set STRIDE_LINKEDIN=on plus the LINKEDIN_* credentials in .env.local. Until then, publish with the copy-open flow.",
    );
  }
}

/** Step 2a — send the founder's browser here to authorize the app. */
export function authorizationUrl(state: string): string {
  assertEnabled();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.LINKEDIN_CLIENT_ID as string,
    redirect_uri: process.env.LINKEDIN_REDIRECT_URI as string,
    state,
    scope: SCOPES.join(" "),
  });
  return `${OAUTH_BASE}/authorization?${params}`;
}

/** Step 2b — swap the ?code=... from the redirect for an access token. */
export async function exchangeCode(code: string): Promise<LinkedInTokens> {
  assertEnabled();
  const res = await fetch(`${OAUTH_BASE}/accessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: process.env.LINKEDIN_CLIENT_ID as string,
      client_secret: process.env.LINKEDIN_CLIENT_SECRET as string,
      redirect_uri: process.env.LINKEDIN_REDIRECT_URI as string,
    }),
  });
  if (!res.ok) throw new Error(`LinkedIn token exchange failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

function restHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "LinkedIn-Version": LINKEDIN_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

/** Step 3a — register an image upload; returns the PUT target and the URN. */
export async function registerImageUpload(
  accessToken: string,
  ownerUrn: string,
): Promise<RegisteredUpload> {
  assertEnabled();
  const res = await fetch(`${API_BASE}/images?action=initializeUpload`, {
    method: "POST",
    headers: restHeaders(accessToken),
    body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
  });
  if (!res.ok) throw new Error(`LinkedIn upload registration failed: HTTP ${res.status}`);
  const data = (await res.json()) as {
    value: { uploadUrl: string; image: string };
  };
  return { uploadUrl: data.value.uploadUrl, imageUrn: data.value.image };
}

/** Step 3b — PUT the rendered PNG to the registered upload URL. */
export async function uploadImage(
  uploadUrl: string,
  accessToken: string,
  bytes: Uint8Array<ArrayBuffer>,
): Promise<void> {
  assertEnabled();
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
    },
    body: bytes,
  });
  if (!res.ok) throw new Error(`LinkedIn image upload failed: HTTP ${res.status}`);
}

/** Step 3c — create the post. Returns the post URN from the x-restli-id header. */
export async function createPost(
  accessToken: string,
  input: CreatePostInput,
): Promise<string> {
  assertEnabled();
  const body: Record<string, unknown> = {
    author: input.authorUrn,
    commentary: input.commentary,
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  if (input.imageUrn) {
    body.content = { media: { id: input.imageUrn } };
  }
  const res = await fetch(`${API_BASE}/posts`, {
    method: "POST",
    headers: restHeaders(accessToken),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LinkedIn post creation failed: HTTP ${res.status}`);
  return res.headers.get("x-restli-id") ?? "";
}
