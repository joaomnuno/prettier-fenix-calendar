import assert from "node:assert/strict";
import test from "node:test";

// The Node build exports the App Router entry as a plain handler function
// (request) => Response. `vinext/server/prod-server` calls it exactly this way,
// so exercising that shape is what the container actually runs.
test("the Node server entry renders the app shell", async () => {
  const entryUrl = new URL("../dist/server/index.js", import.meta.url);
  entryUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: handler } = await import(entryUrl.href);
  assert.equal(typeof handler, "function");

  const response = await handler(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html[^>]*\blang="pt-PT"/i);
  assert.match(html, /Horário/);
});
