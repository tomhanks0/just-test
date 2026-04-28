export const config = {
  runtime: "edge",
};

const HOP_BY_HOP_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

const BASE_URL = (process.env.MY_D || "").replace(/\/$/, "");

export default async function handler(request) {
  if (!BASE_URL) {
    return new Response("Misconfigured: MY_D is not set", { status: 500 });
  }

  try {
    const incomingUrl = new URL(request.url);
    const destination = `${BASE_URL}${incomingUrl.pathname}${incomingUrl.search}`;

    const outgoingHeaders = new Headers();
    let ip = null;

    for (const [header, value] of request.headers.entries()) {
      const name = header.toLowerCase();

      if (HOP_BY_HOP_HEADERS.has(name)) continue;
      if (name.startsWith("x-vercel-")) continue;

      if (name === "x-real-ip") {
        ip = value;
        continue;
      }

      if (name === "x-forwarded-for" && !ip) {
        ip = value;
        continue;
      }

      outgoingHeaders.set(name, value);
    }

    if (ip) {
      outgoingHeaders.set("x-forwarded-for", ip);
    }

    const method = request.method;
    const options = {
      method,
      headers: outgoingHeaders,
      redirect: "manual",
    };

    if (!["GET", "HEAD"].includes(method)) {
      options.body = request.body;
      options.duplex = "half";
    }

    const response = await fetch(destination, options);

    const cleanHeaders = new Headers();
    for (const [key, value] of response.headers.entries()) {
      if (key.toLowerCase() === "transfer-encoding") continue;
      cleanHeaders.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      headers: cleanHeaders,
    });
  } catch (e) {
    return new Response("Bad Gateway: Tunnel Failed", { status: 502 });
  }
}
